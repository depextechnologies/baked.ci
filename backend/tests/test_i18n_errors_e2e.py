"""i18n middleware + error localisation tests (Phase D · Workstream 3).

Validates the ASGI-level `_BakedLanguageMiddleware` correctly captures the
per-request language and that error handlers read it via `current_lang()`.

We avoid endpoints that touch the DB (event-loop-scoped async pool leaks
otherwise), and instead spin up a stub FastAPI app that exercises the
middleware + `t()` + `current_lang()` end-to-end.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from core.i18n import current_lang, resolve_lang, set_current_lang, t as _t


# --- Stub app that reuses the production middleware ------------------------

def _build_app():
    from server import _BakedLanguageMiddleware  # reuse the real middleware
    app = FastAPI()

    @app.get("/lang")
    async def lang_probe():
        return {"lang": current_lang()}

    @app.get("/err/product")
    async def err_product():
        raise HTTPException(404, _t("errors.order.product_not_found", current_lang()))

    @app.get("/err/shop")
    async def err_shop():
        raise HTTPException(404, _t("errors.shop.product_not_found", current_lang()))

    @app.get("/err/struct")
    async def err_struct():
        # Structured error: `code` must survive translation.
        raise HTTPException(409, {
            "code": "cart_empty",
            "message": _t("errors.order.cart_empty", current_lang()),
        })

    app.add_middleware(_BakedLanguageMiddleware)
    return app


@pytest.fixture(scope="module")
def client():
    return TestClient(_build_app())


# --- Middleware picks up header ------------------------------------------

def test_current_lang_from_header_fr(client):
    r = client.get("/lang", headers={"X-BAKED-Language": "fr"})
    assert r.status_code == 200
    assert r.json()["lang"] == "fr"


def test_current_lang_from_header_en(client):
    r = client.get("/lang", headers={"X-BAKED-Language": "en"})
    assert r.status_code == 200
    assert r.json()["lang"] == "en"


def test_current_lang_defaults_to_french(client):
    r = client.get("/lang")
    assert r.json()["lang"] == "fr"


def test_current_lang_from_accept_language(client):
    r = client.get("/lang", headers={"Accept-Language": "en-US,en;q=0.9"})
    assert r.json()["lang"] == "en"


def test_header_beats_query_and_accept_language(client):
    r = client.get(
        "/lang?lang=fr",
        headers={"X-BAKED-Language": "en", "Accept-Language": "fr-FR"},
    )
    assert r.json()["lang"] == "en"


# --- Error messages resolve to the requested language ---------------------

def test_error_localised_fr(client):
    r = client.get("/err/product", headers={"X-BAKED-Language": "fr"})
    assert r.status_code == 404
    assert "introuvable" in r.json()["detail"].lower()


def test_error_localised_en(client):
    r = client.get("/err/product", headers={"X-BAKED-Language": "en"})
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


def test_shop_error_localised_fr(client):
    r = client.get("/err/shop", headers={"X-BAKED-Language": "fr"})
    assert "SHOP introuvable".lower() in r.json()["detail"].lower()


def test_shop_error_localised_en(client):
    r = client.get("/err/shop", headers={"X-BAKED-Language": "en"})
    assert "not found" in r.json()["detail"].lower()


def test_structured_error_preserves_code_and_translates_message(client):
    r_fr = client.get("/err/struct", headers={"X-BAKED-Language": "fr"})
    r_en = client.get("/err/struct", headers={"X-BAKED-Language": "en"})
    assert r_fr.status_code == 409 and r_en.status_code == 409
    body_fr = r_fr.json()["detail"]
    body_en = r_en.json()["detail"]
    assert body_fr["code"] == body_en["code"] == "cart_empty"
    assert "panier" in body_fr["message"].lower()
    assert "cart" in body_en["message"].lower() and "empty" in body_en["message"].lower()


# --- Sequential calls don't leak language across requests ---------------

def test_no_language_bleed_between_requests(client):
    """Two requests in the same event loop must get their own language even
    when the ContextVar is set at ASGI-middleware level."""
    r1 = client.get("/lang", headers={"X-BAKED-Language": "en"})
    r2 = client.get("/lang", headers={"X-BAKED-Language": "fr"})
    r3 = client.get("/lang", headers={"X-BAKED-Language": "en"})
    assert r1.json()["lang"] == "en"
    assert r2.json()["lang"] == "fr"
    assert r3.json()["lang"] == "en"
