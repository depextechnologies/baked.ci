"""Legacy façade — delegates to the pluggable storage provider.

The whole codebase imports `put_object` / `get_object` from here (docs,
suppliers, driver KYC, mart-partner images, homepage icons, invoices).
Post Fixing_Prompt v7, this module is a thin wrapper around
`core.providers.storage.factory.get_storage_provider()` so switching from
local disk to S3 is a one-line env change without touching call sites.

Public API preserved 1:1:
    * `init_storage()`   — kept for backwards compat, no-op under `local`.
    * `put_object(path, data, ct) -> {path, size, etag, url?}`
    * `get_object(path) -> (bytes, content_type)`
    * `APP_NAME` — kept as a module attribute for key prefixing.
"""
from __future__ import annotations
import logging
from typing import Tuple

from core.providers.storage.factory import get_storage_provider

log = logging.getLogger("baked.storage")

APP_NAME = "baked-platform"


def init_storage(force: bool = False) -> str:
    """Instantiate the configured provider. Returns a marker string."""
    prov = get_storage_provider()
    log.info("storage.init done provider=%s", type(prov).__name__)
    return type(prov).__name__


def put_object(path: str, data: bytes, content_type: str) -> dict:
    return get_storage_provider().upload(path, data, content_type)


def get_object(path: str) -> Tuple[bytes, str]:
    return get_storage_provider().download(path)
