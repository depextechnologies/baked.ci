"""Vendor-specific commission + payout settlement engine.

Business rules (user-approved)
------------------------------
* Commission rate is **negotiated per vendor** by Super Admin and stored as an
  immutable history (`vendor_commission_history`). Changes NEVER recalculate
  historical orders — each delivered order snapshots the active rate into
  `food_orders.commission_rate_snapshot`.
* Payout schedule is **per vendor** too (`vendor_payout_config`), configurable
  as daily / weekly / monthly / custom. Pause / resume is also stored here.
* When an order flips to ``delivered`` we:
    1. Resolve the active commission rate.
    2. Snapshot it on the order along with the computed amounts.
    3. Credit the partner wallet (``partner_wallet_txns``) with the vendor
       net (= grand_total - delivery_fee - commission).
* When an approved refund settles (returns.status in approved / partial_approved
  / refunded) we debit the wallet by the approved_amount — i.e. "partner pays"
  per the agreed policy.
* Payouts bundle unsettled wallet entries over the window into a
  ``vendor_payouts`` row with status ``scheduled``. When Super Admin marks a
  payout paid we debit the wallet with ``kind='payout'`` and flip the order
  rows' ``settlement_status`` to ``paid``.
* Delivery fee always goes to the platform; it's excluded from the
  commissionable base.
* Partner can view everything but can't edit commission or schedule — those
  are read-only in the partner portal; changes require contacting BAKĒD.

Module layout
-------------
    api_router = APIRouter(prefix="")
      /food/partner/wallet/*       (partner-side read endpoints)
      /admin/vendor-settlement/*   (super-admin configuration + payouts)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from modules.food.routes import get_current_food_partner
from shared.admin.routes import get_current_admin


partner_router = APIRouter(prefix="/food/partner/wallet", tags=["vendor-wallet"])
admin_router   = APIRouter(prefix="/admin/vendor-settlement", tags=["vendor-settlement-admin"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _d2(v) -> Decimal:
    """Quantize to 2 decimals, half-up."""
    return (Decimal(str(v or 0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _row_dict(r):
    try:
        return dict(r._mapping)
    except AttributeError:
        return dict(r)


async def get_active_commission_rate(session: AsyncSession, module: str, restaurant_id: str,
                                     at: Optional[datetime] = None) -> Optional[Decimal]:
    """Return the rate (%) active at ``at`` (default: now). ``None`` when the
    vendor has no commission configured yet — in that case callers should
    refuse to snapshot and leave the order unsettled."""
    at = at or datetime.now(timezone.utc)
    row = (await session.execute(text("""
        SELECT rate_percent FROM vendor_commission_history
         WHERE module = :m AND restaurant_id = :r
           AND effective_from <= :at
           AND (effective_until IS NULL OR effective_until > :at)
         ORDER BY effective_from DESC
         LIMIT 1
    """), {"m": module, "r": restaurant_id, "at": at})).fetchone()
    return Decimal(str(row.rate_percent)) if row else None


async def _ensure_wallet(session: AsyncSession, restaurant_id: str, currency: str = "XOF") -> str:
    row = (await session.execute(text(
        "SELECT id FROM food_restaurant_wallets WHERE restaurant_id = :r"
    ), {"r": restaurant_id})).fetchone()
    if row:
        return row.id
    wid = f"frwal_{restaurant_id}"
    await session.execute(text("""
        INSERT INTO food_restaurant_wallets (id, restaurant_id, balance, currency, is_active)
        VALUES (:id, :r, 0, :c, TRUE)
        ON CONFLICT (restaurant_id) DO NOTHING
    """), {"id": wid, "r": restaurant_id, "c": currency})
    return wid


async def _wallet_write(session: AsyncSession, restaurant_id: str, amount: Decimal,
                        kind: str, description: str, currency: str = "XOF",
                        order_id: Optional[str] = None, reference: Optional[str] = None):
    """Append a ledger entry on the restaurant wallet, keeping balance in sync.

    ``amount`` is signed — positive credits, negative debits.
    """
    wid = await _ensure_wallet(session, restaurant_id, currency)
    cur = (await session.execute(text(
        "SELECT balance FROM food_restaurant_wallets WHERE id = :id FOR UPDATE"
    ), {"id": wid})).fetchone()
    prev = Decimal(str(cur.balance)) if cur else Decimal("0")
    new = _d2(prev + amount)
    await session.execute(text(
        "UPDATE food_restaurant_wallets SET balance = :b, updated_at = now() WHERE id = :id"
    ), {"b": str(new), "id": wid})
    await session.execute(text("""
        INSERT INTO food_restaurant_wallet_txns (id, wallet_id, kind, amount, currency,
                                                 balance_after, description, order_id, reference)
        VALUES (:id, :w, :k, :a, :c, :ba, :d, :o, :r)
    """), {
        "id": f"frwtx_{uuid.uuid4().hex[:16]}", "w": wid, "k": kind,
        "a": str(_d2(amount)), "c": currency, "ba": str(new),
        "d": description, "o": order_id, "r": reference,
    })
    return new


# ---------------------------------------------------------------------------
# Order-delivered hook — called from the FOOD orders module (or admin side)
# ---------------------------------------------------------------------------
async def settle_order_on_delivery(session: AsyncSession, order_id: str) -> dict[str, Any]:
    """Snapshot commission + credit vendor net on the wallet. Idempotent."""
    row = (await session.execute(text("""
        SELECT id, restaurant_id, status, grand_total, delivery_fee, tax, currency,
               commission_rate_snapshot, settlement_status
          FROM food_orders WHERE id = :id
    """), {"id": order_id})).fetchone()
    if not row:
        return {"ok": False, "reason": "order_not_found"}
    if row.status != "delivered":
        return {"ok": False, "reason": "not_delivered"}
    if row.settlement_status in ("unsettled", "settled", "scheduled", "paid"):
        return {"ok": True, "already": True}

    rate = await get_active_commission_rate(session, "food", row.restaurant_id)
    if rate is None:
        # Vendor has no commission configured — don't crash, just leave it
        # untouched so Super Admin can set the rate then re-run settle.
        return {"ok": False, "reason": "no_commission_rate"}

    gross = _d2(row.grand_total)
    delivery = _d2(row.delivery_fee)
    tax = _d2(row.tax)
    commissionable = _d2(gross - delivery - tax)
    commission = _d2(commissionable * rate / Decimal("100"))
    vendor_net = _d2(commissionable - commission)

    await session.execute(text("""
        UPDATE food_orders
           SET commission_rate_snapshot = :rate,
               commission_amount        = :comm,
               vendor_net_amount        = :net,
               settlement_status        = 'unsettled'
         WHERE id = :id
    """), {"rate": str(rate), "comm": str(commission), "net": str(vendor_net), "id": order_id})

    await _wallet_write(
        session, row.restaurant_id, vendor_net,
        kind="order_net",
        description=f"Order {order_id} net @ {rate}%",
        currency=row.currency or "XOF",
        order_id=order_id,
    )
    return {
        "ok": True, "rate": float(rate), "commission": float(commission),
        "vendor_net": float(vendor_net),
    }


async def settle_refund_against_partner(session: AsyncSession, return_id: str,
                                        restaurant_id: str, amount: Decimal,
                                        currency: str = "XOF"):
    """Debit the partner wallet when a refund is approved against them."""
    await _wallet_write(
        session, restaurant_id, -_d2(amount),
        kind="refund",
        description=f"Refund debit — return {return_id}",
        currency=currency, reference=return_id,
    )


# ===========================================================================
# PARTNER ENDPOINTS — read-only view of commission, schedule and wallet.
# ===========================================================================
@partner_router.get("/summary")
async def partner_wallet_summary(
    session: AsyncSession = Depends(get_session),
    partner = Depends(get_current_food_partner),
):
    """One screen's worth of KPIs: pending, eligible, paid-to-date, next payout."""
    rid = partner.restaurant_id

    rate = await get_active_commission_rate(session, "food", rid)
    cfg = (await session.execute(text(
        "SELECT * FROM vendor_payout_config WHERE module = 'food' AND restaurant_id = :r"
    ), {"r": rid})).fetchone()
    wallet = (await session.execute(text(
        "SELECT balance, currency FROM food_restaurant_wallets WHERE restaurant_id = :r"
    ), {"r": rid})).fetchone()
    balance = Decimal(str(wallet.balance)) if wallet else Decimal("0")
    currency = wallet.currency if wallet else "XOF"

    pending = (await session.execute(text("""
        SELECT COALESCE(SUM(vendor_net_amount),0) AS s
          FROM food_orders
         WHERE restaurant_id = :r AND status = 'delivered'
           AND settlement_status = 'unsettled'
    """), {"r": rid})).fetchone().s
    paid_to_date = (await session.execute(text("""
        SELECT COALESCE(SUM(net),0) AS s FROM vendor_payouts
         WHERE module = 'food' AND restaurant_id = :r AND status = 'paid'
    """), {"r": rid})).fetchone().s
    next_payout = (await session.execute(text("""
        SELECT * FROM vendor_payouts
         WHERE module = 'food' AND restaurant_id = :r AND status = 'scheduled'
         ORDER BY scheduled_for NULLS LAST, created_at ASC
         LIMIT 1
    """), {"r": rid})).fetchone()

    return {
        "restaurant_id": rid,
        "commission_rate": float(rate) if rate is not None else None,
        "payout_schedule": {
            "type": cfg.schedule_type if cfg else None,
            "config": cfg.schedule_cfg if cfg else None,
            "is_paused": cfg.is_paused if cfg else False,
            "min_payout_amount": float(cfg.min_payout_amount) if cfg else 0,
            "timezone": (getattr(cfg, "timezone", None) if cfg else None) or "Africa/Abidjan",
        },
        "balance":        float(_d2(balance)),
        "pending_amount": float(_d2(pending)),
        "paid_to_date":   float(_d2(paid_to_date)),
        "next_payout":    _row_dict(next_payout) if next_payout else None,
        "currency": currency,
    }


