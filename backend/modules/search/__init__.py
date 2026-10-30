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
  can't block the response (per-provider soft timeout, 1.5 s default).
* The `search_intents` DB table drives action cards — not frontend
  strings — so Super Admin can add new intents without a redeploy.
* MART + SHOP use `unaccent` + `pg_trgm similarity()` so queries are
  prefix / substring / typo tolerant and ranked by actual relevance.
* FOOD delegates to `modules.food.search.search()` which already covers
  restaurants, dishes and cuisines.
* AUTO/IMMO providers are stub-registered so adding them later is a
  single-file change.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import time
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

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
        return {k: v for k, v in self.__dict__.items()
                if v not in (None, "", [], {}) or k in ("title",)}


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
# Scoring tiers (deterministic + typo-tolerant via pg_trgm):
#   1.00 — exact normalised-name match
#   0.95 — exact category/subcategory slug match
#   0.90 — prefix on name  (`"lai"` → "Lait Frais")
#   0.75 — all tokens appear in name (multi-token substring)
#   0.65 — token substring in name
#   0.55 — brand / category / subcategory / short_description match
#   0.30-0.50 — pg_trgm similarity() for typo tolerance

MART_SEARCH_SQL = """
WITH q AS (
    SELECT CAST(:q AS text) AS raw,
           regexp_replace(lower(unaccent(CAST(:q AS text))), '[^a-z0-9 ]+', ' ', 'g') AS norm
),
scored AS (
    SELECT
        p.id, p.name, p.brand, p.image, p.currency,
        p.category_slug, p.subcategory_slug,
        p.mrp,
        regexp_replace(lower(unaccent(p.name)),              '[^a-z0-9 ]+', ' ', 'g') AS n_name,
        regexp_replace(lower(unaccent(coalesce(p.brand,''))),             '[^a-z0-9 ]+', ' ', 'g') AS n_brand,
        regexp_replace(lower(unaccent(coalesce(p.short_description,''))), '[^a-z0-9 ]+', ' ', 'g') AS n_desc,
        regexp_replace(lower(unaccent(coalesce(p.category_slug,''))),     '[^a-z0-9 ]+', ' ', 'g') AS n_cat,
        regexp_replace(lower(unaccent(coalesce(p.subcategory_slug,''))),  '[^a-z0-9 ]+', ' ', 'g') AS n_sub,
        (SELECT norm FROM q) AS qn
      FROM mart_products p
     WHERE p.country = :cc
       AND p.status  = 'active'
)
SELECT id, name, brand, image, currency, category_slug, subcategory_slug, mrp,
       CASE
         WHEN n_name = qn                                         THEN 1.00
         WHEN n_cat  = qn OR n_sub = qn                           THEN 0.95
         WHEN n_name LIKE qn || '%'                               THEN 0.90
         WHEN n_name ~ ('(^| )' || qn)                            THEN 0.80
         WHEN n_name LIKE :multi                                  THEN 0.70
         WHEN n_name LIKE '%' || qn || '%'                        THEN 0.55
         WHEN n_brand LIKE '%' || qn || '%'
           OR n_cat   LIKE '%' || qn || '%'
           OR n_sub   LIKE '%' || qn || '%'                        THEN 0.50
         WHEN n_desc LIKE '%' || qn || '%'                        THEN 0.45
         ELSE GREATEST(similarity(n_name, qn), similarity(n_brand, qn))
       END AS score
  FROM scored
 WHERE n_name LIKE qn || '%'
    OR n_name ~ ('(^| )' || qn)
    OR n_brand LIKE '%' || qn || '%'
    OR n_cat   LIKE '%' || qn || '%'
    OR n_sub   LIKE '%' || qn || '%'
    OR (length(qn) >= 4 AND (
          n_name LIKE '%' || qn || '%'
       OR n_desc LIKE '%' || qn || '%'
    ))
    OR similarity(n_name, qn)  > :sim_floor
    OR similarity(n_brand, qn) > GREATEST(:sim_floor, 0.5)
 ORDER BY score DESC, name ASC
 LIMIT :lim
"""


