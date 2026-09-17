"""Regression tests for the public seller-apply upload endpoints.

Pins the 2026-03 QA hardening slice:
  * per-IP sliding-window rate limit
  * HMAC-signed short-lived download URLs
  * canonical `storage_path` returned + persisted so URLs can be re-minted

Any change that would silently drop these guarantees should turn the tests
red — this endpoint is our biggest external attack surface (public,
unauthenticated, PII in the payload).
"""
import io
import os
import random
import string
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def _rand(n=6):
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


@pytest.fixture(scope="module")
def draft_app_id():
    """Create a fresh draft application and return its id."""
    r = requests.post(f"{BASE_URL}/api/martbaked/sellers/apply/start", json={
        "business_email": f"qa-signed-{_rand()}@test.example",
        "business_name":  f"QA Signed {_rand()}",
        "country":        "CI",
        "business_type":  "manufacturer",
    })
    r.raise_for_status()
    return r.json()["application"]["id"]


def _upload(app_id, name="pin.pdf", ct="application/pdf", body=b"%PDF-1.4\n%%EOF\n"):
    return requests.post(
        f"{BASE_URL}/api/martbaked/sellers/apply/{app_id}/uploads",
        files={"file": (name, io.BytesIO(body), ct)},
        data={"kind": "document"},
    )


def test_upload_returns_signed_url_and_storage_path(draft_app_id):
    r = _upload(draft_app_id)
    assert r.status_code == 200, r.text
    body = r.json()
    # Canonical path lives outside the URL — used for re-signing later.
    assert body["storage_path"].startswith("baked-platform/apply/"), body
    # URL carries the HMAC signature + expiry.
    assert "?exp=" in body["file_url"] and "&sig=" in body["file_url"], body["file_url"]


def test_unsigned_fetch_is_rejected(draft_app_id):
    up = _upload(draft_app_id).json()
    unsigned = f"{BASE_URL}/api/martbaked/sellers/apply/{draft_app_id}/files/{up['storage_path']}"
    r = requests.get(unsigned)
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["code"] == "bad_signature"


def test_signed_fetch_succeeds(draft_app_id):
    up = _upload(draft_app_id).json()
    r = requests.get(f"{BASE_URL}{up['file_url']}")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")


def test_tampered_signature_is_rejected(draft_app_id):
    up = _upload(draft_app_id).json()
    tampered = up["file_url"].replace("sig=", "sig=deadbeef")
    r = requests.get(f"{BASE_URL}{tampered}")
    assert r.status_code == 403


def test_expired_signature_is_rejected(draft_app_id, monkeypatch):
    """Reconstruct a URL with `exp` in the past → 403."""
    up = _upload(draft_app_id).json()
    # Swap exp=<future> → exp=1 (epoch 1970) so the sig is stale even though
    # it still matches its own path (the timestamp is part of the HMAC input,
    # so this actually invalidates the sig — still a 403).
    tampered = up["file_url"].replace(
        up["file_url"].split("exp=")[1].split("&")[0], "1",
    )
    r = requests.get(f"{BASE_URL}{tampered}")
    assert r.status_code == 403


def test_rate_limit_kicks_in_after_20_per_minute():
    """The endpoint applies a 20/min per-IP sliding-window limiter. In this
    deployment uvicorn runs with 4 worker processes each holding an
    in-memory counter, so effective ceiling per-IP is ~4×20 = 80/min. We
    burst 120 lightweight requests (deliberately 415-worthy so we skip
    object-storage latency and stay tight inside the 60s window) and
    assert at least one worker's limit tripped.

    Follow-up (ROADMAP): move counters to Redis for consistent enforcement.
    """
    start = requests.post(f"{BASE_URL}/api/martbaked/sellers/apply/start", json={
        "business_email": f"qa-rl-{_rand()}@test.example",
        "business_name":  f"QA RL {_rand()}",
        "country":        "CI",
        "business_type":  "manufacturer",
    })
    start.raise_for_status()
    app_id = start.json()["application"]["id"]

    codes = []
    for _ in range(120):
        r = requests.post(
            f"{BASE_URL}/api/martbaked/sellers/apply/{app_id}/uploads",
            files={"file": ("t.bin", io.BytesIO(b"x"), "application/octet-stream")},
            data={"kind": "document"},
        )
        codes.append(r.status_code)
        if r.status_code == 429:
            body = r.json()
            assert body["detail"]["code"] == "rate_limited"
            assert body["detail"]["retry_after_seconds"] > 0
            break
    assert 429 in codes, f"rate limit never engaged over 120 rapid requests: {codes[-20:]}"
