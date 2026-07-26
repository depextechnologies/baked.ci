"""FastAPI auth dependencies. Reads Bearer token OR session_token cookie (for Google Auth flow)."""
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import Customer, CustomerSession
from core.security import decode_token


async def _customer_from_session_cookie(session: AsyncSession, session_token: str) -> Optional[Customer]:
    row = (
        await session.execute(select(CustomerSession).where(CustomerSession.session_token == session_token))
    ).scalar_one_or_none()
    if not row:
        return None
    expires_at = row.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None
    return await session.get(Customer, row.customer_id)


async def get_current_customer(
    request: Request, session: AsyncSession = Depends(get_session)
) -> Customer:
    """Returns the current customer or raises 401. Checks Bearer JWT first, then cookie session."""
    auth = request.headers.get("Authorization") or ""
    token = auth.replace("Bearer ", "").strip() if auth.startswith("Bearer ") else None
    if token:
        try:
            payload = decode_token(token)
            customer = await session.get(Customer, payload["sub"])
            if customer:
                return customer
        except jwt.PyJWTError:
            pass

    session_token = request.cookies.get("session_token")
    if session_token:
        customer = await _customer_from_session_cookie(session, session_token)
        if customer:
            return customer

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


async def get_optional_customer(
    request: Request, session: AsyncSession = Depends(get_session)
) -> Optional[Customer]:
    try:
        return await get_current_customer(request, session)
    except HTTPException:
        return None


async def get_current_admin(customer: Customer = Depends(get_current_customer)) -> Customer:
    if customer.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return customer
