"""Fixing_Prompt v7 — Pluggable storage provider tests.

Covers:
  * Default provider is LocalStorageProvider (STORAGE_PROVIDER=local)
  * Upload + download roundtrip via legacy facade `put_object` / `get_object`
  * Content-Type inferred from filename extension on download
  * Homepage admin uploads round-trip via HTTP (no EMERGENT_LLM_KEY needed)
  * Path traversal is rejected
  * Unknown provider raises RuntimeError
"""
from __future__ import annotations
import io
import os
import uuid
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": "depexopenai@gmail.com",
                            "password": "baked@2026#!$@"}, timeout=30)
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


PNG_BYTES = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
             b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\xdac\xf8\xff"
             b"\xff?\x03\x03\x03\x00\x06\x00\x03\x88\x05\x08\x0c\x00\x00\x00\x00IEND"
             b"\xaeB`\x82")


class TestProviderFactory:
    def test_default_provider_is_local(self):
        from core.providers.storage.factory import (
            get_storage_provider, reset_storage_provider_for_tests,
        )
        reset_storage_provider_for_tests()
        os.environ.pop("STORAGE_PROVIDER", None)
        prov = get_storage_provider()
        assert type(prov).__name__ == "LocalStorageProvider"

    def test_unknown_provider_raises(self, monkeypatch):
        from core.providers.storage.factory import reset_storage_provider_for_tests
        reset_storage_provider_for_tests()
        monkeypatch.setenv("STORAGE_PROVIDER", "notarealbackend")
        from core.providers.storage.factory import get_storage_provider
        with pytest.raises(RuntimeError):
            get_storage_provider()
        reset_storage_provider_for_tests()


class TestLocalRoundtrip:
    def test_put_and_get(self, tmp_path, monkeypatch):
        from core.providers.storage.factory import reset_storage_provider_for_tests
        monkeypatch.setenv("STORAGE_LOCAL_PATH", str(tmp_path))
        monkeypatch.setenv("STORAGE_PROVIDER", "local")
        reset_storage_provider_for_tests()
        from core.providers import object_storage as os_mod
        key = f"tests/roundtrip/{uuid.uuid4().hex}.png"
        os_mod.put_object(key, PNG_BYTES, "image/png")
        data, ct = os_mod.get_object(key)
        assert data == PNG_BYTES
        assert ct == "image/png"
        # File exists on disk in tmp_path
        assert (tmp_path / key).is_file()
        reset_storage_provider_for_tests()

    def test_path_traversal_blocked(self, tmp_path, monkeypatch):
        from core.providers.storage.factory import reset_storage_provider_for_tests
        monkeypatch.setenv("STORAGE_LOCAL_PATH", str(tmp_path))
        monkeypatch.setenv("STORAGE_PROVIDER", "local")
        reset_storage_provider_for_tests()
        from core.providers import object_storage as os_mod
        with pytest.raises(ValueError):
            os_mod.put_object("../../../etc/passwd", b"x", "text/plain")
        reset_storage_provider_for_tests()


class TestHomepageUploadHTTP:
    """Live upload against the deployed backend (no EMERGENT_LLM_KEY required)."""

    def test_upload_and_serve(self, sa_headers):
        files = {"file": (f"{uuid.uuid4().hex}.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = requests.post(f"{API}/admin/homepage-sections/uploads",
                          headers=sa_headers, files=files, timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["file_url"].startswith("/api/homepage/uploads/")
        assert j["size"] == len(PNG_BYTES)

        # Fetch it back — must be image/png
        r2 = requests.get(f"{BASE_URL}{j['file_url']}", timeout=30)
        assert r2.status_code == 200
        assert r2.headers.get("Content-Type") == "image/png"
        assert r2.content == PNG_BYTES
