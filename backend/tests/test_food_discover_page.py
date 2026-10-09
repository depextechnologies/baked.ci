"""FOODbakēd category-based discovery — menu-item search + 15 km radius +
delivery-zone marking. Covers the Fixing_Prompt test matrix.
"""
from __future__ import annotations
import os, pathlib, uuid, asyncio
import requests
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv(pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env")
load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

BASE = os.environ["REACT_APP_BACKEND_URL"]
DB   = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)
DISCOVER = f"{BASE}/api/food/restaurants/discover"

ABIDJAN = (5.3484, -4.0017)


def _run(c):
    l = asyncio.new_event_loop()
    try: return l.run_until_complete(c)
    finally: l.close()


async def _db(sql, **p):
    eng = create_async_engine(DB, future=True)
    try:
        async with eng.begin() as c:
            r = await c.execute(text(sql), p)
            return r.fetchall() if r.returns_rows else []
    finally:
        await eng.dispose()


async def _mk_rest(*, name, lat, lng, country="CI", radius=5, delivery=True,
                   pickup=False, is_open=True, cuisines=None, featured=False):
    rid = f"r_d_{uuid.uuid4().hex[:8]}"
    cuisines = cuisines or []
    import json as _j
    await _db("""
        INSERT INTO food_restaurants
          (id, name, slug, country, status, is_open, featured, cuisines,
           latitude, longitude, delivery_enabled, delivery_radius_km,
           pickup_enabled, prep_time_min, prep_time_max,
           reservations_enabled, reservation_public,
           created_at, updated_at)
        VALUES (:id, :n, :s, :c, 'active', :io, :ft, CAST(:cu AS JSONB),
                :lat, :lng, :de, :rr, :pe, 20, 30, FALSE, FALSE,
                now(), now())
    """, id=rid, n=name, s=rid, c=country, io=is_open, ft=featured,
         cu=_j.dumps(cuisines), lat=lat, lng=lng,
         de=delivery, rr=radius, pe=pickup)
    return rid


async def _mk_dish(rid, name, *, price=1000, is_available=True, is_veg=False):
    did = f"mi_{uuid.uuid4().hex[:10]}"
    sid = f"sec_{uuid.uuid4().hex[:8]}"
    import json as _j
    await _db("""
        INSERT INTO food_menu_sections (id, restaurant_id, name_en, name_fr, sort_order, created_at)
        VALUES (:sid, :r, 'Main', 'Principal', 0, now())
        ON CONFLICT (id) DO NOTHING
    """, sid=sid, r=rid)
    await _db("""
        INSERT INTO food_menu_items (id, restaurant_id, section_id, name,
          base_price, currency, is_veg, tags, is_available, sort_order,
          created_at, updated_at)
        VALUES (:id, :r, :s, :n, :p, 'XOF', :v, '[]'::jsonb, :a, 0, now(), now())
    """, id=did, r=rid, s=sid, n=name, p=price, v=is_veg, a=is_available)


async def _cleanup(ids):
    if not ids: return
    await _db("DELETE FROM food_menu_items WHERE restaurant_id = ANY(:r)", r=ids)
    await _db("DELETE FROM food_menu_sections WHERE restaurant_id = ANY(:r)", r=ids)
    await _db("DELETE FROM food_restaurants WHERE id = ANY(:r)", r=ids)


# ─── Pure helpers ─────────────────────────────────────────────────────────
def test_known_categories_includes_biryani_and_pizza():
    from modules.food.category_synonyms import synonyms_for, all_categories
    assert "pizza"   in all_categories()
    assert "biryani" in all_categories()
    assert "margherita" in synonyms_for("pizza")
    assert "biryani"    in synonyms_for("biryani")


# ─── Spec test matrix ─────────────────────────────────────────────────────
def test_restaurant_with_pizza_item_and_indian_cuisine_shows_for_pizza():
    """Spec example §3 — Indian-tagged venue with a Pizza menu item must
    appear when the Pizza chip is clicked."""
    rid = _run(_mk_rest(name="Indian Fusion", lat=5.3485, lng=-4.0018,
                        cuisines=["indian"]))
    _run(_mk_dish(rid, "Chicken Pizza"))
    try:
        r = requests.get(DISCOVER, params={
            "category": "pizza", "country": "CI",
            "lat": ABIDJAN[0], "lng": ABIDJAN[1],
            "fulfillment_mode": "delivery", "limit": 48,
        }, timeout=10).json()
        ids = [i["id"] for i in r["items"]]
        assert rid in ids
        card = next(i for i in r["items"] if i["id"] == rid)
        assert card["matched_items"] and card["matched_items"][0]["name"] == "Chicken Pizza"
    finally:
        _run(_cleanup([rid]))


def test_sold_out_pizza_items_do_not_qualify():
    rid = _run(_mk_rest(name="Only Sold Out", lat=5.3485, lng=-4.0018, cuisines=["american"]))
    _run(_mk_dish(rid, "Pepperoni Pizza", is_available=False))
    try:
        r = requests.get(DISCOVER, params={"category":"pizza","country":"CI",
            "lat":ABIDJAN[0],"lng":ABIDJAN[1],"limit":48}, timeout=10).json()
        assert rid not in [i["id"] for i in r["items"]]
    finally:
        _run(_cleanup([rid]))


def test_outside_15km_is_excluded():
    rid = _run(_mk_rest(name="Far Pizza", lat=6.5, lng=-4.0, cuisines=["italian"]))
    _run(_mk_dish(rid, "Margherita"))
    try:
        r = requests.get(DISCOVER, params={"category":"pizza","country":"CI",
            "lat":ABIDJAN[0],"lng":ABIDJAN[1],"limit":48}, timeout=10).json()
        assert rid not in [i["id"] for i in r["items"]]
    finally:
        _run(_cleanup([rid]))


