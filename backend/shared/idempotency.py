"""Idempotent order submission: the same client request id never creates two orders."""
import asyncio
import os
import time
from typing import Optional

_TTL = 24 * 3600
_mem: dict[str, tuple[float, str]] = {}
_redis = None


async def _client():
    global _redis
    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        return None
    if _redis is None:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(url, decode_responses=True)
    return _redis


def _key(customer_id: str, scope: str, request_id: str) -> str:
    return f"idem:{scope}:{customer_id}:{request_id[:80]}"


async def claim(customer_id: str, scope: str, request_id: Optional[str]) -> Optional[str]:
    """Returns an existing order id for a replayed request, or None after claiming the key.
    Raises RuntimeError('in_progress') when the same request is still being processed."""
    if not request_id:
        return None
    k = _key(customer_id, scope, request_id)
    r = await _client()
    if r is not None:
        try:
            for _ in range(20):
                if await r.set(k, "pending", nx=True, ex=120):
                    return None
                v = await r.get(k)
                if v and v != "pending":
                    return v
                await asyncio.sleep(0.5)
            raise RuntimeError("in_progress")
        except RuntimeError:
            raise
        except Exception:  # noqa: BLE001 — Redis hiccup → fall back to process memory
            pass
    now = time.time()
    hit = _mem.get(k)
    if hit and hit[0] > now and hit[1] != "pending":
        return hit[1]
    _mem[k] = (now + 120, "pending")
    return None


async def complete(customer_id: str, scope: str, request_id: Optional[str], order_id: str) -> None:
    if not request_id:
        return
    k = _key(customer_id, scope, request_id)
    _mem[k] = (time.time() + _TTL, order_id)
    r = await _client()
    if r is not None:
        try:
            await r.set(k, order_id, ex=_TTL)
        except Exception:  # noqa: BLE001
            pass


async def release(customer_id: str, scope: str, request_id: Optional[str]) -> None:
    """Free the key when the request failed, so a corrected retry can go through."""
    if not request_id:
        return
    k = _key(customer_id, scope, request_id)
    _mem.pop(k, None)
    r = await _client()
    if r is not None:
        try:
            if await r.get(k) == "pending":
                await r.delete(k)
        except Exception:  # noqa: BLE001
            pass
