"""Idempotent seed script for the FOODbakēd microsite demo.

Populates:
  • food_restaurant_photos          – gallery photos so the microsite hero + Photos tab render.
  • food_reservation_settings       – default capacity/hours so the reservations flow works.
  • food_restaurants.reservations_enabled – flipped to TRUE for demo rows.
  • food_reservation_areas + tables – Main Hall / Terrace layout for the demo restaurant.
  • food_restaurants.reservation_public   – flipped to TRUE only for the demo restaurant.

Usage:
  cd /app/backend && python -m scripts.seed_food_microsite_demo
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

# Make /app/backend importable when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://baked:baked_local_dev@127.0.0.1:5432/baked",
)

# 4-6 Unsplash photos per cuisine kind. Keys map to substrings in the slug.
GALLERY_BY_CUISINE = {
    "burger": [
        ("https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1600&h=1000&fit=crop", "food",     "Signature smash burger"),
        ("https://images.unsplash.com/photo-1550547660-d9450f859349?w=1600&h=1000&fit=crop", "food",     "Loaded cheese fries"),
        ("https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=1600&h=1000&fit=crop", "food",     "Double patty stack"),
        ("https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1600&h=1000&fit=crop", "interior", "Chef's counter"),
        ("https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&h=1000&fit=crop", "ambience", "Warm evening ambience"),
    ],
    "pizza": [
        ("https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1600&h=1000&fit=crop", "food",     "Wood-fired margherita"),
        ("https://images.unsplash.com/photo-1548365328-9f547fb0953a?w=1600&h=1000&fit=crop", "food",     "Truffle pepperoni"),
        ("https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1600&h=1000&fit=crop", "food",     "Sourdough crust"),
        ("https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1600&h=1000&fit=crop", "interior", "Open kitchen"),
        ("https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=1600&h=1000&fit=crop", "ambience", "Neapolitan corner"),
    ],
    "spice": [
        ("https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1600&h=1000&fit=crop", "food",     "Butter chicken"),
        ("https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=1600&h=1000&fit=crop", "food",     "Biryani platter"),
        ("https://images.unsplash.com/photo-1601050690597-df0568f70950?w=1600&h=1000&fit=crop", "food",     "Tandoori grill"),
        ("https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1600&h=1000&fit=crop", "interior", "Spice bar"),
        ("https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&h=1000&fit=crop", "ambience", "Sunset dining"),
    ],
    "gourmet": [
        ("https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&h=1000&fit=crop", "ambience", "Dining hall"),
        ("https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&h=1000&fit=crop", "ambience", "Candlelit setting"),
        ("https://images.unsplash.com/photo-1544025162-d76694265947?w=1600&h=1000&fit=crop", "food",     "Signature tasting plate"),
        ("https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=1600&h=1000&fit=crop", "food",     "Chef's amuse-bouche"),
        ("https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1600&h=1000&fit=crop", "interior", "Private booth"),
    ],
    "sushi": [
        ("https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=1600&h=1000&fit=crop", "food",     "Chef's nigiri set"),
        ("https://images.unsplash.com/photo-1553621042-f6e147245754?w=1600&h=1000&fit=crop", "food",     "Rainbow roll"),
        ("https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=1600&h=1000&fit=crop", "food",     "Sashimi flight"),
        ("https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1600&h=1000&fit=crop", "interior", "Sushi counter"),
        ("https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=1600&h=1000&fit=crop", "ambience", "Zen dining room"),
    ],
    "grill": [
        ("https://images.unsplash.com/photo-1544025162-d76694265947?w=1600&h=1000&fit=crop", "food",     "Reverse-seared ribeye"),
        ("https://images.unsplash.com/photo-1558030006-450675393462?w=1600&h=1000&fit=crop", "food",     "Grilled seafood platter"),
        ("https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=1600&h=1000&fit=crop", "food",     "Charcoal skewers"),
        ("https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&h=1000&fit=crop", "ambience", "Fire-lit terrace"),
        ("https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1600&h=1000&fit=crop", "interior", "Chef's grill"),
    ],
}

DEFAULT_HOURS = {
    "mon": [["12:00", "22:00"]],
    "tue": [["12:00", "22:00"]],
    "wed": [["12:00", "22:00"]],
    "thu": [["12:00", "22:00"]],
    "fri": [["12:00", "23:00"]],
    "sat": [["12:00", "23:00"]],
    "sun": [["12:00", "22:00"]],
}


def gallery_for(slug: str) -> list[tuple[str, str, str]]:
    key = next((k for k in GALLERY_BY_CUISINE if k in slug), "gourmet")
    return GALLERY_BY_CUISINE[key]


async def seed(session: AsyncSession) -> dict:
    counts = {"photos_inserted": 0, "settings_upserted": 0, "reservations_enabled": 0}

    rows = (
        await session.execute(text("SELECT id, slug FROM food_restaurants"))
    ).all()

    for rid, slug in rows:
        # ---- Photos: only insert if the restaurant has none, keep idempotent.
        existing = (
            await session.execute(
                text("SELECT COUNT(*) FROM food_restaurant_photos WHERE restaurant_id = :rid"),
                {"rid": rid},
            )
        ).scalar_one()
        if existing == 0:
            for idx, (url, category, caption) in enumerate(gallery_for(slug)):
                await session.execute(
                    text(
                        """
                        INSERT INTO food_restaurant_photos
                          (id, restaurant_id, url, category, caption, is_cover, sort_order)
                        VALUES (:id, :rid, :url, :category, :caption, :is_cover, :sort_order)
                        """
                    ),
                    {
                        "id": uuid.uuid4().hex[:32],
                        "rid": rid,
                        "url": url,
                        "category": category,
                        "caption": caption,
                        "is_cover": idx == 0,
                        "sort_order": idx,
                    },
                )
                counts["photos_inserted"] += 1

        # ---- Reservation settings upsert.
        await session.execute(
            text(
                """
                INSERT INTO food_reservation_settings
                  (restaurant_id, slot_capacity, min_party_size, max_party_size,
                   min_lead_time_minutes, slot_interval_minutes, advance_booking_days,
                   auto_confirm, hours, blackout_dates)
                VALUES
                  (:rid, 30, 1, 12, 60, 30, 60, false, CAST(:hours AS jsonb), CAST('[]' AS jsonb))
                ON CONFLICT (restaurant_id) DO NOTHING
                """
            ),
            {"rid": rid, "hours": json.dumps(DEFAULT_HOURS)},
        )
        counts["settings_upserted"] += 1

        # ---- Turn on reservations.
        await session.execute(
            text(
                "UPDATE food_restaurants SET reservations_enabled = TRUE WHERE id = :rid AND reservations_enabled = FALSE"
            ),
            {"rid": rid},
        )
        counts["reservations_enabled"] += 1

    await session.commit()
    return counts


DEMO_RESTAURANT_ID = "burger_hub_ci"
DEMO_LAYOUT = [
    ("Main Hall", [("T01", 2), ("T02", 4), ("T03", 4), ("T04", 6)]),
    ("Terrace",   [("T05", 2), ("T06", 4)]),
]


async def seed_demo_layout(session: AsyncSession) -> dict:
    """Configure the flagship demo restaurant so 'Book a Table' is visible."""
    counts = {"areas_added": 0, "tables_added": 0, "activated": 0}

    exists = (await session.execute(
        text("SELECT 1 FROM food_restaurants WHERE id = :id"),
        {"id": DEMO_RESTAURANT_ID},
    )).fetchone()
    if not exists:
        return counts

    for idx, (area_name, tables) in enumerate(DEMO_LAYOUT):
        area = (await session.execute(
            text("SELECT id FROM food_reservation_areas WHERE restaurant_id = :rid AND name = :n"),
            {"rid": DEMO_RESTAURANT_ID, "n": area_name},
        )).fetchone()
        if area:
            aid = area.id
        else:
            aid = uuid.uuid4().hex[:24]
            await session.execute(
                text("""
                    INSERT INTO food_reservation_areas (id, restaurant_id, name, sort_order, is_active)
                    VALUES (:id, :rid, :n, :o, TRUE)
                """),
                {"id": f"area_{aid}", "rid": DEMO_RESTAURANT_ID, "n": area_name, "o": idx},
            )
            aid = f"area_{aid}"
            counts["areas_added"] += 1

        for t_idx, (code, seats) in enumerate(tables):
            existing_tbl = (await session.execute(
                text("SELECT 1 FROM food_reservation_tables WHERE restaurant_id = :rid AND code = :c"),
                {"rid": DEMO_RESTAURANT_ID, "c": code},
            )).fetchone()
            if existing_tbl:
                continue
            await session.execute(
                text("""
                    INSERT INTO food_reservation_tables
                        (id, restaurant_id, area_id, code, seats, is_active, sort_order)
                    VALUES (:id, :rid, :aid, :c, :s, TRUE, :o)
                """),
                {
                    "id": f"tbl_{uuid.uuid4().hex[:20]}",
                    "rid": DEMO_RESTAURANT_ID, "aid": aid, "c": code, "s": seats, "o": t_idx,
                },
            )
            counts["tables_added"] += 1

    # Bump slot capacity to reflect the seat count so slot availability doesn't
    # cap the demo unnecessarily.
    total_seats = sum(s for _, tables in DEMO_LAYOUT for _, s in tables)
    await session.execute(
        text("""
            UPDATE food_reservation_settings
               SET slot_capacity = :cap, updated_at = now()
             WHERE restaurant_id = :rid
        """),
        {"rid": DEMO_RESTAURANT_ID, "cap": max(total_seats, 20)},
    )

    # Flip public flag to TRUE for demo only.
    res = await session.execute(
        text("""
            UPDATE food_restaurants
               SET reservation_public = TRUE, updated_at = now()
             WHERE id = :rid AND reservation_public = FALSE
        """),
        {"rid": DEMO_RESTAURANT_ID},
    )
    counts["activated"] = int(res.rowcount or 0)

    await session.commit()
    return counts


async def main() -> None:
    engine = create_async_engine(DATABASE_URL, future=True)
    async with AsyncSession(engine) as session:
        counts = await seed(session)
        demo = await seed_demo_layout(session)
    await engine.dispose()
    print("Seed complete:", counts)
    print("Demo layout:  ", demo)


if __name__ == "__main__":
    asyncio.run(main())
