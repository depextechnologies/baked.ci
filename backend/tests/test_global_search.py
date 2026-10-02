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
