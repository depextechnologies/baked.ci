"""Demo supplier seed — MARTbakēd Phase 2A.

Creates 3 clearly-marked DEMO suppliers spanning the lifecycle statuses so
the review UI has something meaningful to render immediately after a fresh
container start. All rows are idempotent (id-based).
"""
from __future__ import annotations
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from core.models import (
    Supplier, SupplierApplication, SupplierContact, SupplierDocument,
    SupplierSupplyLocation, SupplierBankInfo, SupplierCategoryInterest,
    SupplierReviewAudit,
)
from core.security import hash_password


DEMO_SUPPLIERS = [
    {
        # Approved & portal-active — allows immediate supplier login smoke test
        "id": "sup_demo_delta_seed",
        "app_id": "supapp_demo_delta_seed",
        "code": "SUP-CI-0001",
        "app_code": "MART-SUP-2026-00001",
        "business_name": "DEMO Delta Beverages CI",
        "trading_name": "Delta Beverages",
        "business_type": "distributor",
        "business_email": "demo-delta-supplier@test.example",
        "business_phone": "+2250700900001",
        "country": "CI",
        "status": "approved",
        "portal_active": True,
        "password": "Supplier1234!",
        "seller_slug": "delta",
        "categories": ["Boissons", "Boulangerie"],
        "location": {"label": "Delta HQ, Cocody", "city": "Abidjan",
                     "latitude": 5.3591, "longitude": -3.9880, "radius": 25},
    },
    {
        # Submitted — waiting for SA review
        "id": "sup_demo_echo_seed",
        "app_id": "supapp_demo_echo_seed",
        "code": None,
        "app_code": "MART-SUP-2026-00002",
        "business_name": "DEMO Echo Fresh Produce",
        "trading_name": "Echo Fresh",
        "business_type": "producer",
        "business_email": "demo-echo-supplier@test.example",
        "business_phone": "+2250700900002",
        "country": "CI",
        "status": "submitted",
        "portal_active": False,
        "password": None,
        "categories": ["Fruits & Légumes"],
        "location": {"label": "Echo Farm, Yopougon", "city": "Abidjan",
                     "latitude": 5.3450, "longitude": -4.0730, "radius": 40},
    },
    {
        # Action required — needs supplier to upload missing docs
        "id": "sup_demo_foxtrot_seed",
        "app_id": "supapp_demo_foxtrot_seed",
        "code": None,
        "app_code": "MART-SUP-2026-00003",
        "business_name": "DEMO Foxtrot Snacks Co.",
        "trading_name": "Foxtrot Snacks",
        "business_type": "manufacturer",
        "business_email": "demo-foxtrot-supplier@test.example",
        "business_phone": "+2250700900003",
        "country": "CI",
        "status": "action_required",
        "portal_active": False,
        "password": None,
        "categories": ["Snacks & Confiseries"],
        "action_notes": "Please upload a valid business registration certificate and manufacturer authorisation.",
        "location": {"label": "Foxtrot Plant, Marcory", "city": "Abidjan",
                     "latitude": 5.2960, "longitude": -3.9930, "radius": 15},
    },
]


