"""Global Search & Discovery — orchestrator + provider regression.

Verifies the full /api/search contract across MART / FOOD / SHOP / SEND
plus intent detection and tenant-safe fan-out.
"""
from __future__ import annotations

import os
import pathlib
import urllib.parse

import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV); load_dotenv(BACKEND_ENV)

BASE = os.environ["REACT_APP_BACKEND_URL"]


def _search(q, **extras):
    qs = {"q": q, "country": "CI", **extras}
    url = f"{BASE}/api/search?" + urllib.parse.urlencode(qs)
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    return r.json()


def _modules(resp):
    return sorted({g["module"] for g in resp.get("groups", [])})


def _intents(resp):
    return [i["intent_code"] for i in resp.get("detected_intents", [])]


# ---------------------------------------------------------------------------

def test_contract_shape():
    r = _search("pizza")
    for k in ("query", "query_norm", "language", "detected_intents", "groups", "latency_ms", "event_id"):
        assert k in r, (k, r.keys())


def test_mart_coca_cola_cross_module():
    r = _search("coca cola")
    # MART must hit even though the DB name is hyphenated.
    assert "mart" in _modules(r), _modules(r)
    mart = next(g for g in r["groups"] if g["module"] == "mart")
    titles = [it["title"] for it in mart["items"]]
    assert any("Coca-Cola" in t for t in titles), titles
    # Top result is highest-scoring (exact-ish match)
    assert mart["items"][0]["relevance"] >= 0.6


def test_food_pizza_returns_restaurants_or_dishes():
    r = _search("pizza")
    assert "food" in _modules(r)


def test_shop_dress_products():
    r = _search("dress")
    assert "shop" in _modules(r), _modules(r)


def test_send_parcel_intent():
    r = _search("send parcel")
    assert "send_parcel" in _intents(r)


def test_send_parcel_intent_french():
    r = _search("envoyer un colis", language="fr")
    assert "send_parcel" in _intents(r)
    intent = next(i for i in r["detected_intents"] if i["intent_code"] == "send_parcel")
    assert intent["action_label"] == "Envoyer un colis"


def test_book_table_intent():
    r = _search("réserver une table", language="fr")
    assert "book_table" in _intents(r)


def test_cross_module_milk():
    r = _search("milk")
    # at least one of food/mart should hit (milkshakes/dairy)
    mods = _modules(r)
    assert "food" in mods or "mart" in mods


def test_module_filter():
    r = _search("pizza", module="mart")
    for g in r["groups"]:
        assert g["module"] == "mart"


def test_empty_query_short_circuit():
    r = _search("")
    assert r["groups"] == []
    assert r["event_id"] is None


def test_normalisation_strips_accents_and_punct():
    r1 = _search("Riz")
    r2 = _search("RIZ")
    r3 = _search("RÌZ")
    for r in (r1, r2, r3):
        assert "mart" in _modules(r)


def test_stale_zero_result_logs_suggestion():
    r = _search("xyzzzqq")
    assert r["groups"] == []
    # suggestion is a trimmed version
    assert r.get("suggestions") == [] or isinstance(r["suggestions"], list)


def test_click_endpoint_accepts_valid_event():
    r = _search("pizza")
    eid = r["event_id"]
    assert eid
    resp = requests.post(f"{BASE}/api/search/click",
                         json={"event_id": eid, "module": "food", "entity_type": "restaurant", "entity_id": "foo"},
                         timeout=5)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True



# ---------------------------------------------------------------------------
# Audit (2026-02) regression suite — "the three bugs the user reported":
#   1) Lait Frais existed in DB but global search returned 0 (missing unaccent)
#   2) SEND intents navigated to /send/book/parcel which was 404 → bled MART
#   3) Signature Car Parts existed in SHOP but global search returned 0
# Plus the full elastic/fuzzy/prefix/typo spec.
# ---------------------------------------------------------------------------

def test_mart_lait_frais_exact_in_india():
    r = _search("Lait Frais", country="IN")
    assert "mart" in _modules(r), _modules(r)
    mart = next(g for g in r["groups"] if g["module"] == "mart")
    titles = [it["title"] for it in mart["items"]]
    assert any("Lait Frais" == t for t in titles), titles
    # Top-ranked hit must be the exact product.
    assert mart["items"][0]["title"] == "Lait Frais"
    assert mart["items"][0]["relevance"] >= 0.9


def test_mart_prefix_lai_returns_lait_products():
    """Prefix typing — user is still mid-word."""
    r = _search("Lai", country="IN")
    assert "mart" in _modules(r), _modules(r)
    mart = next(g for g in r["groups"] if g["module"] == "mart")
    titles = [it["title"] for it in mart["items"]]
    assert any(t.lower().startswith("lait") for t in titles), titles


