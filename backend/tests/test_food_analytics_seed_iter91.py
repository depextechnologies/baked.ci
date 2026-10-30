"""Iteration 91 — seed idempotency + auth guard smoke for analytics/seed endpoints."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


def _admin_token():
    r = requests.post(
        f"{BASE_URL}/api/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


def test_seed_requires_admin_auth():
    r = requests.post(
        f"{BASE_URL}/api/admin/food/restaurants/burger_hub_ci/seed-orders",
        params={"days": 3, "daily_avg": 3, "clear": True},
        timeout=20,
    )
    assert r.status_code in (401, 403), r.status_code


def test_seed_and_analytics_shape():
    tok = _admin_token()
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.post(
        f"{BASE_URL}/api/admin/food/restaurants/burger_hub_ci/seed-orders",
        params={"days": 7, "daily_avg": 5, "clear": True},
        headers=h,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("seeded", 0) > 0

    r2 = requests.get(
        f"{BASE_URL}/api/food/manage/burger_hub_ci/analytics",
        params={"range": "7d"},
        headers=h,
        timeout=30,
    )
    assert r2.status_code == 200, r2.text
    a = r2.json()
    assert "daily" in a and "hourly" in a and "kpis" in a
    assert len(a["daily"]) == 7
    assert len(a["hourly"]) == 24
    kpis = a["kpis"]
    for key in ("orders", "gross", "earnings"):
        assert kpis.get(key, 0) >= 0


def test_empty_restaurant_analytics_no_500():
    tok = _admin_token()
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.get(
        f"{BASE_URL}/api/food/manage/burger_hub_in/analytics",
        params={"range": "30d"},
        headers=h,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    a = r.json()
    assert "kpis" in a
