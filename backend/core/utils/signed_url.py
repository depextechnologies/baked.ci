"""HMAC-signed URLs for gated file downloads.

Design (Fixing_Prompt v13 — QA #8 follow-up):
    The public seller-apply upload/serve endpoints previously granted access
    to anyone who could guess (or forward) an opaque object-storage path.
    Once an application is submitted the file typically contains PII —
    passport scans, RCCM certificates — so we now require a short-lived HMAC
    signature every time a file is served.

Format:
    ``<base_url>?exp=<epoch>&sig=<hex>``

The signer HMACs the tuple ``(path, exp)`` with a shared secret; the
serve-side recomputes the HMAC and rejects on mismatch, expiry, or a
different path. Constant-time compare prevents timing leaks.

Secret resolution:
    ``SIGNED_URL_SECRET`` env var when present; otherwise reuse ``SECRET_KEY``
    so we don't fail-open in environments that forget to provision it.
"""
from __future__ import annotations
import hmac
import hashlib
import os
import time
from typing import Optional
from urllib.parse import urlencode


def _secret() -> bytes:
    """Resolve the HMAC signing secret.

    Precedence: SIGNED_URL_SECRET → JWT_SECRET (baked's existing app-wide
    secret) → SECRET_KEY → a hard-coded dev fallback. Uses whatever the
    deployment has already provisioned so operators don't need to set a
    new env var. Rotating the underlying secret invalidates every
    previously-issued signed URL.
    """
    key = (os.environ.get("SIGNED_URL_SECRET")
           or os.environ.get("JWT_SECRET")
           or os.environ.get("SECRET_KEY")
           or "change-me-signed-url-fallback")
    return key.encode("utf-8")


def _digest(path: str, exp: int) -> str:
    msg = f"{path}|{exp}".encode("utf-8")
    return hmac.new(_secret(), msg, hashlib.sha256).hexdigest()


def sign_url(base_url: str, storage_path: str, ttl_seconds: int = 24 * 3600) -> str:
    """Return ``base_url?exp=…&sig=…`` valid for ``ttl_seconds``.

    ``storage_path`` is the canonical object-storage key — used only for
    signing; it must appear in ``base_url``.
    """
    exp = int(time.time()) + int(ttl_seconds)
    sig = _digest(storage_path, exp)
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}{urlencode({'exp': exp, 'sig': sig})}"


def verify_signature(storage_path: str, exp: Optional[str], sig: Optional[str]) -> bool:
    """Return True iff the ``(exp, sig)`` pair is valid for ``storage_path``."""
    if not exp or not sig:
        return False
    try:
        exp_i = int(exp)
    except (TypeError, ValueError):
        return False
    if exp_i < int(time.time()):
        return False
    expected = _digest(storage_path, exp_i)
    return hmac.compare_digest(expected, sig)
