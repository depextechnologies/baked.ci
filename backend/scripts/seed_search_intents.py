"""Seed the DB-backed intent dictionary consumed by Global Search.

Phrases are stored in **normalised** form (lowercase, no accents, trimmed)
so the orchestrator's substring check is accent-insensitive. Each row maps
one short-phrase set → one action card shown at the top of the global
search results page.

Adding a new intent later is a one-row INSERT — no code change required.
Super Admin CRUD can be plumbed on top of this table without a migration.
"""
from __future__ import annotations

import hashlib

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


INTENTS = [
    # SEND — primary action-only module
    dict(module="send", code="send_parcel",
         phrases=["send parcel", "send a parcel", "book parcel", "parcel delivery",
                  "deliver package", "deliver parcel", "courier", "send document",
                  "envoyer un colis", "envoyer colis", "livraison colis",
                  "livrer un colis", "coursier", "envoyer document"],
         fr="Envoyer un colis", en="Send a parcel",
         sfr="Livraison porte-à-porte via SENDbakēd",
         sen="Door-to-door delivery via SENDbakēd",
         dest="/send/book/parcel", icon="package", weight=200),

    dict(module="send", code="book_truck",
         phrases=["book truck", "truck delivery", "move goods", "transport goods",
                  "camion", "reserver camion", "réserver camion", "livraison camion",
                  "transport marchandises"],
         fr="Réserver un véhicule", en="Book a vehicle",
         sfr="Transporter des articles volumineux",
         sen="Move larger items",
         dest="/send/book/vehicle", icon="truck", weight=180),

    dict(module="send", code="shift_home",
         phrases=["shift home", "home shifting", "move house", "relocation",
                  "demenagement", "déménagement", "demenager", "déménager",
                  "transport maison"],
         fr="Déménagement", en="Home shifting",
         sfr="Service de déménagement SENDbakēd",
         sen="SENDbakēd moving service",
         dest="/send/book/movers", icon="home", weight=170),

    # FOOD — reservation + discovery
    dict(module="food", code="book_table",
         phrases=["book table", "book a table", "reserve restaurant",
                  "reserve a table", "table reservation", "dinner reservation",
                  "reserver table", "réserver une table", "reserver restaurant",
                  "réserver un restaurant", "reservation restaurant",
                  "réservation restaurant"],
         fr="Trouver une table", en="Find a table",
         sfr="Réserver dans un restaurant FOODbakēd",
         sen="Reserve at a FOODbakēd restaurant",
         dest="/foodbaked?intent=reservation", icon="utensils", weight=180),

    dict(module="food", code="order_food",
         phrases=["order food", "food delivery", "livraison nourriture",
                  "commander à manger", "commander a manger", "commander nourriture"],
         fr="Commander un repas", en="Order food",
         sfr="Explorer les restaurants FOODbakēd",
         sen="Explore FOODbakēd restaurants",
         dest="/foodbaked", icon="utensils", weight=150),

    # MART
    dict(module="mart", code="grocery",
         phrases=["grocery", "groceries", "epicerie", "épicerie", "supermarche",
                  "supermarché", "faire les courses"],
         fr="Faire les courses", en="Grocery shopping",
         sfr="Parcourir les rayons MARTbakēd",
         sen="Browse MARTbakēd aisles",
         dest="/products", icon="shopping-cart", weight=140),

    # SHOP
    dict(module="shop", code="shop_fashion",
         phrases=["fashion", "clothing", "mode", "vetements", "vêtements"],
         fr="Mode & Vêtements", en="Fashion & Clothing",
         sfr="Découvrir les boutiques SHOPbakēd",
         sen="Discover SHOPbakēd stores",
         dest="/shopbaked?category=fashion", icon="shopping-bag", weight=130),

    # Future: AUTO / IMMO — not seeded until modules go live. Adding a row
    # is a single INSERT when AUTO/IMMO ship.
]


async def seed_intents(session: AsyncSession) -> dict:
    """Idempotent upsert — safe to run on every boot."""
    import json as _json
    inserted = updated = 0
    for row in INTENTS:
        iid = "si_" + hashlib.md5(f"{row['module']}:{row['code']}".encode()).hexdigest()[:16]
        res = await session.execute(text("""
            INSERT INTO search_intents
              (id, module, intent_code, phrases,
               action_label_fr, action_label_en,
               subtitle_fr, subtitle_en, destination, icon, weight, is_active)
            VALUES
              (:id, :m, :c, CAST(:ph AS JSONB),
               :fr, :en, :sfr, :sen, :dest, :ic, :w, TRUE)
            ON CONFLICT (module, intent_code) DO UPDATE SET
               phrases = EXCLUDED.phrases,
               action_label_fr = EXCLUDED.action_label_fr,
               action_label_en = EXCLUDED.action_label_en,
               subtitle_fr = EXCLUDED.subtitle_fr,
               subtitle_en = EXCLUDED.subtitle_en,
               destination = EXCLUDED.destination,
               icon = EXCLUDED.icon,
               weight = EXCLUDED.weight,
               is_active = TRUE,
               updated_at = now()
            RETURNING (xmax = 0) AS inserted
        """), {"id": iid, "m": row["module"], "c": row["code"],
                "ph": _json.dumps(row["phrases"]),
                "fr": row["fr"], "en": row["en"],
                "sfr": row["sfr"], "sen": row["sen"],
                "dest": row["dest"], "ic": row["icon"], "w": row["weight"]})
        row_r = res.fetchone()
        if row_r and row_r.inserted: inserted += 1
        else: updated += 1
    await session.commit()
    return {"inserted": inserted, "updated": updated}


if __name__ == "__main__":
    import asyncio
    from core.db import SessionLocal
    async def main():
        async with SessionLocal() as s:
            print(await seed_intents(s))
    asyncio.run(main())
