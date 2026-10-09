"""FOODbakēd admin CRUD regression — Feb 2026.

Covers:
  * Auth: unauthenticated GETs on admin routes are rejected (401)
  * Categories: create → patch → delete (+ list)
  * Cuisines:   create → patch → delete (+ list)
  * Restaurants: create → patch → delete (+ list + country filter)
  * Image upload: POST /api/admin/food/uploads → served back via /api/food/uploads/*
"""
from __future__ import annotations
import io
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


def _admin_token() -> str:
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com",
                            "password": "baked@2026#!$@"},
                      timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def _hdr() -> dict:
    return {"Authorization": f"Bearer {_admin_token()}"}


# ------------------------------------------------------------------ auth --

def test_categories_admin_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/food/categories", timeout=10)
    assert r.status_code == 401


def test_cuisines_admin_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/food/cuisines", timeout=10)
    assert r.status_code == 401


def test_restaurants_admin_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/food/restaurants", timeout=10)
    assert r.status_code == 401


def test_uploads_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/food/uploads", timeout=10)
    assert r.status_code == 401


# ------------------------------------------------------------ categories --

def test_categories_crud_roundtrip():
    hdr = _hdr()
    code_suffix = uuid.uuid4().hex[:6]
    payload = {
        "code": f"qa_cat_{code_suffix}",
        "name_en": "QA Cat",
        "name_fr": "QA Catégorie",
        "image": "",
        "sort_order": 100,
        "is_active": True,
    }
    # slug rewrite: underscores → hyphens
    expected_code = f"qa-cat-{code_suffix}"

    # Create
    r = requests.post(f"{BASE_URL}/api/admin/food/categories", headers=hdr, json=payload, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["code"] == expected_code
    assert data["name_fr"] == "QA Catégorie"

    # List includes new row
    r = requests.get(f"{BASE_URL}/api/admin/food/categories", headers=hdr, timeout=10)
    assert r.status_code == 200
    assert any(c["code"] == expected_code for c in r.json())

    # Patch
    r = requests.patch(f"{BASE_URL}/api/admin/food/categories/{expected_code}",
                       headers=hdr, json={"name_fr": "QA Modifié"}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["name_fr"] == "QA Modifié"

    # Delete
    r = requests.delete(f"{BASE_URL}/api/admin/food/categories/{expected_code}", headers=hdr, timeout=10)
    assert r.status_code == 200
    assert r.json()["deleted"] == expected_code

    # Confirm gone
    r = requests.patch(f"{BASE_URL}/api/admin/food/categories/{expected_code}",
                       headers=hdr, json={"name_fr": "x"}, timeout=10)
    assert r.status_code == 404


# ------------------------------------------------------------ cuisines --

def test_cuisines_crud_roundtrip():
    hdr = _hdr()
    code_suffix = uuid.uuid4().hex[:6]
    payload = {"code": f"qa_cui_{code_suffix}", "name_en": "QA Cui", "name_fr": "QA Cuisine", "image": "", "sort_order": 200, "is_active": True}
    expected_code = f"qa-cui-{code_suffix}"

    r = requests.post(f"{BASE_URL}/api/admin/food/cuisines", headers=hdr, json=payload, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["code"] == expected_code

    r = requests.patch(f"{BASE_URL}/api/admin/food/cuisines/{expected_code}",
                       headers=hdr, json={"is_active": False}, timeout=10)
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    r = requests.delete(f"{BASE_URL}/api/admin/food/cuisines/{expected_code}", headers=hdr, timeout=10)
    assert r.status_code == 200


# ------------------------------------------------------------ restaurants --

def test_restaurants_crud_roundtrip():
    hdr = _hdr()
    suffix = uuid.uuid4().hex[:6]
    payload = {
        "name": f"QA Bistro {suffix}",
        "country": "CI",
        "cuisines": ["burgers", "healthy"],
        "rating": 4.3,
        "review_count": 10,
        "prep_time_min": 15,
        "prep_time_max": 25,
        "delivery_fee": 500,
        "is_open": True,
        "featured": False,
        "sort_order": 99,
        "image": "",
        "status": "active",
    }
    r = requests.post(f"{BASE_URL}/api/admin/food/restaurants", headers=hdr, json=payload, timeout=10)
    assert r.status_code == 200, r.text
    created = r.json()
    rid = created["id"]
    assert rid.endswith("_ci")
    assert created["cuisines"] == ["burgers", "healthy"]

    # Filter by country
    r = requests.get(f"{BASE_URL}/api/admin/food/restaurants?country=CI", headers=hdr, timeout=10)
    assert r.status_code == 200
    assert any(x["id"] == rid for x in r.json())

    # Patch — flip featured + update cuisines
    r = requests.patch(f"{BASE_URL}/api/admin/food/restaurants/{rid}",
                       headers=hdr, json={"featured": True, "cuisines": ["indian"]}, timeout=10)
    assert r.status_code == 200
    assert r.json()["featured"] is True
    assert r.json()["cuisines"] == ["indian"]

    # Delete
    r = requests.delete(f"{BASE_URL}/api/admin/food/restaurants/{rid}", headers=hdr, timeout=10)
    assert r.status_code == 200


def test_restaurants_duplicate_rejected():
    hdr = _hdr()
    suffix = uuid.uuid4().hex[:6]
    body = {"name": f"QA Dup {suffix}", "country": "CI"}
    r1 = requests.post(f"{BASE_URL}/api/admin/food/restaurants", headers=hdr, json=body, timeout=10)
    assert r1.status_code == 200, r1.text
    rid = r1.json()["id"]
    try:
        r2 = requests.post(f"{BASE_URL}/api/admin/food/restaurants", headers=hdr, json=body, timeout=10)
        assert r2.status_code == 409
    finally:
        requests.delete(f"{BASE_URL}/api/admin/food/restaurants/{rid}", headers=hdr, timeout=10)


# ------------------------------------------------------------ uploads --

_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x00\x03\x00\x01\x9dp\xe2\xd6\x00\x00\x00\x00IEND\xaeB`\x82"
)


def test_uploads_and_serve_roundtrip():
    hdr = _hdr()
    files = {"file": ("qa.png", io.BytesIO(_PNG_BYTES), "image/png")}
    r = requests.post(f"{BASE_URL}/api/admin/food/uploads?kind=restaurant_logo",
                      headers=hdr, files=files, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["file_url"].startswith("/api/food/uploads/")
    assert body["content_type"] == "image/png"
    # Public serve (no auth)
    r2 = requests.get(f"{BASE_URL}{body['file_url']}", timeout=10)
    assert r2.status_code == 200
    assert r2.headers["content-type"].startswith("image/")
    assert len(r2.content) > 0


def test_uploads_rejects_non_image():
    hdr = _hdr()
    files = {"file": ("qa.txt", io.BytesIO(b"hello world"), "text/plain")}
    r = requests.post(f"{BASE_URL}/api/admin/food/uploads?kind=misc",
                      headers=hdr, files=files, timeout=15)
    assert r.status_code == 400