@partner_router.get("/transactions")
async def partner_wallet_transactions(
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    partner = Depends(get_current_food_partner),
):
    rows = (await session.execute(text("""
        SELECT t.*
          FROM food_restaurant_wallet_txns t
          JOIN food_restaurant_wallets w ON w.id = t.wallet_id
         WHERE w.restaurant_id = :r
         ORDER BY t.created_at DESC
         LIMIT :l
    """), {"r": partner.restaurant_id, "l": limit})).fetchall()
    return {"items": [_row_dict(r) for r in rows]}


@partner_router.get("/payouts")
async def partner_wallet_payouts(
    session: AsyncSession = Depends(get_session),
    partner = Depends(get_current_food_partner),
):
    rows = (await session.execute(text("""
        SELECT * FROM vendor_payouts
         WHERE module = 'food' AND restaurant_id = :r
         ORDER BY created_at DESC
         LIMIT 100
    """), {"r": partner.restaurant_id})).fetchall()
    return {"items": [_row_dict(r) for r in rows]}


@partner_router.get("/commission-history")
async def partner_commission_history(
    session: AsyncSession = Depends(get_session),
    partner = Depends(get_current_food_partner),
):
    rows = (await session.execute(text("""
        SELECT id, rate_percent, effective_from, effective_until, note, created_at
          FROM vendor_commission_history
         WHERE module = 'food' AND restaurant_id = :r
         ORDER BY effective_from DESC
    """), {"r": partner.restaurant_id})).fetchall()
    return {"items": [_row_dict(r) for r in rows]}


