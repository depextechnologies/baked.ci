# MART homepage CMS parity (round 2): section order, trust_strip type, admin create/patch/toggle/reorder (CI mart)
import copy
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PW = "baked@2026#!$@"
Q = {"country": "CI", "module": "mart"}
TRUST = "hps_ci_110_trust_strip"
APP = "hps_ci_090_app_promotion"
HERO = "hps_ci_010_hero"
EXPECTED = ["hero", "category_grid", "promotional_banner", "product_carousel", "banner_trio",
            "product_carousel", "brand_carousel", "app_promotion", "cta_strip", "trust_strip"]


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


def hp():
    r = requests.get(f"{BASE_URL}/api/homepage", params=Q)
    assert r.status_code == 200
    return r.json()


def admin_items(admin):
    r = admin.get(f"{BASE_URL}/api/admin/homepage-sections", params=Q)
    assert r.status_code == 200
    return r.json()["items"]


# Public read: order + content
class TestMartPublic:
    def test_ten_sections_in_order(self):
        secs = hp()["sections"]
        assert [s["section_type"] for s in secs] == EXPECTED
        orders = [s["display_order"] for s in secs]
        assert orders == sorted(orders)
        pcs = [s for s in secs if s["section_type"] == "product_carousel"]
        assert pcs[0]["id"] == "hps_ci_050_bestsellers" and pcs[1]["id"] == "hps_ci_070_new_arrivals"

    def test_trust_strip_bilingual(self):
        t = next(s for s in hp()["sections"] if s["section_type"] == "trust_strip")
        assert t["id"] == TRUST and t["display_order"] == 110
        items = t["config"]["items"]
        assert len(items) == 4
        for i in items:
            for k in ("title", "title_fr", "subtitle", "subtitle_fr", "icon", "color"):
                assert i.get(k), k
        assert items[0]["title_fr"] == "Livraison ultra-rapide"

    def test_app_promotion(self):
        a = next(s for s in hp()["sections"] if s["section_type"] == "app_promotion")
        assert a["title"] == "Téléchargez l'app BAKĒD"
        assert a["config"]["google_play_url"] and a["config"]["app_store_url"] and a["config"]["qr_target"]

    def test_no_mongo_id(self):
        for s in hp()["sections"]:
            assert "_id" not in s


# Admin mutations (restored)
class TestMartAdmin:
    def test_admin_lists_trust_strip(self, admin):
        ids = [i["id"] for i in admin_items(admin)]
        assert TRUST in ids

    def test_create_trust_strip_and_delete(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/homepage-sections", json={
            "country": "CI", "module": "mart", "section_type": "trust_strip", "display_order": 115,
            "title": "TEST_trust", "config": {"items": [{"icon": "bike", "title": "A", "title_fr": "B"}]}})
        assert r.status_code in (200, 201), r.text
        sid = r.json()["id"]
        try:
            secs = hp()["sections"]
            assert any(s["id"] == sid and s["section_type"] == "trust_strip" for s in secs)
        finally:
            d = admin.delete(f"{BASE_URL}/api/admin/homepage-sections/{sid}")
            assert d.status_code in (200, 204)
        assert all(s["id"] != sid for s in hp()["sections"])

    def test_invalid_section_type_rejected(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/homepage-sections", json={
            "country": "CI", "module": "mart", "section_type": "TEST_bogus", "display_order": 999, "config": {}})
        if r.status_code in (200, 201):
            admin.delete(f"{BASE_URL}/api/admin/homepage-sections/{r.json()['id']}")
        assert r.status_code in (400, 422)

    def test_patch_trust_items_and_toggle(self, admin):
        orig = next(i for i in admin_items(admin) if i["id"] == TRUST)
        cfg = copy.deepcopy(orig["config"])
        cfg["items"][0]["title_fr"] = "TEST_Livraison"
        try:
            assert admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{TRUST}", json={"config": cfg}).status_code == 200
            t = next(s for s in hp()["sections"] if s["id"] == TRUST)
            assert t["config"]["items"][0]["title_fr"] == "TEST_Livraison"
            assert admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{TRUST}", json={"is_enabled": False}).status_code == 200
            assert all(s["id"] != TRUST for s in hp()["sections"])
        finally:
            admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{TRUST}", json={"config": orig["config"], "is_enabled": True})
        t = next(s for s in hp()["sections"] if s["id"] == TRUST)
        assert t["config"] == orig["config"]

    def test_patch_app_title_and_hero_bg_and_reorder(self, admin):
        items = admin_items(admin)
        app = next(i for i in items if i["id"] == APP)
        hero = next(i for i in items if i["id"] == HERO)
        v0 = hp()["version"]
        hcfg = copy.deepcopy(hero["config"])
        hcfg["background_image"] = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600"
        try:
            assert admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{APP}", json={"title": "TEST_App QA"}).status_code == 200
            assert admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{HERO}", json={"config": hcfg}).status_code == 200
            assert admin.patch(f"{BASE_URL}/api/admin/homepage-sections/reorder", json={"items": [
                {"id": "hps_ci_040_promotional_banner", "display_order": 30},
                {"id": "hps_ci_030_category_grid", "display_order": 40}]}).status_code == 200
            d = hp()
            assert d["version"] != v0
            types = [s["section_type"] for s in d["sections"]]
            assert types[1] == "promotional_banner" and types[2] == "category_grid"
            assert next(s for s in d["sections"] if s["id"] == APP)["title"] == "TEST_App QA"
            assert next(s for s in d["sections"] if s["id"] == HERO)["config"]["background_image"] == hcfg["background_image"]
        finally:
            admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{APP}", json={"title": app["title"]})
            admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{HERO}", json={"config": hero["config"]})
            admin.patch(f"{BASE_URL}/api/admin/homepage-sections/reorder", json={"items": [
                {"id": "hps_ci_030_category_grid", "display_order": 30},
                {"id": "hps_ci_040_promotional_banner", "display_order": 40}]})
        assert [s["section_type"] for s in hp()["sections"]] == EXPECTED
