"""In-memory per-IP sliding-window rate limiter.

Lightweight utility used by public endpoints where authenticated identity
isn't available and we still need to bound abuse (e.g., anonymous file
uploads on the seller-apply wizard).

⚠️  State lives *per-process*. This deployment runs `uvicorn --workers 4`,
so the effective ceiling per IP is roughly ``workers × limit`` — good
enough for anti-abuse (drops the attack from unlimited to a bounded rate
that our object-storage bill can absorb) but not a strict quota. Move
counters to a shared backend (Redis / DB) when we need exact enforcement
or horizontally scale beyond a single pod.

Usage:
    from core.utils.rate_limit import check_rate_limit
    from fastapi import Request

    @router.post("/uploads")
    async def upload(request: Request, ...):
        check_rate_limit(request, bucket="apply_uploads", limit=20, per_seconds=60)
        ...

Raises ``HTTPException(429, ...)`` when the caller exceeds the window.
"""
from __future__ import annotations
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import HTTPException, Request


# bucket → { ip → deque[timestamps] }
_buckets: Dict[str, Dict[str, Deque[float]]] = defaultdict(lambda: defaultdict(deque))


def _client_ip(request: Request) -> str:
    """Prefer the left-most ``X-Forwarded-For`` entry (real client behind
    the k8s ingress), fall back to the socket peer address. Trims to the
    first 45 characters so pathological headers can't bloat the map key."""
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        ip = xff.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return ip[:45]


def check_rate_limit(
    request: Request, *, bucket: str, limit: int, per_seconds: int,
) -> Tuple[str, int]:
    """Record one hit for ``(bucket, ip)``. Raise 429 when the count within
    the trailing ``per_seconds`` exceeds ``limit``.

    Returns ``(ip, remaining_hits)`` for logging/inspection.
    """
    now = time.time()
    ip = _client_ip(request)
    dq = _buckets[bucket][ip]
    threshold = now - per_seconds
    while dq and dq[0] < threshold:
        dq.popleft()
    if len(dq) >= limit:
        retry_after = max(1, int(per_seconds - (now - dq[0])))
        raise HTTPException(
            status_code=429,
            detail={
                "code": "rate_limited",
                "message": f"Too many requests — retry in {retry_after}s.",
                "retry_after_seconds": retry_after,
            },
            headers={"Retry-After": str(retry_after)},
        )
    dq.append(now)
    return ip, limit - len(dq)


def _clear_all_for_tests() -> None:
    """Test-only hook — resets every bucket. Never call in production."""
    _buckets.clear()
