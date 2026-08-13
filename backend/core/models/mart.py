"""Mart (grocery) module: catalog, carts, orders, rewards, support tickets, AI search log."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    ARRAY,
    TIMESTAMP,
    Boolean,
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from decimal import Decimal

from core.models.base import AuditMixin, Base, OrderStatus, PaymentStatus, TicketCategory, TicketPriority, TicketStatus, new_id


class MartCategory(Base, AuditMixin):
    __tablename__ = "mart_categories"
    __table_args__ = (UniqueConstraint("slug", "country", name="uq_mart_categories_slug_country"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cat"))
    slug: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name_en: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name_fr: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    image: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    module: Mapped[str] = mapped_column(String, nullable=False, default="mart")


class MartSubcategory(Base):
    __tablename__ = "mart_subcategories"
    __table_args__ = (UniqueConstraint("slug", "category_id", name="uq_mart_subcategories_slug_category"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("sub"))
    slug: Mapped[str] = mapped_column(String, nullable=False)
    category_id: Mapped[str] = mapped_column(String, ForeignKey("mart_categories.id"), nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name_en: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name_fr: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    image: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    module: Mapped[str] = mapped_column(String, nullable=False, default="mart")
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MartProduct(Base, AuditMixin):
    __tablename__ = "mart_products"
    __table_args__ = (
        UniqueConstraint("name", "country", "module", name="uq_mart_products_name_country_module"),
        Index("ix_mart_products_category_slug_country", "category_slug", "country"),
        # Requires `CREATE EXTENSION pg_trgm` (added explicitly in the initial
        # migration, since autogenerate does not manage extensions).
        Index("ix_mart_products_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
        Index("ix_mart_products_brand_trgm", "brand", postgresql_using="gin", postgresql_ops={"brand": "gin_trgm_ops"}),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("prd"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    module: Mapped[str] = mapped_column(String, nullable=False, default="mart")
    brand: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category_slug: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    subcategory_slug: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    was_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    currency_symbol: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    image: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    images: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    popularity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    badge: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    in_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rating: Mapped[Optional[float]] = mapped_column(Numeric(2, 1), nullable=True)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Phase 2 additions
    sku_code: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    barcode: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    variants: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active", server_default="active")
    brand_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("mart_brands.id"), nullable=True)
    # Phase 1 (Inventory_Prompt v3) — commercial + identity + packaging + storage
    manufacturer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    short_description: Mapped[Optional[str]] = mapped_column(String(280), nullable=True)
    product_type: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    ean_upc: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    tax_hsn_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    batch_tracking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    expiry_tracking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    pack_size: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    net_qty: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 3), nullable=True)
    gross_qty: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 3), nullable=True)
    mrp: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    cost_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    tax_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    storage_requirement: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    temperature_class: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)


class MartOffer(Base):
    __tablename__ = "mart_offers"
    __table_args__ = (UniqueConstraint("title", "country", name="uq_mart_offers_title_country"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("off"))
    title: Mapped[str] = mapped_column(String, nullable=False)
    subtitle: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MartStore(Base):
    __tablename__ = "mart_stores"
    __table_args__ = (UniqueConstraint("name", "country", name="uq_mart_stores_name_country"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("str"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    eta: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    rating: Mapped[Optional[float]] = mapped_column(Numeric(2, 1), nullable=True)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    module: Mapped[str] = mapped_column(String, nullable=False, default="mart")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Cart(Base):
    __tablename__ = "carts"
    __table_args__ = (
        Index("uq_carts_one_active_per_customer", "customer_id", unique=True, postgresql_where="status = 'active'"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cart"))
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("cart_id", "product_id", "module", name="uq_cart_items_cart_product_module"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("ci"))
    cart_id: Mapped[str] = mapped_column(String, ForeignKey("carts.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[str] = mapped_column(String, ForeignKey("mart_products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    module: Mapped[str] = mapped_column(String, nullable=False, default="mart")
    added_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class Order(Base, AuditMixin):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("number", name="uq_orders_number"),
        Index("ix_orders_customer_deleted_created", "customer_id", "deleted_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("ord"))
    number: Mapped[str] = mapped_column(String, nullable=False)
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), nullable=False)
    module: Mapped[str] = mapped_column(String, nullable=False, default="mart")
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    status: Mapped[str] = mapped_column(OrderStatus, nullable=False, default="pending")
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    delivery_fee: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    points_redeemed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_discount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    points_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    # Immutable snapshot of the delivery address at order time — must survive later
    # edits/deletion of the source address, so this is never a live FK.
    address_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source_address_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("customer_addresses.id", ondelete="SET NULL"), nullable=True
    )
    delivery_slot_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    delivery_slot_label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    payment_method: Mapped[str] = mapped_column(String, nullable=False)
    payment_status: Mapped[str] = mapped_column(PaymentStatus, nullable=False, default="pending")
    payment_provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    payment_provider_ref: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Consolidation flow (Phase B — driver dispatch): tracks whether all partner
    # orders are packed and ready for pickup. `not_applicable` = single-partner order
    # (legacy or fully allocated to one partner).
    consolidation_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending", server_default="pending",
    )  # pending | consolidating | ready_for_delivery | dispatched | delivered | not_applicable
    partial_delivery_allowed: Mapped[bool] = mapped_column(default=False, server_default="false")
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rating_comment: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    rated_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("oi"))
    order_id: Mapped[str] = mapped_column(String, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[str] = mapped_column(String, ForeignKey("mart_products.id"), nullable=False)
    # Which partner is fulfilling this item — nullable for pre-routing legacy orders
    # (FK added in a follow-up ALTER to avoid circular import; kept as loose FK string here).
    partner_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partners.id"), nullable=True)
    partner_order_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partner_orders.id", ondelete="SET NULL"), nullable=True)
    partner_product_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partner_products.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    image: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class RewardEntry(Base):
    __tablename__ = "reward_entries"
    __table_args__ = (
        CheckConstraint("kind IN ('earned','redeemed')", name="ck_reward_entries_kind"),
        Index("ix_reward_entries_customer_created", "customer_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rwd"))
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    order_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("orders.id"), nullable=True)
    order_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class SupportTicket(Base, AuditMixin):
    __tablename__ = "support_tickets"
    __table_args__ = (
        UniqueConstraint("number", name="uq_support_tickets_number"),
        Index("ix_support_tickets_customer_deleted_created", "customer_id", "deleted_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("tkt"))
    number: Mapped[str] = mapped_column(String, nullable=False)
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), nullable=False)
    category: Mapped[str] = mapped_column(TicketCategory, nullable=False)
    subject: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(TicketPriority, nullable=False, default="normal")
    order_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("orders.id"), nullable=True)
    attachment_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(TicketStatus, nullable=False, default="open")


class AiExecution(Base):
    __tablename__ = "ai_executions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("ai"))
    feature: Mapped[str] = mapped_column(String, nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    response: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    matched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    customer_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("customers.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
