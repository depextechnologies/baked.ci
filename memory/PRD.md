# BAKĒD Platform v1.0 — Implementation Memory

## Latest (2026-03-10) — SHOP Product Bilingual Columns — COMPLETE
- ✅ **Schema migration `0047_shop_bilingual_product`**: added `title_fr` and `description_fr` columns on `shop_products` (both nullable — English stays canonical, French is an optional per-SKU override).
- ✅ **Backend contract** now round-trips both fields through: seller-portal create (`POST /api/shop/portal/products`), seller-portal patch (`PATCH …`), seller-portal get, storefront PDP (`GET /api/shop/products/{id}`), storefront list (`GET /api/shop/products`), cart hydrate (`GET /api/shop/cart/me`).
- ✅ **Seller portal UI** (`PortalShop.jsx`) exposes side-by-side "Title (English)" + "Titre (Français)" and "Description (English)" + "Description (Français)" fields; left-hand product list shows the French title if present with an "FR + EN" badge.
- ✅ **Storefront rendering** — new `pickProductTitle(product, lang)` / `pickProductDescription(product, lang)` helpers used in ProductCard, PDP heading, PDP image alt, PDP description block, and cart-line label. French is preferred when `i18n.language === "fr"`, falls back to English when the French value is empty.
- ✅ **Demo seed** now writes both `title` (English) and `title_fr` (French) for every demo product (362 rows across CI + IN reseeded).
- ✅ Live verified: `/shop/c/mode-femme` FR → "Premium Accessoires de mode femme" · "Weekender Chaussettes & Collants femme"; EN toggle → "Premium Women's Fashion Accessories" · "Weekender Women's Socks & Tights". No cross-language leaks.

## Previous (2026-03-10) — SHOPbakēd Full French Localisation — COMPLETE

**Root cause**: SHOP frontend components (`ShopHome.jsx`, `ShopCategory.jsx`, `ShopCategoriesIndex.jsx`, `ShopProduct.jsx`, `ShopCheckout.jsx`, `AddressPill.jsx`, `ShopbakedApp.jsx`) had never called `useTranslation` — they rendered raw English strings AND read CMS content (`section.title`, `config.slides[].headline`, etc.) directly from an English-only database seed. Product demo seed and MartAttribute names were also English-only.

**Fixes applied**:
1. **CMS content** — SHOP homepage seed (`modules/shop/homepage_seed.py`) rewritten so every user-visible string in hero slides, right-column promos, USP tiles, category grid, product carousel, promotional banner, and brand carousel carries a `_fr` sibling (`title_fr`, `subtitle_fr`, `headline_fr`, `description_fr`, `cta_label_fr`, `eyebrow_fr`, `heading_fr`, `label_fr`, `badge_fr`, `secondary_cta_label_fr`) — 40+ new bilingual fields. Existing English keys are preserved so admin/API contracts stay unchanged. Existing English-only rows deleted & re-seeded for both CI and IN.
2. **Frontend picker** — new `apps/shopbaked/lib/i18nCms.js` exposes `pickBilingual(obj, key, lang)` and `pickCatalogueName(row, lang)`. Every SHOP component now reads through the picker.
3. **All SHOP pages localised** — `ShopHome.jsx` (hero, USP, category grid, product carousel, promo banner, banner trio, brand carousel, CTA strip, ProductCard) + `ShopCategoriesIndex.jsx` + `ShopCategory.jsx` (search placeholder, subcategory rail, filter drawer, empty state, fresh-drops strip) + `ShopProduct.jsx` (back link, stock/condition/SKU/description labels, attribute picker names, colour swatch labels, CTA states) + `ShopCheckout.jsx` (address form, payment methods, order summary, order confirmation + PIN card) + `AddressPill.jsx` (header pill "CHOOSE DELIVERY / Set address").
4. **Product titles** — `demo_products_seed.py` `_title_for` now emits French labels ("Signature / Essentiel / Weekend / Premium") for CI and picks `sub.name_fr` first; description function returns French copy. Old English demo rows deleted & re-seeded (181 CI + 181 IN products, 362 variants each).
5. **Attribute schema** — colour codes (`black`, `silver`, `oak`, `space-grey`) and attribute names (`Size`, `Colour`, `Storage`, `Condition`) now translated on the frontend via `customer:shop.colour_label.*` and `customer:shop.attr_name.*` keys, so no schema migration was required.
6. **Language switcher** — `ShopbakedApp` now reads/writes to the global `i18n` instance so switching FR ↔ EN in the header propagates to every SHOP page immediately.

**Coverage**:
- SHOP home: **~50 hardcoded strings + ~40 CMS English fields → 0** English leaks in FR mode.
- SHOP categories index: fully localised (headline + sub-count + empty state).
- SHOP category detail: fully localised (search, filters, empty, fresh-drops strip, all attributes).
- SHOP PDP: fully localised (stock, condition, SKU labels, colour swatches, CTA states, description).
- SHOP checkout + order confirmation: fully localised (address form, payment methods, summary, PIN card).

**Live verified** (screenshots captured):
- `/shop` FR default → "Mode, tech & maison — chez des vendeurs BAKĒD vérifiés / Parcourir les catégories / Nouveautés / Vendeurs vérifiés / Livraison le jour même / Acheter par catégorie / Voir tout / sous-catégories".
- `/shop/categories` FR → "Toutes les catégories / Mode, électronique et lifestyle — expédiés par des vendeurs BAKĒD vérifiés".
- `/shop/c/mode-femme` FR → French product titles "Premium Accessoires de mode femme / Weekend Chaussettes & Collants femme / Signature Ensembles & Combinaisons femme" + attribute "Taille S · noir · +1 options".
- `/shop/p/shpprd_demo_accessoires-mode-femme` FR → "Retour au marketplace / COULEUR (noir · ivory) / TAILLE / Choisir les options / EN STOCK / État: neuf / Survolez pour zoomer".
- EN toggle instantly restores English on all pages.

## Previous (2026-03-09) — Order Tracking i18n — COMPLETE
- ✅ **18 strings localised** across `MobileOrderTracking.jsx` (11), `ExpressLiveTracking.jsx` (7) and `components/mobile/OrderTimeline.jsx` (stage code → localised label). Every hero, ETA line, stepper label, timeline label, driver card and CTA now switches FR↔EN.
- ✅ **~60 new keys** under `customer:orders.tracking.*` (MART live-tracking) and `customer:orders.live.*` (SEND WebSocket tracking) with `{{n}}` / `{{count}}` / `{{number}}` interpolation.
- ✅ `OrderTimeline` component now reads the timeline `code` (from the backend payload) and maps to `orders.tracking.timeline_*` keys — the backend keeps sending stable English codes; the frontend picks the locale-correct label so no backend change was required.
- ✅ Global coverage: **159 → 141 hardcoded strings (−11%)**. Cumulative Phase C onwards: **445 → 141 = −68%**.
- ✅ Live proof: `/send/booking/xxx/track` renders "Chargement du suivi en direct…" (FR) and swaps to "Loading live tracking…" on the EN toggle.

## Previous (2026-03-09) — SEND Wizard i18n — COMPLETE
- ✅ **~150 strings localised** across `ExpressWizard.jsx` (parcel booking funnel — 5 steps + booking confirmation), `MoversWizard.jsx` (movers booking funnel — 6 steps + landing) and shared `ExpressLayout.jsx` (header "Step X of Y" + footer "Continue" + Back aria-label). Zero remaining hardcoded English in the SEND funnel.
- ✅ **~160 new keys** under `customer:send.wizard.*` covering both wizards' every step, header, footer, confirmation, toasts, and empty states with `{{count}}` / `{{km}}` / `{{price}}` / `{{ref}}` interpolation.
- ✅ Date labels in `TimeSlotStep` now use `i18n.language`-aware `toLocaleDateString` (fr-FR vs en-US).
- ✅ Global coverage: **290 → 159 hardcoded strings (−45%)**. Cumulative Phase C onwards: **445 → 159 = −64%**.
- ✅ Live proof: `/send/movers` renders "DÉMÉNAGEURS PROFESSIONNELS / Type de déménagement", `/send/book/location` renders "Étape 1 sur 5 / Lieu de ramassage / Continuer"; EN toggle flips everything to "Step 1 of 5 / Pick-up & Drop Location / Continue".

## Previous (2026-03-08) — Account Screens i18n — COMPLETE
- ✅ **84 strings localised** across MobileWallet, MobileSettings, MobileHelpSupport, MobileRefer, MobileRewards, MobileActivities. **146 new i18n keys** under 6 new namespaces (`wallet_extra`, `settings`, `help`, `refer`, `rewards_page`, `activities`).
- ✅ **Bonus**: `DesktopProfileShell` guest state + sidebar nav + Log-out button now localised through `t()` and `useLocalePath()`.
- ✅ Global coverage: **374 → 290 hardcoded strings (−22%)**. Cumulative Phase C onwards: **445 → 290 = −35%**.
- ✅ Live proof: `/portefeuille` guest view fully French — zero English leaks.


## Previous (2026-03-08) — Checkout String i18n — COMPLETE
- ✅ **72 launch-blocker strings localised** across the 4 checkout files (MobileCheckout, MobileAddresses, AddressSelector, MobileOrderDelivered). Every string a customer sees at the money moment now switches FR↔EN.
- ✅ **95 new i18n keys** added to `customer.json` (checkout, address, address_selector, orders namespaces) with `{{param}}` interpolation and pluralised counts.
- ✅ Global coverage: **445 → 374 hardcoded strings (−16%)**. Remaining top offenders are all in the SENDbakēd wizard funnel (English-branded module, deferred).
- ✅ Live smoke-tested: FR homepage, `/paiement`, `/compte/adresses` all render 100% French, zero English leaks.

## Previous (2026-03-08) — Launch route audit + i18n coverage sweep — COMPLETE
- ✅ **Legal routes added**: `/confidentialite` ⇄ `/privacy`, `/conditions` ⇄ `/terms`. Registered in both `DesktopCustomerShell` + `MobileCustomerShell`. Footer legal links now emit locale-aware paths via `useLocalePath()`. `LocaleRouteSync` verified rewriting URL bar on FR/EN toggle.
- ✅ **Coverage sweep** (`/app/scripts/i18n_coverage_sweep.py`) — full report saved to `/app/memory/I18N_COVERAGE_REPORT.md`:
  - 58 customer-facing JSX files scanned
  - **14 (24%)** wire `useTranslation()`; **128 live `t()` call sites**
  - **445 hardcoded English strings** across 43 files
  - Top hotspot: `SEND` module (ExpressWizard 62 + MoversWizard 49 + ExpressHome 19 = 130 strings, ~30% — English brand, deferred)
  - **Launch-blocker residuals** (checkout journey): `MobileAddresses` (23) + `AddressSelector` (22) + `MobileCheckout` (13) + `MobileOrderDelivered` (14) = **87 strings across 4 files**
- ✅ **Launch route matrix**: 22/22 customer storefront routes French-first + English-aliased. `/send/*` and `/shop/*` kept as English brand paths per user's Workstream 2 rename.

## Previous (2026-03-08) — Phase C+ · URL Auto-Sync — COMPLETE
- ✅ `i18n/LocaleRouteSync.jsx` — mounted inside both customer shells; watches `location.pathname` + `i18n.language`, reverse-matches against `ROUTE_MAP` (both static aliases and `:param` patterns via `matchPath`), and rewrites the URL bar with `navigate(newPath, { replace: true })`. Zero-DOM observer.
- ✅ **Live proof**: Toggling FR/EN on `/produits`, `/panier`, `/paiement`, `/commandes` etc. swaps the URL bar to `/products`, `/cart`, `/checkout`, `/orders` on the fly. Query strings + hash preserved. Unknown routes (`/admin`, `/shop`) untouched. 7/7 browser scenarios pass.

## Previous (2026-03-08) — Phase C · French Route Renaming — COMPLETE
- ✅ **Route map** (`i18n/routes.js`) — `ROUTE_MAP` + `useLocalePath()` hook: 18 route keys with FR/EN paths + param interpolation. `resolvePath()` exposed for tests / non-hook code.
- ✅ **Customer app** now registers both FR and EN paths for every localised route in `apps/customer/CustomerApp.jsx` (Desktop + Mobile shells). `/produits`, `/panier`, `/paiement`, `/commandes`, `/portefeuille`, `/compte(/adresses|/parametres|/aide|/activites|/recompenses|/parrainage)` all resolve alongside their English aliases so external bookmarks keep working.
- ✅ **Internal navigation** migrated to `useLocalePath()` across TopNav, MobileBottomNav, MobileShell (path detection now recognises both prefixes), MobileHome, MobileCart, MobileCheckout, MobileProductDetail, HomePage, CartPage, CheckoutPage, ProductDetailPage, ProductCard, ConfigHomepage (hero CTA + banner links + CTA-strip — with CMS→locale normaliser that preserves query strings).
- ✅ **Live proof**: with `localStorage.baked_language='fr'`, hero primary CTA → `/produits`, banner row hrefs → `/produits?category=…`, cta-strip → `/produits`. Toggle EN → same links become `/products?…`.
- ✅ **Testing agent** report: `test_reports/iteration_83.json`, ~92% pass. Only bug found (ConfigHomepage hero CTA using hardcoded fallback) fixed with `cmsToLocale()`.

## Previous (2026-03-08) — Phase D · Backend Error i18n Sweep — COMPLETE
- ✅ **ASGI language middleware** in `server.py` stashes `resolve_lang(request)` into a request-scoped ContextVar (`core.i18n._current_lang`). Endpoints call `t(key, current_lang())` with **zero signature churn**.
- ✅ **~140 `raise HTTPException` sites localised** across 11 files: `modules/mart/orders.py`, `modules/mart/routes.py`, `modules/express/routes.py`, `modules/driver/routes.py`, `modules/shop/{routes,storefront_routes,portal_routes}.py`, `shared/auth/routes.py`, `shared/customer/routes.py`, `shared/addresses/routes.py`, `shared/suppliers/portal_routes.py`.
- ✅ **`i18n/locales/{fr,en}/errors.json`** extended with 100+ keys (grouped `generic/auth/supplier/order/customer/driver/shop/upload`), all with `{param}` interpolation.
- ✅ **Tests**: `test_i18n_errors_e2e.py` (11/11) + `test_i18n_backend.py` (15/15) — **26/26 green**. Covers header precedence, structured `{code, message}` translation, ContextVar isolation across sequential requests.
- ✅ **Live proof**: `curl GET /api/mart/products/xx  X-BAKED-Language: fr` → `"Produit introuvable."`, `en` → `"Product not found."`
- 🔜 **Deferred (P2)**: `shared/admin/*`, `modules/mart_partner/*`, `shared/purchase_orders/*` admin surfaces (French-only for launch team).

## Latest (2026-03-05 evening) — Workstream 3 Phase A · i18n Foundation
- ✅ **react-i18next** installed (v17) + `i18next-browser-languagedetector`. Central init at `/app/frontend/src/i18n/index.js` with 5 namespaces (common/customer/admin/seller/driver) × 2 locales (fr/en). FallbackLng=`fr`. Detector order drops `navigator` → **French-first for every fresh visitor** regardless of browser locale.
- ✅ **`LanguageSwitcher.jsx`** shared component with `compact`/`menu`/`inline` variants. Wired across all 6 shells (desktop TopNav popover kept, mobile drawer footer replaced, MobileSettings row kept, Admin sidebar footer new, Seller portal sidebar footer new, Driver Profile page new). Public seller `/apply` also has one so applicants can toggle before login.
- ✅ **`CartPage`** pilot fully i18n'd. FR default → "Votre panier est vide" / "Découvrir les produits". Live toggle re-renders without page reload. Deep-link `?lang=en|fr` overrides.
- ✅ **`AppProvider.setLanguage`** synchronises with `i18n.changeLanguage` in one effect so `useTranslation` hooks flip in the same tick as context state.
- ⏳ **Phase B → I in `/app/memory/I18N_PLAN.md`**: extend to product/checkout/orders/wallet/profile/admin/seller-portal/driver, backend errors + email templates, DB bilingual product columns, admin i18n editor deferred to backlog.
- **Test coverage**: iteration_81 confirms Phase A works end-to-end; workstreams 1/2/4 unchanged.

## Latest (2026-03-05) — Workstreams 1 + 2 + 4 (SHOP QA · SEND rename · India parity) — COMPLETE
- ✅ **WS 1** — `/shop/categories` margin fix; ProductCarouselSection filters by configured category slug; SHOP supplier apps tagged `module=SHOP` and now surface in Admin Submitted tab (`POST /apply/start` accepts optional `module`, auto-appends `SHOP` to reused drafts).
- ✅ **WS 2** — `/express/*` → `/send/*` for every customer-facing route with soft `/express/*` redirects. Backend API prefix `/api/express/*` and DB `module=express` untouched. Nav, module tabs, mobile shell, `modules.js`, ConfigHomepage all point to `/send`.
- ✅ **WS 4** — India (`IN`) parity: 19 SHOP categories + 181 SHOP products (₹ INR) + 100+ MART products (₹ INR) seeded. Homepage sections seeded for IN with India-specific hero copy. `ShopHome / Categories / Category` now read `useApp().country?.code`.
- **Test coverage**: iteration_80 — 4/4 backend + 4/4 frontend passing.

