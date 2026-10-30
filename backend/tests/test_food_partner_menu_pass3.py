"""FOODbakēd — Pass 3 Menu CRUD extensions.

Scope:
  • POST /food/manage/{rid}/items/{iid}/duplicate — deep clones an item
    + its variants + its addons as new rows with new IDs, name suffixed
    with "(Copie)"/"(Copy)", lands with is_available=FALSE.
  • Section reorder: PATCH /food/manage/{rid}/sections/{sid} with
    sort_order persists correctly and the public menu reflects the new
    order on the next read.
"""
from __future__ import annotations

import os
import pathlib

import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]
RID = "burger_hub_ci"


def _admin() -> dict:
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}, timeout=10)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _menu(headers=None) -> dict:
    r = requests.get(f"{BASE_URL}/api/food/manage/{RID}/menu",
                     headers=headers or _admin(), timeout=10)
    r.raise_for_status()
    return r.json()


def _first_item() -> dict:
    """Return the first available item in burger-hub's menu, after making
    sure it has at least one variant and one addon so the duplicate test
    is meaningful. Non-destructive if the item already has children."""
    hdr = _admin()
    menu = _menu(hdr)
    sec = next(s for s in menu["sections"] if s["items"])
    item = sec["items"][0]
    # Ensure at least one variant
    if not item.get("variants"):
        requests.post(f"{BASE_URL}/api/food/manage/{RID}/items/{item['id']}/variants",
                      headers=hdr, json={
                          "name_fr": "Normale", "name_en": "Regular",
                          "price_delta": 0, "is_default": True, "sort_order": 0,
                      }, timeout=10).raise_for_status()
    if not item.get("addons"):
        requests.post(f"{BASE_URL}/api/food/manage/{RID}/items/{item['id']}/addons",
                      headers=hdr, json={
                          "name_fr": "Supplément fromage", "name_en": "Extra cheese",
                          "price": 500, "sort_order": 0,
                      }, timeout=10).raise_for_status()
    # Re-read with the new children.
    menu = _menu(hdr)
    for s in menu["sections"]:
        for it in s["items"]:
            if it["id"] == item["id"]:
                return it
    raise AssertionError("couldn't re-fetch seeded item")


# ---------------------------------------------------------------------------
# Duplicate endpoint
# ---------------------------------------------------------------------------

def test_duplicate_creates_sold_out_clone_with_children():
    hdr = _admin()
    src = _first_item()

    r = requests.post(f"{BASE_URL}/api/food/manage/{RID}/items/{src['id']}/duplicate",
                      headers={**hdr, "X-Lang": "fr"}, timeout=10)
    assert r.status_code == 200, r.text
    dup = r.json()

    # Core assertions
    assert dup["id"] != src["id"]
    assert dup["name"].endswith("(Copie)"), dup["name"]
    assert dup["is_available"] is False, "clone must land unavailable"
    assert dup["section_id"] == src["section_id"]
    assert float(dup["base_price"]) == float(src["base_price"])
    assert dup["currency"] == src["currency"]
    assert set(dup.get("tags") or []) == set(src.get("tags") or [])

    # Variants + addons were cloned 1:1 with FRESH ids
    menu = _menu(hdr)
    clone_full = None
    for s in menu["sections"]:
        for it in s["items"]:
            if it["id"] == dup["id"]:
                clone_full = it
    assert clone_full is not None
    assert len(clone_full["variants"]) == len(src["variants"])
    assert len(clone_full["addons"])   == len(src["addons"])
    src_vids = {v["id"] for v in src["variants"]}
    for v in clone_full["variants"]:
        assert v["id"] not in src_vids, "variant ids must be new"
    src_aids = {a["id"] for a in src["addons"]}
    for a in clone_full["addons"]:
        assert a["id"] not in src_aids, "addon ids must be new"


def test_duplicate_en_suffix_via_header():
    hdr = _admin()
    src = _first_item()
    r = requests.post(f"{BASE_URL}/api/food/manage/{RID}/items/{src['id']}/duplicate",
                      headers={**hdr, "X-Lang": "en"}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["name"].endswith("(Copy)")


def test_duplicate_404_for_unknown_item():
    r = requests.post(f"{BASE_URL}/api/food/manage/{RID}/items/does-not-exist/duplicate",
                      headers=_admin(), timeout=10)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Section reorder — public menu reflects the new order immediately
# ---------------------------------------------------------------------------

def test_section_reorder_persists_and_affects_public_menu():
    hdr = _admin()
    before = _menu(hdr)
    ordered = before["sections"]
    assert len(ordered) >= 2, "need ≥2 sections for a swap test"

    first, second = ordered[0], ordered[1]
    # Swap their sort_order values via PATCH
    requests.patch(f"{BASE_URL}/api/food/manage/{RID}/sections/{first['id']}",
                   headers=hdr, json={"sort_order": second["sort_order"] + 1},
                   timeout=10).raise_for_status()
    requests.patch(f"{BASE_URL}/api/food/manage/{RID}/sections/{second['id']}",
                   headers=hdr, json={"sort_order": first["sort_order"] - 1},
                   timeout=10).raise_for_status()

    # Public menu endpoint should now return `second` BEFORE `first`.
    pub = requests.get(f"{BASE_URL}/api/food/restaurants/{RID}/menu", timeout=10).json()
    pub_order = [s["id"] for s in pub["sections"]]
    assert pub_order.index(second["id"]) < pub_order.index(first["id"]), pub_order

    # Reset so other tests don't see a shuffled menu (idempotent self-undo).
    requests.patch(f"{BASE_URL}/api/food/manage/{RID}/sections/{first['id']}",
                   headers=hdr, json={"sort_order": first["sort_order"]}, timeout=10)
    requests.patch(f"{BASE_URL}/api/food/manage/{RID}/sections/{second['id']}",
                   headers=hdr, json={"sort_order": second["sort_order"]}, timeout=10)