async def seed_demo_suppliers(session: AsyncSession) -> None:
    from sqlalchemy import select
    from core.models import MartCategory, MartProduct, SupplierProduct

    for d in DEMO_SUPPLIERS:
        # Idempotency: skip if the demo supplier already exists.
        if await session.get(Supplier, d["id"]):
            continue

        supplier = Supplier(
            id=d["id"],
            code=d["code"],
            business_name=d["business_name"],
            trading_name=d["trading_name"],
            business_type=d["business_type"],
            business_email=d["business_email"],
            business_phone=d["business_phone"],
            country=d["country"],
            default_currency="XOF",
            module="mart",
            status=d["status"],
            supplier_portal_active=d["portal_active"],
            password_hash=hash_password(d["password"]) if d["password"] else None,
            phone_verified=True,
            # Backfill the URL slug on seed for approved suppliers so demo
            # portal deep-links (/martbaked/{slug}/portal/...) resolve
            # immediately without waiting for the SA-approval slug minting.
            seller_slug=d.get("seller_slug") if d["status"] == "approved" else None,
            approved_at=datetime.now(timezone.utc) if d["status"] == "approved" else None,
        )
        session.add(supplier)
        await session.flush()

        # Application row (status mirrors supplier for demo purposes).
        app = SupplierApplication(
            id=d["app_id"],
            application_code=d["app_code"],
            supplier_id=supplier.id,
            status=d["status"],
            current_step=9,
            phone_e164=d["business_phone"],
            submitted_at=datetime.now(timezone.utc),
            reviewed_at=datetime.now(timezone.utc) if d["status"] in ("approved", "action_required") else None,
            action_required_notes=d.get("action_notes"),
        )
        session.add(app)

        # Primary contact (owner)
        session.add(SupplierContact(
            supplier_id=supplier.id, is_primary=True,
            full_name=f"{d['trading_name']} Owner",
            position="Founder",
            phone=d["business_phone"],
            email=d["business_email"],
            nationality=d["country"],
            relationship="owner",
        ))

        # Business location pin
        loc = d["location"]
        session.add(SupplierSupplyLocation(
            supplier_id=supplier.id,
            kind="business_location",
            label=loc["label"], city=loc["city"], country=d["country"],
            latitude=loc["latitude"], longitude=loc["longitude"],
            service_radius_km=loc["radius"],
            is_business_location=True,
            approval_status="approved" if d["status"] == "approved" else "pending",
        ))

        # Sample document
        session.add(SupplierDocument(
            supplier_id=supplier.id,
            document_type="business_registration",
            title=f"{d['trading_name']} — Registration Certificate",
            file_url="https://example.com/demo/business-registration.pdf",
            verification_status="verified" if d["status"] == "approved" else "pending",
        ))

        # Bank info stub
        session.add(SupplierBankInfo(
            supplier_id=supplier.id,
            bank_name="Société Générale Côte d'Ivoire",
            account_holder=d["business_name"],
            account_number="00" + d["id"][-8:].upper(),
            preferred_method="bank_transfer",
            billing_country=d["country"],
        ))

        # Category interests — link to existing mart_categories where possible
        for cat_name in d["categories"]:
            cat = (await session.execute(
                select(MartCategory).where(
                    MartCategory.country == d["country"],
                    MartCategory.name == cat_name,
                )
            )).scalar_one_or_none()
            if cat:
                session.add(SupplierCategoryInterest(
                    supplier_id=supplier.id, category_id=cat.id, status="approved",
                ))

        # Audit trail entry
        if d["status"] == "approved":
            session.add(SupplierReviewAudit(
                supplier_id=supplier.id, application_id=app.id,
                action="approve", from_status="submitted", to_status="approved",
                notes="DEMO auto-approval",
            ))
        elif d["status"] == "action_required":
            session.add(SupplierReviewAudit(
                supplier_id=supplier.id, application_id=app.id,
                action="request_information", from_status="submitted",
                to_status="action_required", notes=d.get("action_notes"),
            ))
        else:
            session.add(SupplierReviewAudit(
                supplier_id=supplier.id, application_id=app.id,
                action="submit", from_status="draft", to_status="submitted",
            ))

    # Phase 2B: seed 5 catalogue lines for the approved DEMO Delta supplier so
    # the catalogue view has something to render on first boot.
    delta = await session.get(Supplier, "sup_demo_delta_seed")
    if delta:
        existing_links = (await session.execute(
            select(SupplierProduct).where(SupplierProduct.supplier_id == delta.id)
        )).scalars().all()
        if not existing_links:
            master_rows = (await session.execute(
                select(MartProduct).where(MartProduct.country == delta.country).limit(5)
            )).scalars().all()
            for i, mp in enumerate(master_rows):
                cost = float(mp.mrp) * 0.65 if getattr(mp, "mrp", None) else 500.0
                session.add(SupplierProduct(
                    supplier_id=delta.id, master_product_id=mp.id,
                    supplier_sku=f"DELTA-{(mp.sku_code or mp.id[:8])}",
                    cost_price=round(cost, 2),
                    currency=delta.default_currency,
                    moq=10 * (i + 1), lead_time_days=2 + i,
                    is_active=True,
                ))
