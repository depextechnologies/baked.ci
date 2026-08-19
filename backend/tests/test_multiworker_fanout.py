"""Slice 8+9 sanity: with `--workers 4` + Redis, WS traffic from a driver
socket MUST reach a customer socket even when the two connections landed
on different uvicorn workers.

The kernel LB (SO_REUSEPORT) picks a worker per connection, so we can't
force a split — instead we fan out N pairs and require that ALL of them
succeed. Statistically at least one pair lands on split workers.

Prerequisite: `sudo supervisorctl status backend` shows RUNNING, Redis is
up, and the app has an approved driver we can dispatch to."""
from __future__ import annotations

import asyncio
import json
import os
import time
import uuid

import pytest
import websockets

from tests.test_realtime_ws import (   # reuse the Slice-7 helpers
    WS_URL, admin_headers,
    _bootstrap_approved_online_driver as bootstrap_approved_driver,
    _dispatch_and_accept as _dispatch_helper,
)


def dispatch_and_accept(admin_headers, driver):
    return _dispatch_helper(driver, admin_headers)


@pytest.mark.asyncio
async def test_multiworker_ws_fanout(admin_headers):
    """Open N=5 (customer, driver) socket pairs sequentially. Every driver
    socket sends one location frame; the paired customer socket must
    receive it. If Redis pub/sub or the multi-worker glue is broken this
    test flakes hard — reliability >99% requires cross-worker delivery."""
    N = 5
    drivers = [bootstrap_approved_driver(admin_headers, salt=5000 + i) for i in range(N)]
    jobs    = [dispatch_and_accept(admin_headers, d) for d in drivers]

    async def one_pair(driver, job):
        cust_url = f"{WS_URL}/api/ws/track/{job['id']}?t={job['share_token']}"
        drv_url  = f"{WS_URL}/api/ws/driver/jobs/{job['id']}?token={driver['jwt']}"
        marker   = {"lat": 28.60 + hash(job['id']) % 100 / 1000, "lng": 77.35, "sig": uuid.uuid4().hex}
        async with websockets.connect(cust_url, open_timeout=5) as cust:
            hello = json.loads(await asyncio.wait_for(cust.recv(), timeout=3))
            assert hello.get("type") == "hello"
            async with websockets.connect(drv_url, open_timeout=5) as drv:
                # Drain the driver-side hello.
                await asyncio.wait_for(drv.recv(), timeout=3)
                # Publish a distinguishable frame.
                await drv.send(json.dumps({
                    "type": "location", **marker,
                    "heading": 45, "speed_mps": 8.4,
                }))
                # Drain until we see a `location` frame with our marker.
                deadline = time.monotonic() + 5
                found = False
                while time.monotonic() < deadline:
                    try:
                        raw = await asyncio.wait_for(cust.recv(), timeout=2)
                    except asyncio.TimeoutError:
                        break
                    frame = json.loads(raw)
                    if frame.get("type") == "location" and frame.get("lat") == marker["lat"]:
                        found = True; break
                assert found, f"pair for job {job['id']} did not receive location within 5s"

    # Run pairs concurrently so different pairs are more likely to hit
    # different workers.
    await asyncio.gather(*(one_pair(d, j) for d, j in zip(drivers, jobs)))
