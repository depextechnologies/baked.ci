"""SENDbakēd — parametrised pytest contract for both PubSub backends.

Runs the same publish/subscribe assertions against `InProcessPubSub` and
`RedisPubSub`. Redis tests skip cleanly if REDIS_URL is unset or the
server refuses PING within 1s — CI without Redis still gets 100% pass on
the InProc half."""
from __future__ import annotations

import asyncio
import os
import uuid

import pytest
import pytest_asyncio

from modules.realtime import InProcessPubSub, RedisPubSub


# ---------------------------------------------------------------------------
# Backend fixtures — one per implementation
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def inproc():
    bus = InProcessPubSub()
    yield bus


@pytest_asyncio.fixture
async def redis_bus():
    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        pytest.skip("REDIS_URL not set — Redis contract skipped")
    try:
        bus = await RedisPubSub.create(url, timeout=1.0)
    except Exception as e:
        pytest.skip(f"Redis unavailable: {e}")
    try:
        yield bus
    finally:
        await bus.close()


# Every test that takes `bus` runs twice — once against each backend.
@pytest.fixture(params=["inproc", "redis"])
def bus(request):
    return request.getfixturevalue(f"{request.param}" if request.param == "inproc" else "redis_bus")


# Unique channel per test to avoid cross-run bleed on Redis (which is a
# shared process — pytest re-uses the same running redis-server).
@pytest.fixture
def channel():
    return f"pubsub:test:{uuid.uuid4().hex[:12]}"


# ---------------------------------------------------------------------------
# Contract — identical assertions across both backends
# ---------------------------------------------------------------------------

async def _first(sub, timeout: float = 2.0):
    """Return the first message from `sub`, or raise TimeoutError.

    Note: the InProc iterator turns cancellation into a graceful loop-exit
    (StopAsyncIteration), so callers waiting for "silence" must accept
    both `TimeoutError` and `StopAsyncIteration` as valid empty signals.
    """
    it = sub.__aiter__()
    return await asyncio.wait_for(it.__anext__(), timeout=timeout)


# Silence sentinel — either exception indicates "no message arrived".
_SILENCE = (asyncio.TimeoutError, StopAsyncIteration)


@pytest.mark.asyncio
async def test_pubsub_single_subscriber_receives_publish(bus, channel):
    sub = await bus.subscribe(channel)
    # Redis needs a brief moment for SUBSCRIBE to be acknowledged before
    # the first publish — otherwise the publisher writes into a channel
    # nobody's listening on and the frame is lost (fire-and-forget).
    await asyncio.sleep(0.05)
    try:
        await bus.publish(channel, {"type": "hello", "n": 1})
        msg = await _first(sub, timeout=2.0)
        assert msg == {"type": "hello", "n": 1}
    finally:
        await sub.close()


@pytest.mark.asyncio
async def test_pubsub_fanout_to_multiple_subscribers(bus, channel):
    """Every subscriber on the same channel gets a copy of every publish."""
    sub_a = await bus.subscribe(channel)
    sub_b = await bus.subscribe(channel)
    await asyncio.sleep(0.05)
    try:
        await bus.publish(channel, {"type": "loc", "lat": 28.6, "lng": 77.3})
        got_a = await _first(sub_a); got_b = await _first(sub_b)
        assert got_a == got_b == {"type": "loc", "lat": 28.6, "lng": 77.3}
    finally:
        await sub_a.close(); await sub_b.close()


@pytest.mark.asyncio
async def test_pubsub_channel_isolation(bus):
    """A publish on channel A must NOT reach a subscriber on channel B."""
    ch_a = f"pubsub:iso:a:{uuid.uuid4().hex[:8]}"
    ch_b = f"pubsub:iso:b:{uuid.uuid4().hex[:8]}"
    sub_a = await bus.subscribe(ch_a)
    sub_b = await bus.subscribe(ch_b)
    await asyncio.sleep(0.05)
    try:
        await bus.publish(ch_a, {"only": "a"})
        got_a = await _first(sub_a, timeout=1.5)
        assert got_a == {"only": "a"}
        # sub_b should time out — nothing on its channel.
        with pytest.raises(_SILENCE):
            await _first(sub_b, timeout=0.7)
    finally:
        await sub_a.close(); await sub_b.close()


@pytest.mark.asyncio
async def test_pubsub_ordering(bus, channel):
    """Same publisher, same channel → subscribers see frames in publish order."""
    sub = await bus.subscribe(channel)
    await asyncio.sleep(0.05)
    try:
        for i in range(5):
            await bus.publish(channel, {"i": i})
        received = []
        it = sub.__aiter__()
        for _ in range(5):
            received.append(await asyncio.wait_for(it.__anext__(), timeout=2.0))
        assert [m["i"] for m in received] == [0, 1, 2, 3, 4]
    finally:
        await sub.close()


@pytest.mark.asyncio
async def test_pubsub_close_stops_delivery(bus, channel):
    """After `sub.close()`, further publishes MUST NOT resurrect the
    subscription (no message leakage, no dangling refs)."""
    sub = await bus.subscribe(channel)
    await asyncio.sleep(0.05)
    await bus.publish(channel, {"pre": True})
    got = await _first(sub, timeout=2.0)
    assert got == {"pre": True}
    await sub.close()
    # Now publish again; we shouldn't receive anything.
    await bus.publish(channel, {"post": True})
    with pytest.raises(_SILENCE):
        it = sub.__aiter__()
        await asyncio.wait_for(it.__anext__(), timeout=0.6)


@pytest.mark.asyncio
async def test_pubsub_no_cross_delivery_after_reuse(bus, channel):
    """A subscription that has been closed and re-opened on the same
    channel doesn't inherit the previous subscription's queue."""
    sub_first = await bus.subscribe(channel)
    await asyncio.sleep(0.05)
    await bus.publish(channel, {"gen": 1})
    await _first(sub_first)
    await sub_first.close()
    # New subscriber on the same channel; the old frame from gen=1 must
    # NOT be re-delivered here.
    sub_second = await bus.subscribe(channel)
    await asyncio.sleep(0.05)
    with pytest.raises(_SILENCE):
        await _first(sub_second, timeout=0.6)
    await bus.publish(channel, {"gen": 2})
    got = await _first(sub_second)
    assert got == {"gen": 2}
    await sub_second.close()


@pytest.mark.asyncio
async def test_pubsub_publish_without_subscribers_is_noop(bus, channel):
    """Publishing to a channel with zero subscribers must not error."""
    # No assert on stats — the two backends report differently — just
    # verify no exception and no hang.
    await asyncio.wait_for(bus.publish(channel, {"nobody": "home"}), timeout=1.0)
