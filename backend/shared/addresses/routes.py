"""Global Address service — serviceability, recent searches, and Google Places
proxying utilities. Shared by every BAKĒD business module.

- Serviceability is computed as: is the target lat/lng within `service_radius_km`
  of any active hub (mart_stores) in the same country?
- Recent searches are stored per-customer server-side. Guests use localStorage.
"""
from __future__ import annotations
import math
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer
from core.i18n import t as _t, current_lang
from core.models import Country, Customer, MartStore, RecentAddressSearch
from core.serializers import row_to_dict

router = APIRouter(prefix="/addresses", tags=["addresses"])


# ---------- serviceability ----------

# India pincode allowlist — Noida + Greater Noida (201301–201318) for the
# NCR pilot. Any address with a matching postal code short-circuits the
# hub-distance check so QA can test the Delhi NCR flow before real hubs
# are seeded. See docs/prompts/India_Location.txt (follow-up: "allow all
# noida and greater noida pin codes").
IN_PINCODE_ALLOWLIST = {f"{p}" for p in range(201301, 201319)}


def _matches_country_pincode_allowlist(country: str, postal_code: Optional[str]) -> bool:
    if not postal_code:
        return False
    pc = postal_code.strip()
    if country == "IN":
        return pc in IN_PINCODE_ALLOWLIST
    return False


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in kilometres."""
    R = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@router.get("/serviceability")
async def check_serviceability(
    lat: float = Query(..., description="Latitude of the address"),
    lng: float = Query(..., description="Longitude of the address"),
    country: str = Query("CI", description="ISO country code (CI, IN)"),
    postal_code: Optional[str] = Query(None, description="Postal / PIN code (used for country-level allowlists)"),
    session: AsyncSession = Depends(get_session),
):
    """Return whether BAKĒD delivers to a given coordinate.

    Countries can either be hub-radius-based (default: address must sit
    within `service_radius_km` of an active hub) or pincode-allowlist-based
    (bypasses hub geometry entirely — India NCR uses this today for the
    Noida + Greater Noida pilot).

    Response shape:
      { serviceable: bool, distance_km, nearest_hub, radius_km, message }
    """
    code = (country or "CI").upper()

    # Country-level pincode allowlist bypass (used by IN NCR pilot).
    if _matches_country_pincode_allowlist(code, postal_code):
        return {
            "serviceable": True,
            "distance_km": None,
            "nearest_hub": None,
            "radius_km": None,
            "country": code,
            "postal_code": (postal_code or "").strip(),
            "match": "pincode_allowlist",
            "message": "You're within our delivery zone (Delhi NCR pilot).",
        }

    country_row = (
        await session.execute(select(Country).where(Country.code == code, Country.active.is_(True)))
    ).scalar_one_or_none()
    if not country_row:
        return {
            "serviceable": False,
            "distance_km": None,
            "nearest_hub": None,
            "radius_km": None,
            "message": "We're not delivering here yet, but we're expanding soon.",
        }
    radius_km = float(country_row.service_radius_km or 15)

    hubs = (
        (
            await session.execute(
                select(MartStore).where(
                    MartStore.country == code, MartStore.deleted_at.is_(None), MartStore.active.isnot(False)
                )
            )
        )
        .scalars()
        .all()
    )

    nearest = None
    best_dist = None
    for h in hubs:
        hl, hn = h.latitude, h.longitude
        if hl is None or hn is None:
            continue
        d = _haversine_km(lat, lng, float(hl), float(hn))
        if best_dist is None or d < best_dist:
            best_dist = d
            nearest = {"id": h.id, "name": h.name, "address": h.address, "latitude": float(hl), "longitude": float(hn), "distance_km": round(d, 2)}

    serviceable = bool(nearest and best_dist is not None and best_dist <= radius_km)
    return {
        "serviceable": serviceable,
        "distance_km": round(best_dist, 2) if best_dist is not None else None,
        "nearest_hub": nearest,
        "radius_km": radius_km,
        "country": code,
        "message": (
            "You're within our delivery zone." if serviceable
            else "We're not delivering here yet, but we're expanding soon."
        ),
    }


# ---------- recent searches ----------
class RecentSearchIn(BaseModel):
    place_id: Optional[str] = None
    formatted_address: str = Field(..., min_length=1, max_length=500)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    country: Optional[str] = None


@router.get("/recent-searches")
async def list_recent(
    customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
) -> List[dict]:
    """Return up to 10 recent searches for the current customer (most recent first)."""
    rows = (
        (
            await session.execute(
                select(RecentAddressSearch)
                .where(RecentAddressSearch.customer_id == customer.id)
                .order_by(RecentAddressSearch.last_used_at.desc())
                .limit(10)
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


@router.post("/recent-searches")
async def add_recent(
    payload: RecentSearchIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    doc = {
        "customer_id": customer.id,
        "place_id": payload.place_id,
        "formatted_address": payload.formatted_address,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "city": payload.city,
        "country": (payload.country or "CI").upper(),
        "last_used_at": now,
    }
    # De-duplicate by place_id (preferred) or formatted_address, matching the two
    # partial-unique indexes on this table.
    if payload.place_id:
        index_elements = ["customer_id", "place_id"]
        index_where = RecentAddressSearch.place_id.isnot(None)
    else:
        index_elements = ["customer_id", "formatted_address"]
        index_where = RecentAddressSearch.place_id.is_(None)
    stmt = pg_insert(RecentAddressSearch).values(**doc)
    update_cols = {c: stmt.excluded[c] for c in doc if c not in index_elements}
    stmt = stmt.on_conflict_do_update(index_elements=index_elements, index_where=index_where, set_=update_cols)
    await session.execute(stmt)
    await session.commit()

    # Trim beyond 10 (oldest first)
    all_rows = (
        (
            await session.execute(
                select(RecentAddressSearch.id)
                .where(RecentAddressSearch.customer_id == customer.id)
                .order_by(RecentAddressSearch.last_used_at.desc())
            )
        )
        .scalars()
        .all()
    )
    stale = all_rows[10:]
    if stale:
        for row_id in stale:
            row = await session.get(RecentAddressSearch, row_id)
            if row:
                await session.delete(row)
        await session.commit()
    return {"ok": True}


@router.delete("/recent-searches/{search_id}")
async def delete_recent(
    search_id: str,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(RecentAddressSearch, search_id)
    if not row or row.customer_id != customer.id:
        raise HTTPException(404, _t("errors.order.recent_search_not_found", current_lang()))
    await session.delete(row)
    await session.commit()
    return {"ok": True}
