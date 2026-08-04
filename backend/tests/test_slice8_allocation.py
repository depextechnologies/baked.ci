"""Backend tests for MARTbakēd Slice 8 — Inventory Allocation Engine.

Covers:
  - Multi-partner order routing (customer sees 1 Order, backend creates N PartnerOrders)
  - Consolidation heuristic (SKU stocked by both → prefer partner already in plan)
  - Stock decrement on checkout + restoration on partner cancel
  - Coming-soon 400 error with `not_available_in_area` code + gaps
  - Partner pricing overlay on /mart/products, /mart/products/{id}, /carts/me
  - Cart hydrate unavailable_items[]
  - Partner Orders slice: subtotal / item_count / customer_total
  - State machine + wallet auto-credit on handed_off from partner slice subtotal
"""
from __future__ import annotations
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")

# Known seeded product ids from problem statement
PRD_BANANE   = "prd_659dc566f5064108"   # Alpha only (2x)
PRD_COCA     = "prd_368cdb6f7a094b15"   # Beta only  (1x)
PRD_BAGUETTE = "prd_3064601318bb4e23"   # BOTH (Alpha 450, Beta 420)
PRD_PASTEQUE = "prd_7ff5305227354616"   # Not stocked by anyone

PARTNER_ALPHA_EMAIL = "partner-alpha-store@test.example"
PARTNER_BETA_EMAIL  = "partner-beta-store@test.example"
PARTNER_PASSWORD    = "Alpha1234!Beta"


# ------------------------ helpers ------------------------
def _rand_phone():
    return str(1_000_000_000 + int(uuid.uuid4().int % 8_999_999_999))


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login_customer(api):
    phone = _rand_phone()
    r = api.post(f"{BASE_URL}/api/auth/otp/request",
                 json={"phone": phone, "country_code": "+225"})
    assert r.status_code == 200, f"otp/request: {r.status_code} {r.text}"
    data = r.json()
    r = api.post(f"{BASE_URL}/api/auth/otp/verify",
                 json={"challenge_id": data["challenge_id"], "code": data["dev_code"]})
    assert r.status_code == 200, f"otp/verify: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _clear_cart(api, token):
    r = api.get(f"{BASE_URL}/api/carts/me", headers=_hdr(token))
    if r.status_code == 200:
        for it in r.json().get("items", []):
            api.delete(f"{BASE_URL}/api/carts/me/items/{it['id']}", headers=_hdr(token))


def _add(api, token, pid, qty):
    r = api.post(f"{BASE_URL}/api/carts/me/items",
                 headers=_hdr(token),
                 json={"product_id": pid, "quantity": qty, "module": "mart"})
    assert r.status_code in (200, 201), f"add cart: {r.status_code} {r.text}"


def _partner_login(api, email):
    r = api.post(f"{BASE_URL}/api/partner/auth/login",
                 json={"email": email, "password": PARTNER_PASSWORD})
    assert r.status_code == 200, f"partner login {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


CI_ADDRESS = {
    "line1": "12 Boulevard Latrille",
    "city": "Abidjan",
    "country": "CI",
    "latitude": 5.3535,
    "longitude": -3.9857,
}


# ============ Partner pricing overlay on /mart/products ============

class TestPartnerPricingOverlay:
    def test_products_have_partner_price_and_flags(self, api):
        r = api.get(f"{BASE_URL}/api/mart/products?country=CI&limit=100")
        assert r.status_code == 200
        rows = r.json()
        by_id = {p["id"]: p for p in rows}
        for pid in (PRD_BANANE, PRD_COCA, PRD_BAGUETTE):
            assert pid in by_id, f"missing seeded product {pid}"
            p = by_id[pid]
            assert "is_stocked_locally" in p
            assert p["is_stocked_locally"] is True, f"{pid} should be stocked locally"
            assert "master_price" in p, "master_price key required for strikethrough"
            assert p["master_price"] is not None
            assert p["price"] is not None
            # partner_price should be <= master (in these seeds Alpha/Beta price ≤ master)
        # Baguette min across partners must be 420 (Beta's price)
        assert float(by_id[PRD_BAGUETTE]["price"]) == 420.0

    def test_unstocked_product_flagged(self, api):
        r = api.get(f"{BASE_URL}/api/mart/products/{PRD_PASTEQUE}")
        assert r.status_code == 200
        p = r.json()
        assert p["is_stocked_locally"] is False
        assert p.get("partners_stocking", 0) == 0


