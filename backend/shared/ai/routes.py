"""Shared AI service.

- POST /ai/search       — customer-facing NL grocery search → structured filters + matched products
- POST /ai/insights     — admin-facing sales-narrative insight

Provider is abstracted (see core/providers/ai_provider.py). Uses Emergent Universal LLM key + Claude Sonnet 4.6.
"""
from __future__ import annotations
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_admin, get_optional_customer
from core.models import AiExecution, Customer, MartProduct, new_id
from core.providers.ai_provider import get_ai_provider
from core.events import event_bus, Events
from core.serializers import row_to_dict

router = APIRouter(prefix="/ai", tags=["ai"])


class SearchIn(BaseModel):
    query: str
    country: str = "CI"
    module: str = "mart"


SEARCH_SYSTEM = (
    "You are the BAKĒD AI product search assistant for MARTbakēd, a grocery marketplace in Côte d'Ivoire. "
    "The customer speaks French or English. Given a shopping query, return ONLY a compact JSON object with keys: "
    "\"intent\" (one of: browse, buy, compare, recipe), "
    "\"categories\" (array of category slugs from: fruits-vegetables, dairy-eggs, snacks, beverages, bakery, household, meat-seafood, personal-care), "
    "\"keywords\" (array of 1-5 product keywords), "
    "\"max_price\" (number or null in XOF), "
    "\"summary\" (one friendly sentence, in the same language as the query, max 20 words). "
    "Return valid JSON only, no markdown fences."
)


@router.post("/search")
async def ai_search(
    payload: SearchIn,
    customer: Optional[Customer] = Depends(get_optional_customer),
    session: AsyncSession = Depends(get_session),
):
    """Natural language product search — returns structured filters + matched products."""
    provider = get_ai_provider()
    session_id = f"ai-search-{customer.id}" if customer else f"ai-search-anon-{new_id()}"
    try:
        raw = await provider.complete(SEARCH_SYSTEM, payload.query, session_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI provider error: {e}") from e

    parsed: dict = {}
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        parsed = json.loads(text)
    except Exception:
        parsed = {"intent": "browse", "categories": [], "keywords": [payload.query], "max_price": None, "summary": raw[:120]}

    stmt = select(MartProduct).where(
        MartProduct.country == payload.country.upper(), MartProduct.module == "mart", MartProduct.deleted_at.is_(None)
    )
    if parsed.get("categories"):
        stmt = stmt.where(MartProduct.category_slug.in_(parsed["categories"]))
    keywords = parsed.get("keywords") or []
    if keywords:
        stmt = stmt.where(or_(*(MartProduct.name.ilike(f"%{k}%") for k in keywords)))
    if isinstance(parsed.get("max_price"), (int, float)):
        stmt = stmt.where(MartProduct.price <= parsed["max_price"])

    products = (await session.execute(stmt.limit(24))).scalars().all()

    await event_bus.publish(Events.AI_REQUESTED, {
        "feature": "product_search",
        "query": payload.query,
        "customer_id": customer.id if customer else None,
    })
    session.add(
        AiExecution(
            feature="product_search",
            query=payload.query,
            response=parsed,
            matched_count=len(products),
            customer_id=customer.id if customer else None,
        )
    )
    await session.commit()

    return {"filters": parsed, "products": [row_to_dict(p) for p in products]}


INSIGHTS_SYSTEM = (
    "You are the BAKĒD Business Insights AI for platform administrators. Given a compact JSON of KPIs, "
    "return a JSON object with keys: \"headline\" (short punchy summary), \"insights\" (array of 3-5 short bullets), "
    "\"recommended_actions\" (array of 2-4 short imperative sentences). Return valid JSON only."
)


class InsightsIn(BaseModel):
    kpis: dict
    scope: str = "mart"


@router.post("/insights")
async def ai_insights(payload: InsightsIn, admin: Customer = Depends(get_current_admin)):
    provider = get_ai_provider()
    session_id = f"ai-insights-{admin.id}-{new_id()}"
    raw = await provider.complete(INSIGHTS_SYSTEM, json.dumps(payload.model_dump()), session_id)
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        parsed = json.loads(text)
    except Exception:
        parsed = {"headline": raw[:120], "insights": [], "recommended_actions": []}
    return parsed
