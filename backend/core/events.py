"""In-process event bus. RabbitMQ-compatible interface — swap the impl to publish to AMQP later.

Handlers are async callables receiving (event_name: str, payload: dict).
"""
from __future__ import annotations
from typing import Callable, Awaitable, Dict, List
import asyncio
import logging

logger = logging.getLogger(__name__)

EventHandler = Callable[[str, dict], Awaitable[None]]


class EventBus:
    def __init__(self):
        self._handlers: Dict[str, List[EventHandler]] = {}

    def subscribe(self, event_name: str, handler: EventHandler) -> None:
        self._handlers.setdefault(event_name, []).append(handler)

    async def publish(self, event_name: str, payload: dict) -> None:
        logger.info("event.published name=%s keys=%s", event_name, list(payload.keys()))
        handlers = self._handlers.get(event_name, [])
        if not handlers:
            return
        await asyncio.gather(
            *[self._safe(h, event_name, payload) for h in handlers],
            return_exceptions=True,
        )

    async def _safe(self, handler: EventHandler, event_name: str, payload: dict) -> None:
        try:
            await handler(event_name, payload)
        except Exception as e:  # noqa: BLE001
            logger.exception("event.handler_error name=%s err=%s", event_name, e)


event_bus = EventBus()


# --- canonical event names (per PRD) ---
class Events:
    CUSTOMER_REGISTERED = "CustomerRegistered"
    CUSTOMER_VERIFIED = "CustomerVerified"
    OTP_REQUESTED = "OtpRequested"
    ORDER_CREATED = "OrderCreated"
    ORDER_UPDATED = "OrderUpdated"
    PAYMENT_COMPLETED = "PaymentCompleted"
    WALLET_UPDATED = "WalletUpdated"
    NOTIFICATION_REQUESTED = "NotificationRequested"
    ANALYTICS_UPDATED = "AnalyticsUpdated"
    AI_REQUESTED = "AIRequested"
    CART_UPDATED = "CartUpdated"