# ============ Cart hydrate + unavailable_items[] ============

class TestCartOverlay:
    def test_cart_uses_partner_price_and_lists_unavailable(self, api):
        tok = _login_customer(api)
        _clear_cart(api, tok)
        _add(api, tok, PRD_BAGUETTE, 1)
        _add(api, tok, PRD_PASTEQUE, 1)
        r = api.get(f"{BASE_URL}/api/carts/me", headers=_hdr(tok))
        assert r.status_code == 200
        cart = r.json()
        by_pid = {i["product"]["id"]: i for i in cart["items"]}
        # Baguette must reflect partner price (420), not master
        bag = by_pid[PRD_BAGUETTE]["product"]
        assert bag["price"] == 420.0
        assert bag.get("master_price") is not None
        assert bag["is_stocked_locally"] is True
        # unavailable_items should include Pastèque
        unavail_ids = {u["product_id"] for u in cart.get("unavailable_items", [])}
        assert PRD_PASTEQUE in unavail_ids


# ============ Coming-soon 400 error ============

class TestComingSoon:
    def test_pasteque_only_cart_rejects_checkout(self, api):
        tok = _login_customer(api)
        _clear_cart(api, tok)
        _add(api, tok, PRD_PASTEQUE, 1)
        # Add enough baguette to clear min-order if needed
        _add(api, tok, PRD_BAGUETTE, 10)
        r = api.post(f"{BASE_URL}/api/orders",
                     headers=_hdr(tok),
                     json={"address": CI_ADDRESS, "payment_method": "cod"})
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail")
        assert isinstance(detail, dict), f"detail must be dict: {detail}"
        assert detail.get("code") == "not_available_in_area"
        gaps = detail.get("gaps") or []
        assert any(PRD_PASTEQUE == g.get("name") or "Pastèque" in (g.get("name") or "") or g for g in gaps), \
            f"gaps should list the missing item: {gaps}"
        assert len(gaps) >= 1


# ============ Multi-partner allocation + consolidation ============

@pytest.fixture(scope="module")
def multi_partner_order(api):
    """Create ONE customer order that triggers 2 PartnerOrders (Alpha+Beta)."""
    tok = _login_customer(api)
    _clear_cart(api, tok)
    _add(api, tok, PRD_BANANE,   2)   # Alpha only
    _add(api, tok, PRD_BAGUETTE, 3)   # Both — should consolidate to Alpha (already in plan)
    _add(api, tok, PRD_COCA,     1)   # Beta only
    r = api.post(f"{BASE_URL}/api/orders",
                 headers=_hdr(tok),
                 json={"address": CI_ADDRESS, "payment_method": "cod"})
    assert r.status_code == 200, f"create order failed: {r.status_code} {r.text}"
    order = r.json()
    return {"token": tok, "order": order}