class MartSearchProvider(SearchProvider):
    module = "mart"

    async def search(self, session, *, q, q_norm, country, limit):
        if not q_norm:
            return []
        cc = (country or "CI").upper()[:2]
        multi = _multi_pattern(q_norm)
        # Short queries (< 4 chars) must not pull in random trigram hits
        # like "brooms" for "lai". Only prefix/substring matches qualify.
        sim_floor = 0.42 if len(q_norm) >= 4 else 1.1
        try:
            rows = (await session.execute(text(MART_SEARCH_SQL),
                    {"q": q_norm, "multi": multi, "cc": cc, "lim": limit,
                     "sim_floor": sim_floor})).fetchall()
        except Exception as e:  # noqa: BLE001
            log.warning("mart search failed cc=%s q=%s err=%s", cc, q_norm, e)
            return []
        hits: List[SearchHit] = []
        for r in rows:
            price = float(r.mrp) if r.mrp is not None else None
            hits.append(SearchHit(
                module="mart", entity_type="product",
                title=r.name,
                subtitle=(r.brand or r.category_slug or "").title(),
                image=r.image,
                price=price,
                currency=r.currency,
                destination_url=f"/products/{r.id}",
                relevance=float(r.score or 0),
            ))
        return hits


# ---------------------------------------------------------------------------
# FOOD provider — delegates to the existing food.search module
# ---------------------------------------------------------------------------

class FoodSearchProvider(SearchProvider):
    module = "food"

    async def search(self, session, *, q, q_norm, country, limit):
        if not q_norm:
            return []
        try:
            from modules.food.search import search as food_search  # type: ignore
            data = await food_search(q=q, mode=None, country=country,
                                     limit=limit, session=session)
        except Exception as e:  # noqa: BLE001
            log.warning("food provider failed: %s", e)
            return []

        hits: List[SearchHit] = []
        # Restaurants
        for r in data.get("restaurants", []) or []:
            name = r.get("name") or ""
            n_name = normalise(name)
            score = (
                1.0 if n_name == q_norm else
                0.9 if n_name.startswith(q_norm) else
                0.75 if q_norm in n_name else
                0.6
            )
            hits.append(SearchHit(
                module="food", entity_type="restaurant",
                title=name,
                subtitle=", ".join(r.get("cuisines", []) or [])[:120],
                image=r.get("image") or r.get("hero_image"),
                rating=r.get("rating"),
                destination_url=f"/foodbaked/restaurants/{r.get('slug')}",
                relevance=score,
                meta={"cuisines": r.get("cuisines", [])},
            ))
        # Dishes
        for d in data.get("dishes", []) or []:
            name = d.get("name") or ""
            n_name = normalise(name)
            score = (
                0.85 if n_name.startswith(q_norm) else
                0.65 if q_norm in n_name else
                0.5
            )
            price = d.get("price") if d.get("price") is not None else d.get("base_price")
            hits.append(SearchHit(
                module="food", entity_type="dish",
                title=name,
                subtitle=d.get("restaurant_name") or "",
                image=d.get("image"),
                price=float(price) if price is not None else None,
                currency=d.get("currency"),
                destination_url=f"/foodbaked/restaurants/{d.get('restaurant_slug')}?item={d.get('id')}",
                relevance=score,
            ))
        # Cuisines (category-style)
        for c in data.get("cuisines", []) or []:
            n = int(c.get("restaurant_count") or 0)
            hits.append(SearchHit(
                module="food", entity_type="cuisine",
                title=(c.get("name") or "").title(),
                subtitle=(f"{n} restaurants" if n > 0 else ""),
                destination_url=f"/foodbaked/search?q={q}",
                relevance=0.55,
            ))
        return hits[:limit]


