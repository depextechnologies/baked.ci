# Round 2: SHOP listing filters/sort/pagination/facets + global search (typos, FR/EN, SEND intents)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _get(s, path, **params):
    r = s.get(f"{API}{path}", params=params, timeout=30)
    return r


# --- SHOP products listing ---
class TestShopProducts:
    def test_item_shape(self, s):
        r = _get(s, "/shop/products", country="CI", limit=5)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list) and d
        for k in ("in_stock", "stock_qty", "discount_pct", "variant_count", "first_variant_id"):
            assert k in d[0], k

    def test_invalid_sort_422(self, s):
        assert _get(s, "/shop/products", sort="bogus").status_code == 422

    @pytest.mark.parametrize("sort", ["relevance", "newest", "price_asc", "price_desc", "discount"])
    def test_sorts(self, s, sort):
        r = _get(s, "/shop/products", country="CI", sort=sort, limit=100)
        assert r.status_code == 200
        d = r.json()
        prices = [x["min_price"] for x in d]
        if sort == "price_asc":
            assert prices == sorted(prices)
        if sort == "price_desc":
            assert prices == sorted(prices, reverse=True)
        if sort == "discount":
            dp = [x["discount_pct"] for x in d]
            assert dp == sorted(dp, reverse=True)
        if sort == "relevance":
            st = [x["in_stock"] for x in d]
            assert st == sorted(st, reverse=True)

    def test_price_range(self, s):
        d = _get(s, "/shop/products", country="CI", min_price=10000, max_price=20000, limit=100).json()
        assert d and all(10000 <= x["min_price"] <= 20000 for x in d)

    def test_in_stock_and_discounted(self, s):
        d = _get(s, "/shop/products", country="CI", in_stock="true", discounted="true", limit=100).json()
        assert d and all(x["in_stock"] and x["discount_pct"] > 0 for x in d)

    def test_brand_filter_unknown_empty(self, s):
        assert _get(s, "/shop/products", country="CI", brand="nope1,nope2").json() == []

    def test_pagination_no_overlap(self, s):
        a = _get(s, "/shop/products", country="CI", limit=24, offset=0).json()
        b = _get(s, "/shop/products", country="CI", limit=24, offset=24).json()
        assert len(a) == 24 and len(b) > 0
        assert not ({x["id"] for x in a} & {x["id"] for x in b})

    def test_subcategory_filter(self, s):
        d = _get(s, "/shop/products", country="CI", category="automobile", subcategory="pieces-accessoires-moto").json()
        assert d
        subs = {x["subcategory_id"] for x in d}
        assert len(subs) == 1

    def test_unknown_category_empty(self, s):
        assert _get(s, "/shop/products", country="CI", category="nope-xyz").json() == []


# --- SHOP facets ---
class TestFacets:
    def test_facets_not_shadowed(self, s):
        r = _get(s, "/shop/products/facets", country="CI", category="mode-femme")
        assert r.status_code == 200
        d = r.json()
        for k in ("count", "brands", "price_min", "price_max", "currency"):
            assert k in d
        assert d["count"] > 0 and isinstance(d["brands"], list)
        assert d["price_min"] <= d["price_max"]

    def test_facets_subcategory(self, s):
        d = _get(s, "/shop/products/facets", country="CI", category="automobile", subcategory="pieces-accessoires-moto").json()
        assert d["count"] >= 1


# --- Global search ---
def _search(s, q, lang="fr"):
    r = _get(s, "/search", q=q, country="CI", language=lang, limit=8)
    assert r.status_code == 200, r.text
    return r.json()


def _group(d, m):
    return next((g for g in d["groups"] if g["module"] == m), None)


class TestSearch:
    @pytest.mark.parametrize("q", ["Burger", "burger"])
    def test_burger_food(self, s, q):
        d = _search(s, q)
        g = _group(d, "food")
        assert g, d["groups"]
        titles = [i["title"] for i in g["items"]]
        assert any(i["entity_type"] == "dish" for i in g["items"]), titles
        rest = [i["title"] for i in g["items"] if i["entity_type"] == "restaurant"]
        assert rest and "Burger Hub" in rest[0], rest

    @pytest.mark.parametrize("q", ["Milk", "Lait"])
    def test_milk_lait_mart(self, s, q):
        d = _search(s, q)
        g = _group(d, "mart")
        assert g, d["groups"]
        assert any("lait" in i["title"].lower() or "milk" in i["title"].lower() for i in g["items"]), [i["title"] for i in g["items"]]

    @pytest.mark.parametrize("typo,fixed", [("chiken", "chicken"), ("pizaa", "pizza"), ("burgr", "burger")])
    def test_typos(self, s, typo, fixed):
        d = _search(s, typo)
        assert d.get("corrected_from") == typo, d.get("query")
        assert fixed in d["query"].lower()
        assert d["groups"]

    @pytest.mark.parametrize("q,intent", [("coursier", "send_parcel"), ("colis", "send_parcel"), ("déménagement", "shift_home")])
    def test_send_intents(self, s, q, intent):
        d = _search(s, q)
        codes = [i["intent_code"] for i in d["detected_intents"]]
        assert intent in codes, codes