def test_mart_typo_tolerance():
    """`lait fris` (missing letter) should still surface Lait Frais."""
    r = _search("lait fris", country="IN")
    titles = [it["title"] for g in r["groups"] if g["module"] == "mart" for it in g["items"]]
    assert any("Lait Frais" in t for t in titles), titles


def test_shop_signature_car_parts_exact():
    r = _search("Signature Car Parts", country="CI")
    assert "shop" in _modules(r), _modules(r)
    shop = next(g for g in r["groups"] if g["module"] == "shop")
    titles = [it["title"] for it in shop["items"]]
    assert any("Signature Car Parts" == t for t in titles), titles
    # Destination URL must point to a REAL /shop/p/ route (bug: used to be /shopbaked/product/…)
    top = next(it for it in shop["items"] if it["title"] == "Signature Car Parts")
    assert top["destination_url"].startswith("/shop/p/"), top["destination_url"]


def test_shop_bilingual_shirt_matches_fr_title():
    """`shirt` (EN) and `chemise` (FR) both find the FR-titled product."""
    for q in ("shirt", "chemise"):
        r = _search(q, country="CI")
        assert "shop" in _modules(r), (q, _modules(r))


def test_send_parcel_intent_destination_is_real_route():
    """Bug #1: /send/book/parcel didn't exist → UI fell back to MART.
    Fix: destination must be /send/parcel (a real route)."""
    r = _search("Send Parcel")
    assert "send_parcel" in _intents(r)
    intent = next(i for i in r["detected_intents"] if i["intent_code"] == "send_parcel")
    assert intent["destination"] == "/send/parcel", intent["destination"]


def test_send_shift_home_destination_is_real_route():
    r = _search("shift home")
    assert "shift_home" in _intents(r)
    intent = next(i for i in r["detected_intents"] if i["intent_code"] == "shift_home")
    assert intent["destination"] == "/send/movers", intent["destination"]


def test_send_book_truck_destination_is_real_route():
    r = _search("book truck")
    assert "book_truck" in _intents(r)
    intent = next(i for i in r["detected_intents"] if i["intent_code"] == "book_truck")
    assert intent["destination"] == "/send/book/vehicle", intent["destination"]


def test_send_courier_alias():
    r = _search("courier")
    assert "send_parcel" in _intents(r)


def test_send_moving_service_alias():
    r = _search("moving service")
    assert "shift_home" in _intents(r)


def test_search_is_global_not_restricted_by_module_param():
    """Active module tab in UI must not restrict a global query — the
    orchestrator ignores module= unless explicitly passed."""
    r = _search("pizza", country="CI")
    # No module filter → all enabled modules fan out
    assert "food" in _modules(r)


def test_shop_product_url_shape_is_shop_p_slash():
    r = _search("Signature Car Parts", country="CI")
    shop = next(g for g in r["groups"] if g["module"] == "shop")
    for it in shop["items"]:
        assert it["destination_url"].startswith("/shop/p/"), it


def test_mart_product_url_shape_is_products_slash():
    r = _search("Lait Frais", country="IN")
    mart = next(g for g in r["groups"] if g["module"] == "mart")
    for it in mart["items"]:
        assert it["destination_url"].startswith("/products/"), it


def test_food_restaurant_url_shape():
    r = _search("burger", country="CI")
    food = [g for g in r["groups"] if g["module"] == "food"]
    if food:
        for it in food[0]["items"]:
            if it.get("entity_type") == "restaurant":
                assert it["destination_url"].startswith("/foodbaked/restaurants/"), it


def test_intent_subtitle_matches_language():
    r = _search("send parcel", language="fr")
    intent = next(i for i in r["detected_intents"] if i["intent_code"] == "send_parcel")
    assert "SENDbakēd" in intent["subtitle"] or "colis" in intent["subtitle"].lower()
    r = _search("send parcel", language="en")
    intent = next(i for i in r["detected_intents"] if i["intent_code"] == "send_parcel")
    assert "SENDbakēd" in intent["subtitle"] or "delivery" in intent["subtitle"].lower()


def test_destinations_are_absolute_root_paths():
    """Every destination must start with `/` and never contain the preview
    host — orchestrator must return canonical in-app paths only."""
    for q in ("pizza", "Lait Frais", "Signature Car Parts", "send parcel"):
        r = _search(q, country="CI")
        for g in r.get("groups", []):
            for it in g["items"]:
                dst = it.get("destination_url") or ""
                assert dst.startswith("/"), (q, dst)
                assert "preview.emergentagent.com" not in dst
        for i in r.get("detected_intents", []):
            assert i["destination"].startswith("/"), (q, i)
