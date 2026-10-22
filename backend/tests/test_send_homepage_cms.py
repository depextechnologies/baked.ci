# SEND (module=express) homepage CMS — public read, admin create/patch of send_* types, persistence.
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
U = f"{BASE_URL}/api/admin/homepage-sections"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/auth/login", json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


def _pub(cc="CI"):
    r = requests.get(f"{BASE_URL}/api/homepage", params={"country": cc, "module": "express"})
    assert r.status_code == 200, r.text
    return r.json()


# Public read
class TestSendPublic:
    def test_ci_order_and_types(self):
        b = _pub()
        assert b["module"] == "express" and b["country"] == "CI"
        types = [s["section_type"] for s in b["sections"]]
        assert types == ["send_map_hero", "send_pickup_bar", "send_service_tiles", "send_trust_banner"], types
        ids = [s["id"] for s in b["sections"]]
        assert ids == ["hps_send_ci_010_send_map_hero", "hps_send_ci_020_send_pickup_bar",
                       "hps_send_ci_030_send_service_tiles", "hps_send_ci_040_send_trust_banner"]

    def test_tiles_shape(self):
        t = [s for s in _pub()["sections"] if s["section_type"] == "send_service_tiles"][0]
        tiles = t["config"]["tiles"]
        assert [x["key"] for x in tiles] == ["moto", "cargo", "fresh", "between_cities", "movers", "multi"]
        for x in tiles:
            for k in ("image", "title_fr", "title_en", "desc_fr", "desc_en", "enabled"):
                assert k in x, (x["key"], k)
        assert t["title"] == "Our services"
        assert t["config"].get("title_fr")

    def test_pickup_and_trust_and_map(self):
        by = {s["section_type"]: s for s in _pub()["sections"]}
        p = by["send_pickup_bar"]["config"]
        assert p["placeholder_fr"] == "Votre lieu de ramassage ?"
        assert p.get("placeholder") and p.get("add_stop_label") and p.get("add_stop_label_fr")
        assert by["send_trust_banner"]["config"].get("text") and by["send_trust_banner"]["config"].get("text_fr")
        assert by["send_map_hero"]["config"].get("show_drivers") is True

    def test_in_seeded(self):
        b = _pub("IN")
        assert len(b["sections"]) == 4
        assert all(s["id"].startswith("hps_send_in_") for s in b["sections"])

    def test_no_cross_module_leak(self):
        for s in _pub()["sections"]:
            assert s["module"] == "express"


# Admin create / patch / delete with send_* types
class TestSendAdmin:
    def test_admin_list(self, admin):
        r = admin.get(U, params={"country": "CI", "module": "express"})
        assert r.status_code == 200
        ids = {i["id"] for i in r.json()["items"]}
        assert "hps_send_ci_030_send_service_tiles" in ids

    @pytest.mark.parametrize("st", ["send_map_hero", "send_pickup_bar", "send_service_tiles", "send_trust_banner"])
    def test_create_patch_delete(self, admin, st):
        r = admin.post(U, json={"country": "CI", "module": "express", "section_type": st, "title": "TEST_x",
                                "config": {"text": "TEST"}, "display_order": 999, "is_enabled": False})
        assert r.status_code in (200, 201), r.text
        body = r.json()
        row = body.get("item", body)
        rid = row["id"]
        try:
            assert row["section_type"] == st
            p = admin.patch(f"{U}/{rid}", json={"title": "TEST_y"})
            assert p.status_code == 200, p.text
            items = {i["id"]: i for i in admin.get(U, params={"country": "CI", "module": "express"}).json()["items"]}
            assert items[rid]["title"] == "TEST_y"
            # disabled row must not leak to public
            assert rid not in [s["id"] for s in _pub()["sections"]]
        finally:
            d = admin.delete(f"{U}/{rid}")
            assert d.status_code in (200, 204)

    def test_invalid_type_rejected(self, admin):
        r = admin.post(U, json={"country": "CI", "module": "express", "section_type": "send_bogus", "config": {}})
        assert r.status_code in (400, 422)
