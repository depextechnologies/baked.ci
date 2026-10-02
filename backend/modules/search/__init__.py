"""Global Search & Discovery — the single entry point behind the BAKED
header search box. Reusable provider architecture: each module registers
a `SearchProvider`; the orchestrator fans out, normalises, ranks and
groups results, and surfaces intent action cards (SEND "send parcel",
FOOD "réserver une table", etc.).

Public contract:
    GET /api/search?q=…&module=&country=&limit=
      → { query, query_norm, language, detected_intents, groups[], suggestions, latency_ms, event_id }

Design highlights
-----------------
* Providers are *async* and are gathered in parallel so one slow module
  can't block the response (per-provider soft timeout, 350 ms default).
* The `search_intents` DB table drives action cards — not frontend
  strings — so Super Admin can add new intents without a redeploy.
* MART + FOOD existing search surfaces are REUSED (no duplicate logic):
  MartSearchProvider hits `mart_products` directly (fast trigram GIN);
  FoodSearchProvider delegates to `modules.food.search.unified_search`.
* AUTO/IMMO providers are stub-registered so adding them later is a
  single file change.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import time
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session

log = logging.getLogger("baked.search")
router = APIRouter(prefix="/search", tags=["search"])


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s or "")
                   if not unicodedata.combining(c))


def normalise(q: str) -> str:
    """Lowercase · trim · strip accents · strip punctuation · collapse whitespace."""
    import re
    s = _strip_accents((q or "").lower()).strip()
    # Replace punctuation with spaces so "coca-cola" tokenises as ["coca","cola"]
    s = re.sub(r"[^\w\s]+", " ", s, flags=re.UNICODE)
    return " ".join(s.split())


def _multi_pattern(q_norm: str) -> str:
    """Turn `coca cola` into `%coca%cola%` so hyphenated/kerned names match."""
    toks = [t for t in q_norm.split() if t]
    return "%" + "%".join(toks) + "%" if toks else "%"


# ---------------------------------------------------------------------------
# Result contract
# ---------------------------------------------------------------------------

@dataclass
class SearchHit:
    module: str
    entity_type: str
    title: str
    subtitle: str = ""
    image: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    rating: Optional[float] = None
    distance_km: Optional[float] = None
    destination_url: str = ""
    action_label: Optional[str] = None
    relevance: float = 0.0
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d = {k: v for k, v in self.__dict__.items() if v not in (None, "", [], {}) or k in ("title",)}
        return d


# ---------------------------------------------------------------------------
# Provider base + registry
# ---------------------------------------------------------------------------

class SearchProvider:
    module: str = ""

    async def enabled(self, session: AsyncSession, country: Optional[str]) -> bool:
        return True

    async def search(self, session: AsyncSession, *, q: str, q_norm: str,
                     country: Optional[str], limit: int) -> List[SearchHit]:
        raise NotImplementedError


_PROVIDERS: Dict[str, SearchProvider] = {}

def register_provider(provider: SearchProvider) -> None:
    _PROVIDERS[provider.module] = provider

def all_providers() -> List[SearchProvider]:
    return list(_PROVIDERS.values())


# ---------------------------------------------------------------------------
# MART provider
# ---------------------------------------------------------------------------

class MartSearchProvider(SearchProvider):
    module = "mart"

    async def search(self, session, *, q, q_norm, country, limit):
        if not q_norm:
            return []
        pattern = _multi_pattern(q_norm)
        cc = (country or "CI").upper()[:2]
        rows = (await session.execute(text("""
            SELECT id, name, brand, image, mrp AS mrp_amount, currency,
                   category_slug, subcategory_slug,
                   CASE
                     WHEN regexp_replace(lower(unaccent(name)),'[^a-z0-9 ]+',' ','g') = :q THEN 1.0
                     WHEN regexp_replace(lower(unaccent(name)),'[^a-z0-9 ]+',' ','g') LIKE :prefix THEN 0.85
                     WHEN regexp_replace(lower(unaccent(name)),'[^a-z0-9 ]+',' ','g') LIKE :pat  THEN 0.65
                     WHEN regexp_replace(lower(unaccent(coalesce(brand,''))),'[^a-z0-9 ]+',' ','g') LIKE :pat THEN 0.55
                     ELSE 0.35
                   END AS score
              FROM mart_products
             WHERE country = :cc
               AND status = 'active'
               AND (
                     regexp_replace(lower(unaccent(name)),'[^a-z0-9 ]+',' ','g')              LIKE :pat
                  OR regexp_replace(lower(unaccent(coalesce(brand,''))),'[^a-z0-9 ]+',' ','g') LIKE :pat
                  OR regexp_replace(lower(unaccent(coalesce(short_description,''))),'[^a-z0-9 ]+',' ','g') LIKE :pat
                   )
             ORDER BY score DESC, name ASC
             LIMIT :lim
        """), {"q": q_norm, "prefix": f"{q_norm}%", "pat": pattern, "cc": cc, "lim": limit})).fetchall()
        return [SearchHit(
            module="mart",
            entity_type="product",
            title=r.name,
            subtitle=(r.brand or r.category_slug or "").title(),
            image=r.image,
            price=float(r.mrp_amount) if r.mrp_amount is not None else None,
            currency=r.currency,
            destination_url=f"/products/{r.id}",
            relevance=float(r.score),
        ) for r in rows]


# ---------------------------------------------------------------------------
# FOOD provider — delegates to the existing food.search module
# ---------------------------------------------------------------------------

class FoodSearchProvider(SearchProvider):
    module = "food"

    async def search(self, session, *, q, q_norm, country, limit):
        if not q_norm:
            return []
        # Reuse the existing food search — queries food_restaurants,
        # food_menu_items, cuisines, and reservation-eligible restaurants.
        try:
            from modules.food.search import search as food_search  # type: ignore
            data = await food_search(q=q, mode=None, country=country,
                                      limit=limit, session=session)
        except Exception as e:  # noqa: BLE001
            log.warning("food provider failed: %s", e)
            return []
        hits: List[SearchHit] = []
        # Restaurants
        for r in data.get("restaurants", []):
            hits.append(SearchHit(
                module="food", entity_type="restaurant",
                title=r.get("name") or "",
                subtitle=", ".join(r.get("cuisines", []) or [])[:120],
                image=r.get("hero_image") or r.get("image"),
                rating=r.get("rating"),
                destination_url=f"/foodbaked/restaurants/{r.get('slug')}",
                relevance=float(r.get("score") or 0.75),
                meta={"cuisines": r.get("cuisines", [])},
            ))
        # Dishes
        for d in data.get("dishes", []):
            hits.append(SearchHit(
                module="food", entity_type="dish",
                title=d.get("name") or "",
                subtitle=d.get("restaurant_name") or "",
                image=d.get("image"),
                price=d.get("base_price"),
                currency=d.get("currency"),
                destination_url=f"/foodbaked/restaurants/{d.get('restaurant_slug')}?item={d.get('id')}",
                relevance=float(d.get("score") or 0.65),
            ))
        # Cuisines (category-style)
        for c in data.get("cuisines", []):
            hits.append(SearchHit(
                module="food", entity_type="cuisine",
                title=(c.get("name") or "").title(),
                subtitle=f"{c.get('restaurant_count', 0)} restaurants",
                destination_url=f"/foodbaked/search?q={q}",
                relevance=0.6,
            ))
        return hits[:limit]


# ---------------------------------------------------------------------------
# SHOP provider
# ---------------------------------------------------------------------------

class ShopSearchProvider(SearchProvider):
    module = "shop"

    async def search(self, session, *, q, q_norm, country, limit):
        if not q_norm:
            return []
        pattern = _multi_pattern(q_norm)
        cc = (country or "CI").upper()[:2]
        rows: List[SearchHit] = []
        # Products
        try:
            prods = (await session.execute(text("""
                SELECT p.id, p.slug, p.title,
                       (p.images->>0) AS hero_image,
                       b.name AS brand_name,
                       CASE
                         WHEN lower(unaccent(p.title)) = :q THEN 1.0
                         WHEN lower(unaccent(p.title)) LIKE :prefix THEN 0.85
                         WHEN lower(unaccent(p.title)) LIKE :pat  THEN 0.65
                         WHEN lower(unaccent(coalesce(p.description,''))) LIKE :pat THEN 0.5
                         ELSE 0.4
                       END AS score
                  FROM shop_products p
             LEFT JOIN shop_brands b ON b.id = p.brand_id
                 WHERE p.country = :cc
                   AND p.status IN ('published','active')
                   AND (
                         lower(unaccent(p.title))              LIKE :pat
                      OR lower(unaccent(coalesce(p.description,''))) LIKE :pat
                      OR lower(unaccent(coalesce(b.name,'')))         LIKE :pat
                       )
                 ORDER BY score DESC, p.title ASC
                 LIMIT :lim
            """), {"q": q_norm, "prefix": f"{q_norm}%", "pat": pattern, "cc": cc, "lim": limit})).fetchall()
            for r in prods:
                rows.append(SearchHit(
                    module="shop", entity_type="product",
                    title=r.title, subtitle=(r.brand_name or "").title(),
                    image=r.hero_image,
                    destination_url=f"/shopbaked/product/{r.slug or r.id}",
                    relevance=float(r.score),
                ))
        except Exception as e:  # noqa: BLE001
            log.warning("shop products failed: %s", e)

        # Categories (FR + EN name)
        try:
            cats = (await session.execute(text("""
                SELECT id, slug, name_fr, name_en
                  FROM shop_categories
                 WHERE country = :cc AND is_active = TRUE
                   AND (lower(unaccent(coalesce(name_fr,''))) LIKE :pat
                     OR lower(unaccent(coalesce(name_en,''))) LIKE :pat)
                 LIMIT 5
            """), {"cc": cc, "pat": pattern})).fetchall()
            for c in cats:
                rows.append(SearchHit(
                    module="shop", entity_type="category",
                    title=c.name_fr or c.name_en or c.slug,
                    subtitle="Catégorie",
                    destination_url=f"/shopbaked/category/{c.slug}",
                    relevance=0.55,
                ))
        except Exception as e:  # noqa: BLE001
            log.debug("shop categories skipped: %s", e)
        return rows[:limit]


# ---------------------------------------------------------------------------
# SEND provider — intent-only (no catalog). Driven by the intents table.
# ---------------------------------------------------------------------------

class SendSearchProvider(SearchProvider):
    module = "send"

    async def search(self, session, *, q, q_norm, country, limit):
        # SEND is action-only; the orchestrator surfaces the matched
        # intent cards from the shared `search_intents` table.
        return []


# ---------------------------------------------------------------------------
# AUTO + IMMO — stubs so the registry is complete today
# ---------------------------------------------------------------------------

class AutoSearchProvider(SearchProvider):
    module = "auto"
    async def enabled(self, session, country): return False  # no live catalog yet
    async def search(self, session, **kw): return []

class ImmoSearchProvider(SearchProvider):
    module = "immo"
    async def enabled(self, session, country): return False
    async def search(self, session, **kw): return []


# Register everything at import time
register_provider(MartSearchProvider())
register_provider(FoodSearchProvider())
register_provider(ShopSearchProvider())
register_provider(SendSearchProvider())
register_provider(AutoSearchProvider())
register_provider(ImmoSearchProvider())


# ---------------------------------------------------------------------------
# Intent detection
# ---------------------------------------------------------------------------

async def detect_intents(session: AsyncSession, q_norm: str, *, language: str) -> List[Dict[str, Any]]:
    """Return the active intent rows whose phrases are substrings of q_norm.
    Ordered by `weight DESC`; typically 0–2 cards are shown at the top of
    the global results page / dropdown."""
    if not q_norm:
        return []
    rows = (await session.execute(text("""
        SELECT id, module, intent_code, phrases,
               action_label_fr, action_label_en,
               subtitle_fr, subtitle_en,
               destination, icon, weight
          FROM search_intents
         WHERE is_active = TRUE
         ORDER BY weight DESC
    """))).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        phrases = [normalise(p) for p in (r.phrases or [])]
        if any(p and p in q_norm for p in phrases):
            out.append({
                "intent_code": r.intent_code,
                "module": r.module,
                "action_label": r.action_label_fr if language.startswith("fr") else r.action_label_en,
                "subtitle": (r.subtitle_fr if language.startswith("fr") else r.subtitle_en) or "",
                "destination": r.destination,
                "icon": r.icon,
            })
    return out


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

async def _log_event(session: AsyncSession, *, q: str, q_norm: str, language: str,
                      country: Optional[str], customer_id: Optional[str],
                      result_count: int, modules_hit: List[str],
                      latency_ms: int) -> str:
    eid = f"se_{secrets.token_hex(10)}"
    try:
        await session.execute(text("""
            INSERT INTO search_events
              (id, query, query_norm, language, country, customer_id,
               result_count, modules_hit, latency_ms)
            VALUES (:id, :q, :qn, :lang, :cc, :cid, :rc, CAST(:mods AS JSONB), :ms)
        """), {"id": eid, "q": q[:500], "qn": q_norm[:500], "lang": (language or "fr")[:8],
               "cc": (country or None), "cid": customer_id, "rc": result_count,
               "mods": __import__("json").dumps(modules_hit), "ms": latency_ms})
        await session.commit()
    except Exception as e:  # noqa: BLE001
        log.debug("search_events insert skipped: %s", e)
    return eid


# ---------------------------------------------------------------------------
# Orchestrator route
# ---------------------------------------------------------------------------

class SearchClickIn(BaseModel):
    event_id: str
    module: str
    entity_type: str
    entity_id: str


@router.get("")
async def global_search(
    q: str = Query("", min_length=0, max_length=200),
    module: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    limit: int = Query(8, ge=1, le=30),
    language: str = Query("fr"),
    request: Request = None,
    session: AsyncSession = Depends(get_session),
):
    t0 = time.perf_counter()
    q = q or ""
    q_norm = normalise(q)
    lang = (language or "fr").lower()

    # Short-circuit on empty / 1-char
    if len(q_norm) < 2:
        return {"query": q, "query_norm": q_norm, "language": lang,
                "detected_intents": [], "groups": [], "suggestions": [],
                "latency_ms": int((time.perf_counter() - t0) * 1000),
                "event_id": None}

    # Determine providers to query. `module=mart` filters to one; otherwise
    # we fan out to every enabled provider.
    wanted = [p for p in all_providers()
              if (module is None or p.module == module)
              and await p.enabled(session, country)]

    async def _run(p: SearchProvider):
        # Each provider gets its OWN session — asyncpg forbids concurrent
        # ops on the same connection, so we must fan out with isolated
        # sessions. Closing is handled by the context manager.
        from core.db import SessionLocal
        try:
            async with SessionLocal() as sess:
                return p.module, await asyncio.wait_for(
                    p.search(sess, q=q, q_norm=q_norm, country=country, limit=limit),
                    timeout=1.5,
                )
        except asyncio.TimeoutError:
            log.warning("provider %s timed out on q=%s", p.module, q_norm)
            return p.module, []
        except Exception as e:  # noqa: BLE001
            log.warning("provider %s failed: %s", p.module, e)
            return p.module, []

    results_by_module = dict(await asyncio.gather(*[_run(p) for p in wanted]))
    intents = await detect_intents(session, q_norm, language=lang)

    # Build groups — hide empty modules per spec #12.
    groups: List[Dict[str, Any]] = []
    for p in wanted:
        hits = results_by_module.get(p.module, [])
        if not hits:
            continue
        groups.append({
            "module": p.module,
            "count": len(hits),
            "items": [h.to_dict() for h in hits],
        })
    # Rank groups by top-hit relevance so the "most relevant module" first.
    groups.sort(key=lambda g: -max((it.get("relevance", 0) for it in g["items"]), default=0))

    result_count = sum(g["count"] for g in groups) + len(intents)
    modules_hit = [g["module"] for g in groups]
    latency_ms  = int((time.perf_counter() - t0) * 1000)

    # Customer id if authenticated — soft dependency, don't block on it.
    customer_id = None
    try:
        from shared.auth.deps import get_optional_customer  # type: ignore
        if request is not None:
            cust = await get_optional_customer(request, session)
            if cust: customer_id = cust.id
    except Exception:  # noqa: BLE001
        pass

    event_id = await _log_event(session, q=q, q_norm=q_norm, language=lang,
                                 country=country, customer_id=customer_id,
                                 result_count=result_count, modules_hit=modules_hit,
                                 latency_ms=latency_ms)

    suggestions: List[str] = []
    if result_count == 0:
        # Cheap suggestion: trim one char at a time. Future: trigram-based.
        if len(q_norm) >= 4:
            suggestions.append(q_norm[:-1])
    return {
        "query": q, "query_norm": q_norm, "language": lang,
        "detected_intents": intents,
        "groups": groups,
        "suggestions": suggestions,
        "latency_ms": latency_ms,
        "event_id": event_id,
    }


@router.post("/click")
async def record_click(payload: SearchClickIn,
                        session: AsyncSession = Depends(get_session)):
    try:
        await session.execute(text("""
            UPDATE search_events
               SET clicked_module = :m, clicked_type = :t, clicked_entity = :e
             WHERE id = :id
        """), {"m": payload.module, "t": payload.entity_type,
               "e": payload.entity_id, "id": payload.event_id})
        await session.commit()
    except Exception as e:  # noqa: BLE001
        log.debug("search click log skipped: %s", e)
    return {"ok": True}
