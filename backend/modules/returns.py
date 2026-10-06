"""Unified Return & Refund flow for FOOD / MART / SHOP.

Lifecycle
---------
1. Customer opens a return within the module's policy window (measured from the
   order's ``delivered_at``). Expired orders fall through to the "Contact Support"
   path on the frontend; the endpoints also return 400 ``window_closed``.
2. The request is validated — items & amounts can't exceed what was ordered,
   reason must be in the policy's allow-list.
3. Routing decision:
     * Customer is **flagged** → ``awaiting_admin``.
     * Requested amount ``< auto_approve_threshold`` → auto-approved and
       refunded (wallet or marked pending-payout for original method).
     * Requested amount ``>= threshold`` → ``awaiting_partner`` with a 24h
       SLA (configurable constant below).
4. Partner can **approve / partial / dispute / reject**. Partial & reject
   require a reason. Dispute escalates to admin.
5. Super Admin has final override on every row.
6. The system endpoint ``/admin/returns/escalate-stale`` moves any
   ``awaiting_partner`` past its SLA to ``awaiting_admin``.

All routes are mounted under ``/api``. Everything is tenant-scoped via JWT —
URL IDs are never trusted for cross-tenant lookup.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer
from core.models import Customer
from modules.food.routes import get_current_food_partner
from shared.admin.routes import get_current_admin as require_admin


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PARTNER_SLA_HOURS = 24
VALID_REASONS = {
    "wrong_item", "missing_item", "damaged", "poor_quality", "cold_food",
    "late_delivery", "wrong_order", "changed_mind", "other",
}
EVIDENCE_REQUIRED_FOR = {"damaged", "poor_quality", "wrong_item"}


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
customer_router = APIRouter(prefix="/returns", tags=["returns-customer"])
partner_router  = APIRouter(prefix="/returns/partner", tags=["returns-partner"])
admin_router    = APIRouter(prefix="/admin/returns", tags=["returns-admin"])
policy_router   = APIRouter(prefix="/admin/return-policies", tags=["returns-admin"])


# ---------------------------------------------------------------------------
# Order source abstraction (so we can treat FOOD/MART/SHOP uniformly).
# ---------------------------------------------------------------------------
async def _load_order(session: AsyncSession, module: str, order_id: str, customer_id: str):
    """Return (header_row, items[]) or raise 404.

    Items are normalised into a common dict shape so the rest of the module
    doesn't care which table they came from.
    """
    if module == "food":
        row = (await session.execute(text(
            "SELECT id, order_number, customer_id, restaurant_id, status, delivered_at, "
            "country, grand_total AS total, currency FROM food_orders WHERE id = :id"
        ), {"id": order_id})).fetchone()
        if not row or row.customer_id != customer_id:
            raise HTTPException(404, "order_not_found")
        items = (await session.execute(text(
            "SELECT id, menu_item_id AS product_id, item_name_snapshot AS name, quantity, "
            "unit_price AS unit_amount, line_total FROM food_order_items WHERE order_id = :id"
        ), {"id": order_id})).fetchall()
        partner_id = row.restaurant_id
    elif module == "mart":
        row = (await session.execute(text(
            "SELECT id, number AS order_number, customer_id, status, total, currency, "
            "updated_at AS delivered_at FROM orders WHERE id = :id AND module = 'mart'"
        ), {"id": order_id})).fetchone()
        if not row or row.customer_id != customer_id:
            raise HTTPException(404, "order_not_found")
        items = (await session.execute(text(
            "SELECT id, product_id, name, quantity, price AS unit_amount, line_total "
            "FROM order_items WHERE order_id = :id"
        ), {"id": order_id})).fetchall()
        # MART orders can span partners; keep partner_id null (admin will handle).
        partner_id = None
    elif module == "shop":
        row = (await session.execute(text(
            "SELECT id, number AS order_number, customer_id, status, total, currency, delivered_at, country "
            "FROM shop_orders WHERE id = :id"
        ), {"id": order_id})).fetchone()
        if not row or row.customer_id != customer_id:
            raise HTTPException(404, "order_not_found")
        items = (await session.execute(text(
            "SELECT id, product_id, title AS name, quantity, unit_price AS unit_amount, line_total "
            "FROM shop_order_items WHERE order_id = :id"
        ), {"id": order_id})).fetchall()
        partner_id = None
    else:
        raise HTTPException(400, "invalid_module")

    return row, items, partner_id


def _row_dict(r):
    """Robust row → dict (works for both SQLAlchemy Row and already-dict)."""
    try:
        return dict(r._mapping)
    except AttributeError:
        return dict(r)


# ---------------------------------------------------------------------------
# Policy resolution — narrowest match wins.
# ---------------------------------------------------------------------------
async def _resolve_policy(session: AsyncSession, module: str, country: Optional[str],
                          category_id: Optional[str] = None, product_id: Optional[str] = None):
    """Walk the specificity cascade and return the applicable policy row."""
    q = text("""
        SELECT * FROM return_policies
         WHERE module = :m
           AND (product_id = :p OR product_id IS NULL)
           AND (category_id = :c OR category_id IS NULL)
           AND (country = :co OR country IS NULL)
         ORDER BY
            (product_id IS NOT NULL) DESC,
            (category_id IS NOT NULL) DESC,
            (country IS NOT NULL) DESC
         LIMIT 1
    """)
    row = (await session.execute(q, {"m": module, "p": product_id, "c": category_id, "co": country})).fetchone()
    return row


async def _is_flagged(session: AsyncSession, customer_id: str) -> bool:
    row = (await session.execute(text(
        "SELECT risk_level FROM customer_refund_flags WHERE customer_id = :cid"
    ), {"cid": customer_id})).fetchone()
    return row is not None


# ---------------------------------------------------------------------------
# Wallet helper — simple ledger with running balance.
# ---------------------------------------------------------------------------
async def _credit_wallet(session: AsyncSession, customer_id: str, amount: Decimal,
                         currency: str, source_id: str, note: str = ""):
    cur = (await session.execute(text(
        "SELECT balance FROM customer_wallet_balances WHERE customer_id = :cid"
    ), {"cid": customer_id})).fetchone()
    if not cur:
        await session.execute(text(
            "INSERT INTO customer_wallet_balances (customer_id, balance, currency) VALUES (:cid, 0, :c)"
        ), {"cid": customer_id, "c": currency})
        prev = Decimal("0")
    else:
        prev = Decimal(str(cur.balance))

    new_bal = prev + amount
    await session.execute(text(
        "UPDATE customer_wallet_balances SET balance = :b, updated_at = now() WHERE customer_id = :cid"
    ), {"b": str(new_bal), "cid": customer_id})
    await session.execute(text("""
        INSERT INTO customer_wallet_transactions (id, customer_id, delta, balance_after, currency,
                                                  source_type, source_id, note)
        VALUES (:id, :cid, :d, :ba, :c, 'refund', :sid, :note)
    """), {
        "id": f"wtx_{uuid.uuid4().hex[:16]}", "cid": customer_id,
        "d": str(amount), "ba": str(new_bal), "c": currency,
        "sid": source_id, "note": note,
    })


async def _audit(session: AsyncSession, return_id: str, actor_type: str,
                 actor_id: Optional[str], action: str,
                 from_status: Optional[str], to_status: Optional[str], note: str = ""):
    await session.execute(text("""
        INSERT INTO return_audit (id, return_id, actor_type, actor_id, action, from_status, to_status, note)
        VALUES (:id, :rid, :at, :aid, :act, :fs, :ts, :n)
    """), {
        "id": f"rau_{uuid.uuid4().hex[:16]}", "rid": return_id, "at": actor_type,
        "aid": actor_id, "act": action, "fs": from_status, "ts": to_status, "n": note,
    })


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class ReturnItemIn(BaseModel):
    order_item_id: str
    qty: int = Field(..., ge=1)
    reason_code: Optional[str] = None
    reason_text: Optional[str] = None


class CreateReturnIn(BaseModel):
    order_id: str
    order_module: Literal["food", "mart", "shop"]
    reason_code: str
    reason_text: Optional[str] = None
    refund_destination: Literal["wallet", "original"] = "wallet"
    destination_detail: Optional[str] = None
    evidence_urls: list[str] = Field(default_factory=list)
    items: list[ReturnItemIn] = Field(default_factory=list)   # empty → full order refund

    @validator("reason_code")
    def _valid_reason(cls, v):
        if v not in VALID_REASONS:
            raise ValueError("invalid_reason")
        return v


# ---------------------------------------------------------------------------
# Eligibility probe — used by frontend to show/hide "Report an issue" CTA.
# ---------------------------------------------------------------------------
@customer_router.get("/eligibility")
async def check_eligibility(
    order_id: str,
    order_module: Literal["food", "mart", "shop"],
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    row, items, partner_id = await _load_order(session, order_module, order_id, customer.id)
    delivered_at = row.delivered_at
    if not delivered_at:
        return {"can_return": False, "reason": "not_delivered",
                "window_closes_at": None, "already_open": False}

    country = getattr(row, "country", None)
    policy = await _resolve_policy(session, order_module, country)
    if not policy or not policy.is_returnable:
        return {"can_return": False, "reason": "not_returnable",
                "window_closes_at": None, "already_open": False}

    closes_at = delivered_at + timedelta(hours=policy.window_hours)
    now = datetime.now(timezone.utc)

    # Existing open claim?
    existing = (await session.execute(text("""
        SELECT id, status FROM returns
         WHERE order_id = :oid AND order_module = :m AND customer_id = :cid
           AND status NOT IN ('rejected','refunded','cancelled')
         ORDER BY created_at DESC LIMIT 1
    """), {"oid": order_id, "m": order_module, "cid": customer.id})).fetchone()

    return {
        "can_return": now <= closes_at and existing is None,
        "window_closes_at": closes_at.isoformat(),
        "window_closed": now > closes_at,
        "already_open": existing is not None,
        "existing_return_id": existing.id if existing else None,
        "existing_status": existing.status if existing else None,
        "auto_approve_threshold": float(policy.auto_approve_threshold),
        "threshold_currency": policy.threshold_currency,
    }


# ---------------------------------------------------------------------------
# Create a return
# ---------------------------------------------------------------------------
@customer_router.post("")
async def create_return(
    payload: CreateReturnIn,
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    row, items, partner_id = await _load_order(session, payload.order_module, payload.order_id, customer.id)
    if not row.delivered_at:
        raise HTTPException(400, "order_not_delivered")

    country = getattr(row, "country", None)
    policy = await _resolve_policy(session, payload.order_module, country)
    if not policy or not policy.is_returnable:
        raise HTTPException(400, "not_returnable")

    now = datetime.now(timezone.utc)
    closes_at = row.delivered_at + timedelta(hours=policy.window_hours)
    if now > closes_at:
        raise HTTPException(400, "window_closed")

    # Reject duplicate open claim.
    dup = (await session.execute(text("""
        SELECT id FROM returns
         WHERE order_id = :o AND order_module = :m AND customer_id = :c
           AND status NOT IN ('rejected','refunded','cancelled')
    """), {"o": payload.order_id, "m": payload.order_module, "c": customer.id})).fetchone()
    if dup:
        raise HTTPException(400, "existing_return_open")

    # Evidence rule for photo-mandatory reasons.
    if payload.reason_code in EVIDENCE_REQUIRED_FOR and not payload.evidence_urls:
        raise HTTPException(400, "evidence_required")

    # Compute line amounts.
    item_index = {it.id: it for it in items}
    chosen = payload.items or [
        ReturnItemIn(order_item_id=it.id, qty=it.quantity, reason_code=payload.reason_code)
        for it in items
    ]
    req_total = Decimal("0")
    for ci in chosen:
        src = item_index.get(ci.order_item_id)
        if not src:
            raise HTTPException(400, f"unknown_item:{ci.order_item_id}")
        if ci.qty > src.quantity:
            raise HTTPException(400, f"qty_exceeds_ordered:{ci.order_item_id}")
        req_total += (Decimal(str(src.unit_amount)) * ci.qty)

    currency = getattr(row, "currency", "XOF")
    ret_id = f"ret_{uuid.uuid4().hex[:16]}"
    ret_number = f"R{datetime.now(timezone.utc).strftime('%y%m%d')}{uuid.uuid4().hex[:6].upper()}"
    flagged = await _is_flagged(session, customer.id)

    # Route decision
    auto_eligible = (not flagged
                     and req_total < Decimal(str(policy.auto_approve_threshold))
                     and payload.reason_code in VALID_REASONS)
    if auto_eligible:
        status = "approved"
        auto_approved = True
        approved_amount = req_total
        partner_due = None
    elif partner_id is not None:
        status = "awaiting_partner"
        auto_approved = False
        approved_amount = None
        partner_due = now + timedelta(hours=PARTNER_SLA_HOURS)
    else:
        # No partner side (MART multi-partner, SHOP) → straight to admin for review.
        status = "awaiting_admin"
        auto_approved = False
        approved_amount = None
        partner_due = None

    await session.execute(text("""
        INSERT INTO returns (id, number, order_id, order_module, customer_id, partner_id, status,
                             requested_amount, approved_amount, currency, refund_destination,
                             destination_detail, auto_approved, policy_id,
                             delivered_at_snapshot, partner_due_at)
        VALUES (:id, :num, :oid, :m, :cid, :pid, :st, :req, :appr, :cur, :dest, :dd,
                :auto, :pol, :dsnap, :pdue)
    """), {
        "id": ret_id, "num": ret_number, "oid": payload.order_id, "m": payload.order_module,
        "cid": customer.id, "pid": partner_id, "st": status,
        "req": str(req_total), "appr": str(approved_amount) if approved_amount is not None else None,
        "cur": currency, "dest": payload.refund_destination, "dd": payload.destination_detail,
        "auto": auto_approved, "pol": policy.id, "dsnap": row.delivered_at,
        "pdue": partner_due,
    })

    # Items
    for ci in chosen:
        src = item_index[ci.order_item_id]
        unit = Decimal(str(src.unit_amount))
        await session.execute(text("""
            INSERT INTO return_items (id, return_id, order_item_id, name_snapshot, qty, unit_amount,
                                      line_amount, reason_code, reason_text)
            VALUES (:id, :rid, :oiid, :nm, :q, :u, :l, :rc, :rt)
        """), {
            "id": f"rit_{uuid.uuid4().hex[:16]}", "rid": ret_id, "oiid": ci.order_item_id,
            "nm": src.name, "q": ci.qty, "u": str(unit), "l": str(unit * ci.qty),
            "rc": ci.reason_code or payload.reason_code, "rt": ci.reason_text,
        })

    # Evidence
    for url in payload.evidence_urls:
        await session.execute(text("""
            INSERT INTO return_evidence (id, return_id, kind, url)
            VALUES (:id, :rid, 'photo', :u)
        """), {"id": f"rev_{uuid.uuid4().hex[:16]}", "rid": ret_id, "u": url})
    if payload.reason_text:
        await session.execute(text("""
            INSERT INTO return_evidence (id, return_id, kind, note)
            VALUES (:id, :rid, 'note', :n)
        """), {"id": f"rev_{uuid.uuid4().hex[:16]}", "rid": ret_id, "n": payload.reason_text})

    await _audit(session, ret_id, "customer", customer.id, "created",
                 None, status, note=payload.reason_code)

    # Auto-refund execution
    if status == "approved":
        await _execute_refund(session, ret_id, customer.id, approved_amount, currency,
                              payload.refund_destination, auto=True)
        # Refresh status for the response — wallet refund flips to 'refunded',
        # original method flips to 'approved_pending_payout'.
        final = (await session.execute(text("SELECT status FROM returns WHERE id = :id"),
                                       {"id": ret_id})).fetchone()
        status = final.status

    await session.commit()
    return {"id": ret_id, "number": ret_number, "status": status,
            "auto_approved": auto_approved,
            "requested_amount": float(req_total),
            "approved_amount": float(approved_amount) if approved_amount is not None else None}


async def _execute_refund(session: AsyncSession, return_id: str, customer_id: str,
                          amount: Decimal, currency: str, destination: str, auto: bool):
    """Finalise a refund — wallet credit now, original method marked for admin payout."""
    if destination == "wallet":
        await _credit_wallet(session, customer_id, amount, currency,
                             source_id=return_id, note=f"Refund {return_id}")
        await session.execute(text("""
            UPDATE returns SET status = 'refunded', closed_at = now(),
                               approved_amount = :a
             WHERE id = :id
        """), {"a": str(amount), "id": return_id})
        await _audit(session, return_id, "system", None, "wallet_refunded",
                     "approved", "refunded", f"{amount} {currency}")
    else:  # original
        await session.execute(text("""
            UPDATE returns SET status = 'approved_pending_payout', approved_amount = :a
             WHERE id = :id
        """), {"a": str(amount), "id": return_id})
        await _audit(session, return_id, "system", None, "pending_payout",
                     "approved", "approved_pending_payout",
                     "Awaiting manual gateway payout")


# ---------------------------------------------------------------------------
# Customer: list + detail + cancel
# ---------------------------------------------------------------------------
@customer_router.get("")
async def list_my_returns(
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    rows = (await session.execute(text(f"""
        SELECT * FROM returns
         WHERE customer_id = :cid
         { 'AND status = :st' if status else '' }
         ORDER BY created_at DESC LIMIT 100
    """), {"cid": customer.id, **({"st": status} if status else {})})).fetchall()
    return {"items": [_row_dict(r) for r in rows]}


@customer_router.get("/{return_id}")
async def get_my_return(
    return_id: str,
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    r = (await session.execute(text(
        "SELECT * FROM returns WHERE id = :id AND customer_id = :cid"
    ), {"id": return_id, "cid": customer.id})).fetchone()
    if not r:
        raise HTTPException(404, "return_not_found")
    items = (await session.execute(text(
        "SELECT * FROM return_items WHERE return_id = :id"
    ), {"id": return_id})).fetchall()
    evidence = (await session.execute(text(
        "SELECT * FROM return_evidence WHERE return_id = :id ORDER BY created_at"
    ), {"id": return_id})).fetchall()
    audit = (await session.execute(text(
        "SELECT * FROM return_audit WHERE return_id = :id ORDER BY created_at"
    ), {"id": return_id})).fetchall()
    return {
        "return":   _row_dict(r),
        "items":    [_row_dict(x) for x in items],
        "evidence": [_row_dict(x) for x in evidence],
        "audit":    [_row_dict(x) for x in audit],
    }


@customer_router.post("/{return_id}/cancel")
async def cancel_my_return(
    return_id: str,
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    r = (await session.execute(text(
        "SELECT status FROM returns WHERE id = :id AND customer_id = :cid"
    ), {"id": return_id, "cid": customer.id})).fetchone()
    if not r:
        raise HTTPException(404, "return_not_found")
    if r.status not in ("awaiting_partner", "awaiting_admin"):
        raise HTTPException(400, "cannot_cancel_in_state")
    await session.execute(text(
        "UPDATE returns SET status = 'cancelled', closed_at = now() WHERE id = :id"
    ), {"id": return_id})
    await _audit(session, return_id, "customer", customer.id, "cancelled",
                 r.status, "cancelled")
    await session.commit()
    return {"status": "cancelled"}


# ---------------------------------------------------------------------------
# Partner side (FOOD): list + decide
# ---------------------------------------------------------------------------
@partner_router.get("")
async def list_partner_returns(
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    partner = Depends(get_current_food_partner),
):
    rid = partner.restaurant_id
    rows = (await session.execute(text(f"""
        SELECT * FROM returns WHERE partner_id = :rid
         { 'AND status = :st' if status else '' }
         ORDER BY created_at DESC LIMIT 100
    """), {"rid": rid, **({"st": status} if status else {})})).fetchall()
    return {"restaurant_id": rid, "items": [_row_dict(r) for r in rows]}


class PartnerDecisionIn(BaseModel):
    decision: Literal["approve", "partial", "dispute", "reject"]
    approved_amount: Optional[float] = None
    reason: Optional[str] = None


@partner_router.post("/{return_id}/decision")
async def partner_decide(
    return_id: str,
    payload: PartnerDecisionIn,
    session: AsyncSession = Depends(get_session),
    partner = Depends(get_current_food_partner),
):
    rid = partner.restaurant_id
    r = (await session.execute(text(
        "SELECT * FROM returns WHERE id = :id AND partner_id = :rid"
    ), {"id": return_id, "rid": rid})).fetchone()
    if not r:
        raise HTTPException(404, "return_not_found")
    if r.status != "awaiting_partner":
        raise HTTPException(400, "not_awaiting_partner")

    if payload.decision in ("partial", "reject") and not payload.reason:
        raise HTTPException(400, "reason_required")

    now = datetime.now(timezone.utc)
    if payload.decision == "approve":
        new_status = "approved"
        approved = Decimal(str(r.requested_amount))
    elif payload.decision == "partial":
        if payload.approved_amount is None:
            raise HTTPException(400, "approved_amount_required")
        if payload.approved_amount <= 0 or payload.approved_amount > float(r.requested_amount):
            raise HTTPException(400, "invalid_approved_amount")
        new_status = "partial_approved"
        approved = Decimal(str(payload.approved_amount))
    elif payload.decision == "dispute":
        new_status = "awaiting_admin"
        approved = None
    else:  # reject
        new_status = "rejected"
        approved = Decimal("0")

    await session.execute(text("""
        UPDATE returns SET status = :st, partner_decision = :pd, partner_decision_reason = :pr,
                           partner_decided_at = :now,
                           approved_amount = COALESCE(:appr, approved_amount)
         WHERE id = :id
    """), {"st": new_status, "pd": payload.decision, "pr": payload.reason, "now": now,
           "appr": str(approved) if approved is not None else None, "id": return_id})
    await _audit(session, return_id, "partner", partner.id,
                 f"decision_{payload.decision}", r.status, new_status,
                 payload.reason or "")

    if new_status in ("approved", "partial_approved"):
        await _execute_refund(session, return_id, r.customer_id, approved, r.currency,
                              r.refund_destination, auto=False)
    elif new_status == "rejected":
        await session.execute(text(
            "UPDATE returns SET closed_at = now() WHERE id = :id"
        ), {"id": return_id})

    await session.commit()
    return {"status": new_status}


# ---------------------------------------------------------------------------
# Admin side
# ---------------------------------------------------------------------------
@admin_router.get("")
async def admin_list_returns(
    status: Optional[str] = None,
    module: Optional[str] = None,
    customer_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _admin= Depends(require_admin),
):
    where = ["1=1"]
    params = {}
    if status: where.append("status = :st"); params["st"] = status
    if module: where.append("order_module = :m"); params["m"] = module
    if customer_id: where.append("customer_id = :c"); params["c"] = customer_id
    rows = (await session.execute(text(f"""
        SELECT * FROM returns WHERE {' AND '.join(where)}
         ORDER BY created_at DESC LIMIT 200
    """), params)).fetchall()
    return {"items": [_row_dict(r) for r in rows]}


class AdminDecisionIn(BaseModel):
    decision: Literal["approve", "partial", "reject"]
    approved_amount: Optional[float] = None
    reason: Optional[str] = None


@admin_router.post("/{return_id}/decision")
async def admin_decide(
    return_id: str,
    payload: AdminDecisionIn,
    session: AsyncSession = Depends(get_session),
    admin= Depends(require_admin),
):
    r = (await session.execute(text("SELECT * FROM returns WHERE id = :id"),
                                {"id": return_id})).fetchone()
    if not r:
        raise HTTPException(404, "return_not_found")
    if r.status in ("refunded", "cancelled"):
        raise HTTPException(400, "already_closed")

    if payload.decision in ("partial", "reject") and not payload.reason:
        raise HTTPException(400, "reason_required")

    if payload.decision == "approve":
        new_status = "approved"
        approved = Decimal(str(r.requested_amount))
    elif payload.decision == "partial":
        if payload.approved_amount is None or payload.approved_amount <= 0 \
                or payload.approved_amount > float(r.requested_amount):
            raise HTTPException(400, "invalid_approved_amount")
        new_status = "partial_approved"
        approved = Decimal(str(payload.approved_amount))
    else:
        new_status = "rejected"
        approved = Decimal("0")

    await session.execute(text("""
        UPDATE returns SET status = :st, admin_decision = :d, admin_decision_reason = :reason,
                           admin_decided_at = now(),
                           approved_amount = :appr
         WHERE id = :id
    """), {"st": new_status, "d": payload.decision, "reason": payload.reason,
           "appr": str(approved), "id": return_id})
    await _audit(session, return_id, "admin", admin.id, f"decision_{payload.decision}",
                 r.status, new_status, payload.reason or "")

    if new_status in ("approved", "partial_approved"):
        await _execute_refund(session, return_id, r.customer_id, approved, r.currency,
                              r.refund_destination, auto=False)
    else:
        await session.execute(text("UPDATE returns SET closed_at = now() WHERE id = :id"),
                              {"id": return_id})

    await session.commit()
    return {"status": new_status}


@admin_router.post("/escalate-stale")
async def admin_escalate_stale(
    session: AsyncSession = Depends(get_session),
    _admin= Depends(require_admin),
):
    """Move partner-stale cases to the admin queue. Safe to call repeatedly."""
    rows = (await session.execute(text("""
        UPDATE returns SET status = 'awaiting_admin', escalated_at = now()
         WHERE status = 'awaiting_partner' AND partner_due_at < now()
     RETURNING id
    """))).fetchall()
    for r in rows:
        await _audit(session, r.id, "system", None, "sla_escalation",
                     "awaiting_partner", "awaiting_admin",
                     "Partner SLA expired")
    await session.commit()
    return {"escalated": len(rows)}


# ---- Admin: customer flags
class CustomerFlagIn(BaseModel):
    risk_level: Literal["review", "block"] = "review"
    reason: Optional[str] = None


@admin_router.post("/flag/{customer_id}")
async def admin_flag_customer(
    customer_id: str,
    payload: CustomerFlagIn,
    session: AsyncSession = Depends(get_session),
    admin= Depends(require_admin),
):
    await session.execute(text("""
        INSERT INTO customer_refund_flags (customer_id, risk_level, reason, flagged_by)
        VALUES (:cid, :rl, :rs, :by)
        ON CONFLICT (customer_id) DO UPDATE
          SET risk_level = EXCLUDED.risk_level,
              reason     = EXCLUDED.reason,
              flagged_by = EXCLUDED.flagged_by,
              updated_at = now()
    """), {"cid": customer_id, "rl": payload.risk_level,
           "rs": payload.reason, "by": admin.id})
    await session.commit()
    return {"status": "flagged"}


@admin_router.delete("/flag/{customer_id}")
async def admin_unflag_customer(
    customer_id: str,
    session: AsyncSession = Depends(get_session),
    _admin= Depends(require_admin),
):
    await session.execute(text(
        "DELETE FROM customer_refund_flags WHERE customer_id = :cid"
    ), {"cid": customer_id})
    await session.commit()
    return {"status": "unflagged"}


# ---------------------------------------------------------------------------
# Policy CRUD
# ---------------------------------------------------------------------------
class PolicyIn(BaseModel):
    module: Literal["food", "mart", "shop"]
    country: Optional[str] = None
    category_id: Optional[str] = None
    product_id: Optional[str] = None
    window_hours: int = Field(..., ge=1)
    auto_approve_threshold: float = Field(..., ge=0)
    threshold_currency: str = "XOF"
    is_returnable: bool = True
    notes: Optional[str] = None


@policy_router.get("")
async def list_policies(
    session: AsyncSession = Depends(get_session),
    _admin= Depends(require_admin),
):
    rows = (await session.execute(text(
        "SELECT * FROM return_policies ORDER BY module, country NULLS FIRST, category_id, product_id"
    ))).fetchall()
    return {"items": [_row_dict(r) for r in rows]}


@policy_router.post("")
async def upsert_policy(
    payload: PolicyIn,
    session: AsyncSession = Depends(get_session),
    _admin= Depends(require_admin),
):
    await session.execute(text("""
        INSERT INTO return_policies (id, module, country, category_id, product_id, window_hours,
                                     auto_approve_threshold, threshold_currency, is_returnable, notes)
        VALUES (:id, :m, :c, :cat, :p, :wh, :thr, :cur, :ret, :n)
        ON CONFLICT (module, COALESCE(country,''), COALESCE(category_id,''), COALESCE(product_id,''))
        DO UPDATE SET window_hours = EXCLUDED.window_hours,
                      auto_approve_threshold = EXCLUDED.auto_approve_threshold,
                      threshold_currency = EXCLUDED.threshold_currency,
                      is_returnable = EXCLUDED.is_returnable,
                      notes = EXCLUDED.notes,
                      updated_at = now()
    """), {"id": f"pol_{uuid.uuid4().hex[:12]}", "m": payload.module,
           "c": payload.country, "cat": payload.category_id, "p": payload.product_id,
           "wh": payload.window_hours, "thr": payload.auto_approve_threshold,
           "cur": payload.threshold_currency, "ret": payload.is_returnable,
           "n": payload.notes})
    await session.commit()
    return {"status": "ok"}


@policy_router.delete("/{policy_id}")
async def delete_policy(
    policy_id: str,
    session: AsyncSession = Depends(get_session),
    _admin= Depends(require_admin),
):
    await session.execute(text(
        "DELETE FROM return_policies WHERE id = :id AND id NOT LIKE 'pol_default_%'"
    ), {"id": policy_id})
    await session.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Admin: single return detail (reuses customer getter but without ownership)
# ---------------------------------------------------------------------------
@admin_router.get("/{return_id}")
async def admin_get_return(
    return_id: str,
    session: AsyncSession = Depends(get_session),
    _admin= Depends(require_admin),
):
    r = (await session.execute(text("SELECT * FROM returns WHERE id = :id"),
                                {"id": return_id})).fetchone()
    if not r:
        raise HTTPException(404, "return_not_found")
    items    = (await session.execute(text("SELECT * FROM return_items WHERE return_id = :id"), {"id": return_id})).fetchall()
    evidence = (await session.execute(text("SELECT * FROM return_evidence WHERE return_id = :id ORDER BY created_at"), {"id": return_id})).fetchall()
    audit    = (await session.execute(text("SELECT * FROM return_audit WHERE return_id = :id ORDER BY created_at"), {"id": return_id})).fetchall()
    flag     = (await session.execute(text("SELECT * FROM customer_refund_flags WHERE customer_id = :c"), {"c": r.customer_id})).fetchone()
    return {
        "return":   _row_dict(r),
        "items":    [_row_dict(x) for x in items],
        "evidence": [_row_dict(x) for x in evidence],
        "audit":    [_row_dict(x) for x in audit],
        "flag":     _row_dict(flag) if flag else None,
    }
