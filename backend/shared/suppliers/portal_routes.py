"""MARTbakēd Supplier Portal — Phase 2B (post-login).

Routes (all require a supplier JWT with role="supplier"):

  GET   /api/supplier/me                            — current supplier snapshot
  PATCH /api/supplier/me/profile                    — edit profile (critical fields flip → action_required)
  GET   /api/supplier/me/documents                  — list live docs
  POST  /api/supplier/me/documents                  — add doc (accepts storage_path returned by /upload)
  DELETE /api/supplier/me/documents/{doc_id}        — soft-delete
  GET   /api/supplier/me/supply-locations           — list non-business coverage rows
  POST  /api/supplier/me/supply-locations           — add coverage row
  DELETE /api/supplier/me/supply-locations/{loc_id} — remove coverage row
  GET   /api/supplier/me/catalogue                  — supplier's catalogue rows joined with master
  POST  /api/supplier/me/catalogue                  — add/upsert catalogue row
  PATCH /api/supplier/me/catalogue/{sp_id}          — edit cost / MOQ / lead-time / active
  DELETE /api/supplier/me/catalogue/{sp_id}         — hard-delete (removes link, keeps master intact)
  GET   /api/supplier/me/product-requests           — supplier's proposals
  POST  /api/supplier/me/product-requests           — propose a new master product
  POST  /api/supplier/uploads                       — multipart file upload → object storage → returns storage_path + serve URL
  GET   /api/supplier/files/{path:path}             — auth-gated download proxy

Admin (Super Admin governance) — mounted separately via admin_prod_req_router:
  GET   /api/admin/modules/mart/suppliers/product-requests
  GET   /api/admin/modules/mart/suppliers/product-requests/{req_id}
  POST  /api/admin/modules/mart/suppliers/product-requests/{req_id}/approve
  POST  /api/admin/modules/mart/suppliers/product-requests/{req_id}/reject
"""
from __future__ import annotations
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Query, Request,
    Response, UploadFile,
)
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser, MartCategory, MartProduct,
    Supplier, SupplierApplication, SupplierBankInfo, SupplierCategoryInterest,
    SupplierContact, SupplierDocument, SupplierProduct, SupplierProductRequest,
    SupplierReviewAudit, SupplierSupplyLocation, SUPPLIER_DOCUMENT_TYPES,
)
from core.providers import object_storage
from core.security import decode_token, verify_password

log = logging.getLogger("baked.supplier_portal")


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

async def get_current_supplier(request: Request, session: AsyncSession = Depends(get_session)) -> Supplier:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except Exception as exc:
        raise HTTPException(401, "Invalid token") from exc
    if payload.get("role") != "supplier":
        raise HTTPException(403, "Supplier role required")
    supplier = await session.get(Supplier, payload.get("sub") or payload.get("uid") or payload.get("user_id"))
    if not supplier:
        raise HTTPException(401, "Supplier not found")
    if supplier.status not in ("approved", "action_required") or not supplier.supplier_portal_active:
        raise HTTPException(403, {"code": "not_active", "message": "Supplier portal is not active."})
    return supplier


# ---------------------------------------------------------------------------
# Serialisers
# ---------------------------------------------------------------------------

def _sup_dict(s: Supplier) -> dict:
    return {
        "id": s.id, "code": s.code, "seller_slug": s.seller_slug, "business_name": s.business_name,
        "trading_name": s.trading_name, "business_type": s.business_type,
        "business_type_other": s.business_type_other,
        "registration_number": s.registration_number, "tax_id": s.tax_id,
        "business_email": s.business_email, "business_phone": s.business_phone,
        "website": s.website, "years_in_operation": s.years_in_operation,
        "country": s.country, "default_currency": s.default_currency,
        "status": s.status, "supplier_portal_active": s.supplier_portal_active,
        "phone_verified": s.phone_verified, "email_verified": s.email_verified,
        "approved_at": s.approved_at.isoformat() if s.approved_at else None,
    }


