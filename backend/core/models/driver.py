"""SENDbakēd Driver — SQLAlchemy models.

Slice 1 focuses on Auth + KYC + Dashboard. Delivery-lifecycle models
(DriverJob, JobEvent) will land in Slice 2.
"""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from core.models.base import Base, new_id, TimestampMixin


DRIVER_STATUSES  = ("onboarding", "pending_review", "approved", "suspended", "rejected")
KYC_STEPS        = ("personal", "id", "licence", "selfie", "vehicle", "bank", "emergency", "submitted")
VEHICLE_TYPES    = ("bike", "scooter", "tricycle", "mini_truck", "big_truck")


class Driver(Base, TimestampMixin):
    __tablename__ = "drivers"
    __table_args__ = (
        Index("ix_drivers_status", "status"),
        Index("ix_drivers_country", "country"),
    )

    id:            Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("drv"))
    phone_e164:    Mapped[str] = mapped_column(String(24), nullable=False, unique=True)
    country:       Mapped[str] = mapped_column(String(2), nullable=False)
    name:          Mapped[Optional[str]] = mapped_column(String(200))
    email:         Mapped[Optional[str]] = mapped_column(String(200))
    status:        Mapped[str] = mapped_column(String(24), nullable=False, default="onboarding", server_default="onboarding")
    kyc_step:      Mapped[str] = mapped_column(String(32), nullable=False, default="personal",   server_default="personal")

    gov_id_type:       Mapped[Optional[str]]  = mapped_column(String(32))
    gov_id_number:     Mapped[Optional[str]]  = mapped_column(String(80))
    gov_id_front_url:  Mapped[Optional[str]]  = mapped_column(Text)
    gov_id_back_url:   Mapped[Optional[str]]  = mapped_column(Text)

    licence_number:    Mapped[Optional[str]]  = mapped_column(String(80))
    licence_front_url: Mapped[Optional[str]]  = mapped_column(Text)
    licence_expiry:    Mapped[Optional[date]] = mapped_column(Date)

    selfie_url:        Mapped[Optional[str]]  = mapped_column(Text)

    vehicle_type:      Mapped[Optional[str]]  = mapped_column(String(32))
    vehicle_plate:     Mapped[Optional[str]]  = mapped_column(String(32))
    vehicle_reg_url:   Mapped[Optional[str]]  = mapped_column(Text)

    bank_account_holder:  Mapped[Optional[str]] = mapped_column(String(200))
    bank_account_number:  Mapped[Optional[str]] = mapped_column(String(80))
    bank_ifsc_or_swift:   Mapped[Optional[str]] = mapped_column(String(40))

    emergency_contact_name:  Mapped[Optional[str]] = mapped_column(String(200))
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(24))

    is_online:      Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    last_seen_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    current_lat:    Mapped[Optional[float]] = mapped_column(Float)
    current_lng:    Mapped[Optional[float]] = mapped_column(Float)
    current_area:   Mapped[Optional[str]] = mapped_column(String(120))

    submitted_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reviewer_notes: Mapped[Optional[str]] = mapped_column(Text)


class DriverOtp(Base):
    __tablename__ = "driver_otps"
    __table_args__ = (
        Index("ix_driver_otps_phone", "phone_e164", "created_at"),
    )

    id:          Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("dotp"))
    phone_e164:  Mapped[str] = mapped_column(String(24), nullable=False)
    code:        Mapped[str] = mapped_column(String(8),  nullable=False)
    expires_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts:    Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
