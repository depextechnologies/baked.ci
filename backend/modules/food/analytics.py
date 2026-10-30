"""FOODbakēd — Restaurant Analytics + Order Seed Helper.

Endpoints:
  * `GET /api/food/manage/{rid}/analytics?range=7d|30d|90d`
        Aggregated KPIs + daily series + top items + status/type/payment mixes
        for the authorised writer (super-admin OR restaurant partner of rid).

  * `POST /api/admin/food/restaurants/{rid}/seed-orders?days=90&daily_avg=25`
        Dev-only seed helper — generates ~`daily_avg` realistic orders per day
        for `days` days ending today. Weekends busier, lunchtimes / dinner
        heavier, mix of statuses, delivery / pickup, payment methods, promos.

Design notes:
  * We shape aggregates to be chart-ready (Recharts).
  * `restaurant_earnings` is what the restaurant nets after delivery fee —
    always the source of truth for the partner's "Revenus" tile.
  * The seed helper is guarded behind super-admin auth AND `APP_ENV != prod`
    so we can never accidentally corrupt real revenue in production.
"""
from __future__ import annotations

import os
import random
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from shared.admin.routes import get_current_admin

# Reuse the authorised-writer helper from the menu-management router.
from modules.food.routes import _get_menu_writer  # type: ignore


analytics_router = APIRouter(prefix="/food/manage", tags=["food-analytics"])
seed_router      = APIRouter(prefix="/admin/food",   tags=["food-admin"])


IS_PRODUCTION = os.environ.get("APP_ENV", "development").lower() in ("prod", "production")


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

_RANGES = {"7d": 7, "30d": 30, "90d": 90}