def _doc_dict(d: SupplierDocument) -> dict:
    return {
        "id": d.id, "document_type": d.document_type, "title": d.title,
        "file_url": d.file_url, "storage_path": d.storage_path,
        "original_filename": d.original_filename, "size_bytes": d.size_bytes,
        "content_type": d.content_type,
        "issued_on": d.issued_on.isoformat() if d.issued_on else None,
        "expires_on": d.expires_on.isoformat() if d.expires_on else None,
        "verification_status": d.verification_status,
        "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
    }


def _loc_dict(l: SupplierSupplyLocation) -> dict:
    return {
        "id": l.id, "kind": l.kind, "label": l.label, "city": l.city,
        "country": l.country, "zone": l.zone, "warehouse_id": l.warehouse_id,
        "address": l.address,
        "latitude": float(l.latitude) if l.latitude is not None else None,
        "longitude": float(l.longitude) if l.longitude is not None else None,
        "postal_code": l.postal_code, "service_radius_km": l.service_radius_km,
        "is_business_location": l.is_business_location,
        "approval_status": l.approval_status,
    }


def _sp_dict(sp: SupplierProduct, mp: Optional[MartProduct] = None) -> dict:
    d = {
        "id": sp.id, "supplier_id": sp.supplier_id,
        "master_product_id": sp.master_product_id,
        "supplier_sku": sp.supplier_sku,
        "cost_price": float(sp.cost_price),
        "currency": sp.currency, "moq": sp.moq,
        "lead_time_days": sp.lead_time_days, "is_active": sp.is_active,
        "notes": sp.notes,
        "created_at": sp.created_at.isoformat() if sp.created_at else None,
        "updated_at": sp.updated_at.isoformat() if sp.updated_at else None,
    }
    if mp:
        d["master"] = {
            "id": mp.id, "name": mp.name, "sku": getattr(mp, "sku_code", None),
            "brand": mp.brand, "image_url": mp.image,
            "category_slug": mp.category_slug, "country": mp.country,
            "mrp": float(mp.mrp) if getattr(mp, "mrp", None) is not None else None,
        }
    return d


