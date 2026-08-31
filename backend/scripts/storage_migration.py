"""Storage-migration engine (Fixing_Prompt v7 · 2026-02-28).

One-click move of every stored object between providers. Typical use:
copy from `emergent` (production) into `local` or `s3` before a
self-hosted cutover, then flip `STORAGE_PROVIDER` and restart.

The engine is idempotent: a second run only copies what the destination
is missing, so it's safe to re-run after adding new content or fixing
partial failures.

Public API:
    async def enumerate_keys(session) -> list[str]
    async def migrate(source, dest, keys, *, dry_run=False, on_progress=cb) -> Report
    async def run_full(*, source_name, dest_name, dry_run=False, on_progress=cb) -> Report

Also runnable as a CLI: `python scripts/migrate_storage.py`.
"""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import SessionLocal
from core.models import (
    MartProduct, PartnerProduct, HomepageSection, Supplier,
    Driver, SupplierDocument,
)
from core.models.supplier_invoices import SupplierInvoice

log = logging.getLogger("baked.storage.migrate")

# ---------------------------------------------------------------------------
# Serve-URL prefixes → raw object key
# ---------------------------------------------------------------------------
# Every uploader writes an object-storage key, then persists a serve-URL
# that hides the key behind an authenticated FastAPI proxy route. To
# migrate we need the RAW key, so we strip the known prefixes.
_URL_PREFIXES = (
    "/api/homepage/uploads/",
    "/api/partner/uploads/",
    "/api/driver/uploads/",
    "/api/supplier/uploads/",
    "/api/admin/homepage-sections/uploads/",
    "/api/supplier-invoices/uploads/",
    "/uploads/",              # LocalStorageProvider's default public_url
)


_OBJECT_EXT_RE = re.compile(
    r"\.(?:png|jpe?g|webp|gif|svg|heic|heif|pdf|mp4|mov|webm|zip|csv|xlsx?|docx?)$",
    re.IGNORECASE,
)


def _to_key(value: Optional[str]) -> Optional[str]:
    """Best-effort convert a stored value (either a raw key or a proxied
    URL) into the object-storage key. Returns None when the value is
    empty, an external URL, a data:/blob: blob, or a plain-text string
    that doesn't look like a stored object path."""
    if not value or not isinstance(value, str):
        return None
    v = value.strip()
    if not v or v.startswith(("data:", "blob:", "http://", "https://")):
        return None
    matched_prefix = False
    for pref in _URL_PREFIXES:
        if v.startswith(pref):
            v = v[len(pref):]
            matched_prefix = True
            break
    if not matched_prefix:
        # Without a known prefix, only accept values that clearly look like
        # an uploaded file — must contain a slash AND end in a known ext.
        # This filters out plain category names, brand strings, colour
        # codes, etc. that also live inside HomepageSection.config.
        if "/" not in v or not _OBJECT_EXT_RE.search(v):
            return None
    return v.lstrip("/")


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

@dataclass
class MigrationReport:
    total_keys: int = 0
    copied: int = 0
    skipped_already_present: int = 0
    skipped_source_missing: int = 0
    failed: int = 0
    dry_run: bool = False
    errors: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "total_keys": self.total_keys,
            "copied": self.copied,
            "skipped_already_present": self.skipped_already_present,
            "skipped_source_missing": self.skipped_source_missing,
            "failed": self.failed,
            "dry_run": self.dry_run,
            "errors": self.errors[:50],  # cap for JSON size
        }


ProgressCb = Optional[Callable[[str, MigrationReport], Awaitable[None]]]


# ---------------------------------------------------------------------------
# Enumeration — every column that stores an object key
# ---------------------------------------------------------------------------

