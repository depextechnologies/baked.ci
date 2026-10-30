# Homepage CMS: version hash, /homepage/version, admin PATCH/reorder/toggle/create invalidation (SHOP CI)
import copy
import os
import re
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PW = "baked@2026#!$@"
Q = {"country": "CI", "module": "shop"}
HERO = "hps_ci_shop_010_hero"


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


def ver():
    r = requests.get(f"{BASE_URL}/api/homepage/version", params=Q)
    assert r.status_code == 200
    return r.json()["version"]


def by_id(d, sid):
    return next((s for s in d["sections"] if s["id"] == sid), None)


class TestPublic:
    def test_homepage_shape(self):
        r = requests.get(f"{BASE_URL}/api/homepage", params=Q)
        assert r.status_code == 200
        assert "no-cache" in r.headers.get("cache-control", "")
        d = r.json()
        assert re.fullmatch(r"[0-9a-f]{16}", d["version"])
        assert d["updated_at"]
        orders = [s["display_order"] for s in d["sections"]]
        assert orders == sorted(orders)
        types = [s["section_type"] for s in d["sections"]]
        assert types[:5] == ["hero", "category_grid", "product_carousel", "promotional_banner", "brand_carousel"]

    def test_version_endpoint_matches(self):
        r = requests.get(f"{BASE_URL}/api/homepage/version", params=Q)
        assert "no-cache" in r.headers.get("cache-control", "")
        assert r.json()["version"] == hp()["version"]

    def test_version_validation(self):
        r = requests.get(f"{BASE_URL}/api/homepage/version", params={"country": "CIV"})
        assert r.status_code == 422


class TestVersionInvalidation:
    def test_patch_config_changes_version_and_restore(self, admin):
        orig = by_id(hp(), HERO)
        v0 = ver()
        cfg = copy.deepcopy(orig["config"])
        cfg["slides"][0]["headline_fr"] = "TEST_Bannière QA"
        cfg["slides"][0]["image_mobile"] = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800"
        try:
            r = admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{HERO}", json={"config": cfg})
            assert r.status_code == 200
            d = hp()
            assert d["version"] != v0
            assert by_id(d, HERO)["config"]["slides"][0]["headline_fr"] == "TEST_Bannière QA"
            assert ver() == d["version"]
        finally:
            r = admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{HERO}", json={"config": orig["config"]})
            assert r.status_code == 200
        assert by_id(hp(), HERO)["config"] == orig["config"]

    def test_patch_title_changes_version(self, admin):
        orig = by_id(hp(), HERO)
        v0 = ver()
        try:
            r = admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{HERO}", json={"title": "TEST_title"})
            assert r.status_code == 200
            assert ver() != v0
        finally:
            admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{HERO}", json={"title": orig["title"]})
        assert by_id(hp(), HERO)["title"] == orig["title"]

    def test_toggle_changes_version(self, admin):
        sid = "hps_ci_shop_030_fresh_drops"
        v0 = ver()
        try:
            r = admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{sid}", json={"is_enabled": False})
            assert r.status_code == 200
            d = hp()
            assert by_id(d, sid) is None
            assert d["version"] != v0
        finally:
            admin.patch(f"{BASE_URL}/api/admin/homepage-sections/{sid}", json={"is_enabled": True})
        assert by_id(hp(), sid) is not None

    def test_reorder_changes_version(self, admin):
        a, b = "hps_ci_shop_020_category_grid", "hps_ci_shop_030_fresh_drops"
        v0 = ver()
        try:
            r = admin.patch(f"{BASE_URL}/api/admin/homepage-sections/reorder",
                            json={"items": [{"id": a, "display_order": 30}, {"id": b, "display_order": 20}]})
            assert r.status_code == 200
            d = hp()
            ids = [s["id"] for s in d["sections"]]
            assert ids.index(b) < ids.index(a)
            assert d["version"] != v0
        finally:
            admin.patch(f"{BASE_URL}/api/admin/homepage-sections/reorder",
                        json={"items": [{"id": a, "display_order": 20}, {"id": b, "display_order": 30}]})
        ids = [s["id"] for s in hp()["sections"]]
        assert ids.index(a) < ids.index(b)

    def test_create_promo_and_delete(self, admin):
        v0 = ver()
        r = admin.post(f"{BASE_URL}/api/admin/homepage-sections", json={
            "country": "CI", "module": "shop", "section_type": "promotional_banner", "display_order": 15,
            "title": "TEST_Promo QA", "config": {"title_fr": "TEST_Promo QA FR", "cta_label": "Shop", "cta_link": "/shop"}})
        assert r.status_code == 201
        sid = r.json()["id"]
        try:
            d = hp()
            assert d["sections"][1]["id"] == sid
            assert d["version"] != v0
        finally:
            assert admin.delete(f"{BASE_URL}/api/admin/homepage-sections/{sid}").status_code == 204
        assert by_id(hp(), sid) is None
        assert ver() == v0

    def test_admin_requires_auth(self):
        r = requests.patch(f"{BASE_URL}/api/admin/homepage-sections/{HERO}", json={"title": "x"})
        assert r.status_code in (401, 403)