# ===========================================================================
# ADMIN ENDPOINTS — commission editor, schedule editor, payout generator.
# ===========================================================================
class CommissionIn(BaseModel):
    rate_percent: float = Field(..., ge=0, le=100)
    effective_from: Optional[datetime] = None   # defaults to now
    note: Optional[str] = None


@admin_router.get("/{module}/{restaurant_id}/commission")
async def admin_get_commission(
    module: Literal["food", "mart", "shop"],
    restaurant_id: str,
    session: AsyncSession = Depends(get_session),
    _admin = Depends(get_current_admin),
):
    current = (await session.execute(text("""
        SELECT * FROM vendor_commission_history
         WHERE module = :m AND restaurant_id = :r AND effective_until IS NULL
         ORDER BY effective_from DESC LIMIT 1
    """), {"m": module, "r": restaurant_id})).fetchone()
    history = (await session.execute(text("""
        SELECT * FROM vendor_commission_history
         WHERE module = :m AND restaurant_id = :r
         ORDER BY effective_from DESC
    """), {"m": module, "r": restaurant_id})).fetchall()
    return {"current": _row_dict(current) if current else None,
            "history": [_row_dict(r) for r in history]}


@admin_router.post("/{module}/{restaurant_id}/commission")
async def admin_set_commission(
    module: Literal["food", "mart", "shop"],
    restaurant_id: str,
    payload: CommissionIn,
    session: AsyncSession = Depends(get_session),
    admin = Depends(get_current_admin),
):
    now = datetime.now(timezone.utc)
    eff = payload.effective_from or now
    # Close out the previous active row at the new effective-from timestamp.
    await session.execute(text("""
        UPDATE vendor_commission_history SET effective_until = :e
         WHERE module = :m AND restaurant_id = :r
           AND effective_until IS NULL
    """), {"e": eff, "m": module, "r": restaurant_id})
    new_id = f"vch_{uuid.uuid4().hex[:16]}"
    await session.execute(text("""
        INSERT INTO vendor_commission_history
          (id, module, restaurant_id, rate_percent, effective_from, note, changed_by_admin_id)
        VALUES (:id, :m, :r, :rate, :eff, :n, :by)
    """), {"id": new_id, "m": module, "r": restaurant_id,
           "rate": payload.rate_percent, "eff": eff, "n": payload.note, "by": admin.id})
    await session.commit()
    return {"id": new_id, "rate_percent": payload.rate_percent, "effective_from": eff.isoformat()}


