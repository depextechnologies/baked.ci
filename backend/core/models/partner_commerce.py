"""Partner commerce — Products, Orders (partner-linked), Wallet.

Slice 5/6/7 of MARTbakēd MVP. Kept in a separate file so `partners.py` stays
focused on identity/warehouse hierarchy.

Design notes
------------
* **PartnerProduct** implements the *hybrid* catalog: a partner can either
  link an existing MART master SKU (`source="master"`, `master_product_id`
  set) or create their own custom SKU (`source="custom"`, own name/brand/
  image/price/etc). Either way, the partner sets `partner_price` and
  `stock_qty` — those are always partner-scoped.

* **PartnerOrder** is a lightweight overlay table that links a customer
  `orders.id` to a `partners.id` at the moment the partner accepts /
  fulfils the order. We deliberately do NOT add a nullable `partner_id`
  column to `orders` — the customer schema stays unchanged, and this
  overlay is 100% additive.

* **PartnerWallet** + **PartnerWalletTxn** — one wallet per partner,
  ledger-style credits/debits. `balance` is a materialised sum kept in sync
  by the endpoints (guarded by row-level SELECT-for-UPDATE at write time).
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, TimestampMixin, new_id


# ============================================================================
#                              Products (Slice 5)
# ============================================================================

class PartnerProduct(Base, TimestampMixin):
    """A SKU sold by a partner — either a link to a MART master product,
    or a partner-owned custom SKU."""

    __tablename__ = "partner_products"
    __table_args__ = (
        CheckConstraint("source IN ('master','custom')", name="ck_partner_products_source"),
        # A partner can only link a given master SKU once (avoids dupes).
        UniqueConstraint("partner_id", "master_product_id", name="uq_partner_products_master"),
        Index("ix_partner_products_partner_active", "partner_id", "is_active"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("psku"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False)  # master | custom

    # For source=master: pointer into the shared MART catalog.
    master_product_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("mart_products.id"), nullable=True,
    )

    # For source=custom: everything is partner-owned.
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    image: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category_slug: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    subcategory_slug: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Always partner-scoped:
    sku_code: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)  # internal partner SKU code
    partner_price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="XOF")
    stock_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    # Phase 2: approval workflow for partner-submitted products
    approval_status: Mapped[str] = mapped_column(String(32), nullable=False, default="approved", server_default="approved")
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    reviewed_by_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)


# ============================================================================
#                              Orders (Slice 6)
# ============================================================================

PARTNER_ORDER_STATUSES = (
    "new",           # just landed with partner
    "accepted",      # partner accepted, starting to pack
    "packing",       # partner is picking/packing items
    "ready",         # ready for driver / customer pickup
    "handed_off",    # picked up by driver
    "completed",     # customer received (mirrors orders.status=delivered)
    "cancelled",
)


class PartnerOrder(Base, TimestampMixin):
    """Overlay linking a customer order to the partner that fulfils some or all of it.

    A single customer order can have multiple partner_orders when the cart is
    routed across stores — the customer still sees ONE order/invoice/delivery
    (see `Order.consolidation_status` for the dispatch state machine).
    """

    __tablename__ = "partner_orders"
    __table_args__ = (
        # (order_id, partner_id) is unique — one slice per partner per customer order.
        UniqueConstraint("order_id", "partner_id", name="uq_partner_orders_order_partner"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in PARTNER_ORDER_STATUSES)})",
            name="ck_partner_orders_status",
        ),
        Index("ix_partner_orders_partner_status", "partner_id", "status"),
        Index("ix_partner_orders_partner_created", "partner_id", "created_at"),
        Index("ix_partner_orders_order", "order_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("po"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    order_id: Mapped[str] = mapped_column(String, ForeignKey("orders.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="new")
    # This partner's slice of the customer's total order (sum of their line_totals).
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    accepted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    ready_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    handed_off_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class PartnerOrderPick(Base, TimestampMixin):
    """Per-line pick progress for the Picker Screen.

    One row per (partner_order_id, order_item_id). Upserted by every scan or
    manual quantity change. Used to drive the tablet Picker UI and to enforce
    "all items picked" before an order can transition packing → ready.
    """

    __tablename__ = "partner_order_picks"
    __table_args__ = (
        UniqueConstraint("partner_order_id", "order_item_id", name="uq_partner_order_picks_item"),
        Index("ix_partner_order_picks_partner_order", "partner_order_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pck"))
    partner_order_id: Mapped[str] = mapped_column(String, ForeignKey("partner_orders.id", ondelete="CASCADE"), nullable=False)
    order_item_id: Mapped[str] = mapped_column(String, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False)
    picked_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    picker_staff_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    picker_owner_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    first_picked_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    last_picked_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


# ============================================================================
#                              Wallet (Slice 7)
# ============================================================================

class PartnerWallet(Base, TimestampMixin):
    """One wallet per partner. Balance is a materialised sum of transactions."""

    __tablename__ = "partner_wallets"
    __table_args__ = (
        UniqueConstraint("partner_id", name="uq_partner_wallets_partner"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("wlt"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    balance: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="XOF")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")


PARTNER_WALLET_TX_KINDS = (
    "credit_order",       # order revenue credited
    "debit_commission",   # platform commission taken
    "debit_payout",       # payout / withdrawal to partner bank
    "credit_topup",       # partner adds funds (mocked Stripe / mobile money)
    "credit_adjustment",  # admin adjustment (+)
    "debit_adjustment",   # admin adjustment (−)
)


class PartnerWalletTxn(Base):
    """Ledger row — always references a wallet. Immutable once written."""

    __tablename__ = "partner_wallet_txns"
    __table_args__ = (
        CheckConstraint(
            f"kind IN ({','.join(repr(k) for k in PARTNER_WALLET_TX_KINDS)})",
            name="ck_partner_wallet_txns_kind",
        ),
        Index("ix_partner_wallet_txns_wallet_created", "wallet_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("wtx"))
    wallet_id: Mapped[str] = mapped_column(String, ForeignKey("partner_wallets.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    # Signed amount: credits positive, debits negative. Enforced by endpoint.
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    balance_after: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    description: Mapped[str] = mapped_column(String(400), nullable=False)
    order_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("orders.id"), nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)  # e.g. Stripe pi_...
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