# ---------------------------------------------------------------------------
# SHOP provider
# ---------------------------------------------------------------------------
SHOP_PRODUCT_SQL = """
WITH q AS (
    SELECT regexp_replace(lower(unaccent(CAST(:q AS text))), '[^a-z0-9 ]+', ' ', 'g') AS norm
),
scored AS (
    SELECT
        p.id, p.slug, p.title, p.title_fr,
        (p.images->>0) AS hero_image,
        b.name AS brand_name,
        regexp_replace(lower(unaccent(p.title)),                       '[^a-z0-9 ]+', ' ', 'g') AS n_title,
        regexp_replace(lower(unaccent(coalesce(p.title_fr,''))),        '[^a-z0-9 ]+', ' ', 'g') AS n_title_fr,
        regexp_replace(lower(unaccent(coalesce(p.description,''))),     '[^a-z0-9 ]+', ' ', 'g') AS n_desc,
        regexp_replace(lower(unaccent(coalesce(p.description_fr,''))),  '[^a-z0-9 ]+', ' ', 'g') AS n_desc_fr,
        regexp_replace(lower(unaccent(coalesce(b.name,''))),            '[^a-z0-9 ]+', ' ', 'g') AS n_brand,
        (SELECT norm FROM q) AS qn
      FROM shop_products p
 LEFT JOIN shop_brands  b ON b.id = p.brand_id
     WHERE p.country = :cc
       AND p.status IN ('published','active')
       AND p.deleted_at IS NULL
)
SELECT id, slug, title, title_fr, hero_image, brand_name,
       CASE
         WHEN n_title    = qn OR n_title_fr = qn                 THEN 1.00
         WHEN n_title    LIKE qn || '%' OR n_title_fr LIKE qn || '%' THEN 0.90
         WHEN n_title    ~ ('(^| )' || qn)
           OR n_title_fr ~ ('(^| )' || qn)                        THEN 0.80
         WHEN n_title    LIKE :multi OR n_title_fr LIKE :multi     THEN 0.70
         WHEN n_title    LIKE '%'||qn||'%' OR n_title_fr LIKE '%'||qn||'%' THEN 0.55
         WHEN n_brand    LIKE '%'||qn||'%'                        THEN 0.50
         WHEN n_desc     LIKE '%'||qn||'%' OR n_desc_fr LIKE '%'||qn||'%' THEN 0.45
         ELSE GREATEST(similarity(n_title, qn), similarity(n_title_fr, qn), similarity(n_brand, qn))
       END AS score
  FROM scored
 WHERE n_title    LIKE qn || '%'
    OR n_title_fr LIKE qn || '%'
    OR n_title    ~ ('(^| )' || qn)
    OR n_title_fr ~ ('(^| )' || qn)
    OR n_brand    LIKE '%'||qn||'%'
    OR (length(qn) >= 4 AND (
          n_title    LIKE '%'||qn||'%'
       OR n_title_fr LIKE '%'||qn||'%'
       OR n_desc     LIKE '%'||qn||'%'
       OR n_desc_fr  LIKE '%'||qn||'%'
    ))
    OR similarity(n_title, qn)    > :sim_floor
    OR similarity(n_title_fr, qn) > :sim_floor
 ORDER BY score DESC, title ASC
 LIMIT :lim
"""