class TestAllocationEngine:
    def test_two_partner_orders_created(self, multi_partner_order):
        o = multi_partner_order["order"]
        assert o.get("partner_count") == 2, f"expected 2 partners got {o.get('partner_count')}"
        partners = o.get("partners") or []
        assert len(partners) == 2
        # Each partner slice has subtotal + item_count
        for p in partners:
            assert p["subtotal"] > 0
            assert p["item_count"] > 0
            assert "partner_id" in p and "partner_name" in p

    def test_consolidation_baguette_routes_to_alpha(self, multi_partner_order):
        """Baguette is stocked by BOTH. Since Banane is Alpha-only, Alpha is
        already in the plan → allocator must route Baguette to Alpha, not the
        cheaper Beta."""
        o = multi_partner_order["order"]
        # Find Alpha slice (bigger — 2 banane + 3 baguette). Beta = 1 coca.
        by_count = sorted(o["partners"], key=lambda p: p["item_count"], reverse=True)
        alpha, beta = by_count[0], by_count[1]
        assert alpha["item_count"] == 5, f"Alpha slice should carry 2 banane + 3 baguette = 5 items, got {alpha['item_count']}"
        assert beta["item_count"] == 1, f"Beta slice should carry 1 coca, got {beta['item_count']}"
        # If Baguette went to Alpha at partner_price 450: alpha subtotal = banane*2 + 450*3
        # If it wrongly went to Beta at 420: alpha subtotal would be much smaller
        # We just check that Alpha subtotal reflects Baguette@450 (Alpha's price)
        # Beta subtotal must equal 1 * Coca partner price only
        # Coca is Beta only — verify Beta subtotal < Alpha subtotal
        assert alpha["subtotal"] > beta["subtotal"]

    def test_order_items_carry_partner_ids(self, api, multi_partner_order):
        """Verify OrderItems carry partner_id + partner_order_id (via order detail)."""
        o = multi_partner_order["order"]
        tok = multi_partner_order["token"]
        # Fetch through GET /api/orders/{id}
        r = api.get(f"{BASE_URL}/api/orders/{o['id']}", headers=_hdr(tok))
        assert r.status_code == 200
        detail = r.json()
        assert detail.get("partner_count") == 2
        items = detail.get("items") or []
        assert len(items) >= 3
        # partner_id is optional field in serializer — check at least one
        with_partner = [i for i in items if i.get("partner_id")]
        assert len(with_partner) >= 3, f"expected items to carry partner_id, got {items}"


# ============ Stock decrement + restoration ============

class TestStockLifecycle:
    def _get_stock(self, api, tok, product_id):
        """Look up a partner's PartnerProduct row for the master SKU via /api/partner/products."""
        r = api.get(f"{BASE_URL}/api/partner/products?limit=500", headers=_hdr(tok))
        assert r.status_code == 200
        for item in r.json()["items"]:
            if item.get("master_product_id") == product_id:
                return item["id"], item["stock_qty"]
        return None, None

    def test_stock_decrement_on_checkout_and_restore_on_cancel(self, api):
        alpha_tok = _partner_login(api, PARTNER_ALPHA_EMAIL)
        pp_id, stock_before = self._get_stock(api, alpha_tok, PRD_BANANE)
        assert pp_id and stock_before is not None, "Alpha must stock Banane"

        # Place an order using ONLY Banane so we know only Alpha's stock moves
        cust_tok = _login_customer(api)
        _clear_cart(api, cust_tok)
        _add(api, cust_tok, PRD_BANANE, 5)
        r = api.post(f"{BASE_URL}/api/orders",
                     headers=_hdr(cust_tok),
                     json={"address": CI_ADDRESS, "payment_method": "cod"})
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["partner_count"] == 1

        _, stock_after = self._get_stock(api, alpha_tok, PRD_BANANE)
        assert stock_after == stock_before - 5, \
            f"stock should be decremented by 5: before={stock_before} after={stock_after}"

        # Find the PartnerOrder id on Alpha side
        r = api.get(f"{BASE_URL}/api/partner/orders?status=new", headers=_hdr(alpha_tok))
        assert r.status_code == 200
        po_matches = [p for p in r.json()["items"] if p["order_id"] == order["id"]]
        assert po_matches, "PartnerOrder not found on Alpha for the new order"
        po = po_matches[0]

        # Cancel from partner side → stock must restore
        r = api.post(f"{BASE_URL}/api/partner/orders/{po['id']}/status",
                     headers=_hdr(alpha_tok),
                     json={"status": "cancelled", "reason": "test-restore"})
        assert r.status_code == 200, r.text

        _, stock_final = self._get_stock(api, alpha_tok, PRD_BANANE)
        assert stock_final == stock_before, \
            f"stock should be restored to {stock_before}, got {stock_final}"


# ============ Partner-orders view: subtotal / item_count / customer_total ============