async def enumerate_keys(session: AsyncSession) -> set[str]:
    """Walk every table/column that holds an object-storage key and return
    a de-duplicated set. New sources should be added here as they land.

    Scans:
      * mart_products.image / images (list)
      * partner_products.images (list)
      * homepage_sections.config JSONB — recursive walk over strings
      * driver.gov_id_front_url / gov_id_back_url / licence_front_url /
        selfie_url / vehicle_reg_url
      * suppliers.logo_url / cover_image_url (if present)
      * supplier_documents.storage_path
      * supplier_invoices.invoice_document_storage_path
    """
    keys: set[str] = set()

    def _add(v):
        k = _to_key(v)
        if k:
            keys.add(k)

    def _walk(node):
        if isinstance(node, str):
            _add(node)
        elif isinstance(node, list):
            for x in node:
                _walk(x)
        elif isinstance(node, dict):
            for x in node.values():
                _walk(x)

    # -- MartProduct --------------------------------------------------------
    for mp in (await session.execute(
            select(MartProduct.image, MartProduct.images))).all():
        _add(mp[0])
        if mp[1]:
            for x in mp[1]: _add(x)

    # -- PartnerProduct.images ---------------------------------------------
    for row in (await session.execute(select(PartnerProduct.images))).all():
        for x in (row[0] or []):
            _add(x)

    # -- HomepageSection.config (JSONB tree) --------------------------------
    for row in (await session.execute(select(HomepageSection.config))).all():
        _walk(row[0])

    # -- Driver KYC URLs ----------------------------------------------------
    for row in (await session.execute(
            select(Driver.gov_id_front_url, Driver.gov_id_back_url,
                   Driver.licence_front_url, Driver.selfie_url,
                   Driver.vehicle_reg_url))).all():
        for x in row: _add(x)

    # -- Supplier profile media (columns exist on the model even when None)
    for attr in ("logo_url", "cover_image_url"):
        if hasattr(Supplier, attr):
            for row in (await session.execute(select(getattr(Supplier, attr)))).all():
                _add(row[0])

    # -- SupplierDocument.storage_path -------------------------------------
    for row in (await session.execute(select(SupplierDocument.storage_path))).all():
        _add(row[0])

    # -- SupplierInvoice.invoice_document_storage_path ---------------------
    for row in (await session.execute(
            select(SupplierInvoice.invoice_document_storage_path))).all():
        _add(row[0])

    return keys


# ---------------------------------------------------------------------------
# Copy engine
# ---------------------------------------------------------------------------

async def _copy_one(source, dest, key: str, dry_run: bool) -> str:
    """Return 'copied' / 'already_present' / 'source_missing' / 'failed'."""
    # Skip if already at destination — makes the run idempotent.
    if dest.exists(key):
        return "already_present"
    if not source.exists(key):
        return "source_missing"
    if dry_run:
        return "copied"  # would be copied
    data, ct = source.download(key)
    dest.upload(key, data, ct)
    return "copied"


async def migrate(
    source, dest, keys: Iterable[str], *,
    dry_run: bool = False, on_progress: ProgressCb = None,
) -> MigrationReport:
    report = MigrationReport(dry_run=dry_run)
    keys = list(keys)
    report.total_keys = len(keys)
    if on_progress:
        await on_progress("start", report)

    # Copy runs synchronously inside the async caller because our providers
    # use blocking IO; wrap in a thread if a future provider becomes async.
    for i, key in enumerate(keys, 1):
        try:
            outcome = await _copy_one(source, dest, key, dry_run)
        except Exception as exc:
            log.exception("copy failed key=%s", key)
            report.failed += 1
            report.errors.append({"key": key, "error": str(exc)[:400]})
            outcome = "failed"

        if outcome == "copied":
            report.copied += 1
        elif outcome == "already_present":
            report.skipped_already_present += 1
        elif outcome == "source_missing":
            report.skipped_source_missing += 1

        if on_progress and i % 25 == 0:
            await on_progress("progress", report)

    if on_progress:
        await on_progress("done", report)
    return report


# ---------------------------------------------------------------------------
# Provider factory (uses the same abstraction as runtime uploads)
# ---------------------------------------------------------------------------

def _build_provider(name: str):
    """Instantiate a provider by name — deliberately avoids the singleton
    factory so we can hold source + destination side-by-side."""
    n = (name or "").lower()
    if n == "local":
        import os as _os
        from core.providers.storage.local import LocalStorageProvider
        return LocalStorageProvider(
            root=_os.environ.get("STORAGE_LOCAL_PATH") or "/app/backend/uploads"
        )
    if n == "emergent":
        from core.providers.storage.emergent import EmergentStorageProvider
        return EmergentStorageProvider()
    if n == "s3":
        from core.providers.storage.s3 import S3StorageProvider
        return S3StorageProvider()
    raise ValueError(f"Unknown provider '{name}' — expected local | emergent | s3")


# ---------------------------------------------------------------------------
# Top-level driver
# ---------------------------------------------------------------------------

async def run_full(*, source_name: str, dest_name: str,
                   dry_run: bool = False,
                   on_progress: ProgressCb = None) -> MigrationReport:
    if source_name.lower() == dest_name.lower():
        raise ValueError("Source and destination providers must differ")
    src = _build_provider(source_name)
    dst = _build_provider(dest_name)

    session_factory = SessionLocal
    async with session_factory() as session:
        keys = await enumerate_keys(session)
    log.info("storage migrate discover keys=%d src=%s dst=%s dry_run=%s",
             len(keys), source_name, dest_name, dry_run)
    return await migrate(src, dst, sorted(keys),
                         dry_run=dry_run, on_progress=on_progress)
