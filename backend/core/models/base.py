"""Declarative base, shared mixins, and enum types for all SQLAlchemy models."""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import TIMESTAMP, Integer, String, event, func
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def new_id(prefix: str = "") -> str:
    if prefix:
        return f"{prefix}_{uuid.uuid4().hex[:16]}"
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    # Eagerly fetch server-generated column values (created_at/updated_at via
    # func.now(), etc.) via RETURNING on INSERT/UPDATE instead of leaving them
    # "expired" — the async ORM can't transparently lazy-load an expired
    # attribute from a plain synchronous `getattr` (e.g. in core/serializers.py),
    # so relying on lazy-load here would crash with MissingGreenlet.
    __mapper_args__ = {"eager_defaults": True}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AuditMixin(TimestampMixin):
    deleted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")


@event.listens_for(Base, "before_update", propagate=True)
def _bump_version(mapper, connection, target) -> None:
    if hasattr(target, "version"):
        target.version = (target.version or 1) + 1


# Shared Postgres ENUM types — defined once here and imported wherever needed so the
# same type object is reused across tables (e.g. payment_status on both orders and
# express_bookings) instead of emitting duplicate CREATE TYPE statements.
UserRole = PgEnum("customer", "admin", "super_admin", name="user_role")
OrderStatus = PgEnum(
    "pending", "confirmed", "preparing", "picked_up", "on_the_way", "delivered", "cancelled", name="order_status"
)
PaymentStatus = PgEnum(
    "pending", "succeeded", "authorized", "failed", "advance_pending", "paid", name="payment_status"
)
VendorStatus = PgEnum("pending", "approved", "active", "rejected", "suspended", name="vendor_status")
DriverStatus = PgEnum("pending", "active", "inactive", "suspended", name="driver_status")
TicketCategory = PgEnum(
    "order", "delivery", "wallet", "payment", "property", "vehicle", "account", "other", name="ticket_category"
)
TicketPriority = PgEnum("low", "normal", "high", "urgent", name="ticket_priority")
TicketStatus = PgEnum("open", "in_progress", "resolved", "closed", name="ticket_status")
