"""Receiving / Put-away and Stock-count ORM models — Batch 2 of Inventory Control Tower."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    TIMESTAMP, Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, TimestampMixin, new_id


RECEIPT_STATUSES = ("draft", "received", "verified", "put_away", "completed", "cancelled")
RECEIPT_SOURCES  = ("purchase", "transfer", "return", "opening")
COUNT_STATUSES   = ("draft", "counting", "reconciling", "completed", "cancelled")
COUNT_SCOPES     = ("full", "zone", "aisle", "rack", "shelf", "bin", "product")


class PartnerReceipt(Base):
    __tablename__ = "partner_receipts"
    __table_args__ = (
        UniqueConstraint("partner_id", "code", name="uq_partner_receipts_code"),
        Index("ix_partner_receipts_partner", "partner_id", "status"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in RECEIPT_STATUSES)})",
            name="ck_partner_receipts_status",
        ),
        CheckConstraint(
            f"source_type IN ({','.join(repr(s) for s in RECEIPT_SOURCES)})",
            name="ck_partner_receipts_source",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rcpt"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False, default="purchase", server_default="purchase")
    source_ref: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft")
    supplier_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    supplier_ref:  Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id:   Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_by_role: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    created_at:   Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    verified_at:  Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class PartnerReceiptItem(Base, TimestampMixin):
    __tablename__ = "partner_receipt_items"
    __table_args__ = (
        Index("ix_receipt_items_receipt", "receipt_id"),
        CheckConstraint("expected_qty >= 0", name="ck_receipt_items_expected_nonneg"),
        CheckConstraint("received_qty >= 0", name="ck_receipt_items_received_nonneg"),
        CheckConstraint("put_away_qty >= 0", name="ck_receipt_items_putaway_nonneg"),
        CheckConstraint("damaged_qty  >= 0", name="ck_receipt_items_damaged_nonneg"),
        CheckConstraint("put_away_qty <= received_qty", name="ck_receipt_items_putaway_le_received"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rli"))
    receipt_id: Mapped[str] = mapped_column(String, ForeignKey("partner_receipts.id", ondelete="CASCADE"), nullable=False)
    partner_product_id: Mapped[str] = mapped_column(String, ForeignKey("partner_products.id"), nullable=False)
    expected_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    received_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    put_away_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    damaged_qty:  Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("warehouse_bins.id"), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class PartnerStockCount(Base):
    __tablename__ = "partner_stock_counts"
    __table_args__ = (
        UniqueConstraint("partner_id", "code", name="uq_partner_counts_code"),
        Index("ix_partner_counts_partner", "partner_id", "status"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in COUNT_STATUSES)})",
            name="ck_partner_counts_status",
        ),
        CheckConstraint(
            f"scope IN ({','.join(repr(s) for s in COUNT_SCOPES)})",
            name="ck_partner_counts_scope",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cnt"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default="full")
    scope_ref_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id:   Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_by_role: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    approved_by_id:  Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at:   Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class PartnerStockCountLine(Base, TimestampMixin):
    __tablename__ = "partner_stock_count_lines"
    __table_args__ = (Index("ix_count_lines_count", "count_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cnl"))
    count_id: Mapped[str] = mapped_column(String, ForeignKey("partner_stock_counts.id", ondelete="CASCADE"), nullable=False)
    partner_product_id: Mapped[str] = mapped_column(String, ForeignKey("partner_products.id"), nullable=False)
    bin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("warehouse_bins.id"), nullable=True)
    expected_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    counted_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    variance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    adjustment_created: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    movement_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partner_stock_movements.id"), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