class ShopSearchProvider(SearchProvider):
    module = "shop"

    async def search(self, session, *, q, q_norm, country, limit):
        if not q_norm:
            return []
        cc = (country or "CI").upper()[:2]
        multi = _multi_pattern(q_norm)
        sim_floor = 0.42 if len(q_norm) >= 4 else 1.1
        hits: List[SearchHit] = []

        # Products
        try:
            prods = (await session.execute(text(SHOP_PRODUCT_SQL),
                    {"q": q_norm, "multi": multi, "cc": cc, "lim": limit,
                     "sim_floor": sim_floor})).fetchall()
            for r in prods:
                hits.append(SearchHit(
                    module="shop", entity_type="product",
                    title=r.title or r.title_fr or "",
                    subtitle=(r.brand_name or "").title(),
                    image=r.hero_image,
                    destination_url=f"/shop/p/{r.slug or r.id}",
                    relevance=float(r.score or 0),
                ))
        except Exception as e:  # noqa: BLE001
            log.warning("shop products search failed cc=%s q=%s err=%s", cc, q_norm, e)

        # Categories (FR + EN name)
        try:
            cats = (await session.execute(text("""
                SELECT id, slug, name_fr, name_en
                  FROM shop_categories
                 WHERE country = :cc
                   AND is_active = TRUE
                   AND (
                        regexp_replace(lower(unaccent(coalesce(name_fr,''))), '[^a-z0-9 ]+',' ','g') LIKE '%'||:q||'%'
                     OR regexp_replace(lower(unaccent(coalesce(name_en,''))), '[^a-z0-9 ]+',' ','g') LIKE '%'||:q||'%'
                   )
                 LIMIT 5
            """), {"cc": cc, "q": q_norm})).fetchall()
            for c in cats:
                hits.append(SearchHit(
                    module="shop", entity_type="category",
                    title=c.name_fr or c.name_en or c.slug,
                    subtitle="Catégorie",
                    destination_url=f"/shop/c/{c.slug}",
                    relevance=0.6,
                ))
        except Exception as e:  # noqa: BLE001
            log.debug("shop categories skipped: %s", e)

        # Brands
        try:
            brands = (await session.execute(text("""
                SELECT b.id, b.name, b.slug
                  FROM shop_brands b
                 WHERE regexp_replace(lower(unaccent(coalesce(b.name,''))), '[^a-z0-9 ]+',' ','g') LIKE '%'||:q||'%'
                 LIMIT 5
            """), {"q": q_norm})).fetchall()
            for b in brands:
                hits.append(SearchHit(
                    module="shop", entity_type="brand",
                    title=b.name,
                    subtitle="Marque",
                    destination_url=f"/shop?brand={b.slug or b.id}",
                    relevance=0.55,
                ))
        except Exception as e:  # noqa: BLE001
            log.debug("shop brands skipped: %s", e)

        # Sort merged list by relevance.
        hits.sort(key=lambda h: -h.relevance)
        return hits[:limit]


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
# Intent detection — substring + fuzzy on the normalised phrase list.
# ---------------------------------------------------------------------------

async def detect_intents(session: AsyncSession, q_norm: str, *, language: str) -> List[Dict[str, Any]]:
    """Return the active intent rows whose phrases match q_norm.

    Matching rules per phrase:
      * exact normalised match               — strongest
      * phrase ⊂ q_norm OR q_norm ⊂ phrase   — substring either direction
      * token overlap ≥ 60% + length ≥ 3 chars — handles word-order
      * trigram similarity ≥ 0.6 (typo tolerance via difflib — in-Python
        so we don't hit the DB for every row)

    Ordered by `weight DESC`; typically 0–2 cards shown at the top of
    the global dropdown / results page.
    """
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

    from difflib import SequenceMatcher
    q_tokens = set(q_norm.split())
    out: List[Dict[str, Any]] = []
    for r in rows:
        phrases = [normalise(p) for p in (r.phrases or [])]
        hit = False
        for p in phrases:
            if not p:
                continue
            if p == q_norm or p in q_norm or q_norm in p:
                hit = True
                break
            p_tokens = set(p.split())
            if q_tokens and p_tokens:
                overlap = len(q_tokens & p_tokens) / max(len(p_tokens), 1)
                if overlap >= 0.6 and len(q_norm) >= 3:
                    hit = True
                    break
            # Fuzzy — only invoke when lengths are close (cheap).
            if abs(len(p) - len(q_norm)) <= 3 and len(q_norm) >= 4:
                if SequenceMatcher(None, p, q_norm).ratio() >= 0.82:
                    hit = True
                    break
        if hit:
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

    # Build groups — hide empty modules per spec.
    groups: List[Dict[str, Any]] = []
    for p in wanted:
        hits = results_by_module.get(p.module, [])
        if not hits:
            continue
        # If this module has an intent card, bubble the module's entities up.
        intent_boost = 0.1 if any(i["module"] == p.module for i in intents) else 0.0
        groups.append({
            "module": p.module,
            "count": len(hits),
            "items": [h.to_dict() for h in hits],
            "_top_score": max((h.relevance for h in hits), default=0) + intent_boost,
        })
    # Rank groups by top-hit relevance so the "most relevant module" is first.
    groups.sort(key=lambda g: -g["_top_score"])
    for g in groups:
        g.pop("_top_score", None)

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
    if result_count == 0 and len(q_norm) >= 4:
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
