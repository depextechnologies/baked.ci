"""Global Address service — serviceability, recent searches, and Google Places
proxying utilities. Shared by every BAKĒD business module.

- Serviceability is computed as: is the target lat/lng within `service_radius_km`
  of any active hub (mart_stores) in the same country?
- Recent searches are stored per-customer server-side. Guests use localStorage.
"""
from __future__ import annotations
import math
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field

from core.db import db
from core.models_base import _now_iso, new_id
from core.deps import get_current_customer

router = APIRouter(prefix="/addresses", tags=["addresses"])


# ---------- serviceability ----------
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
    country: str = Query("CI", description="ISO country code (CI, LR)"),
):
    """Return whether BAKĒD delivers to a given coordinate.

    Response shape:
      { serviceable: bool, distance_km, nearest_hub, radius_km, message }
    """
    code = (country or "CI").upper()
    country_doc = await db.countries.find_one({"code": code, "active": True}, {"_id": 0})
    if not country_doc:
        return {
            "serviceable": False,
            "distance_km": None,
            "nearest_hub": None,
            "radius_km": None,
            "message": "We're not delivering here yet, but we're expanding soon.",
        }
    radius_km = float(country_doc.get("service_radius_km") or 15)

    hubs = await db.mart_stores.find(
        {"country": code, "deleted_at": None, "active": {"$ne": False}},
        {"_id": 0}
    ).to_list(100)

    nearest = None
    best_dist = None
    for h in hubs:
        hl, hn = h.get("latitude"), h.get("longitude")
        if hl is None or hn is None:
            continue
        d = _haversine_km(lat, lng, float(hl), float(hn))
        if best_dist is None or d < best_dist:
            best_dist = d
            nearest = {"id": h.get("id"), "name": h.get("name"), "address": h.get("address"), "latitude": hl, "longitude": hn, "distance_km": round(d, 2)}

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
async def list_recent(customer: dict = Depends(get_current_customer)) -> List[dict]:
    """Return up to 10 recent searches for the current customer (most recent first)."""
    return await db.recent_address_searches.find(
        {"customer_id": customer["id"]}, {"_id": 0}
    ).sort("last_used_at", -1).limit(10).to_list(10)


@router.post("/recent-searches")
async def add_recent(payload: RecentSearchIn, customer: dict = Depends(get_current_customer)):
    now = _now_iso()
    # De-duplicate by place_id (preferred) or formatted_address
    key = {"customer_id": customer["id"]}
    if payload.place_id:
        key["place_id"] = payload.place_id
    else:
        key["formatted_address"] = payload.formatted_address

    doc = {
        **key,
        "place_id": payload.place_id,
        "formatted_address": payload.formatted_address,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "city": payload.city,
        "country": (payload.country or "CI").upper(),
        "last_used_at": now,
    }
    existing = await db.recent_address_searches.find_one(key, {"_id": 0})
    if existing:
        await db.recent_address_searches.update_one(key, {"$set": doc})
    else:
        doc.update({"id": new_id("rec"), "created_at": now})
        await db.recent_address_searches.insert_one(doc)
    # Trim beyond 10 (oldest first)
    all_ids = await db.recent_address_searches.find(
        {"customer_id": customer["id"]}, {"_id": 0, "id": 1, "last_used_at": 1}
    ).sort("last_used_at", -1).to_list(50)
    stale = [r["id"] for r in all_ids[10:]]
    if stale:
        await db.recent_address_searches.delete_many({"id": {"$in": stale}})
    return {"ok": True}


@router.delete("/recent-searches/{search_id}")
async def delete_recent(search_id: str, customer: dict = Depends(get_current_customer)):
    r = await db.recent_address_searches.delete_one({"id": search_id, "customer_id": customer["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Recent search not found")
    return {"ok": True}
