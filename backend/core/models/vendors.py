"""Admin-managed module vendors (partners) and their verification documents."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import AuditMixin, Base, VendorStatus, new_id


class ModuleVendor(Base, AuditMixin):
    __tablename__ = "module_vendors"
    __table_args__ = (
        UniqueConstraint("name", "module", name="uq_module_vendors_name_module"),
        Index("ix_module_vendors_module_status", "module", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("ven"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    commission_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    module: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(VendorStatus, nullable=False, default="pending")
    approved_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    approval_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    suspension_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)


class VendorDocument(Base):
    __tablename__ = "vendor_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("doc"))
    vendor_id: Mapped[str] = mapped_column(String, ForeignKey("module_vendors.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    url: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
