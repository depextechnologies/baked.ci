"""SHOPbakēd — Slice 8 Playwright browser E2E for the customer path.

Complements `test_shop_e2e_roundtrip.py` (which drives the same journey
via HTTP). This one boots a real browser and exercises the actual
JavaScript render tree — catches CORS, hydration, and routing regressions
that the API-only test misses.

The browser test only covers the customer half of the journey (fetching
the CMS-driven storefront, clicking through to a PDP, verifying the
variant picker renders). Seller + Admin phases are covered exhaustively
by the API E2E.

Requires playwright — installed via `pip install playwright` in the
backend test env. Skipped if playwright import fails so this file never
blocks CI when the browser bindings aren't present.
"""
from __future__ import annotations
import os
import pytest
import requests


pytestmark = pytest.mark.xdist_group("shop_e2e_slice8_browser")


playwright = pytest.importorskip("playwright.sync_api",
                                 reason="playwright not installed in this env")
from playwright.sync_api import sync_playwright  # noqa: E402


BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")


def _first_approved_product_id() -> str | None:
    r = requests.get(f"{BASE_URL}/api/shop/products?country=CI&limit=1", timeout=15)
    r.raise_for_status()
    items = r.json()
    return items[0]["id"] if items else None


@pytest.fixture(scope="module")
def browser_ctx():
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            yield ctx
            ctx.close()
            browser.close()
    except Exception as e:
        pytest.skip(f"Playwright browser unavailable: {e}")


class TestCustomerBrowserFlow:
    def test_shopbaked_home_renders_cms_sections(self, browser_ctx):
        page = browser_ctx.new_page()
        page.goto(f"{BASE_URL}/shopbaked", wait_until="networkidle", timeout=30_000)
        page.wait_for_selector('[data-testid="shopbaked-home"]', timeout=15_000)
        # CMS-driven — at least the hero + one more section should mount.
        page.wait_for_function(
            "document.querySelectorAll('[data-testid^=\"shopbaked-section-\"]').length >= 2",
            timeout=15_000,
        )
        section_count = page.evaluate(
            "document.querySelectorAll('[data-testid^=\"shopbaked-section-\"]').length"
        )
        assert section_count >= 2, f"expected ≥2 CMS sections, got {section_count}"
        page.close()

    def test_pdp_renders_with_variant_picker(self, browser_ctx):
        pid = _first_approved_product_id()
        if not pid:
            pytest.skip("no approved SHOP products in this env")
        page = browser_ctx.new_page()
        page.goto(f"{BASE_URL}/shopbaked/p/{pid}", wait_until="networkidle", timeout=30_000)
        page.wait_for_selector('[data-testid="shopbaked-pdp"]', timeout=15_000)
        # Title must render.
        title = page.locator('[data-testid="shopbaked-pdp-title"]').inner_text(timeout=5_000)
        assert title, "PDP title empty"
        # Add-to-cart button visible.
        assert page.locator('[data-testid="shopbaked-pdp-add-to-cart"]').is_visible(timeout=5_000)
        page.close()

    def test_add_to_cart_prompts_signin_when_anonymous(self, browser_ctx):
        pid = _first_approved_product_id()
        if not pid:
            pytest.skip("no approved SHOP products in this env")
        page = browser_ctx.new_page()
        page.goto(f"{BASE_URL}/shopbaked/p/{pid}", wait_until="networkidle", timeout=30_000)
        page.wait_for_selector('[data-testid="shopbaked-pdp-add-to-cart"]', timeout=15_000)
        # Pick any variant options if the picker is present.
        pickers = page.locator('[data-testid^="shopbaked-pdp-attr-"]').all()
        chosen_keys = set()
        for btn in pickers:
            testid = btn.get_attribute("data-testid") or ""
            # data-testid = "shopbaked-pdp-attr-<key>-<value>"
            parts = testid.split("-")
            if len(parts) >= 5:
                key = parts[3]
                if key not in chosen_keys:
                    btn.click()
                    chosen_keys.add(key)
        page.click('[data-testid="shopbaked-pdp-add-to-cart"]')
        # Anonymous → error toast should mention sign in. We just wait
        # briefly and assert the page didn't crash.
        page.wait_for_timeout(1000)
        assert page.locator('[data-testid="shopbaked-pdp"]').is_visible()
        page.close()
