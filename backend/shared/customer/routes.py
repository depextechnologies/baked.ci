"""Customer profile + addresses."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.db import db
from core.models_base import _now_iso, new_id
from core.deps import get_current_customer

router = APIRouter(prefix="/customers", tags=["customer"])


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    locale: Optional[str] = None


class AddressIn(BaseModel):
    label: str = Field(..., examples=["Home", "Office"])
    line1: str
    line2: Optional[str] = None
    city: str
    country: str = "CI"
    landmark: Optional[str] = None
    instructions: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_default: bool = False


@router.get("/me")
async def get_me(customer: dict = Depends(get_current_customer)):
    return customer


@router.patch("/me")
async def update_me(payload: CustomerUpdate, customer: dict = Depends(get_current_customer)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = _now_iso()
    await db.customers.update_one({"id": customer["id"]}, {"$set": updates})
    return await db.customers.find_one({"id": customer["id"]}, {"_id": 0})


@router.get("/me/addresses")
async def list_addresses(customer: dict = Depends(get_current_customer)) -> List[dict]:
    return await db.customer_addresses.find(
        {"customer_id": customer["id"], "deleted_at": None}, {"_id": 0}
    ).to_list(50)


@router.post("/me/addresses")
async def create_address(payload: AddressIn, customer: dict = Depends(get_current_customer)):
    doc = payload.model_dump()
    doc.update(
        {
            "id": new_id("addr"),
            "customer_id": customer["id"],
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "deleted_at": None,
            "version": 1,
        }
    )
    if payload.is_default:
        await db.customer_addresses.update_many(
            {"customer_id": customer["id"]}, {"$set": {"is_default": False}}
        )
    await db.customer_addresses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/me/addresses/{address_id}")
async def delete_address(address_id: str, customer: dict = Depends(get_current_customer)):
    r = await db.customer_addresses.update_one(
        {"id": address_id, "customer_id": customer["id"]},
        {"$set": {"deleted_at": _now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Address not found")
    return {"ok": True}
