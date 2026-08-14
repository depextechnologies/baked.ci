"""Purchase Orders — ORM models (Phase 3)."""
from __future__ import annotations
from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    TIMESTAMP, Date, ForeignKey, Index, Integer, Numeric, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, TimestampMixin, new_id


PO_STATUSES = (
    "draft", "submitted", "acknowledged", "shipped",
    "partially_received", "received", "cancelled",
)

PO_ACTOR_KINDS = (
    "partner_owner", "partner_staff", "supplier", "admin", "system",
)


class PurchaseOrder(Base, TimestampMixin):
    __tablename__ = "purchase_orders"
    __table_args__ = (
        Index("ix_po_partner_status", "partner_id", "status"),
        Index("ix_po_supplier_status", "supplier_id", "status"),
        Index("ix_po_warehouse", "warehouse_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("po"))
    po_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id"), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", server_default="draft")
    expected_delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subtotal: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0, server_default="0")
    tax_total: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0, server_default="0")
    grand_total: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0, server_default="0")
    created_by_partner_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partners.id"), nullable=True)
    created_by_staff_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partner_staff.id"), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    shipped_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    received_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class PurchaseOrderLine(Base, TimestampMixin):
    __tablename__ = "purchase_order_lines"
    __table_args__ = (Index("ix_po_lines_po", "purchase_order_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pol"))
    purchase_order_id: Mapped[str] = mapped_column(String, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    supplier_product_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("supplier_products.id"), nullable=True)
    master_product_id: Mapped[str] = mapped_column(String, ForeignKey("mart_products.id"), nullable=False)
    supplier_sku: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    product_name: Mapped[str] = mapped_column(String(400), nullable=False)
    qty_ordered: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_received: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    unit_cost: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    tax_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0, server_default="0")
    line_subtotal: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0, server_default="0")
    line_tax: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0, server_default="0")
    line_total: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0, server_default="0")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class PurchaseOrderReceipt(Base):
    __tablename__ = "purchase_order_receipts"
    __table_args__ = (Index("ix_po_receipts_po", "purchase_order_id", "received_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("por"))
    purchase_order_id: Mapped[str] = mapped_column(String, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    received_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    received_by_partner_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partners.id"), nullable=True)
    received_by_staff_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partner_staff.id"), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class PurchaseOrderReceiptLine(Base):
    __tablename__ = "purchase_order_receipt_lines"
    __table_args__ = (Index("ix_po_receipt_lines_receipt", "receipt_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("porl"))
    receipt_id: Mapped[str] = mapped_column(String, ForeignKey("purchase_order_receipts.id", ondelete="CASCADE"), nullable=False)
    po_line_id: Mapped[str] = mapped_column(String, ForeignKey("purchase_order_lines.id", ondelete="CASCADE"), nullable=False)
    qty_received: Mapped[int] = mapped_column(Integer, nullable=False)
    movement_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class PurchaseOrderAudit(Base):
    __tablename__ = "purchase_order_audit"
    __table_args__ = (Index("ix_po_audit_po", "purchase_order_id", "created_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("poaud"))
    purchase_order_id: Mapped[str] = mapped_column(String, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    actor_kind: Mapped[str] = mapped_column(String(24), nullable=False)
    actor_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    actor_label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    to_status: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
