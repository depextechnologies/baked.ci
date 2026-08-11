"""Transactional SMS provider — used by Slice F (Notifications) to alert
partners/staff when a new order is placed against their store, wallet is low, etc.

Kept intentionally separate from the OTP provider because:
  - Different message templates (freeform vs. verification)
  - Different rate-limit + audit expectations
  - Some deployments run Twilio Verify for OTP but a Messaging Service for SMS

Providers:
  - dev     (default) — logs the SMS to stdout and returns success
  - twilio            — Twilio Messaging API (same credentials as OTP provider)

The provider is best-effort: if credentials are missing it returns
`{delivered: false, reason: "unconfigured"}` and NEVER raises — the order
flow must not fail just because SMS delivery hiccups.
"""
from __future__ import annotations
import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger("baked.sms")


class SmsProvider:
    async def send(self, e164_phone: str, body: str, *, tag: Optional[str] = None) -> dict:
        raise NotImplementedError


class DevSmsProvider(SmsProvider):
    async def send(self, e164_phone: str, body: str, *, tag: Optional[str] = None) -> dict:
        logger.info("sms.dev to=%s tag=%s body=%r", e164_phone, tag, body)
        return {"delivered": True, "channel": "dev-console", "dev_preview": body}


class TwilioSmsProvider(SmsProvider):
    """Reuses TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN and either
    TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM_PHONE.
    """
    def __init__(self):
        self.sid       = os.environ.get("TWILIO_ACCOUNT_SID")
        self.token     = os.environ.get("TWILIO_AUTH_TOKEN")
        self.msg_sid   = os.environ.get("TWILIO_MESSAGING_SERVICE_SID")
        self.from_num  = os.environ.get("TWILIO_FROM_PHONE")
        self._configured = bool(self.sid and self.token and (self.msg_sid or self.from_num))

    async def send(self, e164_phone: str, body: str, *, tag: Optional[str] = None) -> dict:
        if not self._configured:
            logger.info("sms.twilio.unconfigured to=%s tag=%s body=%r", e164_phone, tag, body)
            return {"delivered": False, "reason": "unconfigured", "channel": "twilio-sms"}
        try:
            from twilio.rest import Client
            def _send():
                client = Client(self.sid, self.token)
                kwargs = {"to": e164_phone, "body": body}
                if self.msg_sid:
                    kwargs["messaging_service_sid"] = self.msg_sid
                else:
                    kwargs["from_"] = self.from_num
                return client.messages.create(**kwargs)
            msg = await asyncio.to_thread(_send)
            logger.info("sms.twilio.sent sid=%s to=%s tag=%s status=%s",
                        msg.sid, e164_phone, tag, msg.status)
            return {"delivered": True, "provider_sid": msg.sid, "channel": "twilio-sms"}
        except Exception as e:  # noqa: BLE001
            logger.exception("sms.twilio.failed to=%s tag=%s err=%s", e164_phone, tag, e)
            return {"delivered": False, "error": str(e), "channel": "twilio-sms"}


def get_sms_provider() -> SmsProvider:
    # Default follows OTP_PROVIDER for convenience (single knob) but respects
    # an explicit SMS_PROVIDER override.
    provider = (os.environ.get("SMS_PROVIDER") or os.environ.get("OTP_PROVIDER") or "dev").lower()
    if provider == "twilio":
        return TwilioSmsProvider()
    return DevSmsProvider()


async def send_sms(e164_phone: str, body: str, *, tag: Optional[str] = None) -> dict:
    """Convenience module-level function — grabs the configured provider and
    fires-and-forgets. Errors are logged, not raised."""
    try:
        provider = get_sms_provider()
        return await provider.send(e164_phone, body, tag=tag)
    except Exception as e:  # noqa: BLE001
        logger.exception("sms.dispatch.failed to=%s tag=%s err=%s", e164_phone, tag, e)
        return {"delivered": False, "error": str(e)}
