"""Backend i18n smoke tests (Phase D · Workstream 3).

Runs against the JSON dictionaries in `backend/i18n/locales/` and the
helpers in `core.i18n` + `core.emails`. Any missing key or non-round-tripping
translation should surface here so it never reaches production.
"""
from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from core.i18n import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, resolve_lang, t
from core.emails import render_sms, send_localised_email


class _Req:
    """Lightweight FastAPI Request stand-in for `resolve_lang`."""

    def __init__(self, headers=None, query=None):
        self.headers = headers or {}
        self.query_params = query or {}


# ------------------------------------------------------------------------- #
#                            core.i18n · translate                          #
# ------------------------------------------------------------------------- #

def test_default_language_is_french():
    assert DEFAULT_LANGUAGE == "fr"
    assert "fr" in SUPPORTED_LANGUAGES and "en" in SUPPORTED_LANGUAGES


def test_fr_and_en_return_different_strings():
    fr = t("errors.supplier.already_active", "fr")
    en = t("errors.supplier.already_active", "en")
    assert fr and en
    assert fr != en
    assert "fournisseur" in fr.lower()
    assert "supplier" in en.lower()


def test_missing_key_returns_key_and_logs(caplog):
    caplog.set_level("WARNING")
    out = t("errors.does_not_exist.foobar", "fr")
    assert out == "errors.does_not_exist.foobar"
    assert any("i18n.missing" in rec.message for rec in caplog.records)


def test_interpolation_works():
    out = t("emails.order_confirmed.subject", "fr", order_code="ORD-42")
    assert "ORD-42" in out
    # And the same key in EN.
    out_en = t("emails.order_confirmed.subject", "en", order_code="ORD-42")
    assert "ORD-42" in out_en
    assert "confirmed" in out_en.lower()


def test_missing_interpolation_param_returns_raw():
    # No `code` param → the placeholder stays untouched, no crash.
    out = t("emails.otp.body", "fr")  # needs {code} + {minutes}
    assert isinstance(out, str)
    assert out != ""


def test_english_fallback_when_fr_missing():
    """If a key is only in EN, requesting it in FR falls back to EN."""
    # Insert a temporary "en-only" key via the resource loader.
    from core.i18n import _resources
    res = _resources()
    res.setdefault("en", {}).setdefault("errors", {}).setdefault("_test", {})["only_en"] = "EN-only value"
    assert t("errors._test.only_en", "fr") == "EN-only value"


# ------------------------------------------------------------------------- #
#                            core.i18n · resolve_lang                       #
# ------------------------------------------------------------------------- #

def test_resolve_lang_from_custom_header():
    assert resolve_lang(_Req(headers={"x-baked-language": "en"})) == "en"
    assert resolve_lang(_Req(headers={"X-BAKED-Language": "fr"})) == "fr"


def test_resolve_lang_from_query_string():
    assert resolve_lang(_Req(query={"lang": "en"})) == "en"


def test_resolve_lang_from_accept_language():
    assert resolve_lang(_Req(headers={"accept-language": "fr-CI,fr;q=0.9"})) == "fr"
    assert resolve_lang(_Req(headers={"accept-language": "en-US,en;q=0.9"})) == "en"


def test_resolve_lang_falls_back_to_french():
    assert resolve_lang(_Req()) == "fr"
    # Header present but no supported match → still French.
    assert resolve_lang(_Req(headers={"accept-language": "zh-CN"})) == "fr"


def test_resolve_lang_custom_header_beats_query():
    assert resolve_lang(_Req(headers={"x-baked-language": "en"}, query={"lang": "fr"})) == "en"


# ------------------------------------------------------------------------- #
#                            core.emails · render                           #
# ------------------------------------------------------------------------- #

def test_render_sms_localises_and_interpolates():
    fr = render_sms("otp", "fr", code="123456", minutes=10)
    en = render_sms("otp", "en", code="123456", minutes=10)
    assert "123456" in fr and "123456" in en
    assert fr != en
    assert "minutes" in fr.lower() or "expire" in fr.lower()


def test_send_localised_email_dispatches_html_and_lang():
    """The helper must call `send_email_async` with FR copy when lang='fr'."""
    called = {}

    async def _fake_send(*, to, subject, html_body, text_body=None):
        called["to"] = to
        called["subject"] = subject
        called["html"] = html_body
        called["text"] = text_body
        return True

    with patch("core.emails.send_email_async", side_effect=_fake_send):
        ok = asyncio.run(send_localised_email(
            to="aicha@example.com",
            template="order_confirmed",
            lang="fr",
            params={"name": "Aïcha", "order_code": "ORD-42", "total": "4 800 XOF"},
            cta_label_key="cta_track",
            cta_href="https://baked.ci/orders/42/track",
        ))
    assert ok
    assert called["to"] == "aicha@example.com"
    assert "ORD-42" in called["subject"]
    # French keys used → subject starts with FR word.
    assert called["subject"].lower().startswith("commande")
    # HTML shell contains the CTA link.
    assert "orders/42/track" in called["html"]
    # Text fallback derived from the same keys.
    assert "Aïcha" in called["text"]


def test_send_localised_email_english_mode():
    async def _fake_send(**kwargs):
        return True

    called_subjects = []

    async def _cap_send(*, to, subject, html_body, text_body=None):
        called_subjects.append(subject)
        return True

    with patch("core.emails.send_email_async", side_effect=_cap_send):
        asyncio.run(send_localised_email(
            to="x@y.z", template="order_confirmed", lang="en",
            params={"name": "Aïcha", "order_code": "ORD-42", "total": "$40"},
        ))
    assert called_subjects
    assert "Order" in called_subjects[0] and "confirmed" in called_subjects[0].lower()


def test_send_localised_email_falls_back_to_default_when_lang_missing():
    async def _cap(**kwargs):
        return True

    with patch("core.emails.send_email_async", side_effect=_cap) as m:
        # invalid lang → should still go through as French
        asyncio.run(send_localised_email(
            to="x@y.z", template="magic_link", lang="zh",
            params={"minutes": 15},
        ))
    assert m.called
