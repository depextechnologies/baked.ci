"""Express (courier/movers) module: bookings, drivers, pricing, and catalog reference tables."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    ARRAY,
    TIMESTAMP,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Identity,
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

from core.models.base import AuditMixin, Base, DriverStatus, PaymentStatus, TimestampMixin, new_id


class ExpressBooking(Base, TimestampMixin):
    __tablename__ = "express_bookings"
    __table_args__ = (
        UniqueConstraint("ref", name="uq_express_bookings_ref"),
        CheckConstraint("booking_type IN ('parcel','movers')", name="ck_express_bookings_booking_type"),
        CheckConstraint(
            "status IN ('searching','offering','driver_assigned','arriving','picked_up','in_transit',"
            "'delivered','cancelled','confirmed')",
            name="ck_express_bookings_status",
        ),
        Index("ix_express_bookings_customer_module", "customer_id", "module"),
        Index("ix_express_bookings_customer_status", "customer_id", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("exp"))
    ref: Mapped[str] = mapped_column(String, nullable=False)
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), nullable=False)
    module: Mapped[str] = mapped_column(String, nullable=False, default="express")
    booking_type: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    payment_method: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    payment_status: Mapped[str] = mapped_column(PaymentStatus, nullable=False, default="pending")
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    currency_symbol: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    # --- parcel-only (nullable) ---
    vehicle_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pickup_line1: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pickup_latitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    pickup_longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    pickup_formatted_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pickup_place_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pickup_landmark: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pickup_building: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pickup_city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pickup_country: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    drop_line1: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    drop_latitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    drop_longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    drop_formatted_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    drop_place_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    drop_landmark: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    drop_building: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    drop_city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    drop_country: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receiver_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receiver_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receiver_alt_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receiver_building: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receiver_landmark: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receiver_notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receiver_preferences: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    package_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    package_weight_range: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    package_dimensions: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    package_notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    distance_km: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    duration_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    price_breakdown: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    driver_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("module_drivers.id"), nullable=True)
    driver_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    driver_location_lat: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    driver_location_lng: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    eta_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    # --- server-authoritative offer / dispatch fields (0032) ---
    offered_to_driver_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("module_drivers.id", ondelete="SET NULL"), nullable=True,
    )
    offered_at:           Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    offer_expires_at:     Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    declined_driver_ids:  Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")

    # --- movers-only (nullable) ---
    move_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    movers_pickup_access: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    movers_drop_access: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    custom_items: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    quote_breakdown: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    advance: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    remaining: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    time_slot_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    labour_movers: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class ExpressBookingTimeline(Base):
    __tablename__ = "express_booking_timeline"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("tl"))
    seq: Mapped[int] = mapped_column(Integer, Identity(), nullable=False)
    booking_id: Mapped[str] = mapped_column(
        String, ForeignKey("express_bookings.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class ExpressBookingItem(Base):
    __tablename__ = "express_booking_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("bit"))
    booking_id: Mapped[str] = mapped_column(
        String, ForeignKey("express_bookings.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[str] = mapped_column(String, ForeignKey("express_movers_items.id"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ModuleDriver(Base, AuditMixin):
    __tablename__ = "module_drivers"
    __table_args__ = (
        UniqueConstraint("phone", "module", name="uq_module_drivers_phone_module"),
        Index(
            "ix_module_drivers_dispatch",
            "module",
            "country",
            "vehicle_type",
            "status",
            "is_available",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("drv"))
    module: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    vehicle_type: Mapped[str] = mapped_column(String, nullable=False)
    vehicle_reg: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    license_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    current_lat: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    current_lng: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    rating: Mapped[float] = mapped_column(Numeric(2, 1), nullable=False, default=4.8)
    photo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Bridge back to the SENDbakēd Driver record (0032). NULL for legacy seed
    # rows; set for real drivers going through /driver/me/online.
    linked_driver_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True
    )
    # Freshness for dispatch filter (0032). Updated on every location ping.
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    # use_alter: module_drivers <-> express_bookings is a mutual FK reference
    # (booking.driver_id -> driver, driver.active_booking_id -> booking); this
    # constraint is emitted as a separate ALTER TABLE after both tables exist.
    active_booking_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("express_bookings.id", use_alter=True, name="fk_module_drivers_active_booking_id"), nullable=True
    )
    status: Mapped[str] = mapped_column(DriverStatus, nullable=False, default="pending")
    created_by: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)


class ExpressVehicle(Base, AuditMixin):
    __tablename__ = "express_vehicles"
    __table_args__ = (UniqueConstraint("code", "country", name="uq_express_vehicles_code_country"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("veh"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    max_weight_kg: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    eta_min_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    eta_min_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    base_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    image: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class ExpressPackageType(Base, AuditMixin):
    __tablename__ = "express_package_types"
    __table_args__ = (UniqueConstraint("code", "country", name="uq_express_package_types_code_country"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pkg"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExpressWeightTier(Base, AuditMixin):
    __tablename__ = "express_weight_tiers"
    __table_args__ = (UniqueConstraint("code", name="uq_express_weight_tiers_code"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("wt"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    min_kg: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    max_kg: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExpressDeliveryPref(Base, AuditMixin):
    __tablename__ = "express_delivery_prefs"
    __table_args__ = (UniqueConstraint("code", name="uq_express_delivery_prefs_code"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pref"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExpressPricingRule(Base, AuditMixin):
    __tablename__ = "express_pricing_rules"
    __table_args__ = (
        Index(
            "uq_express_pricing_rules_active",
            "country",
            "vehicle_code",
            unique=True,
            postgresql_where="active",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pr"))
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    vehicle_code: Mapped[str] = mapped_column(String, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    base_fare: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    min_fare: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    price_per_km: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    price_per_min: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    waiting_fee: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    peak_multiplier: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=1)
    night_multiplier: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=1)
    service_fee_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    insurance_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    insurance_min: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    taxes_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)


class ExpressPromo(Base, AuditMixin):
    __tablename__ = "express_promos"
    __table_args__ = (
        UniqueConstraint("code", "country", name="uq_express_promos_code_country"),
        CheckConstraint("kind IN ('percent','flat')", name="ck_express_promos_kind"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("promo"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    max_discount: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    label: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class ExpressMoversPricing(Base, AuditMixin):
    __tablename__ = "express_movers_pricing"
    __table_args__ = (UniqueConstraint("country", name="uq_express_movers_pricing_country"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("mvp"))
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    price_per_km: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    transport_base: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    packing_per_item: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    loading_unloading_base: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    loading_per_item: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    labour_per_mover: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    floor_fee: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    stair_fee: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    toll_permits: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    value_per_kg: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    insurance_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    insurance_min: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    taxes_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    advance_flat: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    advance_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)


class ExpressMoversCategory(Base, AuditMixin):
    __tablename__ = "express_movers_categories"
    __table_args__ = (UniqueConstraint("code", name="uq_express_movers_categories_code"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("mcat"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExpressMoversItem(Base, AuditMixin):
    __tablename__ = "express_movers_items"
    __table_args__ = (
        UniqueConstraint("name", "category_code", "country", name="uq_express_movers_items_natural_key"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("mitem"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    category_code: Mapped[str] = mapped_column(String, nullable=False)
    # NULL means "all countries" (global item) — replaces the old "ALL" sentinel string.
    country: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    labour_required: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    base_price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExpressMoveType(Base, AuditMixin):
    __tablename__ = "express_move_types"
    __table_args__ = (UniqueConstraint("code", name="uq_express_move_types_code"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("mvt"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExpressTimeSlot(Base, AuditMixin):
    __tablename__ = "express_time_slots"
    __table_args__ = (UniqueConstraint("code", "country", name="uq_express_time_slots_code_country"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("ts"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    window: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    surcharge: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    badge: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
