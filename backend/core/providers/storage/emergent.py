"""Emergent Object Storage adapter (legacy).

Wraps the pre-Fixing_Prompt-v7 implementation so historical uploads keyed
in Emergent's proxy remain fetchable when the app is deployed on the
Emergent platform. New installs default to `local` and never need this.
"""
from __future__ import annotations
import logging
import os
from typing import Optional, Tuple

import requests

from .base import StorageProvider

log = logging.getLogger("baked.storage.emergent")


class EmergentStorageProvider(StorageProvider):
    APP_NAME = "baked-platform"

    def __init__(self):
        base = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() \
               or "https://integrations.emergentagent.com"
        self.storage_url = base.rstrip("/") + "/objstore/api/v1/storage"
        self.emergent_key = os.environ.get("EMERGENT_LLM_KEY")
        self._storage_key: Optional[str] = None
        if not self.emergent_key:
            log.warning("EMERGENT_LLM_KEY not set — Emergent storage will fail lazily")

    def _init_key(self, force: bool = False) -> str:
        if self._storage_key and not force:
            return self._storage_key
        if not self.emergent_key:
            raise RuntimeError("EMERGENT_LLM_KEY not set — cannot init emergent storage")
        r = requests.post(f"{self.storage_url}/init",
                          json={"emergent_key": self.emergent_key}, timeout=30)
        r.raise_for_status()
        self._storage_key = r.json()["storage_key"]
        log.info("emergent storage init done")
        return self._storage_key

    def _headers(self) -> dict:
        return {"X-Storage-Key": self._init_key()}

    def upload(self, path: str, data: bytes, content_type: str) -> dict:
        for attempt in (0, 1):
            try:
                r = requests.put(f"{self.storage_url}/objects/{path}",
                                 headers={**self._headers(), "Content-Type": content_type},
                                 data=data, timeout=120)
                r.raise_for_status()
                out = r.json()
                out.setdefault("url", path)
                return out
            except requests.HTTPError as exc:
                if attempt == 0 and exc.response is not None and exc.response.status_code == 404:
                    self._init_key(force=True)
                    continue
                raise

    def download(self, path: str) -> Tuple[bytes, str]:
        for attempt in (0, 1):
            try:
                r = requests.get(f"{self.storage_url}/objects/{path}",
                                 headers=self._headers(), timeout=60)
                r.raise_for_status()
                return r.content, r.headers.get("Content-Type", "application/octet-stream")
            except requests.HTTPError as exc:
                if attempt == 0 and exc.response is not None and exc.response.status_code == 404:
                    self._init_key(force=True)
                    continue
                raise

    def delete(self, path: str) -> None:
        try:
            requests.delete(f"{self.storage_url}/objects/{path}",
                            headers=self._headers(), timeout=30)
        except Exception as e:
            log.warning("emergent.delete failed path=%s err=%s", path, e)

    def exists(self, path: str) -> bool:
        try:
            r = requests.head(f"{self.storage_url}/objects/{path}",
                              headers=self._headers(), timeout=30)
            return r.status_code == 200
        except Exception:
            return False
