"""Central provider factory. Import `get_storage_provider()` anywhere; the
selected implementation is cached at module scope so config changes take
effect only on restart (per the Fixing_Prompt requirement).
"""
from __future__ import annotations
import logging
import os
import threading

from .base import StorageProvider
from .local import LocalStorageProvider
from .emergent import EmergentStorageProvider

log = logging.getLogger("baked.storage")

_instance: StorageProvider | None = None
_lock = threading.Lock()


def _build() -> StorageProvider:
    provider = (os.environ.get("STORAGE_PROVIDER") or "local").strip().lower()
    if provider == "local":
        root = os.environ.get("STORAGE_LOCAL_PATH") or "/app/backend/uploads"
        return LocalStorageProvider(root=root)
    if provider == "emergent":
        return EmergentStorageProvider()
    if provider == "s3":
        from .s3 import S3StorageProvider
        return S3StorageProvider()
    raise RuntimeError(f"Unknown STORAGE_PROVIDER='{provider}' — expected local | emergent | s3")


def get_storage_provider() -> StorageProvider:
    """Return the process-wide singleton storage provider."""
    global _instance
    if _instance is not None:
        return _instance
    with _lock:
        if _instance is None:
            _instance = _build()
            log.info("storage.provider=%s cls=%s", os.environ.get("STORAGE_PROVIDER", "local"),
                     type(_instance).__name__)
    return _instance


def reset_storage_provider_for_tests() -> None:
    """Discard the cached singleton — used by pytest fixtures only."""
    global _instance
    _instance = None