class TestPartnerOrdersSlice:
    def test_partner_sees_only_own_slice(self, api, multi_partner_order):
        o = multi_partner_order["order"]
        alpha_tok = _partner_login(api, PARTNER_ALPHA_EMAIL)
        beta_tok = _partner_login(api, PARTNER_BETA_EMAIL)

        r = api.get(f"{BASE_URL}/api/partner/orders?limit=200", headers=_hdr(alpha_tok))
        assert r.status_code == 200
        alpha_po = [p for p in r.json()["items"] if p["order_id"] == o["id"]]
        assert len(alpha_po) == 1, "Alpha should see exactly one slice"
        alpha_slice = alpha_po[0]
        # 5 items on Alpha slice
        assert alpha_slice["item_count"] == 5
        # customer_total must be the grand total, different from slice subtotal
        assert alpha_slice["customer_total"] == o["total"]
        assert alpha_slice["subtotal"] < alpha_slice["customer_total"]
        # items list must only contain THIS partner's items (2 lines: banane + baguette)
        assert len(alpha_slice["items"]) == 2

        r = api.get(f"{BASE_URL}/api/partner/orders?limit=200", headers=_hdr(beta_tok))
        assert r.status_code == 200
        beta_po = [p for p in r.json()["items"] if p["order_id"] == o["id"]]
        assert len(beta_po) == 1
        beta_slice = beta_po[0]
        assert beta_slice["item_count"] == 1
        assert len(beta_slice["items"]) == 1


# ============ State machine + wallet credit uses slice subtotal ============

class TestWalletCreditFromSlice:
    def test_handoff_credits_slice_subtotal_net_commission(self, api, multi_partner_order):
        o = multi_partner_order["order"]
        alpha_tok = _partner_login(api, PARTNER_ALPHA_EMAIL)

        # Get Alpha's PartnerOrder for this order
        r = api.get(f"{BASE_URL}/api/partner/orders?limit=200", headers=_hdr(alpha_tok))
        po = next(p for p in r.json()["items"] if p["order_id"] == o["id"])
        po_id = po["id"]
        alpha_subtotal = float(po["subtotal"])

        # Wallet balance before
        r = api.get(f"{BASE_URL}/api/partner/wallet", headers=_hdr(alpha_tok))
        assert r.status_code == 200
        bal_before = float(r.json()["wallet"]["balance"])

        # Walk state machine: new → accepted → packing → ready → handed_off
        for status in ("accepted", "packing", "ready", "handed_off"):
            r = api.post(f"{BASE_URL}/api/partner/orders/{po_id}/status",
                         headers=_hdr(alpha_tok),
                         json={"status": status})
            assert r.status_code == 200, f"{status}: {r.status_code} {r.text}"

        # Wallet balance after
        r = api.get(f"{BASE_URL}/api/partner/wallet", headers=_hdr(alpha_tok))
        bal_after = float(r.json()["wallet"]["balance"])
        expected_net = round(alpha_subtotal * 0.9, 2)
        gained = round(bal_after - bal_before, 2)
        # Allow small floating epsilon
        assert abs(gained - expected_net) < 1.0, \
            f"wallet credit {gained} should ≈ 90% of slice subtotal {alpha_subtotal} (expected {expected_net})"
        # And crucially NOT equal to customer grand total * 0.9
        customer_total_net = round(o["total"] * 0.9, 2)
        assert abs(gained - customer_total_net) > 1.0, \
            "wallet credited from customer grand total instead of partner slice"

    def test_invalid_transition_returns_409(self, api):
        """Regression: invalid state jump returns 409."""
        # Create a fresh order to have a `new` PO on Beta side
        tok = _login_customer(api)
        _clear_cart(api, tok)
        _add(api, tok, PRD_COCA, 2)
        _add(api, tok, PRD_BAGUETTE, 10)  # ensures min-order
        r = api.post(f"{BASE_URL}/api/orders", headers=_hdr(tok),
                     json={"address": CI_ADDRESS, "payment_method": "cod"})
        assert r.status_code == 200
        order = r.json()

        beta_tok = _partner_login(api, PARTNER_BETA_EMAIL)
        r = api.get(f"{BASE_URL}/api/partner/orders?status=new", headers=_hdr(beta_tok))
        po = next(p for p in r.json()["items"] if p["order_id"] == order["id"])

        # Try to jump new → completed
        r = api.post(f"{BASE_URL}/api/partner/orders/{po['id']}/status",
                     headers=_hdr(beta_tok),
                     json={"status": "completed"})
        assert r.status_code == 409, f"invalid transition should return 409, got {r.status_code}: {r.text}"
