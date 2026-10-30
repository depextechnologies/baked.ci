"""Phase 4b regression — FOODbakēd partner Web Push subscriptions.

Covers the control plane only (subscribe / unsubscribe / status / vapid):
dispatching a REAL push through a push service inside pytest would be
flaky, so the actual webpush() call is covered by a unit test that mocks
`webpush` and asserts payload shape + revoked-endpoint pruning.
"""
from __future__ import annotations
import os
import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
QA_EMAIL = "qa-burger@test.example"
QA_PASS  = "QaBurger123!"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def partner_auth(api):
    r = api.post(f"{BASE_URL}/api/food/partner/auth/login", json={"email": QA_EMAIL, "password": QA_PASS})
    r.raise_for_status()
    body = r.json()
    return {"token": body["access_token"], "restaurant_id": body["partner"]["restaurant_id"]}


def _h(token): return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# A plausible-looking subscription payload. The endpoint is a fake push
# service URL that never resolves — fine for CRUD assertions since we
# never dispatch during these tests.
_FAKE_SUB = {
    "endpoint": "https://fcm.googleapis.com/wp/CGtEST_pytest_pytest_pytest_pytest_pytest_pytest",
    "keys": {
        "p256dh": "BOFEogVHbC0qeqIyIhBrFcyoM3nqxrEa4V_0YIcKzz0rLSOg1V7p69P8pZk1T6oIp5rGyT17O8rJVPMc1KVPMcY",
        "auth":   "SGVsbG9mcm9tcHl0ZXN0cA",
    },
    "user_agent": "pytest/BAKED",
}


class TestPartnerWebPush:
    def test_vapid_public_key_is_served(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        r = api.get(f"{BASE_URL}/api/food/manage/{rid}/push/vapid-public-key", headers=_h(tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "public_key" in body
        # URL-safe base64 of the raw EC key is a non-trivially-sized string.
        assert len(body["public_key"]) > 40
        # No '+' / '/' / '=' — must be URL-safe base64.
        for forbidden in ("+", "/", "="):
            assert forbidden not in body["public_key"], f"VAPID key must be URL-safe; contains {forbidden!r}"

    def test_vapid_requires_partner_auth(self, api, partner_auth):
        rid = partner_auth["restaurant_id"]
        r = api.get(f"{BASE_URL}/api/food/manage/{rid}/push/vapid-public-key")
        assert r.status_code in (401, 403), r.text

    def test_subscribe_persists_and_shows_in_status(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]

        # unsubscribe any carry-over row from a previous test run before counting.
        api.post(f"{BASE_URL}/api/food/manage/{rid}/push/unsubscribe",
                 json={"endpoint": _FAKE_SUB["endpoint"]}, headers=_h(tok))

        baseline = api.get(f"{BASE_URL}/api/food/manage/{rid}/push/status", headers=_h(tok)).json()
        before = baseline["subscriptions"]
        assert baseline["configured"] is True, "VAPID keys must be configured on the preview server"

        r = api.post(f"{BASE_URL}/api/food/manage/{rid}/push/subscribe",
                     json=_FAKE_SUB, headers=_h(tok))
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        after = api.get(f"{BASE_URL}/api/food/manage/{rid}/push/status", headers=_h(tok)).json()
        assert after["subscriptions"] == before + 1, (before, after)

        # Re-subscribing the SAME endpoint is a no-op (ON CONFLICT DO UPDATE)
        api.post(f"{BASE_URL}/api/food/manage/{rid}/push/subscribe",
                 json=_FAKE_SUB, headers=_h(tok))
        after2 = api.get(f"{BASE_URL}/api/food/manage/{rid}/push/status", headers=_h(tok)).json()
        assert after2["subscriptions"] == after["subscriptions"], "duplicate subscribe must be idempotent"

    def test_unsubscribe_removes_row(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        # Make sure there is at least one subscription to delete.
        api.post(f"{BASE_URL}/api/food/manage/{rid}/push/subscribe",
                 json=_FAKE_SUB, headers=_h(tok))
        before = api.get(f"{BASE_URL}/api/food/manage/{rid}/push/status", headers=_h(tok)).json()["subscriptions"]
        assert before >= 1

        r = api.post(f"{BASE_URL}/api/food/manage/{rid}/push/unsubscribe",
                     json={"endpoint": _FAKE_SUB["endpoint"]}, headers=_h(tok))
        assert r.status_code == 200, r.text

        after = api.get(f"{BASE_URL}/api/food/manage/{rid}/push/status", headers=_h(tok)).json()["subscriptions"]
        assert after == before - 1

    def test_subscribe_rejects_missing_keys(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        bad = {"endpoint": _FAKE_SUB["endpoint"], "keys": {"p256dh": _FAKE_SUB["keys"]["p256dh"], "auth": ""}}
        r = api.post(f"{BASE_URL}/api/food/manage/{rid}/push/subscribe",
                     json=bad, headers=_h(tok))
        assert r.status_code == 400, r.text

    def test_push_payload_builder_shape(self):
        """Unit test — new_order_payload returns the exact keys the SW reads."""
        from modules.food.push import new_order_payload
        p = new_order_payload({
            "id": "fo_test",
            "order_number": "BH-1001",
            "grand_total": 2500,
            "currency": "XOF",
            "items": [{"quantity": 2}, {"quantity": 1}],
            "customer_snapshot": {"name": "Awa"},
        })
        for key in ("type", "title", "body", "tag", "url", "entity_id"):
            assert key in p
        assert p["type"] == "food.order.created"
        assert "BH-1001" in p["title"]
        assert "Awa" in p["body"]
        assert "3 article" in p["body"]
        assert p["entity_id"] == "fo_test"
        assert p["url"].startswith("/partner/food")

    def test_push_is_configured(self):
        """Preview server has VAPID keys wired up."""
        from modules.food.push import is_configured, VAPID_PUBLIC_KEY, VAPID_PRIVATE_PEM
        assert is_configured(), "VAPID keys missing on preview backend"
        assert VAPID_PUBLIC_KEY, "public key missing"
        assert VAPID_PRIVATE_PEM and "BEGIN PRIVATE KEY" in VAPID_PRIVATE_PEM, "private pem not decoded"
