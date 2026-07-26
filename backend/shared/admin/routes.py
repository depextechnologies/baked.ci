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
import json as _json
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field
import jwt
from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser,
    AiExecution,
    AiPrompt,
    AuditLog,
    City,
    Country,
    Customer,
    MartCategory,
    MartProduct,
    MartStore,
    MartSubcategory,
    Order,
    Role,
    new_id,
)
from core.security import create_access_token, hash_password, verify_password, decode_token
from core.serializers import customer_to_dict, row_to_dict
from core.events import event_bus, Events
from core.providers.ai_provider import get_ai_provider

router = APIRouter(prefix="/admin", tags=["admin"])


def admin_to_dict(admin: AdminUser) -> dict:
    data = row_to_dict(admin)
    data.pop("password_hash", None)
    return data


# =============== AUTH ===============
class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str


async def get_current_admin(request: Request, session: AsyncSession = Depends(get_session)) -> AdminUser:
    """Resolve Bearer JWT, ensure role is admin or super_admin, against admin_users."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(auth[7:])
    except jwt.PyJWTError as e:
        raise HTTPException(401, "Invalid token") from e
    if payload.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Admin access required")
    user = await session.get(AdminUser, payload["sub"])
    if not user or user.deleted_at:
        raise HTTPException(401, "Admin not found")
    return user


async def require_super(admin: AdminUser) -> None:
    if admin.role != "super_admin":
        raise HTTPException(403, "Super admin only")


async def _audit(
    session: AsyncSession,
    admin: AdminUser | dict,
    action: str,
    target_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    admin_id = admin.id if isinstance(admin, AdminUser) else admin["id"]
    admin_email = admin.email if isinstance(admin, AdminUser) else admin.get("email")
    session.add(
        AuditLog(
            actor_id=admin_id,
            actor_kind="admin",
            actor_email=admin_email,
            action=action,
            target_id=target_id,
            metadata_=metadata or {},
        )
    )
    await session.commit()


@router.post("/auth/login")
async def admin_login(payload: AdminLoginIn, session: AsyncSession = Depends(get_session)):
    user = (
        await session.execute(
            select(AdminUser).where(AdminUser.email == payload.email.lower(), AdminUser.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash or ""):
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token(user.id, role=user.role, extra={"email": user.email})
    user_out = admin_to_dict(user)
    await _audit(session, user, "admin.login")
    return {"access_token": token, "token_type": "bearer", "admin": user_out}


@router.get("/auth/me")
async def admin_me(admin: AdminUser = Depends(get_current_admin)):
    return admin_to_dict(admin)


# =============== DASHBOARD ===============
async def _dashboard_kpis(session: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    since_7d = now - timedelta(days=7)
    since_30d = now - timedelta(days=30)

    total_customers = (
        await session.execute(select(func.count()).select_from(Customer).where(Customer.deleted_at.is_(None)))
    ).scalar_one()
    verified_customers = (
        await session.execute(select(func.count()).select_from(Customer).where(Customer.verified.is_(True)))
    ).scalar_one()
    total_orders = (
        await session.execute(select(func.count()).select_from(Order).where(Order.deleted_at.is_(None)))
    ).scalar_one()
    orders_7d = (
        await session.execute(select(func.count()).select_from(Order).where(Order.created_at >= since_7d))
    ).scalar_one()
    orders_30d = (
        await session.execute(select(func.count()).select_from(Order).where(Order.created_at >= since_30d))
    ).scalar_one()

    rev_rows = (
        await session.execute(
            select(Order.currency, func.sum(Order.total).label("revenue"), func.count().label("count"))
            .where(Order.payment_status.in_(["succeeded", "authorized"]))
            .group_by(Order.currency)
        )
    ).all()
    revenue_by_ccy = [{"currency": r.currency, "revenue": float(r.revenue or 0), "count": r.count} for r in rev_rows]

    countries = (
        await session.execute(select(func.count()).select_from(Country).where(Country.active.is_(True)))
    ).scalar_one()
    products = (
        await session.execute(select(func.count()).select_from(MartProduct).where(MartProduct.deleted_at.is_(None)))
    ).scalar_one()
    ai_calls = (await session.execute(select(func.count()).select_from(AiExecution))).scalar_one()

    return {
        "customers": {"total": total_customers, "verified": verified_customers},
        "orders": {"total": total_orders, "last_7d": orders_7d, "last_30d": orders_30d},
        "revenue": revenue_by_ccy,
        "footprint": {"countries": countries, "products": products, "ai_calls": ai_calls},
    }


@router.get("/dashboard")
async def dashboard(admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)):
    return await _dashboard_kpis(session)


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
async def list_countries_admin(
    admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    rows = (await session.execute(select(Country).order_by(Country.code))).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.post("/countries")
async def create_country(
    payload: CountryIn, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    doc = payload.model_dump()
    doc["code"] = doc["code"].upper()
    stmt = pg_insert(Country).values(**doc)
    update_cols = {c: stmt.excluded[c] for c in doc if c != "code"}
    stmt = stmt.on_conflict_do_update(index_elements=["code"], set_=update_cols)
    await session.execute(stmt)
    await session.commit()
    await _audit(session, admin, "country.upsert", doc["code"], {"active": doc["active"]})
    return row_to_dict(await session.get(Country, doc["code"]))


@router.patch("/countries/{code}")
async def update_country(
    code: str,
    payload: dict,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(update(Country).where(Country.code == code.upper()).values(**payload))
    if result.rowcount == 0:
        raise HTTPException(404, "Country not found")
    await session.commit()
    await _audit(session, admin, "country.update", code)
    return row_to_dict(await session.get(Country, code.upper()))


@router.delete("/countries/{code}")
async def delete_country(
    code: str, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    await session.execute(update(Country).where(Country.code == code.upper()).values(active=False))
    await session.commit()
    await _audit(session, admin, "country.deactivate", code)
    return {"ok": True}


# =============== CITIES ===============
class CityIn(BaseModel):
    name: str
    country: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    active: bool = True


@router.get("/cities")
async def list_cities(
    country: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(City).where(City.deleted_at.is_(None))
    if country:
        stmt = stmt.where(City.country == country.upper())
    rows = (await session.execute(stmt.order_by(City.name))).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.post("/cities")
async def create_city(
    payload: CityIn, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    doc = payload.model_dump()
    doc["country"] = doc["country"].upper()
    city = City(**doc)
    session.add(city)
    await session.commit()
    await _audit(session, admin, "city.create", city.id, {"name": city.name})
    return row_to_dict(city)


@router.patch("/cities/{cid}")
async def update_city(
    cid: str,
    payload: dict,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(update(City).where(City.id == cid).values(**payload))
    if result.rowcount == 0:
        raise HTTPException(404, "City not found")
    await session.commit()
    await _audit(session, admin, "city.update", cid)
    return row_to_dict(await session.get(City, cid))


@router.delete("/cities/{cid}")
async def delete_city(
    cid: str, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    result = await session.execute(update(City).where(City.id == cid).values(deleted_at=func.now()))
    if result.rowcount == 0:
        raise HTTPException(404, "City not found")
    await session.commit()
    await _audit(session, admin, "city.delete", cid)
    return {"ok": True}


# =============== ROLES ===============
@router.get("/roles")
async def list_roles(admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Role).order_by(Role.code))).scalars().all()
    return [row_to_dict(r) for r in rows]


class RoleIn(BaseModel):
    code: str
    label: str
    permissions: list[str] = []
    description: str = ""


@router.post("/roles")
async def upsert_role(
    payload: RoleIn, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    await require_super(admin)
    doc = payload.model_dump()
    stmt = pg_insert(Role).values(**doc)
    update_cols = {c: stmt.excluded[c] for c in doc if c != "code"}
    stmt = stmt.on_conflict_do_update(index_elements=["code"], set_=update_cols)
    await session.execute(stmt)
    await session.commit()
    await _audit(session, admin, "role.upsert", doc["code"])
    return row_to_dict(await session.get(Role, doc["code"]))


@router.delete("/roles/{code}")
async def delete_role(
    code: str, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    await require_super(admin)
    if code in ("customer", "super_admin", "admin"):
        raise HTTPException(400, "Cannot delete core role")
    role = await session.get(Role, code)
    if role:
        await session.delete(role)
        await session.commit()
    await _audit(session, admin, "role.delete", code)
    return {"ok": True}


# =============== FINANCE ===============
@router.get("/finance")
async def finance(
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
    days: int = Query(30, le=180),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    day_col = func.date_trunc("day", Order.created_at).label("day")
    series_rows = (
        await session.execute(
            select(day_col, Order.currency, func.sum(Order.total).label("revenue"), func.count().label("orders"))
            .where(Order.created_at >= since, Order.payment_status.in_(["succeeded", "authorized"]))
            .group_by(day_col, Order.currency)
            .order_by(day_col)
        )
    ).all()
    series = [
        {"day": r.day.date().isoformat(), "currency": r.currency, "revenue": float(r.revenue or 0), "orders": r.orders}
        for r in series_rows
    ]
    totals_rows = (
        await session.execute(
            select(
                Order.currency,
                func.sum(Order.total).label("revenue"),
                func.count().label("orders"),
                func.avg(Order.total).label("avg_order"),
            )
            .where(Order.payment_status.in_(["succeeded", "authorized"]))
            .group_by(Order.currency)
        )
    ).all()
    totals = [
        {
            "currency": r.currency,
            "revenue": float(r.revenue or 0),
            "orders": r.orders,
            "avg_order": round(float(r.avg_order or 0), 2),
        }
        for r in totals_rows
    ]
    return {"series": series, "totals": totals, "days": days}


# =============== AI PROMPTS (Command Center) ===============
class PromptIn(BaseModel):
    name: str
    feature: str
    body: str
    model: str = "claude-sonnet-4-6"
    active: bool = True


@router.get("/ai/prompts")
async def list_prompts(admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(AiPrompt).order_by(AiPrompt.name))).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.post("/ai/prompts")
async def create_prompt(
    payload: PromptIn, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    prompt = AiPrompt(**payload.model_dump(), created_by=admin.id)
    session.add(prompt)
    await session.commit()
    await _audit(session, admin, "ai_prompt.create", prompt.id)
    return row_to_dict(prompt)


@router.patch("/ai/prompts/{pid}")
async def update_prompt(
    pid: str,
    payload: dict,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(update(AiPrompt).where(AiPrompt.id == pid).values(**payload))
    if result.rowcount == 0:
        raise HTTPException(404, "Prompt not found")
    await session.commit()
    await _audit(session, admin, "ai_prompt.update", pid)
    return row_to_dict(await session.get(AiPrompt, pid))


@router.delete("/ai/prompts/{pid}")
async def delete_prompt(
    pid: str, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    prompt = await session.get(AiPrompt, pid)
    if prompt:
        await session.delete(prompt)
        await session.commit()
    await _audit(session, admin, "ai_prompt.delete", pid)
    return {"ok": True}


# =============== AI INSIGHTS (uses Emergent LLM) ===============
class InsightsIn(BaseModel):
    scope: str = "platform"


@router.post("/ai/insights")
async def admin_ai_insights(
    payload: InsightsIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    kpis = await _dashboard_kpis(session)
    provider = get_ai_provider()
    system = (
        "You are the BAKĒD Business Insights AI. Given a JSON of platform KPIs, produce a JSON object with keys: "
        "headline (short punchy sentence), insights (array of 3-5 bullet-friendly strings), "
        "recommended_actions (array of 2-4 short imperative sentences), risks (optional array). "
        "Return valid JSON only, no markdown fences."
    )
    raw = await provider.complete(
        system, _json.dumps({"scope": payload.scope, "kpis": kpis}), session_id=f"admin-insights-{admin.id}-{new_id()}"
    )
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        parsed = _json.loads(text)
    except Exception:
        parsed = {"headline": raw[:120], "insights": [], "recommended_actions": [], "risks": []}
    await event_bus.publish(Events.AI_REQUESTED, {"feature": "admin_insights", "admin_id": admin.id})
    await _audit(session, admin, "ai_insights.run", metadata={"scope": payload.scope})
    return {"kpis": kpis, "output": parsed}


# =============== MODULE STATS ===============
@router.get("/modules/{code}/stats")
async def module_stats(
    code: str, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    code = code.lower()
    if code not in ("mart", "food", "shop", "express", "auto", "immo"):
        raise HTTPException(404, "Unknown module")
    if code == "mart":
        async def _count(model, *conds):
            return (await session.execute(select(func.count()).select_from(model).where(*conds))).scalar_one()

        products = await _count(MartProduct, MartProduct.module == "mart", MartProduct.deleted_at.is_(None))
        stores = await _count(MartStore, MartStore.module == "mart", MartStore.deleted_at.is_(None))
        categories = await _count(MartCategory, MartCategory.module == "mart", MartCategory.deleted_at.is_(None))
        subcategories = await _count(MartSubcategory, MartSubcategory.module == "mart")
        orders_total = await _count(Order, Order.module == "mart")
        orders_confirmed = await _count(Order, Order.module == "mart", Order.status == "confirmed")

        rev_rows = (
            await session.execute(
                select(Order.currency, func.sum(Order.total).label("revenue"), func.count().label("count"))
                .where(Order.module == "mart", Order.payment_status.in_(["authorized", "succeeded"]))
                .group_by(Order.currency)
            )
        ).all()
        revenue = [{"currency": r.currency, "revenue": float(r.revenue or 0), "count": r.count} for r in rev_rows]
        return {
            "module": code,
            "status": "active",
            "kpis": {
                "products": products,
                "stores": stores,
                "categories": categories,
                "subcategories": subcategories,
                "orders_total": orders_total,
                "orders_confirmed": orders_confirmed,
            },
            "revenue": revenue,
        }
    return {"module": code, "status": "coming_soon", "kpis": {}, "revenue": []}


# =============== AUDIT LOGS ===============
@router.get("/audit-logs")
async def audit_logs(
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(100, le=500),
    q: Optional[str] = None,
):
    stmt = select(AuditLog)
    if q:
        stmt = stmt.where(AuditLog.action.ilike(f"%{q}%"))
    rows = (await session.execute(stmt.order_by(AuditLog.created_at.desc()).limit(limit))).scalars().all()
    return [row_to_dict(r, rename={"metadata_": "metadata"}) for r in rows]


# =============== CUSTOMERS ===============
@router.get("/customers")
async def list_customers(
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(100, le=500),
    q: Optional[str] = None,
):
    stmt = select(Customer)
    if q:
        pat = f"%{q}%"
        stmt = stmt.where(or_(Customer.phone.ilike(pat), Customer.email.ilike(pat), Customer.name.ilike(pat)))
    rows = (await session.execute(stmt.order_by(Customer.created_at.desc()).limit(limit))).scalars().all()
    return [customer_to_dict(r) for r in rows]


# =============== ADMIN USERS (super_admin only) ===============
class AdminUserIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = Field("admin", pattern="^(admin|super_admin)$")


@router.get("/admins")
async def list_admins(
    admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    await require_super(admin)
    rows = (
        (
            await session.execute(
                select(AdminUser).where(AdminUser.deleted_at.is_(None)).order_by(AdminUser.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [admin_to_dict(r) for r in rows]


@router.post("/admins")
async def create_admin(
    payload: AdminUserIn, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    await require_super(admin)
    email = payload.email.lower()
    existing = (await session.execute(select(AdminUser).where(AdminUser.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Email already registered")
    new_admin = AdminUser(
        email=email,
        name=payload.name,
        role=payload.role,
        password_hash=hash_password(payload.password),
        created_by=admin.id,
    )
    session.add(new_admin)
    await session.commit()
    await _audit(session, admin, "admin.create", new_admin.id, {"role": payload.role, "email": email})
    return admin_to_dict(new_admin)


@router.delete("/admins/{admin_id}")
async def deactivate_admin(
    admin_id: str, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    await require_super(admin)
    if admin_id == admin.id:
        raise HTTPException(400, "You cannot deactivate yourself")
    await session.execute(update(AdminUser).where(AdminUser.id == admin_id).values(deleted_at=func.now()))
    await session.commit()
    await _audit(session, admin, "admin.deactivate", admin_id)
    return {"ok": True}