def _req_dict(r: SupplierProductRequest) -> dict:
    return {
        "id": r.id, "supplier_id": r.supplier_id,
        "proposed_name": r.proposed_name,
        "proposed_category_id": r.proposed_category_id,
        "proposed_ean_upc": r.proposed_ean_upc,
        "proposed_manufacturer": r.proposed_manufacturer,
        "proposed_pack_size": r.proposed_pack_size,
        "proposed_net_qty": r.proposed_net_qty,
        "proposed_short_description": r.proposed_short_description,
        "proposed_cost_price": float(r.proposed_cost_price) if r.proposed_cost_price is not None else None,
        "proposed_currency": r.proposed_currency,
        "proposed_moq": r.proposed_moq,
        "proposed_lead_time_days": r.proposed_lead_time_days,
        "image_url": r.image_url, "notes": r.notes, "status": r.status,
        "review_notes": r.review_notes,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        "created_master_product_id": r.created_master_product_id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# ===========================================================================
# Supplier-facing router
# ===========================================================================

router = APIRouter(prefix="/supplier", tags=["supplier-portal"])


@router.get("/me")
async def get_me(supplier: Supplier = Depends(get_current_supplier)):
    return _sup_dict(supplier)


# ------------------------------- Profile -----------------------------------

CRITICAL_FIELDS = {"business_name", "tax_id", "registration_number"}


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    business_name: Optional[str] = Field(None, min_length=2, max_length=300)
    trading_name: Optional[str] = None
    business_type: Optional[str] = None
    business_type_other: Optional[str] = None
    registration_number: Optional[str] = None
    tax_id: Optional[str] = None
    business_email: Optional[EmailStr] = None
    business_phone: Optional[str] = None
    website: Optional[str] = None
    years_in_operation: Optional[int] = None
    default_currency: Optional[str] = None


@router.patch("/me/profile")
async def patch_profile(
    payload: ProfilePatch,
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    # Detect changes to critical fields — flips supplier & latest application
    # to `action_required` (per doc §12).
    data = payload.model_dump(exclude_unset=True)
    critical_changed = False
    for k, v in data.items():
        prev = getattr(supplier, k, None)
        if v is not None and prev != v:
            setattr(supplier, k, v)
            if k in CRITICAL_FIELDS:
                critical_changed = True

    if critical_changed:
        supplier.status = "action_required"
        latest_app = (await session.execute(
            select(SupplierApplication)
            .where(SupplierApplication.supplier_id == supplier.id)
            .order_by(SupplierApplication.created_at.desc())
        )).scalars().first()
        if latest_app:
            latest_app.status = "action_required"
            latest_app.action_required_notes = (
                "Critical profile field changed after approval — please re-verify."
            )
        session.add(SupplierReviewAudit(
            supplier_id=supplier.id, application_id=latest_app.id if latest_app else None,
            action="request_information", from_status="approved", to_status="action_required",
            notes="Auto-flag: supplier edited critical profile field(s): "
                  + ", ".join(sorted(k for k in data if k in CRITICAL_FIELDS)),
        ))
    await session.commit()
    return {"supplier": _sup_dict(supplier), "critical_re_verification": critical_changed}


# ------------------------------- Documents ---------------------------------


class DocumentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_type: str
    title: Optional[str] = None
    file_url: str
    storage_path: Optional[str] = None
    original_filename: Optional[str] = None
    size_bytes: Optional[int] = None
    content_type: Optional[str] = None
    issued_on: Optional[str] = None
    expires_on: Optional[str] = None


@router.get("/me/documents")
async def list_documents(supplier: Supplier = Depends(get_current_supplier), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(
        select(SupplierDocument)
        .where(SupplierDocument.supplier_id == supplier.id, SupplierDocument.is_deleted.is_(False))
        .order_by(SupplierDocument.uploaded_at.desc())
    )).scalars().all()
    return {"items": [_doc_dict(d) for d in rows]}


@router.post("/me/documents", status_code=201)
async def add_document(
    payload: DocumentIn,
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    if payload.document_type not in SUPPLIER_DOCUMENT_TYPES:
        raise HTTPException(400, f"Invalid document_type: {payload.document_type}")
    if not payload.file_url:
        raise HTTPException(400, "file_url is required")
    from datetime import date as _date
    doc = SupplierDocument(
        supplier_id=supplier.id, document_type=payload.document_type,
        title=payload.title, file_url=payload.file_url,
        storage_path=payload.storage_path,
        original_filename=payload.original_filename,
        size_bytes=payload.size_bytes, content_type=payload.content_type,
        issued_on=_date.fromisoformat(payload.issued_on) if payload.issued_on else None,
        expires_on=_date.fromisoformat(payload.expires_on) if payload.expires_on else None,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return _doc_dict(doc)


@router.delete("/me/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    doc = await session.get(SupplierDocument, doc_id)
    if not doc or doc.supplier_id != supplier.id or doc.is_deleted:
        raise HTTPException(404, "Document not found")
    doc.is_deleted = True
    await session.commit()
    return {"ok": True}


# ------------------------------- Supply Locations --------------------------


class LocationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(..., description="supply_city | supply_zone | supply_country")
    label: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    zone: Optional[str] = None
    service_radius_km: Optional[int] = None


@router.get("/me/supply-locations")
async def list_locations(supplier: Supplier = Depends(get_current_supplier), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(
        select(SupplierSupplyLocation)
        .where(SupplierSupplyLocation.supplier_id == supplier.id,
               SupplierSupplyLocation.is_business_location.is_(False))
        .order_by(SupplierSupplyLocation.created_at.desc())
    )).scalars().all()
    return {"items": [_loc_dict(l) for l in rows]}


@router.post("/me/supply-locations", status_code=201)
async def add_location(
    payload: LocationIn,
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    if payload.kind not in ("supply_city", "supply_zone", "supply_country"):
        raise HTTPException(400, "kind must be supply_city|supply_zone|supply_country")
    loc = SupplierSupplyLocation(
        supplier_id=supplier.id, kind=payload.kind,
        label=payload.label or payload.city or payload.zone or payload.country or payload.kind,
        city=payload.city, country=(payload.country or supplier.country).upper(),
        zone=payload.zone, service_radius_km=payload.service_radius_km,
        is_business_location=False, approval_status="pending",
    )
    session.add(loc)
    await session.commit()
    await session.refresh(loc)
    return _loc_dict(loc)


@router.delete("/me/supply-locations/{loc_id}")
async def delete_location(
    loc_id: str,
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    loc = await session.get(SupplierSupplyLocation, loc_id)
    if not loc or loc.supplier_id != supplier.id or loc.is_business_location:
        raise HTTPException(404, "Location not found or not editable")
    await session.delete(loc)
    await session.commit()
    return {"ok": True}


# ------------------------------- Catalogue ---------------------------------


class CatalogueIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    master_product_id: str
    supplier_sku: Optional[str] = None
    cost_price: float = Field(..., ge=0)
    currency: Optional[str] = None
    moq: int = Field(1, ge=1)
    lead_time_days: int = Field(0, ge=0)
    notes: Optional[str] = None


class CataloguePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supplier_sku: Optional[str] = None
    cost_price: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = None
    moq: Optional[int] = Field(None, ge=1)
    lead_time_days: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    notes: Optional[str] = None


@router.get("/me/catalogue")
async def list_catalogue(
    q: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(SupplierProduct, MartProduct).join(
        MartProduct, MartProduct.id == SupplierProduct.master_product_id
    ).where(SupplierProduct.supplier_id == supplier.id).order_by(SupplierProduct.updated_at.desc())
    if is_active is not None:
        stmt = stmt.where(SupplierProduct.is_active.is_(is_active))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (MartProduct.name.ilike(like))
            | (SupplierProduct.supplier_sku.ilike(like))
            | (MartProduct.sku_code.ilike(like))
        )
    rows = (await session.execute(stmt)).all()
    return {"items": [_sp_dict(sp, mp) for sp, mp in rows]}


@router.get("/me/catalogue/master-products")
async def list_master_products(
    q: Optional[str] = Query(None, min_length=1),
    limit: int = Query(30, ge=1, le=100),
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    """Type-ahead search over master products, scoped to the supplier's country."""
    stmt = select(MartProduct).where(MartProduct.country == supplier.country).limit(limit)
    if q:
        like = f"%{q}%"
        stmt = stmt.where((MartProduct.name.ilike(like)) | (MartProduct.sku_code.ilike(like)))
    rows = (await session.execute(stmt)).scalars().all()
    return {
        "items": [{
            "id": mp.id, "name": mp.name, "sku": mp.sku_code, "brand": mp.brand,
            "image_url": mp.image, "category_slug": mp.category_slug,
            "mrp": float(mp.mrp) if getattr(mp, "mrp", None) is not None else None,
        } for mp in rows],
    }


@router.post("/me/catalogue", status_code=201)
async def add_catalogue(
    payload: CatalogueIn,
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    mp = await session.get(MartProduct, payload.master_product_id)
    if not mp or mp.country != supplier.country:
        raise HTTPException(400, "Master product not found in your country")
    existing = (await session.execute(
        select(SupplierProduct).where(
            SupplierProduct.supplier_id == supplier.id,
            SupplierProduct.master_product_id == payload.master_product_id,
        )
    )).scalar_one_or_none()
    if existing:
        # Upsert-style: update existing row rather than 409
        existing.supplier_sku = payload.supplier_sku
        existing.cost_price = payload.cost_price
        existing.currency = payload.currency or supplier.default_currency
        existing.moq = payload.moq
        existing.lead_time_days = payload.lead_time_days
        existing.notes = payload.notes
        existing.is_active = True
        sp = existing
    else:
        sp = SupplierProduct(
            supplier_id=supplier.id, master_product_id=payload.master_product_id,
            supplier_sku=payload.supplier_sku,
            cost_price=payload.cost_price,
            currency=payload.currency or supplier.default_currency,
            moq=payload.moq, lead_time_days=payload.lead_time_days,
            notes=payload.notes,
        )
        session.add(sp)
    await session.commit()
    await session.refresh(sp)
    return _sp_dict(sp, mp)


@router.patch("/me/catalogue/{sp_id}")
async def patch_catalogue(
    sp_id: str,
    payload: CataloguePatch,
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    sp = await session.get(SupplierProduct, sp_id)
    if not sp or sp.supplier_id != supplier.id:
        raise HTTPException(404, "Catalogue row not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(sp, k, v)
    await session.commit()
    mp = await session.get(MartProduct, sp.master_product_id)
    return _sp_dict(sp, mp)


@router.delete("/me/catalogue/{sp_id}")
async def delete_catalogue(
    sp_id: str,
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    sp = await session.get(SupplierProduct, sp_id)
    if not sp or sp.supplier_id != supplier.id:
        raise HTTPException(404, "Catalogue row not found")
    await session.delete(sp)
    await session.commit()
    return {"ok": True}


# ------------------------------- Product Requests --------------------------


class ProductRequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    proposed_name: str = Field(..., min_length=2, max_length=400)
    proposed_category_id: Optional[str] = None
    proposed_ean_upc: Optional[str] = None
    proposed_manufacturer: Optional[str] = None
    proposed_pack_size: Optional[str] = None
    proposed_net_qty: Optional[str] = None
    proposed_short_description: Optional[str] = None
    proposed_cost_price: Optional[float] = Field(None, ge=0)
    proposed_currency: Optional[str] = None
    proposed_moq: Optional[int] = Field(None, ge=1)
    proposed_lead_time_days: Optional[int] = Field(None, ge=0)
    image_url: Optional[str] = None
    notes: Optional[str] = None


@router.get("/me/product-requests")
async def list_product_requests(
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(
        select(SupplierProductRequest)
        .where(SupplierProductRequest.supplier_id == supplier.id)
        .order_by(SupplierProductRequest.created_at.desc())
    )).scalars().all()
    return {"items": [_req_dict(r) for r in rows]}


@router.post("/me/product-requests", status_code=201)
async def create_product_request(
    payload: ProductRequestIn,
    supplier: Supplier = Depends(get_current_supplier),
    session: AsyncSession = Depends(get_session),
):
    if payload.proposed_category_id:
        cat = await session.get(MartCategory, payload.proposed_category_id)
        if not cat or cat.country != supplier.country:
            raise HTTPException(400, "Category not found in your country")
    r = SupplierProductRequest(
        supplier_id=supplier.id, proposed_name=payload.proposed_name,
        proposed_category_id=payload.proposed_category_id,
        proposed_ean_upc=payload.proposed_ean_upc,
        proposed_manufacturer=payload.proposed_manufacturer,
        proposed_pack_size=payload.proposed_pack_size,
        proposed_net_qty=payload.proposed_net_qty,
        proposed_short_description=payload.proposed_short_description,
        proposed_cost_price=payload.proposed_cost_price,
        proposed_currency=payload.proposed_currency or supplier.default_currency,
        proposed_moq=payload.proposed_moq,
        proposed_lead_time_days=payload.proposed_lead_time_days,
        image_url=payload.image_url, notes=payload.notes,
    )
    session.add(r)
    await session.commit()
    await session.refresh(r)
    return _req_dict(r)


# ------------------------------- Uploads -----------------------------------

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
ALLOWED_MIME_PREFIXES = ("image/", "application/pdf",
                        "application/vnd.ms-excel",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/msword",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "text/csv", "text/plain")


@router.post("/uploads")
async def upload_file(
    file: UploadFile = File(...),
    kind: str = Form("document"),
    supplier: Supplier = Depends(get_current_supplier),
):
    """Multipart upload → Emergent object storage → returns metadata for the
    supplier to reference in `/me/documents` or `/me/product-requests`.
    """
    if kind not in ("document", "image"):
        raise HTTPException(400, "kind must be 'document' or 'image'")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Max file size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    ct = (file.content_type or "application/octet-stream").lower()
    if not any(ct.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        raise HTTPException(415, f"Unsupported content type: {ct}")

    ext = "bin"
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()[:8]
    path = f"{object_storage.APP_NAME}/suppliers/{supplier.id}/{kind}s/{uuid.uuid4().hex}.{ext}"
    try:
        result = object_storage.put_object(path, data, ct)
    except Exception as exc:  # noqa: BLE001
        log.exception("supplier.upload_failed", extra={"supplier": supplier.id})
        raise HTTPException(502, {"code": "storage_upload_failed", "message": str(exc)}) from exc

    # Public serve URL served by our own auth-gated proxy (see below).
    file_url = f"/api/supplier/files/{result['path']}"
    return {
        "storage_path": result["path"],
        "file_url": file_url,
        "size_bytes": result.get("size", len(data)),
        "content_type": ct,
        "original_filename": file.filename,
    }


@router.get("/files/{path:path}")
async def download_file(path: str, request: Request, session: AsyncSession = Depends(get_session)):
    """Auth-gated proxy: either the owning supplier or any admin can fetch.

    We do NOT expose direct storage URLs — per playbook constraints.
    """
    # Try supplier auth first, then admin auth.
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        try:
            payload = decode_token(auth.split(" ", 1)[1].strip())
            role = payload.get("role")
            sub = payload.get("sub") or payload.get("uid") or payload.get("user_id")
            if role == "supplier":
                # Path must start with .../suppliers/{supplier_id}/...
                if f"/suppliers/{sub}/" not in path:
                    raise HTTPException(403, "Forbidden")
            elif role in ("admin", "super_admin"):
                admin = await session.get(AdminUser, sub)
                if not admin:
                    raise HTTPException(401, "Invalid admin")
            else:
                raise HTTPException(403, "Forbidden")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(401, "Invalid token") from exc
    else:
        raise HTTPException(401, "Missing token")

    try:
        content, ct = object_storage.get_object(path)
    except Exception as exc:
        raise HTTPException(404, "File not found") from exc
    return Response(content=content, media_type=ct)


# ===========================================================================
# Admin — Product Request review
# ===========================================================================

admin_prod_req_router = APIRouter(
    prefix="/admin/modules/mart/suppliers/product-requests",
    tags=["admin-supplier-product-requests"],
)


def _admin_dep():
    from shared.admin.routes import get_current_admin
    return get_current_admin


@admin_prod_req_router.get("")
async def admin_list_product_requests(
    status: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    stmt = select(SupplierProductRequest, Supplier).join(
        Supplier, Supplier.id == SupplierProductRequest.supplier_id
    ).order_by(SupplierProductRequest.created_at.desc())
    if status:
        stmt = stmt.where(SupplierProductRequest.status == status)
    rows = (await session.execute(stmt)).all()
    bstmt = select(SupplierProductRequest.status, func.count(SupplierProductRequest.id)).group_by(SupplierProductRequest.status)
    brows = (await session.execute(bstmt)).all()
    buckets = {s: 0 for s in ("pending", "approved", "rejected", "withdrawn")}
    for s, c in brows:
        buckets[s] = c
    items = []
    for r, sup in rows:
        d = _req_dict(r)
        d["supplier"] = {"id": sup.id, "business_name": sup.business_name, "code": sup.code, "country": sup.country}
        items.append(d)
    return {"items": items, "buckets": buckets}


class AdminApproveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # SA can override / enrich the master product fields at approval time.
    name: Optional[str] = None
    sku: Optional[str] = None
    category_id: Optional[str] = None
    manufacturer: Optional[str] = None
    ean_upc: Optional[str] = None
    pack_size: Optional[str] = None
    net_qty: Optional[str] = None
    short_description: Optional[str] = None
    mrp: Optional[float] = None
    tax_pct: Optional[float] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    link_at_supplier_cost: bool = True


class AdminRejectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: str = Field(..., min_length=1)


@admin_prod_req_router.post("/{req_id}/approve")
async def admin_approve_request(
    req_id: str,
    payload: AdminApproveIn = AdminApproveIn(),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    r = await session.get(SupplierProductRequest, req_id)
    if not r:
        raise HTTPException(404, "Request not found")
    if r.status != "pending":
        raise HTTPException(409, f"Cannot approve a {r.status} request")
    supplier = await session.get(Supplier, r.supplier_id)

    # Create master product from proposal (SA overrides win)
    name = payload.name or r.proposed_name
    cat_id = payload.category_id or r.proposed_category_id
    if not cat_id:
        raise HTTPException(400, "category_id is required to create a master product")
    cat = await session.get(MartCategory, cat_id)
    if not cat or cat.country != supplier.country:
        raise HTTPException(400, "Category not in supplier's country")

    # Generate SKU + defaults required by mart_products
    sku = payload.sku or f"MRT-{supplier.country}-{uuid.uuid4().hex[:8].upper()}"
    default_price = payload.mrp or r.proposed_cost_price or 0
    mp = MartProduct(
        country=supplier.country, module="mart",
        category_slug=cat.slug,
        name=name, sku_code=sku,
        brand=(payload.manufacturer or r.proposed_manufacturer),
        image=(payload.image_url or r.image_url),
        price=default_price, currency=supplier.default_currency,
        mrp=payload.mrp,
        tax_pct=payload.tax_pct,
        ean_upc=(payload.ean_upc or r.proposed_ean_upc),
        manufacturer=(payload.manufacturer or r.proposed_manufacturer),
        pack_size=(payload.pack_size or r.proposed_pack_size),
        net_qty=None,  # net_qty is Numeric on MartProduct; proposals are strings — skip for safety
        short_description=(payload.short_description or r.proposed_short_description),
    )
    session.add(mp)
    await session.flush()

    # Auto-link to supplier at proposed cost
    if payload.link_at_supplier_cost and (r.proposed_cost_price is not None):
        session.add(SupplierProduct(
            supplier_id=supplier.id, master_product_id=mp.id,
            cost_price=r.proposed_cost_price,
            currency=r.proposed_currency or supplier.default_currency,
            moq=r.proposed_moq or 1, lead_time_days=r.proposed_lead_time_days or 0,
            is_active=True,
        ))

    r.status = "approved"
    r.review_notes = payload.notes
    r.reviewed_at = datetime.now(timezone.utc)
    r.reviewer_admin_id = admin.id
    r.created_master_product_id = mp.id

    await session.commit()
    await session.refresh(r)
    return {"request": _req_dict(r), "master_product_id": mp.id}


@admin_prod_req_router.post("/{req_id}/reject")
async def admin_reject_request(
    req_id: str,
    payload: AdminRejectIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    r = await session.get(SupplierProductRequest, req_id)
    if not r:
        raise HTTPException(404, "Request not found")
    if r.status != "pending":
        raise HTTPException(409, f"Cannot reject a {r.status} request")
    r.status = "rejected"
    r.review_notes = payload.notes
    r.reviewed_at = datetime.now(timezone.utc)
    r.reviewer_admin_id = admin.id
    await session.commit()
    return _req_dict(r)
