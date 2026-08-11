"""multi_store_foundation — Phase 1 of true multi-dark-store architecture

Adds:
  - `warehouses.status` lifecycle enum (VARCHAR + CHECK)
  - Richer store profile columns on `warehouses`
  - `partner_staff.employee_code` (human-readable Employee ID)
  - `partner_staff.warehouse_id` (primary store assignment)
  - `partner_staff_store_assignments` (multi-store forward-compat)
  - Extended role CHECK on `partner_staff` (adds supervisor,
    inventory_manager, warehouse_manager, customer_support)

Idempotent: every ALTER guarded by IF NOT EXISTS / conditional CHECK swap
so a re-run against a partially-applied DB never blows up.

Revision: 0005_multi_store_foundation
Down-revision: 0004_warehouse_code
"""
from alembic import op


revision      = "0005_multi_store_foundation"
down_revision = "0004_warehouse_code"
branch_labels = None
depends_on    = None


# Whitelisted lifecycle statuses per Fixing_Prompt §9. "active" is the only
# status that permits order fulfilment.
_WAREHOUSE_STATUSES = (
    "pending", "under_review", "additional_info_required", "approved",
    "rejected", "setup_required", "setup_in_progress",
    "active", "temporarily_suspended", "maintenance", "closed",
)

_STAFF_ROLES = (
    "manager", "packer", "cashier",
    "supervisor", "inventory_manager", "warehouse_manager", "customer_support",
)  # "owner" lives on the Partner row itself, not partner_staff.


def upgrade() -> None:
    # ----- warehouses.status + richer profile -----
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS status varchar(40)")
    op.execute("""
        UPDATE warehouses
           SET status = CASE WHEN is_active THEN 'active' ELSE 'temporarily_suspended' END
         WHERE status IS NULL
    """)
    op.execute("ALTER TABLE warehouses ALTER COLUMN status SET NOT NULL")
    op.execute("ALTER TABLE warehouses ALTER COLUMN status SET DEFAULT 'active'")
    _statuses_sql = ",".join(f"'{s}'" for s in _WAREHOUSE_STATUSES)
    op.execute("ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS ck_warehouses_status")
    op.execute(f"ALTER TABLE warehouses ADD CONSTRAINT ck_warehouses_status "
               f"CHECK (status IN ({_statuses_sql}))")

    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS region varchar(120)")
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS operating_hours jsonb")
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS time_zone varchar(64)")
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS store_type varchar(40)")
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS warehouse_capacity_sqm numeric(10,2)")
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS opening_date date")
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS contact_email varchar(200)")
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS contact_phone varchar(40)")
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS store_manager_staff_id varchar")
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_warehouses_status
                              ON warehouses(status)
    """)

    # ----- partner_staff.employee_code + warehouse_id -----
    op.execute("ALTER TABLE partner_staff ADD COLUMN IF NOT EXISTS employee_code varchar(32)")
    op.execute("ALTER TABLE partner_staff ADD COLUMN IF NOT EXISTS warehouse_id varchar")

    # Back-fill employee_code deterministically for existing staff rows:
    # EMP-{CITY3}-{seq:03d} per (partner_id, city).
    op.execute("""
        WITH ranked AS (
            SELECT s.id,
                   UPPER(SUBSTRING(REGEXP_REPLACE(COALESCE(w.city, 'XXX'), '[^A-Za-z]', '', 'g')
                                   FROM 1 FOR 3)) AS city3,
                   ROW_NUMBER() OVER (
                     PARTITION BY s.partner_id
                     ORDER BY s.created_at, s.id
                   ) AS seq
              FROM partner_staff s
              LEFT JOIN warehouses w
                     ON w.partner_id = s.partner_id
                    AND w.is_active
             WHERE s.employee_code IS NULL
        )
        UPDATE partner_staff s
           SET employee_code = 'EMP-' || COALESCE(ranked.city3, 'XXX') || '-'
                            || LPAD(ranked.seq::text, 3, '0')
          FROM ranked
         WHERE ranked.id = s.id
    """)

    # Back-fill warehouse_id — 1 partner : 1 active warehouse in the MVP,
    # so we can safely assign every staff row to their partner's warehouse.
    op.execute("""
        UPDATE partner_staff s
           SET warehouse_id = w.id
          FROM warehouses w
         WHERE w.partner_id = s.partner_id
           AND w.is_active
           AND s.warehouse_id IS NULL
    """)

    # Uniqueness: employee_code unique WITHIN a partner (not globally — different
    # partners can each have their own EMP-ABJ-001).
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_staff_emp_code_per_partner
                                       ON partner_staff(partner_id, employee_code)
    """)

    # Extended role CHECK
    _roles_sql = ",".join(f"'{r}'" for r in _STAFF_ROLES)
    op.execute("ALTER TABLE partner_staff DROP CONSTRAINT IF EXISTS ck_partner_staff_role")
    op.execute(f"ALTER TABLE partner_staff ADD CONSTRAINT ck_partner_staff_role "
               f"CHECK (role IN ({_roles_sql}))")

    # ----- partner_staff_store_assignments (multi-store forward-compat) -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_staff_store_assignments (
            id             varchar PRIMARY KEY,
            staff_id       varchar NOT NULL REFERENCES partner_staff(id) ON DELETE CASCADE,
            warehouse_id   varchar NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
            is_primary     boolean NOT NULL DEFAULT false,
            created_at     timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_pssa_staff_warehouse
                                       ON partner_staff_store_assignments(staff_id, warehouse_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_pssa_warehouse
                                ON partner_staff_store_assignments(warehouse_id)
    """)

    # Back-fill assignment rows from partner_staff.warehouse_id (idempotent).
    op.execute("""
        INSERT INTO partner_staff_store_assignments (id, staff_id, warehouse_id, is_primary)
        SELECT ('psa_' || substr(md5(s.id || w.id), 1, 20)),
               s.id, s.warehouse_id, true
          FROM partner_staff s
          JOIN warehouses w ON w.id = s.warehouse_id
         WHERE s.warehouse_id IS NOT NULL
         ON CONFLICT (staff_id, warehouse_id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS partner_staff_store_assignments")
    op.execute("DROP INDEX IF EXISTS uq_partner_staff_emp_code_per_partner")
    op.execute("ALTER TABLE partner_staff DROP CONSTRAINT IF EXISTS ck_partner_staff_role")
    # Restore original 3-role CHECK from 0003.
    op.execute("ALTER TABLE partner_staff ADD CONSTRAINT ck_partner_staff_role "
               "CHECK (role IN ('manager','packer','cashier'))")
    op.execute("ALTER TABLE partner_staff DROP COLUMN IF EXISTS warehouse_id")
    op.execute("ALTER TABLE partner_staff DROP COLUMN IF EXISTS employee_code")

    op.execute("ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS ck_warehouses_status")
    op.execute("DROP INDEX IF EXISTS ix_warehouses_status")
    for col in ("status", "region", "operating_hours", "time_zone", "store_type",
                "warehouse_capacity_sqm", "opening_date", "contact_email",
                "contact_phone", "store_manager_staff_id"):
        op.execute(f"ALTER TABLE warehouses DROP COLUMN IF EXISTS {col}")
