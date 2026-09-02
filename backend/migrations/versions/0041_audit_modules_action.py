"""Extend supplier_review_audit action check to allow modules_updated.

Slice 5 (2026-02) — admins can now toggle a supplier's module access
via `PATCH /admin/modules/mart/suppliers/{sid}/modules`. Every change
writes to `supplier_review_audit` with `action = supplier.modules_updated`
so the audit trail captures who flipped SHOP on/off and when.
"""
from alembic import op


revision      = "0041_audit_modules_action"
down_revision = "0040_shop_attributes"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("ALTER TABLE supplier_review_audit DROP CONSTRAINT IF EXISTS ck_supplier_audit_action")
    op.execute("""
    ALTER TABLE supplier_review_audit
    ADD CONSTRAINT ck_supplier_audit_action
    CHECK (action IN (
        'submit','approve','reject','request_information',
        'suspend','unsuspend','portal_activated',
        'warehouse_assigned','warehouse_unassigned',
        'supplier.modules_updated'
    ))
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE supplier_review_audit DROP CONSTRAINT IF EXISTS ck_supplier_audit_action")
    op.execute("""
    ALTER TABLE supplier_review_audit
    ADD CONSTRAINT ck_supplier_audit_action
    CHECK (action IN (
        'submit','approve','reject','request_information',
        'suspend','unsuspend','portal_activated',
        'warehouse_assigned','warehouse_unassigned'
    ))
    """)
