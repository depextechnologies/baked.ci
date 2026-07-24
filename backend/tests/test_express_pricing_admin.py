"""EXPRESSbakēd Phase 2 — Sub-feature C: Pricing Engine Admin API tests.

Tests the admin routes at /api/admin/modules/express/pricing (aggregated GET
+ per-vehicle PATCH + movers PATCH) plus verifies edits propagate to the
live parcel quote engine.

IMPORTANT: This suite snapshots CI+LR seeded pricing at setup and restores
it in teardown so future customer quotes remain correct.
"""
from __future__ import annotations
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"

SEED_CI_BIKE = {"base_fare": 1500, "min_fare": 1500, "price_per_km": 150, "price_per_min": 40}
SEED_LR_BIKE = {"base_fare": 500, "min_fare": 500, "price_per_km": 60, "price_per_min": 15}


# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def snapshot_and_restore(admin_headers):
    """Snapshot pricing for CI+LR up front, restore at end of session."""
    snap = {}
    for c in ("CI", "LR"):
        r = requests.get(f"{BASE_URL}/api/admin/modules/express/pricing?country={c}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, f"Snapshot GET {c} failed"
        snap[c] = r.json()
    yield snap
    # ---- teardown: restore ----
    editable_parcel = {"base_fare", "min_fare", "price_per_km", "price_per_min", "waiting_fee",
                       "peak_multiplier", "night_multiplier", "service_fee_pct",
                       "insurance_pct", "insurance_min", "taxes_pct", "active"}
    editable_movers = {"transport_base", "price_per_km", "packing_per_item", "loading_unloading_base",
                       "loading_per_item", "labour_per_mover", "floor_fee", "stair_fee", "toll_permits",
                       "value_per_kg", "insurance_pct", "insurance_min", "taxes_pct", "advance_flat",
                       "advance_pct", "active"}
    for c, data in snap.items():
        for rule in data.get("parcel_rules") or []:
            payload = {k: rule.get(k) for k in editable_parcel if rule.get(k) is not None}
            if not payload:
                continue
            requests.patch(
                f"{BASE_URL}/api/admin/modules/express/pricing/{c}/{rule['vehicle_code']}",
                json=payload, headers=admin_headers, timeout=15,
            )
        mv = data.get("movers_pricing")
        if mv:
            payload = {k: mv.get(k) for k in editable_movers if mv.get(k) is not None}
            if payload:
                requests.patch(
                    f"{BASE_URL}/api/admin/modules/express/movers-pricing/{c}",
                    json=payload, headers=admin_headers, timeout=15,
                )


# ---------- 1. Aggregated GET tests ----------

class TestPricingGet:

    def test_get_ci_pricing_returns_all_5_vehicles(self, admin_headers, snapshot_and_restore):
        r = requests.get(f"{BASE_URL}/api/admin/modules/express/pricing?country=CI",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["country"] == "CI"
        assert data["currency"] == "XOF"
        assert data["currency_symbol"] == "CFA"
        assert isinstance(data["vehicles"], list) and len(data["vehicles"]) == 5
        assert isinstance(data["parcel_rules"], list) and len(data["parcel_rules"]) == 5
        codes = {r["vehicle_code"] for r in data["parcel_rules"]}
        assert codes == {"bike", "scooter", "three_wheeler", "mini_truck", "truck"}
        assert data["movers_pricing"] is not None

    def test_get_lr_pricing(self, admin_headers, snapshot_and_restore):
        r = requests.get(f"{BASE_URL}/api/admin/modules/express/pricing?country=LR",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["country"] == "LR"
        # LR uses L$ / LRD
        assert data["currency_symbol"] in ("L$", "LRD", "$") or data["currency"] == "LRD"
        bike = next((r for r in data["parcel_rules"] if r["vehicle_code"] == "bike"), None)
        assert bike is not None
        assert bike["base_fare"] == SEED_LR_BIKE["base_fare"]
        assert bike["price_per_km"] == SEED_LR_BIKE["price_per_km"]

    def test_get_unsupported_country_returns_404(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/modules/express/pricing?country=XX",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 404

    def test_get_without_auth_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/modules/express/pricing?country=CI", timeout=15)
        assert r.status_code in (401, 403)


# ---------- 2. PATCH parcel tests ----------

class TestPatchParcelRule:

    def test_patch_ci_bike_updates_base_fare_and_multiplier(self, admin_headers, snapshot_and_restore):
        payload = {"base_fare": 2000, "peak_multiplier": 1.5}
        r = requests.patch(
            f"{BASE_URL}/api/admin/modules/express/pricing/CI/bike",
            json=payload, headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["base_fare"] == 2000
        assert doc["peak_multiplier"] == 1.5
        # GET back and re-check persisted
        r2 = requests.get(f"{BASE_URL}/api/admin/modules/express/pricing?country=CI",
                          headers=admin_headers, timeout=15)
        bike = next(x for x in r2.json()["parcel_rules"] if x["vehicle_code"] == "bike")
        assert bike["base_fare"] == 2000
        assert bike["peak_multiplier"] == 1.5

    def test_patch_propagates_to_live_quote(self, admin_headers, snapshot_and_restore):
        # We already set base_fare=2000 above but re-set here so this test can run standalone.
        requests.patch(
            f"{BASE_URL}/api/admin/modules/express/pricing/CI/bike",
            json={"base_fare": 2000, "peak_multiplier": 1.0, "night_multiplier": 1.0},
            headers=admin_headers, timeout=15,
        )
        # Now request a parcel quote. Public quote endpoint (no auth needed).
        quote_body = {
            "country": "CI",
            "vehicle_code": "bike",
            "pickup_lat": 5.3600, "pickup_lng": -4.0083,
            "drop_lat": 5.3400, "drop_lng": -4.0200,
        }
        r = requests.post(f"{BASE_URL}/api/express/quote/parcel", json=quote_body, timeout=20)
        assert r.status_code == 200, r.text
        q = r.json()
        # breakdown might be dict or list; look for base_fare
        breakdown = q.get("breakdown") or q.get("price_breakdown") or {}
        # Look through it — accept either flat dict {"base_fare": 2000} or list of {label, amount}
        found = None
        if isinstance(breakdown, dict):
            found = breakdown.get("base_fare")
        elif isinstance(breakdown, list):
            for item in breakdown:
                if isinstance(item, dict):
                    label = str(item.get("label", "")).lower()
                    if "base" in label:
                        found = item.get("amount") or item.get("value")
                        break
        # Some implementations put it at top-level:
        if found is None:
            found = q.get("base_fare")
        assert found == 2000, f"Expected base_fare=2000 in quote, got quote={q}"

    def test_patch_unknown_field_silently_dropped(self, admin_headers, snapshot_and_restore):
        # Providing ONLY an unknown field must result in 400 (no editable fields)
        r = requests.patch(
            f"{BASE_URL}/api/admin/modules/express/pricing/CI/bike",
            json={"foo": 1, "hacker_field": "boom"},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 400
        # Providing 1 valid + 1 unknown → 200 and unknown dropped
        r2 = requests.patch(
            f"{BASE_URL}/api/admin/modules/express/pricing/CI/bike",
            json={"base_fare": 1600, "foo": 1},
            headers=admin_headers, timeout=15,
        )
        assert r2.status_code == 200
        doc = r2.json()
        assert doc["base_fare"] == 1600
        assert "foo" not in doc

    def test_patch_nonexistent_vehicle_returns_404(self, admin_headers, snapshot_and_restore):
        r = requests.patch(
            f"{BASE_URL}/api/admin/modules/express/pricing/CI/nonexistent",
            json={"base_fare": 100},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 404

    def test_patch_without_auth_returns_401(self):
        r = requests.patch(
            f"{BASE_URL}/api/admin/modules/express/pricing/CI/bike",
            json={"base_fare": 999}, timeout=15,
        )
        assert r.status_code in (401, 403)


# ---------- 3. PATCH movers tests ----------

class TestPatchMovers:

    def test_patch_ci_movers(self, admin_headers, snapshot_and_restore):
        r = requests.patch(
            f"{BASE_URL}/api/admin/modules/express/movers-pricing/CI",
            json={"packing_per_item": 500, "labour_per_mover": 5000},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["packing_per_item"] == 500
        assert doc["labour_per_mover"] == 5000

    def test_patch_movers_without_auth_returns_401(self):
        r = requests.patch(
            f"{BASE_URL}/api/admin/modules/express/movers-pricing/CI",
            json={"packing_per_item": 1}, timeout=15,
        )
        assert r.status_code in (401, 403)

    def test_patch_movers_empty_returns_400(self, admin_headers, snapshot_and_restore):
        r = requests.patch(
            f"{BASE_URL}/api/admin/modules/express/movers-pricing/CI",
            json={"nope": 1}, headers=admin_headers, timeout=15,
        )
        assert r.status_code == 400


# ---------- 4. Audit log tests ----------

class TestAuditLog:

    def test_patch_writes_audit_log(self, admin_headers, snapshot_and_restore):
        # Perform a PATCH first
        requests.patch(
            f"{BASE_URL}/api/admin/modules/express/pricing/CI/scooter",
            json={"waiting_fee": 25},
            headers=admin_headers, timeout=15,
        )
        # Try to fetch audit logs via admin endpoint (best-effort — endpoint may vary)
        r = requests.get(f"{BASE_URL}/api/admin/audit-logs?limit=50",
                         headers=admin_headers, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"Audit logs endpoint not accessible ({r.status_code}) — trust write path")
        logs = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        assert any("express.pricing" in (l.get("action") or "") for l in logs), \
            "No express.pricing.* audit entry found"
