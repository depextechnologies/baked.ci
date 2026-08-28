"""Supplier Onboarding — ORM models (Phase 2A).

Separate business entity from Dark Store Partners. Suppliers have their own
lifecycle, own login (post-approval), own portal, own catalogue.
"""
from __future__ import annotations
from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    CheckConstraint,
    Date,
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

from core.models.base import Base, TimestampMixin, new_id


SUPPLIER_STATUSES = (
    "draft", "submitted", "under_review", "action_required",
    "approved", "rejected", "suspended",
)

SUPPLIER_APPLICATION_STATUSES = (
    "draft", "submitted", "under_review", "action_required",
    "approved", "rejected",
)

SUPPLIER_BUSINESS_TYPES = (
    "manufacturer", "distributor", "wholesaler", "supplier", "retailer",
    "brand_owner", "producer", "importer", "other",
)

SUPPLIER_CONTACT_RELATIONS = (
    "owner", "director", "authorised_representative", "procurement_contact", "other",
)

SUPPLIER_DOCUMENT_TYPES = (
    "business_registration", "tax_certificate", "business_licence",
    "owner_id", "product_certification", "manufacturer_authorisation",
    "catalogue", "other",
)


class Supplier(Base, TimestampMixin):
    __tablename__ = "suppliers"
    __table_args__ = (
        Index("ix_suppliers_status", "status", "country"),
        Index("ix_suppliers_email", "business_email"),
        UniqueConstraint("business_email", "country", name="uq_suppliers_email_country"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("sup"))
    code: Mapped[Optional[str]] = mapped_column(String(40), unique=True, nullable=True)
    business_name: Mapped[str] = mapped_column(String(300), nullable=False)
    trading_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    seller_slug: Mapped[Optional[str]] = mapped_column(String(80), unique=True, nullable=True)
    business_type: Mapped[str] = mapped_column(String(60), nullable=False)
    business_type_other: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    registration_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tax_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    business_email: Mapped[str] = mapped_column(String(200), nullable=False)
    business_phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    years_in_operation: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    default_currency: Mapped[str] = mapped_column(String(8), nullable=False, default="XOF", server_default="XOF")
    module: Mapped[str] = mapped_column(String(20), nullable=False, default="mart", server_default="mart")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", server_default="draft")
    supplier_portal_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    password_hash: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    approved_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    approved_by_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    suspended_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class SupplierApplication(Base, TimestampMixin):
    __tablename__ = "supplier_applications"
    __table_args__ = (
        Index("ix_supplier_app_status", "status", "created_at"),
        Index("ix_supplier_app_supplier", "supplier_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("supapp"))
    application_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", server_default="draft")
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    phone_e164: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    phone_challenge_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    reviewer_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    action_required_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")


class SupplierContact(Base, TimestampMixin):
    __tablename__ = "supplier_contacts"
    __table_args__ = (Index("ix_supplier_contacts_supplier", "supplier_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("supcon"))
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    nationality: Mapped[Optional[str]] = mapped_column(String(2), ForeignKey("countries.code"), nullable=True)
    id_type: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    id_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    id_document_url: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    relationship: Mapped[str] = mapped_column(String(40), nullable=False, default="owner", server_default="owner")
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


class SupplierDocument(Base):
    __tablename__ = "supplier_documents"
    __table_args__ = (
        Index("ix_supplier_docs_supplier", "supplier_id"),
        Index("ix_supplier_docs_active", "supplier_id", "is_deleted"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("supdoc"))
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    document_type: Mapped[str] = mapped_column(String(60), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    file_url: Mapped[str] = mapped_column(String(600), nullable=False)
    storage_path: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    original_filename: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    issued_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expires_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    verification_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    uploaded_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    reviewer_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)


class SupplierProduct(Base, TimestampMixin):
    __tablename__ = "supplier_products"
    __table_args__ = (
        Index("uq_supplier_products_pair", "supplier_id", "master_product_id", unique=True),
        Index("ix_supplier_products_master", "master_product_id", "is_active"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("supprod"))
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    master_product_id: Mapped[str] = mapped_column(String, ForeignKey("mart_products.id", ondelete="CASCADE"), nullable=False)
    supplier_sku: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    cost_price: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="XOF", server_default="XOF")
    moq: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class SupplierProductRequest(Base, TimestampMixin):
    __tablename__ = "supplier_product_requests"
    __table_args__ = (
        Index("ix_supplier_prod_req_status", "status", "created_at"),
        Index("ix_supplier_prod_req_supplier", "supplier_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("supreq"))
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    proposed_name: Mapped[str] = mapped_column(String(400), nullable=False)
    proposed_category_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("mart_categories.id"), nullable=True)
    proposed_ean_upc: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    proposed_manufacturer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    proposed_pack_size: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    proposed_net_qty: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    proposed_short_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proposed_cost_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 4), nullable=True)
    proposed_currency: Mapped[Optional[str]] = mapped_column(String(8), nullable=True, default="XOF", server_default="XOF")
    proposed_moq: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    proposed_lead_time_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    reviewer_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    created_master_product_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("mart_products.id"), nullable=True)
    # Fixing_Prompt v6 · Slice 2 — dynamic attribute submission
    proposed_subcategory_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("mart_subcategories.id"), nullable=True)
    # Snapshot of {attribute_key: {"v": …, "label": …, "type": …}} at submit time.
    # This survives any later rename / soft-delete of the attribute definition.
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")


class SupplierSupplyLocation(Base):
    __tablename__ = "supplier_supply_locations"
    __table_args__ = (Index("ix_supplier_loc_supplier", "supplier_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("suploc"))
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    label: Mapped[str] = mapped_column(String(300), nullable=False)
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(2), ForeignKey("countries.code"), nullable=True)
    zone: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    warehouse_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("warehouses.id"), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 6), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 6), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    service_radius_km: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_business_location: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    approval_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class SupplierCategoryInterest(Base):
    __tablename__ = "supplier_category_interests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("supcat"))
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("mart_categories.id"), nullable=True)
    requested_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="approved", server_default="approved")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class SupplierBankInfo(Base, TimestampMixin):
    __tablename__ = "supplier_bank_info"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("supbnk"))
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), unique=True, nullable=False)
    bank_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    account_holder: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    account_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    iban: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    swift_bic: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    mobile_money_provider: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    mobile_money_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    preferred_method: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    billing_address: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    billing_city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    billing_country: Mapped[Optional[str]] = mapped_column(String(2), ForeignKey("countries.code"), nullable=True)


class SupplierReviewAudit(Base):
    __tablename__ = "supplier_review_audit"
    __table_args__ = (Index("ix_supplier_audit_supplier", "supplier_id", "created_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("supaud"))
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    application_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("supplier_applications.id"), nullable=True)
    actor_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    to_status: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)



class SupplierWarehouseAssignment(Base, TimestampMixin):
    """Social.docx §9 — Bind a supplier to one or more darkstores/FCs.

    Only the assigned warehouses can raise purchase orders against this
    supplier, and the supplier portal filters "customers" to just these
    stores. Marking `is_primary=true` designates the default warehouse
    when a new PO auto-selects one for the supplier.
    """
    __tablename__ = "supplier_warehouse_assignments"
    __table_args__ = (
        UniqueConstraint("supplier_id", "warehouse_id", name="uq_swa_supplier_warehouse"),
        Index("ix_swa_supplier", "supplier_id"),
        Index("ix_swa_warehouse", "warehouse_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("swa"))
    supplier_id: Mapped[str] = mapped_column(String, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_by_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