@analytics_router.get("/{rid}/analytics")
async def analytics(
    rid: str, request: Request,
    range_: str = Query("30d", alias="range", pattern="^(7d|30d|90d)$"),
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    days = _RANGES[range_]
    since = datetime.now(timezone.utc) - timedelta(days=days)
    # Currency comes from any recent order or the restaurant itself.
    rest = (await session.execute(text(
        "SELECT country FROM food_restaurants WHERE id = :id"
    ), {"id": rid})).fetchone()
    if not rest:
        raise HTTPException(404, "Restaurant not found")
    currency = "INR" if rest.country == "IN" else "XOF"

    # --- Headline KPIs -----------------------------------------------------
    kpi_row = (await session.execute(text("""
        SELECT
            COUNT(*)                                                              AS total_orders,
            COUNT(*) FILTER (WHERE status = 'delivered')                          AS delivered,
            COUNT(*) FILTER (WHERE status IN ('cancelled','rejected'))            AS cancelled,
            COALESCE(SUM(grand_total)          FILTER (WHERE status = 'delivered'), 0) AS gross_revenue,
            COALESCE(SUM(restaurant_earnings)  FILTER (WHERE status = 'delivered'), 0) AS net_earnings,
            COALESCE(AVG(grand_total)          FILTER (WHERE status = 'delivered'), 0) AS avg_order_value
        FROM food_orders
        WHERE restaurant_id = :rid AND placed_at >= :since
    """), {"rid": rid, "since": since})).fetchone()

    # --- Prep-time avg (accepted → ready)  seconds -------------------------
    prep_row = (await session.execute(text("""
        SELECT AVG(EXTRACT(EPOCH FROM (ready_at - accepted_at))) AS avg_seconds
        FROM food_orders
        WHERE restaurant_id = :rid AND placed_at >= :since
          AND accepted_at IS NOT NULL AND ready_at IS NOT NULL
    """), {"rid": rid, "since": since})).fetchone()
    avg_prep_min = round((prep_row.avg_seconds or 0) / 60, 1)

    # --- Daily series (orders + revenue + prep) ----------------------------
    daily = (await session.execute(text("""
        SELECT date_trunc('day', placed_at)::date AS day,
               COUNT(*)                                                            AS orders,
               COALESCE(SUM(grand_total)         FILTER (WHERE status = 'delivered'), 0) AS revenue,
               COALESCE(SUM(restaurant_earnings) FILTER (WHERE status = 'delivered'), 0) AS earnings,
               COALESCE(AVG(EXTRACT(EPOCH FROM (ready_at - accepted_at)))
                        FILTER (WHERE accepted_at IS NOT NULL AND ready_at IS NOT NULL), 0) AS avg_prep_seconds
          FROM food_orders
         WHERE restaurant_id = :rid AND placed_at >= :since
         GROUP BY day ORDER BY day
    """), {"rid": rid, "since": since})).fetchall()

    # Fill missing days with zero
    day_map = {r.day.isoformat(): r for r in daily}
    series = []
    for i in range(days):
        d = (datetime.now(timezone.utc).date() - timedelta(days=days - 1 - i))
        r = day_map.get(d.isoformat())
        series.append({
            "date":     d.isoformat(),
            "orders":   int(r.orders) if r else 0,
            "revenue":  float(r.revenue) if r else 0.0,
            "earnings": float(r.earnings) if r else 0.0,
            "avg_prep_min": round((float(r.avg_prep_seconds) if r else 0.0) / 60, 1),
        })

    # --- Top items ---------------------------------------------------------
    top = (await session.execute(text("""
        SELECT item_name_snapshot AS name,
               menu_item_id AS item_id,
               SUM(quantity)   AS qty,
               SUM(line_total) AS revenue
          FROM food_order_items i
          JOIN food_orders o ON o.id = i.order_id
         WHERE o.restaurant_id = :rid AND o.placed_at >= :since AND o.status = 'delivered'
         GROUP BY item_name_snapshot, menu_item_id
         ORDER BY qty DESC
         LIMIT 10
    """), {"rid": rid, "since": since})).fetchall()

    # --- Distributions -----------------------------------------------------
    status_mix = (await session.execute(text("""
        SELECT status, COUNT(*) AS n FROM food_orders
         WHERE restaurant_id = :rid AND placed_at >= :since
         GROUP BY status
    """), {"rid": rid, "since": since})).fetchall()

    type_mix = (await session.execute(text("""
        SELECT order_type AS name, COUNT(*) AS n FROM food_orders
         WHERE restaurant_id = :rid AND placed_at >= :since
         GROUP BY order_type
    """), {"rid": rid, "since": since})).fetchall()

    payment_mix = (await session.execute(text("""
        SELECT COALESCE(payment_method, 'unknown') AS name, COUNT(*) AS n FROM food_orders
         WHERE restaurant_id = :rid AND placed_at >= :since
         GROUP BY payment_method
    """), {"rid": rid, "since": since})).fetchall()

    # --- Peak hours --------------------------------------------------------
    hours = (await session.execute(text("""
        SELECT EXTRACT(HOUR FROM placed_at AT TIME ZONE 'UTC')::int AS hour,
               COUNT(*) AS n
          FROM food_orders
         WHERE restaurant_id = :rid AND placed_at >= :since
         GROUP BY hour
    """), {"rid": rid, "since": since})).fetchall()
    hours_map = {int(r.hour): int(r.n) for r in hours}

    return {
        "range": range_,
        "restaurant_id": rid,
        "currency": currency,
        "kpis": {
            "total_orders":       int(kpi_row.total_orders   or 0),
            "delivered_orders":   int(kpi_row.delivered      or 0),
            "cancelled_orders":   int(kpi_row.cancelled      or 0),
            "gross_revenue":      float(kpi_row.gross_revenue or 0),
            "net_earnings":       float(kpi_row.net_earnings  or 0),
            "avg_order_value":    float(kpi_row.avg_order_value or 0),
            "avg_prep_min":       avg_prep_min,
        },
        "daily":         series,
        "top_items":     [{"name": r.name, "item_id": r.item_id,
                            "qty": int(r.qty), "revenue": float(r.revenue)} for r in top],
        "status_mix":    [{"name": r.status,     "value": int(r.n)} for r in status_mix],
        "type_mix":      [{"name": r.name,       "value": int(r.n)} for r in type_mix],
        "payment_mix":   [{"name": r.name,       "value": int(r.n)} for r in payment_mix],
        "hourly":        [{"hour": h, "orders": hours_map.get(h, 0)} for h in range(0, 24)],
    }


# ---------------------------------------------------------------------------
# Seed helper — realistic ~90-day history per restaurant
# ---------------------------------------------------------------------------


def _mk_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


# Status distribution — mostly delivered, small cancel/reject rate.
_STATUS_PICK = (["delivered"] * 88) + (["cancelled"] * 6) + (["rejected"] * 4) + (["out_for_delivery"] * 2)

_PAY_METHODS_CI = [("cash", 45), ("mobile_money", 45), ("card", 10)]
_PAY_METHODS_IN = [("upi", 55), ("card", 25), ("cash", 15), ("wallet", 5)]


def _weighted(items):
    total = sum(w for _, w in items)
    r = random.random() * total
    acc = 0
    for it, w in items:
        acc += w
        if r <= acc:
            return it
    return items[-1][0]


def _hour_weight(h: int) -> float:
    """Restaurant order-flow curve — lunch + dinner peaks, sleepy nights."""
    if 6 <= h <= 10:  return 0.4
    if 11 <= h <= 14: return 3.0        # lunch peak
    if 15 <= h <= 17: return 0.8
    if 18 <= h <= 22: return 4.0        # dinner peak
    if 23 <= h or h <= 2: return 0.5
    return 0.05


def _pick_hour() -> int:
    hours = list(range(0, 24))
    weights = [_hour_weight(h) for h in hours]
    return random.choices(hours, weights=weights, k=1)[0]


class _MenuCache:
    def __init__(self, items):
        self.items = items      # list of dicts
        # Popularity weights favour cheaper items slightly.
        self.weights = [max(0.2, 5.0 / max(1, float(it["base_price"]) / 1000 + 1)) for it in items]


async def _load_menu(session: AsyncSession, rid: str) -> _MenuCache:
    rows = (await session.execute(text("""
        SELECT i.id, i.name, i.base_price, i.currency, i.section_id, s.name_en AS section_name,
               COALESCE((SELECT jsonb_agg(row_to_json(v)) FROM food_item_variants v WHERE v.item_id = i.id), '[]'::jsonb) AS variants,
               COALESCE((SELECT jsonb_agg(row_to_json(a)) FROM food_item_addons   a WHERE a.item_id = i.id), '[]'::jsonb) AS addons
          FROM food_menu_items i
     LEFT JOIN food_menu_sections s ON s.id = i.section_id
         WHERE i.restaurant_id = :rid AND i.is_available = TRUE
    """), {"rid": rid})).fetchall()
    items = [dict(r._mapping) for r in rows]
    return _MenuCache(items)


def _order_number(seq: int) -> str:
    return f"FB-{datetime.now(timezone.utc).strftime('%Y%m')}-{seq:06d}"


async def _generate_orders(session: AsyncSession, rid: str, days: int, daily_avg: int) -> int:
    rest = (await session.execute(text("SELECT * FROM food_restaurants WHERE id = :id"), {"id": rid})).fetchone()
    if not rest:
        raise HTTPException(404, "Restaurant not found")

    menu = await _load_menu(session, rid)
    if not menu.items:
        raise HTTPException(400, "Menu is empty — add items before seeding orders")

    payment_methods = _PAY_METHODS_IN if rest.country == "IN" else _PAY_METHODS_CI
    currency = "INR" if rest.country == "IN" else "XOF"
    tax_rate = Decimal("0.05")   # 5% flat for demo (VAT approximation)

    now = datetime.now(timezone.utc)
    count = 0
    seq_start = random.randint(1000, 9000)

    for d in range(days, 0, -1):
        day = now - timedelta(days=d - 1)
        weekend = day.weekday() >= 5
        # Noise 60%..140%. Weekends x1.35.
        n = max(1, int(daily_avg * random.uniform(0.6, 1.4) * (1.35 if weekend else 1.0)))

        for _ in range(n):
            hour = _pick_hour()
            placed = day.replace(hour=hour, minute=random.randint(0, 59),
                                  second=random.randint(0, 59), microsecond=0)
            if placed > now:
                continue

            # 1..4 items, mostly 1-2
            n_items = random.choices([1, 2, 3, 4], weights=[45, 35, 15, 5], k=1)[0]
            chosen = random.choices(menu.items, weights=menu.weights, k=n_items)

            subtotal = Decimal("0")
            line_rows = []
            for it in chosen:
                qty = random.choices([1, 2, 3], weights=[70, 25, 5], k=1)[0]
                variants = it["variants"] or []
                addons = it["addons"] or []
                v = random.choice(variants) if variants and random.random() < 0.5 else None
                picked_addons = random.sample(addons, k=min(len(addons), random.randint(0, 2))) if addons else []
                base = Decimal(str(it["base_price"] or 0))
                v_delta = Decimal(str(v["price_delta"])) if v else Decimal("0")
                addon_sum = sum(Decimal(str(a["price"])) for a in picked_addons)
                unit = base + v_delta + addon_sum
                line = unit * qty
                subtotal += line
                line_rows.append({
                    "id": _mk_id("foi"), "menu_item_id": it["id"],
                    "item_name_snapshot": it["name"], "section_snapshot": it.get("section_name"),
                    "quantity": qty, "unit_price": float(unit),
                    "variant_snapshot": v, "addons_snapshot": picked_addons,
                    "item_discount": 0.0, "line_total": float(line),
                })

            order_type = "delivery" if random.random() < 0.75 else "pickup"
            delivery_fee = Decimal(str(rest.delivery_fee or 0)) if order_type == "delivery" else Decimal("0")
            # Promo — 12% of orders
            promo = random.random() < 0.12
            promo_code = random.choice(["WELCOME10", "TASTY15", "FRIDAY20"]) if promo else None
            promo_discount = (subtotal * Decimal("0.10")).quantize(Decimal("1")) if promo else Decimal("0")
            tax = ((subtotal - promo_discount) * tax_rate).quantize(Decimal("1"))
            grand = subtotal - promo_discount + delivery_fee + tax
            # Restaurant nets grand_total minus delivery_fee minus 15% commission
            commission = ((subtotal - promo_discount) * Decimal("0.15")).quantize(Decimal("1"))
            earnings = grand - delivery_fee - commission - tax
            if earnings < 0:
                earnings = Decimal("0")

            status = _weighted([(s, 1) for s in _STATUS_PICK])
            # Timing timestamps depending on status.
            accepted_at = placed + timedelta(minutes=random.randint(1, 5))
            ready_at    = accepted_at + timedelta(minutes=random.randint(rest.prep_time_min or 15, rest.prep_time_max or 30))
            delivered_at = ready_at + timedelta(minutes=random.randint(15, 45)) if order_type == "delivery" else ready_at + timedelta(minutes=random.randint(3, 10))
            cancelled_at = None
            if status in ("cancelled", "rejected"):
                accepted_at = None
                ready_at    = None
                delivered_at = None
                cancelled_at = placed + timedelta(minutes=random.randint(1, 10))
            elif status == "out_for_delivery":
                delivered_at = None

            pm = _weighted(payment_methods)
            payment_status = "paid" if status == "delivered" else ("pending" if status in ("placed", "accepted", "preparing", "ready") else "failed" if status == "cancelled" else "authorized")

            oid = _mk_id("fo")
            onum = _order_number(seq_start + count)
            await session.execute(text("""
                INSERT INTO food_orders (
                    id, order_number, restaurant_id, customer_id, customer_snapshot, country,
                    order_type, status, placed_at, accepted_at, ready_at, delivered_at, cancelled_at,
                    currency, subtotal, discount, delivery_fee, tax, grand_total, restaurant_earnings,
                    payment_method, payment_status, promo_code, promo_discount, delivery_address
                ) VALUES (
                    :id, :onum, :rid, :cid, CAST(:cs AS JSONB), :country,
                    :otype, :status, :placed, :acc, :ready, :delivered, :cancelled,
                    :cur, :sub, :disc, :dfee, :tax, :grand, :earn,
                    :pm, :pstatus, :pc, :pdisc, CAST(:addr AS JSONB)
                )
            """), {
                "id": oid, "onum": onum, "rid": rid,
                "cid": f"demo_cust_{random.randint(1, 200)}",
                "cs": _dump({"name": f"Client {random.randint(1, 200)}", "phone": "+22590000000"}),
                "country": rest.country, "otype": order_type, "status": status,
                "placed": placed, "acc": accepted_at, "ready": ready_at,
                "delivered": delivered_at, "cancelled": cancelled_at,
                "cur": currency,
                "sub":   float(subtotal),
                "disc":  float(promo_discount),
                "dfee":  float(delivery_fee),
                "tax":   float(tax),
                "grand": float(grand),
                "earn":  float(earnings),
                "pm": pm, "pstatus": payment_status,
                "pc": promo_code, "pdisc": float(promo_discount),
                "addr": _dump({"street": "Demo street", "city": rest.country}),
            })

            for li in line_rows:
                await session.execute(text("""
                    INSERT INTO food_order_items (id, order_id, menu_item_id, item_name_snapshot,
                        section_snapshot, quantity, unit_price, variant_snapshot, addons_snapshot,
                        item_discount, line_total)
                    VALUES (:id, :oid, :mid, :name, :sec, :qty, :up,
                            CAST(:v AS JSONB), CAST(:a AS JSONB), :disc, :lt)
                """), {"id": li["id"], "oid": oid, "mid": li["menu_item_id"],
                       "name": li["item_name_snapshot"], "sec": li["section_snapshot"],
                       "qty": li["quantity"], "up": li["unit_price"],
                       "v": _dump(li["variant_snapshot"]),
                       "a": _dump(li["addons_snapshot"]),
                       "disc": li["item_discount"], "lt": li["line_total"]})

            count += 1

    await session.commit()
    return count


def _dump(value) -> str:
    import json
    if value is None: return "null"
    return json.dumps(value, default=str)


@seed_router.post("/restaurants/{rid}/seed-orders")
async def seed_orders(
    rid: str,
    days: int = Query(90, ge=1, le=180),
    daily_avg: int = Query(25, ge=1, le=200),
    clear: bool = Query(False, description="Delete existing orders for this restaurant first"),
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    if IS_PRODUCTION:
        raise HTTPException(403, "Seeding disabled in production")
    if clear:
        await session.execute(text("DELETE FROM food_orders WHERE restaurant_id = :rid"), {"rid": rid})
        await session.commit()
    count = await _generate_orders(session, rid, days, daily_avg)
    return {"seeded": count, "restaurant_id": rid, "days": days, "daily_avg": daily_avg}
