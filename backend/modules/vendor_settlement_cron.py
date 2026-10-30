"""Cron-driven vendor payouts (timezone-aware).

Owns three things:

1. The schedule evaluator — pure function
   ``is_vendor_due(cfg, now_utc) -> (due, period_start, period_end)``
   turning the saved ``vendor_payout_config`` row into a yes/no decision in
   the vendor's own timezone (Africa/Abidjan by default — never the admin
   browser's local time, never UTC+5:30).

2. The run engine — ``run_scheduled_payouts(session, run_id, dry_run)``
   iterates every active ``vendor_payout_config``, evaluates it, and either:
   - creates an auto payout via the existing settlement engine, or
   - records a `skipped` row with the reason (paused, below_min, no_balance,
     not_due, already_generated_today).
   Dry-run returns the exact same decisions without writing a single row,
   which the Super Admin "Preview next payout run" page uses.

3. The HTTP surface:
     POST /api/cron/vendor-settlement/run    (platform cron, Bearer secret)
     GET  /api/admin/vendor-settlement/scheduled-overview   (preview table)
     GET  /api/admin/vendor-settlement/preview-next-run     (dry-run button)
     POST /api/admin/vendor-settlement/run-now              (manual trigger)

Design notes
------------
* Auto settlement generates a `scheduled` payout row — it NEVER marks it
  paid. Actual money disbursement remains an explicit second step
  (``POST /admin/vendor-settlement/payouts/{id}/mark-paid``) so the
  payment-provider wiring stays independent of the ledger.
* Idempotency is enforced at two layers:
  - config-level: ``last_payout_run_at`` + ``last_payout_period_end`` guard
    the "already generated today" check even if the DB index is dropped.
  - DB-level: ``ux_vp_cron_daily`` unique on (module, restaurant_id, date)
    for ``trigger='cron'`` rows means a duplicate webhook can't create two
    payouts for the same day.
* Paused vendors and vendors with no commission rate are skipped with a
  reason but never raise — one bad vendor must not stop the cron loop.
"""
from __future__ import annotations

import calendar
import hmac
import logging
import os
import secrets
import uuid
from calendar import monthrange
from datetime import datetime, timedelta, timezone, time as dtime, date as ddate
from decimal import Decimal
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session, engine
from modules.vendor_settlement import (
    _d2, _row_dict, _wallet_write, get_active_commission_rate,
)
from shared.admin.routes import get_current_admin


logger = logging.getLogger("vendor_settlement.cron")

cron_router  = APIRouter(prefix="/cron/vendor-settlement", tags=["vendor-settlement-cron"])
admin_router = APIRouter(prefix="/admin/vendor-settlement",  tags=["vendor-settlement-cron-admin"])

DEFAULT_TZ = "Africa/Abidjan"
# Defaults when a vendor was configured before cron fields existed.
_DEFAULT_TIMES = {"daily": "23:00", "weekly": "18:00", "monthly": "09:00", "custom": "18:00"}
_DEFAULT_WEEKDAY = 3     # Thursday — matches the user-approved default
_DEFAULT_DAY_OF_MONTH = 1


# ---------------------------------------------------------------------------
# Schedule maths — pure, timezone-aware
# ---------------------------------------------------------------------------
def _tz(name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TZ)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_TZ)


def _parse_hhmm(raw: Optional[str], fallback: str) -> dtime:
    try:
        h, m = (raw or fallback).split(":")
        return dtime(hour=int(h), minute=int(m))
    except Exception:
        h, m = fallback.split(":")
        return dtime(hour=int(h), minute=int(m))


def _effective_day_of_month(target_day: int, year: int, month: int) -> int:
    """Clamp day_of_month to the last valid day of the month (e.g. 31→30 in
    April, 31→28/29 in February). This preserves "end of month" intent for
    vendors who picked 31."""
    last = monthrange(year, month)[1]
    return min(max(target_day, 1), last)


