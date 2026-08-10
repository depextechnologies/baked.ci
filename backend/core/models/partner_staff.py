"""Partner staff — Slice B RBAC.

The `Partner` row (from `partners.py`) is always the implicit *owner*. This
table adds every additional teammate a partner brings on — packers, cashiers,
managers — each with a scoped role. Login uses the same JWT infrastructure as
partner owners, with `role` claim set to `partner_staff` and an extra
`staff_id` + `staff_role` extra claim so the same `get_current_partner_actor`
dependency can distinguish owner-vs-staff without an extra DB round-trip on
every request.
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


PARTNER_STAFF_ROLES = ("owner", "manager", "packer", "cashier")


class PartnerStaff(Base, TimestampMixin):
    """A teammate under a partner account with a scoped role.
    The Partner row itself is the implicit 'owner'; entries here cover
    every additional teammate."""

    __tablename__ = "partner_staff"
    __table_args__ = (
        UniqueConstraint("partner_id", "email", name="uq_partner_staff_email_per_partner"),
        UniqueConstraint("invite_token", name="uq_partner_staff_invite_token"),
        CheckConstraint(
            f"role IN ({','.join(repr(r) for r in PARTNER_STAFF_ROLES if r != 'owner')})",
            name="ck_partner_staff_role",
        ),
        Index("ix_partner_staff_partner_active", "partner_id", "is_active"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("stf"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
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
