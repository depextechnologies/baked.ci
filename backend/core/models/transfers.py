"""Store transfers ORM — Batch 3b."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    TIMESTAMP, CheckConstraint, ForeignKey, Index, Integer, String, Text, func,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, TimestampMixin, new_id


TRANSFER_STATUSES = ("draft", "requested", "approved", "in_transit", "received", "cancelled")


class PartnerTransfer(Base, TimestampMixin):
    __tablename__ = "partner_transfers"
    __table_args__ = (
        UniqueConstraint("code", name="partner_transfers_code_key"),
        Index("ix_transfer_status", "status"),
        Index("ix_transfer_from",   "from_warehouse_id", "status"),
        Index("ix_transfer_to",     "to_warehouse_id",   "status"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in TRANSFER_STATUSES)})",
            name="ck_transfer_status",
        ),
        CheckConstraint("from_warehouse_id <> to_warehouse_id", name="ck_transfer_not_self"),
    )

    id:   Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("tr"))
    code: Mapped[str] = mapped_column(String(40), nullable=False)

    from_partner_id:   Mapped[str] = mapped_column(String, ForeignKey("partners.id"),   nullable=False)
    from_warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)
    to_partner_id:     Mapped[str] = mapped_column(String, ForeignKey("partners.id"),   nullable=False)
    to_warehouse_id:   Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"), nullable=False)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft")
    reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by_admin_id:    Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    approved_by_admin_id:   Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    dispatched_by_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    received_by_admin_id:   Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)

    requested_at:  Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    approved_at:   Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    received_at:   Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    cancelled_at:  Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class PartnerTransferItem(Base, TimestampMixin):
    __tablename__ = "partner_transfer_items"
    __table_args__ = (
        Index("ix_transfer_item_transfer", "transfer_id"),
        CheckConstraint("quantity > 0",                       name="ck_transfer_item_qty_pos"),
        CheckConstraint("dispatched_qty >= 0",                name="ck_transfer_item_disp_nonneg"),
        CheckConstraint("received_qty  >= 0",                 name="ck_transfer_item_recv_nonneg"),
        CheckConstraint("dispatched_qty <= quantity",         name="ck_transfer_item_disp_le_qty"),
        CheckConstraint("received_qty  <= dispatched_qty",    name="ck_transfer_item_recv_le_disp"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("tri"))
    transfer_id: Mapped[str] = mapped_column(String, ForeignKey("partner_transfers.id", ondelete="CASCADE"), nullable=False)

    from_partner_product_id: Mapped[str] = mapped_column(String, ForeignKey("partner_products.id"), nullable=False)
    to_partner_product_id:   Mapped[Optional[str]] = mapped_column(String, ForeignKey("partner_products.id"), nullable=True)

    quantity:       Mapped[int] = mapped_column(Integer, nullable=False)
    dispatched_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    received_qty:   Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    dispatch_movement_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partner_stock_movements.id"), nullable=True)
    receive_movement_id:  Mapped[Optional[str]] = mapped_column(String, ForeignKey("partner_stock_movements.id"), nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