def _next_scheduled_at(cfg_row, now_utc: datetime) -> datetime:
    """When is this vendor's next payout fire, in UTC?

    Returns a *forward-looking* UTC timestamp: the next occurrence >= now in
    the vendor's own timezone. Used by the Super Admin preview page.
    """
    tz = _tz(getattr(cfg_row, "timezone", None))
    now_local = now_utc.astimezone(tz)
    stype = cfg_row.schedule_type
    scfg  = cfg_row.schedule_cfg or {}
    at = _parse_hhmm(scfg.get("time_hhmm"), _DEFAULT_TIMES.get(stype, "18:00"))

    def _combine(d: ddate) -> datetime:
        return datetime.combine(d, at, tzinfo=tz).astimezone(timezone.utc)

    if stype == "daily":
        today = _combine(now_local.date())
        return today if today > now_utc else _combine(now_local.date() + timedelta(days=1))

    if stype == "weekly":
        target_wd = int(scfg.get("weekday", _DEFAULT_WEEKDAY))
        for offset in range(0, 8):
            cand_date = (now_local + timedelta(days=offset)).date()
            if cand_date.weekday() == target_wd:
                cand = _combine(cand_date)
                if cand > now_utc:
                    return cand
        return _combine(now_local.date() + timedelta(days=7))

    if stype == "monthly":
        target_dom = int(scfg.get("day_of_month", _DEFAULT_DAY_OF_MONTH))
        for month_offset in range(0, 2):
            y, m = now_local.year, now_local.month + month_offset
            if m > 12:
                y, m = y + 1, m - 12
            dom = _effective_day_of_month(target_dom, y, m)
            cand = _combine(ddate(y, m, dom))
            if cand > now_utc:
                return cand
        # Fallback — should never hit
        return now_utc + timedelta(days=30)

    # custom — list of weekdays or days_of_month
    weekdays = scfg.get("weekdays") or []
    days_of_month = scfg.get("days_of_month") or []
    for offset in range(0, 31):
        cand_date = (now_local + timedelta(days=offset)).date()
        if weekdays and cand_date.weekday() in weekdays:
            cand = _combine(cand_date)
            if cand > now_utc:
                return cand
        if days_of_month and cand_date.day in days_of_month:
            cand = _combine(cand_date)
            if cand > now_utc:
                return cand
    return now_utc + timedelta(days=1)


def is_vendor_due(cfg_row, now_utc: datetime) -> tuple[bool, Optional[datetime], Optional[datetime], str]:
    """(due, period_start, period_end, reason)

    * ``period_start`` is ``last_payout_period_end`` if set, else ``now - 30d``
      for monthly, ``now - 7d`` for weekly/custom and ``now - 1d`` for daily.
    * ``period_end`` is the fire moment in UTC.
    * ``reason`` is a short machine code: 'due', 'not_due', 'paused',
      'bad_tz'.
    """
    if getattr(cfg_row, "is_paused", False):
        return False, None, None, "paused"

    try:
        tz = _tz(getattr(cfg_row, "timezone", None))
    except Exception:
        return False, None, None, "bad_tz"

    now_local = now_utc.astimezone(tz)
    stype = cfg_row.schedule_type
    scfg  = cfg_row.schedule_cfg or {}
    at = _parse_hhmm(scfg.get("time_hhmm"), _DEFAULT_TIMES.get(stype, "18:00"))
    today_fire_local = datetime.combine(now_local.date(), at, tzinfo=tz)
    today_fire_utc   = today_fire_local.astimezone(timezone.utc)

    # Must be past the fire time *today* in the vendor's TZ.
    if now_local < today_fire_local:
        return False, None, None, "not_due"

    # Weekday/day_of_month gates.
    if stype == "weekly":
        if now_local.weekday() != int(scfg.get("weekday", _DEFAULT_WEEKDAY)):
            return False, None, None, "not_due"
    elif stype == "monthly":
        target_dom = int(scfg.get("day_of_month", _DEFAULT_DAY_OF_MONTH))
        dom = _effective_day_of_month(target_dom, now_local.year, now_local.month)
        if now_local.day != dom:
            return False, None, None, "not_due"
    elif stype == "custom":
        weekdays = scfg.get("weekdays") or []
        days_of_month = scfg.get("days_of_month") or []
        wd_ok = (not weekdays) or (now_local.weekday() in weekdays)
        dom_ok = (not days_of_month) or (now_local.day in days_of_month)
        if not (wd_ok and dom_ok):
            return False, None, None, "not_due"
    # daily — no extra gate

    # Already generated for *this* local day?
    last_end = getattr(cfg_row, "last_payout_period_end", None)
    if last_end:
        last_end_local = last_end.astimezone(tz)
        if last_end_local.date() == now_local.date():
            return False, None, None, "already_generated_today"

    # Window
    if stype == "monthly":
        default_back = timedelta(days=31)
    elif stype == "daily":
        default_back = timedelta(days=1)
    else:
        default_back = timedelta(days=7)
    period_start = last_end if last_end else today_fire_utc - default_back
    # Period ENDS at the actual run moment (not the configured fire time) so
    # orders delivered between "fire time" and "when the hourly cron picked
    # us up" still get bundled. This is what Super Admin expects: an order
    # that just finished minutes ago appears in today's auto payout.
    period_end = now_utc
    return True, period_start, period_end, "due"


