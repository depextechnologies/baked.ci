"""BAKĒD Platform — FastAPI entry point.

Configuration Driven Modular Monolith.
Shared platform foundation + Business Domain Modules.
"""
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import logging
import os
import asyncio

# Load env before anything imports core modules
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from core.db import engine  # noqa: E402
from shared.auth.routes import router as auth_router  # noqa: E402
from shared.customer.routes import router as customer_router  # noqa: E402
from shared.addresses.routes import router as addresses_router  # noqa: E402
from modules.express.routes import router as express_router  # noqa: E402
from shared.config_svc.routes import router as config_router  # noqa: E402
from shared.ai.routes import router as ai_router  # noqa: E402
from shared.admin.routes import router as admin_router  # noqa: E402
from shared.admin.module_routes import router as admin_module_router  # noqa: E402
from shared.admin.store_routes import router as admin_stores_router  # noqa: E402
from shared.admin.mart_catalog_routes import router as admin_mart_catalog_router  # noqa: E402
from shared.admin.inventory_control_tower import router as admin_inventory_ct_router  # noqa: E402
from shared.admin.replenishment_routes import router as admin_replenishment_router  # noqa: E402
from shared.admin.transfers_routes import router as admin_transfers_router  # noqa: E402
from shared.admin.category_requests import (  # noqa: E402
    admin_router as admin_category_req_router,
    partner_router as partner_category_req_router,
)
from shared.suppliers.routes import (  # noqa: E402
    public_router as supplier_public_router,
    admin_router as admin_supplier_router,
)
from modules.mart.routes import router as mart_router  # noqa: E402
from modules.mart.orders import router as orders_router  # noqa: E402
from modules.mart_partner.routes import router as mart_partner_router, admin_router as mart_partner_admin_router, partner_router as partner_portal_router  # noqa: E402
from modules.mart_partner.staff_routes import staff_router as partner_staff_router  # noqa: E402
from modules.mart_partner.inventory_routes import router as partner_inventory_router  # noqa: E402
from modules.mart_partner.inventory_ops_routes import router as partner_inventory_ops_router  # noqa: E402
from seed import run_seed  # noqa: E402

app = FastAPI(title="BAKĒD Platform API", version="1.0.0")

logger = logging.getLogger("baked")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"platform": "BAKĒD", "version": "1.0.0", "modules": ["mart", "food", "shop", "express", "auto", "immo"]}


@api_router.get("/health")
async def health():
    """Deep health check — verifies the app is up AND the DB is reachable.

    Returns 200 with db='up' when SELECT 1 succeeds, 503 with db='down' when
    the pool cannot round-trip. Previously this endpoint returned 200 even
    when Postgres was down, silently masking data-integrity outages.
    """
    from sqlalchemy import text
    from fastapi import Response
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "up"}
    except Exception as e:  # noqa: BLE001
        logger.error("baked.health db_check_failed err=%s", e)
        return Response(
            content='{"status":"degraded","db":"down"}',
            status_code=503,
            media_type="application/json",
        )


# --- Shared Platform Foundation ---
api_router.include_router(auth_router)
api_router.include_router(customer_router)
api_router.include_router(addresses_router)
api_router.include_router(express_router)
api_router.include_router(config_router)
api_router.include_router(ai_router)
api_router.include_router(admin_router)
api_router.include_router(admin_module_router)
api_router.include_router(admin_stores_router)
api_router.include_router(admin_mart_catalog_router)
api_router.include_router(admin_inventory_ct_router)
api_router.include_router(admin_replenishment_router)
api_router.include_router(admin_transfers_router)
api_router.include_router(admin_category_req_router)
api_router.include_router(partner_category_req_router)
api_router.include_router(supplier_public_router)
api_router.include_router(admin_supplier_router)

# --- Business Domain Modules ---
api_router.include_router(mart_router)
api_router.include_router(orders_router)
# Partner Platform — Stage 1 (Public Application). Stage 2 (Super Admin Review)
# is served under the admin router in a later slice.
api_router.include_router(mart_partner_router)
api_router.include_router(mart_partner_admin_router)
api_router.include_router(partner_portal_router)
api_router.include_router(partner_staff_router)
api_router.include_router(partner_inventory_router)
api_router.include_router(partner_inventory_ops_router)
# TODO: food, shop, express, auto, immo

app.include_router(api_router)

