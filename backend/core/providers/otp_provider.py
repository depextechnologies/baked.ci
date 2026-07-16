"""OTP provider abstraction. Development impl returns code inline; Twilio/Africa's Talking pluggable."""
from __future__ import annotations
import os
import random
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class OtpProvider(ABC):
    @abstractmethod
    async def send_code(self, e164_phone: str, code: str, locale: str = "en") -> dict:
        ...


class DevOtpProvider(OtpProvider):
    """Prints the code to logs and returns it in the response payload. Never enable in production."""

    async def send_code(self, e164_phone: str, code: str, locale: str = "en") -> dict:
        logger.info("otp.dev_send phone=%s code=%s", e164_phone, code)
        return {"delivered": True, "dev_code": code, "channel": "dev-console"}


def generate_code(length: int = 6) -> str:
    return "".join(random.choices("0123456789", k=length))


def get_otp_provider() -> OtpProvider:
    provider = os.environ.get("OTP_PROVIDER", "dev").lower()
    if provider == "dev":
        return DevOtpProvider()
    # TODO: TwilioOtpProvider, AfricasTalkingOtpProvider — plug in and switch via env
    return DevOtpProvider()
