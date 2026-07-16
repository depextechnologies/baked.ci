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

from core.db import db
from core.deps import get_current_admin, get_optional_customer
from core.providers.ai_provider import get_ai_provider
from core.events import event_bus, Events
from core.models_base import _now_iso, new_id

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
async def ai_search(payload: SearchIn, customer: Optional[dict] = Depends(get_optional_customer)):
    """Natural language product search — returns structured filters + matched products."""
    provider = get_ai_provider()
    session_id = f"ai-search-{customer['id']}" if customer else f"ai-search-anon-{new_id()}"
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

    q = {"country": payload.country.upper(), "module": "mart", "deleted_at": None}
    if parsed.get("categories"):
        q["category_slug"] = {"$in": parsed["categories"]}
    kw = parsed.get("keywords") or []
    if kw:
        q["$or"] = [{"name": {"$regex": k, "$options": "i"}} for k in kw]
    if isinstance(parsed.get("max_price"), (int, float)):
        q["price"] = {"$lte": parsed["max_price"]}

    products = await db.mart_products.find(q, {"_id": 0}).limit(24).to_list(24)

    await event_bus.publish(Events.AI_REQUESTED, {
        "feature": "product_search",
        "query": payload.query,
        "customer_id": customer["id"] if customer else None,
    })
    await db.ai_executions.insert_one({
        "id": new_id("ai"),
        "feature": "product_search",
        "query": payload.query,
        "response": parsed,
        "matched_count": len(products),
        "customer_id": customer["id"] if customer else None,
        "created_at": _now_iso(),
    })

    return {"filters": parsed, "products": products}


INSIGHTS_SYSTEM = (
    "You are the BAKĒD Business Insights AI for platform administrators. Given a compact JSON of KPIs, "
    "return a JSON object with keys: \"headline\" (short punchy summary), \"insights\" (array of 3-5 short bullets), "
    "\"recommended_actions\" (array of 2-4 short imperative sentences). Return valid JSON only."
)


class InsightsIn(BaseModel):
    kpis: dict
    scope: str = "mart"


@router.post("/insights")
async def ai_insights(payload: InsightsIn, admin: dict = Depends(get_current_admin)):
    provider = get_ai_provider()
    session_id = f"ai-insights-{admin['id']}-{new_id()}"
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
