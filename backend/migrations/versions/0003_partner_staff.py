"""partner_staff — Slice B

Adds `partner_staff` (RBAC teammates under a partner) and
`partner_staff_audit_log` (append-only trail of owner/manager actions).

Every statement uses IF NOT EXISTS so this migration is safe to run on
databases that already have these tables from a create_all() past.

Revision: 0003_partner_staff
Down-revision: 0002_partner_platform
"""
from alembic import op


revision      = "0003_partner_staff"
down_revision = "0002_partner_platform"
branch_labels = None
depends_on    = None


def _exec_many(stmts: list[str]) -> None:
    for s in stmts:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade() -> None:
    _exec_many([
        """
        CREATE TABLE IF NOT EXISTS partner_staff (
            id                    varchar        PRIMARY KEY,
            partner_id            varchar        NOT NULL REFERENCES partners(id),
            email                 varchar(200)   NOT NULL,
            name                  varchar(200)   NOT NULL,
            role                  varchar(32)    NOT NULL,
            password_hash         varchar,
            must_reset_password   boolean        NOT NULL DEFAULT false,
            invited_by_staff_id   varchar,
            invite_token          varchar,
            invite_expires_at     timestamptz,
            invite_accepted_at    timestamptz,
            is_active             boolean        NOT NULL DEFAULT true,
            last_login_at         timestamptz,
            created_at            timestamptz    NOT NULL DEFAULT now(),
            updated_at            timestamptz    NOT NULL DEFAULT now(),
            CONSTRAINT uq_partner_staff_email_per_partner UNIQUE (partner_id, email),
            CONSTRAINT uq_partner_staff_invite_token      UNIQUE (invite_token),
            CONSTRAINT ck_partner_staff_role CHECK (
                role IN ('manager','packer','cashier')
            )
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_partner_staff_partner_active ON partner_staff (partner_id, is_active)",

        """
        CREATE TABLE IF NOT EXISTS partner_staff_audit_log (
            id            varchar        PRIMARY KEY,
            partner_id    varchar        NOT NULL REFERENCES partners(id),
            actor_kind    varchar(24)    NOT NULL,
            actor_id      varchar        NOT NULL,
            actor_email   varchar(200)   NOT NULL,
            action        varchar(80)    NOT NULL,
            target_id     varchar,
            detail        varchar(500),
            created_at    timestamptz    NOT NULL DEFAULT now()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_partner_staff_audit_partner_created ON partner_staff_audit_log (partner_id, created_at)",
    ])


def downgrade() -> None:
    _exec_many([
        "DROP TABLE IF EXISTS partner_staff_audit_log CASCADE",
        "DROP TABLE IF EXISTS partner_staff           CASCADE",
    ])
