"""
SENDbakēd Realtime — job-scoped pub/sub with a swap-able backend.

Today: in-process `asyncio.Queue` fanout. One backend worker, all sockets in
the same process. Cheap, predictable, and enough for our current traffic.

Tomorrow: same public API can front Redis Pub/Sub or NATS without changing
any route code. When we're ready:

    class RedisPubSub(PubSub):
        async def publish(channel, message): ...
        async def subscribe(channel) -> AsyncIterator[dict]: ...

and swap `get_pubsub()` to return that instance. Route handlers don't care.

Design notes:
- Channel names are opaque strings; we use `job:{job_id}` per driver_jobs row.
- `publish` is fire-and-forget; slow subscribers do not block the publisher
  (their queue is dropped past `_MAX_LAG`).
- `subscribe` returns an async iterator that a WS handler drains — the caller
  is responsible for calling `subscription.close()` on disconnect.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, AsyncIterator, Dict, Set

log = logging.getLogger("baked.realtime")

_MAX_LAG = 128  # drop the slowest subscriber's oldest frames past this.


class _Subscription:
    """A per-connection queue subscribing to a single channel."""

    def __init__(self, channel: str, bus: "InProcessPubSub"):
        self._channel = channel
        self._bus     = bus
        self._queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=_MAX_LAG)
        self._closed  = False

    def _put_nowait(self, message: dict) -> None:
        if self._closed: return
        try:
            self._queue.put_nowait(message)
        except asyncio.QueueFull:
            # Drop oldest, then push newest — favour freshness for location.
            log.warning("realtime.pubsub.drop channel=%s reason=subscriber_slow", self._channel)
            try: self._queue.get_nowait()
            except asyncio.QueueEmpty: pass
            try: self._queue.put_nowait(message)
            except asyncio.QueueFull: pass

    async def __aiter__(self) -> AsyncIterator[dict]:
        while not self._closed:
            try:
                yield await self._queue.get()
            except asyncio.CancelledError:
                break

    async def close(self) -> None:
        self._closed = True
        await self._bus._unsubscribe(self._channel, self)


class InProcessPubSub:
    """Single-process pub/sub. Thread-unsafe; use only from the event loop."""

    def __init__(self) -> None:
        self._subs: Dict[str, Set[_Subscription]] = defaultdict(set)

    async def publish(self, channel: str, message: dict) -> None:
        # `set(...)` copy so `_put_nowait` mutating via close() doesn't race.
        for sub in list(self._subs.get(channel, ())):
            sub._put_nowait(message)

    async def subscribe(self, channel: str) -> _Subscription:
        sub = _Subscription(channel, self)
        self._subs[channel].add(sub)
        return sub

    async def _unsubscribe(self, channel: str, sub: _Subscription) -> None:
        peers = self._subs.get(channel)
        if peers is None: return
        peers.discard(sub)
        if not peers:
            self._subs.pop(channel, None)

    # Diagnostic — used by `/api/admin/realtime/health` for ops.
    def stats(self) -> dict:
        return {channel: len(peers) for channel, peers in self._subs.items()}


# Module-level singleton. `get_pubsub()` is the ONLY import surface for the
# rest of the app — nothing else touches `InProcessPubSub` directly.
_bus: InProcessPubSub | None = None


def get_pubsub() -> InProcessPubSub:
    global _bus
    if _bus is None:
        _bus = InProcessPubSub()
        log.info("realtime.pubsub in-process bus initialised")
    return _bus


def job_channel(job_id: str) -> str:
    """The canonical channel a job broadcasts on."""
    return f"job:{job_id}"
