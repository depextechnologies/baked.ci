"""SHOPbakēd — Slice 7 homepage editor tests.

Covers:
  * Migration: `homepage_sections.module` column exists, defaults to "mart".
  * Public GET filters by module: /api/homepage?module=shop returns only
    SHOP sections; ?module=mart (or default) returns MART sections.
  * Admin GET filters by module.
  * Admin POST allows creating a SHOP section; the row is persisted with
    module="shop" and appears on the public SHOP homepage.
  * Seeded SHOP stack has ≥ 5 sections (hero, category_grid, product_carousel,
    promotional_banner, brand_carousel).
"""
from __future__ import annotations
import os
import pytest
import requests


pytestmark = pytest.mark.xdist_group("homepage_slice7")

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"


@pytest.fixture(scope="module")
def sa_headers():
    tok = requests.post(f"{API}/admin/auth/login",
                        json={"email": SA_EMAIL, "password": SA_PASSWORD},
                        timeout=15).json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class TestPublicFiltering:
    def test_default_module_is_mart(self):
        r = requests.get(f"{API}/homepage?country=CI", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["module"] == "mart"
        # MART seed has ≥ 8 sections (hero + rails etc.).
        assert len(body["sections"]) >= 5
        assert all("module" in s for s in body["sections"])

    def test_shop_module_returns_only_shop(self):
        r = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["module"] == "shop"
        assert len(body["sections"]) >= 5
        for s in body["sections"]:
            assert s["module"] == "shop"

    def test_shop_seed_contains_expected_types(self):
        r = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10)
        types = {s["section_type"] for s in r.json()["sections"]}
        assert {"hero", "category_grid", "product_carousel",
                "promotional_banner", "brand_carousel"}.issubset(types)

    def test_unknown_module_returns_empty(self):
        r = requests.get(f"{API}/homepage?country=CI&module=foo", timeout=10)
        assert r.status_code == 200
        assert r.json()["sections"] == []


class TestAdminFilter:
    def test_admin_list_shop_only(self, sa_headers):
        r = requests.get(f"{API}/admin/homepage-sections?country=CI&module=shop",
                         headers=sa_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["module"] == "shop"
        assert all(s["module"] == "shop" for s in body["items"])

    def test_admin_list_no_module_returns_all(self, sa_headers):
        r = requests.get(f"{API}/admin/homepage-sections?country=CI",
                         headers=sa_headers, timeout=15)
        assert r.status_code == 200
        modules = {s["module"] for s in r.json()["items"]}
        assert {"mart", "shop"}.issubset(modules)


class TestAdminCreate:
    def test_create_shop_section_appears_publicly(self, sa_headers):
        # Create.
        payload = {
            "country": "CI", "module": "shop", "section_type": "promotional_banner",
            "title": "Slice 7 QA banner", "subtitle": "Testing the module gate",
            "config": {"cta_label": "Go", "link": "/shopbaked"},
            "display_order": 999, "is_enabled": True,
        }
        r = requests.post(f"{API}/admin/homepage-sections",
                          headers=sa_headers, json=payload, timeout=15)
        assert r.status_code == 201, r.text
        sid = r.json()["id"]
        assert r.json()["module"] == "shop"

        # Public SHOP homepage sees it.
        pub = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10).json()
        assert any(s["id"] == sid for s in pub["sections"])

        # MART public homepage does NOT see it (isolation).
        mart = requests.get(f"{API}/homepage?country=CI", timeout=10).json()
        assert all(s["id"] != sid for s in mart["sections"])

        # Cleanup.
        requests.delete(f"{API}/admin/homepage-sections/{sid}",
                        headers=sa_headers, timeout=10)

    def test_requires_auth(self):
        r = requests.get(f"{API}/admin/homepage-sections?country=CI", timeout=10)
        assert r.status_code == 401
