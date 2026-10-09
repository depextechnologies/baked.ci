"""Partner Web Push dispatch.

The partner's phone / laptop subscribes once via `PushManager.subscribe()`
and we persist the resulting `PushSubscription` server-side. On every
new-order (and later: new-reservation, service-paused) event we POST a
VAPID-signed payload to the subscription's push service, which wakes the
Service Worker and shows a native notification — even when the partner's
browser tab is closed or the phone is locked.

VAPID key material:
    * VAPID_PUBLIC_KEY       — URL-safe base64 of the raw EC public key.
                               Served to the browser; the browser uses it
                               to tie each subscription to our origin so
                               push services only accept pushes signed by
                               our matching private key.
    * VAPID_PRIVATE_PEM_B64  — URL-safe base64 of the PKCS8 PEM. We decode
                               once at module load; the resulting bytes
                               feed into `webpush(vapid_private_key=...)`.
    * VAPID_SUBJECT          — mailto: identifier the push service uses to
                               contact us about abuse / revocation.

Dispatch is fire-and-forget from the HTTP request path: we offload each
push to `asyncio.create_task` so a slow push service never blocks the
customer's order confirmation.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Any, Iterable

from pywebpush import webpush, WebPushException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger("baked.push")

VAPID_PUBLIC_KEY  = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
VAPID_SUBJECT     = os.environ.get("VAPID_SUBJECT", "mailto:ops@baked.app").strip()

_private_pem_b64 = os.environ.get("VAPID_PRIVATE_PEM_B64", "").strip()
VAPID_PRIVATE_PEM: str | None = None
if _private_pem_b64:
    # base64url → bytes → str so pywebpush can hand it straight to py_vapid.
    pad = "=" * (-len(_private_pem_b64) % 4)
    VAPID_PRIVATE_PEM = base64.urlsafe_b64decode(_private_pem_b64 + pad).decode()


def is_configured() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_PEM)


async def save_subscription(session: AsyncSession, *, restaurant_id: str,
                             partner_id: str | None, subscription: dict,
                             user_agent: str | None) -> None:
    """Persist (or refresh) a subscription keyed by its endpoint URL.

    `subscription` is the JSON produced by `PushSubscription.toJSON()` in
    the browser — `{endpoint, keys: {p256dh, auth}}`. We flatten it into
    our columns and `ON CONFLICT DO UPDATE` so re-subscribing on the same
    device just refreshes `created_at`.
    """
    endpoint = (subscription or {}).get("endpoint")
    keys = (subscription or {}).get("keys") or {}
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")
    if not endpoint or not p256dh or not auth:
        raise ValueError("subscription payload missing endpoint/keys")

    await session.execute(text("""
        INSERT INTO partner_push_subscriptions
            (endpoint, restaurant_id, partner_id, p256dh, auth, user_agent)
        VALUES
            (:endpoint, :rid, :pid, :p256dh, :auth, :ua)
        ON CONFLICT (endpoint) DO UPDATE SET
            restaurant_id = EXCLUDED.restaurant_id,
            partner_id    = EXCLUDED.partner_id,
            p256dh        = EXCLUDED.p256dh,
            auth          = EXCLUDED.auth,
            user_agent    = EXCLUDED.user_agent,
            created_at    = now()
    """), {"endpoint": endpoint, "rid": restaurant_id, "pid": partner_id,
            "p256dh": p256dh, "auth": auth, "ua": user_agent or ""})
    await session.commit()


async def delete_subscription(session: AsyncSession, endpoint: str) -> None:
    await session.execute(text(
        "DELETE FROM partner_push_subscriptions WHERE endpoint = :e"
    ), {"e": endpoint})
    await session.commit()


async def _subscriptions_for_restaurant(session: AsyncSession, rid: str) -> list[dict]:
    rows = (await session.execute(text("""
        SELECT endpoint, p256dh, auth
          FROM partner_push_subscriptions
         WHERE restaurant_id = :rid
    """), {"rid": rid})).fetchall()
    return [{"endpoint": r.endpoint, "keys": {"p256dh": r.p256dh, "auth": r.auth}}
            for r in rows]


def _send_one(subscription_info: dict, payload: dict) -> int:
    """Blocking webpush call — runs inside a thread to keep the event loop free.
    Returns the HTTP status, or raises WebPushException."""
    resp = webpush(
        subscription_info=subscription_info,
        data=json.dumps(payload),
        vapid_private_key=VAPID_PRIVATE_PEM,
        vapid_claims={"sub": VAPID_SUBJECT},
        ttl=60,  # short — if the device is offline > 1 min, the WS catch-up handles it.
    )
    return getattr(resp, "status_code", 201)


async def _dispatch_to_restaurant(
    session_factory, rid: str, payload: dict,
) -> dict[str, int]:
    """Dispatch `payload` to every subscription registered for `rid`.

    Prunes revoked endpoints (HTTP 404/410) so a dead device stops costing
    us bandwidth. Returns a `{sent, pruned, failed}` summary (used only by
    tests — production callers fire-and-forget).
    """
    if not is_configured():
        log.debug("push dispatch skipped — VAPID keys not configured")
        return {"sent": 0, "pruned": 0, "failed": 0, "skipped": True}

    async with session_factory() as sess:
        subs = await _subscriptions_for_restaurant(sess, rid)
    if not subs:
        return {"sent": 0, "pruned": 0, "failed": 0}

    loop = asyncio.get_running_loop()
    sent = pruned = failed = 0
    revoked: list[str] = []
    for sub in subs:
        try:
            await loop.run_in_executor(None, _send_one, sub, payload)
            sent += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                revoked.append(sub["endpoint"])
                pruned += 1
            else:
                log.warning("webpush failed status=%s endpoint=%s err=%s",
                             status, sub["endpoint"][:60], e)
                failed += 1
        except Exception as e:  # noqa: BLE001
            log.warning("webpush unexpected error endpoint=%s err=%s",
                         sub["endpoint"][:60], e)
            failed += 1

    if revoked:
        async with session_factory() as sess:
            await sess.execute(text(
                "DELETE FROM partner_push_subscriptions WHERE endpoint = ANY(:eps)"
            ), {"eps": revoked})
            await sess.commit()

    if sent:
        async with session_factory() as sess:
            await sess.execute(text("""
                UPDATE partner_push_subscriptions
                   SET last_notified_at = now()
                 WHERE restaurant_id = :rid
            """), {"rid": rid})
            await sess.commit()

    return {"sent": sent, "pruned": pruned, "failed": failed}


def fire_and_forget(session_factory, rid: str, payload: dict) -> asyncio.Task | None:
    """Schedule a push dispatch without awaiting it.

    Call this from inside a request handler — the HTTP response goes out
    while the push fan-out runs on the background task loop. Returns the
    created `asyncio.Task` so callers (tests) can await when needed.
    """
    if not is_configured():
        return None
    try:
        return asyncio.create_task(_dispatch_to_restaurant(session_factory, rid, payload))
    except RuntimeError:
        # No running loop (e.g. called from a sync context in tests).
        return None


# Payload helpers — keep the structure flat so the Service Worker can map
# each push to a `showNotification()` call with one lookup.

def new_order_payload(order: dict) -> dict:
    item_count = sum(int(i.get("quantity") or 1) for i in order.get("items", []))
    cust_name = (order.get("customer_snapshot") or {}).get("name") or "Nouveau client"
    return {
        "type":   "food.order.created",
        "title":  f"🔔 Nouvelle commande · {order.get('order_number') or order.get('id')}",
        "body":   f"{cust_name} · {item_count} article{'s' if item_count != 1 else ''} · "
                  f"{order.get('grand_total', '')} {order.get('currency', '')}",
        "tag":    f"food-order-{order.get('id')}",
        "url":    "/partner/food/orders",
        "entity_id": order.get("id"),
    }


def new_reservation_payload(res: dict) -> dict:
    return {
        "type":   "food.reservation.created",
        "title":  f"📅 Nouvelle réservation · {res.get('customer_name') or ''}".strip(),
        "body":   f"{res.get('party_size', '?')} couverts · {res.get('reservation_time', '')}",
        "tag":    f"food-res-{res.get('id')}",
        "url":    "/partner/food/reservations/bookings",
        "entity_id": res.get("id"),
    }