class PayoutScheduleIn(BaseModel):
    schedule_type: Literal["daily", "weekly", "monthly", "custom"]
    schedule_cfg: dict[str, Any] = Field(default_factory=dict)
    payout_method: Optional[str] = None
    payout_destination: Optional[str] = None
    min_payout_amount: float = 0
    notes: Optional[str] = None
    timezone: Optional[str] = None  # IANA, defaults to Africa/Abidjan at DB level


@admin_router.get("/{module}/{restaurant_id}/payout-config")
async def admin_get_payout_config(
    module: Literal["food", "mart", "shop"],
    restaurant_id: str,
    session: AsyncSession = Depends(get_session),
    _admin = Depends(get_current_admin),
):
    row = (await session.execute(text(
        "SELECT * FROM vendor_payout_config WHERE module = :m AND restaurant_id = :r"
    ), {"m": module, "r": restaurant_id})).fetchone()
    return {"config": _row_dict(row) if row else None}


@admin_router.post("/{module}/{restaurant_id}/payout-config")
async def admin_set_payout_config(
    module: Literal["food", "mart", "shop"],
    restaurant_id: str,
    payload: PayoutScheduleIn,
    session: AsyncSession = Depends(get_session),
    admin = Depends(get_current_admin),
):
    pid = f"vpc_{uuid.uuid4().hex[:12]}"
    tz = (payload.timezone or "Africa/Abidjan").strip() or "Africa/Abidjan"
    await session.execute(text("""
        INSERT INTO vendor_payout_config
          (id, module, restaurant_id, schedule_type, schedule_cfg,
           payout_method, payout_destination, min_payout_amount, notes,
           timezone, last_changed_by)
        VALUES (:id, :m, :r, :st, :cfg, :pm, :pd, :mn, :n, :tz, :by)
        ON CONFLICT (module, restaurant_id) DO UPDATE
          SET schedule_type = EXCLUDED.schedule_type,
              schedule_cfg = EXCLUDED.schedule_cfg,
              payout_method = EXCLUDED.payout_method,
              payout_destination = EXCLUDED.payout_destination,
              min_payout_amount = EXCLUDED.min_payout_amount,
              notes = EXCLUDED.notes,
              timezone = EXCLUDED.timezone,
              last_changed_by = EXCLUDED.last_changed_by,
              updated_at = now()
    """), {"id": pid, "m": module, "r": restaurant_id,
           "st": payload.schedule_type, "cfg": __dumps(payload.schedule_cfg),
           "pm": payload.payout_method, "pd": payload.payout_destination,
           "mn": payload.min_payout_amount, "n": payload.notes,
           "tz": tz, "by": admin.id})
    await session.commit()
    return {"status": "ok"}


