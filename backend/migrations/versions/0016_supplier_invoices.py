"""Phase 5 — supplier invoices with 3-way match.

Adds `supplier_invoices`, `supplier_invoice_lines`, and `supplier_invoice_audit`
tables. Enforces one-invoice-per-PO via a UNIQUE constraint on `po_id`; the
lines carry every quantity + cost data point separately so variance is fully
line-traceable (PO qty vs GRN qty vs invoiced qty; PO unit cost vs invoiced
unit cost + tolerance used).

Revision: 0016_supplier_invoices
Down-revision: 0015_replenishment_po_link
"""
from alembic import op


revision      = "0016_supplier_invoices"
down_revision = "0015_replenishment_po_link"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_invoices (
          id            varchar PRIMARY KEY,
          code          varchar UNIQUE NOT NULL,
          po_id         varchar NOT NULL UNIQUE REFERENCES purchase_orders(id) ON DELETE CASCADE,
          partner_id    varchar NOT NULL REFERENCES partners(id),
          supplier_id   varchar NOT NULL REFERENCES suppliers(id),
          warehouse_id  varchar NOT NULL REFERENCES warehouses(id),
          currency      varchar(4) NOT NULL,

          supplier_invoice_number varchar(80),
          invoice_date            date,

          subtotal      numeric(14,2) NOT NULL DEFAULT 0,
          tax_total     numeric(14,2) NOT NULL DEFAULT 0,
          grand_total   numeric(14,2) NOT NULL DEFAULT 0,

          status varchar(24) NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','submitted','matched','variance','approved','disputed','paid')),
          match_status varchar(24)
              CHECK (match_status IN ('matched','variance')),

          invoice_document_storage_path varchar(600),
          invoice_document_uploaded_at  timestamptz,

          tolerance_pct_used numeric(6,3),

          submitted_at  timestamptz,
          matched_at    timestamptz,
          approved_at   timestamptz,
          disputed_at   timestamptz,

          approval_notes  text,
          dispute_reason  text,
          override_notes  text,

          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_sinv_partner_status ON supplier_invoices (partner_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sinv_supplier_status ON supplier_invoices (supplier_id, status)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
          id             varchar PRIMARY KEY,
          invoice_id     varchar NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
          po_line_id     varchar NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
          product_name   varchar(200) NOT NULL,
          supplier_sku   varchar(80),

          qty_ordered    integer NOT NULL,
          qty_received   integer NOT NULL,
          qty_invoiced   integer NOT NULL,

          unit_cost_po       numeric(12,4) NOT NULL,
          unit_cost_invoiced numeric(12,4) NOT NULL,
          unit_cost_variance_pct numeric(8,3) NOT NULL DEFAULT 0,

          tax_pct        numeric(6,2) NOT NULL DEFAULT 0,
          line_total     numeric(14,2) NOT NULL DEFAULT 0,

          match_status varchar(24) NOT NULL DEFAULT 'matched'
              CHECK (match_status IN ('matched','qty_variance','cost_variance','both_variance')),
          match_notes  text,

          UNIQUE (invoice_id, po_line_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_invoice_audit (
          id           varchar PRIMARY KEY,
          invoice_id   varchar NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
          action       varchar(48) NOT NULL,
          from_status  varchar(24),
          to_status    varchar(24),
          actor_kind   varchar(24) NOT NULL,
          actor_id     varchar,
          actor_label  varchar(200),
          notes        text,
          created_at   timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_sinv_audit_invoice ON supplier_invoice_audit (invoice_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS supplier_invoice_audit")
    op.execute("DROP TABLE IF EXISTS supplier_invoice_lines")
    op.execute("DROP TABLE IF EXISTS supplier_invoices")
