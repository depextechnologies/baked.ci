"""Darkstore Category → Subcategory → Product → Storage cascade
(Fixing_Prompt.docx — 2026-02-27).

Adds `category_slug` + `subcategory_slug` columns to `warehouse_aisles` and
`warehouse_racks` so an Aisle/Rack can be tagged with a MartCategory /
MartSubcategory. This drives the cascading dropdowns in the Storage
Hierarchy editor and the LocationModal filtering on the Products page.

Both columns are nullable — existing zones/aisles/racks continue to work
untagged, and the frontend surfaces "assign a category first" prompts
before letting operators drill into Rack/Shelf/Bin.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0033_warehouse_category_cascade"
down_revision = "0032_sendbaked_dispatch"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column("warehouse_aisles",
                  sa.Column("category_slug",    sa.String(length=120), nullable=True))
    op.add_column("warehouse_aisles",
                  sa.Column("subcategory_slug", sa.String(length=120), nullable=True))
    op.add_column("warehouse_racks",
                  sa.Column("category_slug",    sa.String(length=120), nullable=True))
    op.add_column("warehouse_racks",
                  sa.Column("subcategory_slug", sa.String(length=120), nullable=True))
    op.create_index("ix_wh_aisles_category",    "warehouse_aisles", ["category_slug"])
    op.create_index("ix_wh_aisles_subcategory", "warehouse_aisles", ["subcategory_slug"])
    op.create_index("ix_wh_racks_category",     "warehouse_racks",  ["category_slug"])
    op.create_index("ix_wh_racks_subcategory",  "warehouse_racks",  ["subcategory_slug"])


def downgrade() -> None:
    op.drop_index("ix_wh_racks_subcategory",   table_name="warehouse_racks")
    op.drop_index("ix_wh_racks_category",      table_name="warehouse_racks")
    op.drop_index("ix_wh_aisles_subcategory",  table_name="warehouse_aisles")
    op.drop_index("ix_wh_aisles_category",     table_name="warehouse_aisles")
    op.drop_column("warehouse_racks",  "subcategory_slug")
    op.drop_column("warehouse_racks",  "category_slug")
    op.drop_column("warehouse_aisles", "subcategory_slug")
    op.drop_column("warehouse_aisles", "category_slug")
