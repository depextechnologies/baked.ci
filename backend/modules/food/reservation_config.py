"""FOODbakēd — Reservation Areas + Tables + Activation flow.

Adds the CRUD surface that lets partners configure the physical
capacity of their restaurant, plus the "Activate reservations" flow
that flips `reservation_public=true` once the minimum configuration is
in place.

Endpoint surface (all partner or super-admin, tenant-isolated via
`_get_menu_writer`):

  GET    /api/food/manage/{rid}/reservation-status
  POST   /api/food/manage/{rid}/reservation-activate
  POST   /api/food/manage/{rid}/reservation-deactivate

  GET    /api/food/manage/{rid}/reservation-areas
  POST   /api/food/manage/{rid}/reservation-areas
  PATCH  /api/food/manage/{rid}/reservation-areas/{aid}
  DELETE /api/food/manage/{rid}/reservation-areas/{aid}

  GET    /api/food/manage/{rid}/reservation-tables
  POST   /api/food/manage/{rid}/reservation-tables
  PATCH  /api/food/manage/{rid}/reservation-tables/{tid}
  DELETE /api/food/manage/{rid}/reservation-tables/{tid}
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, constr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from modules.food.routes import _get_menu_writer  # type: ignore
from modules.food.reservations import _get_or_seed_settings, DAY_KEYS


manage_router = APIRouter(prefix="/food/manage", tags=["food-reservation-config"])


# ---------------------------------------------------------------------------
# Serialisers
# ---------------------------------------------------------------------------

def _area(r: Any) -> dict:
    return {
        "id": r.id,
        "restaurant_id": r.restaurant_id,
        "name": r.name,
        "sort_order": r.sort_order,
        "is_active": r.is_active,
    }


def _table(r: Any) -> dict:
    return {
        "id": r.id,
        "restaurant_id": r.restaurant_id,
        "area_id": r.area_id,
        "code": r.code,
        "seats": r.seats,
        "is_active": r.is_active,
        "pos_x": r.pos_x,
        "pos_y": r.pos_y,
        "sort_order": r.sort_order,
    }


# ---------------------------------------------------------------------------
# Checklist / activation
# ---------------------------------------------------------------------------

async def _checklist(session: AsyncSession, rid: str) -> dict:
    """Return the minimum-config checklist so the partner UI can show
    exactly what remains before hitting Activate."""
    settings = await _get_or_seed_settings(session, rid)

    # Hours: at least one day has a valid non-empty range
    hours = settings.hours or {}
    hours_ok = False
    for key in DAY_KEYS:
        ranges = hours.get(key) or []
        for rng in ranges:
            if isinstance(rng, (list, tuple)) and len(rng) == 2 and rng[0] and rng[1]:
                hours_ok = True
                break
        if hours_ok:
            break

    # Party size
    party_ok = (settings.min_party_size or 0) >= 1 and \
               (settings.max_party_size or 0) >= (settings.min_party_size or 0)

    # Slot interval configured
    slots_ok = settings.slot_interval_minutes in (15, 30, 60)

    # Capacity: at least one active table OR fallback slot capacity >= max party
    active_tables = (await session.execute(text(
        "SELECT COUNT(*) FROM food_reservation_tables WHERE restaurant_id = :rid AND is_active = TRUE"
    ), {"rid": rid})).scalar_one()
    total_seats = (await session.execute(text(
        "SELECT COALESCE(SUM(seats), 0) FROM food_reservation_tables WHERE restaurant_id = :rid AND is_active = TRUE"
    ), {"rid": rid})).scalar_one()
    capacity_ok = int(active_tables) > 0 or int(settings.slot_capacity or 0) >= 1

    r = (await session.execute(text(
        "SELECT reservations_enabled, reservation_public FROM food_restaurants WHERE id = :id"
    ), {"id": rid})).fetchone()

    items = [
        {"key": "hours",    "ok": hours_ok},
        {"key": "slots",    "ok": slots_ok},
        {"key": "party",    "ok": party_ok},
        {"key": "capacity", "ok": capacity_ok},
    ]
    return {
        "enabled": bool(r.reservations_enabled),
        "public":  bool(r.reservation_public),
        "items":   items,
        "all_ok":  all(i["ok"] for i in items),
        "active_tables":  int(active_tables),
        "total_seats":    int(total_seats),
        "slot_capacity":  int(settings.slot_capacity or 0),
    }


@manage_router.get("/{rid}/reservation-status")
async def get_reservation_status(rid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    return await _checklist(session, rid)


@manage_router.post("/{rid}/reservation-activate")
async def activate_reservations(rid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    r = (await session.execute(text(
        "SELECT reservations_enabled FROM food_restaurants WHERE id = :id"
    ), {"id": rid})).fetchone()
    if not r or not r.reservations_enabled:
        raise HTTPException(400, "Reservation capability is not enabled for this restaurant")
    status = await _checklist(session, rid)
    if not status["all_ok"]:
        # Bubble the checklist back so the UI can highlight what's missing.
        raise HTTPException(400, {"detail": "incomplete", "checklist": status})
    await session.execute(text(
        "UPDATE food_restaurants SET reservation_public = TRUE, updated_at = now() WHERE id = :id"
    ), {"id": rid})
    await session.commit()
    return await _checklist(session, rid)


@manage_router.post("/{rid}/reservation-deactivate")
async def deactivate_reservations(rid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    await session.execute(text(
        "UPDATE food_restaurants SET reservation_public = FALSE, updated_at = now() WHERE id = :id"
    ), {"id": rid})
    await session.commit()
    return await _checklist(session, rid)


# ---------------------------------------------------------------------------
# Areas CRUD
# ---------------------------------------------------------------------------

class AreaIn(BaseModel):
    name: constr(strip_whitespace=True, min_length=1, max_length=120)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = True


class AreaPatch(BaseModel):
    name: Optional[constr(strip_whitespace=True, min_length=1, max_length=120)] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@manage_router.get("/{rid}/reservation-areas")
async def list_areas(rid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    rows = (await session.execute(text(
        "SELECT * FROM food_reservation_areas WHERE restaurant_id = :rid ORDER BY sort_order ASC, created_at ASC"
    ), {"rid": rid})).fetchall()
    tables = (await session.execute(text(
        "SELECT * FROM food_reservation_tables WHERE restaurant_id = :rid ORDER BY sort_order ASC, created_at ASC"
    ), {"rid": rid})).fetchall()
    tables_by_area: dict[str, list[dict]] = {}
    for t in tables:
        tables_by_area.setdefault(t.area_id, []).append(_table(t))
    return {
        "areas": [{**_area(a), "tables": tables_by_area.get(a.id, [])} for a in rows],
    }


@manage_router.post("/{rid}/reservation-areas", status_code=201)
async def add_area(rid: str, payload: AreaIn, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    next_order = payload.sort_order
    if next_order is None:
        next_order = int((await session.execute(text(
            "SELECT COALESCE(MAX(sort_order), -1) FROM food_reservation_areas WHERE restaurant_id = :rid"
        ), {"rid": rid})).scalar_one()) + 1
    aid = f"area_{uuid.uuid4().hex[:16]}"
    await session.execute(text("""
        INSERT INTO food_reservation_areas (id, restaurant_id, name, sort_order, is_active)
        VALUES (:id, :rid, :name, :ord, :active)
    """), {"id": aid, "rid": rid, "name": payload.name,
           "ord": next_order, "active": payload.is_active if payload.is_active is not None else True})
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_reservation_areas WHERE id = :id"), {"id": aid})).fetchone()
    return _area(row)


@manage_router.patch("/{rid}/reservation-areas/{aid}")
async def patch_area(rid: str, aid: str, payload: AreaPatch, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    row = (await session.execute(text(
        "SELECT * FROM food_reservation_areas WHERE id = :aid AND restaurant_id = :rid"
    ), {"aid": aid, "rid": rid})).fetchone()
    if not row:
        raise HTTPException(404, "Area not found")
    fields = payload.model_dump(exclude_none=True)
    if not fields:
        return _area(row)
    sets, params = [], {"id": aid}
    for k, v in fields.items():
        sets.append(f"{k} = :{k}")
        params[k] = v
    sets.append("updated_at = now()")
    await session.execute(text(
        f"UPDATE food_reservation_areas SET {', '.join(sets)} WHERE id = :id"
    ), params)
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_reservation_areas WHERE id = :id"), {"id": aid})).fetchone()
    return _area(row)


@manage_router.delete("/{rid}/reservation-areas/{aid}", status_code=204)
async def delete_area(rid: str, aid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    r = await session.execute(text(
        "DELETE FROM food_reservation_areas WHERE id = :aid AND restaurant_id = :rid"
    ), {"aid": aid, "rid": rid})
    await session.commit()
    if r.rowcount == 0:
        raise HTTPException(404, "Area not found")


# ---------------------------------------------------------------------------
# Tables CRUD
# ---------------------------------------------------------------------------

class TableIn(BaseModel):
    area_id: constr(strip_whitespace=True, min_length=1, max_length=64)
    code: constr(strip_whitespace=True, min_length=1, max_length=24)
    seats: int = Field(..., ge=1, le=40)
    is_active: Optional[bool] = True
    pos_x: Optional[int] = None
    pos_y: Optional[int] = None
    sort_order: Optional[int] = None


class TablePatch(BaseModel):
    area_id:    Optional[constr(strip_whitespace=True, min_length=1, max_length=64)] = None
    code:       Optional[constr(strip_whitespace=True, min_length=1, max_length=24)] = None
    seats:      Optional[int] = Field(None, ge=1, le=40)
    is_active:  Optional[bool] = None
    pos_x:      Optional[int] = None
    pos_y:      Optional[int] = None
    sort_order: Optional[int] = None


@manage_router.get("/{rid}/reservation-tables")
async def list_tables(rid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    rows = (await session.execute(text(
        "SELECT * FROM food_reservation_tables WHERE restaurant_id = :rid ORDER BY sort_order ASC, created_at ASC"
    ), {"rid": rid})).fetchall()
    return {"tables": [_table(t) for t in rows]}


async def _validate_area(session: AsyncSession, rid: str, area_id: str) -> None:
    area = (await session.execute(text(
        "SELECT id FROM food_reservation_areas WHERE id = :aid AND restaurant_id = :rid"
    ), {"aid": area_id, "rid": rid})).fetchone()
    if not area:
        raise HTTPException(422, "area_id does not belong to this restaurant")


@manage_router.post("/{rid}/reservation-tables", status_code=201)
async def add_table(rid: str, payload: TableIn, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    await _validate_area(session, rid, payload.area_id)
    next_order = payload.sort_order
    if next_order is None:
        next_order = int((await session.execute(text(
            "SELECT COALESCE(MAX(sort_order), -1) FROM food_reservation_tables WHERE restaurant_id = :rid AND area_id = :aid"
        ), {"rid": rid, "aid": payload.area_id})).scalar_one()) + 1
    tid = f"tbl_{uuid.uuid4().hex[:16]}"
    try:
        await session.execute(text("""
            INSERT INTO food_reservation_tables
                (id, restaurant_id, area_id, code, seats, is_active, pos_x, pos_y, sort_order)
            VALUES (:id, :rid, :aid, :code, :seats, :active, :px, :py, :ord)
        """), {
            "id": tid, "rid": rid, "aid": payload.area_id,
            "code": payload.code, "seats": payload.seats,
            "active": payload.is_active if payload.is_active is not None else True,
            "px": payload.pos_x, "py": payload.pos_y, "ord": next_order,
        })
        await session.commit()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "uq_food_res_table_code" in msg:
            raise HTTPException(409, f"Table code '{payload.code}' already exists for this restaurant")
        raise
    row = (await session.execute(text("SELECT * FROM food_reservation_tables WHERE id = :id"), {"id": tid})).fetchone()
    return _table(row)


@manage_router.patch("/{rid}/reservation-tables/{tid}")
async def patch_table(rid: str, tid: str, payload: TablePatch, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    row = (await session.execute(text(
        "SELECT * FROM food_reservation_tables WHERE id = :tid AND restaurant_id = :rid"
    ), {"tid": tid, "rid": rid})).fetchone()
    if not row:
        raise HTTPException(404, "Table not found")
    fields = payload.model_dump(exclude_none=True)
    if not fields:
        return _table(row)
    if "area_id" in fields:
        await _validate_area(session, rid, fields["area_id"])
    sets, params = [], {"id": tid}
    for k, v in fields.items():
        sets.append(f"{k} = :{k}")
        params[k] = v
    sets.append("updated_at = now()")
    try:
        await session.execute(text(
            f"UPDATE food_reservation_tables SET {', '.join(sets)} WHERE id = :id"
        ), params)
        await session.commit()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "uq_food_res_table_code" in msg:
            raise HTTPException(409, f"Table code '{payload.code}' already exists for this restaurant")
        raise
    row = (await session.execute(text("SELECT * FROM food_reservation_tables WHERE id = :id"), {"id": tid})).fetchone()
    return _table(row)


@manage_router.delete("/{rid}/reservation-tables/{tid}", status_code=204)
async def delete_table(rid: str, tid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    r = await session.execute(text(
        "DELETE FROM food_reservation_tables WHERE id = :tid AND restaurant_id = :rid"
    ), {"tid": tid, "rid": rid})
    await session.commit()
    if r.rowcount == 0:
        raise HTTPException(404, "Table not found")
