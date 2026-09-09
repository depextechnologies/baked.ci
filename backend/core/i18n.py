"""BAKĒD backend i18n — Phase D · Workstream 3.

Central helper for translating server-emitted strings: transactional emails,
SMS templates and API error messages. Design goals:

  • Runtime-friendly. Dictionaries are loaded ONCE at import time and cached
    in memory. `t(key, lang, **params)` is a plain dict lookup + `.format`.
  • Lightweight. No i18next-Python, no gettext catalogues, no compilation
    step — just JSON files that anyone (support, ops, marketing) can PR.
  • Predictable fallback: unknown key → English → key itself.
  • Compatible with FastAPI: request handlers get the caller's language from
    the `Accept-Language` header OR an `X-BAKED-Language` header the frontend
    interceptor sets after the user toggles the switcher. See `resolve_lang`.

Usage
-----
    from core.i18n import t, resolve_lang

    lang = resolve_lang(request)                  # "fr" | "en"
    subject = t("emails.order_confirmed.subject", lang, order_id="ORD-42")
    body = t("emails.order_confirmed.body", lang, name="Aïcha", total="4 800 XOF")

Keys are dot-paths (e.g. `errors.supplier.already_active`) and namespaces
map to individual JSON files under `/app/backend/i18n/locales/{lang}/`.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Optional

logger = logging.getLogger("baked.i18n")

SUPPORTED_LANGUAGES = ("fr", "en")
DEFAULT_LANGUAGE = "fr"   # French-first per client brief (mirrors frontend)

_LOCALES_DIR = Path(__file__).resolve().parent.parent / "i18n" / "locales"


@lru_cache(maxsize=1)
def _resources() -> dict[str, dict[str, Any]]:
    """Load every `locales/<lang>/*.json` into a single nested dict.

    Each namespace's keys are inlined under its filename, so a key like
    `emails.order_confirmed.subject` resolves to
      resources[lang]["emails"]["order_confirmed"]["subject"].
    """
    out: dict[str, dict[str, Any]] = {}
    for lang in SUPPORTED_LANGUAGES:
        out[lang] = {}
        lang_dir = _LOCALES_DIR / lang
        if not lang_dir.exists():
            logger.warning("i18n.locale_missing lang=%s dir=%s", lang, lang_dir)
            continue
        for f in sorted(lang_dir.glob("*.json")):
            try:
                out[lang][f.stem] = json.loads(f.read_text(encoding="utf-8"))
            except Exception as e:  # noqa: BLE001
                logger.error("i18n.load_failed lang=%s file=%s err=%s", lang, f.name, e)
    return out


def _walk(d: dict, path: Iterable[str]) -> Optional[Any]:
    cur: Any = d
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def t(key: str, lang: Optional[str] = None, **params) -> str:
    """Look up a translation. Falls back FR-key → EN-key → literal key path.

    Interpolation uses Python `str.format` (single-brace style). Any missing
    param leaves the placeholder untouched — never raises.
    """
    resources = _resources()
    lang = (lang or DEFAULT_LANGUAGE).lower()
    if lang not in resources:
        lang = DEFAULT_LANGUAGE

    parts = key.split(".")
    val = _walk(resources.get(lang, {}), parts)
    if val is None and lang != "en":
        val = _walk(resources.get("en", {}), parts)
    if val is None:
        logger.warning("i18n.missing key=%s lang=%s", key, lang)
        return key  # last-resort so devs spot the miss

    if not isinstance(val, str):
        return str(val)
    if params:
        try:
            return val.format(**params)
        except (KeyError, IndexError):
            return val
    return val


# --------------------------------------------------------------------------- #
# FastAPI helpers                                                             #
# --------------------------------------------------------------------------- #

def resolve_lang(request) -> str:
    """Pick the response language for a FastAPI request.

    Precedence (highest → lowest):
      1. `X-BAKED-Language` custom header (set by the frontend axios
         interceptor after every language toggle — always authoritative).
      2. `?lang=` query string (deep-link overrides).
      3. First `Accept-Language` entry that starts with `fr` or `en`.
      4. Fallback to French (Côte d'Ivoire launch market).
    """
    try:
        override = request.headers.get("x-baked-language") or request.headers.get("X-BAKED-Language")
        if override and override.lower()[:2] in SUPPORTED_LANGUAGES:
            return override.lower()[:2]
        qs = request.query_params.get("lang")
        if qs and qs.lower()[:2] in SUPPORTED_LANGUAGES:
            return qs.lower()[:2]
        al = request.headers.get("accept-language") or ""
        for entry in (part.split(";", 1)[0].strip().lower() for part in al.split(",") if part):
            for lang in SUPPORTED_LANGUAGES:
                if entry.startswith(lang):
                    return lang
    except Exception:  # noqa: BLE001 – never let i18n break a request
        pass
    return DEFAULT_LANGUAGE
