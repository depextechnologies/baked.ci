"""FOODbakēd — Reviews public list + moderation unit + gate."""
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


def test_public_reviews_list_reads_seeded_demo():
    r = requests.get(f"{BASE_URL}/api/food/restaurants/burger-hub/reviews?country=CI&size=10", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 6, body
    # Seed rows present with "Prénom N." display
    authors = {rv["author"] for rv in body["reviews"]}
    assert {"Aïcha K.", "Kouassi T."}.issubset(authors)
    assert body["summary"]["average"] > 0
    assert sum(body["summary"]["distribution"].values()) == body["total"]


def test_reviews_sort_switches_result_order():
    r = requests.get(f"{BASE_URL}/api/food/restaurants/burger-hub/reviews?country=CI&sort=top&size=3", timeout=15)
    top = r.json()["reviews"]
    r = requests.get(f"{BASE_URL}/api/food/restaurants/burger-hub/reviews?country=CI&sort=low&size=3", timeout=15)
    low = r.json()["reviews"]
    assert top[0]["rating"] >= low[0]["rating"]


def test_review_moderation_flags_urls_emails_phones():
    """Deterministic moderator unit test — imported directly from the module."""
    import sys, pathlib as _p
    sys.path.insert(0, str(_p.Path(__file__).resolve().parents[1]))
    from modules.food.reviews import _moderate  # noqa: E402

    assert _moderate("Great burgers, come try!") is None
    assert _moderate("Visit https://spam.example now") == "contains_link"
    assert _moderate("Message me at qa@example.com") == "contains_email"
    assert _moderate("Whatsapp +225 07 12 34 56 78") == "contains_phone"
    assert _moderate("cliquez ici pour le promo") == "prohibited_content"
    assert _moderate("SUCH A HORRIBLE PLACE NEVER RETURN") == "possible_shouting"


def test_reviews_write_requires_bearer_token():
    r = requests.post(f"{BASE_URL}/api/food/customer/reviews",
                      json={"rating": 5, "reservation_id": "rsv_x"}, timeout=10)
    # No auth → 401 (customer bearer required)
    assert r.status_code in (401, 403)
