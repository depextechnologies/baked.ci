"""Replenishment suggestion ORM model — Batch 3a."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    TIMESTAMP, CheckConstraint, ForeignKey, Index, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, TimestampMixin, new_id


REPLENISHMENT_STATUSES = ("suggested", "approved", "dispatched", "received", "cancelled")
REPLENISHMENT_SOURCES  = ("auto", "manual")


class PartnerReplenishment(Base, TimestampMixin):
    """Admin-owned replenishment suggestion for a partner SKU/warehouse."""

    __tablename__ = "partner_replenishments"
    __table_args__ = (
        Index("ix_replen_status",  "status"),
        Index("ix_replen_partner", "partner_id", "status"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in REPLENISHMENT_STATUSES)})",
            name="ck_replen_status",
        ),
        CheckConstraint(
            f"source IN ({','.join(repr(s) for s in REPLENISHMENT_SOURCES)})",
            name="ck_replen_source",
        ),
        CheckConstraint("suggested_qty >= 0", name="ck_replen_suggested_nonneg"),
        CheckConstraint("received_qty  >= 0", name="ck_replen_received_nonneg"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rep"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)
    partner_product_id: Mapped[str] = mapped_column(String, ForeignKey("partner_products.id", ondelete="CASCADE"), nullable=False)

    current_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    suggested_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approved_qty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    received_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="suggested", server_default="suggested")
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="auto", server_default="auto")
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    decided_by_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    movement_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partner_stock_movements.id"), nullable=True)

    approved_at:   Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    received_at:   Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
