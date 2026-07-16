"""Super Admin Platform — full v1 API.

Endpoints (all require super_admin or admin role):
- POST   /admin/auth/login              — email+password
- GET    /admin/auth/me
- GET    /admin/dashboard               — KPI rollup
- Countries:  GET/POST/PATCH/DELETE     /admin/countries[/:code]
- Cities:     GET/POST/PATCH/DELETE     /admin/cities[/:id]
- Roles:      GET/POST/PATCH/DELETE     /admin/roles[/:code]
- Finance:    GET                       /admin/finance
- AI Prompts: GET/POST/PATCH/DELETE     /admin/ai/prompts[/:id]
- Audit:      GET                       /admin/audit-logs
- Customers:  GET                       /admin/customers
- Admins:     GET/POST                  /admin/admins  (super_admin only)
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field
import jwt

from core.db import db
from core.security import create_access_token, hash_password, verify_password, decode_token
from core.models_base import _now_iso, new_id
from core.events import event_bus, Events
from core.providers.ai_provider import get_ai_provider

router = APIRouter(prefix="/admin", tags=["admin"])


# =============== AUTH ===============
class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str


async def get_current_admin(request: Request) -> dict:
    """Resolve Bearer JWT, ensure role is admin or super_admin."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(auth[7:])
    except jwt.PyJWTError as e:
        raise HTTPException(401, "Invalid token") from e
    if payload.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Admin access required")
    user = await db.admin_users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or user.get("deleted_at"):
        raise HTTPException(401, "Admin not found")
    return user


async def require_super(admin: dict) -> None:
    if admin.get("role") != "super_admin":
        raise HTTPException(403, "Super admin only")


async def _audit(admin: dict, action: str, target_id: Optional[str] = None, metadata: Optional[dict] = None):
    await db.audit_logs.insert_one({
        "id": new_id("aud"),
        "actor_id": admin["id"],
        "actor_kind": "admin",
        "actor_email": admin.get("email"),
        "action": action,
        "target_id": target_id,
        "metadata": metadata or {},
        "created_at": _now_iso(),
    })


@router.post("/auth/login")
async def admin_login(payload: AdminLoginIn):
    user = await db.admin_users.find_one({"email": payload.email.lower(), "deleted_at": None})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token(user["id"], role=user["role"], extra={"email": user["email"]})
    user_out = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    await _audit(user_out, "admin.login")
    return {"access_token": token, "token_type": "bearer", "admin": user_out}


@router.get("/auth/me")
async def admin_me(admin: dict = Depends(get_current_admin)):
    return admin


