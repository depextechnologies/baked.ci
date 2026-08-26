"""SENDbakēd Driver realtime hub — per-driver WebSocket connections + a
`notify_driver()` helper the dispatch service uses to push job offers.

Design
------
* One process-local registry keyed by `driver_id`. Each driver can have at
  most one active WebSocket at a time; a reconnect from the same driver
  replaces the previous socket cleanly.
* All broadcasts are best-effort — if a socket is closed we drop the
  connection silently and the driver will pick up the state on next
  reconnect via GET /driver/me/offers/current (polling fallback).
* Kept intentionally tiny: this is the *transport* layer only. Dispatch
  business logic lives in modules/express/dispatch.py.
"""
from __future__ import annotations
import asyncio
import logging
from typing import Dict

from fastapi import WebSocket

log = logging.getLogger("baked.driver.realtime")

# driver_id → WebSocket. Access is single-threaded (asyncio) so no lock needed
# for reads/writes, but we hold a lock around register/unregister so a mid-flight
# reconnect can't leak an orphaned socket.
_connections: Dict[str, WebSocket] = {}
_lock = asyncio.Lock()


async def register(driver_id: str, ws: WebSocket) -> None:
    async with _lock:
        old = _connections.pop(driver_id, None)
        if old is not None:
            # Politely close the previous session so the driver doesn't see
            # duplicate offer events on both tabs.
            try: await old.close(code=4000, reason="replaced")
            except Exception: pass
        _connections[driver_id] = ws
    log.info("driver.ws register driver=%s total=%d", driver_id, len(_connections))


async def unregister(driver_id: str, ws: WebSocket) -> None:
    async with _lock:
        # Only pop if the current socket is the one being closed — protects
        # against a race where a fresh reconnect landed before the old socket's
        # cleanup ran.
        cur = _connections.get(driver_id)
        if cur is ws:
            _connections.pop(driver_id, None)
    log.info("driver.ws unregister driver=%s total=%d", driver_id, len(_connections))


def is_connected(driver_id: str) -> bool:
    return driver_id in _connections


async def notify_driver(driver_id: str, event: str, payload: dict) -> bool:
    """Push an event to a specific driver. Returns True on success."""
    ws = _connections.get(driver_id)
    if ws is None:
        return False
    try:
        await ws.send_json({"event": event, "payload": payload})
        return True
    except Exception as exc:  # noqa: BLE001 — socket dead, drop it silently
        log.info("driver.ws send_failed driver=%s err=%s", driver_id, exc.__class__.__name__)
        _connections.pop(driver_id, None)
        return False
