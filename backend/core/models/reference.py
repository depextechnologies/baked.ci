"""Platform reference/config tables: countries, module configs, roles, cities, AI prompts."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import ARRAY, TIMESTAMP, Boolean, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, new_id


class Country(Base):
    __tablename__ = "countries"

    code: Mapped[str] = mapped_column(String(2), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    flag: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    currency_symbol: Mapped[str] = mapped_column(String, nullable=False)
    locale: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    timezone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    production_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    min_order: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    delivery_fee: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    free_delivery_over: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    delivery_eta_min: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    service_radius_km: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Configuration(Base):
    __tablename__ = "configurations"
    __table_args__ = (UniqueConstraint("scope", "module", "country", name="uq_configurations_scope_module_country"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cfg"))
    scope: Mapped[str] = mapped_column(String, nullable=False, default="module")
    module: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tagline: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    order: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Role(Base):
    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(String, primary_key=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    permissions: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class City(Base):
    __tablename__ = "cities"
    __table_args__ = (UniqueConstraint("name", "country", name="uq_cities_name_country"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("city"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AiPrompt(Base):
    __tablename__ = "ai_prompts"
    __table_args__ = (UniqueConstraint("name", name="uq_ai_prompts_name"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("prm"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    feature: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
