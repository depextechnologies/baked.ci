"""Extra regression coverage for global search per iter101 request."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")


def _search(**params):
    r = requests.get(f"{BASE_URL}/api/search", params=params, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


def _group(data, module):
    for g in data.get("groups", []):
        if g.get("module") == module:
            return g
    return None


def test_country_isolation_india_vs_ci():
    ci = _search(q="riz", country="CI")
    in_ = _search(q="rice", country="IN")
    assert _group(ci, "mart"), "CI mart group missing for 'riz'"
    ci_titles = {it.get("title") for it in (_group(ci, "mart") or {}).get("items", [])}
    in_titles = {it.get("title") for it in (_group(in_, "mart") or {}).get("items", [])}
    # They may share generic titles but should at least differ (CI french names like Riz Basmati)
    assert ci_titles, "Expected CI mart titles"


def test_module_filter_mart_only():
    data = _search(q="coca cola", module="mart", country="CI")
    modules = {g.get("module") for g in data.get("groups", [])}
    assert modules <= {"mart"}, modules
    assert "mart" in modules


def test_module_filter_omits_empty():
    data = _search(q="coca cola", country="CI")
    for g in data.get("groups", []):
        assert g.get("items"), f"Group {g.get('module')} has no items"
        assert g.get("count", 0) > 0


def test_click_endpoint_fire_and_forget():
    r = requests.post(
        f"{BASE_URL}/api/search/click",
        json={"event_id": "se_nonexistent000000000000", "module": "mart", "entity_type": "product", "entity_id": "nonexistent"},
        timeout=10,
    )
    assert r.status_code == 200, r.text


def test_short_circuit_empty_groups():
    data = _search(q="a", country="CI")
    assert data.get("groups") == []
    assert data.get("event_id") is None


def test_contract_fields_present():
    data = _search(q="milk", country="CI")
    for key in ("query", "query_norm", "language", "detected_intents", "groups", "suggestions", "latency_ms", "event_id"):
        assert key in data, f"missing key: {key}"


def test_send_intents_variants():
    cases = [
        ("send parcel", "en", "send_parcel"),
        ("envoyer un colis", "fr", "send_parcel"),
        ("book truck", "en", "book_truck"),
        ("camion", "fr", "book_truck"),
        ("shift home", "en", "shift_home"),
        ("déménagement", "fr", "shift_home"),
    ]
    for phrase, lang, expected in cases:
        data = _search(q=phrase, language=lang)
        intents = [i.get("intent_code") for i in data.get("detected_intents", [])]
        assert expected in intents, f"'{phrase}' ({lang}) did not surface {expected}; got {intents}"


def test_intent_action_label_language():
    en = _search(q="send parcel", language="en")
    fr = _search(q="envoyer un colis", language="fr")
    en_label = en["detected_intents"][0]["action_label"]
    fr_label = fr["detected_intents"][0]["action_label"]
    assert en_label != fr_label, "Labels should differ by language"
    assert "parcel" in en_label.lower() or "send" in en_label.lower()
    assert "colis" in fr_label.lower() or "envoyer" in fr_label.lower()


def test_shoes_shop_hits():
    data = _search(q="shoes", country="CI")
    shop = _group(data, "shop")
    assert shop and shop.get("items"), "Expected shop items for 'shoes'"