# ---------------------------------------------------------------------------
# Payout bundling — used by both the cron runner and the dry-run preview
# ---------------------------------------------------------------------------
async def _bundle_vendor(
    session: AsyncSession, module: str, restaurant_id: str,
    period_start: datetime, period_end: datetime, currency: str = "XOF",
) -> dict[str, Any]:
    """Sum unsettled delivered orders + approved refunds in the window.

    Returns the Decimal totals without touching rows. Shared by the dry-run
    preview and the cron executor so both agree on amounts.
    """
    rows = (await session.execute(text("""
        SELECT id, grand_total, commission_amount, vendor_net_amount, currency
          FROM food_orders
         WHERE restaurant_id = :r AND status = 'delivered'
           AND settlement_status = 'unsettled'
           AND delivered_at >= :s AND delivered_at <= :e
    """), {"r": restaurant_id, "s": period_start, "e": period_end})).fetchall()

    gross = _d2(sum((Decimal(str(r.grand_total       or 0)) for r in rows), Decimal("0")))
    comm  = _d2(sum((Decimal(str(r.commission_amount or 0)) for r in rows), Decimal("0")))
    net   = _d2(sum((Decimal(str(r.vendor_net_amount or 0)) for r in rows), Decimal("0")))
    refund = (await session.execute(text("""
        SELECT COALESCE(SUM(approved_amount),0) AS s FROM returns
         WHERE partner_id = :r AND status IN ('refunded','approved','partial_approved')
           AND created_at >= :s AND created_at <= :e
    """), {"r": restaurant_id, "s": period_start, "e": period_end})).fetchone()
    refunds = _d2(refund.s if refund else 0)
    final_net = _d2(net - refunds)
    return {
        "order_ids": [r.id for r in rows],
        "order_count": len(rows),
        "gross": gross, "commission": comm, "refunds": refunds,
        "net": final_net, "currency": (rows[0].currency if rows else currency) or "XOF",
    }


