"""Phase 7B — Unified Returns & Refunds for FOOD / MART / SHOP.

Design decisions (user-approved):
  * Unified ``returns`` table keyed on ``(order_id, order_module)`` so FOOD,
    MART and SHOP all share the same lifecycle.
  * ``return_items`` enables item-level partial refunds.
  * ``return_audit`` captures the full trail (customer / partner / admin / system).
  * ``return_policies`` holds the Super-Admin-configurable thresholds + windows.
    Specificity cascade (narrowest wins): product → category → module+country →
    module.
  * ``customer_refund_flags`` prevents auto-refund abuse — flagged customers
    always route to admin review.
  * Wallet refund destination needs a customer wallet; we create the two tables
    here so wallet refunds work day one. "Original method" is also supported but
    marked ``approved_pending_payout`` for admin-driven Stripe refund (follow-up).

Revision:      0068_returns_refunds
Down-revision: 0067_food_favourites
"""
from alembic import op


revision      = "0068_returns_refunds"
down_revision = "0067_food_favourites"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Policies — Super Admin configurable.
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS return_policies (
            id                        TEXT PRIMARY KEY,
            module                    TEXT NOT NULL CHECK (module IN ('food','mart','shop')),
            country                   TEXT NULL,
            category_id               TEXT NULL,
            product_id                TEXT NULL,
            window_hours              INTEGER NOT NULL,
            auto_approve_threshold    NUMERIC(14,2) NOT NULL DEFAULT 2000,
            threshold_currency        TEXT NOT NULL DEFAULT 'XOF',
            is_returnable             BOOLEAN NOT NULL DEFAULT TRUE,
            notes                     TEXT NULL,
            created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    # One policy row per specificity tuple.
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_return_policies_scope
            ON return_policies (
                module,
                COALESCE(country,''),
                COALESCE(category_id,''),
                COALESCE(product_id,'')
            )
    """)

    # ------------------------------------------------------------------
    # Returns header.
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS returns (
            id                       TEXT PRIMARY KEY,
            number                   TEXT NOT NULL,
            order_id                 TEXT NOT NULL,
            order_module             TEXT NOT NULL CHECK (order_module IN ('food','mart','shop')),
            customer_id              TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            partner_id               TEXT NULL,
            status                   TEXT NOT NULL DEFAULT 'draft',
            -- draft | pending_customer | awaiting_partner | partner_disputed |
            -- awaiting_admin | approved | partial_approved | rejected |
            -- approved_pending_payout | refunded | cancelled
            requested_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
            approved_amount          NUMERIC(14,2) NULL,
            currency                 TEXT NOT NULL DEFAULT 'XOF',
            refund_destination       TEXT NOT NULL DEFAULT 'wallet',
            destination_detail       TEXT NULL,
            auto_approved            BOOLEAN NOT NULL DEFAULT FALSE,
            policy_id                TEXT NULL,
            delivered_at_snapshot    TIMESTAMPTZ NULL,
            partner_due_at           TIMESTAMPTZ NULL,
            partner_decision         TEXT NULL,   -- approve | partial | dispute | reject
            partner_decision_reason  TEXT NULL,
            partner_decided_at       TIMESTAMPTZ NULL,
            admin_decision           TEXT NULL,   -- approve | partial | reject
            admin_decision_reason    TEXT NULL,
            admin_decided_at         TIMESTAMPTZ NULL,
            escalated_at             TIMESTAMPTZ NULL,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            closed_at                TIMESTAMPTZ NULL
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_returns_number ON returns (number)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_returns_customer ON returns (customer_id, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_returns_order    ON returns (order_id, order_module)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_returns_status   ON returns (status, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_returns_partner  ON returns (partner_id, status) WHERE partner_id IS NOT NULL")

    # ------------------------------------------------------------------
    # Line-item breakdown (partial refund support).
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS return_items (
            id              TEXT PRIMARY KEY,
            return_id       TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
            order_item_id   TEXT NOT NULL,
            name_snapshot   TEXT NOT NULL,
            qty             INTEGER NOT NULL DEFAULT 1,
            unit_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
            line_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
            reason_code     TEXT NULL,
            reason_text     TEXT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_return_items_return ON return_items (return_id)")

    # ------------------------------------------------------------------
    # Evidence (photos, notes).
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS return_evidence (
            id          TEXT PRIMARY KEY,
            return_id   TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
            kind        TEXT NOT NULL CHECK (kind IN ('photo','note')),
            url         TEXT NULL,
            note        TEXT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_return_evidence_return ON return_evidence (return_id)")

    # ------------------------------------------------------------------
    # Audit trail — every status change goes here.
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS return_audit (
            id           TEXT PRIMARY KEY,
            return_id    TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
            actor_type   TEXT NOT NULL CHECK (actor_type IN ('customer','partner','admin','system')),
            actor_id     TEXT NULL,
            action       TEXT NOT NULL,
            from_status  TEXT NULL,
            to_status    TEXT NULL,
            note         TEXT NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_return_audit_return ON return_audit (return_id, created_at)")

    # ------------------------------------------------------------------
    # Abuse flagging — one row per customer, keeps auto-refund off for them.
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_refund_flags (
            customer_id   TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
            risk_level    TEXT NOT NULL DEFAULT 'review',  -- review | block
            reason        TEXT NULL,
            flagged_by    TEXT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # ------------------------------------------------------------------
    # Customer wallet (needed so wallet refunds actually land somewhere).
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_wallet_balances (
            customer_id   TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
            balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
            currency      TEXT NOT NULL DEFAULT 'XOF',
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_wallet_transactions (
            id            TEXT PRIMARY KEY,
            customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            delta         NUMERIC(14,2) NOT NULL,
            balance_after NUMERIC(14,2) NOT NULL,
            currency      TEXT NOT NULL DEFAULT 'XOF',
            source_type   TEXT NOT NULL,          -- refund | topup | adjustment | checkout_debit
            source_id     TEXT NULL,
            note          TEXT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_cust_wallet_txn_customer ON customer_wallet_transactions (customer_id, created_at DESC)")

    # ------------------------------------------------------------------
    # Default policies — Super Admin can edit via API later.
    # ------------------------------------------------------------------
    for mod, hours, thr in (("food", 2, 2000),
                            ("mart", 7 * 24, 2000),
                            ("shop", 7 * 24, 2000)):
        op.execute(f"""
            INSERT INTO return_policies (id, module, window_hours, auto_approve_threshold)
            VALUES ('pol_default_{mod}', '{mod}', {hours}, {thr})
            ON CONFLICT (module, COALESCE(country,''), COALESCE(category_id,''), COALESCE(product_id,''))
            DO NOTHING
        """)


def downgrade() -> None:
    for t in ("customer_wallet_transactions", "customer_wallet_balances",
              "customer_refund_flags", "return_audit", "return_evidence",
              "return_items", "returns", "return_policies"):
        op.execute(f"DROP TABLE IF EXISTS {t}")
