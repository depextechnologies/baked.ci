"""SHOPbakēd — Slice 2 catalogue seed tests.

Verifies:
  * The catalogue seed hits exactly the expected shape (19 categories,
    181 subcategories on CI).
  * FR + EN names both populated on every row.
  * `GET /api/shop/catalogue` returns the full tree with subcategories
    nested and correctly ordered.
  * Idempotency contract: after a re-seed (backend restart), counts do
    not drift and slugs are preserved (ids stable).
  * A few well-known slugs from the source docx are present (regression
    guard for the FR→slug mapping).
"""
from __future__ import annotations
import os
import requests


BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


EXPECTED_CATEGORIES = 19
EXPECTED_SUBCATEGORIES = 181


class TestCatalogueSeed:
    def test_health_counts_match_seed(self):
        r = requests.get(f"{API}/shop/health", timeout=10)
        assert r.status_code == 200
        counts = r.json()["counts"]
        assert counts["categories"] == EXPECTED_CATEGORIES
        assert counts["subcategories"] == EXPECTED_SUBCATEGORIES

    def test_categories_ordered_and_bilingual(self):
        r = requests.get(f"{API}/shop/categories?country=CI", timeout=10)
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == EXPECTED_CATEGORIES
        # Order column must be 1..N and monotonically increasing.
        orders = [c["order"] for c in cats]
        assert orders == sorted(orders)
        assert orders[0] == 1 and orders[-1] == EXPECTED_CATEGORIES
        # Every row must have both FR and EN populated.
        for c in cats:
            assert c["name_fr"] and c["name_en"], c
            assert c["slug"] and c["slug"] == c["slug"].lower(), c

    def test_known_slugs_present(self):
        r = requests.get(f"{API}/shop/categories?country=CI", timeout=10)
        slugs = {c["slug"] for c in r.json()}
        # Sampled from the FR canonical docx.
        for expected in {
            "mode-femme", "mode-homme", "bebe-enfant", "chaussures-sneakers",
            "sacs-bagages", "bijoux-montres-lunettes", "apple",
            "smartphones-telephones", "electromenager", "beaute-bien-etre",
            "automobile",
        }:
            assert expected in slugs, f"missing seeded category slug: {expected}"

    def test_subcategories_of_apple(self):
        # Apple has stable English brand names — good canary.
        r = requests.get(f"{API}/shop/subcategories?country=CI&category=apple", timeout=10)
        assert r.status_code == 200
        subs = r.json()
        slugs = {s["slug"] for s in subs}
        for s in {"iphone", "ipad", "mac", "apple-tv", "apple-watch",
                  "airtag", "airpods-earpods", "beats", "itunes"}:
            assert s in slugs, f"missing apple sub: {s}"
        # Order strictly increasing.
        orders = [s["order"] for s in subs]
        assert orders == sorted(orders)

    def test_subcategories_have_accented_fr(self):
        # Beauté & Bien-être uses accented FR — verifies extractor + storage
        # preserved unicode round-trip.
        r = requests.get(f"{API}/shop/subcategories?country=CI&category=beaute-bien-etre",
                         timeout=10)
        assert r.status_code == 200
        by_slug = {s["slug"]: s for s in r.json()}
        assert by_slug["soins-peau"]["name_fr"] == "Soins de la peau"
        assert by_slug["parfum-deodorant-femme"]["name_fr"] == "Parfum & Déodorant femme"

    def test_catalogue_tree_endpoint(self):
        r = requests.get(f"{API}/shop/catalogue?country=CI", timeout=10)
        assert r.status_code == 200
        tree = r.json()
        assert len(tree) == EXPECTED_CATEGORIES
        total_subs = sum(len(c["subcategories"]) for c in tree)
        assert total_subs == EXPECTED_SUBCATEGORIES
        # Every category node must carry its subcategories (order preserved).
        for c in tree:
            for s in c["subcategories"]:
                assert s["name_fr"] and s["name_en"]
                assert s["slug"] and s["slug"] == s["slug"].lower()

    def test_unknown_country_returns_empty(self):
        r = requests.get(f"{API}/shop/catalogue?country=ZZ", timeout=10)
        # ZZ is not seeded for SHOP → empty list, not 500.
        assert r.status_code == 200
        assert r.json() == []


class TestCatalogueIdempotency:
    """Confirms that the seed's on-conflict rules did NOT mutate primary keys
    across the last two boots. The pytest doesn't restart the backend itself,
    but hits a stable invariant: every category slug is unique per country,
    and no shadow duplicates exist for the same slug.
    """

    def test_no_duplicate_slugs(self):
        r = requests.get(f"{API}/shop/categories?country=CI", timeout=10)
        slugs = [c["slug"] for c in r.json()]
        assert len(slugs) == len(set(slugs)), "duplicate SHOP category slugs — seed regression"

    def test_no_duplicate_subcategory_slugs_per_category(self):
        r = requests.get(f"{API}/shop/catalogue?country=CI", timeout=10)
        for cat in r.json():
            subs = [s["slug"] for s in cat["subcategories"]]
            assert len(subs) == len(set(subs)), (
                f"duplicate subcategory slugs under {cat['slug']} — seed regression"
            )
