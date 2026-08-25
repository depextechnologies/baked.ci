"""HomepageSection — admin-editable homepage config (Social.docx §Homepage).

One row per (country, display_order). `config` is a JSONB blob whose shape
depends on `section_type`; adding a new section type never requires an
alembic migration.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, Integer, String, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, new_id


HOMEPAGE_SECTION_TYPES = [
    "hero",
    "category_grid",
    "product_carousel",
    "promotional_banner",
    "banner_trio",
    "brand_carousel",
    "app_promotion",
    "cta_strip",
]


class HomepageSection(Base):
    __tablename__ = "homepage_sections"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("hps"))
    country: Mapped[str] = mapped_column(String(2), nullable=False)
    section_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    subtitle: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
