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
JOB_STATUSES     = ("offered", "declined", "accepted", "arriving_pickup", "picked_up",
                    "arriving_dropoff", "delivered", "cancelled", "expired")


class Driver(Base, TimestampMixin):
    __tablename__ = "drivers"
    __table_args__ = (
        Index("ix_drivers_status", "status"),
        Index("ix_drivers_country", "country"),
    )

    id:            Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("drv"))
    phone_e164:    Mapped[Optional[str]] = mapped_column(String(24))
    country:       Mapped[str] = mapped_column(String(2), nullable=False)
    name:          Mapped[Optional[str]] = mapped_column(String(200))
    email:         Mapped[Optional[str]] = mapped_column(String(200))
    # Email+password login (SENDbakēd Driver login screen — 2026-02).
    password_hash: Mapped[Optional[str]] = mapped_column(Text)
    # Google-linked drivers store the Google `sub` for stable lookup.
    google_sub:    Mapped[Optional[str]] = mapped_column(String(64))
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
    phone_e164:  Mapped[Optional[str]] = mapped_column(String(24))
    email:       Mapped[Optional[str]] = mapped_column(String(200))
    purpose:     Mapped[str] = mapped_column(String(32), nullable=False, default="login", server_default="login")
    code:        Mapped[str] = mapped_column(String(8),  nullable=False)
    expires_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts:    Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class DriverJob(Base, TimestampMixin):
    """Slice 2 — one delivery lifecycle per row.

    We keep both pickup + delivery OTPs on the row so the driver can verify
    handoff at both ends. `expires_at` is checked by the accept endpoint —
    a driver who ignores the countdown loses the job automatically.
    """
    __tablename__ = "driver_jobs"
    __table_args__ = (
        Index("ix_driver_jobs_driver_status", "driver_id", "status"),
        Index("ix_driver_jobs_country", "country", "created_at"),
    )

    id:            Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("job"))
    driver_id:     Mapped[Optional[str]] = mapped_column(String, ForeignKey("drivers.id", ondelete="CASCADE"))
    country:       Mapped[str] = mapped_column(String(2), nullable=False)
    status:        Mapped[str] = mapped_column(String(24), nullable=False, default="offered", server_default="offered")
    job_type:      Mapped[str] = mapped_column(String(24), nullable=False, default="parcel", server_default="parcel")

    customer_name:  Mapped[str] = mapped_column(String(120), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(24),  nullable=False)

    pickup_label:  Mapped[str]   = mapped_column(String(200), nullable=False)
    pickup_lat:    Mapped[float] = mapped_column(Float, nullable=False)
    pickup_lng:    Mapped[float] = mapped_column(Float, nullable=False)

    dropoff_label: Mapped[str]   = mapped_column(String(200), nullable=False)
    dropoff_lat:   Mapped[float] = mapped_column(Float, nullable=False)
    dropoff_lng:   Mapped[float] = mapped_column(Float, nullable=False)

    distance_km:   Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    fare_amount:   Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    fare_currency: Mapped[str]   = mapped_column(String(8), nullable=False, default="XOF", server_default="XOF")

    pickup_otp:    Mapped[str] = mapped_column(String(6), nullable=False)
    delivery_otp:  Mapped[str] = mapped_column(String(6), nullable=False)

    expires_at:          Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    offered_at:          Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    accepted_at:         Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    picked_up_at:        Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    delivered_at:        Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancelled_at:        Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[Optional[str]] = mapped_column(Text)

    # Slice 6 — customer-side tracking link. Generated when the job is
    # dispatched, embedded into a `send/track/{job_id}?t=<share_token>` URL
    # and SMS'd to the customer. Read-only apart from the polling status.
    share_token:         Mapped[Optional[str]] = mapped_column(String(32), unique=True)



# ---------------------------------------------------------------------------
# Slice 3 — Wallet: earnings ledger + withdrawals
# ---------------------------------------------------------------------------

EARNING_KINDS       = ("fare", "tip", "bonus", "adjustment")
WITHDRAWAL_STATUSES = ("pending", "paid", "failed")


class DriverEarning(Base):
    """One immutable ledger row per credit to the driver's wallet.

    We credit `fare` automatically when a `DriverJob` transitions to
    `delivered`. `tip / bonus / adjustment` are placeholders for future
    slices — the aggregation endpoint treats them all identically.
    """
    __tablename__ = "driver_earnings"
    __table_args__ = (
        Index("ix_driver_earnings_driver_time", "driver_id", "created_at"),
        Index("ux_driver_earnings_job_kind", "job_id", "kind", unique=True),
    )

    id:         Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("dern"))
    driver_id:  Mapped[str] = mapped_column(String, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False)
    job_id:     Mapped[Optional[str]] = mapped_column(String, ForeignKey("driver_jobs.id", ondelete="SET NULL"))
    kind:       Mapped[str] = mapped_column(String(16), nullable=False, default="fare", server_default="fare")
    amount:     Mapped[float] = mapped_column(Float, nullable=False)
    currency:   Mapped[str] = mapped_column(String(8), nullable=False)
    note:       Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class DriverWithdrawal(Base):
    """A driver-initiated payout request. Mocked — status starts `pending`,
    an operator can later flip it to `paid` / `failed`. Bank snapshot is
    frozen at request time so a later profile edit doesn't rewrite history."""
    __tablename__ = "driver_withdrawals"
    __table_args__ = (
        Index("ix_driver_withdrawals_driver_time", "driver_id", "requested_at"),
        Index("ix_driver_withdrawals_status", "status"),
    )

    id:            Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("dwd"))
    driver_id:     Mapped[str] = mapped_column(String, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False)
    amount:        Mapped[float] = mapped_column(Float, nullable=False)
    currency:      Mapped[str] = mapped_column(String(8), nullable=False)
    status:        Mapped[str] = mapped_column(String(16), nullable=False, default="pending", server_default="pending")
    bank_holder:   Mapped[Optional[str]] = mapped_column(String(200))
    bank_account:  Mapped[Optional[str]] = mapped_column(String(80))
    bank_ifsc:     Mapped[Optional[str]] = mapped_column(String(40))
    failure_note:  Mapped[Optional[str]] = mapped_column(Text)
    requested_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    processed_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))



# ---------------------------------------------------------------------------
# Slice 6 — In-ride chat
# ---------------------------------------------------------------------------

MESSAGE_SENDERS = ("driver", "customer")


class DriverJobMessage(Base):
    """Append-only chat log tied to a DriverJob. Kept lean — no read
    receipts, no attachments; presets are the primary UX and free-text is
    a fallback."""
    __tablename__ = "driver_job_messages"
    __table_args__ = (
        Index("ix_driver_job_messages_job_time", "job_id", "created_at"),
    )

    id:          Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("msg"))
    job_id:      Mapped[str] = mapped_column(String, ForeignKey("driver_jobs.id", ondelete="CASCADE"), nullable=False)
    sender:      Mapped[str] = mapped_column(String(16), nullable=False)   # driver | customer
    preset_key:  Mapped[Optional[str]] = mapped_column(String(48))
    text:        Mapped[str] = mapped_column(Text, nullable=False)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
