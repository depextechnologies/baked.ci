"""Extend supplier_review_audit action CHECK to include warehouse_assigned/unassigned.

Needed by Social.docx §9 admin routes.

Revision: 0028_supplier_audit_actions
Down-revision: 0027_supplier_warehouses
"""
from alembic import op


revision      = "0028_supplier_audit_actions"
down_revision = "0027_supplier_warehouses"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("ALTER TABLE supplier_review_audit DROP CONSTRAINT IF EXISTS ck_supplier_audit_action")
    op.execute("""
        ALTER TABLE supplier_review_audit ADD CONSTRAINT ck_supplier_audit_action CHECK (
            action IN (
                'submit','approve','reject','request_information',
                'suspend','unsuspend','portal_activated',
                'warehouse_assigned','warehouse_unassigned'
            )
        )
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE supplier_review_audit DROP CONSTRAINT IF EXISTS ck_supplier_audit_action")
    op.execute("""
        ALTER TABLE supplier_review_audit ADD CONSTRAINT ck_supplier_audit_action CHECK (
            action IN (
                'submit','approve','reject','request_information',
                'suspend','unsuspend','portal_activated'
            )
        )
    """)
