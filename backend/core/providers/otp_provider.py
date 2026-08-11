"""OTP provider abstraction.

Providers:
  - dev              (default) — returns the code inline for local development
  - twilio            — Twilio Messaging API (SMS with our own generated code)
  - twilio_verify     — Twilio Verify service (Twilio owns code + verification)
  - africastalking    — Africa's Talking SMS (better for CI/West Africa)

Switch by setting OTP_PROVIDER env var. All providers gracefully return
`{delivered: false}` if credentials are missing so the app never crashes —
in that case the backend still stores the challenge, so QA can pull the code
from the OtpChallenge table.
"""
from __future__ import annotations
import os
import random
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class OtpProvider(ABC):
    code: str

    @abstractmethod
    async def send_code(self, e164_phone: str, code: str, locale: str = "en") -> dict:
        ...


class DevOtpProvider(OtpProvider):
    """Prints the code to logs and returns it in the response payload. Never enable in production."""
    code = "dev"

    async def send_code(self, e164_phone: str, code: str, locale: str = "en") -> dict:
        logger.info("otp.dev_send phone=%s code=%s", e164_phone, code)
        return {"delivered": True, "dev_code": code, "channel": "dev-console"}


def _fr_message(code: str) -> str:
    return f"Votre code BAKĒD : {code}. Il expire dans 5 minutes. Ne le partagez avec personne."


def _en_message(code: str) -> str:
    return f"Your BAKĒD code: {code}. It expires in 5 minutes. Do not share it."


class TwilioSmsProvider(OtpProvider):
    """Sends our own generated code via Twilio Messaging API.

    Requires:
      - TWILIO_ACCOUNT_SID
      - TWILIO_AUTH_TOKEN
      - one of: TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM_PHONE
    """
    code = "twilio"

    def __init__(self):
        self.sid       = os.environ.get("TWILIO_ACCOUNT_SID")
        self.token     = os.environ.get("TWILIO_AUTH_TOKEN")
        self.msg_sid   = os.environ.get("TWILIO_MESSAGING_SERVICE_SID")
        self.from_num  = os.environ.get("TWILIO_FROM_PHONE")
        self._configured = bool(self.sid and self.token and (self.msg_sid or self.from_num))
        if not self._configured:
            logger.warning(
                "twilio.otp.not_configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and "
                "TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_PHONE. Falling back to dev echo."
            )

    async def send_code(self, e164_phone: str, code: str, locale: str = "en") -> dict:
        if not self._configured:
            return {"delivered": False, "dev_code": code, "channel": "twilio-unconfigured"}
        body = _fr_message(code) if locale.lower().startswith("fr") else _en_message(code)
        # twilio-python is sync — run in threadpool so we don't block the event loop.
        import asyncio
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
            logger.info("twilio.otp.sent sid=%s to=%s status=%s", msg.sid, e164_phone, msg.status)
            return {"delivered": True, "provider_sid": msg.sid, "channel": "twilio-sms"}
        except Exception as e:  # noqa: BLE001
            logger.exception("twilio.otp.failed to=%s err=%s", e164_phone, e)
            return {"delivered": False, "error": str(e), "channel": "twilio-sms"}


class TwilioVerifyProvider(OtpProvider):
    """Twilio Verify service — Twilio generates AND delivers the code.

    NOTE: Our existing verification flow verifies the code against a locally
    stored `OtpChallenge`. When using Verify, the code we generate is ignored
    (Twilio generates its own) — so this provider requires an accompanying
    refactor on the /otp/verify route to call `verification_checks.create`.
    Prefer TwilioSmsProvider unless you need Twilio's advanced fraud tooling.
    """
    code = "twilio_verify"

    def __init__(self):
        self.sid     = os.environ.get("TWILIO_ACCOUNT_SID")
        self.token   = os.environ.get("TWILIO_AUTH_TOKEN")
        self.service = os.environ.get("TWILIO_VERIFY_SERVICE_SID")
        self._configured = bool(self.sid and self.token and self.service)
        if not self._configured:
            logger.warning("twilio_verify.not_configured — set TWILIO_VERIFY_SERVICE_SID. Falling back to dev echo.")

    async def send_code(self, e164_phone: str, code: str, locale: str = "en") -> dict:
        if not self._configured:
            return {"delivered": False, "dev_code": code, "channel": "twilio-verify-unconfigured"}
        import asyncio
        try:
            from twilio.rest import Client
            def _send():
                client = Client(self.sid, self.token)
                return (client.verify.v2
                              .services(self.service)
                              .verifications
                              .create(to=e164_phone, channel="sms",
                                      locale=("fr" if locale.lower().startswith("fr") else "en")))
            v = await asyncio.to_thread(_send)
            logger.info("twilio.verify.sent sid=%s to=%s status=%s", v.sid, e164_phone, v.status)
            return {"delivered": True, "provider_sid": v.sid, "channel": "twilio-verify",
                    "verify_owned": True}  # signal to /otp/verify to use verification_checks
        except Exception as e:  # noqa: BLE001
            logger.exception("twilio.verify.failed to=%s err=%s", e164_phone, e)
            return {"delivered": False, "error": str(e), "channel": "twilio-verify"}


class AfricasTalkingProvider(OtpProvider):
    """Africa's Talking SMS — better CI/West-Africa coverage + sender ID."""
    code = "africastalking"

    def __init__(self):
        self.username = os.environ.get("AT_USERNAME")
        self.api_key  = os.environ.get("AT_API_KEY")
        self._configured = bool(self.username and self.api_key)
        if not self._configured:
            logger.warning("africastalking.not_configured — set AT_USERNAME + AT_API_KEY. Falling back to dev echo.")

    async def send_code(self, e164_phone: str, code: str, locale: str = "en") -> dict:
        if not self._configured:
            return {"delivered": False, "dev_code": code, "channel": "africastalking-unconfigured"}
        # TODO: wire africastalking SDK when the account is provisioned.
        # Not raising to keep the auth flow alive.
        return {"delivered": False, "dev_code": code, "channel": "africastalking-not-wired"}


def generate_code(length: int = 6) -> str:
    return "".join(random.choices("0123456789", k=length))


def get_otp_provider() -> OtpProvider:
    provider = os.environ.get("OTP_PROVIDER", "dev").lower()
    if provider == "twilio":
        return TwilioSmsProvider()
    if provider in ("twilio_verify", "twilio-verify"):
        return TwilioVerifyProvider()
    if provider == "africastalking":
        return AfricasTalkingProvider()
    return DevOtpProvider()
