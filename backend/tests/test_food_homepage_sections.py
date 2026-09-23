"""FOODbakēd homepage sections — Feb 2026.

Verifies that:
  * `module='food'` is accepted alongside mart/shop
  * The 6 new FOOD section_types validate (food_hero, food_categories, food_cuisines,
    food_featured_restaurants, food_promos, food_usps)
  * Public GET /api/homepage?country=X&module=food returns them ordered/enabled
  * Toggling `is_enabled` off hides the section from the public feed
"""
from __future__ import annotations
import os
import pathlib
import uuid

import pytest
import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]

FOOD_SECTION_TYPES = [
    "food_hero", "food_categories", "food_cuisines",
    "food_featured_restaurants", "food_promos", "food_usps",
]


def _token() -> str:
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com",
                            "password": "baked@2026#!$@"}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def _hdr() -> dict:
    return {"Authorization": f"Bearer {_token()}"}


@pytest.mark.parametrize("section_type", FOOD_SECTION_TYPES)
def test_food_section_types_accepted(section_type):
    hdr = _hdr()
    tag = uuid.uuid4().hex[:6]
    payload = {
        "country": "CI", "module": "food",
        "section_type": section_type,
        "title": f"QA {section_type} {tag}",
        "config": {}, "display_order": 999, "is_enabled": True,
    }
    r = requests.post(f"{BASE_URL}/api/admin/homepage-sections", headers=hdr, json=payload, timeout=10)
    assert r.status_code == 201, f"{section_type}: {r.status_code} {r.text}"
    sid = r.json()["id"]
    try:
        assert r.json()["section_type"] == section_type
        assert r.json()["module"] == "food"
    finally:
        requests.delete(f"{BASE_URL}/api/admin/homepage-sections/{sid}", headers=hdr, timeout=10)


def test_food_public_homepage_scoped_by_module():
    hdr = _hdr()
    tag = uuid.uuid4().hex[:6]
    body = {"country": "CI", "module": "food", "section_type": "food_hero",
            "title": f"QA hero {tag}", "config": {"eyebrow": "TEST"},
            "display_order": 5, "is_enabled": True}
    r = requests.post(f"{BASE_URL}/api/admin/homepage-sections", headers=hdr, json=body, timeout=10)
    assert r.status_code == 201
    sid = r.json()["id"]
    try:
        r2 = requests.get(f"{BASE_URL}/api/homepage?country=CI&module=food", timeout=10)
        assert r2.status_code == 200
        sections = r2.json()["sections"]
        assert any(s["id"] == sid for s in sections), "our food_hero must appear in the food feed"

        # And it must NOT appear on the mart feed.
        r3 = requests.get(f"{BASE_URL}/api/homepage?country=CI&module=mart", timeout=10)
        assert r3.status_code == 200
        assert not any(s["id"] == sid for s in r3.json()["sections"])
    finally:
        requests.delete(f"{BASE_URL}/api/admin/homepage-sections/{sid}", headers=hdr, timeout=10)


def test_food_disabled_section_hidden_publicly():
    hdr = _hdr()
    tag = uuid.uuid4().hex[:6]
    body = {"country": "CI", "module": "food", "section_type": "food_usps",
            "title": f"QA usps {tag}", "config": {}, "display_order": 700, "is_enabled": True}
    r = requests.post(f"{BASE_URL}/api/admin/homepage-sections", headers=hdr, json=body, timeout=10)
    sid = r.json()["id"]
    try:
        # Disable
        r2 = requests.patch(f"{BASE_URL}/api/admin/homepage-sections/{sid}",
                            headers=hdr, json={"is_enabled": False}, timeout=10)
        assert r2.status_code == 200
        r3 = requests.get(f"{BASE_URL}/api/homepage?country=CI&module=food", timeout=10)
        assert not any(s["id"] == sid for s in r3.json()["sections"])
    finally:
        requests.delete(f"{BASE_URL}/api/admin/homepage-sections/{sid}", headers=hdr, timeout=10)
