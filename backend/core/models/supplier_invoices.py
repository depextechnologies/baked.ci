"""Supplier invoice ORM models — Phase 5.

Extends the existing PO + GRN pipeline with a first-class billing entity so
finance can close month-end from a single, audit-traceable table.

  * `SupplierInvoice` — header, one per PO (MVP) but designed so multiple can
    be attached later (drop the UNIQUE(po_id) constraint + add a `sequence`).
  * `SupplierInvoiceLine` — mirrors PO lines with the three quantity views and
    two unit-cost views needed for 3-way match variance analysis.
  * `SupplierInvoiceAudit` — every state change lands here; the routes never
    mutate status without appending an audit event in the same transaction.
"""
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Date, ForeignKey, Numeric, String, TIMESTAMP, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, new_id


INVOICE_STATUSES = (
    "draft", "submitted", "matched", "variance",
    "approved", "disputed", "paid",  # `paid` reserved for Phase 8
)

LINE_MATCH_STATUSES = ("matched", "qty_variance", "cost_variance", "both_variance")


class SupplierInvoice(Base):
    __tablename__ = "supplier_invoices"

    id:   Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("sinv"))
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    po_id:        Mapped[str] = mapped_column(String, ForeignKey("purchase_orders.id", ondelete="CASCADE"),
                                              unique=True, nullable=False)
    partner_id:   Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    supplier_id:  Mapped[str] = mapped_column(String, ForeignKey("suppliers.id"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)
    currency:     Mapped[str] = mapped_column(String(4), nullable=False)

    supplier_invoice_number: Mapped[Optional[str]]  = mapped_column(String(80), nullable=True)
    invoice_date:            Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    subtotal:    Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_total:   Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    status:       Mapped[str] = mapped_column(String(24), nullable=False, default="draft")
    match_status: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)

    invoice_document_storage_path: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    invoice_document_uploaded_at:  Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    tolerance_pct_used: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 3), nullable=True)

    submitted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    matched_at:   Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    approved_at:  Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    disputed_at:  Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    approval_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dispute_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    override_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class SupplierInvoiceLine(Base):
    __tablename__ = "supplier_invoice_lines"
    __table_args__ = (UniqueConstraint("invoice_id", "po_line_id", name="uq_sinv_line"),)

    id:         Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("sinvl"))
    invoice_id: Mapped[str] = mapped_column(String, ForeignKey("supplier_invoices.id", ondelete="CASCADE"), nullable=False)
    po_line_id: Mapped[str] = mapped_column(String, ForeignKey("purchase_order_lines.id", ondelete="CASCADE"), nullable=False)

    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    supplier_sku: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    qty_ordered:  Mapped[int] = mapped_column(nullable=False)
    qty_received: Mapped[int] = mapped_column(nullable=False)
    qty_invoiced: Mapped[int] = mapped_column(nullable=False)

    unit_cost_po:            Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit_cost_invoiced:      Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit_cost_variance_pct:  Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False, default=0)

    tax_pct:     Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    line_total:  Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    match_status: Mapped[str] = mapped_column(String(24), nullable=False, default="matched")
    match_notes:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class SupplierInvoiceAudit(Base):
    __tablename__ = "supplier_invoice_audit"

    id:         Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("sinva"))
    invoice_id: Mapped[str] = mapped_column(String, ForeignKey("supplier_invoices.id", ondelete="CASCADE"), nullable=False)

    action:      Mapped[str] = mapped_column(String(48), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    to_status:   Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    actor_kind:  Mapped[str] = mapped_column(String(24), nullable=False)
    actor_id:    Mapped[Optional[str]] = mapped_column(String, nullable=True)
    actor_label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes:       Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
