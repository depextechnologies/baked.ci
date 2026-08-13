"""Catalogue / Inventory phase-2 models.

Adds the ORM layer for:
  - MartBrand
  - PartnerInventory
  - PartnerStockMovement
  - PartnerProductLocation

The columns extended on existing tables (mart_products, partner_products)
are added inline in their originating model files.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, TimestampMixin, new_id


PARTNER_PRODUCT_APPROVAL_STATUSES = (
    "draft", "pending", "approved", "rejected", "changes_requested",
)

STOCK_MOVEMENT_KINDS = (
    "receive", "adjustment_add", "adjustment_remove",
    "reserve", "release", "consume",
    "damage", "expire", "transfer_in", "transfer_out",
    "return_in", "opening_stock",
)


class MartBrand(Base, TimestampMixin):
    __tablename__ = "mart_brands"
    __table_args__ = (
        UniqueConstraint("slug", "country", name="uq_mart_brands_slug_country"),
        Index("ix_mart_brands_country", "country"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("brnd"))
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    logo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


class PartnerInventory(Base, TimestampMixin):
    __tablename__ = "partner_inventory"
    __table_args__ = (
        UniqueConstraint("partner_product_id", "warehouse_id", name="uq_partner_inventory_sku_wh"),
        Index("ix_partner_inventory_partner", "partner_id"),
        Index("ix_partner_inventory_wh", "warehouse_id"),
        CheckConstraint("available_qty >= 0", name="ck_partner_inv_available_nonneg"),
        CheckConstraint("reserved_qty  >= 0", name="ck_partner_inv_reserved_nonneg"),
        CheckConstraint("damaged_qty   >= 0", name="ck_partner_inv_damaged_nonneg"),
        CheckConstraint("expired_qty   >= 0", name="ck_partner_inv_expired_nonneg"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("inv"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    partner_product_id: Mapped[str] = mapped_column(String, ForeignKey("partner_products.id", ondelete="CASCADE"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)
    available_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    reserved_qty: Mapped[int]  = mapped_column(Integer, nullable=False, default=0, server_default="0")
    damaged_qty: Mapped[int]   = mapped_column(Integer, nullable=False, default=0, server_default="0")
    expired_qty: Mapped[int]   = mapped_column(Integer, nullable=False, default=0, server_default="0")
    low_stock_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    last_movement_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class PartnerStockMovement(Base):
    __tablename__ = "partner_stock_movements"
    __table_args__ = (
        Index("ix_stock_mv_partner_created", "partner_id", "created_at"),
        Index("ix_stock_mv_product", "partner_product_id", "created_at"),
        CheckConstraint(
            f"kind IN ({','.join(repr(k) for k in STOCK_MOVEMENT_KINDS)})",
            name="ck_stock_mv_kind",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("mv"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    partner_product_id: Mapped[str] = mapped_column(String, ForeignKey("partner_products.id", ondelete="CASCADE"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)
    bin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("warehouse_bins.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    delta_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    before_qty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    actor_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    order_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("orders.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class PartnerProductLocation(Base, TimestampMixin):
    """Mapping between a partner SKU and one or more physical bin locations.

    A SKU may live in multiple bins (primary + overflow). `is_primary=true`
    marks the location the picker should visit first. Uniqueness enforced
    by a partial unique index (see migration).
    """
    __tablename__ = "partner_product_locations"
    __table_args__ = (
        UniqueConstraint("partner_product_id", "bin_id", name="uq_ppl_sku_bin"),
        Index("ix_ppl_bin", "bin_id"),
        CheckConstraint("quantity_at_location >= 0", name="ck_ppl_qty_nonneg"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("ppl"))
    partner_product_id: Mapped[str] = mapped_column(String, ForeignKey("partner_products.id", ondelete="CASCADE"), nullable=False)
    bin_id: Mapped[str] = mapped_column(String, ForeignKey("warehouse_bins.id", ondelete="CASCADE"), nullable=False)
    quantity_at_location: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
