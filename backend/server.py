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
from modules.mart.routes import router as mart_router  # noqa: E402
from modules.mart.orders import router as orders_router  # noqa: E402
from seed import run_seed  # noqa: E402

app = FastAPI(title="BAKĒD Platform API", version="1.0.0")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"platform": "BAKĒD", "version": "1.0.0", "modules": ["mart", "food", "shop", "express", "auto", "immo"]}


@api_router.get("/health")
async def health():
    return {"status": "ok"}


# --- Shared Platform Foundation ---
api_router.include_router(auth_router)
api_router.include_router(customer_router)
api_router.include_router(addresses_router)
api_router.include_router(express_router)
api_router.include_router(config_router)
api_router.include_router(ai_router)
api_router.include_router(admin_router)
api_router.include_router(admin_module_router)

# --- Business Domain Modules ---
api_router.include_router(mart_router)
api_router.include_router(orders_router)
# TODO: food, shop, express, auto, immo

app.include_router(api_router)

_DEV_ORIGINS = ["http://localhost", "http://localhost:3000", "http://127.0.0.1:3000"]
_cors_origins_raw = os.environ.get("CORS_ORIGINS", "")
_allowed_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
if not _allowed_origins:
    if (os.environ.get("APP_ENV") or "").lower() == "production":
        raise RuntimeError("CORS_ORIGINS must be set to the site's real origin(s) in production")
    _allowed_origins = _DEV_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("baked")


@app.on_event("startup")
async def _on_startup():
    logger.info("baked.startup running seed…")
    try:
        await run_seed()
    except Exception as e:  # noqa: BLE001
        logger.exception("baked.seed_failed err=%s", e)
    logger.info("baked.startup done")


@app.on_event("shutdown")
async def _on_shutdown():
    await engine.dispose()
