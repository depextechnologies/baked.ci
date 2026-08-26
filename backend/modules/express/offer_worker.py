"""Background worker: expire stale job offers and retry dispatch.

Runs a lightweight tick every EXPIRY_TICK_SECONDS. For each booking whose
offer_expires_at has passed while status='offering', mark the current driver
as declined and let dispatch_next_offer() try the next candidate.

Kept dead simple — no cron, no external scheduler. Started at FastAPI
lifespan boot in server.py; stopped cleanly on shutdown.
"""
from __future__ import annotations
import asyncio
import logging
import os
from datetime import datetime, timezone

from sqlalchemy import select

from core.db import SessionLocal
from core.models import ExpressBooking
from modules.express.dispatch import decline_offer

log = logging.getLogger("baked.express.offer_worker")

EXPIRY_TICK_SECONDS = int(os.environ.get("EXPRESS_OFFER_TICK_S", "3"))


async def _tick() -> int:
    """One pass — returns the count of offers actually expired.
    Isolated so tests can drive the worker deterministically without sleeping.
    """
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        expired = (await session.execute(
            select(ExpressBooking).where(
                ExpressBooking.status == "offering",
                ExpressBooking.offer_expires_at <= now,
                ExpressBooking.offered_to_driver_id.isnot(None),
            )
        )).scalars().all()
        n = 0
        for b in expired:
            declined_id = b.offered_to_driver_id
            log.info("offer.expired booking=%s driver=%s", b.id, declined_id)
            try:
                await decline_offer(session, b, declined_id)
                n += 1
            except Exception as exc:  # noqa: BLE001
                log.warning("offer.expiry_failed booking=%s err=%s", b.id, exc.__class__.__name__)
        if n:
            await session.commit()
        return n


async def run_forever() -> None:
    log.info("express.offer_worker started tick=%ss", EXPIRY_TICK_SECONDS)
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.warning("offer.tick_failed err=%s", exc.__class__.__name__)
        await asyncio.sleep(EXPIRY_TICK_SECONDS)
