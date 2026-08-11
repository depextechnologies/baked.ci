"""Partner staff — Slice B RBAC + Multi-store extensions (Phase 1).

The `Partner` row (from `partners.py`) is always the implicit *owner*. This
table adds every additional teammate a partner brings on — packers, cashiers,
managers, supervisors, inventory managers, warehouse managers, customer
support — each with a scoped role and a primary store assignment.

Login uses the same JWT infrastructure as partner owners, with `role` claim
set to `partner_staff` and extra `staff_id` + `staff_role` + `partner_id` +
`store_id` claims so the same `get_current_partner_actor` dependency can
distinguish owner-vs-staff and enforce store scoping without an extra DB
round-trip on every request.

Fixing_Prompt §12/§13 — multi-store support: `PartnerStaffStoreAssignment`
is a link table so an employee can be scoped to N stores in the future. MVP
still uses `partner_staff.warehouse_id` as the *primary* store for a
one-store-at-a-time login flow.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, TimestampMixin, new_id


# "owner" lives on the Partner row itself; every other role sits on
# partner_staff. Kept order-stable so DB CHECK constraints don't drift.
PARTNER_STAFF_ROLES = (
    "owner",  # implicit — for API responses / permission checks
    "manager",
    "packer",
    "cashier",
    "supervisor",
    "inventory_manager",
    "warehouse_manager",
    "customer_support",
)
# Roles that partner_staff.role may actually store (excludes 'owner' — the
# Partner row is the owner). Kept in sync with migration 0005.
_STORED_STAFF_ROLES = tuple(r for r in PARTNER_STAFF_ROLES if r != "owner")


class PartnerStaff(Base, TimestampMixin):
    """A teammate under a partner account with a scoped role + primary store.
    The Partner row itself is the implicit 'owner'; entries here cover
    every additional teammate."""

    __tablename__ = "partner_staff"
    __table_args__ = (
        UniqueConstraint("partner_id", "email", name="uq_partner_staff_email_per_partner"),
        UniqueConstraint("invite_token", name="uq_partner_staff_invite_token"),
        # employee_code is unique WITHIN a partner (different partners can
        # each have their own EMP-ABJ-001). Enforced by SQL migration 0005.
        Index("ix_partner_staff_partner_active", "partner_id", "is_active"),
        Index("ix_partner_staff_warehouse", "warehouse_id"),
        CheckConstraint(
            f"role IN ({','.join(repr(r) for r in _STORED_STAFF_ROLES)})",
            name="ck_partner_staff_role",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("stf"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    # Primary store this employee reports to. Nullable in the DB (legacy rows
    # pre-migration 0005), but every NEW employee MUST have one at creation.
    warehouse_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("warehouses.id"), nullable=True,
    )
    # Human-readable Employee ID / Username (per Fixing_Prompt §5). Unique
    # within a partner — set by seed / staff-invite / staff-create endpoints.
    employee_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # null until invite accepted
    must_reset_password: Mapped[bool] = mapped_column(default=False, server_default="false")

    # Invitation flow
    invited_by_staff_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invite_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invite_expires_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    invite_accepted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    last_login_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class PartnerStaffStoreAssignment(Base):
    """Multi-store forward-compat link between a staff member and a warehouse.

    MVP: exactly one row per staff (their primary store). Future: multi-store
    employees add extra rows and a login-time store picker. We only enforce
    the CURRENT primary store at the JWT layer, not the assignment set — an
    employee whose primary changes mid-shift keeps their existing session
    scoped to the old store until re-login (matches Fixing_Prompt §15 intent).
    """

    __tablename__ = "partner_staff_store_assignments"
    __table_args__ = (
        UniqueConstraint("staff_id", "warehouse_id", name="uq_pssa_staff_warehouse"),
        Index("ix_pssa_warehouse", "warehouse_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("psa"))
    staff_id: Mapped[str] = mapped_column(String, ForeignKey("partner_staff.id", ondelete="CASCADE"),
                                          nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id", ondelete="CASCADE"),
                                              nullable=False)
    is_primary: Mapped[bool] = mapped_column(default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False,
    )


class PartnerStaffAuditLog(Base):
    """Append-only audit trail for owner/manager actions. Used by Slice D
    (Analytics/Reports) later — writing here now so we don't lose events."""

    __tablename__ = "partner_staff_audit_log"
    __table_args__ = (
        Index("ix_partner_staff_audit_partner_created", "partner_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("aud"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    actor_kind: Mapped[str] = mapped_column(String(24), nullable=False)  # 'owner' | 'staff'
    actor_id: Mapped[str] = mapped_column(String, nullable=False)        # partner_id OR staff_id
    actor_email: Mapped[str] = mapped_column(String(200), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)      # e.g. 'staff.invite'
    target_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    detail: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False,
    )