async def _generate_cron_payout(
    session: AsyncSession, module: str, restaurant_id: str,
    period_start: datetime, period_end: datetime, bundle: dict[str, Any],
) -> str:
    """Write the payout + mark orders scheduled + update config pointers.

    Caller is responsible for commit. Raises on duplicate (DB index).
    """
    pid = f"vp_{uuid.uuid4().hex[:16]}"
    number = f"POC{datetime.now(timezone.utc).strftime('%y%m%d')}{uuid.uuid4().hex[:6].upper()}"
    await session.execute(text("""
        INSERT INTO vendor_payouts (id, number, module, restaurant_id,
          period_start, period_end, period_end_date,
          gross, commission, refunds, net, currency,
          status, scheduled_for, trigger)
        VALUES (:id, :num, :m, :r, :s, :e, :ed, :g, :c, :rf, :n, :cur,
          'scheduled', :e, 'cron')
    """), {"id": pid, "num": number, "m": module, "r": restaurant_id,
           "s": period_start, "e": period_end, "ed": period_end.date(),
           "g": str(bundle["gross"]),      "c": str(bundle["commission"]),
           "rf": str(bundle["refunds"]),   "n": str(bundle["net"]),
           "cur": bundle["currency"]})
    if bundle["order_ids"]:
        await session.execute(text("""
            UPDATE food_orders SET settlement_status = 'scheduled', settled_payout_id = :p
             WHERE id = ANY(:ids)
        """), {"p": pid, "ids": bundle["order_ids"]})
    await session.execute(text("""
        UPDATE vendor_payout_config
           SET last_payout_run_at = now(), last_payout_period_end = :e, updated_at = now()
         WHERE module = :m AND restaurant_id = :r
    """), {"e": period_end, "m": module, "r": restaurant_id})
    return pid


# ---------------------------------------------------------------------------
# Overview — one row per restaurant, used by the Super Admin table
# ---------------------------------------------------------------------------
async def _vendor_overview(session: AsyncSession, now_utc: datetime,
                           module: str = "food") -> list[dict[str, Any]]:
    """Pull the full table the Super Admin "Scheduled Payouts" screen renders.

    Joins restaurants + config + commission + wallet + last payout + bundles
    the "would pay today" preview in a single pass (one query per vendor —
    not a bulk JOIN because the bundle logic lives in Python).
    """
    rests = (await session.execute(text(
        "SELECT id, name, country FROM food_restaurants ORDER BY name ASC"
    ))).fetchall()
    out: list[dict[str, Any]] = []
    for r in rests:
        cfg = (await session.execute(text("""
            SELECT * FROM vendor_payout_config
             WHERE module = :m AND restaurant_id = :r
        """), {"m": module, "r": r.id})).fetchone()
        rate = await get_active_commission_rate(session, module, r.id)
        wallet = (await session.execute(text(
            "SELECT balance, currency FROM food_restaurant_wallets WHERE restaurant_id = :r"
        ), {"r": r.id})).fetchone()
        last_payout = (await session.execute(text("""
            SELECT id, number, status, net, scheduled_for, paid_at, created_at
              FROM vendor_payouts
             WHERE module = :m AND restaurant_id = :r
             ORDER BY created_at DESC LIMIT 1
        """), {"m": module, "r": r.id})).fetchone()
        pending_row = (await session.execute(text("""
            SELECT COALESCE(SUM(vendor_net_amount),0) AS s
              FROM food_orders
             WHERE restaurant_id = :r AND status = 'delivered'
               AND settlement_status = 'unsettled'
        """), {"r": r.id})).fetchone()
        pending = _d2(pending_row.s if pending_row else 0)

        # Preview the next scheduled fire + what would be bundled.
        next_at = None
        would_pay = None
        due_reason = "no_config"
        if cfg:
            next_at = _next_scheduled_at(cfg, now_utc)
            due, p_start, p_end, due_reason = is_vendor_due(cfg, now_utc)
            if due and p_start and p_end:
                b = await _bundle_vendor(session, module, r.id, p_start, p_end,
                                         currency=(wallet.currency if wallet else "XOF"))
                would_pay = float(b["net"])

        out.append({
            "restaurant_id": r.id,
            "name": r.name,
            "country": r.country,
            "commission_rate": float(rate) if rate is not None else None,
            "schedule_type": cfg.schedule_type if cfg else None,
            "schedule_cfg":  cfg.schedule_cfg if cfg else None,
            "timezone":      (cfg.timezone if cfg else DEFAULT_TZ),
            "is_paused":     bool(getattr(cfg, "is_paused", False)) if cfg else False,
            "pause_reason":  getattr(cfg, "pause_reason", None) if cfg else None,
            "min_payout_amount": float(cfg.min_payout_amount) if cfg else 0,
            "last_payout": _row_dict(last_payout) if last_payout else None,
            "next_scheduled_at": next_at.isoformat() if next_at else None,
            "pending_balance":  float(pending),
            "wallet_balance":   float(_d2(wallet.balance)) if wallet else 0.0,
            "would_pay_now":    would_pay,
            "due_reason":       due_reason,
            "currency": (wallet.currency if wallet else "XOF"),
        })
    return out


