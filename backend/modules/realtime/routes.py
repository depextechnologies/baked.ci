"""SENDbakēd Realtime — WebSocket endpoints for driver publish + customer subscribe.

Driver:   wss://.../api/ws/driver/jobs/{job_id}?token=<jwt>
Customer: wss://.../api/ws/track/{job_id}?t=<share_token>

Frame contract (both directions use `{ "type": "...", ... }`):

  Driver → Server:
    { type: "location", lat, lng, heading?, speed_mps?, ts? }
    { type: "pong" }                           # heartbeat reply

  Server → Client:
    { type: "hello", job_id, status, driver? } # sent on connect
    { type: "location", lat, lng, heading?, speed_mps?, ts_server }
    { type: "job_status", status }
    { type: "ping" }                           # every 25s
    { type: "closed", reason }                 # graceful terminal
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from sqlalchemy import select

from core.db import SessionLocal
from core.models import Driver, DriverJob
from core.security import decode_token
from modules.realtime import get_pubsub, job_channel

DRIVER_JWT_ROLE = "driver"

log = logging.getLogger("baked.realtime.ws")

router = APIRouter(prefix="/ws", tags=["realtime"])

HEARTBEAT_S            = 25            # server → client ping cadence
CLIENT_TIMEOUT_S       = 60            # kill sockets that don't answer
LOCATION_WRITE_MIN_S   = 10            # min gap between DB persists per driver
IN_FLIGHT_STATUSES     = {"offered", "accepted", "arriving_pickup",
                          "picked_up", "arriving_dropoff"}

_last_write_at: dict[str, float] = {}   # driver_id → monotonic sec


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _load_driver_job(job_id: str, driver_id: str) -> Optional[DriverJob]:
    async with SessionLocal() as s:
        j = await s.get(DriverJob, job_id)
        if not j or j.driver_id != driver_id: return None
        return j


async def _load_track_job(job_id: str, share_token: str) -> Optional[DriverJob]:
    async with SessionLocal() as s:
        j = await s.get(DriverJob, job_id)
        if not j or not j.share_token or j.share_token != share_token: return None
        return j


async def _driver_snapshot(j: DriverJob) -> dict:
    """Small payload the customer needs on first connect — mirrors the safe
    subset of GET /send/track/{id}."""
    async with SessionLocal() as s:
        d = await s.get(Driver, j.driver_id) if j.driver_id else None
    return {
        "type": "hello",
        "job_id": j.id,
        "status": j.status,
        "driver": None if not d or j.status not in IN_FLIGHT_STATUSES else {
            "name": d.name, "vehicle_type": d.vehicle_type, "vehicle_plate": d.vehicle_plate,
            "current_lat": d.current_lat, "current_lng": d.current_lng,
            "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
        },
        "server_ts": time.time(),
    }


async def _persist_driver_location(driver_id: str, lat: float, lng: float) -> None:
    """Persist the freshest coord. Caller MUST enforce the throttle window
    via `_should_persist(driver_id)` before scheduling — this function
    unconditionally writes, so calling it in a tight loop will thrash the
    connection pool. Kept unconditional so tests can force writes."""
    async with SessionLocal() as s:
        d = await s.get(Driver, driver_id)
        if not d: return
        d.current_lat = lat
        d.current_lng = lng
        d.last_seen_at = datetime.now(timezone.utc)
        await s.commit()


def _should_persist(driver_id: str) -> bool:
    """Gate for `_persist_driver_location`. Returns True at most once every
    LOCATION_WRITE_MIN_S seconds per driver. Non-async so the caller can
    decide before spawning a coroutine (saves DB pool churn under load)."""
    now = time.monotonic()
    if now - _last_write_at.get(driver_id, 0) < LOCATION_WRITE_MIN_S:
        return False
    _last_write_at[driver_id] = now
    return True


async def _server_heartbeat(ws: WebSocket, stop: asyncio.Event) -> None:
    """Emit `{type: ping}` every HEARTBEAT_S. Never touches DB. Cancelled by
    the outer handler on disconnect via `stop.set()`."""
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=HEARTBEAT_S)
        except asyncio.TimeoutError:
            if ws.application_state != WebSocketState.CONNECTED: return
            try:
                await ws.send_json({"type": "ping", "ts": time.time()})
            except Exception:
                return


# ---------------------------------------------------------------------------
# Driver WS — publishes location + receives job_status echoes
# ---------------------------------------------------------------------------

@router.websocket("/driver/jobs/{job_id}")
async def ws_driver_job(
    ws: WebSocket,
    job_id: str,
    token: str = Query(..., description="Driver JWT (opaque to the browser)"),
):
    """Driver publishes to their own job. Auth = JWT + row-level ownership.
    Rejected drivers (wrong JWT, not the assigned driver, terminal job) are
    closed with a 4401/4403 code so the client can react intelligently."""
    # 1. Auth — accept the socket THEN close with a specific code so the
    # client can distinguish invalid_token / not_your_job / job_terminal.
    # (Closing before accept collapses to HTTP 403 during handshake — fine
    # for security but useless for driver-side UX.)
    try:
        payload = decode_token(token) if token else None
    except Exception:
        payload = None
    driver_id = payload.get("sub") if payload else None
    role      = payload.get("role") if payload else None
    if not driver_id or role != DRIVER_JWT_ROLE:
        await ws.accept(); await ws.close(code=4401, reason="invalid_token"); return

    j = await _load_driver_job(job_id, driver_id)
    if not j:
        await ws.accept(); await ws.close(code=4403, reason="not_your_job"); return
    if j.status not in IN_FLIGHT_STATUSES:
        await ws.accept(); await ws.close(code=4409, reason="job_terminal"); return

    await ws.accept()
    bus = get_pubsub()
    channel = job_channel(job_id)
    stop = asyncio.Event()

    # Send an initial ack so the driver PWA knows the socket is authed.
    try:
        await ws.send_json({
            "type": "hello", "job_id": job_id, "status": j.status,
            "role": "driver", "server_ts": time.time(),
        })
    except Exception:
        return

    heartbeat_task = asyncio.create_task(_server_heartbeat(ws, stop))
    log.info("ws.driver.connect driver=%s job=%s", driver_id, job_id)

    try:
        while True:
            try:
                data = await asyncio.wait_for(ws.receive_json(), timeout=CLIENT_TIMEOUT_S)
            except asyncio.TimeoutError:
                log.info("ws.driver.timeout driver=%s job=%s", driver_id, job_id)
                break
            except WebSocketDisconnect:
                break
            except Exception:
                # Malformed JSON — kill the socket so client reconnects clean.
                break

            kind = (data or {}).get("type")
            if kind == "pong":
                continue

            if kind == "location":
                lat, lng = data.get("lat"), data.get("lng")
                if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
                    continue    # ignore malformed frames — don't drop socket
                frame = {
                    "type": "location",
                    "job_id": job_id,
                    "lat": float(lat), "lng": float(lng),
                    "heading": data.get("heading"),
                    "speed_mps": data.get("speed_mps"),
                    "ts_server": time.time(),
                }
                # Fan out FIRST so the customer sees the freshest coord even
                # if the DB write is throttled.
                await bus.publish(channel, frame)
                # Only schedule the DB coroutine when the throttle window is
                # actually open — under a busy 2-3s cadence this drops ~4 out
                # of 5 potential SessionLocal() opens.
                if _should_persist(driver_id):
                    asyncio.create_task(_persist_driver_location(driver_id, float(lat), float(lng)))
                continue

            if kind == "status":
                # Purely informational — the authoritative status flip still
                # happens through the REST endpoints (`accept`, `arrive-pickup`,
                # etc.). We just broadcast the label so the customer's UI can
                # anticipate the transition.
                new_status = data.get("status")
                if new_status:
                    await bus.publish(channel, {"type": "job_status", "status": new_status, "ts_server": time.time()})
                continue
            # unknown frame types are ignored on purpose

    finally:
        stop.set()
        heartbeat_task.cancel()
        try: await heartbeat_task
        except Exception: pass
        if ws.application_state == WebSocketState.CONNECTED:
            try: await ws.close()
            except Exception: pass
        log.info("ws.driver.disconnect driver=%s job=%s", driver_id, job_id)


# ---------------------------------------------------------------------------
# Customer WS — subscribes to the same channel via share-token auth
# ---------------------------------------------------------------------------

@router.websocket("/track/{job_id}")
async def ws_track_job(
    ws: WebSocket,
    job_id: str,
    t: str = Query(..., description="Share token from /send/track/{job_id}"),
):
    j = await _load_track_job(job_id, t)
    if not j:
        await ws.accept(); await ws.close(code=4404, reason="not_found"); return

    await ws.accept()
    bus = get_pubsub()
    channel = job_channel(job_id)
    stop = asyncio.Event()

    # 1. Immediate hello snapshot (mirrors the REST /send/track/{id} subset).
    try:
        await ws.send_json(await _driver_snapshot(j))
    except Exception:
        return

    heartbeat_task = asyncio.create_task(_server_heartbeat(ws, stop))
    log.info("ws.customer.connect job=%s", job_id)

    # 2. Bridge two independent streams into one send loop:
    #    a) subscription frames (location, job_status)
    #    b) client → server frames (pong, close)
    subscription = await bus.subscribe(channel)

    async def _forward_from_bus() -> None:
        try:
            async for frame in subscription:
                if ws.application_state != WebSocketState.CONNECTED: return
                try:
                    await ws.send_json(frame)
                except Exception:
                    return
        finally:
            stop.set()

    async def _drain_client() -> None:
        try:
            while True:
                try:
                    data = await asyncio.wait_for(ws.receive_json(), timeout=CLIENT_TIMEOUT_S)
                except asyncio.TimeoutError:
                    return
                except WebSocketDisconnect:
                    return
                except Exception:
                    return
                # We accept `pong` from customer for heartbeat symmetry.
                if (data or {}).get("type") == "pong": continue
        finally:
            stop.set()

    forward_task = asyncio.create_task(_forward_from_bus())
    drain_task   = asyncio.create_task(_drain_client())

    try:
        await stop.wait()
    finally:
        for tsk in (forward_task, drain_task, heartbeat_task):
            tsk.cancel()
        await subscription.close()
        for tsk in (forward_task, drain_task, heartbeat_task):
            try: await tsk
            except Exception: pass
        if ws.application_state == WebSocketState.CONNECTED:
            try: await ws.close()
            except Exception: pass
        log.info("ws.customer.disconnect job=%s", job_id)
