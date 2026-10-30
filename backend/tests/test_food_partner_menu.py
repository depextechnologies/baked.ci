"""FOODbakēd — Restaurant Partner auth + Menu CRUD roundtrip regression.

Covers:
  * Super-admin creates a partner account → partner logs in → GETs /auth/me
  * Duplicate partner email → 409
  * Wrong password / inactive → 401 / 403
  * Menu CRUD (sections, items, variants, addons) via BOTH tokens
  * Cross-restaurant isolation — partner CANNOT touch another restaurant's menu (403)
  * Delete partner (super-admin only)
  * Partner self-service restaurant patch (limited fields)
"""
from __future__ import annotations
import os
import pathlib
import uuid

import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]

RID_CI = "burger_hub_ci"
RID_IN = "burger_hub_in"


def _admin_token() -> str:
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com",
                            "password": "baked@2026#!$@"}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def _admin_hdr() -> dict:
    return {"Authorization": f"Bearer {_admin_token()}"}


def _make_partner(rid: str = RID_CI, password: str = "PartnerPass123") -> tuple[str, str, dict]:
    """Create a partner via super-admin. Returns (partner_id, partner_token, partner_row)."""
    hdr = _admin_hdr()
    email = f"qa-partner-{uuid.uuid4().hex[:8]}@example.com"
    body = {"email": email, "password": password, "name": "QA Partner"}
    r = requests.post(f"{BASE_URL}/api/admin/food/restaurants/{rid}/partners",
                      headers=hdr, json=body, timeout=10)
    assert r.status_code == 200, r.text
    row = r.json()
    # Log in as partner
    r2 = requests.post(f"{BASE_URL}/api/food/partner/auth/login",
                       json={"email": email, "password": password}, timeout=10)
    assert r2.status_code == 200, r2.text
    return row["id"], r2.json()["access_token"], row


def _cleanup_partner(pid: str):
    requests.delete(f"{BASE_URL}/api/admin/food/partners/{pid}", headers=_admin_hdr(), timeout=10)


# ------------------------------------------------------------------ auth --

def test_partner_login_and_me():
    pid, tok, row = _make_partner()
    try:
        r = requests.get(f"{BASE_URL}/api/food/partner/auth/me",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["partner"]["id"] == pid
        assert data["restaurant"]["id"] == RID_CI
    finally:
        _cleanup_partner(pid)


def test_partner_login_wrong_password_401():
    pid, _tok, row = _make_partner()
    try:
        r = requests.post(f"{BASE_URL}/api/food/partner/auth/login",
                          json={"email": row["email"], "password": "wrong-pw"}, timeout=10)
        assert r.status_code == 401
    finally:
        _cleanup_partner(pid)


def test_partner_duplicate_email_409():
    pid, _tok, row = _make_partner()
    try:
        r = requests.post(f"{BASE_URL}/api/admin/food/restaurants/{RID_CI}/partners",
                          headers=_admin_hdr(),
                          json={"email": row["email"], "password": "AnotherPass1"}, timeout=10)
        assert r.status_code == 409
    finally:
        _cleanup_partner(pid)


def test_partner_login_disabled_403():
    pid, _tok, row = _make_partner()
    try:
        # Disable
        r = requests.patch(f"{BASE_URL}/api/admin/food/partners/{pid}",
                           headers=_admin_hdr(), json={"is_active": False}, timeout=10)
        assert r.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/food/partner/auth/login",
                           json={"email": row["email"], "password": "PartnerPass123"}, timeout=10)
        assert r2.status_code == 403
    finally:
        _cleanup_partner(pid)


def test_partner_password_reset_by_admin():
    pid, _tok, row = _make_partner()
    try:
        r = requests.patch(f"{BASE_URL}/api/admin/food/partners/{pid}",
                           headers=_admin_hdr(), json={"password": "NewSecret1"}, timeout=10)
        assert r.status_code == 200
        # Old password fails
        r_old = requests.post(f"{BASE_URL}/api/food/partner/auth/login",
                              json={"email": row["email"], "password": "PartnerPass123"}, timeout=10)
        assert r_old.status_code == 401
        # New succeeds
        r_new = requests.post(f"{BASE_URL}/api/food/partner/auth/login",
                              json={"email": row["email"], "password": "NewSecret1"}, timeout=10)
        assert r_new.status_code == 200
    finally:
        _cleanup_partner(pid)


# ------------------------------------------------------------------ menu --

