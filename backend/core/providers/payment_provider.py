"""Payment provider abstraction.

v1 default: Cash-on-Delivery. Stripe / Mobile Money (Orange, MTN, Wave) pluggable behind the same interface
without touching order flow code — swap `PAYMENT_PROVIDER` env when credentials are supplied.
"""
from __future__ import annotations
import os
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class PaymentProvider(ABC):
    code: str

    @abstractmethod
    async def create_intent(self, order: dict) -> dict:
        """Return { status: 'pending'|'authorized'|'succeeded', provider_ref, next_action?, amount, currency }."""

    @abstractmethod
    async def capture(self, intent_ref: str) -> dict:
        """Return { status: 'succeeded'|'failed', provider_ref }."""


class CashOnDeliveryProvider(PaymentProvider):
    """Payment collected in cash by the driver on delivery. Intent auto-authorized, captured on delivery."""

    code = "cod"

    async def create_intent(self, order: dict) -> dict:
        return {
            "status": "authorized",
            "provider": self.code,
            "provider_ref": f"cod_{order['id']}",
            "amount": order["total"],
            "currency": order["currency"],
            "next_action": None,
        }

    async def capture(self, intent_ref: str) -> dict:
        return {"status": "succeeded", "provider": self.code, "provider_ref": intent_ref}


class StripeProviderStub(PaymentProvider):
    """Placeholder — swap in real Stripe integration when secret key is provided."""
    code = "stripe"

    async def create_intent(self, order: dict) -> dict:
        raise NotImplementedError("Stripe provider not configured. Set STRIPE_SECRET_KEY and switch PAYMENT_PROVIDER=stripe.")

    async def capture(self, intent_ref: str) -> dict:
        raise NotImplementedError


class MobileMoneyProviderStub(PaymentProvider):
    """Placeholder for Orange Money / MTN Mobile Money / Wave (CI). Requires merchant credentials."""
    code = "mobile_money"

    async def create_intent(self, order: dict) -> dict:
        raise NotImplementedError("Mobile Money provider not configured yet.")

    async def capture(self, intent_ref: str) -> dict:
        raise NotImplementedError


def get_payment_provider(code: str | None = None) -> PaymentProvider:
    code = (code or os.environ.get("PAYMENT_PROVIDER", "cod")).lower()
    if code == "stripe":
        return StripeProviderStub()
    if code == "mobile_money":
        return MobileMoneyProviderStub()
    return CashOnDeliveryProvider()


# List of methods the customer can pick at checkout — reflects what's actually wired.
def list_payment_methods() -> list[dict]:
    methods = [
        {"code": "cod", "label": "Cash on Delivery", "label_fr": "Paiement à la livraison", "enabled": True, "description": "Pay in cash when your order arrives"},
        {"code": "stripe", "label": "Card (Visa / Mastercard)", "label_fr": "Carte bancaire", "enabled": False, "description": "Add a Stripe key to enable"},
        {"code": "mobile_money", "label": "Mobile Money (Orange / MTN / Wave)", "label_fr": "Mobile Money (Orange / MTN / Wave)", "enabled": False, "description": "Add merchant credentials to enable"},
    ]
    return methods
