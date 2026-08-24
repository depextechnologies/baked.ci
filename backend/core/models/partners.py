"""Partner platform — applications & (later) partner accounts.

Stage 1 of the MARTbakēd Partner workflow (Fixing_Prompt: MVP Decisions):

    Public Application  →  Super Admin Review  →  Partner Portal

This module currently covers Stage 1 (the application) and the read side of
Stage 2 (list/review). Stage 3 (partner accounts, warehouses, employees) will
extend this file — but the schema is designed so Stage-2 approval can add
rows without any migration to the application table itself.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, TimestampMixin, new_id


# Application lifecycle — matches the states named in the docx.
APPLICATION_STATUSES = (
    "draft",
    "submitted",
    "under_review",
    "additional_info_required",
    "approved",
    "rejected",
)


# Warehouse (dark-store) lifecycle — per Fixing_Prompt §9 (multi-store arch).
# Only WAREHOUSE_STATUS_OPERATIONAL rows can fulfil customer orders.
WAREHOUSE_STATUSES = (
    "pending",
    "under_review",
    "additional_info_required",
    "approved",
    "rejected",
    "setup_required",
    "setup_in_progress",
    "active",
    "temporarily_suspended",
    "maintenance",
    "closed",
)
WAREHOUSE_STATUS_OPERATIONAL = {"active"}
WAREHOUSE_STATUS_MANAGEABLE  = {"active", "temporarily_suspended", "maintenance"}


class PartnerApplication(Base, TimestampMixin):
    """A public partner application submitted from `/partner/apply`.

    All rows are partner-scoped in future modules via the `partner_id` FK
    set when the Super Admin approves this application. Until approval,
    the row is standalone (no partner exists yet).
    """

    __tablename__ = "partner_applications"
    __table_args__ = (
        UniqueConstraint("reference", name="uq_partner_applications_reference"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in APPLICATION_STATUSES)})",
            name="ck_partner_applications_status",
        ),
        CheckConstraint(
            "business_type IN ('dark_store','supermarket','convenience_store',"
            "'grocery','pharmacy','specialty','warehouse','fulfillment_center')",
            name="ck_partner_applications_business_type",
        ),
        CheckConstraint(
            "module IN ('mart','food','shop','express','auto','immo')",
            name="ck_partner_applications_module",
        ),
        Index("ix_partner_applications_status", "status"),
        Index("ix_partner_applications_email", "primary_contact_email"),
        Index("ix_partner_applications_country_module", "country", "module"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("papp"))
    # Human-readable reference: e.g. `MART-CI-2026-0142`. Given at submit time.
    reference: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    module: Mapped[str] = mapped_column(String(16), nullable=False, default="mart")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)

    # ---------- Contact / Owner ----------
    primary_contact_name: Mapped[str]     = mapped_column(String(200), nullable=False)
    primary_contact_email: Mapped[str]    = mapped_column(String(200), nullable=False)
    primary_contact_phone: Mapped[str]    = mapped_column(String(40),  nullable=False)
    owner_name: Mapped[str]               = mapped_column(String(200), nullable=False)
    owner_id_type: Mapped[Optional[str]]  = mapped_column(String(40),  nullable=True)  # e.g. CNI, passport
    owner_id_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    # ---------- Business / Company ----------
    business_name: Mapped[str]            = mapped_column(String(200), nullable=False)
    legal_name: Mapped[Optional[str]]     = mapped_column(String(200), nullable=True)
    business_type: Mapped[str]            = mapped_column(String(40),  nullable=False)
    registration_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    tax_id: Mapped[Optional[str]]         = mapped_column(String(80),  nullable=True)
    years_in_business: Mapped[Optional[int]] = mapped_column(nullable=True)

    # ---------- Warehouse / Property ----------
    warehouse_address_line: Mapped[str]   = mapped_column(String(400), nullable=False)
    warehouse_city: Mapped[str]           = mapped_column(String(120), nullable=False)
    warehouse_latitude: Mapped[Optional[float]]  = mapped_column(Numeric(9, 6), nullable=True)
    warehouse_longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    # ---------- Map-based geolocation (v0.6) ----------
    warehouse_country_code: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    warehouse_region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    warehouse_postal_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    warehouse_place_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    warehouse_formatted_address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    warehouse_location_accuracy: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    property_type: Mapped[Optional[str]]  = mapped_column(String(40),  nullable=True)  # owned / leased
    property_size_sqm: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    service_area_km: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)

    # ---------- Bank ----------
    bank_name: Mapped[Optional[str]]      = mapped_column(String(200), nullable=True)
    bank_account_holder: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    bank_account_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    bank_swift_or_code: Mapped[Optional[str]]  = mapped_column(String(80), nullable=True)
    mobile_money_provider: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    mobile_money_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    # ---------- KYC & other structured payloads ----------
    # kyc_documents: list of {kind: "registration"|"tax"|"id"|"lease"|"other", url: "...", filename: "..."}
    kyc_documents: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # extra: catch-all for module/country-specific extensions (avoids schema churn)
    extra: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")

    # ---------- Review / Approval ----------
    submitted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    reviewed_at: Mapped[Optional[datetime]]  = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    reviewed_by_admin_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("admin_users.id"), nullable=True,
    )
    review_notes: Mapped[Optional[str]]   = mapped_column(Text, nullable=True)
    additional_info_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # When the Super Admin approves, we materialise a Partner row and link it back.
    partner_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)


class Partner(Base, TimestampMixin):
    """A materialised, approved partner account.

    Created by the Super Admin approval action (Stage 2) from a
    `PartnerApplication`. This is the record referenced by all Stage-3
    partner-portal work: warehouses, inventory, products, orders, wallet.
    """

    __tablename__ = "partners"
    __table_args__ = (
        CheckConstraint(
            "module IN ('mart','food','shop','express','auto','immo')",
            name="ck_partners_module",
        ),
        Index("ix_partners_module_country", "module", "country"),
        Index("ix_partners_owner_email", "owner_email"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("prt"))
    application_id: Mapped[str] = mapped_column(
        String, ForeignKey("partner_applications.id"), nullable=False,
    )
    module: Mapped[str] = mapped_column(String(16), nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    business_name: Mapped[str] = mapped_column(String(200), nullable=False)
    business_type: Mapped[str] = mapped_column(String(40), nullable=False)
    owner_name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_email: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    # Temp password issued at approval; partner must reset on first login (Stage 3).
    temp_password_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    must_reset_password: Mapped[bool] = mapped_column(default=True, server_default="true")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    approved_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    approved_by_admin_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("admin_users.id"), nullable=True,
    )


class Warehouse(Base, TimestampMixin):
    """Physical fulfilment location owned by a partner.

    Full hierarchy (zones/aisles/racks/shelves/bins) will land as separate
    tables in the inventory slice — kept as a flat root now so we don't
    over-build before we have real dark-store fleets, per PRD note that
    "small stores may configure only the levels they require."
    """

    __tablename__ = "warehouses"
    __table_args__ = (
        Index("ix_warehouses_partner_id", "partner_id"),
        Index("ix_warehouses_status", "status"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in WAREHOUSE_STATUSES)})",
            name="ck_warehouses_status",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("wh"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    # Human-readable store identifier used at staff login (e.g. MRT-ABJ-001).
    # Populated by migration 0004 for existing rows, and by seed for new ones.
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address_line: Mapped[str] = mapped_column(String(400), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    property_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    property_size_sqm: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    warehouse_capacity_sqm: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    service_area_km: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    # Map-based geolocation (v0.6)
    formatted_address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    place_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    location_accuracy: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # Lifecycle status — per Fixing_Prompt §9. Only 'active' fulfils orders.
    status: Mapped[str] = mapped_column(String(40), nullable=False, server_default="active")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    # Richer store profile (Fixing_Prompt §11)
    operating_hours: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    time_zone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    store_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    opening_date: Mapped[Optional[datetime]] = mapped_column(nullable=True)  # DB DATE column; ORM treats as datetime-optional
    contact_email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # Store manager staff id (nullable FK-less pointer; we validate in app layer
    # to avoid circular FK with partner_staff).
    store_manager_staff_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)


# ============================================================================
#                      Warehouse hierarchy (Slice 4b)
# ============================================================================
# Full 5-level hierarchy per PRD decision e3 (Warehouse → Zone → Aisle →
# Rack → Shelf → Bin). Small stores configure only the levels they need —
# every level below Warehouse is optional and can be empty.

class WarehouseZone(Base, TimestampMixin):
    __tablename__ = "warehouse_zones"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_wh_zone_code"),
        Index("ix_wh_zones_warehouse_id", "warehouse_id"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("wz"))
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")


class WarehouseAisle(Base, TimestampMixin):
    __tablename__ = "warehouse_aisles"
    __table_args__ = (
        UniqueConstraint("zone_id", "code", name="uq_wh_aisle_code"),
        Index("ix_wh_aisles_zone_id", "zone_id"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("wa"))
    zone_id: Mapped[str] = mapped_column(String, ForeignKey("warehouse_zones.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")


class WarehouseRack(Base, TimestampMixin):
    __tablename__ = "warehouse_racks"
    __table_args__ = (
        UniqueConstraint("aisle_id", "code", name="uq_wh_rack_code"),
        Index("ix_wh_racks_aisle_id", "aisle_id"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("wr"))
    aisle_id: Mapped[str] = mapped_column(String, ForeignKey("warehouse_aisles.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")


class WarehouseShelf(Base, TimestampMixin):
    __tablename__ = "warehouse_shelves"
    __table_args__ = (
        UniqueConstraint("rack_id", "code", name="uq_wh_shelf_code"),
        Index("ix_wh_shelves_rack_id", "rack_id"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("ws"))
    rack_id: Mapped[str] = mapped_column(String, ForeignKey("warehouse_racks.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")


class WarehouseBin(Base, TimestampMixin):
    __tablename__ = "warehouse_bins"
    __table_args__ = (
        UniqueConstraint("shelf_id", "code", name="uq_wh_bin_code"),
        Index("ix_wh_bins_shelf_id", "shelf_id"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("wb"))
    shelf_id: Mapped[str] = mapped_column(String, ForeignKey("warehouse_shelves.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")



class WarehouseCategoryDefault(Base, TimestampMixin):
    """Per-warehouse default zone/aisle mapping for a MART category.

    Purpose (Social.docx §4): when ops assign a SKU to a bin, they should
    default to bins under the category's suggested zone, not scan the whole
    warehouse. One row per (warehouse, category_slug).
    """
    __tablename__ = "warehouse_category_defaults"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "category_slug", name="uq_whcd_wh_category"),
        Index("ix_whcd_warehouse", "warehouse_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("whcd"))
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    category_slug: Mapped[str] = mapped_column(String(120), nullable=False)
    zone_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("warehouse_zones.id", ondelete="SET NULL"), nullable=True)
    aisle_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("warehouse_aisles.id", ondelete="SET NULL"), nullable=True)
