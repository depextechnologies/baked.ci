"""Social.docx Issue #8 — Pick location on Orders + Picker (Iteration 51).

Verifies:
  * GET /api/partner/orders (list) — each item has pick_location + partner_product_id.
  * GET /api/partner/orders/{po_id} (detail) — same, with structured sub-objects.
  * GET /api/partner/picker/orders/{po_id} — lines sorted by walking order
    (zone → aisle → rack → shelf → bin), unassigned last, and pick_location per line.
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PASSWORD = "Alpha1234!Beta"
STORE_CODE = "MRT-ABJ-001"
STAFF_EMPLOYEE = "EMP-ABJ-001"
STAFF_PASSWORD = "Packer1234!"
SEED_PO_ID = "po_1ba921c2d4474d27"


@pytest.fixture(scope="module")
def partner_token():
    r = requests.post(f"{BASE_URL}/api/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def partner_headers(partner_token):
    return {"Authorization": f"Bearer {partner_token}"}


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(
        f"{BASE_URL}/api/partner/auth/staff-login",
        json={"identifier": STAFF_EMPLOYEE, "password": STAFF_PASSWORD,
              "store_id": STORE_CODE},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"staff-login failed {r.status_code}: {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def staff_headers(staff_token):
    return {"Authorization": f"Bearer {staff_token}"}


# ---------------------------- LIST + DETAIL --------------------------------

class TestOrdersPickLocation:
    def test_orders_list_items_include_pick_location_key(self, partner_headers):
        r = requests.get(f"{BASE_URL}/api/partner/orders", headers=partner_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        # Find seed order
        po = next((o for o in data["items"] if o["id"] == SEED_PO_ID), None)
        assert po is not None, f"seed order {SEED_PO_ID} not in list"
        assert po["items"], "seed order has no items"
        for it in po["items"]:
            assert "partner_product_id" in it, "missing partner_product_id"
            assert "pick_location" in it, "missing pick_location key"

    def test_orders_detail_pick_location_structure(self, partner_headers):
        r = requests.get(f"{BASE_URL}/api/partner/orders/{SEED_PO_ID}",
                         headers=partner_headers, timeout=15)
        assert r.status_code == 200, r.text
        po = r.json()
        items = po["items"]
        assert len(items) >= 3, f"expected >=3 lines, got {len(items)}"

        # Banane Cavendish should be at Bin B01, Baguette at B02, Lait Frais unset.
        by_name = {(it.get("name") or "").lower(): it for it in items}
        banane = next((v for k, v in by_name.items() if "banane" in k), None)
        baguette = next((v for k, v in by_name.items() if "baguette" in k), None)
        lait = next((v for k, v in by_name.items() if "lait" in k), None)
        assert banane and baguette and lait, f"missing expected products: {list(by_name)}"

        # Banane pick_location
        pl = banane["pick_location"]
        assert pl is not None, "Banane pick_location must not be null"
        assert "label" in pl and pl["label"]
        assert "Bin B01" in pl["label"], f"unexpected label: {pl['label']}"
        # structured
        for k in ("zone", "aisle", "rack", "shelf", "bin"):
            assert k in pl, f"missing sub-object {k}"
        assert pl["bin"]["code"] == "B01"

        pl2 = baguette["pick_location"]
        assert pl2 and pl2["bin"]["code"] == "B02"

        # Lait Frais has no bin
        assert lait["pick_location"] is None, f"Lait should have null pick_location, got {lait['pick_location']}"


# ---------------------------- PICKER ---------------------------------------

class TestPickerPickLocation:
    def test_picker_detail_lines_sorted_and_have_pick_location(self, staff_headers):
        r = requests.get(f"{BASE_URL}/api/partner/picker/orders/{SEED_PO_ID}",
                         headers=staff_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "packing", f"expected packing, got {data['status']}"
        lines = data["lines"]
        assert len(lines) >= 3, lines

        # Each line must have pick_location key
        for ln in lines:
            assert "pick_location" in ln

        # Sort order: those with bins first (by bin code asc), unassigned last
        # Expect: Banane (B01), Baguette (B02), Lait (null)
        names = [(ln.get("name") or "").lower() for ln in lines]
        # find indices
        idx_banane = next((i for i, n in enumerate(names) if "banane" in n), -1)
        idx_baguette = next((i for i, n in enumerate(names) if "baguette" in n), -1)
        idx_lait = next((i for i, n in enumerate(names) if "lait" in n), -1)
        assert idx_banane >= 0 and idx_baguette >= 0 and idx_lait >= 0
        assert idx_banane < idx_baguette, f"B01 must precede B02; order={names}"
        assert idx_baguette < idx_lait, f"unassigned must sink last; order={names}"

        # Verify pick_location values
        banane_line = lines[idx_banane]
        assert banane_line["pick_location"] is not None
        assert banane_line["pick_location"]["bin"]["code"] == "B01"
        assert "Zone" in banane_line["pick_location"]["label"]

        lait_line = lines[idx_lait]
        assert lait_line["pick_location"] is None
