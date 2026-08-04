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