class PauseIn(BaseModel):
    reason: Optional[str] = None


@admin_router.post("/{module}/{restaurant_id}/payouts/pause")
async def admin_pause_payouts(
    module: str, restaurant_id: str, payload: PauseIn,
    session: AsyncSession = Depends(get_session),
    _admin = Depends(get_current_admin),
):
    await session.execute(text("""
        UPDATE vendor_payout_config SET is_paused = TRUE, pause_reason = :r, updated_at = now()
         WHERE module = :m AND restaurant_id = :rid
    """), {"r": payload.reason, "m": module, "rid": restaurant_id})
    await session.commit()
    return {"status": "paused"}


@admin_router.post("/{module}/{restaurant_id}/payouts/resume")
async def admin_resume_payouts(
    module: str, restaurant_id: str,
    session: AsyncSession = Depends(get_session),
    _admin = Depends(get_current_admin),
):
    await session.execute(text("""
        UPDATE vendor_payout_config SET is_paused = FALSE, pause_reason = NULL, updated_at = now()
         WHERE module = :m AND restaurant_id = :rid
    """), {"m": module, "rid": restaurant_id})
    await session.commit()
    return {"status": "resumed"}


# -------- Payout generation + lifecycle --------
class GeneratePayoutIn(BaseModel):
    period_start: Optional[datetime] = None
    period_end:   Optional[datetime] = None
    scheduled_for: Optional[datetime] = None


@admin_router.post("/{module}/{restaurant_id}/payouts/generate")
async def admin_generate_payout(
    module: Literal["food", "mart", "shop"],
    restaurant_id: str,
    payload: GeneratePayoutIn,
    session: AsyncSession = Depends(get_session),
    admin = Depends(get_current_admin),
):
    """Bundle unsettled delivered orders into a scheduled payout."""
    end   = payload.period_end or datetime.now(timezone.utc)
    start = payload.period_start or (end - timedelta(days=7))

    if module != "food":
        raise HTTPException(400, "only_food_supported_in_mvp")

    rows = (await session.execute(text("""
        SELECT id, grand_total, delivery_fee, tax, commission_amount, vendor_net_amount, currency
          FROM food_orders
         WHERE restaurant_id = :r AND status = 'delivered'
           AND settlement_status = 'unsettled'
           AND delivered_at >= :s AND delivered_at <= :e
         ORDER BY delivered_at ASC
    """), {"r": restaurant_id, "s": start, "e": end})).fetchall()
    if not rows:
        raise HTTPException(400, "no_unsettled_orders_in_window")

    gross  = _d2(sum((Decimal(str(r.grand_total or 0))      for r in rows), Decimal("0")))
    comm   = _d2(sum((Decimal(str(r.commission_amount or 0)) for r in rows), Decimal("0")))
    net    = _d2(sum((Decimal(str(r.vendor_net_amount or 0)) for r in rows), Decimal("0")))

    # Also account for approved refunds settled during the window.
    refund_rows = (await session.execute(text("""
        SELECT COALESCE(SUM(approved_amount),0) AS s FROM returns
         WHERE partner_id = :r AND status IN ('refunded','approved','partial_approved')
           AND created_at >= :s AND created_at <= :e
    """), {"r": restaurant_id, "s": start, "e": end})).fetchone()
    refunds = _d2(refund_rows.s if refund_rows else 0)
    final_net = _d2(net - refunds)

    currency = rows[0].currency or "XOF"
    pid = f"vp_{uuid.uuid4().hex[:16]}"
    number = f"PO{datetime.now(timezone.utc).strftime('%y%m%d')}{uuid.uuid4().hex[:6].upper()}"

    await session.execute(text("""
        INSERT INTO vendor_payouts (id, number, module, restaurant_id, period_start, period_end,
                                    gross, commission, refunds, net, currency, status,
                                    scheduled_for, created_by_admin_id)
        VALUES (:id, :num, :m, :r, :s, :e, :g, :c, :rf, :n, :cur, 'scheduled', :sch, :by)
    """), {"id": pid, "num": number, "m": module, "r": restaurant_id, "s": start, "e": end,
           "g": str(gross), "c": str(comm), "rf": str(refunds), "n": str(final_net),
           "cur": currency, "sch": payload.scheduled_for, "by": admin.id})

    # Flag orders as "scheduled" so a second generate doesn't double-count.
    await session.execute(text("""
        UPDATE food_orders SET settlement_status = 'scheduled', settled_payout_id = :p
         WHERE id = ANY(:ids)
    """), {"p": pid, "ids": [r.id for r in rows]})

    await session.commit()
    return {"id": pid, "number": number, "net": float(final_net),
            "gross": float(gross), "commission": float(comm), "refunds": float(refunds)}


