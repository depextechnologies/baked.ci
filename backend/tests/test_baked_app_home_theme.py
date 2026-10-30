# BAKĒD Super App main home CMS (module=baked) + customer theme preference tests
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
EXPECTED = [("app_module_grid", None), ("app_category_row", "food"), ("app_category_row", "mart"),
            ("app_category_row", "shop"), ("app_promo_slider", None)]


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/admin/auth/login", json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code} {r.text[:200]}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def customer():
    r = requests.post(f"{API}/auth/otp/request", json={"country_code": "+225", "phone": "0700000000"})
    assert r.status_code == 200, r.text
    d = r.json()
    code = d.get("dev_code")
    v = requests.post(f"{API}/auth/otp/verify", json={"challenge_id": d["challenge_id"], "code": code})
    assert v.status_code == 200, v.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {v.json()['access_token']}"
    return s


def _src(sec):
    c = sec.get("config") or {}
    return c.get("source_module")


# Public homepage
@pytest.mark.parametrize("country", ["CI", "IN"])
def test_public_baked_home(country):
    r = requests.get(f"{API}/homepage", params={"country": country, "module": "baked"})
    assert r.status_code == 200
    secs = r.json()["sections"]
    got = [(s["section_type"], _src(s) if s["section_type"] == "app_category_row" else None) for s in secs]
    assert got == EXPECTED, got


# Admin CRUD
class TestAdminBaked:
    def test_list_and_types(self, admin):
        r = admin.get(f"{API}/admin/homepage-sections", params={"country": "CI", "module": "baked"})
        assert r.status_code == 200
        d = r.json()
        for t in ("app_module_grid", "app_category_row", "app_promo_slider"):
            assert t in d["section_types"]
        assert len(d["items"]) >= 5
        assert all(i["module"] == "baked" for i in d["items"])

    def test_patch_toggle_changes_version_and_restore(self, admin):
        items = admin.get(f"{API}/admin/homepage-sections", params={"country": "CI", "module": "baked"}).json()["items"]
        shop = next(i for i in items if i["section_type"] == "app_category_row" and _src(i) == "shop")
        v1 = requests.get(f"{API}/homepage/version", params={"country": "CI", "module": "baked"}).json()["version"]
        try:
            r = admin.patch(f"{API}/admin/homepage-sections/{shop['id']}", json={"is_enabled": False})
            assert r.status_code == 200 and r.json()["is_enabled"] is False
            v2 = requests.get(f"{API}/homepage/version", params={"country": "CI", "module": "baked"}).json()["version"]
            assert v1 != v2
            secs = requests.get(f"{API}/homepage", params={"country": "CI", "module": "baked"}).json()["sections"]
            assert shop["id"] not in [s["id"] for s in secs]
        finally:
            admin.patch(f"{API}/admin/homepage-sections/{shop['id']}", json={"is_enabled": True})
        secs = requests.get(f"{API}/homepage", params={"country": "CI", "module": "baked"}).json()["sections"]
        assert shop["id"] in [s["id"] for s in secs]

    def test_patch_config_and_restore(self, admin):
        items = admin.get(f"{API}/admin/homepage-sections", params={"country": "CI", "module": "baked"}).json()["items"]
        row = next(i for i in items if i["section_type"] == "app_category_row" and _src(i) == "food")
        orig_cfg, orig_title = row["config"], row["title"]
        try:
            new_cfg = {**orig_cfg, "test_marker": "TEST_x"}
            r = admin.patch(f"{API}/admin/homepage-sections/{row['id']}", json={"config": new_cfg})
            assert r.status_code == 200 and r.json()["config"]["test_marker"] == "TEST_x"
        finally:
            admin.patch(f"{API}/admin/homepage-sections/{row['id']}", json={"config": orig_cfg, "title": orig_title})
        g = admin.get(f"{API}/admin/homepage-sections", params={"country": "CI", "module": "baked"}).json()["items"]
        assert next(i for i in g if i["id"] == row["id"])["config"] == orig_cfg

    def test_reorder_and_restore(self, admin):
        items = admin.get(f"{API}/admin/homepage-sections", params={"country": "CI", "module": "baked"}).json()["items"]
        orig = [{"id": i["id"], "display_order": i["display_order"]} for i in items]
        a, b = items[1], items[2]
        try:
            r = admin.patch(f"{API}/admin/homepage-sections/reorder", json={"items": [
                {"id": a["id"], "display_order": b["display_order"]}, {"id": b["id"], "display_order": a["display_order"]}]})
            assert r.status_code == 200
            secs = requests.get(f"{API}/homepage", params={"country": "CI", "module": "baked"}).json()["sections"]
            ids = [s["id"] for s in secs]
            assert ids.index(b["id"]) < ids.index(a["id"])
        finally:
            admin.patch(f"{API}/admin/homepage-sections/reorder", json={"items": orig})
        secs = requests.get(f"{API}/homepage", params={"country": "CI", "module": "baked"}).json()["sections"]
        got = [(s["section_type"], _src(s) if s["section_type"] == "app_category_row" else None) for s in secs]
        assert got == EXPECTED

    def test_create_delete_row(self, admin):
        r = admin.post(f"{API}/admin/homepage-sections", json={
            "country": "CI", "module": "baked", "section_type": "app_category_row", "title": "TEST_row",
            "config": {"source_module": "food", "items": []}, "display_order": 999, "is_enabled": True})
        assert r.status_code == 201, r.text
        sid = r.json()["id"]
        secs = requests.get(f"{API}/homepage", params={"country": "CI", "module": "baked"}).json()["sections"]
        assert sid in [s["id"] for s in secs]
        d = admin.delete(f"{API}/admin/homepage-sections/{sid}")
        assert d.status_code == 204
        secs = requests.get(f"{API}/homepage", params={"country": "CI", "module": "baked"}).json()["sections"]
        assert sid not in [s["id"] for s in secs]
        assert admin.delete(f"{API}/admin/homepage-sections/{sid}").status_code == 404

    def test_admin_requires_auth(self):
        r = requests.get(f"{API}/admin/homepage-sections", params={"country": "CI", "module": "baked"})
        assert r.status_code in (401, 403)


# Customer theme preference
class TestTheme:
    def test_theme_values(self, customer):
        orig = customer.get(f"{API}/customers/me/preferences").json()
        assert "theme" in orig
        try:
            for t in ("light", "system", "dark"):
                r = customer.patch(f"{API}/customers/me/preferences", json={"theme": t})
                assert r.status_code == 200, r.text
                assert customer.get(f"{API}/customers/me/preferences").json()["theme"] == t
            assert customer.patch(f"{API}/customers/me/preferences", json={"theme": "blue"}).status_code == 422
        finally:
            customer.patch(f"{API}/customers/me/preferences", json={"theme": orig.get("theme") or "dark"})
