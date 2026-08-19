"""
SENDbakēd Realtime — pub/sub broker interface + two implementations.

The rest of the app never imports the concrete classes; it only depends on
`get_pubsub()` returning something that satisfies `PubSubBackend`. Backends
today:

  • InProcessPubSub — asyncio.Queue fanout, single-process, zero deps.
  • RedisPubSub    — redis.asyncio Pub/Sub, works across N uvicorn workers
                     without loss on the happy path. Redis is NOT durable
                     storage — Postgres remains source of truth.

Selection: at boot, if `REDIS_URL` is set AND the initial `PING` succeeds we
use Redis; otherwise we fall back to in-process. The choice is made ONCE
per process — if Redis dies mid-flight the fan-out silently degrades on
that channel, and the frontend's REST-poll fallback continues to work as
designed. WebSockets themselves auto-reconnect and re-subscribe.

Contract:

    class PubSubBackend(Protocol):
        async def publish(channel: str, message: dict) -> None
        async def subscribe(channel: str) -> Subscription
        # optional: async def close() -> None

    class Subscription(Protocol):
        __aiter__() -> AsyncIterator[dict]
        async def close() -> None
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import defaultdict
from typing import AsyncIterator, Dict, Optional, Protocol, Set

log = logging.getLogger("baked.realtime")

_MAX_LAG = 128  # per-subscriber high-water mark; oldest frames drop past this.


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class Subscription(Protocol):
    def __aiter__(self) -> AsyncIterator[dict]: ...
    async def close(self) -> None: ...


class PubSubBackend(Protocol):
    async def publish(self, channel: str, message: dict) -> None: ...
    async def subscribe(self, channel: str) -> Subscription: ...
    def stats(self) -> dict: ...


# ---------------------------------------------------------------------------
# In-process (default / fallback)
# ---------------------------------------------------------------------------

class _InProcSub:
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
            log.warning("realtime.inproc.drop channel=%s reason=subscriber_slow", self._channel)
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

    name = "inproc"

    def __init__(self) -> None:
        self._subs: Dict[str, Set[_InProcSub]] = defaultdict(set)

    async def publish(self, channel: str, message: dict) -> None:
        for sub in list(self._subs.get(channel, ())):
            sub._put_nowait(message)

    async def subscribe(self, channel: str) -> _InProcSub:
        sub = _InProcSub(channel, self)
        self._subs[channel].add(sub)
        return sub

    async def _unsubscribe(self, channel: str, sub: _InProcSub) -> None:
        peers = self._subs.get(channel)
        if peers is None: return
        peers.discard(sub)
        if not peers:
            self._subs.pop(channel, None)

    def stats(self) -> dict:
        return {channel: len(peers) for channel, peers in self._subs.items()}


# ---------------------------------------------------------------------------
# Redis (multi-worker)
# ---------------------------------------------------------------------------

class _RedisSub:
    """One connection-scoped PubSub against a single channel. redis-py
    guarantees ordered delivery per (connection, channel), which is what
    we need for location frames."""

    def __init__(self, channel: str, pubsub, bus: "RedisPubSub"):
        self._channel = channel
        self._pubsub  = pubsub    # redis.asyncio.client.PubSub
        self._bus     = bus
        self._closed  = False

    async def __aiter__(self) -> AsyncIterator[dict]:
        try:
            async for raw in self._pubsub.listen():
                if self._closed: break
                if raw.get("type") != "message": continue
                try:
                    yield json.loads(raw["data"])
                except Exception:
                    # Bad frame from another worker — skip, don't kill the
                    # subscriber; equivalent to InProc's silent drop of
                    # malformed publisher input (which shouldn't happen since
                    # we only publish dicts).
                    continue
        except Exception as e:
            # Redis connection blew up mid-listen. Surface as a clean stop
            # so the WS handler enters its finally block and the client
            # reconnects (and re-subscribes to a hopefully-healthy Redis).
            log.warning("realtime.redis.listen_error channel=%s err=%s", self._channel, e)
            return

    async def close(self) -> None:
        if self._closed: return
        self._closed = True
        try:
            await self._pubsub.unsubscribe(self._channel)
        except Exception: pass
        try:
            await self._pubsub.aclose() if hasattr(self._pubsub, "aclose") else await self._pubsub.close()
        except Exception: pass


class RedisPubSub:
    """Multi-worker pub/sub over Redis. Every WebSocket handler holds its
    own PubSub connection; the publisher writes with the shared client."""

    name = "redis"

    def __init__(self, url: str):
        # Lazy import so the module is importable when redis isn't installed.
        import redis.asyncio as aioredis    # type: ignore
        self._url    = url
        self._client = aioredis.from_url(url, encoding="utf-8", decode_responses=True)

    @classmethod
    async def create(cls, url: str, timeout: float = 2.0) -> "RedisPubSub":
        """Return an initialised broker only if PING succeeds within `timeout`.
        Callers use this to decide whether to fall back to InProc."""
        inst = cls(url)
        try:
            await asyncio.wait_for(inst._client.ping(), timeout=timeout)
        except Exception:
            try: await inst._client.aclose() if hasattr(inst._client, "aclose") else await inst._client.close()
            except Exception: pass
            raise
        return inst

    async def publish(self, channel: str, message: dict) -> None:
        try:
            await self._client.publish(channel, json.dumps(message))
        except Exception as e:
            # Publish failure is non-fatal — log + drop. The REST fallback
            # on clients keeps tracking working; on the next successful
            # publish (or client reconnect) the stream resumes.
            log.warning("realtime.redis.publish_error channel=%s err=%s", channel, e)

    async def subscribe(self, channel: str) -> _RedisSub:
        pubsub = self._client.pubsub()
        await pubsub.subscribe(channel)
        return _RedisSub(channel, pubsub, self)

    def stats(self) -> dict:
        return {"backend": "redis", "url": self._url.split("@")[-1]}

    async def close(self) -> None:
        try:
            if hasattr(self._client, "aclose"): await self._client.aclose()
            else: await self._client.close()
        except Exception: pass


# ---------------------------------------------------------------------------
# Boot-time selection
# ---------------------------------------------------------------------------

_bus: Optional[PubSubBackend] = None
_init_lock = asyncio.Lock()


async def initialise_pubsub() -> PubSubBackend:
    """Boot hook — call once from server startup. Chooses Redis when
    `REDIS_URL` is set and reachable, otherwise falls back to InProc.
    Safe to call multiple times (idempotent behind a lock)."""
    global _bus
    if _bus is not None: return _bus
    async with _init_lock:
        if _bus is not None: return _bus
        url = os.environ.get("REDIS_URL", "").strip()
        if url:
            try:
                _bus = await RedisPubSub.create(url)
                log.info("realtime.pubsub redis backend ready url=%s", url.split("@")[-1])
                return _bus
            except Exception as e:
                log.warning("realtime.pubsub redis unavailable — falling back to inproc: %s", e)
        _bus = InProcessPubSub()
        log.info("realtime.pubsub inproc backend ready")
        return _bus


def get_pubsub() -> PubSubBackend:
    """Sync accessor for hot paths. Returns InProc as a last resort if
    called before `initialise_pubsub()`; the startup handler always calls
    initialise, so this only happens in isolated tests."""
    global _bus
    if _bus is None:
        _bus = InProcessPubSub()
        log.info("realtime.pubsub inproc backend ready (lazy)")
    return _bus


def job_channel(job_id: str) -> str:
    """Canonical channel a job broadcasts on."""
    return f"job:{job_id}"


# ---------- test helpers -----------------------------------------------------

def _reset_for_tests() -> None:      # pragma: no cover — pytest-only
    global _bus
    _bus = None