class MarkPaidIn(BaseModel):
    reference: Optional[str] = None
    paid_at: Optional[datetime] = None


@admin_router.post("/payouts/{payout_id}/mark-paid")
async def admin_mark_payout_paid(
    payout_id: str,
    payload: MarkPaidIn,
    session: AsyncSession = Depends(get_session),
    admin = Depends(get_current_admin),
):
    row = (await session.execute(text(
        "SELECT * FROM vendor_payouts WHERE id = :id"
    ), {"id": payout_id})).fetchone()
    if not row:
        raise HTTPException(404, "payout_not_found")
    if row.status == "paid":
        return {"status": "already_paid"}

    paid_at = payload.paid_at or datetime.now(timezone.utc)
    await session.execute(text("""
        UPDATE vendor_payouts SET status = 'paid', paid_at = :pa, reference = :ref, updated_at = now()
         WHERE id = :id
    """), {"pa": paid_at, "ref": payload.reference, "id": payout_id})
    await session.execute(text("""
        UPDATE food_orders SET settlement_status = 'paid'
         WHERE settled_payout_id = :id
    """), {"id": payout_id})
    # Debit wallet for the net amount paid out.
    await _wallet_write(
        session, row.restaurant_id, -_d2(row.net),
        kind="payout",
        description=f"Payout {row.number}",
        currency=row.currency or "XOF", reference=payout_id,
    )
    await session.commit()
    return {"status": "paid"}


@admin_router.post("/payouts/{payout_id}/hold")
async def admin_hold_payout(
    payout_id: str,
    session: AsyncSession = Depends(get_session),
    _admin = Depends(get_current_admin),
):
    await session.execute(text(
        "UPDATE vendor_payouts SET status = 'hold', updated_at = now() WHERE id = :id"
    ), {"id": payout_id})
    await session.commit()
    return {"status": "hold"}


@admin_router.post("/payouts/{payout_id}/release")
async def admin_release_payout(
    payout_id: str,
    session: AsyncSession = Depends(get_session),
    _admin = Depends(get_current_admin),
):
    await session.execute(text(
        "UPDATE vendor_payouts SET status = 'scheduled', updated_at = now() WHERE id = :id AND status = 'hold'"
    ), {"id": payout_id})
    await session.commit()
    return {"status": "scheduled"}


@admin_router.get("/payouts")
async def admin_list_payouts(
    module: Optional[str] = None,
    restaurant_id: Optional[str] = None,
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _admin = Depends(get_current_admin),
):
    where = ["1=1"]; params = {}
    if module:        where.append("module = :m"); params["m"] = module
    if restaurant_id: where.append("restaurant_id = :r"); params["r"] = restaurant_id
    if status:        where.append("status = :s"); params["s"] = status
    rows = (await session.execute(text(f"""
        SELECT * FROM vendor_payouts WHERE {' AND '.join(where)}
         ORDER BY created_at DESC LIMIT 200
    """), params)).fetchall()
    return {"items": [_row_dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Internal: json dumps helper for asyncpg JSONB bind.
# ---------------------------------------------------------------------------
def __dumps(obj):
    import json
    return json.dumps(obj or {})
