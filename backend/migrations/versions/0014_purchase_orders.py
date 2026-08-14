"""purchase_orders — Phase 3 Purchase Orders module.

Creates:
  * purchase_orders          — PO header (buyer warehouse + supplier + status + totals).
  * purchase_order_lines     — one row per SKU on the PO with qty_ordered / unit_cost / tax.
  * purchase_order_receipts  — a receipt event references a PO + records per-line qty received.
  * purchase_order_receipt_lines — line-level receipt qty (per receipt event).
  * purchase_order_audit     — every status transition + who did it + notes.

Revision: 0014_purchase_orders
Down-revision: 0013_supplier_catalogue
"""
from alembic import op


revision      = "0014_purchase_orders"
down_revision = "0013_supplier_catalogue"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ---- purchase_orders (header) ----
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_orders (
            id                     varchar PRIMARY KEY,
            po_code                varchar(40) UNIQUE NOT NULL,
            partner_id             varchar NOT NULL REFERENCES partners(id),
            warehouse_id           varchar NOT NULL REFERENCES warehouses(id),
            supplier_id            varchar NOT NULL REFERENCES suppliers(id),
            currency               varchar(8) NOT NULL,
            status                 varchar(24) NOT NULL DEFAULT 'draft',
            expected_delivery_date date,
            notes                  text,
            subtotal               numeric(14,4) NOT NULL DEFAULT 0,
            tax_total              numeric(14,4) NOT NULL DEFAULT 0,
            grand_total            numeric(14,4) NOT NULL DEFAULT 0,
            created_by_partner_id  varchar REFERENCES partners(id),
            created_by_staff_id    varchar REFERENCES partner_staff(id),
            submitted_at           timestamptz,
            acknowledged_at        timestamptz,
            shipped_at             timestamptz,
            received_at            timestamptz,
            cancelled_at           timestamptz,
            cancellation_reason    text,
            created_at             timestamptz NOT NULL DEFAULT now(),
            updated_at             timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_po_status CHECK (status IN
                ('draft','submitted','acknowledged','shipped',
                 'partially_received','received','cancelled'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_po_partner_status ON purchase_orders(partner_id, status, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_po_supplier_status ON purchase_orders(supplier_id, status, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_po_warehouse ON purchase_orders(warehouse_id)")

    # ---- purchase_order_lines ----
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_order_lines (
            id                    varchar PRIMARY KEY,
            purchase_order_id     varchar NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
            supplier_product_id   varchar REFERENCES supplier_products(id),
            master_product_id     varchar NOT NULL REFERENCES mart_products(id),
            supplier_sku          varchar(120),
            product_name          varchar(400) NOT NULL,
            qty_ordered           integer NOT NULL,
            qty_received          integer NOT NULL DEFAULT 0,
            unit_cost             numeric(14,4) NOT NULL,
            tax_pct               numeric(5,2) NOT NULL DEFAULT 0,
            line_subtotal         numeric(14,4) NOT NULL DEFAULT 0,
            line_tax              numeric(14,4) NOT NULL DEFAULT 0,
            line_total            numeric(14,4) NOT NULL DEFAULT 0,
            notes                 text,
            created_at            timestamptz NOT NULL DEFAULT now(),
            updated_at            timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_po_line_qty CHECK (qty_ordered >= 1),
            CONSTRAINT ck_po_line_qty_recv CHECK (qty_received >= 0 AND qty_received <= qty_ordered),
            CONSTRAINT ck_po_line_cost CHECK (unit_cost >= 0)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_po_lines_po ON purchase_order_lines(purchase_order_id)")

    # ---- purchase_order_receipts (event) ----
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_order_receipts (
            id                    varchar PRIMARY KEY,
            purchase_order_id     varchar NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
            received_at           timestamptz NOT NULL DEFAULT now(),
            received_by_partner_id varchar REFERENCES partners(id),
            received_by_staff_id  varchar REFERENCES partner_staff(id),
            notes                 text,
            created_at            timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_po_receipts_po ON purchase_order_receipts(purchase_order_id, received_at DESC)")

    # ---- purchase_order_receipt_lines ----
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_order_receipt_lines (
            id                 varchar PRIMARY KEY,
            receipt_id         varchar NOT NULL REFERENCES purchase_order_receipts(id) ON DELETE CASCADE,
            po_line_id         varchar NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
            qty_received       integer NOT NULL,
            movement_id        varchar,
            created_at         timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_po_receipt_line_qty CHECK (qty_received >= 1)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_po_receipt_lines_receipt ON purchase_order_receipt_lines(receipt_id)")

    # ---- purchase_order_audit ----
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_order_audit (
            id                 varchar PRIMARY KEY,
            purchase_order_id  varchar NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
            actor_kind         varchar(24) NOT NULL,
            actor_id           varchar,
            actor_label        varchar(200),
            action             varchar(40) NOT NULL,
            from_status        varchar(24),
            to_status          varchar(24),
            notes              text,
            created_at         timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_po_audit_actor CHECK (actor_kind IN
                ('partner_owner','partner_staff','supplier','admin','system'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_po_audit_po ON purchase_order_audit(purchase_order_id, created_at DESC)")


def downgrade() -> None:
    for tbl in (
        "purchase_order_audit", "purchase_order_receipt_lines",
        "purchase_order_receipts", "purchase_order_lines", "purchase_orders",
    ):
        op.execute(f"DROP TABLE IF EXISTS {tbl}")
