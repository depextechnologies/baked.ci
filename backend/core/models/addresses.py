"""Customer address book and recent-address-search history."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import AuditMixin, Base, new_id


class CustomerAddress(Base, AuditMixin):
    __tablename__ = "customer_addresses"
    __table_args__ = (
        Index(
            "uq_customer_addresses_one_default",
            "customer_id",
            unique=True,
            postgresql_where="is_default AND deleted_at IS NULL",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("addr"))
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    line1: Mapped[str] = mapped_column(String, nullable=False)
    line2: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False, default="CI")
    landmark: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    place_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    formatted_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class RecentAddressSearch(Base):
    __tablename__ = "recent_address_searches"
    __table_args__ = (
        Index(
            "uq_recent_searches_by_place_id",
            "customer_id",
            "place_id",
            unique=True,
            postgresql_where="place_id IS NOT NULL",
        ),
        Index(
            "uq_recent_searches_by_address",
            "customer_id",
            "formatted_address",
            unique=True,
            postgresql_where="place_id IS NULL",
        ),
        Index("ix_recent_searches_customer_last_used", "customer_id", "last_used_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rec"))
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), nullable=False)
    place_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    formatted_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    last_used_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