def test_inside_15km_but_outside_delivery_zone_is_flagged():
    """User-emphasised rule — 10 km from customer with 3 km own radius must
    appear but with delivery_eligible=False + reason='outside_zone'."""
    rid = _run(_mk_rest(name="Faraway Delivery", lat=5.43, lng=-4.00,
                        cuisines=["italian"], radius=3))
    _run(_mk_dish(rid, "Margherita Pizza"))
    try:
        r = requests.get(DISCOVER, params={"category":"pizza","country":"CI",
            "lat":ABIDJAN[0],"lng":ABIDJAN[1],"fulfillment_mode":"delivery",
            "limit":48}, timeout=10).json()
        card = next((i for i in r["items"] if i["id"] == rid), None)
        assert card is not None
        assert card["distance_km"] < 15
        assert card["delivery_eligible"] is False
        assert card["delivery_unavailable_reason"] == "outside_zone"
    finally:
        _run(_cleanup([rid]))


def test_pickup_mode_hides_non_pickup_restaurants():
    rid = _run(_mk_rest(name="DeliveryOnly", lat=5.3485, lng=-4.0018,
                        cuisines=["italian"], pickup=False))
    _run(_mk_dish(rid, "Margherita Pizza"))
    try:
        r = requests.get(DISCOVER, params={"category":"pizza","country":"CI",
            "lat":ABIDJAN[0],"lng":ABIDJAN[1],"fulfillment_mode":"pickup",
            "limit":48}, timeout=10).json()
        assert rid not in [i["id"] for i in r["items"]]
    finally:
        _run(_cleanup([rid]))


def test_dedupes_restaurant_with_multiple_matching_dishes():
    rid = _run(_mk_rest(name="MultiPizza", lat=5.3485, lng=-4.0018, cuisines=["italian"]))
    _run(_mk_dish(rid, "Margherita"))
    _run(_mk_dish(rid, "Pepperoni"))
    _run(_mk_dish(rid, "Veg Pizza"))
    try:
        r = requests.get(DISCOVER, params={"category":"pizza","country":"CI",
            "lat":ABIDJAN[0],"lng":ABIDJAN[1],"limit":48}, timeout=10).json()
        matches = [i for i in r["items"] if i["id"] == rid]
        assert len(matches) == 1
        assert len(matches[0]["matched_items"]) == 3
    finally:
        _run(_cleanup([rid]))


def test_cuisine_hint_qualifies_restaurant_without_dish_name_hit():
    """A venue tagged `cuisines=['italian']` qualifies for Pizza even if
    its dish names don't match the synonym list."""
    rid = _run(_mk_rest(name="LegitPizzeria", lat=5.3485, lng=-4.0018,
                        cuisines=["italian"]))
    _run(_mk_dish(rid, "House special"))
    try:
        r = requests.get(DISCOVER, params={"category":"pizza","country":"CI",
            "lat":ABIDJAN[0],"lng":ABIDJAN[1],"limit":48}, timeout=10).json()
        assert rid in [i["id"] for i in r["items"]]
    finally:
        _run(_cleanup([rid]))


def test_rating_filter():
    rid = _run(_mk_rest(name="LowRating", lat=5.3485, lng=-4.0018, cuisines=["italian"]))
    _run(_mk_dish(rid, "Margherita"))
    _run(_db("UPDATE food_restaurants SET rating = 2.5 WHERE id = :r", r=rid))
    try:
        r = requests.get(DISCOVER, params={"category":"pizza","country":"CI",
            "lat":ABIDJAN[0],"lng":ABIDJAN[1],"min_rating":4.0,"limit":48},
            timeout=10).json()
        assert rid not in [i["id"] for i in r["items"]]
    finally:
        _run(_cleanup([rid]))


def test_vegetarian_pure_veg_filters_non_veg_dishes():
    rid = _run(_mk_rest(name="MixedMenu", lat=5.3485, lng=-4.0018, cuisines=["indian"]))
    _run(_mk_dish(rid, "Chicken Biryani", is_veg=False))
    try:
        r_all = requests.get(DISCOVER, params={"category":"biryani","country":"CI",
            "lat":ABIDJAN[0],"lng":ABIDJAN[1],"limit":48}, timeout=10).json()
        r_veg = requests.get(DISCOVER, params={"category":"biryani","country":"CI",
            "lat":ABIDJAN[0],"lng":ABIDJAN[1],"vegetarian":"pure_veg","limit":48},
            timeout=10).json()
        assert rid in [i["id"] for i in r_all["items"]]
        # The restaurant was cuisine-hint eligible (indian) so it still
        # shows up; but when veg-filter kicks in, cuisine_hints keeps the
        # row — that's fine because the UI card then shows no matched
        # items. We only need to confirm the veg filter changes the dish
        # preview content.
        if rid in [i["id"] for i in r_veg["items"]]:
            card = next(i for i in r_veg["items"] if i["id"] == rid)
            assert all(m["is_veg"] for m in card["matched_items"])
    finally:
        _run(_cleanup([rid]))


def test_categories_endpoint_returns_fr_and_en_labels():
    r = requests.get(f"{BASE}/api/food/categories?include_synonyms=true", timeout=10).json()
    codes = {c["code"] for c in r["items"]}
    assert {"pizza", "burgers", "indian"} <= codes
    pizza = next(c for c in r["items"] if c["code"] == "pizza")
    assert pizza["name_fr"] and pizza["name_en"]
    assert "margherita" in pizza["synonyms"]