# =============== DASHBOARD ===============
@router.get("/dashboard")
async def dashboard(admin: dict = Depends(get_current_admin)):
    now = datetime.now(timezone.utc)
    since_7d = (now - timedelta(days=7)).isoformat()
    since_30d = (now - timedelta(days=30)).isoformat()

    total_customers = await db.customers.count_documents({"deleted_at": {"$in": [None, ""]}})
    verified_customers = await db.customers.count_documents({"verified": True})
    total_orders = await db.orders.count_documents({"deleted_at": {"$in": [None, ""]}})
    orders_7d = await db.orders.count_documents({"created_at": {"$gte": since_7d}})
    orders_30d = await db.orders.count_documents({"created_at": {"$gte": since_30d}})

    # Revenue by currency (payment_status in succeeded/authorized)
    pipeline = [
        {"$match": {"payment_status": {"$in": ["succeeded", "authorized"]}}},
        {"$group": {"_id": "$currency", "revenue": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]
    revenue_by_ccy = [{"currency": r["_id"], "revenue": r["revenue"], "count": r["count"]} async for r in db.orders.aggregate(pipeline)]

    countries = await db.countries.count_documents({"active": True})
    products = await db.mart_products.count_documents({"deleted_at": None})
    ai_calls = await db.ai_executions.count_documents({})

    return {
        "customers": {"total": total_customers, "verified": verified_customers},
        "orders": {"total": total_orders, "last_7d": orders_7d, "last_30d": orders_30d},
        "revenue": revenue_by_ccy,
        "footprint": {"countries": countries, "products": products, "ai_calls": ai_calls},
    }


# =============== COUNTRIES ===============
class CountryIn(BaseModel):
    code: str
    name: str
    flag: str = ""
    currency: str
    currency_symbol: str = ""
    locale: str
    phone_code: str
    timezone: str
    active: bool = True
    primary: bool = False
    min_order: float = 0
    delivery_fee: float = 0
    free_delivery_over: float = 0
    delivery_eta_min: str = "10-15 min"


@router.get("/countries")
async def list_countries_admin(admin: dict = Depends(get_current_admin)):
    return await db.countries.find({}, {"_id": 0}).sort("code", 1).to_list(200)


@router.post("/countries")
async def create_country(payload: CountryIn, admin: dict = Depends(get_current_admin)):
    doc = payload.model_dump()
    doc["code"] = doc["code"].upper()
    doc.update({"updated_at": _now_iso()})
    await db.countries.update_one({"code": doc["code"]}, {"$set": doc}, upsert=True)
    await _audit(admin, "country.upsert", doc["code"], {"active": doc["active"]})
    return doc


@router.patch("/countries/{code}")
async def update_country(code: str, payload: dict, admin: dict = Depends(get_current_admin)):
    payload["updated_at"] = _now_iso()
    r = await db.countries.update_one({"code": code.upper()}, {"$set": payload})
    if r.matched_count == 0:
        raise HTTPException(404, "Country not found")
    await _audit(admin, "country.update", code)
    return await db.countries.find_one({"code": code.upper()}, {"_id": 0})


@router.delete("/countries/{code}")
async def delete_country(code: str, admin: dict = Depends(get_current_admin)):
    await db.countries.update_one({"code": code.upper()}, {"$set": {"active": False, "updated_at": _now_iso()}})
    await _audit(admin, "country.deactivate", code)
    return {"ok": True}


# =============== CITIES ===============
class CityIn(BaseModel):
    name: str
    country: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    active: bool = True


@router.get("/cities")
async def list_cities(country: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    q = {"deleted_at": None}
    if country: q["country"] = country.upper()
    return await db.cities.find(q, {"_id": 0}).sort("name", 1).to_list(500)


@router.post("/cities")
async def create_city(payload: CityIn, admin: dict = Depends(get_current_admin)):
    doc = payload.model_dump()
    doc["country"] = doc["country"].upper()
    doc.update({"id": new_id("city"), "deleted_at": None, "created_at": _now_iso(), "updated_at": _now_iso()})
    await db.cities.insert_one(doc)
    doc.pop("_id", None)
    await _audit(admin, "city.create", doc["id"], {"name": doc["name"]})
    return doc


@router.patch("/cities/{cid}")
async def update_city(cid: str, payload: dict, admin: dict = Depends(get_current_admin)):
    payload["updated_at"] = _now_iso()
    r = await db.cities.update_one({"id": cid}, {"$set": payload})
    if r.matched_count == 0:
        raise HTTPException(404, "City not found")
    await _audit(admin, "city.update", cid)
    return await db.cities.find_one({"id": cid}, {"_id": 0})


@router.delete("/cities/{cid}")
async def delete_city(cid: str, admin: dict = Depends(get_current_admin)):
    await db.cities.update_one({"id": cid}, {"$set": {"deleted_at": _now_iso()}})
    await _audit(admin, "city.delete", cid)
    return {"ok": True}


# =============== ROLES ===============
@router.get("/roles")
async def list_roles(admin: dict = Depends(get_current_admin)):
    return await db.roles.find({}, {"_id": 0}).sort("code", 1).to_list(50)


class RoleIn(BaseModel):
    code: str
    label: str
    permissions: list[str] = []
    description: str = ""


@router.post("/roles")
async def upsert_role(payload: RoleIn, admin: dict = Depends(get_current_admin)):
    await require_super(admin)
    doc = payload.model_dump()
    doc["updated_at"] = _now_iso()
    await db.roles.update_one({"code": doc["code"]}, {"$set": doc}, upsert=True)
    await _audit(admin, "role.upsert", doc["code"])
    return await db.roles.find_one({"code": doc["code"]}, {"_id": 0})


@router.delete("/roles/{code}")
async def delete_role(code: str, admin: dict = Depends(get_current_admin)):
    await require_super(admin)
    if code in ("customer", "super_admin", "admin"):
        raise HTTPException(400, "Cannot delete core role")
    await db.roles.delete_one({"code": code})
    await _audit(admin, "role.delete", code)
    return {"ok": True}


# =============== FINANCE ===============
@router.get("/finance")
async def finance(admin: dict = Depends(get_current_admin), days: int = Query(30, le=180)):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    # Time series by day + currency
    pipeline = [
        {"$match": {"created_at": {"$gte": since}, "payment_status": {"$in": ["succeeded", "authorized"]}}},
        {"$group": {
            "_id": {"day": {"$substr": ["$created_at", 0, 10]}, "currency": "$currency"},
            "revenue": {"$sum": "$total"},
            "orders": {"$sum": 1},
        }},
        {"$sort": {"_id.day": 1}},
    ]
    series = []
    async for r in db.orders.aggregate(pipeline):
        series.append({"day": r["_id"]["day"], "currency": r["_id"]["currency"], "revenue": r["revenue"], "orders": r["orders"]})
    # Totals
    totals_pipeline = [
        {"$match": {"payment_status": {"$in": ["succeeded", "authorized"]}}},
        {"$group": {"_id": "$currency", "revenue": {"$sum": "$total"}, "orders": {"$sum": 1}, "avg_order": {"$avg": "$total"}}},
    ]
    totals = [{"currency": r["_id"], "revenue": r["revenue"], "orders": r["orders"], "avg_order": round(r.get("avg_order") or 0, 2)} async for r in db.orders.aggregate(totals_pipeline)]
    return {"series": series, "totals": totals, "days": days}


# =============== AI PROMPTS (Command Center) ===============
class PromptIn(BaseModel):
    name: str
    feature: str
    body: str
    model: str = "claude-sonnet-4-6"
    active: bool = True


@router.get("/ai/prompts")
async def list_prompts(admin: dict = Depends(get_current_admin)):
    return await db.ai_prompts.find({}, {"_id": 0}).sort("name", 1).to_list(200)


@router.post("/ai/prompts")
async def create_prompt(payload: PromptIn, admin: dict = Depends(get_current_admin)):
    doc = payload.model_dump()
    doc.update({"id": new_id("prm"), "created_by": admin["id"], "created_at": _now_iso(), "updated_at": _now_iso()})
    await db.ai_prompts.insert_one(doc)
    doc.pop("_id", None)
    await _audit(admin, "ai_prompt.create", doc["id"])
    return doc


@router.patch("/ai/prompts/{pid}")
async def update_prompt(pid: str, payload: dict, admin: dict = Depends(get_current_admin)):
    payload["updated_at"] = _now_iso()
    r = await db.ai_prompts.update_one({"id": pid}, {"$set": payload})
    if r.matched_count == 0:
        raise HTTPException(404, "Prompt not found")
    await _audit(admin, "ai_prompt.update", pid)
    return await db.ai_prompts.find_one({"id": pid}, {"_id": 0})


@router.delete("/ai/prompts/{pid}")
async def delete_prompt(pid: str, admin: dict = Depends(get_current_admin)):
    await db.ai_prompts.delete_one({"id": pid})
    await _audit(admin, "ai_prompt.delete", pid)
    return {"ok": True}


# =============== AI INSIGHTS (uses Emergent LLM) ===============
class InsightsIn(BaseModel):
    scope: str = "platform"


@router.post("/ai/insights")
async def admin_ai_insights(payload: InsightsIn, admin: dict = Depends(get_current_admin)):
    # Build KPI payload from live data
    kpis = await dashboard(admin)
    provider = get_ai_provider()
    system = (
        "You are the BAKĒD Business Insights AI. Given a JSON of platform KPIs, produce a JSON object with keys: "
        "headline (short punchy sentence), insights (array of 3-5 bullet-friendly strings), "
        "recommended_actions (array of 2-4 short imperative sentences), risks (optional array). "
        "Return valid JSON only, no markdown fences."
    )
    import json as _json
    raw = await provider.complete(system, _json.dumps({"scope": payload.scope, "kpis": kpis}), session_id=f"admin-insights-{admin['id']}-{new_id()}")
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        parsed = _json.loads(text)
    except Exception:
        parsed = {"headline": raw[:120], "insights": [], "recommended_actions": [], "risks": []}
    await event_bus.publish(Events.AI_REQUESTED, {"feature": "admin_insights", "admin_id": admin["id"]})
    await _audit(admin, "ai_insights.run", metadata={"scope": payload.scope})
    return {"kpis": kpis, "output": parsed}


# =============== AUDIT LOGS ===============
@router.get("/audit-logs")
async def audit_logs(admin: dict = Depends(get_current_admin), limit: int = Query(100, le=500), q: Optional[str] = None):
    query = {}
    if q:
        query["action"] = {"$regex": q, "$options": "i"}
    return await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


# =============== CUSTOMERS ===============
@router.get("/customers")
async def list_customers(admin: dict = Depends(get_current_admin), limit: int = Query(100, le=500), q: Optional[str] = None):
    query = {}
    if q:
        query["$or"] = [{"phone": {"$regex": q, "$options": "i"}}, {"email": {"$regex": q, "$options": "i"}}, {"name": {"$regex": q, "$options": "i"}}]
    return await db.customers.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


# =============== ADMIN USERS (super_admin only) ===============
class AdminUserIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = Field("admin", pattern="^(admin|super_admin)$")


@router.get("/admins")
async def list_admins(admin: dict = Depends(get_current_admin)):
    await require_super(admin)
    return await db.admin_users.find({"deleted_at": None}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)


@router.post("/admins")
async def create_admin(payload: AdminUserIn, admin: dict = Depends(get_current_admin)):
    await require_super(admin)
    email = payload.email.lower()
    if await db.admin_users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    doc = {
        "id": new_id("adm"),
        "email": email,
        "name": payload.name,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "deleted_at": None,
        "created_by": admin["id"],
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "version": 1,
    }
    await db.admin_users.insert_one(doc)
    await _audit(admin, "admin.create", doc["id"], {"role": payload.role, "email": email})
    return {k: v for k, v in doc.items() if k not in ("_id", "password_hash")}


@router.delete("/admins/{admin_id}")
async def deactivate_admin(admin_id: str, admin: dict = Depends(get_current_admin)):
    await require_super(admin)
    if admin_id == admin["id"]:
        raise HTTPException(400, "You cannot deactivate yourself")
    await db.admin_users.update_one({"id": admin_id}, {"$set": {"deleted_at": _now_iso()}})
    await _audit(admin, "admin.deactivate", admin_id)
    return {"ok": True}
