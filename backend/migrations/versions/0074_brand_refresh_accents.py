"""Brand refresh — per-module accents stored in Super App home CMS sections."""
import json

from alembic import op
from sqlalchemy import text

revision = "0074_brand_refresh_accents"
down_revision = "0073_brand_refresh_b_names"
branch_labels = None
depends_on = None

COLORS = {"food": "#F26924", "shop": "#1D9BF0", "express": "#FCC44C", "mart": "#77BC1F"}
LINKS = {"/food": "food", "/shop": "shop", "/send": "express", "/mart": "mart"}


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.exec_driver_sql("select id, config::text from homepage_sections where module = 'baked'").fetchall()
    for sid, raw in rows:
        cfg = json.loads(raw or "{}")
        changed = False
        src = cfg.get("source_module")
        if src in COLORS and cfg.get("accent") != COLORS[src]:
            cfg["accent"] = COLORS[src]; changed = True
        for it in cfg.get("items") or []:
            if not isinstance(it, dict):
                continue
            mod = it.get("module") or LINKS.get((it.get("link") or "").rstrip("/"))
            if mod in COLORS and it.get("accent") and it.get("accent") != COLORS[mod]:
                it["accent"] = COLORS[mod]; changed = True
        if changed:
            conn.execute(text("update homepage_sections set config = CAST(:c AS jsonb) where id = :i"), {"c": json.dumps(cfg, ensure_ascii=False), "i": sid})


def downgrade() -> None:
    pass