def test_admin_menu_crud_full():
    hdr = _admin_hdr()
    # GET seeded menu
    r = requests.get(f"{BASE_URL}/api/food/manage/{RID_CI}/menu", headers=hdr, timeout=10)
    assert r.status_code == 200
    initial = r.json()
    assert len(initial["sections"]) >= 1

    # Create section
    r = requests.post(f"{BASE_URL}/api/food/manage/{RID_CI}/sections",
                      headers=hdr, json={"name_en": "QA", "name_fr": "QA-FR", "sort_order": 999}, timeout=10)
    assert r.status_code == 200
    sid = r.json()["id"]

    try:
        # Rename
        r = requests.patch(f"{BASE_URL}/api/food/manage/{RID_CI}/sections/{sid}",
                           headers=hdr, json={"name_fr": "QA-FR-2"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["name_fr"] == "QA-FR-2"

        # Create item
        r = requests.post(f"{BASE_URL}/api/food/manage/{RID_CI}/items",
                          headers=hdr, json={"section_id": sid, "name": "QA Dish", "base_price": 1000,
                                             "currency": "XOF", "tags": ["new"]}, timeout=10)
        assert r.status_code == 200, r.text
        iid = r.json()["id"]

        # Patch item
        r = requests.patch(f"{BASE_URL}/api/food/manage/{RID_CI}/items/{iid}",
                           headers=hdr, json={"description": "New desc", "is_available": False, "tags": ["special"]}, timeout=10)
        assert r.status_code == 200
        assert r.json()["is_available"] is False
        assert r.json()["tags"] == ["special"]

        # Variant lifecycle
        r = requests.post(f"{BASE_URL}/api/food/manage/{RID_CI}/items/{iid}/variants",
                          headers=hdr, json={"name_en": "L", "name_fr": "Grand", "price_delta": 500, "is_default": True}, timeout=10)
        assert r.status_code == 200
        vid = r.json()["id"]
        r = requests.patch(f"{BASE_URL}/api/food/manage/{RID_CI}/items/{iid}/variants/{vid}",
                           headers=hdr, json={"price_delta": 700}, timeout=10)
        assert r.status_code == 200
        assert r.json()["price_delta"] == 700.0
        r = requests.delete(f"{BASE_URL}/api/food/manage/{RID_CI}/items/{iid}/variants/{vid}", headers=hdr, timeout=10)
        assert r.status_code == 200

        # Addon lifecycle
        r = requests.post(f"{BASE_URL}/api/food/manage/{RID_CI}/items/{iid}/addons",
                          headers=hdr, json={"name_en": "Cheese", "name_fr": "Fromage", "price": 200}, timeout=10)
        assert r.status_code == 200
        aid = r.json()["id"]
        r = requests.delete(f"{BASE_URL}/api/food/manage/{RID_CI}/items/{iid}/addons/{aid}", headers=hdr, timeout=10)
        assert r.status_code == 200

        # Delete item
        r = requests.delete(f"{BASE_URL}/api/food/manage/{RID_CI}/items/{iid}", headers=hdr, timeout=10)
        assert r.status_code == 200
    finally:
        requests.delete(f"{BASE_URL}/api/food/manage/{RID_CI}/sections/{sid}", headers=hdr, timeout=10)


def test_partner_menu_crud_and_isolation():
    pid, tok, _ = _make_partner(RID_CI)
    phdr = {"Authorization": f"Bearer {tok}"}
    try:
        # Read own menu
        r = requests.get(f"{BASE_URL}/api/food/manage/{RID_CI}/menu", headers=phdr, timeout=10)
        assert r.status_code == 200

        # Cannot read another restaurant's menu
        r = requests.get(f"{BASE_URL}/api/food/manage/{RID_IN}/menu", headers=phdr, timeout=10)
        assert r.status_code == 403

        # Cannot create section elsewhere
        r = requests.post(f"{BASE_URL}/api/food/manage/{RID_IN}/sections",
                          headers=phdr, json={"name_en": "X", "name_fr": "X"}, timeout=10)
        assert r.status_code == 403

        # Own section CRUD roundtrip
        r = requests.post(f"{BASE_URL}/api/food/manage/{RID_CI}/sections",
                          headers=phdr, json={"name_en": "PQA", "name_fr": "PQA-FR"}, timeout=10)
        assert r.status_code == 200
        sid = r.json()["id"]
        r = requests.delete(f"{BASE_URL}/api/food/manage/{RID_CI}/sections/{sid}", headers=phdr, timeout=10)
        assert r.status_code == 200
    finally:
        _cleanup_partner(pid)


def test_partner_restaurant_patch_only_allowlist():
    pid, tok, _ = _make_partner(RID_CI)
    phdr = {"Authorization": f"Bearer {tok}"}
    try:
        r = requests.patch(f"{BASE_URL}/api/food/partner/restaurant",
                           headers=phdr, json={"prep_time_min": 18, "is_open": False}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["prep_time_min"] == 18
        assert r.json()["is_open"] is False
        # Restore
        requests.patch(f"{BASE_URL}/api/food/partner/restaurant",
                       headers=phdr, json={"prep_time_min": 20, "is_open": True}, timeout=10)
    finally:
        _cleanup_partner(pid)


def test_manage_endpoints_reject_unauthenticated():
    r = requests.get(f"{BASE_URL}/api/food/manage/{RID_CI}/menu", timeout=10)
    assert r.status_code == 401
    r = requests.post(f"{BASE_URL}/api/food/manage/{RID_CI}/sections",
                      json={"name_en": "X", "name_fr": "Y"}, timeout=10)
    assert r.status_code == 401
    r = requests.patch(f"{BASE_URL}/api/food/partner/restaurant", json={"is_open": True}, timeout=10)
    assert r.status_code == 401