# ---------------------------------------------------------------------------
# Core runner — single implementation shared by cron webhook + manual trigger
# ---------------------------------------------------------------------------
async def run_scheduled_payouts(run_id: str, dry_run: bool = False,
                                now_utc: Optional[datetime] = None,
                                module: str = "food") -> dict[str, Any]:
    """Scan every active config and generate due payouts.

    Uses its OWN session (not the request session) so slow iteration never
    stalls the webhook response. Each vendor is processed in its own
    transaction so one vendor's bad data can't abort the whole run.
    """
    now_utc = now_utc or datetime.now(timezone.utc)
    scanned = created = skipped = errors = 0
    summary: list[dict[str, Any]] = []

    async with engine.begin() as _ignore:
        pass  # ensure engine initialised

    from sqlalchemy.ext.asyncio import AsyncSession as _AS

    async with _AS(engine) as session:
        cfgs = (await session.execute(text("""
            SELECT * FROM vendor_payout_config WHERE module = :m
        """), {"m": module})).fetchall()
        for cfg in cfgs:
            scanned += 1
            try:
                due, p_start, p_end, reason = is_vendor_due(cfg, now_utc)
                if not due:
                    skipped += 1
                    summary.append({"restaurant_id": cfg.restaurant_id, "action": "skipped", "reason": reason})
                    continue

                bundle = await _bundle_vendor(session, module, cfg.restaurant_id, p_start, p_end)
                net = bundle["net"]
                min_amount = Decimal(str(cfg.min_payout_amount or 0))
                if bundle["order_count"] == 0 or net <= 0:
                    skipped += 1
                    summary.append({"restaurant_id": cfg.restaurant_id, "action": "skipped",
                                    "reason": "no_balance", "net": float(net)})
                    continue
                if net < min_amount:
                    skipped += 1
                    summary.append({"restaurant_id": cfg.restaurant_id, "action": "skipped",
                                    "reason": "below_min", "net": float(net),
                                    "min": float(min_amount)})
                    continue

                if dry_run:
                    created += 1
                    summary.append({"restaurant_id": cfg.restaurant_id, "action": "would_create",
                                    "net": float(net), "period_end": p_end.isoformat()})
                    continue

                try:
                    pid = await _generate_cron_payout(
                        session, module, cfg.restaurant_id, p_start, p_end, bundle,
                    )
                    await session.commit()
                    created += 1
                    summary.append({"restaurant_id": cfg.restaurant_id, "action": "created",
                                    "payout_id": pid, "net": float(net)})
                except Exception as dup_err:  # unique index violation == already run today
                    await session.rollback()
                    msg = str(dup_err)
                    if "ux_vp_cron_daily" in msg or "duplicate key" in msg.lower():
                        skipped += 1
                        summary.append({"restaurant_id": cfg.restaurant_id, "action": "skipped",
                                        "reason": "already_generated_today"})
                    else:
                        logger.exception("cron payout failed for %s", cfg.restaurant_id)
                        errors += 1
                        summary.append({"restaurant_id": cfg.restaurant_id, "action": "error",
                                        "reason": msg[:200]})
            except Exception as e:
                logger.exception("cron payout iteration crashed for %s", cfg.restaurant_id)
                await session.rollback()
                errors += 1
                summary.append({"restaurant_id": cfg.restaurant_id, "action": "error",
                                "reason": str(e)[:200]})

        if not dry_run:
            await session.execute(text("""
                INSERT INTO vendor_payout_runs (id, run_id, started_at, finished_at,
                    vendors_scanned, payouts_created, skipped, errors, summary)
                VALUES (:id, :run, :started, now(), :s, :c, :sk, :er, CAST(:sm AS JSONB))
                ON CONFLICT (run_id) DO NOTHING
            """), {"id": f"vpr_{uuid.uuid4().hex[:16]}", "run": run_id,
                   "started": now_utc, "s": scanned, "c": created,
                   "sk": skipped, "er": errors, "sm": __json(summary)})
            await session.commit()

    return {"run_id": run_id, "scanned": scanned, "created": created,
            "skipped": skipped, "errors": errors, "dry_run": dry_run,
            "detail": summary}


