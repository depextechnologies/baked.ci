"""Global Search — search_intents + search_events tables.

`search_intents` is the DB-backed intent dictionary consumed by the Global
Search orchestrator. Seeded with FR/EN entries for MART / FOOD / SHOP / SEND
at boot time; AUTO/IMMO rows can be inserted later without a schema change.

`search_events` is a lightweight analytics log — one row per orchestrator
call plus one update when the user clicks a result. No admin UI in this
pass; the schema is ready for Super Admin CRUD later.

Revision:      0063_global_search
Down-revision: 0062_food_delivery_bridge
"""
from alembic import op


revision      = "0063_global_search"
down_revision = "0062_food_delivery_bridge"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS search_intents (
            id              VARCHAR(32) PRIMARY KEY,
            module          VARCHAR(16) NOT NULL,
            intent_code     VARCHAR(64) NOT NULL,
            phrases         JSONB       NOT NULL DEFAULT '[]',
            action_label_fr VARCHAR(140) NOT NULL,
            action_label_en VARCHAR(140) NOT NULL,
            subtitle_fr     VARCHAR(200),
            subtitle_en     VARCHAR(200),
            destination     VARCHAR(255) NOT NULL,
            icon            VARCHAR(32),
            weight          INTEGER      NOT NULL DEFAULT 100,
            is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_search_intents_module_active ON search_intents (module, is_active)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_search_intents_module_code ON search_intents (module, intent_code)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS search_events (
            id            VARCHAR(32) PRIMARY KEY,
            query         VARCHAR(500) NOT NULL,
            query_norm    VARCHAR(500) NOT NULL,
            language      VARCHAR(8)   NOT NULL DEFAULT 'fr',
            country       VARCHAR(2),
            customer_id   VARCHAR(64),
            result_count  INTEGER      NOT NULL DEFAULT 0,
            modules_hit   JSONB        NOT NULL DEFAULT '[]',
            clicked_module VARCHAR(16),
            clicked_type   VARCHAR(32),
            clicked_entity VARCHAR(255),
            latency_ms     INTEGER,
            created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_search_events_norm ON search_events (query_norm)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_search_events_created ON search_events (created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_search_events_zero ON search_events (query_norm) WHERE result_count = 0")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS search_events")
    op.execute("DROP TABLE IF EXISTS search_intents")
