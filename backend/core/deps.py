"""FastAPI auth dependencies. Reads Bearer token OR session_token cookie (for Google Auth flow)."""
from typing import Optional
from fastapi import Request, HTTPException, status
from datetime import datetime, timezone
import jwt

from core.db import db
from core.security import decode_token


async def _customer_from_session_cookie(session_token: str) -> Optional[dict]:
    session = await db.customer_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None
    return await db.customers.find_one({"id": session["customer_id"]}, {"_id": 0})


async def get_current_customer(request: Request) -> dict:
    """Returns the current customer or raises 401. Checks Bearer JWT first, then cookie session."""
    auth = request.headers.get("Authorization") or ""
    token = auth.replace("Bearer ", "").strip() if auth.startswith("Bearer ") else None
    if token:
        try:
            payload = decode_token(token)
            customer = await db.customers.find_one({"id": payload["sub"]}, {"_id": 0})
            if customer:
                return customer
        except jwt.PyJWTError:
            pass

    session_token = request.cookies.get("session_token")
    if session_token:
        customer = await _customer_from_session_cookie(session_token)
        if customer:
            return customer

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


async def get_optional_customer(request: Request) -> Optional[dict]:
    try:
        return await get_current_customer(request)
    except HTTPException:
        return None


async def get_current_admin(request: Request) -> dict:
    customer = await get_current_customer(request)
    role = customer.get("role", "customer")
    if role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return customer
