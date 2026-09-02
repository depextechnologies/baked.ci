"""Fixing_Prompt v7 — Storage migration engine tests.

Covers:
  * Enumeration surfaces keys referenced by mart / partner / homepage /
    driver / supplier columns while filtering out plain-text noise.
  * `_to_key` accepts serve-URLs, raw keys, and rejects http/https/data URIs
    plus plain names ("Amul", "Bakery").
  * The copy engine is idempotent — a second run copies nothing.
  * Dry-run does not write the destination.
  * Same-provider migration raises.
  * HTTP `POST /api/admin/storage/enumerate` returns count + sample list.
  * HTTP `POST /api/admin/storage/migrate` requires distinct providers.
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


class TestKeyExtraction:
    def test_serve_url_stripped(self):
        from scripts.storage_migration import _to_key
        assert _to_key("/api/homepage/uploads/baked-platform/homepage/abc.png") \
            == "baked-platform/homepage/abc.png"
        assert _to_key("/api/driver/uploads/baked-platform/driver/d1/selfie.jpg") \
            == "baked-platform/driver/d1/selfie.jpg"
        assert _to_key("/uploads/baked-platform/x.pdf") == "baked-platform/x.pdf"

    def test_raw_key_with_extension_accepted(self):
        from scripts.storage_migration import _to_key
        assert _to_key("baked-platform/mart/prd_x/image.png") \
            == "baked-platform/mart/prd_x/image.png"

    def test_external_url_rejected(self):
        from scripts.storage_migration import _to_key
        assert _to_key("https://cdn.example/x.png") is None
        assert _to_key("http://foo.bar/y.jpg") is None

    def test_data_and_blob_uris_rejected(self):
        from scripts.storage_migration import _to_key
        assert _to_key("data:image/png;base64,iVBORw0K…") is None
        assert _to_key("blob:https://a/b-c") is None

    def test_plain_text_rejected(self):
        """The old heuristic caught 'Amul' or 'Bakery' — that's the bug
        this test guards against."""
        from scripts.storage_migration import _to_key
        assert _to_key("Amul") is None
        assert _to_key("Bakery") is None
        assert _to_key("Bakery & Bread") is None
        assert _to_key("bestsellers") is None
        assert _to_key("") is None
        assert _to_key(None) is None


class TestLocalToLocalCopy:
    @pytest.mark.asyncio
    async def test_idempotent_copy(self, tmp_path):
        from core.providers.storage.local import LocalStorageProvider
        from scripts.storage_migration import migrate

        src_root = tmp_path / "src"
        dst_root = tmp_path / "dst"
        src = LocalStorageProvider(root=str(src_root))
        dst = LocalStorageProvider(root=str(dst_root))
        key = "test/copy/pixel.png"
        src.upload(key, b"\x89PNG-fake", "image/png")

        # First run — copies 1
        r1 = await migrate(src, dst, [key])
        assert r1.copied == 1 and r1.failed == 0
        assert (dst_root / key).is_file()

        # Second run — already present, copies 0
        r2 = await migrate(src, dst, [key])
        assert r2.copied == 0
        assert r2.skipped_already_present == 1

    @pytest.mark.asyncio
    async def test_dry_run_does_not_write(self, tmp_path):
        from core.providers.storage.local import LocalStorageProvider
        from scripts.storage_migration import migrate

        src = LocalStorageProvider(root=str(tmp_path / "src"))
        dst = LocalStorageProvider(root=str(tmp_path / "dst"))
        key = "test/dry/only.png"
        src.upload(key, b"data", "image/png")
        r = await migrate(src, dst, [key], dry_run=True)
        assert r.copied == 1 and r.dry_run
        # File must NOT exist at destination
        assert not (tmp_path / "dst" / key).is_file()

    @pytest.mark.asyncio
    async def test_source_missing_reported(self, tmp_path):
        from core.providers.storage.local import LocalStorageProvider
        from scripts.storage_migration import migrate
        src = LocalStorageProvider(root=str(tmp_path / "src"))
        dst = LocalStorageProvider(root=str(tmp_path / "dst"))
        r = await migrate(src, dst, ["does/not/exist.png"])
        assert r.copied == 0 and r.skipped_source_missing == 1


class TestSameProviderRejected:
    @pytest.mark.asyncio
    async def test_same_provider_raises(self):
        from scripts.storage_migration import run_full
        with pytest.raises(ValueError):
            await run_full(source_name="local", dest_name="local")


class TestAdminEndpoints:
    def test_status_returns_active_provider(self, sa_headers):
        r = requests.get(f"{API}/admin/storage/status", headers=sa_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["active_provider"] in ("local", "emergent", "s3")

    def test_enumerate_returns_keys(self, sa_headers):
        r = requests.post(f"{API}/admin/storage/enumerate",
                          headers=sa_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "count" in d and "sample" in d
        # No plain-text noise
        for k in d["sample"]:
            assert "/" in k or k.lower().endswith(
                (".png", ".jpg", ".jpeg", ".webp", ".pdf", ".gif", ".svg", ".heic"))

    def test_migrate_same_provider_400(self, sa_headers):
        r = requests.post(f"{API}/admin/storage/migrate",
                          headers=sa_headers,
                          json={"source": "local", "dest": "local"}, timeout=15)
        assert r.status_code == 400

    def test_migrate_bad_provider_400(self, sa_headers):
        r = requests.post(f"{API}/admin/storage/migrate",
                          headers=sa_headers,
                          json={"source": "local", "dest": "notarealbackend"}, timeout=15)
        assert r.status_code == 400
