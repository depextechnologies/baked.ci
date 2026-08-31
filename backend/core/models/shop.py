"""SHOPbakēd — ORM models (Slice 1: Foundation, 2026-02).

SHOPbakēd is the marketplace module for fashion, electronics, home goods and
similar variant-heavy categories. It's fully isolated from MARTbakēd via
separate tables (shop_brands, shop_categories, shop_subcategories,
shop_products, shop_variants) and its own `module="shop"` discriminator on
products.

Suppliers are *shared* across modules — a single `suppliers.modules` JSONB
array (see 0039 migration) gates whether a supplier can operate under SHOP.

Later slices will layer catalogue seed, dynamic attributes, seller variant
editor, admin approvals and customer storefront on top of these foundations.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
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

from core.models.base import AuditMixin, Base, TimestampMixin, new_id


SHOP_PRODUCT_STATUSES = ("draft", "pending_review", "active", "archived", "rejected")
SHOP_VARIANT_CONDITIONS = ("new", "refurbished", "used_like_new", "used_good", "used_fair")


class ShopBrand(Base, TimestampMixin):
    __tablename__ = "shop_brands"
    __table_args__ = (
        UniqueConstraint("slug", "country", name="uq_shop_brands_slug_country"),
        Index("ix_shop_brands_active", "country", "is_active"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shpbrn"))
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


class ShopCategory(Base, AuditMixin):
    __tablename__ = "shop_categories"
    __table_args__ = (
        UniqueConstraint("slug", "country", name="uq_shop_categories_slug_country"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shpcat"))
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    name_fr: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    image: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class ShopSubcategory(Base, TimestampMixin):
    __tablename__ = "shop_subcategories"
    __table_args__ = (
        UniqueConstraint("slug", "category_id", name="uq_shop_subcategories_slug_category"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shpsub"))
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    category_id: Mapped[str] = mapped_column(String, ForeignKey("shop_categories.id", ondelete="CASCADE"), nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    name_fr: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    image: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class ShopProduct(Base, AuditMixin):
    """Master catalogue entry for a variant-parent product on SHOP.

    A product has 1..N variants (`shop_variants`) — the parent holds shared
    metadata (title, description, images, brand, category) while variants
    hold sku/price/stock/attribute-set combinations.
    """
    __tablename__ = "shop_products"
    __table_args__ = (
        Index("ix_shop_products_country_status", "country", "status"),
        Index("ix_shop_products_supplier", "supplier_id"),
        Index("ix_shop_products_subcategory", "subcategory_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shpprd"))
    title: Mapped[str] = mapped_column(String(400), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    module: Mapped[str] = mapped_column(String(16), nullable=False, default="shop", server_default="shop")
    supplier_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    brand_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("shop_brands.id"), nullable=True)
    category_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("shop_categories.id"), nullable=True)
    subcategory_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("shop_subcategories.id"), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    images: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # Dynamic attribute snapshot at parent-level (shared across variants).
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", server_default="draft")
    published_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class ShopVariant(Base, TimestampMixin):
    """A specific SKU (colour/size/condition/etc.) of a `ShopProduct`."""
    __tablename__ = "shop_variants"
    __table_args__ = (
        UniqueConstraint("product_id", "sku", name="uq_shop_variants_product_sku"),
        Index("ix_shop_variants_product", "product_id", "is_active"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shpvar"))
    product_id: Mapped[str] = mapped_column(String, ForeignKey("shop_products.id", ondelete="CASCADE"), nullable=False)
    sku: Mapped[str] = mapped_column(String(120), nullable=False)
    title_suffix: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    compare_at_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="XOF", server_default="XOF")
    stock_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    condition: Mapped[str] = mapped_column(String(24), nullable=False, default="new", server_default="new")
    # Variant-level attribute overrides (e.g. {"colour": "red", "size": "M"}).
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    images: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


class ShopCategoryAttribute(Base):
    """SHOP attribute assignment / override at category or subcategory scope.

    Mirrors `MartCategoryAttribute` but with FKs into the SHOP hierarchy
    (`shop_categories` / `shop_subcategories`). Attribute definitions
    remain in the shared `mart_attributes` table; SHOP definitions carry
    `module="shop"` there.

    Resolution rule (parent ∪ subcategory with subcategory-wins overrides)
    is implemented in `modules.shop.attributes_resolver.resolve_attributes`.
    """
    __tablename__ = "shop_category_attributes"
    __table_args__ = (
        UniqueConstraint("category_id", "subcategory_id", "attribute_id",
                         name="uq_shop_cat_attr_scope"),
        Index("ix_shop_cat_attr_cat", "category_id"),
        Index("ix_shop_cat_attr_sub", "subcategory_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shpcatattr"))
    category_id: Mapped[str] = mapped_column(
        String, ForeignKey("shop_categories.id", ondelete="CASCADE"), nullable=False,
    )
    subcategory_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("shop_subcategories.id", ondelete="CASCADE"), nullable=True,
    )
    attribute_id: Mapped[str] = mapped_column(
        String, ForeignKey("mart_attributes.id", ondelete="CASCADE"), nullable=False,
    )
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    customer_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    supplier_editable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class ShopCartItem(Base):
    """A SHOP variant sitting in a customer's cart.

    Kept in a separate table from MART's `cart_items` because MART's row
    holds a hard FK to `mart_products.id`. Sharing the parent `carts` row
    means a single active cart can mix MART products + SHOP variants, and
    Slice 8 checkout can split them into per-module fulfilment orders.
    """
    __tablename__ = "shop_cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "variant_id", name="uq_shop_cart_items_cart_variant"),
        Index("ix_shop_cart_items_cart", "cart_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shpci"))
    cart_id: Mapped[str] = mapped_column(
        String, ForeignKey("carts.id", ondelete="CASCADE"), nullable=False,
    )
    variant_id: Mapped[str] = mapped_column(
        String, ForeignKey("shop_variants.id", ondelete="CASCADE"), nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    added_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False,
    )


SHOP_ORDER_STATUSES = (
    "pending_payment",  # waiting for Stripe / cash pledge
    "paid",             # payment cleared
    "packing",          # supplier prepping
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
)


class ShopOrder(Base):
    """A confirmed SHOP fulfilment order — one per customer, per checkout."""
    __tablename__ = "shop_orders"
    __table_args__ = (
        UniqueConstraint("number", name="uq_shop_orders_number"),
        Index("ix_shop_orders_customer", "customer_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shpord"))
    number: Mapped[str] = mapped_column(String, nullable=False)
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), nullable=False)
    module: Mapped[str] = mapped_column(String(16), nullable=False, default="shop", server_default="shop")
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending_payment", server_default="pending_payment")
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    delivery_fee: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending", server_default="pending")
    payment_provider: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    payment_provider_ref: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    delivery_address: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    placed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ShopOrderItem(Base):
    __tablename__ = "shop_order_items"
    __table_args__ = (
        Index("ix_shop_order_items_order", "order_id"),
        Index("ix_shop_order_items_supplier", "supplier_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shpoi"))
    order_id: Mapped[str] = mapped_column(String, ForeignKey("shop_orders.id", ondelete="CASCADE"), nullable=False)
    variant_id: Mapped[str] = mapped_column(String, ForeignKey("shop_variants.id"), nullable=False)
    product_id: Mapped[str] = mapped_column(String, ForeignKey("shop_products.id"), nullable=False)
    supplier_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    sku: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(400), nullable=False)
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    unit_price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

