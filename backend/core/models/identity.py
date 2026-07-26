"""Identity tables: customers (phone/Google auth) and the separate admin_users (email/password) system."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import ARRAY, TIMESTAMP, Boolean, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import AuditMixin, Base, UserRole, new_id


class Customer(Base, AuditMixin):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("phone", name="uq_customers_phone"),
        UniqueConstraint("email", name="uq_customers_email"),
        UniqueConstraint("referral_code", name="uq_customers_referral_code"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cust"))
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    picture: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(UserRole, nullable=False, default="customer")
    auth_providers: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    country: Mapped[Optional[str]] = mapped_column(String(2), ForeignKey("countries.code"), nullable=True)
    locale: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reward_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    referral_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    referred_by_customer_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("customers.id"), nullable=True
    )
    preferences: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class CustomerSession(Base):
    __tablename__ = "customer_sessions"
    __table_args__ = (UniqueConstraint("session_token", name="uq_customer_sessions_token"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("sess"))
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), nullable=False)
    session_token: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"
    __table_args__ = (Index("ix_otp_challenges_phone_created_at", "phone", "created_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("otp"))
    phone: Mapped[str] = mapped_column(String, nullable=False)
    code: Mapped[str] = mapped_column(String, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    consumed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class AdminUser(Base, AuditMixin):
    __tablename__ = "admin_users"
    __table_args__ = (UniqueConstraint("email", name="uq_admin_users_email"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("adm"))
    email: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(UserRole, nullable=False, default="admin")
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_actor_id", "actor_id"),
        Index("ix_audit_logs_target_id", "target_id"),
        Index("ix_audit_logs_action_created_at", "action", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("aud"))
    # Polymorphic actor/target — no FK constraint on purpose: this is an insert-only
    # historical ledger, so preserving the log entry matters more than referential
    # integrity to a possibly-deleted actor/target.
    actor_id: Mapped[str] = mapped_column(String, nullable=False)
    actor_kind: Mapped[str] = mapped_column(String, nullable=False)
    actor_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    target_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
