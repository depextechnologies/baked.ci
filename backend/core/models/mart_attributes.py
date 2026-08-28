"""MARTbaked — Dynamic Category Attribute System (Fixing_Prompt v6, 2026-02-28).

Reusable engine that lets Super Admins define custom typed attributes,
assign them to categories/subcategories with per-assignment configuration
(required, customer_visible, supplier_editable, sort_order), inherit them
from parent categories, and override at the subcategory level.

Design decisions (see Fixing_Prompt v6):
 * Attribute definitions (`mart_attributes`) are GLOBAL and stable. `key` is
   auto-generated from name at creation time and IMMUTABLE. Renaming an
   attribute's `name` is a pure UI change; the immutable `key` guarantees
   that historical values already stored in `mart_products.details` keep
   pointing to the definition.
 * SoftDelete via `is_active=false` — never hard-delete, so historical
   product data never becomes an orphan.
 * `mart_attribute_options` is a versioned list of allowed values for
   select / multi_select types.
 * `mart_category_attributes` is the (category|subcategory, attribute)
   assignment table. Both `category_id` and `subcategory_id` are set for a
   subcategory-scoped assignment; only `category_id` is set for a category-
   scoped one. Subcategory rows can override an inherited row's
   is_required / customer_visible / is_active fields; enforcement lives in
   the resolver, not the schema (resolver = category attrs ∪ own).
 * `mart_attribute_audit` records who + when + before → after diff (JSONB)
   for every mutation.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    TIMESTAMP, Boolean, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base, new_id


ATTRIBUTE_TYPES = (
    "short_text", "long_text", "integer", "decimal",
    "select", "multi_select", "boolean", "date",
)


class MartAttribute(Base):
    """Global attribute definition. Immutable `key`, safe soft-delete."""
    __tablename__ = "mart_attributes"
    __table_args__ = (
        UniqueConstraint("key", name="uq_mart_attributes_key"),
        Index("ix_mart_attributes_active", "is_active"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("attr"))
    # Immutable identifier used as the JSONB dict key on mart_products.details.
    # Auto-generated from `name` at creation (slugify_underscore).
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(String(24), nullable=False)  # see ATTRIBUTE_TYPES
    unit: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)  # e.g. "cm", "kg"
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MartAttributeOption(Base):
    """Option list for select / multi_select attributes."""
    __tablename__ = "mart_attribute_options"
    __table_args__ = (
        UniqueConstraint("attribute_id", "value", name="uq_mart_attribute_option_value"),
        Index("ix_mart_attribute_options_attr", "attribute_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("attropt"))
    attribute_id: Mapped[str] = mapped_column(String, ForeignKey("mart_attributes.id", ondelete="CASCADE"), nullable=False)
    value: Mapped[str] = mapped_column(String(120), nullable=False)  # stored in product.details
    label: Mapped[str] = mapped_column(String(200), nullable=False)  # shown in forms + PDP
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


class MartCategoryAttribute(Base):
    """Attribute assignment / override at category OR subcategory level.

    * If subcategory_id IS NULL — category-scoped row (parent).
    * If subcategory_id IS NOT NULL — subcategory row that either adds a new
      attribute or overrides the parent-category row for the same attribute.

    Resolution (parent ∪ subcategory with subcategory-wins overrides) is
    implemented in `modules.mart_attributes.resolver.resolve_attributes`.
    """
    __tablename__ = "mart_category_attributes"
    __table_args__ = (
        UniqueConstraint("category_id", "subcategory_id", "attribute_id",
                         name="uq_mart_cat_attr_scope"),
        Index("ix_mart_cat_attr_cat", "category_id"),
        Index("ix_mart_cat_attr_sub", "subcategory_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("catattr"))
    category_id: Mapped[str] = mapped_column(String, ForeignKey("mart_categories.id", ondelete="CASCADE"), nullable=False)
    subcategory_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("mart_subcategories.id", ondelete="CASCADE"), nullable=True)
    attribute_id: Mapped[str] = mapped_column(String, ForeignKey("mart_attributes.id", ondelete="CASCADE"), nullable=False)

    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    customer_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    supplier_editable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Soft-disable at this scope (subcategory can flip a parent attribute off)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MartAttributeAudit(Base):
    """Full-diff audit trail. `diff` = {"before": {...}, "after": {...}}."""
    __tablename__ = "mart_attribute_audit"
    __table_args__ = (
        Index("ix_mart_attribute_audit_created", "created_at"),
        Index("ix_mart_attribute_audit_entity", "entity_kind", "entity_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("attraud"))
    actor_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    actor_email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    action: Mapped[str] = mapped_column(String(48), nullable=False)  # create|update|delete|assign|unassign|option_add|…
    entity_kind: Mapped[str] = mapped_column(String(32), nullable=False)  # attribute|option|assignment|category|subcategory
    entity_id: Mapped[str] = mapped_column(String, nullable=False)
    diff: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
