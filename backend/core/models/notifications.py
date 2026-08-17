"""Notification ORM model — Phase 5b."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, String, TIMESTAMP, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, new_id


RECIPIENT_KINDS = ("supplier", "partner", "admin")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("notif"))

    recipient_kind: Mapped[str] = mapped_column(String(24), nullable=False)
    recipient_id:   Mapped[str] = mapped_column(String, nullable=False)

    kind:  Mapped[str] = mapped_column(String(48), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body:  Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    link:  Mapped[Optional[str]]  = mapped_column(String(500), nullable=True)

    entity_kind: Mapped[Optional[str]] = mapped_column(String(48), nullable=True)
    entity_id:   Mapped[Optional[str]] = mapped_column(String, nullable=True)
    actor_label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    is_read:    Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    read_at:    Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