# ---- Postgres-outage-friendly middleware ----
# When Postgres goes briefly unreachable (container restart, VM reschedule),
# every request bubbles up a `ConnectionRefusedError` / `OperationalError`
# from asyncpg. Without this middleware, uvicorn returns a raw 500 with the
# full traceback in the body — the frontend's react-error-overlay catches
# that and shows a scary red "Uncaught runtime errors" panel. This handler
# collapses those into a clean 503 JSON that the customer app can render
# as a friendly "We're briefly reconnecting to the database" toast.
from fastapi import Request
from fastapi.responses import JSONResponse
from asyncpg.exceptions import PostgresConnectionError  # type: ignore
from sqlalchemy.exc import OperationalError, DBAPIError, InterfaceError


@app.middleware("http")
async def _pg_outage_shield(request: Request, call_next):
    try:
        return await call_next(request)
    except (ConnectionRefusedError, OperationalError, InterfaceError,
            PostgresConnectionError) as e:
        logger.error("baked.pg_outage path=%s err=%s", request.url.path, e)
        return JSONResponse(
            status_code=503,
            content={
                "code": "db_unavailable",
                "detail": "The database is briefly unreachable — please retry in a few seconds.",
            },
            headers={"Retry-After": "3"},
        )
    except DBAPIError as e:
        # DBAPIError with `connection_invalidated` means the pool got booted
        # because postgres restarted mid-request; treat identically.
        if getattr(e, "connection_invalidated", False):
            logger.error("baked.pg_outage path=%s connection_invalidated", request.url.path)
            return JSONResponse(
                status_code=503,
                content={"code": "db_unavailable",
                         "detail": "The database just recovered — please retry."},
                headers={"Retry-After": "3"},
            )
        raise


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",  # reflect the request Origin (required when credentials=True; wildcard "*" is invalid)
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@app.on_event("startup")
async def _on_startup():
    """Startup hook — wait for Postgres, run Alembic migrations, then seed.

    RCA (Fixing_Prompt.docx 2026-02): backend regularly restarts before the
    postgres_launcher has finished binding to port 5432. The seed used to
    fail silently on the first `Connect call failed` and leave the DB empty,
    which broke every configuration-driven module (auth, MART, EXPRESS, …).
    We now retry the DB connection up to ~30s before giving up.

    RCA (2026-02-04 data-loss bug): the previous startup called
    `Base.metadata.create_all()`, which races Alembic's `CREATE EXTENSION
    IF NOT EXISTS pg_trgm` and can silently skip the pg_trgm-dependent
    indexes on `mart_products`. The schema block also lived inside the same
    try/except as the seed, so a schema failure silently masked a missing
    seed too. We now:
      1. Run Alembic migrations programmatically to `head`, in-process.
      2. If that fails, we raise — startup halts so the pod restarts and
         the operator sees a real error instead of an empty database.
      3. Seed runs in its own try/except so a seed regression can never
         hide a schema regression, and vice-versa.
    """
    from sqlalchemy import text
    from core.db import engine as _engine

    logger.info("baked.startup waiting for postgres…")
    for attempt in range(30):
        try:
            async with _engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            logger.info("baked.startup postgres ready (attempt %d)", attempt + 1)
            break
        except Exception as e:  # noqa: BLE001
            logger.warning("baked.startup postgres not ready attempt=%d err=%s", attempt + 1, e)
            await asyncio.sleep(1)
    else:
        logger.error("baked.startup postgres never became ready — skipping migrations + seed")
        return

    # ---- 1) Schema: run Alembic migrations to head (in-process) ----
    # This replaces the old `Base.metadata.create_all()` call. Migrations
    # own DDL end-to-end now, so `CREATE EXTENSION pg_trgm` runs before
    # any index that depends on it, and every schema change lands with a
    # proper revision history instead of implicit auto-DDL from Python
    # models.
    try:
        logger.info("baked.startup running alembic upgrade head…")
        from alembic.config import Config
        from alembic import command as alembic_command
        cfg = Config(str(ROOT_DIR / "alembic.ini"))
        # env.py already reads DATABASE_URL from .env; nothing to inject here.
        # Run in a threadpool because alembic uses a sync engine internally.
        await asyncio.to_thread(alembic_command.upgrade, cfg, "head")
        logger.info("baked.startup alembic upgrade head complete")
    except Exception as e:  # noqa: BLE001
        logger.exception("baked.startup migrations_failed err=%s", e)
        # Deliberately DO NOT swallow: a schema failure at boot must halt
        # startup so ops sees a real signal. Previously we masked this by
        # bundling it with the seed try/except.
        raise

    # ---- 2) Seed: separate try/except so a schema regression can never
    # silently hide a seed regression, and vice-versa. ----
    try:
        logger.info("baked.startup running seed…")
        await run_seed()
    except Exception as e:  # noqa: BLE001
        logger.exception("baked.seed_failed err=%s", e)
    logger.info("baked.startup done")


@app.on_event("shutdown")
async def _on_shutdown():
    await engine.dispose()