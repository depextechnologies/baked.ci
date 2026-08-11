"""Slice F — Partner notifications (SMS + email) regression tests.

Fast, no-network tests that exercise:
  * OTP provider factory correctly selects dev / twilio / africastalking
  * TwilioSmsProvider gracefully returns delivered=False when credentials are missing
  * DevSmsProvider always echoes to logs and reports delivered=True
  * dispatch_new_order_notifications runs without raising when there is no order/partner
"""
from __future__ import annotations
import asyncio
import os
import pathlib
import pytest

from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

from core.providers import otp_provider as otp_mod
from core.providers import sms_provider as sms_mod


def test_get_otp_provider_defaults_to_dev(monkeypatch):
    monkeypatch.delenv("OTP_PROVIDER", raising=False)
    p = otp_mod.get_otp_provider()
    assert isinstance(p, otp_mod.DevOtpProvider)


def test_get_otp_provider_twilio_selection(monkeypatch):
    monkeypatch.setenv("OTP_PROVIDER", "twilio")
    p = otp_mod.get_otp_provider()
    assert isinstance(p, otp_mod.TwilioSmsProvider)


def test_get_otp_provider_twilio_verify_selection(monkeypatch):
    monkeypatch.setenv("OTP_PROVIDER", "twilio_verify")
    p = otp_mod.get_otp_provider()
    assert isinstance(p, otp_mod.TwilioVerifyProvider)


def test_dev_otp_provider_delivers():
    p = otp_mod.DevOtpProvider()
    r = asyncio.run(p.send_code("+2250700000001", "123456", locale="fr-CI"))
    assert r["delivered"] is True
    assert r["dev_code"] == "123456"


def test_twilio_sms_provider_unconfigured_never_raises(monkeypatch):
    for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
              "TWILIO_MESSAGING_SERVICE_SID", "TWILIO_FROM_PHONE"):
        monkeypatch.delenv(k, raising=False)
    provider = otp_mod.TwilioSmsProvider()
    assert provider._configured is False
    r = asyncio.run(provider.send_code("+2250700000001", "999999"))
    assert r["delivered"] is False


def test_sms_provider_dev_delivers():
    p = sms_mod.DevSmsProvider()
    r = asyncio.run(p.send("+2250700000001", "hello", tag="test"))
    assert r["delivered"] is True
    assert r["channel"] == "dev-console"


def test_sms_provider_selection(monkeypatch):
    monkeypatch.setenv("SMS_PROVIDER", "twilio")
    p = sms_mod.get_sms_provider()
    assert isinstance(p, sms_mod.TwilioSmsProvider)

    monkeypatch.setenv("SMS_PROVIDER", "dev")
    p = sms_mod.get_sms_provider()
    assert isinstance(p, sms_mod.DevSmsProvider)


def test_send_sms_module_fn_survives_exceptions():
    # Non-existent phone shape shouldn't raise — dev provider always logs.
    r = asyncio.run(sms_mod.send_sms("garbage", "body", tag="test"))
    assert r["delivered"] is True  # dev fallback


def test_notifications_module_imports_cleanly():
    # Regression: import path must not accidentally require twilio SDK at
    # module load — twilio is only imported inside the send methods.
    from modules.mart_partner import notifications as n
    assert callable(n.dispatch_new_order_notifications)


def test_dispatch_new_order_missing_rows_swallowed():
    """Feeding a bogus order_id + partner_id shouldn't raise from the
    fire-and-forget dispatcher; the background task just logs & bails."""
    from modules.mart_partner.notifications import dispatch_new_order_notifications
    # We can't easily assert on a create_task from a sync test, but the
    # dispatcher itself must not raise:
    async def _run():
        dispatch_new_order_notifications("ord_missing", [("prt_missing", "po_missing")])
        # give the background task a tick to run + swallow
        await asyncio.sleep(0.05)
    asyncio.run(_run())
