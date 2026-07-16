"""OTP provider abstraction.

Providers:
  - dev  (default) — returns the code inline for local development
  - twilio          — Twilio Verify (needs TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_VERIFY_SERVICE_SID)
  - africastalking  — Africa's Talking (needs AT_USERNAME + AT_API_KEY, better for CI/West Africa)

Switch by setting OTP_PROVIDER env var.
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


class TwilioVerifyProvider(OtpProvider):
    """Twilio Verify — server-side generates + delivers the code.
    NOTE: We still generate our own code so verify flow stays uniform; Twilio's Verify service
    normally owns the code. To use Twilio, refactor to call twilio.verify.services(sid).verifications.create.
    """
    code = "twilio"

    def __init__(self):
        self.sid = os.environ.get("TWILIO_ACCOUNT_SID")
        self.token = os.environ.get("TWILIO_AUTH_TOKEN")
        self.service = os.environ.get("TWILIO_VERIFY_SERVICE_SID")
        if not all([self.sid, self.token, self.service]):
            raise RuntimeError("Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID")

    async def send_code(self, e164_phone: str, code: str, locale: str = "en") -> dict:
        # TODO: use twilio-python: Client(sid, token).verify.services(service).verifications.create(to=e164_phone, channel="sms")
        raise NotImplementedError("Twilio Verify not wired yet — credentials are in place, delivery integration pending.")


class AfricasTalkingProvider(OtpProvider):
    """Africa's Talking SMS — better CI/West-Africa coverage + sender ID."""
    code = "africastalking"

    def __init__(self):
        self.username = os.environ.get("AT_USERNAME")
        self.api_key = os.environ.get("AT_API_KEY")
        if not all([self.username, self.api_key]):
            raise RuntimeError("Africa's Talking not configured — set AT_USERNAME and AT_API_KEY")

    async def send_code(self, e164_phone: str, code: str, locale: str = "en") -> dict:
        # TODO: use africastalking-python SDK to send SMS with message: f"Votre code bakēd: {code}"
        raise NotImplementedError("Africa's Talking not wired yet.")


def generate_code(length: int = 6) -> str:
    return "".join(random.choices("0123456789", k=length))


def get_otp_provider() -> OtpProvider:
    provider = os.environ.get("OTP_PROVIDER", "dev").lower()
    if provider == "twilio":
        return TwilioVerifyProvider()
    if provider == "africastalking":
        return AfricasTalkingProvider()
    return DevOtpProvider()