## Original Problem Statement
Multi-business digital commerce ecosystem for Africa (launch: Côte d'Ivoire) with 6 business apps — MART, FOOD, SHOP, EXPRESS, AUTO, IMMO — plus Super Admin, AI Command Center, Shared Wallet, Shared Auth, Shared Notifications, Shared Analytics. Configuration-Driven Modular Monolith. Original request specified NestJS + Postgres + Prisma + Redis + RabbitMQ + Next.js — after discussion the user chose to proceed on Emergent's supported stack (React + FastAPI + MongoDB) with the same architecture pattern replicated faithfully.

## Latest (2026-02-28) — SHOPbakēd Slice 9 Checkout Engine
- ✅ **Migration 0044**: created isolated `shop_orders` + `shop_order_items` tables (FKs into SHOP hierarchy, JSONB `snapshot` for immutable audit trail, unique `number` column `SHOP-CI-YYYY-NNNNN`, `supplier_id` on each line item for future per-supplier fulfilment split).
- ✅ **`POST /api/shop/checkout`** — consumes the current SHOP cart, validates every variant's `stock_qty ≥ quantity` (409 `insufficient_stock` on shortfall, 409 `variant_unavailable` on inactivated variants), mints one `ShopOrder` + N `ShopOrderItem` rows, atomically deducts stock, clears the SHOP cart items (parent `carts` row survives so MART cart is untouched). Cash-on-delivery → `status=paid, payment_status=paid` for MVP; Stripe/wallet → `pending_payment/pending` (Slice 10 will complete the Stripe flow).
- ✅ **`GET /api/shop/orders/me`** + **`GET /api/shop/orders/{id}`** — customer-scoped list + detail with 404 on cross-customer access.
- ✅ **Frontend `/shop/checkout`**: two-column form — Delivery address + Instructions + Payment method radio; right-column Order Summary with line items + Total in amber; "Place order" CTA.
- ✅ **Frontend `/shop/order/:orderId`**: confirmation page with success checkmark, order number, status/payment/total tri-panel, itemised list, "Continue shopping" CTA.
- ✅ **"Go to checkout" CTA** on `/shop` home top-right so customers can reach the flow.
- ✅ **Tests**: `test_shop_checkout_slice9.py` — 7/7 covering empty-cart 400, full flow (order+snapshot+stock deduction+cart clear), Stripe stays pending, insufficient stock 409, list+detail scoped to customer, cross-customer 404, auth guards. Full SHOP suite = 86/88 (1 skip + 1 known cross-worker flake). MART regression unaffected. Live UI verified: checkout renders total = 999 XOF, cash-on-delivery selected, all inputs mounted.

## Latest (2026-02-28) — SHOPbakēd Slice 8 E2E Tests · SHOPbakēd MVP COMPLETE
- ✅ **API round-trip** (`test_shop_e2e_roundtrip.py`): 13-step three-actor journey — seller creates + variants → admin approves → customer OTP → PDP → add-to-cart → patch qty → checkout snapshot. Uses `request.config.cache` to thread ids between phases; one class = one xdist worker.
- ✅ **New `POST /api/shop/cart/checkout-snapshot`** endpoint: freezes cart state (product/variant/attributes/lines/totals) into a stable payload Slice 9 can hand to Stripe or the delivery-quote engine. Empty-cart → 400 `empty_cart`.
- ✅ **Playwright browser E2E** (`test_shop_e2e_browser.py`): real Chromium boots the `/shopbaked` storefront, asserts ≥2 CMS-driven sections render, PDP loads with variant picker + Add-to-cart button, and anonymous add-to-cart doesn't crash (401 handled gracefully).
- ✅ **Playwright installed** in the backend test env (`pip install playwright` + `python -m playwright install chromium --with-deps`) — browser tests now first-class in the regression harness.
- ✅ **Full SHOP suite: 82 passed / 1 skipped / 1 known cross-worker race** — 16 of those are Slice 8. Any race can be reproduced/verified by running the failing test in isolation (`-o addopts=`).

### SHOPbakēd MVP is complete
All 8 slices (Foundation → Catalogue → Attributes → Seller Portal → Admin Approval → Customer Storefront → Homepage Editor → E2E Tests) are live, tested, and running in the preview env. Ready for the next phase.

## Latest (2026-02-28) — SHOPbakēd Slice 7 Homepage Editor
- ✅ **Migration 0043 `homepage_module`**: adds `homepage_sections.module` (default "mart") + composite index `(country, module, display_order)`. Existing MART rows backfilled automatically via the server default.
- ✅ **Public GET `/api/homepage?country=CI&module=shop`**: filters by module (defaults to `mart` for backwards compat). Response now includes the requested module for round-tripping.
- ✅ **Admin GET `/api/admin/homepage-sections?country=CI&module=shop`**: filters by module; omit `module` to see all (grouped in ordering). Section create/patch accept `module`.
- ✅ **Seeded SHOP homepage stack** (`modules/shop/homepage_seed.py`): 5 default rails — hero, category_grid (6 top SHOP categories), product_carousel ("Fresh drops"), promotional_banner ("Under 10 000 XOF"), brand_carousel. Idempotent on stable ids.
- ✅ **`/shopbaked` storefront** rewritten to render admin-curated rails from `/api/homepage?country=CI&module=shop`. `SectionRenderer` dispatches on `section_type` to `HeroSection`, `CategoryGridSection`, `ProductCarouselSection`, `PromoBannerSection`, `BrandCarouselSection`. Unknown section types render nothing so admins can safely experiment.
- ✅ **Admin UI** (`AdminHomepageManagement.jsx`): new MART / SHOP module pill toggle at top of the page filters the section table and drives what module new sections are created under. Every existing button (edit, toggle, reorder, delete) works unchanged.
- ✅ **Tests**: `test_shop_homepage_slice7.py` — 8/8 covering default module = mart, `?module=shop` isolation, admin filter, unknown module → empty, create-appears-in-public-shop, MART isolation (SHOP row not visible on MART homepage), auth guard. Live UI smoke: 5 CMS sections rendered, hero copy + category grid + fresh drops all admin-editable.

## Latest (2026-02-28) — SHOPbakēd Slice 6 Customer Storefront
- ✅ **Real customer home** at `/shopbaked`: gradient hero with FR/EN copy, trust-badge row, live 19-category tile grid, 12-card "Fresh drops" product grid. All routed through the existing `api` axios client (JWT-aware).
- ✅ **Category landing** at `/shopbaked/c/:categorySlug`: subcategory pill rail with `?sub=` query param filter, responsive product grid.
- ✅ **PDP** at `/shopbaked/p/:productId`: two-column layout with images + description + price range + variant picker. Picker auto-derives from the attribute schema — only attribute keys that differ across the product's variants render as picker rows (Colour + Storage on iPhone, Colour on t-shirts, etc.). Live variant match on selection changes price/stock/SKU.
- ✅ **Add-to-cart wired**: `POST /api/shop/cart/items` with 401 fallback showing "Please sign in" toast; upserts quantity on repeat add; button disabled + shows "Select options"/"Out of stock" states.
- ✅ **New backend surface**:
  * `GET /api/shop/products/{pid}` — public PDP payload with variants + attribute schema + price range (only exposes `active` products).
  * `GET /api/shop/cart/me` — hydrated SHOP cart with per-line totals + item_count.
  * `POST /api/shop/cart/items` — add-or-upsert (variant, quantity).
  * `PATCH /api/shop/cart/items/{id}` — update quantity (1-99).
  * `DELETE /api/shop/cart/items/{id}` — remove item.
- ✅ **New `shop_cart_items` table** (migration 0042): separate table from MART's `cart_items` (which has hard FK to `mart_products.id`), sharing the same parent `carts` row so a customer's cart can mix MART + SHOP entries. Cross-module isolation guaranteed at query time.
- ✅ **Tests**: `test_shop_storefront.py` — 7/7 covering PDP shape, draft-product 404, cart add/upsert/patch/delete, bad-variant 404, MART cart isolation. Full SHOP suite = 59 passed / 1 skipped (foxtrot no password) across all Slices 1-6. MART regression unaffected.

## Latest (2026-02-28) — SHOPbakēd Slice 5 Admin Approval
- ✅ **Modules tab in supplier drawer** (`/admin/modules/mart/suppliers/{id}` → "Modules"): checkbox card grid for MART (locked as always-on) + SHOP; "Save changes" pill only lights up when the selection diverges from the persisted state.
- ✅ **`PATCH /api/admin/modules/mart/suppliers/{sid}/modules`**: whitelists allowed modules (`MART`, `SHOP`), always retains MART even if the client sends only `["SHOP"]`, dedupes + preserves order. Idempotent responses return `changed=false`. Every change writes a `supplier.modules_updated` audit row (migration 0041 extends the check constraint).
- ✅ **SHOP product approval queue** at `/api/admin/modules/shop/product-requests`:
  * `GET ?bucket=pending|approved|rejected|all` — with per-status bucket counters and per-product variant counts.
  * `GET /{pid}` — full product + variants payload for the approval drawer.
  * `POST /{pid}/approve` — flips to `active` and sets `published_at`.
  * `POST /{pid}/reject` — flips to `rejected`.
  * `POST /bulk-approve` and `POST /bulk-reject` — batch operations with `blocked` list reporting `not_found` / `bad_status` per id.
- ✅ **`GET /api/admin/modules/mart/suppliers/{sid}`** now exposes `modules` on the payload so the frontend can hydrate the Modules tab without an extra call.
- ✅ **Migration 0041 `audit_modules_action`**: extends `supplier_review_audit.ck_supplier_audit_action` to accept `supplier.modules_updated`.
- ✅ **Tests**: `test_shop_admin_slice5.py` — 11/11 covering pending listing, approve/reject singles, bulk approve/reject with blocked reporting, cannot-re-approve, modules toggle grant/revoke/idempotent/unknown/mart-retained, supplier detail exposure, auth guards. Full SHOP suite = 53/53 pass, MART regression unaffected.

## Latest (2026-02-28) — SHOPbakēd Slice 4 Seller Portal
- ✅ **New seller-portal route `/martbaked/:slug/portal/shop`** — module-gated (`SHOP` in `supplier.modules`), reuses the existing supplier login + portal shell. Off-boarded suppliers see a friendly "SHOP not enabled" banner rather than an error.
- ✅ **Dynamic form auto-renders per subcategory**: category picker triggers a call to `/api/shop/categories/{cid}/attributes?subcategory_id=...`; Size/Colour/RAM/Storage/etc. render as the correct input type (`select`, `text`, `number`) with option lists, unit hints, and an "override" badge on subcategory-scoped rows.
- ✅ **Variant editor grid**: table of SKU × price × stock × per-variant attributes; add-row footer with select-typed cells for `select` attributes. Duplicate SKU per product → 409. Any variant CRUD flips a previously `active` parent product back to `pending_review` (re-approval contract for Slice 5).
- ✅ **New backend surface `/api/shop/portal/*`** (all `Depends(get_shop_supplier)`): `GET /catalogue`, `POST /products`, `GET /products/{id}` (with `attribute_schema`), `PATCH /products/{id}`, `POST /products/{id}/variants`, `PATCH /products/{id}/variants/{vid}`, `DELETE /products/{id}/variants/{vid}`.
- ✅ **`supplier.modules` now exposed** on `GET /api/supplier/me` so the frontend can flip the SHOP tab on/off without an extra round-trip.
- ✅ **Tests**: `test_shop_portal_seller.py` — 9/9 pass covering module gate, product create → pending_review, resolved-schema on GET, variant CRUD, duplicate SKU 409, wrong-subcategory 400, unknown-product 404, ownership. Combined SHOP suite = 42/42. MART regression unaffected.

## Latest (2026-02-28) — SHOPbakēd Slice 3 Dynamic Attributes
- ✅ **Attribute engine extended for SHOP**: added `mart_attributes.module` discriminator (default "mart") + new `shop_category_attributes` assignment table with FKs to `shop_categories`/`shop_subcategories`. Attribute definitions live in one shared table; assignments are strictly per-module.
- ✅ **6 SHOP attributes seeded**: Size, Colour, RAM, Storage, Condition, Warranty — with 52 options between them (bilingual FR/EN labels like `Neuf / New`, `Reconditionné / Refurbished`).
- ✅ **42 subcategory-inheriting assignments** across 14 categories (Condition on all, Colour on fashion+electronics, Size on apparel/footwear, RAM/Storage/Warranty on electronics).
- ✅ **Inheritance-override demo working**: `sneakers` overrides parent Colour → `is_required=True`; `iphone/ipad/mac` override parent Storage → `is_required=True`. Resolver correctly reports `scope=subcategory` for the winning rows and `scope=category` for the inherited ones.
- ✅ **`GET /api/shop/categories/{id_or_slug}/attributes?subcategory_id=...`** returns the resolved list, with slug fallback for both category & subcategory.
- ✅ **`/shopbaked` preview** now shows attribute-key chips on each category card so QA can eyeball the module→attribute mapping.
- ✅ **Tests**: `test_shop_attributes.py` — 12/12 pass covering definitions, inheritance, subcategory-wins, slug lookup, unknown categories → 404, isolation from MART. Combined SHOP suite = 33/33. MART attribute regression 25/25 unaffected.

## Latest (2026-02-28) — SHOPbakēd Slice 2 Catalogue Seed
- ✅ **19 top-level SHOP categories × 181 subcategories** seeded idempotently for Côte d'Ivoire, parsed from the canonical `Categories_In_French.docx` with paired clean English labels. FR is the source of truth; EN was hand-cleaned where the raw English doc had OCR/translation bleed-through. All slugs are ASCII-safe & unique per country.
- ✅ **`/app/backend/modules/shop/catalogue_data.py`**: single canonical tree with `(slug, name_fr, name_en, [subs])` tuples in doc order. Slugs are stable; renaming a name updates FR/EN + `order` on the next boot but never mutates ids.
- ✅ **`/app/backend/modules/shop/seed.py::seed_shop_catalogue`**: wired into `run_seed()` after MART/homepage seeds. Uses on-conflict upsert keyed on `(slug, country)` (category) and `(slug, category_id)` (subcategory). Preserves admin-edited icon/image once Slice 5 exposes them.
- ✅ **New public endpoint `GET /api/shop/catalogue?country=CI`**: returns the full nested tree (category → subcategories) in one call — powers the seller-portal category picker (Slice 4) and customer storefront rail (Slice 6).
- ✅ **Frontend preview**: `/shopbaked` now renders a 3-column card grid of every seeded category with FR/EN toggle. All 19 cards visible with `data-testid="shopbaked-category-{slug}"`.
- ✅ **Tests**: `test_shop_catalogue_seed.py` — 8/8 pass (counts match, order monotonic, accented FR round-trip, Apple subcats present, idempotency, unknown country → empty). Combined SHOP suite = 21/21. MART regression (dynamic attributes + catalog editing) 13/13 unaffected.

## Latest (2026-02-28) — SHOPbakēd Slice 1 Foundation
- ✅ **Isolated SHOP catalogue tables**: migration `0039_shop_foundation` creates `shop_brands / shop_categories / shop_subcategories / shop_products / shop_variants`. `ShopProduct` carries JSONB `images`, `attributes` (parent-level) and status ∈ {draft, pending_review, active, archived, rejected}. `ShopVariant` carries per-SKU price / stock / condition / attribute overrides / images.
- ✅ **Shared-supplier identity**: added `suppliers.modules` JSONB column (default & backfilled to `["MART"]`). Every existing supplier retains MART access; SHOP access is opt-in per supplier and gated by an array-contains predicate.
- ✅ **Router surface** (`modules/shop/routes.py`): three routers wired in `server.py`:
  - `/api/shop/*` — public storefront (`/health`, `/categories`, `/subcategories`, `/products`)
  - `/api/shop/portal/*` — seller portal (`/health` stub for Slice 4)
  - `/api/admin/modules/shop/*` — admin, `Depends(get_current_admin)` (`/health`, `/products`)
- ✅ **Frontend shell**: `/shopbaked/*` mounted in `App.js` with `ShopbakedApp` + `ShopHome` (health card pings `/api/shop/health` and renders live table counts). Admin surface `/admin/modules/shop` already routes through the generic `ModuleWorkspace` and will be specialised in Slice 5.
- ✅ **Tests**: `test_shop_foundation.py` — 12/12 pass covering module stubs, admin auth guard, MART isolation, and platform advertisement (`GET /api/` lists "shop"). MART regression (`dynamic_attributes` × 3 + `catalog_editing_and_bulk_delete`) → 31/31 pass.

## Latest (2026-02-28) — Sell-on-BAKĒD & Mobile Nav Fixes (Fixing_Prompt v9)
- ✅ **Sell-on-BAKĒD opportunity cards** (`apps/partner-landing/PartnerLandingApp.jsx`):
  - Data model expanded from `href` to `cardHref` + `applyHref` + `internal`. MART: card → `/martbaked/sellers`, Apply Now → `/martbaked/sellers/apply`. EXPRESS: both → `/driver` (SPA). FOOD / SHOP / AUTO / IMMO keep the existing `mart.partner.baked.ci` externals in a new tab.
  - `OpportunityCard` uses `useNavigate()` for internal routes; the Apply CTA calls `e.stopPropagation()` so its target wins over the parent card anchor (per docx §7 — no double-navigation, no unexpected new-tab openings).
  - Test IDs preserved (`partner-opportunity-{code}`) + new `partner-opportunity-{code}-apply` on every Apply button for regression coverage.
- ✅ **Mobile menu "Delivery Partner"** (`components/mobile/MobileHeader.jsx`): changed from broken `/delivery-partner` to `/driver` (the SENDbakēd onboarding entry).
- **Live verification**: Playwright walked the flow — MART card → `/martbaked/sellers`, MART Apply → `/martbaked/sellers/apply`, EXPRESS Apply → `/driver/onboarding`. All three routing checks green.

## Prior (2026-02-28) — Category Editing Fix + Bulk Delete (Fixing_Prompt v8)
- ✅ **Bug fix — "Extra inputs are not permitted" gone**: root cause was `AdminMartCatalog.jsx` posting the whole GET response back (with `id`, `slug`, `created_at`, `deleted_at`, `version`, `module`, `created_by`, `updated_by`) to a strict `CategoryUpdate` DTO. Fix keeps the DTO strict (per docx) and instead ships a `pickEditable(obj, whitelist)` helper — only `name_en / name_fr / icon / image / order / is_active` (Category) and `name_en / name_fr / image / order` (Subcategory) reach the wire.
- ✅ **Bulk delete shipped for Categories · Subcategories · Attributes**:
  - Frontend adds a checkbox column with select-all header on all three tables. Selecting rows reveals a blue action bar with a "Delete Selected" button and a Clear shortcut. Confirmation dialog explicitly warns about associated subcategories / products / homepage sections / attribute assignments before firing.
  - Backend endpoints (all Super-Admin-gated, all audited):
    - `POST /api/admin/mart/categories/bulk-delete` — soft-deletes via `deleted_at`; refuses individual rows with subcategories or active products (per-id `blocked` list). Returns `{deleted:[], blocked:[]}` so partial batches don't fail.
    - `POST /api/admin/mart/subcategories/bulk-delete` — hard-deletes; blocks rows with active products.
    - `POST /api/admin/mart/attributes/bulk-delete` — soft-deactivates (is_active=false); historical snapshot values on products preserved. Idempotent second-run returns `already_inactive`.
  - Every mutation writes to the audit trail (`mart.category.bulk_delete`, `mart.subcategory.bulk_delete`, `attribute.bulk_deactivate`).
- **Testing**: `test_catalog_editing_and_bulk_delete.py` — 6/6 pass (editable-only PATCH ok, unknown-field 422, bulk-delete with blockers, subcategory bulk-delete, attribute bulk-deactivate idempotent). Full backend suite 74 tests all green (2 transient network flakes on retry). Live UI screenshot confirms toast "Saved" on edit + bulk bar visible on select.

## Prior (2026-02-28) — Storage Migration Tool (Fixing_Prompt v7)
- ✅ **One-click storage cutover shipped**:
  - **CLI**: `python backend/scripts/migrate_storage.py --source emergent --dest local [--dry-run|--list]` — enumerates every object key referenced in the DB, copies from source provider to destination, idempotent (skips objects already at dest), reports full stats.
  - **Enumeration** (`scripts/storage_migration.py::enumerate_keys`): walks 8 columns — `mart_products.image` / `.images` (JSONB) · `partner_products.images` (JSONB) · `homepage_sections.config` (recursive JSONB walk) · `driver.gov_id_front_url / gov_id_back_url / licence_front_url / selfie_url / vehicle_reg_url` · `suppliers.logo_url / cover_image_url` · `supplier_documents.storage_path` · `supplier_invoices.invoice_document_storage_path`.
  - **Key extractor**: strips the six known serve-URL prefixes (`/api/homepage/uploads/`, `/api/partner/uploads/`, `/api/driver/uploads/`, `/api/supplier/uploads/`, `/api/admin/homepage-sections/uploads/`, `/api/supplier-invoices/uploads/`, `/uploads/`) OR accepts a raw key that has both `/` and a known media extension. Rejects `http(s)://`, `data:`, `blob:`, and plain category names — fixes the initial "Amul / Bakery" false positives.
  - **Admin HTTP endpoints** (`shared/admin/storage_migration_routes.py`) mounted under `/api/admin/storage/`:
    - `GET /status` — active provider + last job snapshot
    - `POST /enumerate` — count + sample of discovered keys (200-item preview)
    - `POST /migrate {source, dest, dry_run}` — 202 with job id; runs in FastAPI BackgroundTask
    - `GET /migrate/{job_id}` — poll progress + final report
  - **Idempotent + safe**: copy skips objects already at destination (`skipped_already_present` count) and cleanly reports source-missing rows. Same-source-and-destination request → 400. Unknown provider → 400. Errors captured per-key (capped at 50 in report body).
  - **Testing**: `test_storage_migration.py` — 13/13 pass (key extraction happy + edge, idempotent copy, dry-run does not write, source-missing reporting, same-provider raises, admin endpoints). Full backend suite 73 tests total, all green.

## Prior (2026-02-28) — Pluggable Storage Providers (Fixing_Prompt v7)
- ✅ **Bug fix — Upload no longer requires EMERGENT_LLM_KEY**:
  - Root cause: `object_storage.init()` hard-required the Emergent key + storage proxy, so every image upload (homepage category icons, banners, supplier docs, driver KYC) returned `Upload failed: EMERGENT_LLM_KEY not set`.
  - Fix: introduced a pluggable storage abstraction in `core/providers/storage/` — `base.py` (interface), `local.py` (default), `emergent.py` (legacy adapter), `s3.py` (drop-in), `factory.py` (singleton). The legacy `object_storage.put_object` / `get_object` façade is preserved 1:1 so no callers changed.
  - **Config**: `STORAGE_PROVIDER=local|emergent|s3` (default `local`) + `STORAGE_LOCAL_PATH` (default `/app/backend/uploads`). S3 uses the four standard `AWS_*` env vars.
  - **Static mount**: FastAPI mounts `/uploads` at `STORAGE_LOCAL_PATH` for direct-download URLs. Content-Type is inferred from filename extension on serve.
  - **Path traversal**: blocked in `LocalStorageProvider._absolute()` — any `..` segment or absolute prefix raises `ValueError`.
  - **Verified end-to-end**: homepage category-icon upload via `POST /api/admin/homepage-sections/uploads` → 200 → `/api/homepage/uploads/{key}` returns the bytes with `image/png` Content-Type. All existing consumers (mart-partner images, supplier docs, driver KYC, homepage banners, invoices) inherit the fix.
  - **Testing**: `test_storage_provider.py` — 5/5 pass (default=local, unknown provider rejected, put/get roundtrip, path-traversal blocked, homepage HTTP upload+serve). Full backend suite 60 tests total, all green.

## Prior (2026-02-28) — Dynamic Category Attribute System · Slice 3 (Fixing_Prompt v6)
- ✅ **Slice 3 shipped — Admin Approval Drawer + Customer PDP go dynamic**:
  - **Backend** (`modules/mart/routes.py`): `GET /api/mart/products/{id}` now hydrates a new `visible_attributes: [{key, label, type, unit, value}]` array using the resolver (with `only_customer_visible=True`). Select/multi_select values are auto-translated to option labels; booleans render as `"Yes"/"No"`; sort_order is respected. Snapshot labels (from Slice 2) win over the current attribute name so historical products keep the label they were approved with.
  - **Backend** (`shared/suppliers/routes.py`): the admin `GET /api/admin/modules/mart/suppliers/{sid}/products` response now includes each item's `attributes` snapshot, feeding the admin review drawer.
  - **Customer PDP** (`components/mart/ProductDetails.jsx`): renders `visible_attributes` as first-class rows in the admin-configured sort order (preview line + expandable list). Any Slice-2 snapshot keys are excluded from the legacy "More info" fallback so `customer_visible=false` attributes never leak into the storefront. Legacy free-form JSONB (pre-Slice-3 products) still surfaces under "More info" untouched.
  - **Admin Review Drawer** (`AdminSupplierDetail.jsx`): new `product-review-attributes` group renders every submitted attribute (visible OR hidden) with its snapshot label, human-friendly value (Yes/No · comma-joined arrays), grouped visually inside the drawer so Super Admin sees exactly what the supplier filled.
  - **Testing**: `test_dynamic_attributes_slice3.py` — 6/6 pass (visibility filter, select→label translation, boolean Yes/No, multi_select → labels array, sort_order, admin drawer payload). Full backend suite 55 tests total, all green. Live end-to-end screenshot confirms visible attr appears / hidden attr absent on PDP and both appear on admin drawer.

## Prior (2026-02-28) — Dynamic Category Attribute System · Slice 2 (Fixing_Prompt v6)
- ✅ **Slice 2 shipped — Supplier form goes dynamic**:
  - **Model**: `supplier_product_requests` now has `proposed_subcategory_id` (FK → mart_subcategories) + `attributes` JSONB snapshot column. Migration `0038_supplier_request_attributes`.
  - **Supplier endpoints extended** (`shared/suppliers/portal_routes.py`):
    - `POST /api/supplier/me/product-requests` accepts `proposed_subcategory_id` and `attributes: {key: value}`; server validates against resolver + validator (missing-required → 422 with per-field errors, bad type → 422, bad option value → 422). Passes → snapshotted as `{v, label, type}` per key.
    - `PATCH /api/supplier/me/product-requests/{id}` — same validation on resubmit.
    - New `GET /api/supplier/me/subcategories?category=<slug>` — powers subcategory picker.
  - **Admin approval copies the snapshot** into `mart_products.details` (single-approve + bulk-approve). `subcategory_slug` also flowed through. Historical products keep their snapshot verbatim even after attribute rename / soft-delete.
  - **Supplier form (`PortalProductRequests.jsx`)**: category → subcategory picker → dynamic "Category-specific fields" panel with typed inputs (short_text, long_text, integer, decimal, boolean, date, select, multi_select), required-* markers, unit chips, per-field error surfacing (client + server). Only `supplier_editable=true` attributes render. Values pre-fill on revise from the snapshot.
  - **Testing**: `test_dynamic_attributes_slice2.py` — 7/7 pass (missing-required 422, invalid_type 422, bad_option 422, snapshot survives rename, approve copies into master.details, subcategory-only required override enforced, subcategories endpoint). Full backend suite still green (49 tests total).
- 🔜 **Slice 3 (next)**: Admin approval drawer surfaces submitted attribute values grouped; Customer PDP renders customer_visible attributes automatically.

## Prior (2026-02-28) — Dynamic Category Attribute System · Slice 1 (Fixing_Prompt v6)
- ✅ **Slice 1 shipped — DB + Admin CRUD + Public Resolver**:
  - **New models** (`core/models/mart_attributes.py`):
    - `MartAttribute` — global definitions (immutable auto-slug `key`, soft-delete via `is_active`)
    - `MartAttributeOption` — options for select / multi_select
    - `MartCategoryAttribute` — (category, subcategory?, attribute) assignment with is_required / customer_visible / supplier_editable / sort_order / is_active
    - `MartAttributeAudit` — full before/after diff log
  - **Migration**: `0037_mart_dynamic_attributes` — 4 new tables with FKs + indexes; existing product data untouched
  - **Types supported**: short_text · long_text · integer · decimal · select · multi_select · boolean · date (image/document deferred, handled by existing supplier upload)
  - **Resolver** (`modules/mart_attributes/resolver.py`): subcategory row wins over parent-category row for the same attribute; drops inactive attributes/assignments; optional `customer_visible_only` filter for the customer PDP
  - **Validator** (`modules/mart_attributes/validate.py`): type coercion + required checks + option-membership; snapshots `{v, label, type}` in `mart_products.details` so renames never orphan history
  - **Admin endpoints** under `/api/admin/mart/`:
    - `GET/POST/PATCH/DELETE /attributes` (soft-delete)
    - `POST/PATCH/DELETE /attributes/{id}/options` + `/attributes/options/{id}`
    - `GET/POST/PATCH/DELETE /categories/{id}/attributes` (assignment CRUD, idempotent upsert)
    - Extended existing `PATCH /admin/mart/categories/{id}` to accept `is_active` toggle (soft delete via `deleted_at`)
    - `GET /attributes/audit?entity_kind=&entity_id=` — full diff log
  - **Public/portal endpoint**: `GET /api/mart/categories/{id}/attributes?subcategory_id=&customer_visible_only=` — returns resolved list; accepts either `id` or `slug`
  - **Frontend**: new page `/admin/modules/mart/attributes` (`AdminMartAttributes.jsx`) with 3 tabs — **Attributes** (definitions + options editor) · **Category Assignment** (scope picker: category / subcategory, live per-row Required/Customer/Supplier/Active toggles + sort-order input) · **Audit Trail** (full diff view). Added to Module workspace sub-nav.
  - **Testing**: `test_dynamic_attributes.py` — 12/12 pass (CRUD, immutable key, option lifecycle, category assignment + idempotent upsert, subcategory override wins, customer_visible filter, audit before/after diff, category rename + deactivate)
- 🔜 **Slice 2 (next)**: Supplier product-request form dynamically loads resolved attributes for the chosen category/subcategory and renders typed inputs with required-field validation. Data lands under `mart_products.details` on approval.
- 🔜 **Slice 3**: Admin approval drawer renders submitted attribute values grouped; Customer PDP renders only `customer_visible` attributes automatically.

## Prior (2026-02-28) — MARTbaked Supplier-Centric Admin Workflow (Fixing_Prompt v5)
- ✅ **Unified supplier workspace (2026-02-28)** — collapses duplicate approval queues into a single supplier-centric flow:
  - **Nav cleanup**: `/admin/mart-partner-approvals` and `/admin/partner-image-reviews` removed from AdminLayout left nav. Both routes now Navigate-redirect (`/admin/mart-partner-approvals` → `/admin/modules/mart/approvals`, `/admin/partner-image-reviews` → `/admin/modules/mart/suppliers`). Standalone page files deleted.
  - **New Supplier Detail workspace** at `/admin/modules/mart/suppliers/:supplierId` with Overview + Products tabs. Approved suppliers in the Applications table now show an "Open workspace" button that navigates here.
  - **Products tab**: server-side filtering by status (All/Pending/Approved/Rejected/Withdrawn), category slug, subcategory slug, and free-text search. Bulk approve + bulk reject with a shared category-fallback and shared notes.
  - **Product Review drawer**: shows ALL submitted images (thumbnails + main viewer), full product info, and inline approve/reject actions — replaces the standalone image-review page.
  - **Warehouse allocation**: Overview surfaces the supplier's existing warehouse assignments (primary badge). Products inherit — no per-product allocation UI (per user choice).
  - **New backend endpoints** (`shared/suppliers/routes.py`):
    - `GET /api/admin/modules/mart/suppliers/{sid}` — snapshot with warehouse_assignments + product_buckets + audit_trail
    - `GET /api/admin/modules/mart/suppliers/{sid}/products?status=&category=&subcategory=&q=&limit=` — server-side filtered
  - **New bulk endpoints** (`shared/suppliers/portal_routes.py`):
    - `POST /api/admin/modules/mart/suppliers/product-requests/bulk-approve` — accepts request_ids[], optional category_id fallback; returns `{approved:[…], skipped:[…]}`
    - `POST /api/admin/modules/mart/suppliers/product-requests/bulk-reject` — accepts request_ids[], required notes
  - **Router-ordering fix** (`server.py`): `admin_supplier_prodreq_router` now registered BEFORE `admin_supplier_router` so `/suppliers/product-requests` doesn't get swallowed by `/suppliers/{sid}`.
  - **Homepage filtering fix** (`ConfigHomepage.jsx`): `ProductCarousel` fetches its OWN products with `?category=<cfg.filter>&subcategory=<cfg.subcategory>` via `/api/mart/products` — eliminates the previous cross-category leak where all sections shared the same 24-product preload. AdminHomepageManagement `product_carousel` editor now exposes a `subcategory` field alongside filter/limit.
  - **Testing**: iter68 — new pytest `test_supplier_centric_workflow.py` (9/9 green: supplier detail, filters, bulk-approve, bulk-reject, skip-non-pending, zero cross-category leakage). Regression suites `test_supplier_portal_phase2b.py` + `test_supplier_warehouses.py` + `test_homepage_cms.py` all pass. Testing-agent Playwright: every review bullet ✅.

## Prior (2026-02-28) — Supplier Gallery → Customer PDP Sync (Phase 3)
- ✅ **Approval queue for supplier images (2026-02-28)** — Phase 3 of the Fixing_Prompt.docx v4 spec:
  - **Schema**: new `images_review_status` (none|pending|approved|rejected) + `images_review_note` on `partner_products` (migration `0036_partner_images_review`). Supplier upload/reorder now auto-flips status to `pending` when the product is linked to a MartProduct.
  - **Backend admin endpoints** (under `/admin/mart-partner/`):
    - `GET /partner-products/pending-images` — queue with side-by-side master vs. supplier images + partner + country.
    - `POST /partner-products/{id}/images/approve` — mirrors `partner.images → master.images` (and primary sync) so the public PDP updates instantly. Fires in-app notification to partner owner.
    - `POST /partner-products/{id}/images/reject` — requires a note; supplier gets the message in-app.
  - **Admin UI**: new page `/admin/partner-image-reviews` with side-by-side compare + reject-with-note modal. Sidebar link added.
  - **Supplier UI**: Images button on ProductRow now shows a `PENDING` (amber) or `REJECTED` (red) chip so suppliers can see review state at a glance; the rejection note is shown as a tooltip.
  - **Testing**: iter69 — 6/6 backend pytest green (`/app/backend/tests/test_partner_images_review.py`) + smoke-tested admin queue UI end-to-end.

## Prior (2026-02-28) — Supplier Image Manager (Phase 2)
- ✅ **Supplier gallery editor (2026-02-28)** — Phase 2 of the Fixing_Prompt.docx v4 spec:
  - **Schema**: nullable JSONB `images` array on `partner_products` (migration `0035_partner_images_jsonb`). `images[0]` is mirrored into the legacy `image` column so existing readers keep working.
  - **Backend**: `POST /partner/products/{id}/images/upload` (multipart, 6 MB cap, JPG/PNG/WebP, max 8) writes to Emergent Object Storage under `mart-partner/product/{id}/…`. `PATCH /partner/products/{id}/images` (reorder / remove / set primary — payload is the authoritative post-op list). `GET /partner/uploads/{key:path}` proxies the asset. Ownership + role guards enforced.
  - **Frontend**: new "Images" button on each ProductRow (with badge count). `ImageManagerModal` shows a grid with ↑/↓ move · "Set primary" · trash · uploader. Refetches after every mutation.
  - **Testing**: iter68 — 8/8 pytest green (`/app/backend/tests/test_partner_product_images.py`) + UI screenshot verified end-to-end (upload → primary badge → second upload → reorder button visible).

## Prior (2026-02-28) — PDP Gallery + Zoom + Dynamic Product Details
- ✅ **Customer PDP overhaul (2026-02-28)** — Phase 1 of the Fixing_Prompt.docx v4 spec:
  - **Schema**: new nullable JSONB `details` column on `mart_products` (migration `0034_mart_product_details_jsonb`). Holds well-known keys (fssai, allergens, shelf_life, taste_profile, ingredients, nutrition{}, marketer, seller_fssai, return_policy, …) plus arbitrary supplier-authored key/value pairs. Backward-compatible.
  - **New `ProductGallery`**: multi-thumb strip + desktop side-by-side zoom pane with cursor spotlight + mobile-first fullscreen lightbox with prev/next + dot indicators.
  - **New `ProductDetails`**: dynamic expandable block that only renders non-empty fields. Well-known keys map to labels ("Allergen Information", "Country of Origin", "FSSAI License"…); nutrition sub-table renders as a two-column grid; custom supplier keys fall through into "More info". Works in light + dark.
  - **Regression-safe**: existing `PRODUCT.detailImg` testid preserved as `sr-only` for legacy tests; products without `details` or `images[]` continue rendering with just the primary image + description.
  - **Testing**: end-to-end verified via screenshots (desktop gallery + zoom + expanded details + mobile lightbox + light mode). No new pytest — data flow is a simple JSONB round-trip through the existing `row_to_dict` serializer.

## Prior (2026-02-28) — Aisle → Rack Auto-Suggest
- ✅ **Aisle → Rack cascade suggest (2026-02-28)** — extended the Category Auto-Suggest pattern one level deeper. When adding a Rack under a tagged Aisle, the AddChildRow now:
  - **Pre-fills the Category** and locks it (parent Aisle is authoritative, backend rejects mismatches anyway).
  - **Pre-fills the Subcategory** from the parent Aisle's `subcategory_slug` and renders a blue dashed `✨ Suggested sub · <slug>` hint chip — click to clear and pick a different one (e.g. Aisle=`fresh-fruits` overall but Rack=`citrus` specifically).
  - `HierarchyNode` now propagates both `parentCategory` + `parentSubcategory` down the tree so subsequent Rack rows inherit correctly. No backend changes required.
  - Regression: all 28/28 backend tests still green (cascade + bulk + zone-suggestion suites).

## Prior (2026-02-28) — Category Auto-Suggest for New Aisles
- ✅ **Zone → Aisle auto-suggest (2026-02-28)** — `GET /api/partner/warehouse/{wh}/tree` now enriches each Zone node with `suggested_category_slug`, derived from `WarehouseCategoryDefault` for that (warehouse, zone). Returned only when exactly one default targets the zone (ambiguity → null).
  - **Frontend**: Zone rows in the Storage hierarchy render a dashed `default · <slug>` chip when a default exists. Clicking "+ Aisle" opens an AddChildRow with the Category dropdown **pre-filled** to the Zone default plus a dismissible `✨ Suggested · <slug>` chip so ops can accept in one click.
  - **Testing**: iter68 — 5/5 backend pytest green (`/app/backend/tests/test_zone_category_suggestion.py`), full 28/28 green across cascade + bulk + suggestion suites, plus verified UI end-to-end with a screenshot showing chip + pre-fill.

## Prior (2026-02-28) — Ops Bulk SKU → Bin Assignment
- ✅ **Bulk Assign (2026-02-28)** — new `POST /api/partner/inventory/locations-bulk` accepts N `partner_product_ids` + one `bin_id` + `is_primary/quantity`, returns a per-product verdict (`status='ok'|'error'` with codes `not_found` / `invalid_cascade` / `conflict`). Cascade + primary-flip + ownership rules reused from the single-assign flow. Preflight SELECT replaces exception-driven conflict detection so a bad row can no longer poison the async session (avoids `MissingGreenlet` on the next request). Distinct URL path (`-bulk`, not `/bulk`) sidesteps the collision with `/locations/{partner_product_id}`.
- ✅ **Frontend**: `ProductsPage` — multi-select checkboxes on each row + select-all header + sticky floating action bar with `Assign N to bin`. New `BulkLocationModal` reuses the tree renderer, filters by common cascade (or shows an amber "multi-category" warning + untagged-only tree when the selection spans cascades), streams per-row results back on partial failures so only successful SKUs get cleared from the selection.
- ✅ **Testing**: iter67 — 8/8 backend pytest green (`/app/backend/tests/test_bulk_assign_location.py`) + 100% frontend Playwright green.

## Prior (2026-02-27) — Darkstore Category → Subcategory → Product → Storage Cascade
- ✅ **Darkstore storage cascade (2026-02-27)** — per `Fixing_Prompt.docx` v3:
  - Migration `0033_warehouse_category_cascade` adds nullable `category_slug` + `subcategory_slug` columns (with indexes) to `warehouse_aisles` + `warehouse_racks`.
  - Backend `_validate_category_cascade()` (country-scoped) enforces: (i) subcategory requires category, (ii) unknown category/subcategory rejected, (iii) subcategory must belong to category (JOIN MartSubcategory→MartCategory via `category_id`), (iv) Rack.category must equal parent Aisle.category when Aisle is tagged.
  - `list_partner_products` now accepts `?category=` + `?subcategory=` query params.
  - `assign_location` enforces the cascade at bin-assignment time — a Mango can't be pinned to a Dairy rack. Untagged Aisles/Racks accept any product for back-compat.
  - **Frontend**: `ProductsPage` has cascading Category + Subcategory filters above the list. `WarehouseEditor` renders CategoryFields on every Aisle/Rack add/edit row; Rack rows inherit and lock the parent Aisle's category. `LocationModal` shows the product's cascade chips at the top and filters the warehouse tree to only matching Aisles/Racks.
  - **Testing**: iter66 — 15/15 pytest green + 3/3 frontend UI flows green. Test suite lives at `/app/backend/tests/test_warehouse_cascade.py`.

## Prior (2026-02-27) — SENDbakēd Driver Trip Flow + Light Mode
- ✅ **Driver Trip Flow (2026-02-27)** — Uber-style trip lifecycle per `Fixing_Prompt.docx`:
  - New `DriverTripSheet.jsx` with `SlideToConfirm` for each of the 4 backend transitions (`driver_assigned→arriving→picked_up→in_transit→delivered`). Slide-to-confirm requires a real drag ≥80% — a tap deliberately bounces back.
  - `openNativeNavigation()` opens `google.navigation:` (Android) / `maps://?daddr=` (iOS) with an automatic web fallback to `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=driving`.
  - Dynamic turn-by-turn instruction card at the top uses live `google.maps.DirectionsService` steps — no hard-coded values.
  - Old 4-button `JobProgressBar` deleted; `driver-active-job-chip` replaced by `trip-status-pill`.
  - Trip auto-restores on reload via `/api/driver/me/express-active`.
  - Backend `POST /api/express/bookings/{id}/driver-status` untouched (7/7 pytest green in iter63).
- ✅ **Driver PWA Theme Toggle** — new `useDriverTheme.js` mirrors customer's `.dark` class toggle. Preference persists via `localStorage.baked_driver_theme`. Toggle lives on `/driver/profile` at `data-testid='driver-theme-toggle'`.
- ✅ **Light Mode Fix — SENDbakēd Home** — all hard-coded `#111111 / #2a2a2a / text-white / #fff` values in `ExpressHome.jsx` (top bar, map hero, pickup search, Send Now cards, service cards, trust banner, GPS button) migrated to Tailwind semantic tokens (`bg-card / bg-background / border-border / text-foreground / text-muted-foreground`) so both light and dark modes render correctly.
- ✅ **Testing** — iter63 (7/7 backend + partial frontend) + iter64 (100% frontend after SlideToConfirm remount fix via `key={cfg.slideTestId}` + `xRef`).

## Prior (2026-02-24) — Homepage CMS Phase C
- ✅ **Homepage CMS Phase C — Visual Polish (2026-02-24)** — full rewrite of `/app/frontend/src/pages/ConfigHomepage.jsx` to premium dark-first design matching Baked Mart.pdf + HomeLook.png + Inventory_Prompt.txt.
  - Hero: full-bleed image with dark overlay, headline, MARTbakēd chip, primary green CTA + optional secondary CTA, right-side delivery info panel bound to `country` config (Delivery in ETA, min order, delivery fee, free-over threshold, "Popular near you").
  - Module switcher: 6 coloured tiles (MART green `#77BC1F`, FOOD orange `#F97316`, SHOP cyan `#06B6D4`, SEND yellow `#FCC44C`, AUTO red `#EF4444`, IMMO purple `#A855F7`) with icon plate, taglines, hover glow, deep-links to `/`, `/food`, `/shop`, `/express`, `/auto`, `/immo`.
  - Category grid: rich tiles with image support + hover lift; falls back to Store icon on missing image.
  - Promotional banner: full-bleed image with gradient overlay, badge, headline, CTA.
  - Banner trio: 3-across dark cards with images + eyebrow + label + subtitle + arrow hover reveal.
  - Product carousel: horizontal snap-scroll with prev/next `ChevronLeft/Right` buttons that scroll 80% of container width, keyboard/mouse friendly.
  - Brand carousel: greyscale-until-hover logo strip.
  - App promotion: two-column dark-green gradient with QR + Play/App Store buttons (styled with tagline eyebrow).
  - CTA strip: green gradient with radial glow.
  - **Trust strip**: persistent 4-tile row (fast delivery / range / prices / returns) always rendered at page tail — admin cannot accidentally hide the reassurance messaging.
  - `compactMoney()` helper strips trailing `.00` on whole-value currency amounts for cleaner delivery-panel presentation.
  - Every interactive element carries a `data-testid` (`hp-*`).
  - **Testing**: `testing_agent_v3_fork` iteration_61.json — 9/9 backend pytest (`/app/backend/tests/test_homepage_cms.py` covers Phase B upload roundtrip + Phase C public feed + admin CRUD + auth-gates) + full Playwright E2E on desktop 1440x900 + mobile 390x844. Zero console errors. Country switch CI → IN verified.
- ✅ **Homepage CMS Phase B (2026-02-24)** — image uploads via Emergent Object Storage.
  - Admin: `POST /api/admin/homepage-sections/uploads` — 8 MB size cap, image-type validated, returns relative `/api/homepage/uploads/{key}` URL.
  - Public serve: `GET /api/homepage/uploads/{key:path}` — content-type preserved.
  - Frontend: `ImageField` inside `AdminHomepageManagement.jsx` — upload button with progress state, preview render, clear button.

## Tech Stack (v1)
- Frontend: React (CRA) + Tailwind + shadcn/ui + Framer + React Router + sonner + Poppins
- Backend: FastAPI + Motor (MongoDB) + emergentintegrations + JWT
- Config: Configuration Driven — countries/modules/currencies/locales seeded as data, adding new markets = insert only
- Event Bus: In-process abstraction with RabbitMQ-compatible interface

## Personas
1. **Customer** — Phone/OTP-first, browses MART, adds to cart. Single unified identity across all 6 modules.
2. **Partner (merchant)** — Phase 4
3. **Driver** — Phase 5
4. **Admin / Super Admin** — Phase 6

## Static Core Requirements
- Mobile-first design, dark by default, light supported
- WCAG 2.2 AA, Poppins font, module colour tokens (MART/FOOD green, SHOP/EXPRESS yellow, AUTO red, IMMO purple, platform blue)
- One customer identity across all business modules
- Multi-country, multi-currency, multi-locale — no hardcoded values

## Implemented (v1 — 2026-02)
- ✅ Configuration Driven Modular Monolith backend (core/ + shared/ + modules/)
- ✅ Shared foundation: Auth (phone/OTP + Google), Customer, Config, AI, Admin
- ✅ Provider abstraction: OtpProvider (Dev now; Twilio + Africa's Talking stubs ready), AiProvider (Emergent LLM → Claude Sonnet 4.6), PaymentProvider (COD live; Stripe + Mobile Money stubs)
- ✅ Event bus abstraction — OrderCreated → PaymentCompleted → OrderUpdated → AnalyticsUpdated → AI_REQUESTED wired
- ✅ MARTbakēd module: categories, products, offers, stores, multi-module cart, **checkout + orders**, delivery slots, payment methods
- ✅ Seed data: CI + GB countries, 9 bilingual categories, 24 CI + 12 GB products, 3 offers, 3 stores, 5 CI + 2 GB cities, 5 roles, 2 AI prompts, super_admin
- ✅ Website: 6-module Getir-style tab bar (all official wordmarks, dark+light), MART Home, Category listing, Product listing/detail, Cart, **Checkout with address + slot + payment**, **Order confirmation + Orders list**
- ✅ Phone+OTP dialog + Google login + language switcher + auto-detect language + country switcher
- ✅ AI Product Search (Claude Sonnet 4.6) on customer home
- ✅ **Super Admin Platform** — email/password login, sidebar layout, 10 pages: Dashboard KPIs, Countries CRUD, Cities CRUD, Roles view, Finance (rolling 30d), AI Command Center (prompt library CRUD), AI Business Insights (LLM narrative), Audit Logs, Customers, Admin Users (super_admin creates more admins)
- ✅ Seeded super_admin: depexopenai@gmail.com / baked@2026#!$@ (bcrypt hashed, stored in DB, credentials in .env for rotation)
- ✅ **PRD §7 Module-First Administration (2026-02)** — Super Admin sidebar strictly matches Platform Governance (Dashboard · Countries · Cities · Admin Users · Roles · AI Center · AI Business Insights · Finance · Analytics · Audit Logs · API Management · Infrastructure · System Settings). Customers/Vendors/Drivers are module-scoped.
- ✅ **MART Module Workspace** — sub-nav with Overview · Vendors · Catalogue · Inventory · Orders · Customers (module-scoped) · Drivers · Finance · AI · Analytics · Promotions · Support · Settings
- ✅ **Vendor lifecycle**: pending → approve → approved → activate → active (+ reject / suspend) with document upload
- ✅ **Drivers CRUD** per module with status transitions (pending/active/inactive/suspended)
- ✅ **Module-scoped customer view**: derived from ≥1 order OR active cart items in the module; enriched with orders count + spend by currency
- ✅ Seeded 5 MART vendors (CI + GB) covering all statuses, 4 drivers (CI + GB)
- ✅ **Mobile Web Experience — Pass 1 (2026-02)** — replicates MARTbakēd mobile app spec at viewport <768px. Files under `/app/frontend/src/components/mobile/` and `/pages/mobile/`.
   - Reusable primitives: MobileShell, MobileHeader (address + wallet + notifications + search), MobileBottomNav (Home · Categories · [center FAB] · Cart · Profile), AppSelectorSheet (6-app bottom sheet), MobileProductCard (grid + row layouts), QuantityStepper, FilterDrawer (Sort/Type/Price/Origin left-rail bottom sheet)
   - Screens shipped: Mobile Home (hero + delivery stats + top categories + best offers + best deals + trust strip), Categories index (3-col grid), Category Detail (left subcategory rail + right product grid), Product Detail (image · badges · quantity · related · sticky Add-to-Cart + Buy Now), Cart (list + notes + summary + sticky checkout), Checkout (address · slots · payment · sticky pay), Wallet placeholder ("Coming Soon" per user directive — real balance not faked)
   - Desktop layout at ≥768px preserved unchanged
- ✅ **Mobile Web Experience — Pass 2 (2026-02)** — closes the order loop.
   - Backend: `POST /orders` accepts inline `address` + `delivery_slot` code (auto-creates address record). New `GET /orders/:id/tracking` returns stage + timeline + demo driver + interpolated geo coordinates (auto-progresses `placed → preparing → picked_up → on_the_way → delivered` based on order age). New `POST /orders/:id/rate` accepts 1-5 star rating + optional comment.
   - Frontend: MobileOrderConfirmation (green success hero + confetti burst + timeline + summary + delivery details), MobileOrderTracking (status hero + **Leaflet + OpenStreetMap dark tiles** map with animated driver marker, store & destination pins, dashed route line + driver card with call/chat + polling every 4s + share status), MobileOrderDelivered (5-star rating + optional comment + freshness guarantee + delivery summary + reorder)
   - Component: `TrackingMap` uses vanilla Leaflet (no react-leaflet) with custom SVG DivIcons for cohesion with brand tokens; auto-fits bounds; interpolates driver position between store & destination based on elapsed seconds
- ✅ **Global Profile Module — Pass 1 (2026-02, per Profile PDFs)** — shared identity module accessed via the bottom-nav Profile tab.
   - Backend endpoints on `/api/customers/me`: `/preferences` (GET/PATCH), `/addresses` (full CRUD + default-address transfer), `/referrals` (real code `BAKED____` + share link + friend counter, no fake stats), `/tickets` (categories: order/delivery/wallet/payment/property/vehicle/account/other · statuses: open/in_progress/resolved/closed · priorities: low/normal/high/urgent), `DELETE /me` for GDPR account deletion.
   - Frontend screens: MobileProfile (identity hero + ecosystem strip + navigation list + dark-mode toggle + logout), MobileAddresses (Home/Office/Warehouse/Family label chips, add/edit/delete/set-default flow), MobileSettings (Account · Notifications · App Preferences · Appearance · Privacy — live toggles persist), MobileHelpSupport (Live Chat / Call Support / Email Us tiles + new-ticket form with 8 category tiles + real ticket counters + ticket list).
   - Bottom-nav Profile tab now routes to `/profile` (was `/orders`). Verified end-to-end via curl + mobile screenshots.
- ✅ **Global Profile Module — Pass 2 (2026-02)** — closes out every screen in the Profile PDFs.
   - Backend: `/api/customers/me/wallet` returns 0.00 balance + real transaction feed derived from paid orders (COD purchases listed for reference — do NOT reduce balance since paid outside wallet). Auto-Top-Up / Add Money / Withdraw / Refunds exposed as future-ready actions with `available: false`. `/api/customers/me/rewards` returns points, worth, conversion rate (100 points = 1 unit), tiered redemption table + recent earnings list (empty until earning is enabled).
   - Frontend screens: **MobileWallet** (glowing balance card + WALLET COMING SOON chip, disabled quick actions, Auto Top-Up card, real transaction list linking to order details, cross-ecosystem strip, security trust card), **MobileActivities** (top tabs Deliveries / Orders / Property / Vehicle — Deliveries pulls user&apos;s active/completed/cancelled orders with Track-now CTA; Orders shows All/Food/Mart/Shop filter with real orders; Property & Vehicle show clean empty states with previewed sub-tabs), **MobileRewards** (gold hero with points count, 100=1 conversion rate, 3-step how-it-works, empty-state for recent earnings, tier redemption table), **MobileRefer** (real code `BAKED____` + shareable link, Copy/Share via WhatsApp/SMS/Email/native, stats grid with 0 friends joined / 0 pending / 0 earned — no fake numbers, 3-step how-it-works).
   - MobileShell now hides the global header on all `/profile/*` and `/wallet` routes to match the PDF layout — sub-headers only.
- **Profile module = 100% complete** (11/11 screens per PRD Profile PDFs).
- ✅ **Rewards Earning Engine (2026-02)** — live earning + redemption pipeline.
   - Backend: `CreateOrderIn.use_points` accepts a redemption amount; server caps redemption so it never violates min-order; on order confirmation we deduct redeemed points, credit `subtotal * REWARD_EARN_RATE` (1 pt per unit) and persist an entry per side in `db.reward_entries`. `GET /api/mart/cart/eligibility?use_points=N` previews `points_applied`, `points_discount`, `total_after_points`, `points_max_redeemable`, `points_earned_preview` — one source of truth. `GET /api/customers/me/rewards.recent` returns the persisted earn/redeem entries. Constants: `REWARD_EARN_RATE=1`, `REWARD_CONVERSION=100` (100 pts = 1 unit).
   - Frontend: MobileCheckout shows **Redeem baked Points** tile (available balance, Use-max button, live slider with 100-pt steps, "Using N pts → −X discount" hint, min-order guard), plus a "+X baked Points will be credited when this order is confirmed" preview strip. Order summary now includes a "Points discount (N pts)" row. MobileOrderConfirmation shows a "baked Rewards · You earned +X pts · Redeemed N pts" card linking to /profile/rewards. MobileRewards Recent list is populated live with proper signs & formatted dates.
- ✅ **Desktop Profile Responsive Layout (2026-02)** — closes the Fixing Prompt.
   - New `/app/frontend/src/components/profile/DesktopProfileShell.jsx` renders a 260px sidebar + fluid content area for viewports ≥768px. Blue active state (#1D9BF0) with left accent bar, persistent Dark Mode toggle + Logout, sticky top-24 sidebar.
   - `DesktopCustomerShell` now wraps every `/profile/*` and `/wallet` route in `<DesktopProfileShell>` around the existing Mobile* pages — **shared components, no duplication**. CSS in `index.css` hides mobile sub-header back buttons inside `.desktop-profile-content`.
   - **TopNav bug fix**: profile icon now navigates directly to `/profile` for logged-in customers (was a popover). Guest click stores `sessionStorage.baked_post_login = "/profile"` and opens the login dialog.
   - **Auth flow**: `loginWithToken` reads `baked_post_login` after login and hard-navigates to it — guests attempting a profile route are seamlessly returned after auth.
   - Mobile experience preserved unchanged (`isMobile` still routes to `MobileCustomerShell`).
- ✅ **Mobile Auth Flow Bug Fix (2026-02-20)** — mobile "Continue to sign in" was navigating to `/` (Home) instead of opening the login dialog because `PhoneLoginDialog` was only mounted in the desktop `TopNav`.
   - Lifted dialog state into `AuthContext` (`loginOpen`, `openLogin(target?)`, `closeLogin`); stores the return path in `sessionStorage.baked_post_login` when target is provided (or current pathname when omitted).
   - New `GlobalLoginDialog` component rendered once in both `DesktopCustomerShell` and `MobileCustomerShell`; TopNav now consumes `openLogin("/profile")` from context instead of owning local dialog state.
   - New `GuestSignInPrompt` component replaces the plain-text "Please sign in…" stubs across `MobileWallet` / `MobileActivities` / `MobileAddresses` / `MobileSettings` / `MobileHelpSupport` / `MobileRewards` / `MobileRefer` — each remembers its own path so users land back on the exact page after auth.
   - Verified end-to-end via Playwright: guest → /wallet → tap "Continue to sign in" → OTP → auto-redirect back to /wallet as authenticated.
- ✅ **Global Address & Location System — Phase A (2026-02-20)** — foundational rebuild for the new Google Maps-powered address flow.
   - **Country cleanup**: removed GB / GBP / en-GB / London / UK vendors, drivers, products, cities, seed rows, and every hardcoded fallback (i18n, admin fmtMoney, TopNav placeholders, MobileHeader placeholders, HomePage popular zones). A `_cleanup_removed_countries` step in `seed.py` self-heals any residual GB/LBR docs on future startups.
   - **Liberia added** as the second production country: `LR / LRD / L$ / +231 / en-LR / Africa/Monrovia` with LRD-denominated min-order 2000 / delivery fee 200 / free-over 6000 and 15-20 min ETA. Seeded 3 Liberian cities (Monrovia, Buchanan, Ganta) and 2 hubs (`Sinkor`, `Congo Town`) with real GPS coordinates. LR mirror of the top 12 products at LRD prices.
   - **Production visibility flag**: countries now carry `production_visible: true`; `GET /api/config/countries` filters by this flag when `APP_ENV=production` so QA can seed future countries without exposing them in the live app.
   - **Rich address schema**: `AddressIn` extended with `place_id`, `formatted_address`, `region`, `postal_code` (all optional — no breaking changes for existing rows). Wallet/rewards/referrals no longer hardcode GBP fallback — they resolve currency via `_country_currency()` lookup against the `countries` collection.
   - **Serviceability service** (`/app/backend/shared/addresses/routes.py`): `GET /api/addresses/serviceability?lat=&lng=&country=` computes Haversine distance to the nearest active hub and returns `{ serviceable, distance_km, nearest_hub, radius_km, message }` using each country's `service_radius_km` (15 km).
   - **Recent searches**: `GET/POST/DELETE /api/addresses/recent-searches` — de-duped per-place, capped at 10, per-user server-side (guests use `localStorage` fallback).
   - **Frontend groundwork**: installed `@vis.gl/react-google-maps` + `REACT_APP_GOOGLE_MAPS_API_KEY` env var. New shared `AddressSelector` component (bottom-sheet on mobile, centered dialog on desktop) with Google Places Autocomplete (country-restricted), Detect-My-Location via Geolocation API + reverse geocode, Saved Addresses, Recent Searches, Serviceability check, and a map preview using `AdvancedMarker`. Legacy "country popover" on the delivery pill is replaced by a real **AddressPill** that opens the selector; a small country-flag pill remains for currency/language switching.
   - **AppContext** now owns `activeAddress` (persisted in `localStorage`) + `openAddressSelector` / `closeAddressSelector` — every module reads from the same source.
   - **Awaiting Google Maps API key** from user to complete Phase B (wire live places API); until then the selector renders a friendly "not configured" fallback.
- ✅ **Global Address & Location System — Phase B (2026-02-21)** — Google Maps live, Places API (New) migration, and checkout integration.
   - **Google Maps API key** received and wired: `frontend/.env → REACT_APP_GOOGLE_MAPS_API_KEY`. Frontend restarts pick it up.
   - **Migrated to Places API (New)** since the user's Google Cloud project only enables the new APIs: `lib/googleMaps.js` now uses `google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions` + `Place.fetchFields` (via `_suggestion.placePrediction.toPlace()`). Removed all legacy `AutocompleteService` / `PlacesService` code. Reverse-geocoding via the classic `google.maps.Geocoder` (still supported under Geocoding API).
   - **Live end-to-end verified via Playwright** on both mobile (390×844) and desktop (1440×900):
      - CI: search "Cocody Angre" → 5 predictions → tap → map preview + "We deliver here · MARTbakēd Cocody · 3.49 km" → Confirm → header pill updates.
      - LR: switch country → search "Sinkor" → serviceable via Congo Town hub 2.56 km.
      - Unserviceable: search "Bouake" (~360 km) → red "Not available yet" + Confirm button DISABLED.
   - **Testing agent iteration_4.json**: 33/33 backend tests pass, ~92% frontend success. Flagged one integration gap (below) which is now fixed.
   - **Checkout integration fix**: `MobileCheckout` and `CheckoutPage` now consume `activeAddress` on mount + subscribe to changes. Mobile hydrates its local form; desktop pre-selects a matching saved address (by id / place_id / formatted_address). The `OrderAddressIn` schema on the backend now accepts `place_id`, `formatted_address`, `region`, `postal_code`, `label` so the rich Google Places metadata persists on the order.
   - **AddressPill spacing**: eyebrow "Deliver to" wrapped in `<span>` to give screen-reader-friendly whitespace between the label and address text; visual layout unchanged (they were already on separate lines).
- ✅ **EXPRESSbakēd — Phase 1 (2026-02-23)** — full customer booking flow (Parcel 5-step wizard + Packers & Movers 6-step wizard) shipped end-to-end.
   - **Backend module** `/app/backend/modules/express/`: pricing engine (Haversine + peak/night/service_fee/insurance/promo/taxes — 100% config-driven, no hardcoded constants at runtime), routes (vehicles / package-types / weight-tiers / delivery-prefs / movers taxonomy / quote-parcel / quote-movers / bookings CRUD), idempotent seed (5 vehicles × 2 countries, 6 package types, 27 movers items across 6 categories, 4 time slots).
   - **Configuration-driven**: all pricing rules live in `express_pricing_rules` (per vehicle × country) and `express_movers_pricing` — editable from Super Admin (Phase 4). CI seeded XOF (Bike 1500 / Scooter 2500 / 3W 5000 / Mini 12000 / Truck 25000). LR seeded LRD (Bike 500 / Scooter 800 / 3W 1500 / Mini 4000 / Truck 8000).
   - **AddressSelector picker mode**: `openAddressSelector({ onPick, title })` returns the picked address via callback instead of setting global activeAddress — used per-field (pickup vs drop) throughout both wizards.
   - **Frontend contexts**: `ExpressBookingProvider` + `MoversBookingProvider` (session-storage persisted drafts so refresh doesn't lose progress).
   - **Parcel wizard** (`/express/book/{location, receiver, vehicle, package, estimate}`): live per-vehicle quotes on Step 3 (cheapest gets "BEST" badge), sticky WizardProgress dots at every step, real Google Places pickup/drop pickers, full price breakdown, promo input, COD-selected + Wallet-disabled ("Coming soon"), booking creation navigates to `/express/booking/{id}?success=1`.
   - **Movers wizard** (`/express/movers` landing + `/express/movers/wizard`): 6 steps — move type / pickup+drop with building details (lift/stairs/floor/parking) / items catalog (Living Room/Bedroom/Kitchen/Office/Outdoor/Others with +/- quantity picker) / quote (transportation + packing + loading + labour + floors + insurance + taxes + advance/remaining split) / date & time slot picker with 7-day calendar / review with terms checkbox and Book Now.
   - **App-selector sheet**: `express` module marked `active` — surfaces from the mobile bottom-nav center switcher.
   - **MobileShell**: hides bottom nav on `/express/book/*` and `/express/movers/wizard` and `/express/booking/*` routes (same pattern as `/checkout`) so the sticky Continue CTA isn't overlapped by the Profile tab.
   - **Booking Confirmation**: branches its "Your delivery/move" summary between parcel (km/min/vehicle) and movers (move_type/item-count/date+slot); movers get a green "Move confirmed" pill instead of the pulsing "searching driver".
   - **Booking refs** hardened with a 4-hex `secrets.token_hex(2)` suffix to prevent collisions under concurrency (`EXP########XXXX`).
   - **Testing agent iteration_5.json**: 15/15 backend pytest cases pass (parcel + movers quotes, auth-guard, booking persistence). Frontend ~90% initially — two flagged issues (bottom-nav overlap on wizard, movers confirmation stale km/min) both fixed and re-verified via Playwright.
   - Phase 2 (Live Tracking + WebSockets + Driver Dispatch) queued next — see ROADMAP.
- ✅ **EXPRESSbakēd — Home Redesign + Dedicated Module Identity (2026-02-23)** — full redesign matching the approved PDF reference, distinct from MART.
   - **Own top bar**: EXPRESSbakēd wordmark (yellow gradient) · notification bell · wallet pill · address row with ETA badge · module switcher pill.
   - **Interactive Google Map hero** (`/app/frontend/src/pages/express/ExpressHome.jsx`): dark-styled map centered on user location (CI/LR), 7 yellow driver markers (rotating bike/scooter/3W/truck icons) sprinkled around the center via a deterministic seed, animated blue user pin, GPS button bottom-right that recenters via `navigator.geolocation`.
   - **Horizontal "Send Now" vehicle cards** (snap-scroll): big yellow icon plate, "Send by Bike/3 Wheeler/Truck" title, short description, ETA badge, "from <price>" (live from `/api/express/vehicles`), circular arrow CTA.
   - **Bulk Deliveries + Home Shifting** side-by-side cards below vehicles.
   - **Dedicated `ExpressBottomNav`** (`/app/frontend/src/components/express/ExpressBottomNav.jsx`): Home · Bookings · [Center yellow FAB with package icon → App Selector] · Services · Profile. `MobileShell` swaps to this on any `/express*` route. Old MART Categories/Cart tabs removed on Express.
   - **Color language switched module-wide to Express yellow `#FCC44C`**: replaced 75 occurrences of `#77BC1F` across `ExpressHome.jsx`, `ExpressWizard.jsx`, `MoversWizard.jsx`, `ExpressLayout.jsx`. All active states, progress dots, buttons, chips, badges, and confirmation icons now render yellow-on-black.
   - **Visual verified via Playwright** at 390×844: EXPRESSbakēd wordmark, address (Cocody, Abidjan · 10-15 min pill), live Google Map with driver markers around Cocody, pickup search bar, Send by Bike/3 Wheeler card visible in horizontal scroller with "from 1500 CFA" / "from 5000 CFA", Express bottom nav present (Home/Bookings/FAB/Services/Profile), all old MART tabs absent.
- ✅ **EXPRESSbakēd — Premium Image-First Refinement (2026-02-24)** — replaced all generic icons with the approved branded PNG renders and made the module truly stand-alone.
   - **Brand assets wired** via `/app/frontend/src/lib/expressAssets.js`: `EXPRESSbaked.png` (wordmark), `EXPRESSBike.png`, `EXPRESS3W.png`, `EXPRESSTruck.png`, `Parcel.png`, `Home_Shifting.png`. Never fall back to generated icons — `vehicleImage(code)` maps every vehicle to its real render.
   - **Home hero redesigned**: image-first vehicle cards ("Send by Bike/Mini 3W/Truck"), radial-yellow glow behind each image, ETA chip overlay, big yellow circular ➜ button, "from X CFA" — no paragraph text. Horizontal snap-scroller with `pr-8` on the container so the third card is partially cut off, naturally inviting the swipe. Bulk/Home-Shifting cards use `Parcel.png` and `Home_Shifting.png` at 96px height.
   - **Header uses the wordmark PNG** (not text). Right side keeps bell + wallet pill; second row shows address + a compact module pill (also PNG wordmark).
   - **Express-only Bookings page** (`/app/frontend/src/pages/express/ExpressBookings.jsx`): 3 tabs (Active / Completed / Cancelled), Express status vocabulary (Finding driver → Driver assigned → Arriving → Picked up → In transit → Delivered), cards use the vehicle PNG or `Home_Shifting.png` for movers; empty state has an EXPRESS-yellow CTA. Guest sign-in prompt uses the shared `GuestSignInPrompt` with new `accent` prop set to `#FCC44C`.
   - **Express-only Services page** (`/app/frontend/src/pages/express/ExpressServices.jsx`): 8 tiles — Parcel Delivery, Packers & Movers (both with brand artwork), Home Shifting, Business Delivery, Bulk Delivery, Document Delivery, Scheduled Delivery, Airport Delivery (Soon badge). Each active tile deep-links into the correct booking flow.
   - **Zero MART leak**: routes `/express/bookings` and `/express/services` now render Express-only pages (previously the catch-all rendered MobileHome). Verified via Playwright — URL stays put and only Express bottom-nav is present, no MART nav element in the DOM.
   - **GuestSignInPrompt** extended with `accent` prop (defaults to MART green for backward compat) — Express passes yellow, everywhere else keeps green.
- ✅ **EXPRESSbakēd — Desktop Navigation Cleanup (2026-02-24, Fixing_Prompt.docx)** — targeted refactor of the desktop `/express` page per the user's spec.
- ✅ **EXPRESSbakēd Phase 2 — Live Tracking + Dispatch + Drivers CRUD (2026-02-24)** — production-ready with a configurable demo mode.
   - **Configurable DEMO_MODE**: `EXPRESS_DEMO_MODE=true|false` env in `backend/.env`. Same codebase → when true, a background simulator walks each new parcel booking through the full lifecycle in ~2 minutes with interpolated driver movement; when false, only the driver-app status endpoint advances the state.
   - **Dispatch** (`/app/backend/modules/express/dispatch.py`): Haversine-based nearest-driver selection with a FALLBACK_CHAIN (bike→scooter→3W, etc.) so bookings never fail on empty inventory. `assign_driver_to_booking` uses an atomic Mongo update filter (`{is_available: true} → false`) to prevent double-dispatch.
   - **Live Tracking WebSocket** (`/app/backend/modules/express/tracking.py`): `ConnectionManager` fans out to every socket watching a booking id, prunes dead connections under a lock. `transition_status` persists + broadcasts each status change. `_stream_movement` interpolates driver lat/lng from A→B over N seconds, emitting a `location` frame every 2s with a live `eta_seconds` countdown.
   - **Route**: `GET /api/express/ws/bookings/{booking_id}` — sends initial snapshot then continuous updates.
   - **Production path**: `POST /api/express/bookings/{id}/driver-status` with `{status, lat, lng}` — enforces `ALLOWED_TRANSITIONS` (searching → driver_assigned → arriving → picked_up → in_transit → delivered), auto-releases the driver on delivered. (JWT auth to be added in Phase 5 with the driver app.)
   - **Seed drivers** (`seed_express_drivers`): 15 CI + 15 LR drivers, phone-idempotent, spread around country reference centers using a golden-angle (137.5°) spiral at 0.9–3 km. All 5 vehicles covered per country.
   - **Customer live tracking page** (`/app/frontend/src/pages/express/ExpressLiveTracking.jsx`): Google Map hero with animated driver marker + pickup/drop pins, LIVE/OFFLINE WebSocket chip, 6-step progress bar, driver card (name, rating, vehicle, call button), route summary, "Book another delivery" CTA on delivery. Auto-reconnect (3s) on WS drop. Route `/express/booking/:id/track` wired into both desktop + mobile shells.
   - **Auto-redirect**: `ExpressBookingConfirmation` now auto-navigates parcel bookings to `/track` 1.2s after success, so the live view is the primary flow.
   - **Admin drivers CRUD** (`/app/frontend/src/pages/admin/ModulePages.jsx` → ModuleDrivers): Express-only Availability + Rating columns, `driver-avail-{id}` chip toggles is_available in real time. Add-driver form gets current_lat / current_lng / rating fields when module = express. Existing MART CRUD unchanged.
   - **Testing**: `testing_agent_v3_fork` iteration_7.json — 11/11 backend pytest suite (`/app/backend/tests/test_express_phase2.py`) pass, including the full 2-minute lifecycle test. Frontend live-tracking + admin drivers table verified end-to-end.
   - **Duplicate module nav bar removed**: `ExpressDesktopHome` no longer renders its own `<nav>` with MART/FOOD/SHOP/EXPRESS/AUTO/IMMO. Only the global `<ModuleTabs />` (rendered inside `DesktopCustomerShell`) exists on the page — verified via `document.querySelectorAll('[data-testid=module-tab-mart]').length === 1`.
   - **Active-tab highlight now route-driven** (`/app/frontend/src/components/layout/ModuleTabs.jsx`): `routeToModule(pathname)` derives the active module from the URL and `useEffect` syncs `setActiveModule`. On `/express` the EXPRESSbakēd tab is highlighted in yellow; MARTbakēd is no longer active. Any tab click navigates to `m.route` (was hard-coded to `/`).
   - **Placeholder image replaced with proper wordmark**: previous `<img src={EXPRESS_ASSETS.wordmark}>` referenced an 853×1844 mobile-mockup PNG that squished into a broken-looking sliver. Replaced with `<BrandedModuleLabel code="express" label="EXPRESS" color="#FCC44C" height={36} />` (wrapped in a span carrying the `exp-dt-wordmark` test-id). The mobile top bar was updated identically with `exp-top-wordmark`.
   - **Clean left header**: contains ONLY wordmark → delivery location → ETA badge. Bell + theme toggle removed from the header per docx spec (global theme toggle in `TopNav` handles this).
   - **Theme-adaptive surfaces**: added `.exp-dt-panel` (`hsl(var(--card))` light / `#0f0f0f` dark) and `.exp-dt-tile` (`hsl(var(--muted))` light / `#151515` dark) utility classes in `index.css`. Applied to left panel, right map container, vehicle cards, service cards, explore CTA, and trust banner. Verified light theme toggle flips backgrounds from black-tone to white-tone with readable text.
   - **Google Maps `mapId + styles` warning fixed**: removed unused `styles={DARK_MAP_STYLE}` from both `MapHero` and `DesktopMapHero` (they use `mapId` so cloud styling applies).
   - **Kept untouched (per docx)**: Google Map panel, vehicle cards (Bike/3W/Truck), Parcel Delivery, Home Shifting, Book Now flow, 45/55 desktop split layout.
- ✅ **EXPRESSbakēd Phase 2 — Sub-feature C: Pricing Engine Admin UI (2026-02-24)** — Super Admin can edit every rate that drives customer quotes, live.
   - **Route**: `/admin/modules/express/pricing` (Express-only tab in the module workspace, hidden on Mart/others; deep-link guard redirects `/admin/modules/mart/pricing` back to overview).
   - **Backend** (`/app/backend/shared/admin/module_routes.py`):
     - `GET /api/admin/modules/express/pricing?country=CI|LR` — aggregated view returning currency, active vehicles, all 5 parcel rules + movers config.
     - `PATCH /api/admin/modules/express/pricing/{country}/{vehicle_code}` — partial update with whitelisted fields (base_fare, min_fare, price_per_km, price_per_min, waiting_fee, peak_multiplier, night_multiplier, service_fee_pct, insurance_pct, insurance_min, taxes_pct, active). Rejects empty/unknown payloads.
     - `PATCH /api/admin/modules/express/movers-pricing/{country}` — 15 editable movers fields + active flag.
     - Full audit trail via `audit_logs` (`express.pricing.update`, `express.movers_pricing.update`).
   - **Frontend** (`/app/frontend/src/pages/admin/ModulePages.jsx` — new `ModulePricing`):
     - Country switcher (CI ↔ LR) with live currency change.
     - Parcel table: 5 vehicles × 11 numeric fields + Active checkbox + per-row Save (dirty state per row).
     - Movers card: grid of 15 numeric inputs + Active + single Save-movers.
     - Toast on save + auto-reload.
   - **Live pricing propagation verified**: admin PATCH bike base_fare 1500 → 3000 → next customer `POST /api/express/quote/parcel` returns base_fare=3000 and total 2 654 → 4 229 CFA. No caching, no restart needed.
   - **Testing**: `testing_agent_v3_fork` iteration_8.json — 13/13 backend pytest pass (`/app/backend/tests/test_express_pricing_admin.py`, session-scoped snapshot-and-restore fixture guarantees seeded state), 100% frontend on tested surfaces.
   - **Testing**: `testing_agent_v3_fork` iteration_6.json — 12/12 scripted frontend assertions pass. Mobile /express regression check also confirmed.
- ✅ **SENDbakēd Driver App — Slice 2 (2026-02) — Delivery Lifecycle END-TO-END**
   - Backend job state machine: `offered → accepted → arriving_pickup → picked_up → arriving_dropoff → delivered` (plus terminal `declined / expired / cancelled`) with pickup + delivery OTPs.
   - Endpoints (`/api/driver/me/jobs/{id}/…`): accept · decline · arrive-pickup · verify-pickup · arrive-dropoff · verify-delivery. Admin dispatcher: `POST /api/admin/drivers/{id}/dispatch-demo-job` (idempotent, returns any in-flight job).
   - `GET /api/driver/me/active-job` gates `pickup_otp` to statuses `accepted / arriving_pickup` and `delivery_otp` to `picked_up / arriving_dropoff` (so QA can flow through E2E without a customer app).
   - Frontend PWA (`/app/frontend/src/apps/driver/DriverApp.jsx`): incoming-request bottom sheet (`[data-testid=driver-incoming-sheet]`) with 45s countdown + Accept/Decline; JobPage stage machine with map placeholder, progress dots and stage-aware CTA / OTP input; JobSuccess screen. Dashboard polls `/me/active-job` every 5s only while `approved && is_online`.
   - Polish: `useActiveJob` now guards setState with an `isMounted` ref and halts polling on terminal states (`delivered / cancelled / expired / declined`) — silences the concurrent-rendering warning that surfaced on the success screen.
   - **Testing**: `testing_agent_v3_fork` iteration_42.json — 5/5 backend pytest (`/app/backend/tests/test_driver_slice2_lifecycle.py`) + full Playwright E2E on Chromium 390×844 covering register → 7-step KYC (+3 uploads) → submit → admin approve → go online → dispatch → accept → arrive-pickup → verify pickup OTP → arrive-dropoff → verify delivery OTP → success. Wrong-OTP path also verified (400 `otp_invalid`).


## Backlog (prioritised)
- ✅ **SENDbakēd Driver App — Slice 3 (2026-02) — Wallet: earnings ledger + withdrawals**
   - New tables: `driver_earnings` (append-only ledger, kind: fare/tip/bonus/adjustment) with unique index on (job_id, kind) — guarantees no double-credit on retries. `driver_withdrawals` (status: pending/paid/failed) with bank snapshot frozen at request time. Migration `0023_driver_wallet` includes an idempotent backfill for pre-existing delivered jobs.
   - Auto-credit hook: `POST /api/driver/me/jobs/{id}/verify-delivery` now inserts a `fare` earning inside the same commit (SELECT-then-INSERT guarded by the unique index).
   - Endpoints: `GET /api/driver/me/earnings` returns `{ currency, available_balance, lifetime, today/week/month {amount, trips}, recent[30], pending_withdrawal }`. `POST /me/withdrawals` (validations in order: bank_missing → withdrawal_pending → below_minimum → insufficient_balance; minimums ₹100 / 1000 CFA). `GET /me/withdrawals` newest-first. `available_balance = lifetime - Σ(pending|paid)`, so a pending request locks funds.
   - Frontend PWA (`/driver/wallet`): balance hero card, `[data-testid=wallet-*]` test-ids across balance, range-picker (today/week/month), ledger list, pending payout strip, and a bottom sheet WithdrawSheet with bank last-4 snapshot + amount input. Dashboard gained a `[data-testid=driver-wallet-entry]` tile; the "Coming next" chips advanced to Slice 4 (Incentives, Live nav map, In-ride chat).
   - Dashboard summary now sources today's earnings from the ledger — no more hardcoded `0`.
   - **Mocked**: payout gateway — status starts `pending`, no real bank transfer yet (Stripe/Razorpay slotted for Phase 8).
   - **Testing**: `testing_agent_v3_fork` iteration_43.json — 9/9 backend pytest (`/app/backend/tests/test_driver_wallet.py`) covering zero-balance shape, fare-credit idempotency, dashboard ledger source, and all 4 withdrawal validation branches. Full Playwright E2E on 390×844 iPhone viewport verified the wallet page, range picker, ledger, withdraw sheet submit → pending state.

- **P0**: Checkout + Order flow (Phase 2), Payment provider abstraction, Wallet
- **P1**: Super Admin Platform (Phase 6), RBAC-guarded admin endpoints, AI Business Insights UI
- ✅ **SENDbakēd Driver App — Slice 4 (2026-02) — Live Nav Map**
   - New component `/app/frontend/src/apps/driver/DriverNavMap.jsx`: wraps `@vis.gl/react-google-maps` `APIProvider + Map`, draws a Google Directions polyline from the driver's live GPS to pickup (while `accepted / arriving_pickup`) or drop-off (while `picked_up / arriving_dropoff`). Distance + ETA read from `DirectionsService` and shown as glass chips ([data-testid=driver-map-distance] and [data-testid=driver-map-eta]). Haversine fallback keeps the chip populated before Directions resolves.
   - Driver marker uses live `navigator.geolocation.watchPosition`; falls back to the pickup coordinate if the driver denies GPS. Destination marker swaps between white-circle (pickup) and black-circle (drop-off).
   - "Navigate" chip ([data-testid=driver-map-open-google]) deep-links to `https://www.google.com/maps/dir/?api=1&origin=…&destination=…` for native turn-by-turn.
   - JobPage: placeholder tile removed; new map takes its place. Dashboard "Coming next" chips advanced to Incentives / In-ride chat / Analytics.
   - **Bug fix (regression from Slice 2)**: `useActiveJob`'s `isMounted` ref was StrictMode-incompatible — the dev-mode simulated-unmount permanently set `mountedRef.current=false`, breaking `/driver/job/live` in dev. Fixed by resetting the ref on the mount body of the effect: `useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, [])`.
   - **Testing**: `testing_agent_v3_fork` iteration_44.json — frontend Playwright with `context.grant_permissions(['geolocation'])` + `set_geolocation(28.60, 77.35)` verified map render, chip values (7.9 km / 15 min pre-pickup → 5.6 km / 13 min post-pickup), going-to label swap, and Navigate popup URL. 0 console errors on /driver/job/live.

- ✅ **EXPRESSbakēd — Booking Wizard Redesign per Fixing_Prompt.docx (2026-02-24)** — full desktop/tablet parity with the Home page's 45/55 layout.
   - **New component** `/app/frontend/src/components/express/ExpressWizardShell.jsx`:
- ✅ **SENDbakēd Slice 5 (2026-02) — Admin Payout Console**
   - New endpoints on the driver admin_router (prefix `/api/admin/drivers`): `GET /withdrawals` (status/country/q filters, buckets over unfiltered set, pending_totals per currency, nested driver + last-4-masked bank), `POST /withdrawals/{id}/mark-paid` (409 on non-pending, clears stale failure_note), `POST /withdrawals/{id}/mark-failed` (optional note, empty stored as null).
   - New page `/app/frontend/src/pages/admin/AdminDriverPayouts.jsx`: KPI strip (pending amount per currency), pending/paid/failed/all tabs with badge counts, name/phone search, table with mark-paid + mark-failed buttons on pending rows, and a mark-failed dialog with an optional note that the driver sees back in their wallet.
   - Sidebar entry added under Platform Governance between Finance and Analytics ([data-testid=admin-nav-driver-payouts]).
   - Balance recomputation verified — `available_balance = lifetime - Σ(pending|paid)`, so mark-failed restores the driver's balance automatically; mark-paid keeps the amount locked.
   - **Testing**: `testing_agent_v3_fork` iteration_45.json — 14/14 backend pytest (`/app/backend/tests/test_admin_driver_payouts.py`) + full Playwright E2E on the console including dialog + note visibility + search + KPI.

     - Desktop (≥ md): 45% left = step form, 55% right = persistent live Google Map (sticky).
     - Mobile: full-screen form with a compact map card on top of every step.
- ✅ **SENDbakēd Slice 6 (2026-02) — In-Ride Chat + Public Customer Tracking**
   - New table `driver_job_messages` (job_id, sender: driver/customer, preset_key, text) + `driver_jobs.share_token` (unique, 20 char urlsafe). Migration `0024_driver_job_chat` backfills tokens for pre-existing in-flight jobs. `dispatch-demo-job` mints a token and logs the tracking URL to the backend (mocked SMS).
   - Fixed preset dictionaries per sender: `DRIVER_PRESETS` ("I'm downstairs" etc.) and `CUSTOMER_PRESETS` ("Please come to Gate B" etc.). Server canonicalises the preset label; cross-role preset_key is rejected with 400.
   - Endpoints — driver (JWT): `GET/POST /api/driver/me/jobs/{id}/messages` (ownership + terminal-state guard `409 chat_closed` after delivered). Public (share-token via `?t=`): `GET /api/send/track/{id}`, `GET/POST /api/send/track/{id}/messages`. Safe subset — no OTPs, no bank data, driver object gated to in-flight statuses.
   - Frontend: shared `JobChat.jsx` (bottom sheet, preset chips, free-text, 3s incremental polling via `?after=`), floating FAB with unread badge on `/driver/job/live` and the new public `/send/track/:jobId?t=<token>` page. `DriverNavMap` now accepts an optional `driverPosition` prop so the customer page renders the driver's server-side coordinate without a browser geolocation prompt.
   - **Bug fix**: JobChat's `applyIncoming` was calling `onUnreadChange` inside a `setMessages` updater — moved to run before the state update, silencing the React "setState during render of another component" warning.
   - **Testing**: `testing_agent_v3_fork` iteration_46.json — 18/18 backend pytest (`/app/backend/tests/test_driver_chat.py`) + full Playwright cross-side propagation test (customer preset → driver unread badge within one poll → open sheet → bubbles verified). All 400/404/409 guard branches asserted.

     - `<WizardMap>` sub-component: pickup/drop markers (A/B pins), Google Directions polyline (yellow), auto-fit bounds, live distance + ETA + selected-vehicle chip overlays.
   - **All 5 wizard steps refactored** (Location, Receiver, Vehicle, Package, Estimate) — now render inside `<ExpressWizardShell>` instead of a full-width column. Old `<RouteSummary>` mini-card removed (data lives on the map now).
- ✅ **SENDbakēd Slice 7 (2026-02) — Realtime WSS live tracking (Uber-style)**
   - Audit-first delivery per user request. Existing WSS precedent (`/api/express/ws/bookings/{id}`) verified through Cloudflare + Emergent K8s ingress with a live snapshot frame. Single-worker uvicorn today — realtime layer built behind a swap-able `InProcessPubSub` interface so a Redis backend can slot in later without touching route code.
   - New endpoints under `/api/ws/*`: `wss://…/api/ws/driver/jobs/{job_id}?token=<jwt>` (driver publishes) and `wss://…/api/ws/track/{job_id}?t=<share_token>` (customer subscribes). Both `accept()` before `close(code=4xxx)` so the client can distinguish `invalid_token` (4401) / `not_your_job` (4403) / `not_found` (4404) / `job_terminal` (4409).
   - Server-side 25 s heartbeat (`{type:'ping'}` → client `pong`), 60 s client-read timeout, malformed-frame tolerance (invalid `location` fields ignored — socket stays open). Broadcast fan-out via `job:{id}` channel with drop-oldest queue (`_MAX_LAG=128`, logs a warning on drop). No schema changes — the existing `drivers.current_lat/lng/last_seen_at` fields are updated via a gate + `create_task` so the DB is written to at most once per 10 s per driver even under a 2-3 s frame cadence.
   - Frontend: new shared `useJobSocket` hook (exponential backoff 1 s → 20 s, resets after 10 s stable, visibility-change reconnect, fallback poll via injected function). Rewritten `DriverNavMap` with rAF interpolation between the last two known coordinates, heading-based marker rotation, Directions API refresh policy **decoupled from GPS updates** (recalc only on ≥150 m deviation OR endpoint change OR every 45 s). Customer page (`SendTrackApp`) subscribes over WSS with a `send-track-conn-live|reconnecting` chip; 5 s REST poll now runs *only* while the socket is not open. Driver PWA publishes throttled to ≥2.5 s or ≥50 m from the last sent frame.
   - **Testing**: `testing_agent_v3_fork` iteration_47.json — 12/12 backend pytest (`/app/backend/tests/test_realtime_ws.py`, covers all 7 auth-guard branches, cross-job isolation, throttled Postgres write, heartbeat, malformed-frame tolerance) + customer-side Playwright E2E (WS open, hello snapshot, live chip, broadcast round-trip <500 ms). Driver-side outbound throttle & smooth-marker rAF loop lint-clean but not exercised by Playwright (test harness geolocation limitation).
   - **Bug fixes surfaced in review**: (a) `_persist_driver_location` create_task now gated at the call-site — under a 2 s cadence this drops ~4 of 5 potential `SessionLocal()` opens; (b) WS reject paths now `accept()` then `close(code=…)` so custom codes are actually observable on the client; (c) pub/sub drop-oldest now logs a warning so ops can catch slow subscribers.

   - **Step 3 (Vehicle Select)** now uses official EXPRESSbakēd branded assets (`vehicleImage(code)` from `expressAssets.js`) with the same radial-glow treatment as the home cards — replacing the generic Lucide bike/truck icons.
- ✅ **SENDbakēd Slice 8 (2026-02) — Redis realtime broker (multi-worker-ready)**
   - Redis 7.0.15 installed via apt + supervised (`/etc/supervisor/conf.d/supervisord_redis.conf`), config at `/app/backend/redis.conf` (bind 127.0.0.1, pubsub-only, `save ""`, `appendonly no`, `maxmemory 128mb`). Redis is a **pub/sub fan-out only** — Postgres remains the source of truth for every application row.
   - `modules/realtime/__init__.py` rewritten with a `PubSubBackend` Protocol + two implementations (`InProcessPubSub`, `RedisPubSub`). Boot-time selection via `initialise_pubsub()` — picks Redis when `REDIS_URL` is set AND `ping` succeeds within 2s, else falls back to `InProc`. Frontend / route contract unchanged.
   - `redis>=5.0` added to `requirements.txt` (pinned at 5.3.1). `RedisPubSub` uses `redis.asyncio` with `decode_responses=True` and JSON-serialised frames on the wire.
   - Graceful degradation: `publish()` failures are logged + dropped (no crash). WS auth guards still fire without Redis. Frontend REST-poll fallback continues to work — realtime is best-effort, not a hard dependency.
   - **Testing**: `testing_agent_v3_fork` iteration_48.json — 14/14 parametrised contract (`test_pubsub_contract.py`, 7 assertions × 2 backends), 12/12 realtime WS suite (`test_realtime_ws.py`, now backed by Redis), new cross-process test (`test_redis_cross_process.py`) proving fan-out survives across processes = multi-worker safe, graceful-degradation walk (Redis stopped → REST + auth-guards still 200/401/404/4xxx), and env-toggle test confirming clean InProc fallback when `REDIS_URL` is unset.
   - **Non-goal**: supervisor still runs `uvicorn --workers 1` — this task only makes the layer multi-worker-safe. Flipping to N workers is a one-line supervisor change whenever ops is ready.

   - **Step 5 (Estimate)** shows a branded vehicle thumbnail beside "Change" and a live vehicle chip overlay on the map.
- ✅ **SENDbakēd Slice 9 (2026-02) — Multi-worker uvicorn (`--workers 4`)**
   - Supervisor override at `/etc/supervisor/conf.d/supervisord_backend_multiworker.conf` re-declares `[program:backend]` with `--workers 4 --no-access-log` (no `--reload` — incompatible with worker mode). Loads after the read-only base config so it wins; disabling it via `.conf.off` is a 5-second rollback.
   - New helper `/app/scripts/backend_worker_mode.sh {multi|dev|status}` toggles between the two modes without editing supervisor files directly.
   - **Throttle fix (pre-flip)**: `_last_write_at` was per-worker → risked N× DB-write amplification. New `_should_persist_async` uses Redis `SET NX EX 10` for a cluster-wide reservation; falls back to the per-worker dict if Redis is unavailable. Matches Slice 8's graceful-degradation pattern.
   - **Testing**: 26/26 (WS regression + pubsub contract) + 1/1 new `test_multiworker_fanout.py` (five concurrent driver→customer WS pairs, all frames delivered — statistically forces cross-worker delivery). LB'd ingress smoke tests 200 across `/health`, `/admin/drivers`, `/admin/drivers/withdrawals`, `/driver/auth/request-otp`.
   - **Rollback**: `sudo bash /app/scripts/backend_worker_mode.sh dev` reverts to `--workers 1 --reload` and restores hot code reload in ~5s.
- ✅ **UI polish (2026-02)** — visual edit patches
   - `BakedLogo` `lg` size bumped 64 → 85 px.
   - `Footer` link builder now handles absolute URLs (`https://…`) as `<a target="_blank">`, and `Delivery Partner` now points to the SENDbakēd driver PWA URL.

- ✅ **Social.docx Phase 4 (2026-02) — Issues #10 + #11**
   - **#10 India vehicle catalogue seeded** — new migration `0025_send_india_vehicles.py` inserts 3 SENDbaked vehicles (`bike`, `three_wheeler` "Mini 3 Wheeler", `truck`) for `country='IN'` mirroring the CI seed shape. Prices in INR (₹79 / ₹199 / ₹1,499). Deterministic IDs (`exv_in_<code>`) + `ON CONFLICT DO NOTHING` — idempotent. Verified via `GET /api/express/vehicles?country=IN` → 3 rows.
   - **#11 SENDbaked branding sweep** — user-facing "EXPRESS" → "SEND" everywhere:
     - `lib/modules.js` — `express` entry now `label: "SEND", suffix: "baked"` (internal `code: 'express'` preserved for schema/API stability).
     - `pages/express/ExpressHome.jsx` — both `<BrandedModuleLabel label="EXPRESS">` sites now pass `"SEND"`.
     - `components/layout/BakedLogo.jsx` — express fallback `altBrand` reads `SENDbaked` (no macron).
     - `lib/expressAssets.js` — wordmark URL swapped from `EXPRESSbaked.png` to `SENDbaked.jpeg`.
   - Non-goals honoured: no schema rename (`express_vehicles` stays), no API-path rename (`/api/express/*` stays), no touching the `express` code identifier anywhere in backend or frontend routing.

   - **Kept intact**: header, wizard progress stepper, Continue footer, all backend calls, dispatch + WebSocket tracking flow.
   - **Verified**: Step 1, 3, 5 desktop screenshots at 1440×900 show the persistent map + branded assets; light theme continues to adapt via `hsl(var(--border/card/muted))`.
- ✅ **Social.docx Issue #1 (2026-02) — Darkstore custom-product approval chain (backend)**
   - **Root cause diagnosed**: Darkstore-side `POST /partner/products/custom` created `PartnerProduct` rows with `approval_status='pending', is_active=False, source='custom'`. No admin endpoint ever promoted these into the shared `mart_products` table, so even after ops "approved" (by flipping DB rows) the row stayed invisible on every Darkstore's `/partner/master-catalog?q=`.
   - **Fix — three new admin endpoints on `mart_partner.admin_router`**:
     - `GET /api/admin/mart-partner/partner-products?status=pending|approved|rejected|all&country=&q=&limit=` — review queue with buckets + enriched partner/warehouse info.
     - `POST /api/admin/mart-partner/partner-products/{id}/approve` — creates a new `MartProduct` (country=partner.country, module=partner.module, name/brand/unit/category/currency copied or overridden via payload), then rewires the `PartnerProduct` to `source='master'`, `master_product_id=<new>`, `approval_status='approved'`, `is_active=True`. Also duplicate-safe: if a MartProduct with the same `(name, country, module)` already exists it links to it instead. In-app notification to the partner.
     - `POST /api/admin/mart-partner/partner-products/{id}/reject` — with required notes, sends the notification back to the partner.
   - Idempotency: re-approving returns 400 `not_custom` because after promotion the source flips to `master` (correct — approval is one-shot).
   - **Verified end-to-end**: seeded a `pending` custom row, called approve → response shows `master_product_id`, DB shows a fresh `mart_products` row in `CI`/`mart`/`active`, buckets update, re-approve blocked.
   - **Non-goals honoured**: no schema change, no rename of internal identifiers, no bypass of the approval gate, no data duplication (single MartProduct per `(name, country, module)`).
   - **Follow-up (next task)**: build the admin UI page `/admin/mart-partner-approvals` (list + approve/reject + optional payload overrides) — mirror pattern of `AdminSupplierProductRequests.jsx`.

- **P1**: Real SMS OTP (Twilio Verify or Africa's Talking) — swap `OTP_PROVIDER` env
- ✅ **Social.docx Issue #1 admin UI (2026-02) — `/admin/mart-partner-approvals`**
   - New page `/app/frontend/src/pages/admin/AdminMartPartnerApprovals.jsx` — mirrors `AdminSupplierProductRequests.jsx` pattern. Pending / Approved / Rejected / All tabs with bucket counts, country filter (CI · IN), name/brand search, one-row-per-request table.
   - Review drawer shows the read-only proposed values (brand, unit, category, partner price, stock, description) + a modeless action bar with **Approve & promote** (green) and **Reject** (red).
   - Approve mode reveals overridable fields (name, brand, category slug, subcategory, master price, currency, unit, image URL) pre-filled from the partner's proposal. Currency required.
   - Reject mode requires ≥3-char notes that surface to the partner via in-app inbox.
   - Route registered at `/admin/mart-partner-approvals`; sidebar entry added under Platform Governance with the `ClipboardCheck` icon → **Darkstore Approvals**.
   - Tested end-to-end: seeded 2 pending rows → API returns them in the listing → route + sidebar link + lint all clean.
   - All `data-testid` attributes namespaced `mpa-*` for future testing agent runs.

- **P2**: FOOD / SHOP / EXPRESS / AUTO / IMMO business modules
- **P2**: Partner Portal, Driver Portal
- **P2**: Notifications engine, Analytics, Search (OpenSearch), Media (MinIO)
- **P2**: RabbitMQ swap for the event bus (interface preserved)

- ✅ **EXPRESSbakēd — Sub-feature D: Super Admin Management Overview (2026-07-29, PostgreSQL baseline)** — first admin feature shipped on the new SQLAlchemy stack.
   - **Backend** (`/app/backend/shared/admin/routes.py`):
     - Extended `GET /api/admin/modules/express/stats` — 6 live KPIs: `active_bookings`, `completed_today`, `searching_now`, `cancelled_today`, `drivers_available` (string `n/n`), `avg_trip_min`. Revenue rollup per currency for delivered+paid bookings.
     - New `GET /api/admin/modules/express/bookings` — paginated live table with `status` (any/active/searching/driver_assigned/arriving/picked_up/in_transit/delivered/cancelled), `country` (CI/LR), and `q` (fuzzy on ref/receiver_name/receiver_phone) filters. Sorted by `updated_at DESC`.
     - Full driver snapshot + pickup/drop denormalised into the response so the admin table needs zero joins client-side.
   - **Frontend** (`/app/frontend/src/pages/admin/ModulePages.jsx`):
     - `ModuleOverview` — 6 coloured KPI tiles (icon + label + value) using `EXPRESS_KPI_META` (yellow/orange/green/red/blue/purple). 20s live-refresh. "Recent bookings" preview card with `View all →` navigation.
     - New `ModuleBookings` — filter chip row (All/Active/Searching/Assigned/Arriving/Picked up/In transit/Delivered/Cancelled), country selector, search input, refresh button, dense table with `StatusPill` + route + receiver + vehicle + driver + total + relative time + "View" deep-link to `/express/booking/{id}/track`. 15s live-refresh so the simulator's status transitions appear in-place.
     - `data-testid` per spec: `overview-express`, `kpi-<key>` × 6, `overview-view-all-bookings`, `module-tab-bookings`, `bookings-filter-<code>` (with `bookings-filter-all` alias), `bookings-country`, `bookings-search`, `bookings-refresh`, `bookings-row-<id>`, `bookings-open-<id>`.
   - **Workspace routing** (`ModuleWorkspace.jsx`, `App.js`): new sub-nav item `{seg:'bookings', expressOnly:true}` + `<Route path='bookings' element={<ModuleBookings />} />`.
   - **Verified live**: created a customer booking; overview flipped `active_bookings:0→1`, `drivers_available:30/30→29/30`; recent-bookings preview showed the new booking; Bookings tab showed the row and refreshed automatically as the simulator advanced status from Arriving → Picked up.
   - **Testing**: `testing_agent` iteration_11.json — **14/14 backend + 100% frontend pass, zero bugs**. Full backend regression file at `/app/backend/tests/test_admin_express_overview.py` (runs in ~7s).

- ✅ **EXPRESSbakēd — Movers wizard 45/55 map + `pickup.line1` bug fix (2026-07-29)** — from `Fixing_Prompt.docx`.
   - **PART A** — `MoversWizard.jsx`: all 6 steps now wrap their body in `<ExpressWizardShell draft={draft}>` so the desktop layout matches Parcel (45% form · 55% persistent Google Map with A/B markers + Directions polyline + distance/duration/vehicle chip overlays). Mobile keeps the compact map card on top.
   - **PART A** — `ExpressWizardShell.jsx`: `WizardMap` and `ExpressWizardShell` now accept an optional `draft` prop. When omitted the shell keeps using `useExpressBooking()` (Parcel context, unchanged). When provided (Movers) it drives the map from the passed draft — one shell, two flows.
   - **PART B** — `AddressSelector.jsx`: `onConfirm`, `onPickSaved`, `onPickRecent` all now mirror `formatted_address` (or `description`) to `line1` when Google Places omits a discrete street line. Root-caused the "pickup not selected" error to a 422 from Pydantic `AddressPoint.line1: str` — the interceptor was rendering that as a toast, but the user saw it after login because the mid-wizard `openLogin('/express/book/estimate')` → OTP → hard reload re-hydrated a draft whose pickup carried no `line1`.
   - **UX polish** (from code-review comment #2): `MoversWizard` now persists `step` in the URL querystring (`?step=4`) via `window.history.replaceState`, so a mid-wizard login round-trip lands the user back on the exact step they were on (previously they got sent back to Step 1 Type).
   - **State persistence** — verified working unchanged: `ExpressContext.jsx` writes both drafts to `sessionStorage` (`baked_express_draft` + `baked_express_movers_draft`) on every `setDraft`; `BakedContexts.jsx.loginWithToken` uses `window.location.href = target` so sessionStorage survives the reload.
   - **Testing**: `iteration_12.json` — 100% pass. `data-testid=exp-wizard-map` present on every Movers step (desktop). Mobile viewport 390x844 renders only the compact map (persistent panel is `hidden md:block`). Directions API is now enabled — the yellow polyline draws correctly.


- ✅ **Footer navigation redesign (2026-07-30, Fixing_Prompt.docx)** — content/nav update only, premium black theme preserved.
   - **Removed** from `/app/frontend/src/components/layout/Footer.jsx`: platform description paragraph, "Platform" column, "Available in" column, and "Platform" wording from the copyright line.
   - **Added** "Useful Links" spanning 2 sub-columns: Partners & Sellers (SHOPbakēd Seller, FOODbakēd/MARTbakēd/AUTObakēd Partner & Seller) + Business & Resources (IMMObakēd Partner/Agent/Broker, Blog, News, Careers, Help Center).
   - **Added** "Opportunities" column (replaces Available in): Investor Relations, Franchise Opportunities, Delivery Partner, Driver Registration, Merchant Registration.
   - **Kept** "Support" column (Help Center, Contact us, Terms, Privacy) per user instruction.
   - **Grid updated** to `md:grid-cols-5` (brand · Useful Links spans 2 · Opportunities · Support). Typography, hover animations, spacing, black background — all unchanged.
   - **New landing** `/app/frontend/src/pages/ComingSoonLanding.jsx` — one reusable placeholder that infers title + description from the URL slug via a `SLUG_LABELS` table. Wired into 21 routes (`/shop/seller`, `/food/partner`, `/mart/*`, `/auto/*`, `/immo/*`, `/blog`, `/news`, `/careers`, `/help`, `/contact`, `/terms`, `/privacy`, `/investors`, `/franchise`, `/delivery-partner`, `/driver-registration`, `/merchant-registration`) in **both** the desktop and mobile customer shells (`/app/frontend/src/App.js`) so header + footer wrap them.
   - **Test-ids**: every footer link has `footer-link-<slug-kebab>` and each landing page has `coming-soon-<slug-kebab>` for automation.
   - **SEO ready**: each link is a real `<Link>` to a real route (not an anchor) — dedicated landing pages can be authored later without touching the footer again.

- ✅ **PostgreSQL Migration Validation & Self-Heal (2026-07-30, Fixing_Prompt.docx)** — resolved the "empty modules + Unable to check delivery zone" outage.
   - **Root cause**: Postgres process died on container restart; `/api/health` returned `ok` unconditionally so the outage was silent (ingress probes passed, UI rendered but every DB query was 5xxing).
   - **Fix 1 — DB-aware healthcheck** (`/app/backend/server.py`): `/api/health` now runs `SELECT 1` via `engine.connect()` → 503 `{status:'degraded', db:'down'}` on failure, 200 `{status:'ok', db:'up'}` on success.
   - **Fix 2 — Self-healing Postgres** (`/etc/supervisor/conf.d/postgres.conf` + `/app/.emergent/postgres_launcher.sh`): supervisor owns PG15. Launcher idempotently creates `baked` role + DB + runs `alembic upgrade head` then `exec`s the postgres binary. Data-dir preserved.
   - **Verified seed magnitudes**: countries=2, express_vehicles=10, mart_categories=18, mart_stores=5, module_drivers=30. All previously-empty endpoints now return real data.
   - **Testing**: `iteration_13.json` — 12/12 backend pytest + 100% frontend pass. Contract-lock file `/app/backend/tests/test_pg_migration_seed.py`.

- ✅ **PostgreSQL Self-Heal v2 — Bulletproof Edition (2026-07-30)** — root-cause fix for the recurring "role baked does not exist" outage.
   - **Why v1 broke**: v1 called `/etc/init.d/postgresql start` AND `exec sudo -u postgres postgres` — two instances collided for port 5432, so bootstrap ran against the losing instance. All errors were swallowed by `>/dev/null 2>&1 || true`, hiding an `alembic: command not found` (supervisor's stripped PATH didn't include `/root/.venv/bin`).
   - **v2 launcher** (`/app/.emergent/postgres_launcher.sh`):
     - Runs bootstrap **in background**, `exec`s **exactly one** foreground postgres → no port race.
     - `ALTER ROLE ... WITH PASSWORD` on every boot → auto-recovers "role exists but wrong password" drift.
     - Absolute path `/root/.venv/bin/alembic` → migrations actually run.
     - Verifies app credentials with `PGPASSWORD=… psql SELECT 1` → any breakage is loud in supervisor stdout.
     - Second `pg_isready` gate before alembic → clean boot log, no benign tracebacks.
     - All errors NOT swallowed — every step logs with UTC timestamp.
   - **Contract**: after ANY `supervisorctl restart postgres` the platform recovers to `/api/health = {status:ok, db:up}` in ≤10 seconds. Data persists on `/var/lib/postgresql/15/main`; role/DB re-created idempotently if the pod ever loses them.
   - **Testing**: `iteration_14.json` — **9/9 durability tests PASS** across three destructive scenarios (restart, stop→start, password-drift). Regression file `/app/backend/tests/test_postgres_durability.py`.
- ✅ **v2.0 Phase 1a — Monorepo Frontend Refactor (2026-02, safe route)** — App.js is now a thin dispatcher.
   - `/app/frontend/src/apps/customer/CustomerApp.jsx` owns the desktop + mobile customer shells, provider stack (Auth, App, Cart, ExpressBooking, MoversBooking), and all `/*` routes.
   - `/app/frontend/src/apps/admin/AdminApp.jsx` owns `/admin/*` routes (login + layout + module workspace).
   - `/app/frontend/src/apps/partner-landing/PartnerLandingApp.jsx` owns `/partner/*` — the premium landing portal below.
   - `/app/frontend/src/App.js` reduced to ~28 lines: three top-level `<Route>` entries dispatching to the three apps. Zero behaviour change, verified with screenshots on all three routes.
   - `/app/frontend/src/packages/ui/index.js` expanded with more shadcn re-exports so future partner apps import from `@/packages/ui`.
   - Files still physically live under legacy `pages/` and `components/`; Phase 1b (yarn workspaces + physical relocation) intentionally deferred — not blocking Phase 2.

- ✅ **BAKĒD Partner Landing Portal v1.0 Premium 2026 (2026-02, Fixing_Prompt.docx)** — the premium partner acquisition site at `/partner`.
   - **Sections implemented**: Hero (full viewport, night skyline gradient + orbiting six-module illustration), Trust Bar (6 icons), Opportunities (2x3 large cards with hover lift + glow, each Apply Now deep-links to future `mart.partner.baked.ci` etc.), Why Partner With BAKĒD (6 stat cards), Growth (50/50 with bespoke growth chart illustration), Testimonial carousel (3 partner quotes, prev/next arrows), How It Works (5-step horizontal timeline with numbered nodes), Final CTA (night skyline BG), Partner Footer (4 cols).
   - **Theme system** (`/app/frontend/src/apps/partner-landing/partner-landing.css`): CSS-variable palette scoped to `.partner-landing[data-theme]`, dark default, OS preference detection on first visit, `localStorage.baked_partner_theme` persistence, instant swap via header toggle. Palette matches docx: dark #090909 / #121212 / #1D9BF0 with `rgba(255,255,255,0.08)` border; light #FFFFFF / #F8F9FB / #1D9BF0.
   - **Reusable pieces** (per docx architecture rule): `Navbar` (sticky, transparent → blurred solid on scroll), `ThemeToggle`, `CountrySelector` (CI/LR ready for future countries), `Reveal` (IntersectionObserver scroll reveal), `OpportunityCard`, `HeroEcosystemIllustration`, `GrowthIllustration`, `TestimonialCarousel`, `TimelineSection`.
   - **Non-goals honoured**: onboarding wizards NOT built (Apply Now CTAs are outbound links only per docx).
   - **Test-ids**: every interactive element has a `partner-*` `data-testid` (`partner-hero-cta-primary`, `partner-opportunity-mart`, `partner-testimonial-next`, `partner-theme-toggle`, `partner-country-selector`, etc.).
   - **Footer wiring**: site-wide footer's "Opportunities" column reduced to a single "Partner with baked" entry linking to `/partner` (per docx + user instruction).


- ✅ **BAKĒD Partner Hub — /partner (2026-02, Fixing_Prompt.docx)** — the dedicated multi-partner acquisition portal, distinct from the seller landing at /Sell-on-baked.
   - **New app** `/app/frontend/src/apps/partner-hub/PartnerHubApp.jsx` + `partner-hub.css`; wired into `App.js` at `/partner/*`.
   - **Sections**: Hero (Abidjan skyline photo + enterprise grid overlay), Opportunities (2×2 image-forward cards with premium photography — Dark Store, Rent Property, Sell on BAKĒD, Delivery Partner), Why Partner (8 feature cards), Success Stories (4-story testimonial carousel with next/prev), How It Works (5-step timeline with animated gradient line), Final CTA (glassmorphism card on skyline BG), Hub Footer.
   - **Card destinations** (per docx): MARTbakēd Dark Store → `mart.partner.baked.ci`, Rent Property → mailto (properties@baked.ci), Sell on BAKĒD → internal `/Sell-on-baked` (reuses existing landing), Delivery Partner → `driver.baked.ci`.
   - **Design distinction from /Sell-on-baked**: amber (#FCC44C) + blue (#1D9BF0) accent blend, real photography instead of illustration, image-top card layout (Blinkit-inspired), enterprise grid mask on hero, glassmorphism on Final CTA. Dark mode default + light mode support with `localStorage.baked_partner_hub_theme` (separate key from the seller landing).
   - **Test-ids**: `hub-nav-*`, `hub-hero-*`, `hub-opportunity-<id>`, `hub-story-prev/next`, `hub-final-*`, `hub-theme-toggle` for automation.
   - **Footer Opportunities column** updated per docx to 5 items: Partner with BAKĒD → /partner, Sell on BAKĒD → /Sell-on-baked, Franchise Opportunities → /franchise, Delivery Partner → /delivery-partner, Merchant Registration → /merchant-registration.


- ✅ **Wave 2 White-Label — Self-Hosted Google Sign-In (2026-02, Fixing_Prompt.docx)** — replaces Emergent-managed Google Auth end-to-end.
   - **Removed**: `EMERGENT_SESSION_URL` constant, `/api/auth/google/session` endpoint (which POSTed to `demobackend.emergentagent.com`), `AuthCallback.jsx` page, `#session_id=` fragment handling in `CustomerApp.jsx`, `startGoogle()` redirect to `auth.emergentagent.com`. Zero Emergent domains remain in the auth flow.
   - **Backend** (`/app/backend/shared/auth/routes.py`): new `POST /api/auth/google/verify` accepts `{ code }`, exchanges it with Google's `oauth2.googleapis.com/token` using `redirect_uri=postmessage`, verifies the returned `id_token` via `google.oauth2.id_token.verify_oauth2_token`, then uses the pre-existing `_find_or_create_customer_by_google` helper to link/create the customer and issue an app JWT. Never talks to any Emergent domain.
   - **Frontend**: added `@react-oauth/google` dependency + `<GoogleOAuthProvider>` at the App root; `PhoneLoginDialog.jsx` "Continue with Google" now calls `useGoogleLogin({ flow: "auth-code", ux_mode: "popup" })` — user sees Google popup, signs in, popup closes, dialog closes. No page redirect.
   - **Env**: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `backend/.env`; `REACT_APP_GOOGLE_CLIENT_ID` in `frontend/.env`.
   - **Verified**: clicking "Continue with Google" opens `accounts.google.com` popup with the correct client_id, `scope=openid profile email`, `response_type=code`. Backend `/api/auth/google/verify` correctly rejects malformed codes. Google Cloud Console origins/redirect URIs must include `baked-platform.preview.emergentagent.com`, `baked.ci`, `www.baked.ci` (owner responsibility documented in test_credentials.md).


- ✅ **P0 Regression Fix — Post-PG Migration DB Empty (2026-02-02)** — every configuration table was 0-rows because backend startup race with Postgres silently failed the seed.
   - **Root cause**: `postgres_launcher.sh` takes ~1–5s after boot before accepting connections. Backend `startup` hook called `run_seed()` immediately, got `Errno 111 Connect call failed`, logged `baked.seed_failed`, and continued anyway. Every restart left the DB empty.
   - **Fix**: `/app/backend/server.py` `_on_startup` now retries `SELECT 1` up to 30× (1s each) before running seed; if PG never comes up we skip seed and log a critical error instead of silently continuing.
   - **Impact restored**: MART (categories, products, search, offers), EXPRESS (vehicles, package types, weight tiers, pricing rules, movers), countries, cities, admin users — all populated. Google Sign-In was already correct code-wise; the "intermittent" failure users saw was because `_find_or_create_customer_by_google` had to touch empty tables.
   - **Verification**: full audit report at `/app/memory/AUDIT_2026-02-02_PG_REGRESSION.md` with row counts, API smoke tests, and screenshot evidence for every module named in the docx acceptance criteria.
   - **Zero MongoDB residuals**: `grep -rn "motor|pymongo|bson|ObjectId" /app/backend/` returns zero hits; requirements.txt + .env clean.


- ✅ **MARTbakēd Partner — Slice 1: Public Application (2026-02-04, per 5-doc Fixing_Prompt bundle)** — Stage 1 of the mandated 3-stage flow (Public Application → Super Admin Review → Partner Portal).
   - **New table** `partner_applications` (`/app/backend/core/models/partners.py`) with all fields the docx enumerated: business + owner + KYC + warehouse + property + bank/mobile-money + JSONB `kyc_documents` + `extra` catch-all + full lifecycle (`draft`, `submitted`, `under_review`, `additional_info_required`, `approved`, `rejected`). Multi-tenancy naming = `partner_id` per decision g1.
   - **New router** `/app/backend/modules/mart_partner/routes.py`:
     - `POST /api/mart-partner/applications` — public submit; generates `MART-CI-2026-NNNN` reference; email+reference pair required for later status lookup.
     - `GET  /api/mart-partner/applications/status?reference=...&email=...` — public status check; both fields required so a leaked reference alone can't dox another applicant.
   - **Startup change** `/app/backend/server.py`: added `Base.metadata.create_all()` before seed so new models materialise without a separate migration step (Alembic replaces this at production cutover).
   - **New frontend app** `/app/frontend/src/apps/partner-hub/PartnerApplyApp.jsx` — 5-step wizard (Business · Owner · Warehouse · Bank · Review), progress rail with amber highlight for the current step, form validation before Continue, confirmation screen showing the generated reference. Routes: `/partner/apply` inside the existing PartnerHubApp; landing "Become a Partner" CTAs now route here.
   - **Design fidelity**: reuses partner-hub CSS tokens (`--ph-accent-warm`, `--ph-card`, `--ph-glass`) so the wizard is visually indistinguishable from the surrounding hub, no dedicated theme required.
   - **Test-ids** on every input, next/back button, submit and confirmation reference so testing agents can drive the flow.
   - **Verified end-to-end via Playwright**: filled 4 steps → submit → backend generated `MART-CI-2026-0002` → confirmation renders with reference, "Application submitted" toast, row persisted to Postgres.
   - **Explicitly deferred**: real file upload for KYC docs (uses URL strings for now — needs object-storage playbook wiring later), email notifications (only console-logged), draft resumption (submit-once-and-review model for MVP).


- ✅ **MARTbakēd Partner — Slice 2: Super Admin Review (2026-02-04)** — Stage 2 of the 3-stage flow is fully wired.
   - **New tables** in `/app/backend/core/models/partners.py`: `partners` (materialised approved partner) and `warehouses` (flat root now; hierarchy tables land in the inventory slice).
   - **Admin router** appended to `/app/backend/modules/mart_partner/routes.py`, wired under `/api/admin/mart-partner/*`, all endpoints gated by `shared.admin.routes.get_current_admin`:
     - `GET  /applications` (paginated, filters: status/country/module)
     - `GET  /applications/{id}` (detail)
     - `POST /applications/{id}/mark-under-review`
     - `POST /applications/{id}/request-info` (body: `{message}`)
     - `POST /applications/{id}/reject`         (body: `{message}`)
     - `POST /applications/{id}/approve`        — materialises `Partner` + primary `Warehouse` + hashes a `secrets.token_urlsafe(9)` temp password, marks application `approved`, returns `{application, partner, warehouse, temp_password}` (temp password shown once).
   - **Admin UI** `/app/frontend/src/pages/admin/ModulePartnerApplications.jsx` mounted at `/admin/modules/mart/applications` (also registered under `/admin/modules/:code/partners/applications` for the PRD path):
     - Queue table with 6 status filters (All / Submitted / Under review / Info requested / Approved / Rejected), search, refresh
     - Slide-in drawer with grouped sections (Business, Contact, Warehouse, Payouts, Timeline), sticky action bar (Mark reviewing / Request info / Reject / Approve)
     - Approve → shows a modal with Partner ID, Warehouse name, Owner email, temp password — each in copy-to-clipboard rows, with a "not shown again" warning
     - Uses `adminApi` (from `AdminContext`) so the admin JWT (`localStorage.baked_admin_token`) is attached automatically
   - **Sub-nav**: "Applications" tab added to the MARTbakēd module workspace (`ModuleWorkspace.jsx MODULE_NAV`) so Super Admin can reach the queue in one click.
   - **Verified end-to-end via Playwright**: logged in as super admin, approved application `MART-CI-2026-0004` → dialog rendered Partner `prt_01ca4a3d…`, warehouse `Ecobasket Plateau — Main`, temp password `X5kZ05D3b0aS`. Also verified request-info flow on `MART-CI-2026-0001` → status flipped to `additional_info_required`, amber callout shown in drawer. DB confirms 2 partners + 2 warehouses created (`Dark Store Marcory` + `MiniMart Cocody E2E`).


- ✅ **MARTbakēd Partner — Slice 3: Portal Login & Onboarding Shell (2026-02-04)** — Stage 3 of the 3-stage flow is fully wired at `/partner-portal/*`.
   - **Auth**: verified pattern with `integration_playbook_expert_v2` before writing code — shared JWT secret, role="partner" claim, bcrypt via `core.security.hash_password`, `must_reset_password` flag gates the dashboard.
   - **Backend endpoints** (`/app/backend/modules/mart_partner/routes.py`, new `partner_router`):
     - `POST /api/partner/auth/login` — email + temp/permanent password → `{access_token, partner, warehouse}`
     - `POST /api/partner/auth/reset-password` — requires current + new; enforces `!=` and length; clears `must_reset_password`
     - `GET  /api/partner/auth/me` — returns partner + primary warehouse
     - `GET  /api/partner/dashboard` — stub metrics + 5-item onboarding checklist (auto-marks reset_password & warehouse when done)
   - **New dep** `get_current_partner`: mirrors admin dep — Bearer token, decodes JWT with shared secret, checks `role==partner`, loads active Partner row.
   - **Frontend app** `/app/frontend/src/apps/partner-portal/PartnerPortalApp.jsx` — self-contained module with `PartnerProvider` (axios + localStorage `baked_partner_token`), Login, forced Reset-Password, sidebar Shell, Dashboard, Business Profile, Warehouse pages. Routes: `/partner-portal/{login|reset-password|profile|warehouse|(dashboard)}`. Registered in `App.js` above the customer catch-all.
   - **Design**: reuses `partner-hub.css` tokens (warm-amber CTAs, dark canvas, glass panels), so the portal is visually consistent with the Partner Hub landing. `data-testid` on every input + nav link + submit for automation.
   - **Verified end-to-end via Playwright**: admin approves `MART-CI-2026-0002` → partner logs in with temp password → forced to `/reset-password` → sets new password → dashboard shows "Hi, E2E" + 4 KPI cards (0/0/0/0) + "Get set up" checklist with 2 auto-marked-done → navigated to Business profile + Warehouse pages → signed out → re-logged in with new password → went straight to dashboard (no reset loop). Test creds captured in `/app/memory/test_credentials.md`.
   - **Deliberately deferred**: forgot-password (temp-issued-once-by-admin is enough for MVP); MFA (later); editable business profile (currently read-only — the approval snapshot is source of truth); real KPIs (0/0/0/0 until inventory + orders slice lands).


- ✅ **MARTbakēd Partner — Slice 4b: Warehouse Hierarchy (2026-02-04)** — 5-level hierarchy live at `/partner-portal/warehouse`.
   - **Backend tables** (`/app/backend/core/models/partners.py`): `warehouse_zones` → `_aisles` → `_racks` → `_shelves` → `_bins`, each with `code`, `label`, `parent_id`, `warehouse_id`, position.
   - **Backend endpoints** `/api/partner/warehouse/nodes` (generic CRUD across all 5 levels) — GET tree, POST create, PATCH rename, DELETE cascade.
   - **Frontend** `/app/frontend/src/apps/partner-portal/WarehouseEditor.jsx` — expandable tree with add/edit/delete per level; because the Emergent visual-edits Babel plugin overflows on recursive JSX, the recursive `HierarchyNode` is written with `React.createElement()` (documented in code).

- ✅ **MARTbakēd Partner — Slice 5 · Products (Hybrid Catalog) (2026-02-04)** — `/partner-portal/products`.
   - **New table** `partner_products` (`core/models/partner_commerce.py`) — `source ∈ {master, custom}`, nullable FK to `mart_products`, plus partner-owned `partner_price`, `stock_qty`, `low_stock_threshold`, `is_active`, `sku_code`. Uniqueness on `(partner_id, master_product_id)` prevents duplicate linking.
   - **Endpoints**: `GET /api/partner/products` · `GET /api/partner/master-catalog?q=&category=` (scoped to partner's country + module, marks already-linked SKUs) · `POST /partner/products/link` · `POST /partner/products/custom` · `PATCH /partner/products/{id}` · `DELETE /partner/products/{id}`.
   - **Frontend** `/app/frontend/src/apps/partner-portal/ProductsPage.jsx` — stats cards (Total / Live / Hidden), inline edit (price + stock), Hide/Delete, Add-product modal with two tabs: search master catalog OR create fully custom SKU.
   - **Guard**: master-linked SKUs cannot rename/rebrand (name/brand/unit/image locked to master).

- ✅ **MARTbakēd Partner — Slice 6 · Orders Fulfilment (2026-02-04)** — `/partner-portal/orders`.
   - **New overlay table** `partner_orders` linking a customer `orders.id` to `partners.id` — leaves customer schema untouched.
   - **Explicit state machine**: `new → {accepted|cancelled}`, `accepted → {packing|cancelled}`, `packing → {ready|cancelled}`, `ready → {handed_off|cancelled}`, `handed_off → {completed}`, terminal at completed/cancelled. Invalid transitions → HTTP 409.
   - **Endpoints**: `GET /api/partner/orders?status=…` (with per-bucket counts) · `GET /api/partner/orders/{id}` · `POST /api/partner/orders/{id}/status`.
   - **Auto-wallet credit on `handed_off`**: gross subtotal is credited, 10% platform commission is debited — both written into `partner_wallet_txns`.
   - **Frontend** — status tabs with counts, drawer with items/address/totals, sticky action bar, cancellation-reason capture. Admin helper `POST /api/admin/mart-partner/partners/{id}/demo-orders?count=N` seeds demo customer orders so the queue is testable end-to-end.

- ✅ **MARTbakēd Partner — Slice 7 · Wallet (2026-02-04)** — `/partner-portal/wallet`.
   - **New tables** `partner_wallets` (single row per partner, materialised balance) + `partner_wallet_txns` (append-only ledger with `kind ∈ {credit_order, debit_commission, debit_payout, credit_topup, credit_adjustment, debit_adjustment}` and `balance_after`).
   - **Endpoints**: `GET /api/partner/wallet` (lazy-creates the wallet) · `POST /partner/wallet/topup` · `POST /partner/wallet/withdraw` — both **MOCKED** with a synthetic `mock_card_xxx` / `mock_payout_xxx` reference; response body includes `MOCKED: true` so the frontend can render an amber notice.
   - **Frontend** — hero balance card with warm-amber gradient, +Add funds / Withdraw actions, money-in / money-out stats, full transaction ledger with signed amounts and running balance.
   - **Deliberately deferred**: real Stripe / Wave / Orange Money integration (needs playbook + user API keys); admin adjustments UI; auto-payout schedule.

- ✅ **Dashboard metrics upgraded (2026-02-04)** — `/api/partner/dashboard` now returns real values: `orders_today`, `revenue_today`, `products_live`, `inventory_items`, `wallet_balance`. Checklist auto-marks `first_product` and `first_order` done as soon as data exists.

## MARTbakēd Partner MVP — Status
- ✅ Slice 1 · Public application (2026-02-03)
- ✅ Slice 2 · Super Admin review + approval (2026-02-04)
- ✅ Slice 3 · Portal login + onboarding shell (2026-02-04)
- ✅ Slice 4b · Warehouse hierarchy (2026-02-04)
- ✅ Slice 5 · Products (hybrid catalog) (2026-02-04)
- ✅ Slice 6 · Orders fulfilment (2026-02-04)
- ✅ Slice 7 · Wallet (mocked payments) (2026-02-04)
- ⏳ Slice 8 · Real Stripe / Mobile Money for wallet top-up + payouts
- ⏳ Slice 9 · Customer checkout → partner routing (currently orders are seeded by admin demo endpoint)

## Roadmap (post-MVP)
- P1: Real Stripe / Wave / Orange Money integration for wallet top-up + payout schedule
- P1: Customer-checkout → partner-order routing (auto-pick partner by inventory + service area)
- P1: Reorder button on customer Activities/Orders + Wallet screen
- P1: Individual partner apps for FOOD, SHOP, EXPRESS, AUTO, IMMO
- P1: Driver Platform (`driver.baked.ci`)
- P2: Developer / Docs / Status portals
- P2: Full Referral Rewards engine

- ✅ **MARTbakēd Partner — Slice 8 · Customer→Partner Routing (2026-02-04)** — Inventory Allocation Engine live at every checkout.
   - **New module** `/app/backend/modules/mart_partner/allocation.py` — deterministic greedy allocator with consolidation-first heuristic (prefers a partner already in the plan → nearest distance → largest service radius → deepest stock). Distance is haversine on lat/lng when available, else same-city step function.
   - **Consolidated multi-partner orders**: customer always sees ONE order / ONE invoice / ONE payment / ONE delivery; internally we create 1..N `partner_orders` rows (uniqueness moved to composite `(order_id, partner_id)`). New fields: `partner_orders.subtotal` + `item_count`; `order_items.partner_id` + `partner_order_id` + `partner_product_id`; `orders.consolidation_status` + `partial_delivery_allowed`.
   - **Stock reservation & restoration**: `partner_products.stock_qty` is decremented under `SELECT ... FOR UPDATE` at checkout; restored automatically when the partner transitions the order to `cancelled`.
   - **Partner-specific pricing on browse + cart**: `GET /api/mart/products` (list + single) and `GET /api/carts/me` now overlay `price = min(partner_price)` across in-country partners, preserving the original as `master_price` for strikethrough display; adds `is_stocked_locally` + `partners_stocking` flags. Cart also returns `unavailable_items[]` so the UI can surface a "Coming soon to your area" banner.
   - **"Coming soon" fail-fast on checkout**: when any cart line has no partner in country, `POST /api/orders` returns `400 { detail: { code: 'not_available_in_area', message, gaps: [{name, quantity, reason, stocked_by_count}] } }`. Frontend cart disables the Checkout button + shows an amber banner; checkout error handler renders a toast with the missing item names.
   - **Wallet ledger — audit-friendly (fixed 2026-02-04)**: on partner handoff, ledger writes `+gross` (`credit_order`) then `-commission` (`debit_commission`) — cleaner ledger than the previous "net-of-commission" single credit, and no more double-deduction bug found by the testing agent.
   - **Order confirmation** — new "Sourced from N stores" panel on `/orders/{id}` (customer app) shows each partner's slice + status. Partner Portal's Orders view now correctly returns only THIS partner's slice of items (filtered by `partner_order_id`) with per-partner `subtotal` + `item_count` and shows the `customer_total` separately.

- **Phase B deferred** (Slice 9 · Consolidation Dispatch):
   - Driver pickup-route optimizer (distance + readiness + traffic)
   - Consolidation-hub concept for city-wide multi-store pickups
   - Admin `partial_delivery_allowed` toggle to bypass the "wait for all partners" gate
   - Real Stripe / Wave / Orange Money for wallet top-up + payouts

## MARTbakēd Partner MVP — Status
- ✅ Slice 1 · Public application (2026-02-03)
- ✅ Slice 2 · Super Admin review + approval (2026-02-04)
- ✅ Slice 3 · Portal login + onboarding shell (2026-02-04)
- ✅ Slice 4b · Warehouse hierarchy (2026-02-04)
- ✅ Slice 5 · Products (hybrid catalog) (2026-02-04)
- ✅ Slice 6 · Orders fulfilment (2026-02-04)
- ✅ Slice 7 · Wallet (mocked payments) (2026-02-04)
- ✅ Slice 8 · Customer→Partner routing + consolidated orders (2026-02-04)
- ⏳ Slice 9 · Consolidation dispatch orchestrator (Phase B)
- ⏳ Slice 10 · Real Stripe / Mobile Money for wallet top-up + payouts

- ✅ **MARTbakēd Partner — Slice B · Staff & RBAC (2026-02-10)** — Owners can now invite teammates with scoped roles.
   - **New tables** (`0003_partner_staff` migration): `partner_staff` (id, partner_id, email, name, role, password_hash, invite_token, invite_expires_at, is_active, must_reset_password, last_login_at) + `partner_staff_audit_log` (append-only).
   - **Roles**: `owner` (implicit, from Partner row), `manager`, `packer`, `cashier`. `manager` = everything except staff-mgmt + wallet withdraw settings; `packer` = view orders + update status + view products + edit `stock_qty` only; `cashier` = view orders + wallet + top-up.
   - **New endpoints** — `POST /api/partner/auth/staff-login`, `GET /api/partner/staff`, `POST /api/partner/staff/invite`, `POST /api/partner/staff/accept-invite`, `PATCH /api/partner/staff/{id}`, `DELETE /api/partner/staff/{id}`.
   - **JWT extension**: staff tokens carry `role="partner_staff"` + `staff_role` + `partner_id` claims. `get_current_partner` accepts both owner + staff tokens; new `PartnerActor` + `require_role(...)` deps enforce per-endpoint role gates.
   - **Endpoints role-gated**: `POST /products/link|custom`, `DELETE /products/{id}`, `POST /orders/{id}/status`, `POST /wallet/topup`, `POST /wallet/withdraw`, all `POST/PATCH/DELETE /warehouse/*/nodes`. `PATCH /products/{id}` allows packers to modify `stock_qty` only.
   - **Frontend** — new **Team** sidebar entry (owner/manager only); sidebar tabs auto-hide by role; staff badge next to email in the sidebar; combined owner+staff login page (frontend tries owner-login, falls back to staff-login on 401); new `/partner-portal/accept-invite` public page for setting password after invite.
   - **SMTP integration** — new `core/mailer.py`. When `SMTP_HOST` set, invite emails send automatically; otherwise the invite URL is returned in the API response so the owner can share it via WhatsApp/SMS.
   - **All actions audited** into `partner_staff_audit_log` for the upcoming Slice D Analytics/Reports view.
   - **Store-scoped staff login (2026-02-11)** — Warehouses got a unique `code` (e.g. `MRT-ABJ-001`); `/api/partner/auth/staff-login` now accepts `store_id` (the store code). Login is a 3-field flow — store code + email + password. Cross-store attempts return 403 `wrong_store`, wrong-store OR bad creds return uniform 401 "Invalid credentials". Idempotent seed adds `picker1@example.com` (packer) and `manager1@example.com` (manager) both under Alpha store.

- ✅ **MARTbakēd Partner — Slice F · Notifications (2026-02-11)** — Partners get real-time alerts on new orders.
   - **New provider** `core/providers/sms_provider.py` (DevSmsProvider + TwilioSmsProvider). Reuses `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + (`TWILIO_MESSAGING_SERVICE_SID` OR `TWILIO_FROM_PHONE`). Set via `SMS_PROVIDER=twilio`.
   - **OTP provider rewired** — `TwilioSmsProvider` (Twilio Messaging API, sends the code we generate) + `TwilioVerifyProvider` (Twilio Verify service). Both are now fully implemented and no longer raise `NotImplementedError`. Missing credentials → graceful `{delivered:false}` fallback, never crashes the app.
   - **Dispatcher** `modules/mart_partner/notifications.py` — fire-and-forget `asyncio.create_task` per partner slice. SMS + email in French. Failures logged only, never propagated to the customer response path.
   - **Hook point** — `POST /api/orders` gathers `(partner_id, partner_order_id)` per slice and dispatches after `session.commit()`. Zero customer-facing latency added.
   - **Existing mailer reused** — Slice B's `core/mailer.py` (Plain SMTP) sends the HTML/text order-alert email. SMTP unconfigured → `mailer.no_op` log, no error.
   - **Verified**: end-to-end curl smoke — order → `sms.dev to=+225… body='[BAKĒD] Nouvelle commande #… — N articles, X XOF'` + `mailer` fires within 100ms. 10 unit tests pass in `tests/test_slice_f_notifications.py`.

- ✅ **Approval Email Notification (2026-02-12)** — When the admin approves a MARTbakēd partner application, an on-brand HTML + plain-text email is now sent to the applicant containing their **Store ID**, **owner email**, **temporary password**, **store name + address**, and a **"Sign in to your MARTbakēd portal"** CTA (URL from `PARTNER_PORTAL_URL` env, fallback `https://baked.ci/partner-portal/login`).
    - **Backend** (`approve_application`): calls `send_email_async` after the DB commit — SMTP failures are logged but never roll back the approval. Response payload now includes `email_sent: boolean` so the frontend can adjust the success dialog copy.
    - **Frontend** (`ModulePartnerApplications.jsx`): success dialog now shows a status pill — green **"✓ Email sent"** when SMTP delivered, yellow **"⚠ Email not sent (SMTP disabled)"** otherwise — and the description text adapts accordingly (either *"We've emailed the owner the credentials + first-login link"* or *"SMTP was not configured, so please copy them below and share manually"*). Confirmation dialog copy updated to mention the email step.
    - **Config**: added `PARTNER_PORTAL_URL` placeholder to `.env.example`. Email template is French-friendly Latin-1 with `MARTbakēd` branding + `#DC7F1E` primary CTA.
    - **Verified**: curl approve returns `email_sent: false` in dev (SMTP unconfigured — expected); backend log shows `mailer.no_op to=<applicant> subject='Your MARTbakēd store is approved — Store ID MRT-COC-002'`. Playwright E2E confirms the yellow badge, updated description text and copy buttons all render.

- ✅ **MARTbakēd Application Approval — Bug Fix & Confirmation UX (2026-02-12)** — End-to-end approval workflow production-ready per Fixing_Prompt §1-§16:
    - **Root cause**: backend approve endpoint was already writing the correct partner + warehouse rows, but returned an error object `{code, message}` on 409 duplicates and the frontend's `runSimple` handler `toast.error(detail || "Something went wrong")` fell through to the generic string because React can't render an object as toast content. Additionally, no confirmation dialog, no Store ID surfaced, missing audit log.
    - **Frontend (`ModulePartnerApplications.jsx`)** — added `humanError()` helper that safely extracts strings from Pydantic 422 arrays / structured `{code, message}` objects / HTTP status codes and returns actionable copy (`"Your account does not have permission..."`, `"This application has already been actioned. Please refresh."`, etc.). Added a **confirmation dialog** (Fixing_Prompt §9) showing Business / Applicant / Location / Application ID before commit. **Success dialog** now surfaces Store ID + Store status + Partner ID + Owner email + Temp password with per-field copy buttons. Success toast now reads *"Application approved. Store ID: MRT-COC-002"*.
    - **Backend (`modules/mart_partner/routes.py` — approve endpoint)** — 409 responses are now structured `{code: "already_approved" | "invalid_state_transition", message, ...}`. Response payload extended: `warehouse.code`, `warehouse.status`, `warehouse.city/country/lat/lng` — everything the UI needs to display the Store ID. Approval now writes an entry to `audit_logs` with `action="mart.application.approve"` + metadata `{application_id, partner_id, warehouse_id, store_code, previous_status, new_status}` (Fixing_Prompt §12). Audit is best-effort AFTER the main commit so a failing audit never rolls back the approval.
    - **Verified**: 6/6 acceptance tests via curl — (T1) under_review→approved 200 with Store ID `MRT-COC-002` + status `setup_required` + 12-char temp password; (T2) duplicate approve → 409 with structured `already_approved` code; (T3) unauth 401; (T6) exactly 1 partner + 1 warehouse after any number of clicks; (T7) unique sequential Store IDs `MRT-COC-002/003/004`; (T10) 3 audit rows recorded. Playwright E2E confirms confirmation dialog opens with correct fields and success dialog shows Store ID / Store status / Partner ID / Temp password with copy buttons.

- ✅ **Admin Application Review Map Preview (2026-02-12)** — Operators can visually confirm the applicant's dark-store pin BEFORE hitting Approve (Fixing_Prompt_2026-02-11_v2 §17-§18):
    - **New component** `components/admin/LocationMapPreview.jsx` — read-only Google Map with a `Proposed Dark Store` marker, metadata card (formatted address, coords, accuracy badge, place_id, country/region/postal), and a `View on Google Maps ↗` external link. Interaction is intentionally disabled (no click-to-move, no drag) — a mistake in the drawer must go back to the applicant via "Request info".
    - **Wired into** `ModulePartnerApplications` review drawer under the existing Warehouse section.
    - **Approval guardrail** — dark-store applications without coordinates render a yellow empty-state ("No coordinates were captured — legacy application"), and the Approve button becomes `Coords needed` + disabled (tooltip explains why). Prevents legacy-app misapprovals until coords are provided.
    - **Verified**: Fresh Cocody submission (`5.3459, -3.9982`, ROOFTOP accuracy, ChIJ_test_cocody) renders on the drawer's map with pin + full metadata + Google-Maps link. E2E Playwright confirmed the drawer, map, coords row, accuracy badge and external link all display correctly.

- ✅ **Map-based Warehouse Geolocation (2026-02-12)** — MARTbakēd Dark Store applications now capture authoritative coordinates via an interactive Google Places picker (Fixing_Prompt_2026-02-11_v2 §1-§17):
    - **Schema (Alembic 0006_map_geolocation)** — new fields on `partner_applications`: `warehouse_country_code`, `warehouse_region`, `warehouse_postal_code`, `warehouse_place_id`, `warehouse_formatted_address`, `warehouse_location_accuracy`. Same-shaped fields on `warehouses`: `formatted_address`, `place_id`, `postal_code`, `location_accuracy`. Added `ix_warehouses_lat_lng` partial index for future bounding-box queries.
    - **Backend validation** (`_validate_warehouse_location`) — enforces coords REQUIRED for `dark_store` submissions (400 `coordinates_required`), valid range (400 `invalid_coordinates`), and country whitelist via new `SUPPORTED_COUNTRIES` env (default `CI`; 400 `unsupported_country`). Backwards-compatible: existing rows without coords stay valid; only NEW submissions are strictly enforced.
    - **Approval flow rewrite** — `/api/admin/mart-partner/applications/{id}/approve` now (a) auto-generates a unique store code via `next_store_code`, (b) copies every map field (formatted_address, place_id, postal_code, location_accuracy, region) onto the newly created warehouse, (c) lands the store in `status='setup_required'` per the lifecycle state-machine. Fixes the pre-existing missing-code bug that would have crashed approvals.
    - **Frontend applicant wizard** — new `WarehouseLocationPicker.jsx` (in `partner-hub/`) renders: (a) Places autocomplete search scoped to CI, (b) "Use my current location" GPS with graceful denial toast, (c) draggable Advanced Marker with "Proposed Dark Store" pill label, (d) click-to-move + drag-to-fine-tune with live reverse-geocoding, (e) country validation with inline error, (f) "Confirm this location" gate. Wired into `PartnerApplyApp` Step 3. Review step shows coordinates. Submit blocks until lat/lng + confirm checkbox are set.
    - **Admin viewer** — `AdminStores` drawer now shows a "View on Google Maps ↗" link that opens the pin externally.
    - **Verified**: 4 backend scenarios via curl (missing coords, out-of-range, unsupported country, valid submission + approval → warehouse inherits everything including auto-code `MRT-COC-001`). E2E Playwright smoke on `/partner/apply` confirms Places autocomplete returns 5 CI suggestions, map pans to picked location, marker drops, location card renders with coords `5.36022, -3.96744` and formatted address.

- ✅ **Super Admin Stores CRUD + lifecycle (2026-02-11)** — Platform-wide dark-store management at `/admin/stores` (Fixing_Prompt §29/§30):
    - **Backend router** `shared/admin/store_routes.py` — `GET /admin/stores` (filter by status/city/country/partner/q + paginated + status counts), `GET /admin/stores/{id}`, `POST /admin/stores` (auto-generates code via `next_store_code`), `PATCH /admin/stores/{id}` (profile edit), `POST /admin/stores/{id}/lifecycle` (server-side state-machine validation, 400 `illegal_transition` on bad hops), `DELETE /admin/stores/{id}` (only pending/rejected/closed AND partner has zero orders — else 400 `delete_forbidden`). All actions audited via `_audit()`.
    - **State machine** (from `_TRANSITIONS`): pending→(under_review|additional_info_required|approved|rejected); approved→(setup_required|setup_in_progress|active|rejected); setup_in_progress→(active|additional_info_required|closed); active→(temporarily_suspended|maintenance|closed); suspended↔active↔maintenance; rejected/closed = terminal. `is_active` mirrors "operational" (active/maintenance/suspended = true; rejected/closed = false).
    - **Metadata endpoints** `/_meta/transitions` (feeds the drawer's action buttons) + `/_meta/partners` (dropdown picklist).
    - **Frontend** new page `AdminStores.jsx` — added to sidebar under Platform Governance → Stores (Warehouse icon). 5-KPI header (Active / Setup / Under review / On hold / Terminated), search + status + country filters, table with status pills, "Onboard a new dark store" modal (full profile form including initial_status selector), and a right-side detail Drawer with legal-transitions-only action grid + optional audit reason textarea + hard-delete for terminal states.
    - **Verified**: 6/6 backend tests in `tests/test_admin_stores.py` (auth guard, list + filter, transitions meta, partner picklist, full lifecycle flow pending→approved→setup→active→maintenance→active→PATCH→closed→delete-forbidden). E2E smoke-tested via Playwright — index page, create modal and detail drawer all render correctly.

- ✅ **Multi-Dark-Store Foundation — Phase 2 UI (2026-02-11)** — Portal now shows store context everywhere and gives owners+managers a self-service Team CRUD:
    - **Persistent Store Context Banner** (`PartnerPortalApp.jsx` → `StoreContextBanner`) — sticky top bar visible on every `/partner-portal/*` screen. Renders store code, name, city, lifecycle status pill (Active/Suspended/Maintenance/…) and "Signed in as {email} · {ROLE}". Reads scoped store from JWT-cached localStorage first, falls back to partner's default warehouse for owner sessions.
    - **`/auth/me` upgraded** — staff sessions now return their **JWT-scoped** warehouse (not the partner's first store); response includes new `employee_code` + `warehouse_id` on the staff dict and `status/time_zone/store_type/region/contact_*` on the warehouse dict.
    - **Enhanced Team page + Employee CRUD** (`TeamPage.jsx`) — owners AND managers can now invite in any of 7 roles (manager, supervisor, warehouse_manager, inventory_manager, packer, cashier, customer_support), view each teammate's auto-generated `EMP-{CITY3}-###` code, change role via inline `RoleEditor`, deactivate/reactivate, and remove. Backend widened `PATCH /partner/staff/{id}` + `DELETE /partner/staff/{id}` to `require_role("owner","manager")` with a peer-manager guardrail (a manager can't modify another manager → 403 `cannot_modify_peer_manager`).
    - **Owner login page CTA** — `/partner-portal/login` now shows a prominent "Staff member? Staff Login →" link. Heading renamed to "Owner sign in".
    - **Extended `NAV_ROLE_ACCESS`** — sidebar visibility rules cover all 8 roles (supervisor+warehouse_manager get full ops nav, inventory_manager gets warehouse+products+orders, customer_support gets orders only).
    - **Verified**: iteration_18 → 7/10 pass (3 legit backend bugs found); iteration_19 → 5/5 retest pass (100%) including manager permissions, deactivate/reactivate cycle, delete, testids for automation, Owner→Staff CTA.

## MARTbakēd Partner MVP — Status
- ✅ Slice B · Staff & RBAC (2026-02-10) + store-scoped login (2026-02-11)
- ✅ Slice F · Notifications (SMS + email on new orders) — Twilio + Plain SMTP (2026-02-11)
- ✅ Multi-Dark-Store Foundation — Phase 1 (backend/schema) + Phase 2 (UI) (2026-02-11)
- ✅ Super Admin Stores CRUD & lifecycle actions (2026-02-11)
- ✅ Map-based Warehouse Geolocation (Places picker + backend validation) (2026-02-12)
- ✅ **MASTER COMPLETION PROGRAM — Phase 1 Audit** (`/app/memory/MODULE_AUDIT.md`, 2026-02-13)
- ✅ **MASTER COMPLETION PROGRAM — Phase 2 Catalog + Inventory** (2026-02-13)
    - Alembic **migration 0007** adds `mart_brands`, extends `mart_products` (sku_code, barcode, variants JSONB, status, brand_id), extends `partner_products` (approval_status, review_notes, submitted_at, reviewed_at, reviewed_by_admin_id), adds `partner_inventory` (available/reserved/damaged/expired/low_stock_threshold), `partner_stock_movements` (immutable ledger, never-negative CHECK constraints), and `partner_product_locations` (SKU ↔ bin).
    - Backend: `shared/admin/mart_catalog_routes.py` — Categories/Subcategories/Brands/Products admin CRUD + Partner-Product approval queue (approve / reject / request-changes with mandatory notes on reject).
    - Backend: `modules/mart_partner/inventory_routes.py` — Partner inventory list (with lazy row materialisation from `partner_products.stock_qty`), adjust endpoint (receive / adjustment_add|remove / damage / expire / return_in with never-negative 409), movements ledger, product ↔ bin location assignments, and stock-by-location warehouse-tree report.
    - Backend: `mart_partner/routes.py::create_custom_product` now sets `approval_status="pending"`, `is_active=false`, `submitted_at=now()` — partner custom SKUs cannot bypass Super Admin approval.
    - Frontend Admin: `AdminMartCatalog.jsx` with 4 tabs (Categories/Subcategories/Brands/Products), full CRUD forms, country pill, search. `AdminProductApprovals.jsx` — bucket tabs (Pending/Approved/Rejected/Changes-requested) with review dialog.
    - Frontend Partner: `InventoryPage.jsx` with summary cards (Total/Available/Reserved/Low/Out-of-stock), Stock & Movements tabs, filters (all/low/out), Adjust modal (kind + qty + reason). Partner Products page shows approval_status badges for pending/rejected/changes_requested SKUs and updated toast to "submitted for review".
    - **Verified**: iteration_20 → 26/26 backend pytest PASSED + all UI flows verified.
- ✅ **Inventory Control Tower — Batches 1 + 2** (2026-02-13)
    - Alembic **migration 0008** extends `partner_stock_movements.kind` allow-list with `put_away/stock_count/correction/pick/pack/dispatch`; adds `partner_receipts / partner_receipt_items` (draft→received→verified→put_away→completed lifecycle with per-line put-away-not-greater-than-received CHECK) and `partner_stock_counts / partner_stock_count_lines` (draft→counting→reconciling→completed with variance capture).
    - Backend Super Admin: `shared/admin/inventory_control_tower.py` — `/admin/inventory/kpis`, `/overview`, `/skus/{ppid}`, `/stores`, `/stores/{whid}`, `/low-stock`, `/out-of-stock`, `/movements` (network-wide aggregate + drilldowns; master-product name resolution for source=master rows).
    - Backend Partner: `modules/mart_partner/inventory_ops_routes.py` — `/partner/inventory/receipts` (list/create/get/verify/put-away/cancel), `/partner/inventory/counts` (list/create-full/record/apply/cancel), `/partner/inventory/dashboard-kpis` (pending receiving/put-away/counts). Put-away writes ledger movements, increments PartnerInventory.available_qty, updates PartnerProduct.stock_qty. Stock-count apply clamps at zero (never-negative) and writes `stock_count` movements. All transitions guarded by 409 for invalid state.
    - Frontend Super Admin: `AdminInventoryControlTower.jsx` — new top-level nav "Inventory Control Tower". Tabs: Overview / Stores / Low stock / Out of stock / Movements. Live KPI header (Total SKUs, Active, Available, Reserved, Low, OOS, Inventory value CFA). SKU Detail dialog shows Network totals + per-store distribution. Store Detail dialog shows read-only full inventory of one warehouse. Dialogs close on ESC + backdrop click.
    - Frontend Partner: `ReceivingPage.jsx` (list + create modal with expected/received quantities + verify + put-away drawer with optional bin id), `StockCountsPage.jsx` (start full count + line-editor drawer with variance calculation + Apply corrections). New nav items "Receiving" and "Stock counts" visible to owner/manager/supervisor/warehouse_manager/inventory_manager. Dashboard now includes a "Warehouse operations" KPI row showing pending receiving/put-away/counts when non-zero.
    - **Verified**: iteration_21 → 24/24 backend pytest PASSED + all UI flows E2E validated. Never-negative respected; concurrent transitions properly 409'd.
- ✅ **Replenishment Suggestions — Batch 3a** (2026-02-13)
    - Alembic **migration 0009** adds `partner_replenishments` (suggested→approved→dispatched→received/cancelled lifecycle) with a partial unique index (`uq_replen_live_per_sku`) enforcing at most one live suggestion per (partner_product_id, warehouse_id).
    - Backend: `shared/admin/replenishment_routes.py` — GET / (list + status buckets, country-scoped), POST /auto-generate (scans low+OOS, dedup safe via SAVEPOINTs), POST / (manual create), POST /quick-add (one-click enqueue from Low/OOS lists), PATCH /{id}, POST /{id}/approve|dispatch|mark-received|cancel. `mark-received` auto-writes a `receive` stock movement, increments PartnerInventory.available_qty, syncs PartnerProduct.stock_qty, and back-fills `movement_id` on the replenishment row for audit.
    - Frontend: `AdminReplenishmentTab.jsx` — new "Replenishment" tab inside Control Tower with 5 bucket tabs. Inline-editable Suggested qty (auto-save on blur), one-click Approve / Dispatch / Received / Cancel per row. Low-Stock and Out-of-Stock tabs now include a green "+ Restock" button on every row that calls `/quick-add`.
    - **Verified**: iteration_22 → 4/4 backend pytest PASSED (2 skipped because no low-stock demo data), all UI flows E2E validated (bucket tabs, auto-gen, edit, approve → mark-received creates receive movement + increments inventory, illegal transitions 409, duplicate quick-add 409). Zero bugs; the 2 code-review nits (buckets-country filter + auto_generate savepoint) were fixed post-report.
- ✅ **Inventory relocated into MARTbakēd module** (2026-02-13, per Inventory_Prompt v3)
    - Route change: legacy `/admin/inventory` now `<Navigate replace>` to `/admin/modules/mart/inventory`. Backend APIs unchanged (`/api/admin/inventory/*` remain the source of truth — they were always MART-only anyway).
    - Nav change: removed the top-level "Inventory Control Tower" link from `AdminLayout` Platform Governance sidebar. Enabled the `inventory` sub-nav item inside the MARTbakēd module workspace (was `comingSoon`).
    - Component reuse: same `AdminInventoryControlTower.jsx` — no duplicate created. Header eyebrow changed to "MARTbakēd · Groceries & Daily Needs" so context is clear.
    - All acceptance criteria (AC-01 through AC-14) pass — verified via smoke test (sidebar cleaned, redirect works, module route renders KPIs + tabs, "SOON" removed).
- ✅ **Store Transfers — Batch 3b** (2026-02-13)
    - Alembic **migration 0010** adds `partner_transfers` + `partner_transfer_items` with CHECK constraints enforcing `quantity > 0`, `dispatched_qty <= quantity`, `received_qty <= dispatched_qty`, and `from_warehouse_id <> to_warehouse_id`.
    - Backend: `shared/admin/transfers_routes.py` — full lifecycle (`requested → approved → in_transit → received` + `cancelled`). Dispatch pre-checks source stock across every line and refuses with 409 if any short — never negative respected. Cancel-mid-flight returns in-flight units to source with a compensating movement. Auto-linking of destination `partner_products` for master SKUs when the destination has never carried them. Coalesced name resolution via outer-join with `mart_products` (fixes 'Untitled' rows for auto-linked master SKUs, also patched in `store_inventory` for consistency). `_next_code` fixed to use `MAX(code)+1` (concurrency-safe) after code-review nit. Two helper endpoints (`/lookups/warehouses`, `/lookups/source-inventory/{whid}`) power the create modal.
    - Frontend: `AdminTransfersTab.jsx` — new tab in the Control Tower with bucket tabs (Requested / Approved / In transit / Received / Cancelled), inline count badges, "New transfer" modal (source picker → destination picker → product-picker table with per-row qty input + live totals), detail drawer with Approve / Dispatch / Mark received / Cancel actions. Wired between Replenishment and Movements tabs.
    - **Verified**: iteration_23 → 14/14 backend pytest PASSED. Zero functional defects. Frontend renders + create-modal / bucket counts / existing TR-000001 confirmed. 5 code-review nits noted; the 2 highest-value (concurrency-safe code generation) were fixed post-report.
- ✅ **MASTER COMPLETION PROGRAM — Phase 1 (Master Catalogue + P0 Reservation Locking)** (2026-02-13)
    - **Phase 0 Audit**: `/app/memory/MART_SUPPLY_CHAIN_AUDIT.md` — full gap analysis.
    - **Alembic migration 0011** (`0011_catalogue_phase1_full.py`) extends `mart_products` with `mrp`, `cost_price`, `tax_pct`, `tax_hsn_code`, `manufacturer`, `batch_tracking`, `expiry_tracking`, `temperature_class`, `ean_upc`, `pack_size`, `net_qty`, `short_description`, `storage`; extends `partner_inventory` with low-stock threshold columns; adds `mart_category_requests` (partner-submit → SA-approve/reject with review notes); adds `partner_stock_movements.before_qty`.
    - **Category Request Workflow**: partner UI (Products page → "Request new category" modal + list of submitted requests with status badges) + SA approval UI (`AdminCategoryRequests.jsx` with pending/approved/rejected buckets, approve creates `mart_categories` row, reject requires notes) + backend routes (`shared/admin/category_requests.py`).
    - **P0 Reservation Locking**: `modules/mart_partner/allocation.py` uses `SELECT … FOR UPDATE OF partner_products` on the candidate query and a second `SELECT … FOR UPDATE` on the matching `PartnerInventory` row inside the reservation branch, atomically shifting `available_qty → reserved_qty` and writing a `reserve` `PartnerStockMovement` with `before_qty`, `delta_qty=-qty`, `balance_after`. Invariant `available + reserved ≤ sellable` holds under two-shopper races on the last unit.
    - **ORM Sync**: added `before_qty: Mapped[Optional[int]]` to `PartnerStockMovement` (core/models/catalog_inventory.py) so allocation reservation writes stop raising TypeError.
    - **Checkout resilience**: `modules/mart/orders.py` now catches non-`ValueError` allocation failures, logs them, and returns a stable 409 `allocation_failed` instead of leaking a 500.
    - **Verified**: `tests/test_catalog_phase1_and_category_requests.py` — 10/10 backend pytest PASS, including the concurrency invariant test (`test_reservation_race_last_unit_invariant`): exactly 1 winner, 1 `insufficient_stock` loser, `reserve` movement with `before_qty=1` recorded, invariant `available_qty + reserved_qty ≤ 1` upheld.
- ⏳ **Phase 2+ (blocked pending user approval per strict phase boundary)**:
    - Phase 2 — Supplier Module (CRUD suppliers + supplier catalogues)
    - Phase 3 — Purchase Orders
    - Phase 4 — GRN document generation (ReportLab PDF + openpyxl Excel)
    - Phase 5 — Supplier billing / three-way match
    - Phase 6 — Picker / Packer / Dispatch worker UI (Phase 3 core fulfillment loop)
    - Phase 7 — Analytics dashboard (Slice D) & Return / Refund (Slice H)
    - Phase 8 — Real Stripe integration for Wallet & Checkout
- ⏳ Inventory Exceptions module (aggregated pending issues by category)
- ✅ **Phase 2A — Supplier Onboarding Foundation (Backend)** (2026-02-13)
    - **Guiding doc**: `Inventory_Prompt` §Supplier Onboarding Foundation — suppliers are a SEPARATE business entity from dark-store partners (independent DB, RBAC, auth, routes).
    - **Alembic migration 0012** creates 8 tables: `suppliers`, `supplier_applications`, `supplier_contacts`, `supplier_documents`, `supplier_supply_locations`, `supplier_category_interests`, `supplier_bank_info`, `supplier_review_audit`. All FK-integrated with `countries`, `mart_categories`, `admin_users`, `warehouses`.
    - **Backend routes** (`/app/backend/shared/suppliers/routes.py`):
      * Public wizard (`/api/martbaked/sellers/apply/*`): `start` → creates draft supplier + `SupplierApplication` with code `MART-SUP-{YYYY}-{seq:05d}`; `otp/request` + `otp/verify` (reuses shared OTP infra + `OtpChallenge`); `PATCH /step` for steps 2–8 (business info, owner, business location on Google Maps lat/lng, category interests, supply locations, banking, documents); `submit` snapshots the full application and flips lifecycle to `submitted`.
      * Public status: `GET /application-status/{code}` (no auth, safe fields only — status, business name, action-required notes / rejection reason).
      * Supplier auth: `POST /login` (email + password, 403 unless status=approved & portal_active); `POST /activate` (owner-set password using application_code from approval email).
      * Super Admin (`/api/admin/modules/mart/suppliers/*`): applications list with bucket counts (`draft / submitted / under_review / action_required / approved / rejected`); full detail with audit trail; `approve` (assigns `SUP-{CC}-{seq:04d}` supplier code + activation URL); `reject` (notes required — 400); `request-info` (notes required); `suspend` / `unsuspend`. Every action writes a `SupplierReviewAudit` row.
    - **Reuses**: shared OTP provider (dev echoes `dev_code`), shared bcrypt password hashing, shared JWT (`role="supplier"`), existing `MartCategory` (no duplicate category master), existing Google Places / Maps integration for the frontend map picker (frontend not yet built).
    - **Demo seed** (`shared/suppliers/seed.py`) creates 3 clearly-marked DEMO suppliers spanning statuses: Delta (approved + portal active, login-ready with `Supplier1234!`), Echo (submitted, awaiting review), Foxtrot (action_required with notes).
    - **Regression**: `tests/test_supplier_onboarding_phase2a.py` — 7/7 backend pytest PASS. Full E2E: apply/start → OTP → 6 step PATCHes → submit → SA request-info → resubmit → SA approve → activate → supplier login → duplicate-email 409 → suspend → login 403 → unsuspend. Plus DEMO seed sanity + admin guards (reject without notes 400, buckets keys).
    - **STOP CONDITION** honoured per `Inventory_Prompt` §24 — halting for user review before starting Phase 2A frontend wizard + Phase 2B (Supplier CRUD / Catalogue / Documents).
- ✅ **Phase 2A Cycle 2 — Supplier Onboarding Frontend** (2026-02-13)
    - New public app `/app/frontend/src/apps/martbaked-sellers/` (`SellerApp.jsx` + `SellerApplyWizard.jsx`) reusing the partner-landing dark design tokens for BAKĒD brand continuity. Routes: `/martbaked/sellers` (landing) · `/apply` (9-step wizard, resumable via `?app=<id>`) · `/login` (email + password, surfaces backend `not_active` code with CTAs to status/activate) · `/activate` (password creation with validation order length→match, no HTML5 minLength blocker) · `/application-status` (auto-populates from `?code=`, shows status badge + `action_required_notes` / `rejection_reason` / activation CTA).
    - **9-step wizard** covers: Phone (create draft + send OTP with dev-code echo + verify), Business info, Owner/rep, Business location (reuses `WarehouseLocationPicker` = existing Google Places integration), Categories (multi-select existing `mart_categories` + custom category request rows), Coverage areas, Banking, Documents, and final Review with confirmation checkbox → submit. All 8 backend `PATCH /step` payloads wired 1:1 with the contract.
    - **Super Admin review UI** — `/app/frontend/src/pages/admin/AdminSupplierApplications.jsx` mounted at `/admin/modules/mart/suppliers` (also aliased at `/suppliers/applications`) with 6 bucket tabs + counts (`submitted / under_review / action_required / approved / rejected / draft`), searchable list, right-side detail drawer showing Business / Owner / Locations & coverage / Category interests / Documents / Banking / full Audit trail (every audit row rendered with timestamp + from→to + notes). Action panel: Approve, Request Info (notes required), Reject (notes required), Suspend (notes required), Unsuspend. Notes-required client-side toast prevents empty-notes submissions.
    - Sub-nav integration in `ModuleWorkspace.jsx` — new "Suppliers" tab with `Building2` icon appears in the MART module workspace.
    - **Testing** — `test_reports/iteration_25.json` ~95% frontend success; landing, status lookup (invalid/approved/action_required/direct-link), login (correct/wrong/not-active), activation validation, wizard start + OTP, SA drawer with all sections + approve/reject/request-info/suspend actions all verified. 2 LOW-priority UX polish items (activate error state ordering + login `not_active` code surfacing) were **fixed in-cycle** after the testing report.
- ✅ **Phase 2B Cycle 1 — Supplier Portal Backend & Object Storage** (2026-02-13)
    - **Alembic migration 0013** creates `supplier_products` (unique (supplier_id, master_product_id), cost_price + currency + moq + lead_time_days + is_active) and `supplier_product_requests` (proposed_name/category/cost/etc + status lifecycle pending→approved/rejected/withdrawn) — plus `supplier_documents` soft-delete + object-storage columns (`storage_path`, `original_filename`, `size_bytes`, `content_type`, `is_deleted`).
    - **Emergent Object Storage integration** (`core/providers/object_storage.py`) — `init_storage()` runs at FastAPI startup (best-effort, never blocks boot), `put_object` / `get_object` with automatic key recycling on 404. `EMERGENT_LLM_KEY` seeded in `backend/.env`. Files stored under `baked-platform/suppliers/{supplier_id}/{documents|images}/{uuid}.{ext}`.
    - **Supplier Portal routes** (`shared/suppliers/portal_routes.py`, JWT `role=supplier`):
      * `GET /api/supplier/me` · `PATCH /api/supplier/me/profile` — critical fields (business_name / tax_id / registration_number) auto-flip supplier + latest application to `action_required` + audit-log the change (per doc §12).
      * `GET/POST/DELETE /api/supplier/me/documents` — soft-delete; ties to storage_path from upload.
      * `GET/POST/DELETE /api/supplier/me/supply-locations` — non-business locations only; SA still gates dark-store links.
      * `GET/POST/PATCH/DELETE /api/supplier/me/catalogue` + `GET /me/catalogue/master-products` type-ahead — one row per (supplier, master_product) at network cost.
      * `GET/POST /api/supplier/me/product-requests` — supplier proposes SKUs; SA approve creates the master product (auto-links back at proposed cost when `link_at_supplier_cost=true`), reject requires notes (Pydantic 422 on empty).
      * `POST /api/supplier/uploads` — multipart upload (≤20 MB, MIME-allow-list) → object storage → returns `{storage_path, file_url, size_bytes, content_type, original_filename}`. `GET /api/supplier/files/{path}` — auth-gated proxy (supplier owns own paths; admins can fetch any).
    - **Approval re-entrancy fix**: `admin.approve_application` now only resets `supplier_portal_active=false` on FIRST approval (no password_hash yet). Re-approvals after critical-field re-verification preserve existing portal activation so the supplier can log in immediately once SA re-approves.
    - **Demo seed**: 5 catalogue rows for DEMO Delta (Master ↔ Delta at 65% MRP, MOQ ladder).
    - **Regression**: `tests/test_supplier_portal_phase2b.py` — 12/12 backend pytest PASS (portal core + catalogue add/patch/delete + master type-ahead + upload/download/soft-delete-doc + rejects-disallowed-MIME + product-request full flow + reject-requires-notes + supply-locations CRUD + critical-field re-verification + login-blocked-when-action-required). Combined suite (Phase 1 + Phase 2A + Phase 2B) → 29/29 green.
- ✅ **Phase 2B Cycle 2 — Supplier Portal Frontend** (2026-02-13)
    - New app `/app/frontend/src/apps/martbaked-sellers/SellerPortalApp.jsx` mounted at `/martbaked/sellers/portal/*` (top-level route so it renders WITHOUT the public-sellers header/footer). Contains an auth guard (redirects to `/martbaked/sellers/login?redirect=...` when no token), sidebar shell with 6 nav items + supplier chip + Sign out, and a Dashboard home showing 3 stat cards (Catalogue SKUs / Product Requests / Documents) + a Getting-started checklist. When the supplier's status is `action_required`, an orange banner explains re-verification is in progress.
    - **Portal pages** under `/portal/*`:
      * **Profile** — pre-fills from `/supplier/me`, edits any field, and pops a *critical-change warning modal* before saving legal-identity fields (business_name / tax_id / registration_number). Save toasts "Saved — Super Admin will re-verify critical changes." when a critical field flipped the status.
      * **Catalogue** — searchable table with inline edit for supplier_sku / cost / MOQ / lead-time, activate-deactivate toggle, remove-row confirm, and an "Add product" modal with debounced type-ahead against `/supplier/me/catalogue/master-products` scoped to the supplier's country.
      * **Documents** — drag-and-drop uploader that hits `/api/supplier/uploads` (multipart → object storage), followed by a per-file metadata form (type / title / issued_on / expires_on). Table shows verification-status chips + expiry badges (orange <30 days, red expired). Open button fetches the file as an authenticated blob (needed because `<img>`/anchor can't pass Bearer headers).
      * **Supply Locations** — add city / zone / country + radius; list shows "Pending SA approval" chip; delete confirm.
      * **Product Requests** — new-request form with categories dropdown loaded from `/mart/categories?country=CI`, optional product image via `/uploads` `kind=image`. Request cards render status chip + review notes + created_master_product_id when SA approves.
    - **Portal API access**: axios `portalApi` instance auto-attaches `Bearer $supplier_token` from localStorage and redirects to login on 401. Auth guard **only** treats 401 as an auth failure — 403/5xx keep the shell usable so the action-required banner is visible.
    - **Backend UX fix**: `get_current_supplier` now accepts `approved` *and* `action_required` (portal-active) suppliers, so a critical-field re-verification lets the supplier keep browsing (and read the banner) rather than being logged out. Fresh logins for `action_required` are still blocked — matching doc §12 intent.
    - **Testing** — iteration 26 ~90% frontend PASS (auth guard, login→portal, sidebar, dashboard cards, profile view/edit with critical modal + toast, catalogue full CRUD + master picker type-ahead, documents drag-drop upload + pending metadata + save + delete, supply-locations add/list/delete with pending chip, product-requests form + list, logout clears token). Both agent-flagged issues addressed in-cycle (MED: auth guard redirect only on 401 + backend allows action_required to browse; LOW seed-restore artefact acknowledged as test hygiene, not a code bug). Backend regression clean: 12/12 pytest still green.
- ✅ **Phase 2B Cycle 3 — SA Product Request Review UI (Phase 2B COMPLETE)** (2026-02-13)
    - New tab-shell `AdminSuppliersShell.jsx` under `/admin/modules/mart/suppliers` with URL-driven tabs (`?tab=applications | product-requests`). Applications tab reuses the Cycle-2A UI (now accepts an `embedded` prop that hides its own heading). Product Requests tab renders `AdminSupplierProductRequests.jsx`.
    - **`AdminSupplierProductRequests.jsx`**:
      * 3 bucket tabs (Pending / Approved / Rejected) with live counts from the backend `buckets` response.
      * Table shows proposal thumbnail, proposed name + manufacturer + pack size, supplier business_name + code, cost / MOQ / lead-time, submitted date, and status chip.
      * Detail drawer renders full 'Proposed details' snapshot, supplier notes, and product photo link.
      * **Approve panel** — inline form pre-fills name from proposal, requires category dropdown (loaded from `/mart/categories?country=CI`), lets SA override SKU / manufacturer / EAN / pack size / MRP / tax %, includes an "Auto-link at supplier cost" checkbox (default checked). On submit, POSTs `/admin/modules/mart/suppliers/product-requests/{req_id}/approve` which creates the master product in `mart_products` and (when the checkbox is on) inserts a `supplier_products` row at the proposed cost — the supplier's catalogue immediately shows the new SKU.
      * **Reject panel** — required-notes textarea + confirm; client-side toast blocks empty submissions.
      * Non-pending requests hide the action panel and show a status banner with review_notes + created_master_product_id.
    - **Testing** — iteration 27 **100% frontend PASS (8/8 spec bullets)**: tab shell + URL sync, bucket counts, drawer, approve full flow (missing-category toast, category selection, master-product creation, catalogue auto-link verified by re-logging as Delta), reject flow (empty-notes toast + successful rejection), Approved-request banner + review notes + created_master_product_id, Applications tab regression. Only a non-blocking aesthetic note about tab sub-note font size (10px @ 0.7 opacity) — cosmetic, no action taken.
    - **Combined regression** — Phase 1 + Phase 2A + Phase 2B → **29/29 backend pytest still green**.

- ✅ **Phase 3 Cycle 1 — Purchase Orders Backend** (2026-02-13)
    - **Alembic migration 0014** creates `purchase_orders` (header with 7-status lifecycle: draft → submitted → acknowledged → shipped → partially_received → received → cancelled), `purchase_order_lines` (qty_ordered / qty_received / unit_cost / tax_pct / line totals with CHECK invariants including `qty_received <= qty_ordered`), `purchase_order_receipts` + `purchase_order_receipt_lines` (per-event line-level receipt qty with movement_id link), and `purchase_order_audit`.
    - **Backend routes** (`shared/purchase_orders/routes.py`):
      * Partner buyer (`/api/partner/purchase-orders/*`): list with 7-bucket counts + supplier/warehouse enrichment (store-scoped for staff via `store_id` JWT claim, unscoped for owners), get detail with lines+receipts+audit_trail, create-draft (owner/manager), add/update/delete-line (with auto totals recompute), submit (owner/manager, blocks empty POs), cancel (draft or submitted only, notes required), receive (owner/manager/supervisor/packer).
      * Supplier (`/api/supplier/me/purchase-orders/*`): list (drafts hidden), get, acknowledge (submitted→acknowledged), ship (acknowledged→shipped).
      * Super Admin (`/api/admin/modules/mart/purchase-orders/*`): cross-network list with country/status/search filters, detail with audit_trail, override-cancel (any status except cancelled/received, notes required).
    - **Atomic inventory-safe receipt**: acquires `SELECT ... FOR UPDATE` on the target `PurchaseOrderLine` rows and on `PartnerInventory` before mutating. Auto-creates a missing `PartnerProduct` row (source=master, is_active=False so ops must price it before storefront exposure). Increments `available_qty` + `stock_qty`. Writes a `receive` `PartnerStockMovement` with `before_qty`, `delta_qty`, `balance_after`, `reference=receipt_id`, `reason=PO receipt {po_code}`. Header auto-rolls between `partially_received` and `received` based on remaining ordered - received across all lines.
    - **PO code format**: `PO-{CC}-{YYYY}-{seq:05d}` (per-country, per-year).
    - **Testing**: `tests/test_purchase_orders_phase3.py` — **11/11 pytest PASS** across four classes:
      * TestPartnerLifecycle: create + auto-totals, empty-submit 400, cancel-before-ack works.
      * TestSupplierLifecycle: cannot skip ack (ship-before-ack 409), ack idempotency 409, partner-cancel-after-ack 409, supplier-never-sees-draft (list omits + GET 404).
      * TestReceipts: partial→full receive transitions correctly, over-receipt guarded (400 with `over_receipt` code), can't receive before ack, audit trail includes create + submit + acknowledge + ship events.
      * TestAdmin: cross-network list with buckets, override-cancel writes `override_cancel` audit action.
    - **Combined regression**: **40/40 backend pytest still green** (Phase 1 + 2A + 2B + 3).
- ✅ **Phase 3 Cycle 2 — Store Manager PO Frontend** (2026-02-13)
    - New page `/app/frontend/src/apps/partner-portal/PurchaseOrdersPage.jsx` mounted at `/partner-portal/purchase-orders` with a nav item added to `PartnerPortalApp.jsx` (accessible to owner / manager / supervisor / warehouse_manager / inventory_manager roles).
    - **List view**: 7 bucket tabs (Draft / Submitted / Ack'd / Shipped / Partial / Received / Cancelled) with live counts from `/api/partner/purchase-orders`, searchable by PO code, table with supplier + warehouse + total + status chip.
    - **Create-PO wizard (2 steps)**: Step 1 picks Supplier (loaded via new `GET /api/partner/purchase-orders/suppliers` — approved suppliers in the partner's country) + Warehouse (auto-populated from `/partner/auth/me`) + optional ETA/notes → creates draft. Step 2 debounced type-ahead over `GET /api/partner/purchase-orders/supplier-catalogue?supplier_id=...` — clicking a result adds a line at qty=1; qty is PATCH-editable inline; delete removes; Subtotal/Tax/Total cards recompute live. Submit is blocked when there are 0 lines.
    - **Detail page**: PO code + status chip + 4 stat cards + lines table with Ordered / Received / Remaining / Unit cost / Tax % / Line total, plus receipts list and full audit trail. Cancel modal (data-testid `po-cancel-modal`) requires a reason and only appears for `draft` / `submitted`. Receive drawer (data-testid `po-receive-drawer`) shows every line with its remaining qty + capped input; empty-qty submit shows toast; partial confirms flip status to `partially_received`; the remainder to `received` (which also lists the receipt event).
    - **New backend helpers** (added in Cycle 2 alongside frontend): `GET /partner/purchase-orders/suppliers` (approved suppliers in partner's country) + `GET /partner/purchase-orders/supplier-catalogue?supplier_id=…&q=…` (type-ahead over that supplier's active catalogue).
    - **Testing**: iteration 28 **100% frontend PASS (11/11 spec bullets)** covering login + nav, buckets + search, wizard Step 1 validation + Step 2 catalogue type-ahead + add-line + qty PATCH + submit, detail page (stat cards + status chip + audit trail), Cancel modal (empty-reason toast + confirmed cancellation + red banner), Receive drawer (empty-qty toast + partial → `partially_received` + full → `received` + receipts list). One design nit on the post-receipt product cell layout fixed in-cycle (line-height + explicit conditional render on `supplier_sku`). Backend regression clean: **11/11 pytest still green**.
- ✅ **P1 — Two-Path Catalogue + Product Requests UI wiring** (2026-02-17)
    - **Backend** (`shared/suppliers/portal_routes.py`): new `GET /api/supplier/me/categories` — country-scoped list of `MartCategory` rows for the create-new-product dropdown. `GET /api/supplier/me/catalogue/master-products` (already existed) verified for the "Add existing" path.
    - **Frontend Catalogue** (`PortalCatalogue.jsx`): dual-CTA — **Add existing master product** (primary, opens type-ahead drawer) + **Create new product** (outlined, navigates to `/martbaked/{slug}/portal/product-requests`). Info banner explains both paths. Empty-state copy updated for both.
    - **Frontend Product Requests** (`PortalProductRequests.jsx`): categories now fetch from the new supplier-scoped endpoint. "New request" button disables (shows "Loading…") until categories resolve — closes the race-condition the testing agent flagged. Form already supports basic + identification + packaging + commercial fields + image upload via Emergent Object Storage.
    - **Admin routes** (`AdminApp.jsx` + `ModuleWorkspace.jsx`): mounted the existing `AdminSupplierProductRequests` component at `/admin/modules/mart/suppliers/product-requests` with a MART sub-nav tab so Super Admins can approve/reject supplier-proposed products.
    - **Testing**: iteration 36 — **backend 6/6 + frontend 8/8 PASS** (categories 401 unauth, master-products search case-insensitive, full request lifecycle including auto master-product creation + supplier catalogue auto-link on approve). One minor race-condition on category dropdown fixed post-report. Zero blocking issues.

- ✅ **P0 hotfix — Seller portal slug URLs + sidebar routing + admin drawer** (2026-02-17)
    - **Migration `0018_seller_slug`**: adds `suppliers.seller_slug` (unique index `ux_suppliers_seller_slug`) + auto-backfill for existing approved rows (DEMO Delta → `delta`).
    - **Backend approve** (`shared/suppliers/routes.py`): idempotent slug generator — first word of `trading_name`/`business_name`, lower/ascii-only, collision-suffixed `-2`/`-3`. Never overwrites an existing slug. Login + portal `/me` responses now include `seller_slug`.
    - **Frontend routing**: dual route in `App.js` — new `/martbaked/:sellerSlug/portal/*` + legacy `/martbaked/sellers/portal/*` mounted with `legacy` prop that redirects to the resolved slug URL client-side. `SellerApp` post-login redirect uses `data.supplier.seller_slug`. Sidebar NavLinks are **absolute paths** built from the slug (fixes an infinite-navigation loop bug the testing agent caught on the first pass — see iteration 35 notes).
    - **New Dashboard** (`PortalHome`): 6 stat cards (Total products / Open POs / Invoices to settle / Product requests / Documents / Unread notifications) + Quick Actions (6 buttons) + Getting Started checklist. Every card + button uses relative `../…` links so nav stays correct under the slug prefix.
    - **Admin approval drawer** (`AdminSupplierApplications.jsx`): flexbox column layout with `flex-1 overflow-y-auto` body and a `border-t` sticky action footer `[data-testid=supplier-action-footer]`. Button colours differentiated: **Approve** — light bg + dark border + dark text (`#F5F5F0` / `#0A1200`), **Request info** — neutral gray, **Reject** — solid red.
    - **Testing**: iteration 35 — backend 8/8 PASS (idempotency, slug generation for freshly-approved `DEMO Echo Fresh Produce` → `echo`, unique constraint enforced, RBAC intact), frontend 21/21 PASS after the sidebar loop fix. Legacy path redirect, refresh safety on all 8 routes, and back/forward all verified.

- ✅ **Phase 5b — In-app notification bell** (2026-02-14)
    - **Migration `0017_notifications`**: single polymorphic `notifications` table with `(recipient_kind ∈ supplier|partner|admin, recipient_id)` scope, composite index on `(recipient_kind, recipient_id, is_read, created_at DESC)`. One shared row shape covers PO + invoice + future kinds.
    - **Backend service**: `/app/backend/shared/notifications/routes.py::notify(session, ...)` inserts inside the caller's session so dispatch commits atomically with the parent state transition (409s never leave phantom rows). Three routers — `/api/{supplier|partner|admin}/notifications` — with list (`?unread=1` filter + `unread_count`), single `/read`, and `/read-all`. Cross-tenant queries are naturally isolated by the `recipient_id` scope + the session actor.
    - **Wired dispatch sites**: PO submit → supplier, PO ack → partner, PO ship → partner, invoice auto-draft (on PO receive) → supplier, invoice submit → partner, invoice approve → supplier, invoice dispute → supplier. Every notification includes deep-link back to the relevant portal page.
    - **Frontend `NotificationBell.jsx`**: shared component reused across all three portals with `apiClient`, `basePath`, `onNavigate`, and `align` props. 20 s polling; color-coded kind badges; click-a-row marks read + navigates; "Mark all read" clears the badge. Bell wired into partner top-nav, supplier sidebar header (`align="left"` to avoid off-screen clip), and admin sidebar footer.
    - **Testing**: iteration 34 — **18/18 pytest PASS** covering auth 401, list shape, unread filter + count math, all 7 dispatch sites end-to-end, cross-tenant isolation, atomic dispatch (no phantom row on 409), and read/read-all persistence. Frontend verified end-to-end in all three portals with real polling + row navigation. Zero blocking issues; one minor design nit (dropdown alignment) already fixed post-report via the new `align` prop.

- ✅ **Phase 5 — Supplier Invoices with 3-way match** (2026-02-14)
    - **Migration `0016_supplier_invoices`**: three tables — `supplier_invoices` (header with UNIQUE(po_id) MVP guard, status/match_status/tolerance_pct_used, `invoice_document_storage_path`, dispute_reason/approval_notes/override_notes), `supplier_invoice_lines` (qty_ordered / qty_received / qty_invoiced split, unit_cost_po / unit_cost_invoiced / unit_cost_variance_pct split, per-line match_status enum), `supplier_invoice_audit`. Every quantity and cost data point stored **separately** as required — no silent normalisation.
    - **ORM**: `/app/backend/core/models/supplier_invoices.py` — `SupplierInvoice`, `SupplierInvoiceLine`, `SupplierInvoiceAudit`. `paid` status reserved in enum for Phase 8.
    - **Service** `/app/backend/shared/supplier_invoices/service.py` — `ensure_draft_invoice_for(session, po_id)` idempotently spawns a draft mirroring cumulative GRN receipts × PO unit_cost; `rerun_three_way_match` refreshes line + header match with configurable tolerance from env var `PO_INVOICE_UNIT_COST_TOLERANCE_PCT` (default 2.0) — lifted to a `platform_settings` row later without touching the match code. Match rules: qty EXACT vs GRN, cost within ±tolerance ⇒ matched; else `qty_variance` / `cost_variance` / `both_variance`.
    - **Routes**: three routers — Partner (`/api/partner/invoices`), Supplier (`/api/supplier/me/invoices`), Admin (`/api/admin/modules/mart/invoices`), each with list + get + document proxy. Supplier can PATCH lines + upload PDF (real Emergent Object Storage) + submit (requires supplier_invoice_number + invoice_date + uploaded PDF, else 400 with `code=missing_fields` + `fields[]`). Partner can approve or dispute — variance approval requires notes (400 `code=variance_approval_notes_required`), dispute requires reason (min 6 chars). Admin can override with actions `approve` / `dispute` / `reset_to_draft`. Cross-tenant 404 on all supplier/partner GETs.
    - **PO auto-hook**: `partner_receive_po` (~L800 in shared/purchase_orders/routes.py) calls `ensure_draft_invoice_for` immediately after committing a `received` transition — never fails the receive path (swallowed exception + log).
    - **Frontend**: single shared `/app/frontend/src/components/invoices/SupplierInvoicesPage.jsx` reused across all three portals via `apiClient` + `role` + `basePath` props. Renders bucket tabs, list, detail with the full 3-way match line-by-line breakdown (qty_ordered / qty_received / qty_invoiced / unit_cost_po / unit_cost_invoiced / variance %), inline editing for suppliers on drafts, PDF upload widget, role-conditional actions (Supplier submit / Partner approve+dispute / Admin override), and a per-invoice audit trail. Wired into Partner sidebar, Supplier sidebar, and MART module workspace nav (`module-tab-invoices`).
    - **Testing**: iteration 33 — **17/17 pytest PASS** (`/app/backend/tests/test_supplier_invoices_phase5.py`) covering auto-draft, idempotency, listing scopes+filters, PATCH-produces-variance, PDF upload to real object storage, submit missing-fields guard, matched vs variance transitions, partner approve happy path, variance approval requires notes, dispute reason validation, admin override for all three actions (including `reset_to_draft` clears timestamps + match_status), cross-tenant 404, and document proxy on all three roles. Frontend verified end-to-end across supplier / partner / admin portals. Zero blocking issues; a handful of nit code-review comments logged but non-blocking.

- ✅ **Phase 4c — PO Email Notifications** (2026-02-14)
    - **Backend** `/app/backend/shared/purchase_orders/notifications.py` — dedicated fire-and-forget dispatcher `dispatch_po_notification(kind, po_id)` that spawns an `asyncio.create_task` so response latency stays untouched. Kinds: `"submitted"` → supplier's `business_email`, `"acknowledged"` → partner's `owner_email`, `"shipped"` → partner's `owner_email` **plus** every active `PartnerStaff` with `role="warehouse_manager"` bound to the PO's warehouse. Templates are branded HTML + plain-text pairs with CTA buttons deep-linking to `PUBLIC_APP_BASE_URL` (`martbaked/sellers/portal/orders` for suppliers, `partner-portal/purchase-orders` for partners). Missing recipient emails log `po_notify.no_recipients` and no-op; SMTP being unconfigured logs `mailer.no_op` — nothing raises.
    - **Wiring**: three one-line calls added to `/app/backend/shared/purchase_orders/routes.py` immediately after `session.commit()` in `partner_submit_po` (~L634), `supplier_acknowledge_po` (~L884), `supplier_ship_po` (~L906).
    - **Testing**: iteration 32 — new pytest suite `test_purchase_orders_phase4c_notifications.py` (6/6 PASS) covering submit/ack/ship recipient correctness, warehouse_manager fan-out on ship, fire-and-forget latency (<3s), no-dispatch on 409 validation errors, empty-recipient guard. Phase 3 regression (`test_purchase_orders_phase3.py`) — 11/11 still PASS. Zero issues logged; SMTP remains mocked (dev), production readiness intact once SMTP env vars are populated.

- ✅ **Phase 4b — Replenishment → Draft PO conversion** (2026-02-14)
    - **Migration `0015_replenishment_po_link`**: adds `partner_replenishments.converted_po_id` (nullable FK → purchase_orders) with `ON DELETE SET NULL`, adds index `ix_replen_converted_po`, extends `ck_replen_status` to include new `'converted_to_po'` bucket. ORM `REPLENISHMENT_STATUSES` tuple updated in lockstep.
    - **Backend** `/app/backend/modules/mart_partner/replenishment_routes.py` — new partner-scoped router at `/api/partner/replenishments`. `GET /` lists strictly by `partner_id` (staff also scoped to their store) and hydrates a `primary_supplier` block per row using a deterministic picker (same country · approved supplier · active supplier_product · lowest `cost_price` · supplier code tie-break). `POST /convert-to-draft-po` accepts a list of suggestion ids, groups by (warehouse, primary supplier), and creates ONE draft PO per group (with audit action `create_from_replenishment` + note listing source suggestions). Row-level skip reasons: `not_found`, `wrong_store`, `no_supplier`, `not_suggested`, `already_converted` (with `detail.po_status`). Duplicate guard permits re-conversion once the linked PO has been `cancelled`.
    - **Frontend** `/app/frontend/src/apps/partner-portal/RestockSuggestionsPage.jsx` — new sidebar tab **"Restock suggestions"** in `PartnerPortalApp.jsx` (visible to owner / manager / supervisor / warehouse_manager / inventory_manager). Table with bucket tabs (`To convert` / `Converted` / `Cancelled`), row-level checkboxes disabled for `no_supplier` items (with red "NO APPROVED SUPPLIER" badge), a bulk-select bar with live-count of grouped draft POs to be created, a confirm modal with per-supplier group preview + total pre-tax cost, and a result modal that deep-links to the created draft POs in the Purchase Orders page. Converted rows expose a "View draft PO →" chip that jumps to the PO list.
    - **Testing**: iteration 31 — **100% pass** across 8 pytest cases (list scope, supplier tie-break, happy path, no_supplier skip, idempotency, recycle-after-cancel, 401 no-bearer, cross-partner not_found) + full Playwright frontend flow (select-all limited to convertible rows, confirm+result modals, bucket count updates, deep-links, restock-nosupplier badge on rep_002). Zero issues logged.

- ✅ **Phase 4 — GRN Document Generation (PDF + Excel)** (2026-02-14)
    - **Backend**: `/app/backend/shared/purchase_orders/grn.py` with pure `build_grn_pdf` (ReportLab, Vera TTF for unicode, single-page A4: brand header, buyer+supplier party blocks, receipt event block for per-receipt variant, lines table with Ordered / Received now / Cumulative / Unit cost / Line total, right-aligned totals with green-tinted grand total, signature block, "Not a tax invoice" footer) and `build_grn_xlsx` (openpyxl, single "GRN" sheet, matching layout with currency-formatted numbers). `assemble_payload` computes per-line `qty_in_scope` and cumulative quantities differently for consolidated vs single-receipt variants; `build_grn_reference` produces deterministic `GRN-<PO code>-C` or `GRN-<PO code>-R01/R02/…` refs.
    - **Endpoints** (all three surfaces) — Partner: `GET /api/partner/purchase-orders/{po_id}/grn` (list) + `/grn.pdf` + `/grn.xlsx` + `/receipts/{rid}/grn.pdf` + `/receipts/{rid}/grn.xlsx`. Supplier: same paths under `/api/supplier/me/purchase-orders/{po_id}/…` (draft POs rejected 404). Admin: same paths under `/api/admin/modules/mart/purchase-orders/{po_id}/…`. All PDFs served as `application/pdf` with attachment disposition; XLSX served as `spreadsheetml.sheet`.
    - **Frontend**: Shared `GrnDownloadModal.jsx` used by Partner PO detail (`po-btn-grn` visible only for `partially_received` / `received`), Supplier PO detail (`sp-po-btn-grn`, same guard), and Admin PO detail (`admin-po-grn-btn`, same guard). Modal lists 1 consolidated row + N receipt rows, each with PDF + Excel buttons that stream via `responseType='blob'` and auto-trigger a hidden anchor click with sonner success toast.
    - **Testing**: iteration 30 — 15/15 pytest cases pass in `/app/backend/tests/test_purchase_orders_phase4_grn.py` (headers, magic bytes, PDF text extraction verifying all header/party/totals fields, XLSX openpyxl content check, RBAC 401 no-token + 404 cross-tenant partner/supplier + 404 draft PO on supplier surface). Frontend verified on all 3 portals with real 200-OK network GETs on button click. Zero issues; Phase 4 100% complete.

- ✅ **Phase 3 Cycle 3 — Supplier PO View + SA Dashboard (Phase 3 COMPLETE)** (2026-02-14)
    - **Supplier Portal "Orders"** at `/martbaked/sellers/portal/orders` (`PortalOrders.jsx`): list with 6 status buckets (submitted / acknowledged / shipped / partially_received / received / cancelled), each with live counts. PO row → detail page showing buyer, warehouse, lines table, buyer notes, and status chip. Supplier can only transition `submitted → acknowledged` (button `sp-po-btn-ack` + drawer with optional notes) and `acknowledged → shipped` (`sp-po-btn-ship` + drawer). No receive capability (partner-only). Wired into `SellerPortalApp.jsx` sidebar + routes.
    - **Super Admin cross-network PO dashboard** at `/admin/modules/mart/purchase-orders` (`AdminPurchaseOrders.jsx`): 8 bucket tabs (all / draft / submitted / acknowledged / shipped / partially_received / received / cancelled) with counts, PO code search, country ISO filter, table showing PO / partner / supplier / warehouse / total / status / created. Detail drawer shows lines + full audit trail. **Override-cancel** modal (`admin-po-override-modal`) is SA-only, requires a reason, is hidden for `cancelled` / `received` POs, and writes an `override_cancel` audit event. Added to `ModuleWorkspace.jsx` MART sub-nav as `module-tab-purchase-orders`.
    - **Testing**: iteration 29 **100% frontend PASS (9/9 acceptance criteria)** covering supplier ack/ship happy paths + received-guard, admin bucket switching + search + country filter (`CI` returns 33, `XX` empty), admin detail rendering + audit trail, override-cancel end-to-end, and override guard on already-received POs. Zero issues logged.


- ✅ **P2 — Product Approval Feedback Loop + Category Request Submission (2026-02-19)** — shipped the last two P2 UI polish items from `Fixing_Prompt.docx`.
    - **Backend — supplier resubmit** (`/app/backend/shared/suppliers/portal_routes.py`): new `PATCH /api/supplier/me/product-requests/{req_id}` — accepts full `ProductRequestIn` payload, only allowed on `rejected` requests (409 otherwise), replays the fields, flips `status→pending` and clears `review_notes` / `reviewer_admin_id` / `reviewed_at` so Super Admin sees a fresh submission.
    - **Backend — supplier category requests** (`/app/backend/shared/admin/category_requests.py` + migration `0019_category_requests_supplier`): extended `mart_category_requests` with nullable `supplier_id` FK + `requester_kind ('partner'|'supplier')` and made `partner_id` nullable. New `supplier_router` with `POST /api/supplier/me/category-requests` (submit) and `GET /api/supplier/me/category-requests` (mine). Admin `GET /api/admin/mart/category-requests` gained a `kind` filter and hydrates `supplier_name` / `requester_name` / `requester_kind` per row. Admin approve/reject now fires `category_request_approved` / `category_request_rejected` in-app notifications when the requester is a supplier.
    - **Frontend — supplier portal** (`PortalProductRequests.jsx`): rejected cards now render a red-outlined "Reviewer feedback" panel with the exact `review_notes` and a "Revise & resubmit" CTA that opens the same form pre-filled and calls PATCH. Added top-bar "Request category" CTA + inline "New" chip next to the category dropdown; both open the `NewCategoryRequestForm` modal that POSTs to `/supplier/me/category-requests`. A "Your category requests" strip lists the supplier's submissions with status chips + inline rejection reasons.
    - **Frontend — admin** (`AdminCategoryRequests.jsx`): table now shows `Requester` + `Type (partner|supplier)` columns with colored badges. Review drawer surfaces the requester kind so Super Admin always knows who's asking.
    - **Testing**: `testing_agent` iteration 37 — **8/8 backend pytest + full Playwright E2E PASS, zero bugs**. Verified: supplier POST/GET category-requests scoped correctly, admin lists them with `kind` filter, approve creates a real `MartCategory` and fires the in-app bell, PATCH resubmit works only on `rejected` and 409s otherwise, and clears review fields. Frontend: revise-and-resubmit flips card to PENDING with a "Request resubmitted" toast; category modal submit shows toast and new PENDING row appears in the strip.


- ✅ **Phase 6a — Tablet Picker Screen (2026-02-19)** — dedicated Picker/Packer/Dispatch UI shipped.
    - **Migration `0020_partner_order_picks`** — new `partner_order_picks` table with `(partner_order_id, order_item_id)` UNIQUE, `picked_qty`, `picker_staff_id`, `first/last_picked_at`.
    - **Backend router `/app/backend/modules/mart_partner/picker_routes.py`** (RBAC owner/manager/supervisor/packer):
        - `GET /api/partner/picker/queue` — accepted + packing orders with pre-computed progress + buckets.
        - `GET /api/partner/picker/orders/{po_id}` — full detail with per-line `picked_qty` / `required_qty` / `is_complete` (idempotently creates pick rows on first read).
        - `POST /api/partner/picker/orders/{po_id}/scan {code, qty=1}` — matches by `order_item.id | product_id | sku_code | ean_upc`, caps at required qty, auto-flips `accepted → packing` on first scan. Returns 409 `already_complete` when over-picked.
        - `POST /api/partner/picker/orders/{po_id}/set-item {order_item_id, picked_qty}` — manual override with cap/floor.
        - `POST /api/partner/picker/orders/{po_id}/complete` — validates all items fully picked (409 with `incomplete_picks[]` list otherwise), then transitions status → `ready` with `ready_at`.
    - **Demo seeder patched** (`routes.py`) — `POST /api/admin/mart-partner/partners/{id}/demo-orders` now links `order_items.partner_id` + `partner_order_id` + sets `po.subtotal` / `item_count` so the picker screen has real data on the demo partner (previously items were orphaned).
    - **Frontend `PickerPage.jsx`** — two-column tablet layout:
        - Left: queue with 6-color progress bars, status chips (Accepted / Packing / Ready), tap-to-open.
        - Right: hero card with `now picking / order_number / customer address / delivery slot / progress %`, always-auto-focused amber-ringed **scan input** (works with USB barcode guns via keyboard emulation, and with virtual keyboards), a transient green/red **Scan feedback** flash badge, per-line +/- controls, sticky **Mark ready for handoff** CTA disabled until 100%.
    - **Sidebar** — new "Picker" nav item (data-testid `portal-nav-picker`) visible to owner/manager/supervisor/packer.
    - **Testing**: `testing_agent` iteration 38 — **10/10 backend pytest + full Playwright E2E PASS, zero bugs**. Verified: RBAC (packer allowed, cashier 403), scan match by product_id/sku/ean, 404 for invalid codes, auto-flip accepted→packing, 409 already_complete / incomplete_picks, complete → ready. Frontend: sidebar item, queue navigation, progress live-updates, +/- controls, red/green flash, CTA gating.


- ✅ **P0 Correction Pass — SENDbakēd rebrand + Module-scoped Partner Portal URLs + Côte d'Ivoire-only UI (2026-02-19)** — from `Fixing_Prompt.docx`.
    - **Branding**
        - Swapped `MODULE_LOGO.express.{dark,light}` in `BakedLogo.jsx` to the supplied SENDbakēd JPEGs (`odl93m8h_SENDbaked.jpeg` light-bg, `xaactaon_SENDbakedDark.jpeg` dark-bg). Alt text for `code="express"` overridden to `SENDbakēd`. Internal module identifier `express` untouched everywhere (routes, DB, permissions).
        - Swapped the primary BAKĒD wordmark to the supplied assets (`s7zvso1h_...(1).jpeg` light-bg + `h99r81z3_...(1).jpeg` dark-bg).
        - Text sweep of user-facing "EXPRESSbakēd" → "SENDbakēd" in ExpressLayout, ExpressServices, ExpressBookings, ExpressWizard, ExpressLiveTracking, MoversWizard, ComingSoonLanding, TermsOfService, PartnerLandingApp (module card + testimonials).
    - **Côte d'Ivoire-only UI**
        - Removed Liberia from user-facing selectors: `PartnerLandingApp.COUNTRIES`, `PartnerApplyApp` country dropdown, `SellerApplyWizard` country dropdown, admin `ModulePages` express-pricing country filter. Landing hero tagline "Now onboarding — Côte d'Ivoire" (Liberia dropped).
        - Historical Liberia records preserved in DB (no destructive delete).
    - **Module-scoped Partner Portal URLs**
        - New module registry `/app/frontend/src/apps/partner-portal/moduleRegistry.js` with 6 slugs (martbaked/sendbaked/shopbaked/foodbaked/autobaked/immobaked). Only MART flagged `isLive:true`.
        - `PartnerPortalApp.jsx` fully refactored: nested `ModuleRouter` under `/partner-portal/:moduleSlug/*`. Legacy `/partner-portal/login` + `/partner-portal` route to `ModuleSelectorPage` (6-card selector). Non-MART slugs render `ModuleComingSoonPage`.
        - Every internal path (sidebar nav, logout, reset-password redirect) now module-scoped via `useModuleBase()`. `Protected` component silently redirects mismatched URL-slug ≠ JWT-module to the user's real module — URL swap does not bypass permissions.
    - **Module-scoped Staff Login URLs**
        - `PartnerHubApp` adds `/:moduleSlug/staff-login` route. Legacy `/partner/staff-login` → `ModuleSelectorPage(intent="staff")`.
        - `StaffLoginPage.jsx` refactored to read `moduleSlug` from `useParams()` and route the post-login redirect based on the JWT-issued session's real module (not the URL slug).
    - **Internal link sweep**
        - `Footer.jsx` MARTbakēd Partner link → `/partner-portal/martbaked/login`.
        - `PartnerHubApp` module-card `loginHref` → `/partner-portal/martbaked/login`.
    - **Testing**: `testing_agent` iteration 39 — **full frontend route audit PASS, zero bugs**. Verified: 15 refresh URLs render, 6-module selector correct, MART login lands module-scoped, coming-soon shells render, sidebar/logout use module-prefixed paths, JWT authoritative, no Liberia in UI, SENDbakēd branding live everywhere.
    - **Explicitly out of scope (per doc §13)**: Supplier approvals, catalogue, PO, GRN, billing, invoices, replenishment, permissions, DB business logic, API contracts, existing module functionality — all untouched.


- ✅ **India (IN) testing location added alongside Côte d'Ivoire (2026-02-19)** — from `docs/prompts/India_Location.txt`. Narrow scope, all reversible.
    - **Backend** (`seed.py`): added IN country row with the exact spec (currency INR / ₹, locale en-IN, phone_code +91, timezone Asia/Kolkata, delivery_fee 29, min_order 199, free_delivery_over 499, active + production_visible). Module-config seeder auto-picks it up so `/api/config/modules?country=IN` returns all 6 modules. CI + LR rows untouched.
    - **Frontend selectors** now offer [CI, IN] in `PartnerLandingApp.COUNTRIES`, `PartnerApplyApp` dropdown, `SellerApplyWizard` step-1 dropdown, `PortalLocations` supplier location dropdown, admin `ModulePages` express-pricing filter. Landing hero tagline "Now onboarding — Côte d'Ivoire & India". LR still hidden from UI (per P0 correction pass), records preserved in DB.
    - **Map centers**: added New Delhi (28.6139, 77.2090) to `COUNTRY_CENTER` in `ExpressWizardShell`, `ExpressHome`, `WarehouseLocationPicker`.
    - **First-visit geolocation → country auto-detect** in `BakedContexts.jsx`: runs once if no prior `baked_country` in localStorage (module-load snapshot guard). Uses browser `getCurrentPosition` + Google `reverseGeocode`, validates against the backend-supplied allowlist, silently no-ops on any error. User's explicit choice is never overridden.
    - **Google Places** already country-scoped via `includedRegionCodes:[iso.toLowerCase()]` — Delhi suggestions when IN active, Abidjan when CI active.
    - **Phone codes**: `+91 IN` was already in `PhoneLoginDialog.COUNTRY_CODES`.
    - **Testing**: `testing_agent` iteration 40 — **backend + frontend PASS, zero bugs**. Verified: backend row shape, `/api/config/modules?country=IN` returns 6, dropdowns limited to [CI, IN], `₹499/₹29/₹199` render on MART home when baked_country=IN, `500/3,000/15,000 CFA` when CI, refresh-safe across all module URLs.


- ✅ **Detect Chip + IN NCR Pincode Allowlist (2026-02-19)** — bundled follow-up.
    - **`Use my location` chip** in the header country switcher (`TopNav.jsx`, `data-testid=country-detect-chip`) re-runs geolocation → reverseGeocode → country auto-detect for users who declined the first-visit prompt. Per-reason toast copy ("Location permission is blocked…", "Couldn't read your location right now…", etc.). Extracted the detection logic into a reusable `detectCountryByLocation()` Promise on `useApp()`, added a `useRef` idempotency guard so the first-visit effect can never double-fire.
    - **IN NCR pincode allowlist** in `/app/backend/shared/addresses/routes.py` — `IN_PINCODE_ALLOWLIST = {201301..201318}` covers all Noida + Greater Noida sectors incl. the two the user explicitly listed (201301, 201310). The serviceability endpoint gained an optional `postal_code` query param; when `country=IN` and `postal_code` is in the allowlist we short-circuit to `serviceable=true, match='pincode_allowlist'`. All other paths (CI hub-distance, IN without matching pincode) unchanged. Frontend `AddressSelector.jsx` now passes `candidate.postal_code` on every serviceability check.
    - **LR hidden from customer UI**: flipped `LR.production_visible=False` in `seed.py`, and `/api/config/countries` now always filters by `production_visible` (removed the APP_ENV dev bypass that was masking the leak). LR row preserved for FK integrity from legacy suppliers/partners.
    - **Testing**: `testing_agent` iteration 41 — **backend 9/9 pytest PASS + frontend full E2E PASS, zero bugs**. Verified: `/api/config/countries` returns [CI, IN] only, Noida pincodes serviceable, Bangalore denied, IN-without-pincode falls back to hubs, CI Cocody still serves ~0.87 km, admin `?country=LR` still works.


- ✅ **IN NCR Hub Seed (2026-02-19)** — Delhi NCR pilot now has real hubs, enabling distance-based routing alongside the pincode allowlist.
    - **Two hubs seeded in `seed.py > STORES_IN`**:
        - `MARTbakēd Sector 18 Noida` (28.5691, 77.3210) — 15 km radius covers Sectors 1–140 Noida + Delhi border.
        - `MARTbakēd Alpha 1 Greater Noida` (28.4744, 77.5040) — 15 km radius covers Greater Noida sectors + Greater Noida West.
    - **Four IN cities** added to `CITIES_IN`: New Delhi, Noida, Greater Noida, Gurugram.
    - **Belt-and-braces verified**: hub-distance path works for real addresses (Sector 18 Noida 0.0 km · Sector 62 Noida 8.41 km · Sector 137 Noida 10.15 km · Alpha 1 GN 0.0 km · Delta 1 GN 6.71 km · Connaught Place Delhi 12.02 km — all serviceable; Bangalore 1723 km — not serviceable). The pincode allowlist still short-circuits far-flung Greater Noida coordinates when they carry a matching PIN.
    - No new tables, no migrations — used the existing `MartStore` + `City` idempotent upsert seeders. CI, LR, and existing supplier/partner data untouched.


- ✅ **SENDbakēd Driver — Slice 1: Onboarding + KYC + Dashboard (2026-02-19)**. Backend + mobile-web PWA reference implementation (spec: `SENDbaked_Driver.docx` Phases 1-3).
    - **Backend**
        - Migration `0021_driver_platform`: `drivers` table (phone-unique, country-tagged, `status ∈ {onboarding, pending_review, approved, suspended, rejected}`, `kyc_step` progression pointer, 7 KYC fact groups + runtime online/lat/lng, reviewer notes) + `driver_otps` table (10-min TTL, 5-try cap, mocked SMS printed to backend logs, `dev_hint` returned in non-production).
        - Models: `Driver`, `DriverOtp` under `core.models.driver`. Constants `DRIVER_STATUSES`, `KYC_STEPS`, `VEHICLE_TYPES`.
        - Routes at `/app/backend/modules/driver/routes.py`:
            - `POST /api/driver/auth/request-otp` and `.../verify-otp` — issues a JWT with `role='driver'`.
            - `GET /api/driver/me` — masked bank number + gov ID number (last 4 only).
            - `PATCH /api/driver/me/kyc {step, data}` — server-side whitelist per step so `status='approved'` can't be smuggled in.
            - `POST /api/driver/me/upload` (multipart) — reuses `object_storage.put_object`; served back via `GET /api/driver/uploads/{key:path}`.
            - `POST /api/driver/me/submit` — validates every mandatory KYC field is set, then flips `onboarding → pending_review`.
            - `POST /api/driver/me/online` — 403 unless `status='approved'`; also stashes `lat/lng/area`.
            - `GET /api/driver/me/dashboard` — stub for Slice 1 (returns the exact shape the UI needs so screens never render undefined; real earnings/incentives arrive in Slice 2-3).
            - Admin at `/api/admin/drivers` — list + filters (status/country/q) + buckets + approve/reject with reviewer notes.
    - **Frontend PWA** at `/driver/*` (`/app/frontend/src/apps/driver/DriverApp.jsx`) — mobile-first phone frame (max-width 440), pure-black background, orange (`#FF7A00 → #FFB454`) accent, dark-glass cards, rounded-3xl corners, sticky header, one-hand-friendly bottom CTAs.
        - Screens: Splash gate · 3-slide onboarding (skippable) · phone+country picker · 6-digit OTP (auto-focus, resend countdown, dev-hint toast) · 7-step KYC wizard (personal / id / licence / selfie / vehicle / bank / emergency) with progress bar and per-step server-validated saves · submitted (application-under-review) · dashboard (online toggle gated by approval, today's earnings placeholder in ₹/CFA per country, current area, coming-next strip).
        - Country-scoped ID types (Aadhaar/PAN/Passport for IN; CNI/Passport for CI). Country-scoped currency ("₹" for IN, "CFA" for CI). Vehicle-type grid supports the full 5-type set (bike, scooter, tricycle, mini_truck, big_truck).
    - **Testing**: main agent Playwright smoke-tested the full flow (onboarding → login IN +91 → OTP verify → KYC step 1 → step 2 → dashboard). All test-ids in place. Admin driver-directory curl passes with 4 drivers · correct bucket counts.
    - **Not in this slice** (parked for Slice 2+): incoming delivery request card, pickup/delivery navigation, OTP/QR delivery verification, earnings dashboard, wallet withdraw, incentives, chat, live location broadcast.