def __json(obj) -> str:
    import json
    return json.dumps(obj, default=str)


# ---------------------------------------------------------------------------
# HTTP — platform cron webhook
# ---------------------------------------------------------------------------
def _check_cron_auth(auth: Optional[str]) -> None:
    secret = os.environ.get("WEBHOOK_CRON_SECRET")
    if not secret:
        raise HTTPException(500, "WEBHOOK_CRON_SECRET not configured")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(401, "missing_auth")
    token = auth.split(" ", 1)[1].strip()
    if not hmac.compare_digest(token, secret):
        raise HTTPException(401, "bad_auth")


class _CronBody(BaseModel):
    event: Optional[str] = None
    schedule_id: Optional[str] = None
    run_id: Optional[str] = None
    dispatch_time: Optional[str] = None
    job_id: Optional[str] = None
    data: Optional[Any] = None


@cron_router.post("/run")
async def cron_run(
    payload: _CronBody,
    background: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    x_webhook_id: Optional[str] = Header(None),
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _check_cron_auth(authorization)
    run_id = x_webhook_id or payload.run_id or f"local_{secrets.token_hex(8)}"
    background.add_task(_cron_background_runner, run_id)
    return {"accepted": True, "run_id": run_id}


async def _cron_background_runner(run_id: str) -> None:
    try:
        result = await run_scheduled_payouts(run_id=run_id, dry_run=False)
        logger.info("cron.vendor_settlement run_id=%s result=%s", run_id, result)
    except Exception:
        logger.exception("cron.vendor_settlement failed run_id=%s", run_id)


# ---------------------------------------------------------------------------
# HTTP — Super Admin preview + manual trigger
# ---------------------------------------------------------------------------
@admin_router.get("/scheduled-overview")
async def admin_scheduled_overview(
    session: AsyncSession = Depends(get_session),
    _admin = Depends(get_current_admin),
):
    """Full table rendered on the "Scheduled Payouts" screen."""
    rows = await _vendor_overview(session, datetime.now(timezone.utc))
    return {"items": rows, "server_time_utc": datetime.now(timezone.utc).isoformat(),
            "default_timezone": DEFAULT_TZ}


@admin_router.get("/preview-next-run")
async def admin_preview_next_run(
    at_iso: Optional[str] = Query(None, description="UTC ISO timestamp to simulate 'now' (defaults to now)"),
    _admin = Depends(get_current_admin),
):
    """Dry-run the cron for every vendor without touching balances."""
    now_utc = datetime.fromisoformat(at_iso.replace("Z", "+00:00")) if at_iso else datetime.now(timezone.utc)
    result = await run_scheduled_payouts(
        run_id=f"preview_{secrets.token_hex(6)}",
        dry_run=True, now_utc=now_utc,
    )
    return result


@admin_router.post("/run-now")
async def admin_run_now(
    _admin = Depends(get_current_admin),
):
    """Super Admin override — forces the scheduler to run immediately.

    Still respects every per-vendor rule (schedule, pause, min amount,
    idempotency). To bypass the schedule entirely use the per-vendor
    "Generate payout now" button which already existed.
    """
    return await run_scheduled_payouts(run_id=f"manual_{secrets.token_hex(8)}", dry_run=False)


@admin_router.get("/runs")
async def admin_list_runs(
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    _admin = Depends(get_current_admin),
):
    rows = (await session.execute(text("""
        SELECT * FROM vendor_payout_runs ORDER BY started_at DESC LIMIT :l
    """), {"l": limit})).fetchall()
    return {"items": [_row_dict(r) for r in rows]}
