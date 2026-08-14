"""Emergent object storage helper — used by supplier document uploads.

Follows the playbook shipped by `integration_playbook_expert_v2`:
  * `init_storage()` is called once at app startup — the storage key is
    session-scoped and re-used across all upload calls.
  * `put_object(path, data, content_type)` stores a file and returns
    `{path, size, etag}`.
  * `get_object(path)` streams the raw bytes back for the auth-gated download
    endpoint.

Files must NOT be exposed via direct storage URLs; the FastAPI download route
enforces supplier / admin auth before proxying the bytes back.
"""
from __future__ import annotations
import logging
import os
from typing import Optional, Tuple

import requests

log = logging.getLogger("baked.storage")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "baked-platform"

_storage_key: Optional[str] = None


def init_storage(force: bool = False) -> str:
    """One-shot init. `force=True` recycles a dead session-scoped key."""
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not set — cannot init storage")
    resp = requests.post(f"{STORAGE_URL}/init",
                         json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    log.info("storage.init done")
    return _storage_key


def _headers() -> dict:
    return {"X-Storage-Key": init_storage()}


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes. Returns metadata (`path`, `size`, `etag`)."""
    for attempt in (0, 1):
        try:
            resp = requests.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={**_headers(), "Content-Type": content_type},
                data=data, timeout=120,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as exc:
            # 404 with a stale key → recycle once (per playbook)
            if attempt == 0 and exc.response is not None and exc.response.status_code == 404:
                init_storage(force=True)
                continue
            raise


def get_object(path: str) -> Tuple[bytes, str]:
    """Download bytes + content-type."""
    for attempt in (0, 1):
        try:
            resp = requests.get(
                f"{STORAGE_URL}/objects/{path}",
                headers=_headers(), timeout=60,
            )
            resp.raise_for_status()
            return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
        except requests.HTTPError as exc:
            if attempt == 0 and exc.response is not None and exc.response.status_code == 404:
                init_storage(force=True)
                continue
            raise
