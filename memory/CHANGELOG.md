# BAKĒD — Changelog (recent slices only; older detail lives in PRD.md)

## 2026-03-04 — Module-aware cart theming + India PIN + location dropdown — COMPLETE
Fixing_Prompt v14 shipped end-to-end.

- **`lib/cartTheme.js` (new)** — shared `detectCartMode(cart)` returns one of `MART_ONLY / SHOP_ONLY / MIXED / EMPTY`; `getCartTheme(cart)` maps to `{ accent, accent_soft, text_on, label }`. Tokens: MART green `#77BC1F`, SHOP gold `#FCC44C`, MIXED neutral `#E5E7EB`. `lineAccent(item)` returns per-item accent for badge/stepper colours regardless of the aggregate mode. Designed to scale — adding FOOD/AUTO/SEND later just adds more theme entries.
- **`pages/CartPage.jsx` + `pages/mobile/MobileCart.jsx`** — replaced hard-coded `#77BC1F` on CTAs, empty-state buttons and quantity steppers with `theme.accent`/`lineAccent(it)`. MIXED cart shows a small "This cart has products from multiple BAKĒD modules." note next to the CTA.
- **`components/mobile/QuantityStepper.jsx`** — accepts an `accent` prop (default MART green for existing callers). Mobile cart passes `lineAccent(item)` so each row's + button matches its module.
- **`pages/CheckoutPage.jsx` + `pages/mobile/MobileCheckout.jsx`** — place-order CTA now module-aware; SHOP-only checkout renders in gold, MIXED in neutral, MART green stays for MART-only carts.
- **`apps/partner-hub/WarehouseLocationPicker.jsx`** — India (`IN`) added to `SUPPORTED` list; NCR pilot centre (Noida) added to `COUNTRY_CENTER`. Places-autocomplete no longer rejects Indian addresses. Autocomplete dropdown swapped from theme-variable colours to explicit `#FFFFFF` background + `#111827` text + `zIndex 60` + `shadow-2xl`, so suggestions stay legible regardless of the parent theme context (fixes the white-on-white bug seen in the SHOP seller wizard).
- **Backend** — `shared/addresses/routes.py::_matches_country_pincode_allowlist` already allowed Noida + Greater Noida pincodes (201301–201318); verified `GET /api/addresses/serviceability?country=IN&postal_code=201310` returns `{serviceable: true, match: "pincode_allowlist"}`. No backend change needed for India PIN.

Verified visually:
  * SHOP-only cart: entire CTA + steppers gold.
  * MART-only cart: green (unchanged).
  * MIXED cart: neutral CTA, per-line green/gold steppers, mixed-module note visible.
  * India PIN 201310 serviceability returns `true` end-to-end.




## 2026-03-04 — Apply-uploads security hardening (rate limit + signed URLs) — COMPLETE
Follow-up to the 2026-03-03 QA #8 fix — the public seller-apply upload endpoint is now guarded against abuse and PII leakage.

- **`core/utils/rate_limit.py` (new)** — in-memory per-IP sliding-window limiter. `check_rate_limit(request, bucket, limit, per_seconds)` raises `HTTPException(429, {code: "rate_limited", retry_after_seconds})` with a `Retry-After` header. XFF-aware (left-most token wins) so the source IP survives the k8s ingress hop. Note: state is per uvicorn worker → effective per-IP ceiling ≈ `workers × limit` (documented; move to Redis for exact enforcement).
- **`core/utils/signed_url.py` (new)** — HMAC-SHA256 signer. `sign_url(base, path, ttl_seconds=…)` returns `<base>?exp=…&sig=…`. `verify_signature(path, exp, sig)` constant-time compares. Secret resolution: `SIGNED_URL_SECRET` → `JWT_SECRET` → `SECRET_KEY` → dev fallback, so rotating the app-wide JWT secret globally revokes every previously-issued signed URL.
- **`shared/suppliers/routes.py::apply_upload`** — now:
  * Rate-limits at 20/min and 200/hour per IP before touching object storage (cheap reject path).
  * Returns `{storage_path, file_url}` — `file_url` is a 24 h-signed URL. `storage_path` is the canonical key persisted to `supplier_documents.storage_path` for later re-signing.
- **`shared/suppliers/routes.py::apply_file_serve`** — mandatory HMAC signature check on every request. Unsigned / expired / tampered URLs → 403 `bad_signature`. Ruled out the previous "opaque path is enough" behaviour so leaked links stop working after 24 h.
- **`shared/suppliers/routes.py::apply_save_step` (step=8)** — extracts `storage_path` from the incoming signed URL (or accepts an explicit `storage_path` field) so the DB always has the canonical, re-signable key.
- **`_load_full_snapshot`** — re-mints fresh signed URLs from `storage_path` at every read (admin queue + seller portal). Legacy rows without `storage_path` fall back to their stored `file_url` for compatibility with pre-hardening data.
- **Wizard label parity** — `SellerApplyWizard.jsx` now reads `useSellerModule()` at the top and uses `MOD_LABEL` (`MARTbakēd` / `SHOPbakēd`) for the eyebrow, and `SELLERS_HOME` for the "Back to home" link. Fixes the stale "MARTBAKĒD SUPPLIER ONBOARDING" copy on the SHOP wizard.
- **Regression tests** — `/app/backend/tests/test_apply_upload_hardening.py` (6 tests, all pass, stable across runs): unsigned rejected, tampered rejected, expired rejected, signed 200, rate-limit trips within a 120-request burst, and the upload response shape (`storage_path` + signed `file_url`).




## 2026-03-03 — Testing case.xlsx QA (8 defects) — COMPLETE
Root-cause fixes across DB → API → frontend for every defect the user filed in Testing case.xlsx.

**Bug #1 — SHOP category page margin**  
`apps/shopbaked/pages/ShopCategory.jsx` — wrapped the whole page in `mx-auto max-w-7xl px-4 sm:px-6` so it aligns with the header and rest of the storefront (was stretching edge-to-edge). Stripped duplicated `px-4` on inner rows.

**Bug #2 — Home Product Carousel "View all" always went to /categories**  
`apps/shopbaked/pages/ShopHome.jsx::ProductCarouselSection` + `pages/ConfigHomepage.jsx::ProductCarousel` — new deep-link priority chain: (1) explicit `view_all_link` / `link`, (2) auto-derived from `filter` (category slug) → `/shop/c/<slug>` (SHOP) or `/products?category=<slug>` (MART), (3) fallback `/categories`. Applies to every CMS-driven carousel automatically.

**Bug #3 — Home category tile lands on all-products page**  
Both `ShopHome.jsx::CategoryGridSection` and `ConfigHomepage.jsx::CategoryGrid` now prefer an explicit `c.link` when the admin has set one, otherwise deep-link to the slug-based category page. Explicit link normalisation (`/shopbaked` → runtime `basePath`) keeps CMS content portable.

**Bug #4 — Banner Trio image upload → HTTP 413**  
`pages/admin/AdminHomepageManagement.jsx` — added a canvas-based `compressImageIfNeeded` pass that resizes to ≤2200 px longest side and re-encodes as JPEG at progressive quality (0.85 → 0.75 → 0.65 → 0.55) until the payload is ≤900 KiB — comfortably under nginx-ingress's default 1 MiB body limit and our app-level 8 MiB cap. Skips SVG/GIF. Non-blocking toast informs the admin when an auto-optimisation kicked in.

**Bug #5 — Category Grid tile edit missing link field**  
Same file — added `F.url("link", "Target link (blank ⇒ /shop/c/{slug})")` to the `category_grid` schema; renderer respects it via the fix from Bug #3. The tile form is now full: Slug / Display name / Icon URL / Target link.

**Bug #6 — Seller Apply Step 2 country picker shows CI + LR**  
`apps/martbaked-sellers/SellerApplyWizard.jsx` — replaced `+231 (LR)` with `+91 (IN)`. Backend `core/utils/phone.py` already supported IN dial code — no backend change needed.

**Bug #7 — SHOP Step 5 shows MART categories**  
Root cause was two-fold and required a schema change:
  1. `SellerApplyWizard.jsx::StepCategories` was hard-coded to `/mart/categories`. Now uses `useSellerModule()` and calls `/shop/catalogue` when the seller portal is SHOP, normalising the tree to a list of `{id, name}` cards.
  2. Backend `supplier_category_interests.category_id` had a hard FK on `mart_categories` that rejected SHOP category IDs. Alembic migration `0046_sci_module` drops the FK and adds a `module` VARCHAR(8) discriminator + `ix_sci_supplier_module` index. The step-5 handler in `shared/suppliers/routes.py` now accepts `module` per item and looks up in the right table (MartCategory vs ShopCategory).

**Bug #8 — Seller Apply document upload asks for a URL**  
New public upload endpoints in `shared/suppliers/routes.py`:
  * `POST /api/martbaked/sellers/apply/{app_id}/uploads` (multipart, kind=document|image, max 8 MiB, PDF+image only, only draft/action_required apps).
  * `GET  /api/martbaked/sellers/apply/{app_id}/files/{path:path}` (public preview by opaque timestamped path).
New reusable `ApplyFileUpload` component in `SellerApplyWizard.jsx` renders "Choose file" + preview link + Replace + clear. Wired into Step 8 (Documents) *and* Step 3 (Owner ID document) — both now accept real files instead of paste-a-URL.

**Testing** — `testing_agent iter79`: 10/10 backend pytests + 8/8 UI bug verifications + 3/3 regression checks (MART home, SHOP admin, guest cart) all PASS.

**Deferred security follow-ups** (raised by testing agent — worth tracking): (a) rate-limit the public `/apply/{id}/uploads` endpoint per-IP; (b) switch to signed URLs for submitted apps' file-serve so post-submit PII stops being retrievable from an opaque path alone.




## 2026-03-03 — SHOP Admin Surface Phase 2 (Catalog + Attributes + Approvals + Products) — COMPLETE
Four SHOP-native admin pages plus the backend endpoints that back them.

- **Backend `modules/shop/routes.py`** — added full CRUD:
  * `GET/POST/PATCH/DELETE /admin/modules/shop/categories[/{id}]` — with sub-count preload and 409 guard when products still reference the row.
  * `GET/POST/PATCH/DELETE /admin/modules/shop/subcategories[/{id}]` — parent validation, unique slug per parent.
  * `GET/POST /admin/modules/shop/categories/{cat_id}/attributes` and `PATCH/DELETE /admin/modules/shop/assignments/{id}` — assign SHOP attribute definitions (from mart_attributes where module='shop') to shop_categories/shop_subcategories via shop_category_attributes with `is_required / customer_visible / supplier_editable / sort_order` toggles.
- **Backend `modules/mart_attributes/routes.py`** — added optional `module` query filter to `GET /admin/mart/attributes` and `module` field to `AttributeIn` so SHOP-scoped definitions live in the same table without polluting MART's list.
- **Frontend** — four new pages, all module-accent amber:
  * `AdminShopCatalog.jsx` (`/admin/modules/shop/catalog`) — split-pane categories + sub-categories editor with search, image thumbnails, add/edit modal, delete-with-confirm.
  * `AdminShopAttributes.jsx` (`/admin/modules/shop/attributes`) — left pane definitions (create/soft-delete) + right pane assignments per category/sub-cat scope with inline toggle chips.
  * `AdminShopProductApprovals.jsx` (`/admin/modules/shop/approvals`) — 3-bucket queue with select-all + bulk approve/reject, per-product detail drawer showing images/variants/meta, notes-required rejection guard.
  * `AdminShopProducts.jsx` (`/admin/modules/shop/products`) — read-only browser with country/status/search filters + storefront preview link.
- **Frontend `AdminApp.jsx`** — introduced `CatalogSwitch / AttributesSwitch / ApprovalsSwitch / ProductsSwitch` wrappers that read the workspace `:code` outlet context and mount the MART or SHOP-native component. Zero route reshuffle needed.
- **Frontend `ModuleWorkspace.jsx`** — un-gated `products / catalog / attributes / approvals` so SHOP admins now see them. `category-requests / inventory / purchase-orders / invoices / suppliers/product-requests` remain MART-only.
- **Testing** — new pytest file `/app/backend/tests/test_shop_admin_phase2.py` (13 tests, all pass). Testing agent iteration 78: 12/12 UI end-to-end scenarios PASS, MART side untouched.




## 2026-03-03 — SHOP Admin Surface Phase 1 — COMPLETE
First slice of the SHOP admin console: expose the existing Suppliers governance flow inside the SHOP module workspace without duplicating any code.

- **Backend** — `GET /api/admin/modules/mart/suppliers/applications` gained an optional `module` query filter that matches on `Supplier.modules ? '<MODULE>'` (JSONB single-element containment). Bucket counts also honour the filter so the SHOP queue is fully scoped. Router prefix unchanged (backwards-compatible with existing MART bookmarks/integrations).
- **Frontend `AdminSupplierApplications.jsx`** — accepts a new `module` prop (default `"mart"`), passes `module=<MOD>.toUpperCase()` on every list query, and re-labels the header + colour token (green for MART, amber for SHOP).
- **Frontend `AdminSuppliersShell.jsx`** — reads the module code from the workspace outlet context, propagates it down, and hides the MART-specific "Product Requests" tab under SHOP (that flow depends on the MART master-product model and needs a SHOP-native version — see Phase 2).
- **Frontend `ModuleWorkspace.jsx`** — dropped `martOnly:true` on the `suppliers` entry so SHOP admins finally see a "Suppliers" tab in `/admin/modules/shop`. The rest of the MART-heavy entries (Catalog/Attributes/Approvals/Category Requests/Product Requests/Inventory/Purchase Orders/Invoices) remain MART-only pending Phase 2.
- **DB touch-up** — flipped `sup_demo_delta_seed.modules` from `["MART"]` → `["MART","SHOP"]` so the SHOP admin queue has real data to demo (matches the seed intent from the handoff summary).
- Verified live: `/admin/modules/shop/suppliers` renders "SHOPbakēd · Suppliers" with amber tint, Approved bucket shows DEMO Delta Beverages, Product Requests tab hidden. MART side untouched (`/admin/modules/mart/suppliers` still shows both tabs and only MART-tagged suppliers).




## 2026-03-02 — Guest MART Card Snapshot — COMPLETE
Mirror of the SHOP guest-cart pattern for MART lines so the cart drawer/page can render offline.

- `contexts/BakedContexts.jsx::addItem` — MART guest add now captures a full snapshot at add-time: `{id, name, unit, image, brand, price, currency, currency_symbol, was_price, compare_at_price, original_price, master_price, is_stocked_locally}`. All three callers (`components/mart/ProductCard.jsx`, `pages/ProductDetailPage.jsx`, `pages/mobile/MobileProductDetail.jsx`) already pass the full product object → zero call-site changes needed.
- `contexts/BakedContexts.jsx::hydrateGuest` — MART branch prefers `snapshot` when present, falls back to `GET /api/mart/products/{id}` only for legacy guest entries added before this change (backward-compat, no cart is stranded after the upgrade).
- Verified live: guest adds "Banane Cavendish", opens `/cart` — **0** `/api/mart/products/{id}` fetches during hydrate; the cart row, subtotal, delivery, min-order warning, and "Login to Proceed" CTA all render straight from localStorage.




## 2026-03-02 — Guest Cart + Login-at-Checkout (Fixing_Prompt guest_cart) — COMPLETE
Full behaviour change requested via Fixing_Prompt.docx: customers must be able to shop, add to cart, view cart and mutate quantities without any login prompt. Login is deferred to the "Proceed to Checkout" step. Applies to both SHOPbakēd and MARTbakēd; MART guest cart already existed, SHOP was the gap.

- **`contexts/BakedContexts.jsx` — CartProvider extended**
  * `hydrateGuest` now hydrates BOTH modules: MART entries fetch `/mart/products/{id}` (unchanged), SHOP entries render from the `snapshot` object captured at add-time (`title, image, price, compare_at_price, currency, sku, variant_attributes`) so no per-load network round-trip is required.
  * New `mergeGuestIntoServer` — on the null→customer edge (fresh login) each guest line is replayed via `POST /api/shop/cart/items` or `POST /api/carts/me/items`. Both endpoints upsert on duplicate ⇒ natural quantity merge. Guest localStorage cleared to `{items:[]}` on success.
  * `addShopVariant(variantId, qty, snapshot?)` — dropped the `if (!customer) throw` guard. Guest path writes `{ id:"gs_<variantId>", module:"shop", variant_id, product_id, quantity, snapshot }` to `baked_guest_cart`.
  * `prevCustomerId` ref tracks auth transitions so the merge fires exactly once per login (never on every hot-reload or refresh).
- **`apps/shopbaked/pages/ShopHome.jsx::ProductCard`** — `addToCart` now routes through `useCart().addShopVariant(...)` with a full product snapshot. Removed the raw `api.post("/shop/cart/items")` call and the 401 → "Please sign in to add to cart" toast.
- **`apps/shopbaked/pages/ShopProduct.jsx`** — PDP `addToCart` now guest-friendly: no `!customer` early-return, snapshots the active variant SKU/attributes into the guest cart.
- **`pages/CartPage.jsx`** — `doCheckout` gates guests with `openLogin("/checkout")` (never blocks). Checkout button label switches to `"Login to Proceed"` when logged out; only disabled for authed users when min-order or unavailable-items rules fail.
- **`pages/mobile/MobileCart.jsx`** — Same gate + label swap on the sticky bottom CTA (`"Login to Proceed"` guest / `"Checkout"` authed).
- Reused the existing `openLogin(target)` → `sessionStorage.baked_post_login` → `loginWithToken` auto-redirect plumbing for the checkout-intent state (Fixing_Prompt §12). No new auth architecture introduced.
- Tested end-to-end via `testing_agent iter77`: all 10 acceptance tests PASS on desktop 1920 + mobile 390. Guest add, multi-add, qty stepper, refresh persistence, cancel-login, cart merge (guest+server via upsert), authed regression, and PDP add-to-cart all green.




## 2026-03-02 — SHOP Product Carousel: single-row horizontal scroll — COMPLETE
- `ProductCarouselSection` (`apps/shopbaked/pages/ShopHome.jsx`) refactored from a wrapping responsive grid into a single-row horizontal scroll rail with snap points, matching the "Fresh drops" Fixing_Prompt behaviour.
- Cards-per-viewport: mobile 2 (`basis-[46%]`), tablet 3, laptop 4, desktop ≥xl 5. All extra items remain in the same row and are revealed via swipe (touch) or hover-fade prev/next chevrons (pointer).
- Applies to every CMS section with `section_type: product_carousel` automatically — no admin action needed.
- `View all` unchanged; still deep-links to `section.config.view_all_link` or `/shop/categories`.
- data-testid renamed rail → `shopbaked-product-carousel-rail`; added `shopbaked-carousel-prev` / `shopbaked-carousel-next`. Verified live at 1920×900 and 390×800.




## 2026-03-02 — Driver OTP wired to Twilio SMS (was mocked) — COMPLETE
- `POST /api/driver/auth/request-otp` now calls `core.providers.otp_provider.get_otp_provider().send_code(phone, code, locale)` — the same integration path already used by customer login (`shared/auth/routes.py`) and supplier onboarding (`shared/suppliers/routes.py`).
- Previously the endpoint only generated the code + printed it to the backend log — no SMS was ever dispatched, which is why baked.ci `/driver/login` never received a text.
- Provider selection remains env-driven (`OTP_PROVIDER=twilio` uses `TwilioSmsProvider` with `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_PHONE`). Preview env still falls back to dev-echo and surfaces `dev_hint` when `APP_ENV != production`.
- Locale routing: `country == "CI"` sends the French SMS body; every other country gets the English body — matches the customer OTP behaviour.
- Verified in preview: `curl POST /api/driver/auth/request-otp {phone_e164:"+919990004321", country:"IN"}` returned `{otp_id, dev_hint:"098126"}` and the backend log confirmed `otp.dev_send` provider dispatch.




## 2026-03-01 — SHOPbakēd Seller Routes + Sell-on-BAKĒD Link — COMPLETE
- New route `/shopbaked/sellers/*` in `App.js` mounts `<SellerApp module="shop" />` — reuses the entire MART seller flow (landing / apply wizard / login / activate / application-status) with a SHOP-branded skin. No component duplication.
- `SellerApp.jsx` gained a `SellerModuleContext` + `SELLER_MODULE_PROFILES` registry keyed on `mart | shop`. Each profile carries `{code, label, accent, basePath, tagline, hero_desc, code_prefix}` so nested components read the right module without extra prop threading.
- Injected the module's accent as a scoped CSS custom-property override (`--pl-accent`, `--pl-accent-soft`) on the SellerApp root, so the entire partner-landing stylesheet re-tints without a stylesheet fork. Also swaps `<title>` to "SHOPbakēd Sellers — Grow with BAKĒD".
- `SellerHeader`, `SellerFooter`, `SellerLanding` (hero copy, CTAs, "Check my application status" link) all consume `useSellerModule()` and drive their links off `mod.basePath`.
- `PartnerLandingApp.jsx` SHOPbakēd card recoloured to SHOP amber `#FCC44C` and rewired: `cardHref: "/shopbaked/sellers"`, `applyHref: "/shopbaked/sellers/apply"`, `internal: true` (no more external `shop.partner.baked.ci`). Outer atom + card gradients + copy all module-consistent.
- Seller data model is intentionally unified — Supplier records still live under `/api/suppliers`, so a seller who applied via `/shopbaked/sellers/apply` and gets approved lands in the same `/martbaked/{slug}/portal/...` post-login. Their `modules[]` array gates the SHOP tab there (already implemented iter71).
- Verified: `/shopbaked/sellers` shows "Become a SHOPbakēd Seller." with amber CTAs; `/shopbaked/sellers/login` shows the amber Sign in button and "SHOPbakēd Seller Program" footer; `/Sell-on-baked` SHOPbakēd card is now amber and routes internally to /shopbaked/sellers.



## 2026-03-01 — SHOP Hero Inline Editor (Fixing_Prompt v12) — COMPLETE
- Extended the existing schema-driven `SectionEditor` in `pages/admin/AdminHomepageManagement.jsx` with two new field kinds — `group` (nested object) and `bool` (checkbox) — and a schema-level `tabs` option so section types can split their config across multiple focused surfaces.
- Hero schema now declares 4 tabs: **Basics**, **Slides**, **Right Banners**, **USP Strip**. Each maps to the exact JSONB slices the frontend renderer already consumes (`slides[]`, `right_top`, `right_bottom`, `usp[]`) — zero new endpoints.
- `_SLIDE_FIELDS` / `_PROMO_FIELDS` / `_USP_FIELDS` builder constants give admins per-item form controls (eyebrow, headline, description, image w/ upload, badge, primary + secondary CTAs; enabled toggle for right banners; icon key + title + subtitle for USP tiles).
- `setGroupField` state helper handles nested `config[groupName][subField]` writes so `right_top`/`right_bottom` edits round-trip through the existing PATCH endpoint intact.
- data-testids added: `hp-editor-tab-{basics|slides|right|usp}`, `hp-editor-group-right_top`, `hp-editor-group-right_bottom`, `hp-editor-list-item-slides-{i}`, `hp-editor-list-item-usp-{i}`, `hp-editor-list-add-{name}`.
- Verified in the deployed admin UI on desktop 1440: all 4 tabs render, slides list shows 3 pre-seeded entries with image previews + Upload buttons, right banners show the two grouped forms with Enabled checkboxes, USP shows 4 tiles.



## 2026-03-01 — SHOP Hero Carousel + Right Promos + USP Strip (Fixing_Prompt v11) — COMPLETE
Redesigned the SHOPbakēd homepage hero per Fixing_Prompt v11:

- **Data model — reused existing CMS** (`HomepageSection` config JSONB, no schema change). Seeded `hps_ci_shop_010_hero.config` with:
  * `slides[]` — array of {eyebrow, headline, description, image, badge, cta_label/cta_link, secondary_cta_label/secondary_cta_link}
  * `right_top` + `right_bottom` — {enabled, image, label, heading, description, cta_label, cta_link, badge}
  * `usp[]` — 4 tiles {icon, title, subtitle}: Vetted sellers · Same-day CI · Fresh drops · Affordable Pricing
  All editable from existing `/admin/homepage-management`. No hard-coded frontend content.
- **Frontend rewrite** (`apps/shopbaked/pages/ShopHome.jsx::HeroSection`):
  * Grid `lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]` — LEFT carousel + RIGHT stacked promos (hidden `< lg` for mobile).
  * `HeroCarousel` — auto-rotates every 5.5s, pauses on hover, touch swipe on mobile, keyboard-accessible indicators, staggered opacity transitions, per-slide badge/eyebrow/secondary CTA support. First slide `loading=eager`, rest lazy per spec §12.
  * `RightPromo` — image-cover card with optional badge, label, heading, description, amber CTA button.
  * `UspTile` — icon-mapped tiles (`shield/truck/sparkles/tag` → lucide icons). Row hidden below `lg` per spec §9.
  * Falls back to legacy single-hero fields (`cfg.background_image/cta_label/…`) when `slides[]` is absent for older seeds.
- data-testids: `shopbaked-hero-carousel`, `shopbaked-hero-slide-{i}`, `shopbaked-hero-cta-{i}`, `shopbaked-hero-dot-{i}`, `shopbaked-hero-right-top`, `shopbaked-hero-right-bottom`, `shopbaked-hero-usp`, `shopbaked-hero-indicators`.
- Verified: Desktop 1440 shows carousel + 2 right promos + 4 USP tiles + 3 pagination dots. Mobile 390 shows carousel only (`right_top_visible=False, usp_visible=False`).



## 2026-03-01 — SHOP Card/Image/Zoom/Filters (Fixing_Prompt v10) — COMPLETE
Four asks shipped:

- **§1 MART-style product cards** (`apps/shopbaked/pages/ShopHome.jsx::ProductCard`): image | name | important spec | price (+ strike-through + % off badge) | amber `+` add-to-cart button. Add button posts `/api/shop/cart/items` for the cheapest active variant without navigating. `data-testid=shopbaked-card-add-{id}`.
- **§2 Realistic per-theme images**: rewrote `modules/shop/demo_products_seed.py::_keyword_image` with a 40+ theme bank of direct Unsplash CDN URLs (dresses, menswear, sneakers, headphones, watches, sofas, etc.) + slug→theme lookup with fuzzy fallback. Backend enriched public products endpoint to include `min_price`, `compare_at_price`, `currency`, `first_variant_id`, `variant_attributes`, `variant_count` from cheapest active variant. Backfilled all 181 products + 362 variants.
- **§3 PDP image zoomer** (`apps/shopbaked/pages/ShopProduct.jsx::ProductImageZoom`): MART-parity hover-zoom (2.2× scale, transform-origin follows pointer, "Hover to zoom" affordance, disabled on `pointer: coarse` touch devices which have native pinch).
- **§4 Category filter drawer** (`apps/shopbaked/pages/ShopCategory.jsx::FilterDrawer`): right-side sheet with Max Price slider + Brand / Colour / Size facet chips (chip counts + toggle state). Trigger from new `SlidersHorizontal` icon in header; badge shows active filter count. `data-testids`: `shopbaked-category-filters`, `shopbaked-filters-drawer`, `shopbaked-filter-price`, `shopbaked-facet-{brand|colour|size}-{val}`, `shopbaked-filters-apply`, `shopbaked-filters-clear`.
- Smoke-verified on desktop 1440: /shop/c/mode-femme renders realistic dress + fashion imagery, cards show price/spec/`+` button, filter drawer opens, PDP image zooms on hover.



## 2026-03-01 — SHOP Product Grid Responsive Columns — COMPLETE
Per user spec (mobile: 2 / laptop: 4 / desktop: 5):
- `ShopCategory` product grid → `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`.
- `ShopHome` ProductCarousel `≥ sm` fallback grid → `sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` (mobile still uses the 2-up snap-scroll rail).
- Verified: 1440×900 shows 5 cards per row on /shop/c/mode-femme; 390×844 shows 2 cards per row.



## 2026-03-01 — SHOP Categories responsive grid — COMPLETE
- `ShopCategoriesIndex.jsx` grid → `grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6 md:gap-4` — mobile keeps its 3-up layout, tablet is 4, desktop shows 6 tiles per row per user spec. Verified at 1440×900 → 19 tiles render in a clean 6-column layout.



## 2026-03-01 — SHOP Demo Products (Fixing_Prompt v8) — COMPLETE
Populated every SHOP subcategory with a placeholder product so the storefront isn't empty before real sellers list inventory:

- **New idempotent seed** `modules/shop/demo_products_seed.py` — one demo product per subcategory (181 rows total across 19 categories), each with 2 variants (362 variants) covering colour/size/capacity attribute overrides.
- Uses Unsplash placeholder images from a per-category bank (fashion / apparel / electronics / home / etc.) so tile visuals stay on-theme.
- Products carry `status='active'` (matches the public storefront endpoint filter `status == 'active'`), attached to the demo supplier `sup_demo_delta_seed`.
- Deterministic ids (`shpprd_demo_{sub_slug}`, `shpvar_demo_{sub_slug}_{idx}`) so re-seeds skip existing rows and never touch real seller listings.
- Wired into `run_seed()` after homepage seed. Backfilled existing rows via one-off SQL to flip `published → active`.
- Verified: `/shop` Fresh drops rail now shows 2-up horizontal cards with real images; `/shop/c/mode-femme` shows 12 populated products across sub-categories with Mode Femme-appropriate imagery, left subcategory rail, and "Fresh drops in Mode Femme" promo strip.



## 2026-03-01 — SHOP Home Carousels + Category Landing Parity (Fixing_Prompt v7) — COMPLETE
User asked for "view all" links, a 2-up horizontal product rail, and MART-style category landing:

- **ProductCarouselSection** (`ShopHome.jsx`): mobile now renders a horizontal snap-scroll rail (`sm:hidden overflow-x-auto snap-x`) showing ~2 product cards per screen; `≥ sm` falls back to the existing 2/3/4-col grid. "N live" counter replaced with an amber "View all →" link (`shopbaked-carousel-view-all`) that deep-links to `section.config.view_all_link || /shop/categories` so admins can retarget the CTA per rail.
- **CategoryGridSection** (`ShopHome.jsx`): "N tiles" counter replaced with an amber "View all →" link (`shopbaked-category-view-all`) → `/shop/categories`.
- **ShopCategory** rewrite (`apps/shopbaked/pages/ShopCategory.jsx`): full parity with MART's Blinkit-style detail page — back button + category title + layout toggle (grid/list) header row, in-page search box, LEFT vertical subcategory rail (with icons) + RIGHT 2-col product grid. SHOP amber accent (#FCC44C) instead of MART green. Uses `/shop/products?category&subcategory` and `/shop/catalogue` for data.
- data-testids preserved: `shopbaked-category-back`, `shopbaked-category-search`, `shopbaked-sub-rail`, `shopbaked-sub-all`, `shopbaked-sub-{slug}`, `shopbaked-category-grid`, `shopbaked-category-empty`.
- Smoke-verified on mobile 390×844.



## 2026-03-01 — SHOPbakēd Mobile Header + 3-Column Categories (Fixing_Prompt v6) — COMPLETE
User-reported parity gap with MART mobile layout:

- **§Header missing on /shop**: `MobileShell.jsx` didn't include `/shop*` routes in `showHeader`. Fixed by extending `isHome`, `isCategory`, `isProduct`, `isCheckout`, `isOrder` route matchers to also match SHOP paths (`/shop`, `/shop/categories`, `/shop/c/*`, `/shop/p/*`, `/shop/checkout`, `/shop/order/*`). Header now renders on every SHOP screen.
- **§Header branding**: `MobileHeader.jsx` reads `activeModule` from `useApp()` and drives the notification bell tint/dot + drawer link icons + search-bar target from `MODULES[activeModule].color`. On /shop everything paints SHOP amber (#FCC44C); on / back to MART green (#77BC1F).
- **§3 tiles/row on mobile**: `ShopHome.jsx` `CategoryGridSection` grid changed to `grid-cols-3 md:grid-cols-4 lg:grid-cols-6` (was single-column below `sm`). `ShopCategoriesIndex.jsx` grid changed to `grid-cols-3` with tighter tile sizing (aspect-square + text-[11px]). Matches MART's 3-per-row mobile pattern.
- Verified on 390×844 viewport: header renders, bell/map pin amber, ShopHome category rail 3-per-row, /shop/categories 3-per-row.



## 2026-03-01 — SHOPbakēd Module Context / Navigation / Branding (Fixing_Prompt v5) — COMPLETE
Fixed the mobile SHOPbakēd "context leak" reported with 3 screenshots:

- **§3 / §6 Bottom nav is module-aware**: `MobileBottomNav.jsx` reads `activeModule` from `useApp()` and resolves Home/Categories destinations via a HOME/CATS route table (`mart→/, shop→/shop, shop→/shop/categories, …`). Active-tint pulled from the `MODULES` registry (SHOP amber #FCC44C, MART green #77BC1F, etc.) plus a matching FAB gradient. Cart + Profile tabs stay MART green — they're global infrastructure.
- **§2 New SHOP Categories page**: `apps/shopbaked/pages/ShopCategoriesIndex.jsx` at `/shop/categories` fetches `/api/shop/catalogue?country=CI` and renders the full SHOP tree (Mode Femme, Mode Homme, Shoes & Sneakers, Electronics, Home, …) — 19 tiles rendered on preview DB. Zero MART leak.
- **§1 App-selector shows active module**: `AppSelectorSheet.jsx` now reads `activeModule` and paints an "Active" chip + thicker tinted border on the currently-selected card (testid `m-app-selector-current-{code}`). Swaps live when the user switches modules.
- **§9 Cart cross-module regression**: unchanged — iter71 fix stands. Verified in testing agent iter75 (add MART then SHOP → both persist through module switches).
- Testing agent iter75 — Tests A / B / C all PASS on mobile 420×900. Zero critical issues. Minor testid alias added for cross-viewport spec parity (`data-cart-module-badge` on the mobile cart line).



## 2026-03-01 — SHOP Delivery PIN SMS + E.164 Fix — COMPLETE
- **PIN SMS wiring**: `POST /api/shop/checkout` now fires `send_sms(customer.phone, body, tag='shop_delivery_pin')` after commit inside a try/except — order flow never fails if SMS hiccups. Response gains a `delivery_pin_sms: {attempted, delivered, channel, phone}` object so the UI can toast the customer's inbox. Reuses the existing pluggable `sms_provider` (dev logs / Twilio in prod).
- **Frontend toasts**: `CheckoutPage.jsx` + `MobileCheckout.jsx` — after a SHOP order succeeds, toast "Delivery PIN sent to +…" when `delivered=true`, else "Delivery PIN is on your order page". `ShopOrderConfirmation` PIN card gains "Also sent by SMS to your registered phone" caption.
- **E.164 normalisation bug (BLOCKER for real Twilio)**: iter74 testing agent found `_e164()` in `shared/auth/routes.py` + `shared/suppliers/routes.py` was concatenating raw ISO2 country_code producing malformed `+CI2250700...` phones. Fixed with a shared `core/utils/phone.py::to_e164` that:
  - accepts either ISO2 (`CI`) → dial code via `ISO2_TO_DIAL` map (CI/LR/GH/NG/SN/BJ/TG/BF/ML/GN/CM/IN/US/GB/FR/CA), or `+225`/`225`
  - trusts client-provided `+…` phones as-is
  - guards against double-prefixing when digits already start with the dial code
- **Data backfill**: repaired 16 malformed `+XX...` phone rows across `customers`, `supplier_applications`, `suppliers`.
- Testing agent iter74 — 10/10 backend pytest + full Playwright pass. Zero critical issues remaining (the E.164 blocker was fixed post-report).



## 2026-03-01 — SHOP Delivery Lifecycle + PIN-Gated Handoff — COMPLETE
Full SHOP fulfilment flow now green:

- **Migration 0045** adds `delivery_pin` (varchar 6), `delivery_pin_attempts` (int), `delivered_at` (timestamptz) to `shop_orders`.
- **Backend**: `POST /shop/checkout` mints a `secrets.randbelow(1_000_000)` 6-digit PIN, stored on the order and returned only to the customer via `/shop/orders/me` + `/shop/orders/{id}` (`expose_pin=True` flag in `_order_dict`). Seller-facing `_seller_order_dict` NEVER surfaces the PIN.
- **Seller portal endpoints** (`/app/backend/modules/shop/portal_routes.py`): `GET /shop/portal/orders` (with buckets), `GET /shop/portal/orders/{id}`, `POST /shop/portal/orders/{id}/status` (Pydantic pattern `packing|shipped` — `delivered` intentionally rejected), `POST /shop/portal/orders/{id}/deliver` (constant-time `secrets.compare_digest` PIN check + 5-attempt brute-force lock, idempotent on already-delivered).
- **SA override** (`/app/backend/modules/shop/routes.py`): `POST /admin/modules/shop/orders/{id}/status` accepts any of `pending_payment|paid|packing|shipped|delivered|cancelled|refunded`; auto-stamps `delivered_at` when SA flips to delivered.
- **Frontend**:
  - `apps/shopbaked/pages/ShopCheckout.jsx` ShopOrderConfirmation shows a big amber PIN card (`shopbaked-order-pin-card` / `shopbaked-order-pin`) when status ∈ {paid, packing, shipped}; swaps to a green Delivered banner with `delivered_at` timestamp on completion.
  - `pages/mobile/MobileActivities.jsx` — status pill green (#77BC1F) when SHOP order is `shipped` or `delivered` (MART unchanged: only delivered = green). Added `data-testid="m-act-ord-status-{id}"`. Reads `?tab=orders` deep-link from URL.
  - New `apps/martbaked-sellers/portal/PortalShopOrders.jsx` — bucket bar (paid → packing → shipped → delivered → cancelled), row detail drawer with `Start packing`/`Mark shipped` actions and PIN input for delivery.
- **Seed**: `sup_demo_delta_seed` now populates `seller_slug='delta'` so `/martbaked/delta/portal/shop-orders` resolves on fresh installs. Backfilled on the existing row.
- Testing agent iter73 — 19/19 backend tests + full Playwright pass. Zero critical issues.



## 2026-03-01 — Order History Merge (MART + SHOP) — COMPLETE
- `MobileActivities.jsx` (which DesktopProfileShell also renders) now Promise.all's `/api/orders/me` (MART/FOOD) + `/api/shop/orders/me`. SHOP orders are normalised with `normaliseShopOrder()` (snapshot.lines → items[], delivery_address → address) and merged in place, sorted by created_at desc.
- Filter chips are module-aware: ALL/MART green (#77BC1F), SHOP amber (#FCC44C), FOOD orange (#FF7043).
- Row click is module-aware: SHOP → `/shop/order/{id}` (ShopOrderConfirmation), MART/FOOD → `/orders/{id}`.
- Both endpoints have independent `.catch(() => [])`, so one transient 500 never hides the other module's orders.
- Testing agent iter72 — 3/3 backend contract tests + all Playwright bullets green. Zero action items.



## 2026-03-01 — SHOPbakēd Fixing_Prompt v3 (Homepage / Images / Branding / Global Cart) — COMPLETE
Four P0 issues from customer's v3 fixing prompt resolved:

- **§4 CRITICAL global-cart bug**: SHOP → MART flow was silently wiping SHOP lines. Root cause in `contexts/BakedContexts.jsx` `CartProvider.addItem` — it called `setCart(martOnlyResponse)`, replacing the merged (MART + SHOP) state. Fixed by switching to `await load()` (which re-fetches both `/carts/me` + `/shop/cart/me` and rebuilds the merged shape). Same `await load()` pattern applied to `clear()`.
- **§1 Homepage Management not reflected**: Rewrote `apps/shopbaked/pages/ShopHome.jsx` with a full renderer registry for every section type (`hero`, `category_grid`, `product_carousel`, `promotional_banner`, `banner_trio` — the missing one that caused "Explore our latest collection" to vanish — `brand_carousel`, `cta_strip`). Storefront is now 100% CMS-driven from `/api/homepage?country=CI&module=shop`. Empty state (`shopbaked-home-empty`) points admin to `/admin/homepage-management` when no sections are enabled.
- **§2 Uploaded images not rendering**: Added `abs()` resolver in ShopHome that prefixes `/api/homepage/uploads/…` relative URLs with `REACT_APP_BACKEND_URL`. Applied to hero.background_image, category.image, banner.image, brand.image, and product cards. Mirrors the working MART implementation in `ConfigHomepage.jsx`.
- **§3 Branding accent leaking across modules**: Cart icon + badge (TopNav.jsx), AI Sparkles icon (TopNav.jsx), and delivery MapPin (AddressPill.jsx) now derive their colour from `useApp().activeModule` via the `MODULES` registry. Route change → `ModuleTabs` mount-effect syncs `activeModule` → all three icons flip green ↔ amber ↔ next module colour with no FOUC after hard refresh.
- Testing agent iter71 — 13/13 backend + all Playwright bullets green. Zero action items.



## 2026-03-01 — SHOPbakēd Cart Integration Fixes (Fixing_Prompt.docx) — COMPLETE
Three P0 fixes shipped from customer's follow-up prompt with attached screenshots:

- **Issue 1 — "Coming soon" toast on SHOP switch**: `/app/frontend/src/lib/modules.js` — SHOP module status flipped from `coming_soon` → `active`. Fixes toast fire in `ModuleTabs.onTab` and re-enables the SHOP card in `AppSelectorSheet` (no more "Soon" chip).
- **Issue 2 — "Go to checkout →" CTA on /shop**: `/app/frontend/src/apps/shopbaked/pages/ShopHome.jsx` — removed the SHOP-specific top-right CTA. Cart access remains ONLY through the global header cart icon. `CartPage.doCheckout` and `MobileCart.goCheckout` now always route to `/checkout` (unified), never `/shop/checkout`.
- **Issue 3 — CRITICAL: SHOP add-to-cart succeeded but cart stayed empty**: `/app/frontend/src/apps/shopbaked/pages/ShopProduct.jsx` — `addToCart` was calling `api.post("/shop/cart/items", …)` directly, bypassing CartContext. Fixed to route through `useCart().addShopVariant(variantId, 1)` which posts + `await load()` refreshes the merged MART+SHOP cart. Result: nav cart badge (`top-nav-cart-count`) increments 0→1 immediately, `/cart` shows the SHOP line with `cart-module-badge-{id}='SHOP'` + variant attributes.
- Guest add-to-cart now opens the global sign-in dialog (`openLogin()`) instead of erroring silently.
- Testing agent iter70 — 9/9 Playwright bullets green (incl. persistence across refresh, module-switch, mixed cart, unified checkout). Backend regression 3/3.



## 2026-03-01 — SHOPbakēd Unified Cart Drawer + Mixed Checkout (COMPLETE)
- **Frontend-only iteration** — backend SHOP + MART cart/checkout endpoints unchanged (already isolated by design).
- `contexts/BakedContexts.jsx`: `CartProvider.load()` now `Promise.all`s `/carts/me` (MART) and `/shop/cart/me` (SHOP), merging into a single `cart.items` list with per-item `module` field. Exposes `cart.mart` / `cart.shop` sub-totals for the UI. Per-endpoint `.catch → empty` so one failing module never blanks the other.
- `pages/CartPage.jsx`: Each line renders a MART (green) / SHOP (amber) badge via `data-testid=cart-module-badge-{id}`. Order Summary splits into `cart-summary-mart-subtotal` + `cart-summary-shop-subtotal` when both modules present. **Min-order gate applies to MART only** (`minOrderOk = hasMart ? martEligible : true`). SHOP-only cart routes Checkout button to `/shop/checkout`; anything else routes to `/checkout`.
- `pages/mobile/MobileCart.jsx`: Same treatment, `m-cart-badge-{id}` per row, `goCheckout` mirrors desktop routing.
- `pages/CheckoutPage.jsx` + `pages/mobile/MobileCheckout.jsx`: `placeOrder` now places MART first, then SHOP (inner try/catch so SHOP failure surfaces a toast but preserves the MART receipt navigation). SHOP-only checkout routes to `/shop/order/{id}`.
- Testing agent iteration 69: 3/3 pytest (mixed carts stay independent, dual-checkout mints both orders, SHOP-only routes correctly), 5/5 Playwright review-request bullets green.



## 2026-02-24 — Social.docx Issue #16: Product card + button (COMPLETE)
- Restored / polished the tap-to-add `+` pill on customer product cards.
- Desktop `ProductCard.jsx`: replaced text `+ Add` with lucide Plus icon + 'Add', h-9 (36px), `active:scale-95`, `aria-label`.
- Mobile `MobileProductCard.jsx` row layout: added the missing Plus icon + bumped to h-9 (was h-6 text-only); `aria-label`.
- Mobile grid layout already had the Plus icon — added the missing `aria-label` for a11y consistency.
- Testing agent verified 60/60 product cards on desktop + mobile home carousel + mobile row toggle. Tap → cart badge increments, stepper replaces the pill; removing the last unit restores the pill (`/app/test_reports/iteration_60.json`).
- **Phase 5 (Website UX polish) is now fully shipped** — all of #12, #13, #14, #15, #16 are live.

## 2026-02-24 — Social.docx Issue #15: Word sweep / branding consistency (COMPLETE)
- Canonical: `BAKĒD` (uppercase + macron) and `MARTbakēd / SENDbakēd / SHOPbakēd / FOODbakēd / AUTObakēd / IMMObakēd`.
- Fixed user-visible copy in 9 spots:
  - Frontend: `SupplierInvoicesPage.jsx`, `BakedLogo.jsx` altBrand, `MobileOrderConfirmation.jsx`, `MobileRewards.jsx`, `DesktopProfileShell.jsx`, `MobileProfile.jsx`
  - Backend: `supplier_invoices/service.py` (audit actor labels), `purchase_orders/notifications.py` (email subjects + brand chip), `purchase_orders/grn.py` (PDF header + footer_note)
- Fixed 3 stale test assertions in `test_purchase_orders_phase4c_notifications.py` that hardcoded the old `[BAKED]` subject prefix.
- Left untouched (by design): asset URLs on the Emergent CDN (immutable filenames), the `BAKED_ENV` env var name, the `_make_ref_code` referral prefix (ASCII by design), and code comments.
- Repo-wide grep now returns ZERO visible-text violations of `MARTbaked`, `SENDbaked`, `baked Rewards`, or `[BAKED]`.

## 2026-02-24 — Social.docx Issue #14: Footer redesign v2 (COMPLETE — user-corrected spec)
- Rewrote to exact 4-section spec provided by user:
  - **Brand**: BAKĒD logo + Google Play + Apple App Store download buttons
  - **Useful links**: About us · FAQs · Blogs/News · Career
  - **Opportunities**: Partner with Baked · Sell on Baked · Delivery Partner · Invest with us
  - **Support**: Help Center · Contact Us · Terms & Conditions · Privacy Policy
- Clean single-line copyright bar underneath.
- Kept all existing correct URLs (/about /help /blog /careers /partner /Sell-on-baked /driver /invest /contact /terms /privacy).
- Store badges link to `play.google.com/store` and `apple.com/app-store/` — swap to real listings when live.

## 2026-02-24 — Social.docx Issue #14: Footer redesign v1 (SUPERSEDED)
- Brand column: logo + green Sparkles icon + brand promise ("Groceries, rides, deliveries and homes — one app for everyday Africa. Fast, fair, and unapologetically local.") + 5 social pills (Facebook / Instagram / Twitter / LinkedIn / YouTube) + mailto contact.
- Legal bar (row 2): copyright with current year, country flag + name, and 4 quick legal links (Terms / Privacy / Cookies / Accessibility).
- All existing `footer-link-*` testids preserved (no regression on Issue #12 links).
- Verified 28/29 desktop checks by testing agent (`/app/test_reports/iteration_58.json`). Mobile stacking is untestable in preview because `/terms` and `/privacy` switch to MobileShell — a shell/route decision, not a Footer bug.

## 2026-02-24 — Homepage CMS Phase A (COMPLETE)
- Backend: new `homepage_sections` table (`country`, `section_type`, JSONB `config`, `display_order`, `is_enabled`) + migration 0029. JSON config keeps future section types migration-free.
- Public route `GET /api/homepage?country=CI|IN` returns enabled sections ordered.
- Admin routes `GET/POST/PATCH/DELETE /api/admin/homepage-sections` + `PATCH /reorder`.
- Seeded 10 default sections × 2 countries (CI + IN): hero, module_switcher, category_grid, promotional_banner, product_carousel×2, banner_trio, brand_carousel, app_promotion, cta_strip.
- Admin UI `/admin/homepage-management` (new sidebar link, Home icon): country selector, table with order/status/actions, up/down reorder, enable/disable toggle, delete, and a **schema-driven editor drawer** — each section_type declares its fields in `SECTION_SCHEMAS`, so future types don't require rebuilding the editor.
- Customer homepage swapped to `ConfigHomepage.jsx` which fetches the config and renders 9 minimal per-type renderers. Empty-state points admins at `/admin/homepage-management`.
- Preserved MART/FOOD/SHOP/SEND/AUTO/IMMO module switcher (module_switcher section, ordered #2).
- Also fixed migration 0025 to seed IN country row before FK-dependent vehicle inserts (post-DB-reset resilience).

Phase B (editors polish + object-storage image uploads) and Phase C (Baked Mart PDF visual redesign, brand logos, QR codes, exact typography) to follow.

## 2026-02-24 — Issue #13 rework per user spec (COMPLETE)
- **Removed** Offers icon and Orders icon from TopNav (per user requirement).
- **Added** AI Assistant menu item ([data-testid="top-nav-ai-assistant"]) using green Sparkles icon → routes to `/ai-assistant`.
- **Converted** FR/EN pill switcher into a proper dropdown ([data-testid="top-nav-language-switcher"]) — trigger shows current locale (FR or EN) with chevron; opens a Popover with "FR — Français" / "EN — English" options.
- Kept everything else unchanged: Logo, Address, Country, Search, Account, Cart, Theme.
- Offers + Orders still exist as routes and in the mobile & desktop side drawers (AI Assistant added there too).
- Routes / pages / backend for Offers and Orders are untouched.

## 2026-02-24 — Social.docx Issue #13: Top header tightening (SUPERSEDED)
- Cart button: badge moved to top-right (`-top-1.5 -right-1.5`), amount `whitespace-nowrap` + only shown on `lg+`, `shrink-0` on the wrapper.
- Offers / Orders / Login collapsed from icon+label stacks into consistent icon-only 40×40 pill buttons on `md+`.
- Language switcher and Theme toggle hidden below `lg` (they duplicate what's in the drawer).
- Hamburger (`topnav-hamburger`) visible whenever below `lg` — one obvious escape hatch.
- Address pill hidden below `lg`; at `lg` uses a compact "Set address" label with `max-w-[140px]` (grows to 240px at `xl+`).
- Verified 100% by testing agent across 1440 / 1200 / 1024 / 820 / 700 (`/app/test_reports/iteration_57.json`).

## 2026-02-24 — Social.docx Issue #12: Mobile hamburger menu (COMPLETE)
- Root cause: `MobileHeader` had no hamburger/menu access and `TopNav` at small viewports crammed all desktop chrome into one overflowing row.
- Fix (MobileHeader): added a `Menu` icon button ([data-testid="m-header-menu"]) that opens a right-side Sheet drawer ([data-testid="m-header-drawer"]) with Auth block, 6 quick-nav items, Country switcher, FR/EN language pills, theme toggle, and Sign out.
- Fix (TopNav): hid country popover / offers / orders / account / language / theme on `<md` viewports and moved them into a mirrored drawer accessible via [data-testid="topnav-hamburger"].
- Auto-close on route change via `useEffect` watching `location.pathname + location.search`.
- Added `SheetDescription` (sr-only) to satisfy Radix a11y contract.
- Human-readable label fallbacks (`tOr()` helper) so missing i18n keys never leak.
- Verified 100% by testing agent across mobile 390×800, desktop 1280×800, and small-desktop 600×800 (`/app/test_reports/iteration_56.json`).

## 2026-02-24 — Social.docx Issue #7: Google Maps address picker on checkout (COMPLETE)
- Root cause: `CheckoutPage.jsx` used an inline text-only "Add address" form that produced addresses without lat/lng/place_id — deliveries relied on free-text strings only.
- Fix: removed the inline form entirely. `+ Add new address` now opens the existing shared `AddressSelector` (Google Places autocomplete + Advanced Marker map preview + serviceability + auto-save).
- `saveAddress(candidate)` callback POSTs the picked place (with `latitude`, `longitude`, `place_id`, `formatted_address`, `region`, `postal_code`, `instructions`) to `/customers/me/addresses` and auto-selects the new row.
- Each address row on checkout now shows a `📍 lat, lng` pin sub-line proving the coordinate is stored.
- Testing agent 100% E2E (real Google Places autocomplete succeeded in preview): 8/8 acceptance points + placed a real COD order and confirmed `address_snapshot` carries the coordinates end-to-end (`/app/test_reports/iteration_55.json`).

## 2026-02-24 — Social.docx Issue #6: Approved driver KYC loop-back (COMPLETE)
- Root cause: `NeedsAuth` on `/driver/kyc/*` routes allowed approved drivers to reach onboarding pages via bookmarks / back-button / stale links.
- Fix: new `NeedsKyc` guard in `DriverApp.jsx` — approved drivers are `<Navigate to="/driver/dashboard" replace />` before any KYC step renders.
- All 8 KYC routes (personal, id, licence, selfie, vehicle, bank, emergency, submitted) now use `NeedsKyc` instead of `NeedsAuth`.
- Pending / onboarding drivers still reach KYC screens as expected. Unauth users still bounce to `/driver/login`.
- Verified 100% frontend by testing agent (`/app/test_reports/iteration_54.json`).

## 2026-02-24 — Social.docx Issue #5: New driver admin queue (COMPLETE)
- Root cause: backend `/api/admin/drivers` endpoints existed but no frontend UI consumed them, so signed-up drivers were invisible to admins.
- New page `AdminDriverApplications.jsx` mounted at `/admin/driver-applications` with sidebar link (Bike icon) between Driver Payouts and Darkstore Approvals.
- Bucket tabs: onboarding · pending_review · approved · rejected · suspended (with live counts).
- Table with name/phone/country/vehicle/kyc_step/submitted/created + right-hand detail drawer showing Identity/KYC, Vehicle, Banking, Emergency contact, Location, Reviewer notes.
- Approve / Reject actions call existing backend endpoints (no backend changes needed).
- Guardrail: onboarding drivers show italic "hasn't submitted KYC yet — nothing to review" instead of approve/reject buttons.
- Seed data added (5 drivers across all buckets).
- Verified 10/10 pytest backend + 100% Playwright E2E (report `/app/test_reports/iteration_53.json`).

## 2026-02-24 — Social.docx Issue #9: Supplier ↔ Warehouse assignment (COMPLETE)
- New model `SupplierWarehouseAssignment` + migrations 0027 (table) & 0028 (relax audit CHECK constraint for two new actions).
- New admin routes under `/api/admin/modules/mart/suppliers/{sid}/warehouses`:
  - `GET`  — assignments + eligible warehouses (with `is_assigned` boolean)
  - `POST` — idempotent assign (re-POST updates existing row, avoids 409); enforces same-country; one-primary invariant maintained
  - `DELETE {warehouse_id}` — unassign (204)
- Every assign/unassign writes a `supplier_review_audit` row.
- Frontend: new `SupplierWarehousesCard` on the Admin Supplier Applications drawer, above 'Audit trail'. Renders empty state, eligible list with `Assign` buttons, assigned rows with `Make primary` / `Remove`.
- Verified 8/8 pytest backend + full Playwright E2E (report `/app/test_reports/iteration_52.json`).

## 2026-02-24 — Social.docx Issue #8: Pick location per order line (COMPLETE)
- New backend helper `_batch_primary_locations` batches Zone/Aisle/Rack/Shelf/Bin lookups in 5 IN-queries (no N+1).
- `GET /api/partner/orders` (list + detail) — each `items[]` now carries `pick_location` + `partner_product_id`.
- `GET /api/partner/picker/orders/{po_id}` — each `lines[]` carries `pick_location` **and** lines are sorted by walking order (zone → aisle → rack → shelf → bin, unassigned last).
- Frontend Orders page shows an accent-warm MapPin pill on each line ("Zone A · Aisle 01 · Rack R1 · Shelf S1 · Bin B01") or "No pick location — assign one under Products" fallback.
- Frontend Picker page shows a bordered accent-warm pill on each line, correctly sorted for shortest-walk picking.
- Bonus: Fixed a pre-existing routing bug in PickerPage.jsx where nav absolute paths were missing the module slug (now uses `portalBase` from `useModuleBase`).
- Verified 3/3 pytest backend + Playwright E2E (report `/app/test_reports/iteration_51.json`).

## 2026-02-24 — Social.docx Issue #4: Zone→Bin location mapping (COMPLETE)
- New backend table `warehouse_category_defaults` + migration `0026_warehouse_category_defaults.py`.
- New backend routes (mounted under `/api/partner/inventory/`):
  - `GET  /warehouse/{wh}/category-defaults` — list all MART categories + current zone/aisle mapping (null when unmapped).
  - `PUT  /warehouse/{wh}/category-defaults` — upsert `{category_slug, zone_id, aisle_id}`; passing both nulls deletes the row.
- `GET /api/partner/products` now returns `primary_location` per SKU (label, zone, aisle, rack, shelf, bin) using existing `PartnerProductLocation`.
- Frontend Warehouse page: new **Category → Zone defaults** section — one row per category with a zone `<select>` that persists via PUT.
- Frontend Products page: each row gains a **Location** button that opens a bin-picker modal (recursive tree of zones/aisles/racks/shelves/bins). Ops can assign, mark primary, or remove bin assignments. Row now shows the primary bin path in accent colour, or "No pick location set" when unassigned.
- Seed data: `wh_alpha_demo_seed` seeded with Zone A (Ambient) → Aisle 01 (Fruits) → Rack R1 → Shelf S1 → Bins B01/B02, plus Zone C (Cold Room). Banane Cavendish pre-assigned to Bin B01 (primary).
- Verified 5/5 pytest backend + Playwright E2E (report `/app/test_reports/iteration_50.json`); one URL-prefix bug caught and fixed.

## 2026-02-24 — Social.docx Issue #2: Category + Subcategory filters (COMPLETE)
- Added `<select>` category + subcategory dropdowns to the Partner Portal "Add Product from Master" modal (`ProductsPage.jsx`).
- Categories fetched from `GET /api/mart/categories?country=<partner.country>`; subcategories from `GET /api/mart/subcategories?country=…&category=<slug>`.
- Subcategory select is disabled until a category is picked (dependent enable).
- Backend `GET /api/partner/master-catalog` now accepts `category` and `subcategory` query params (already partially wired; re-verified after backend reload).
- Response now includes `subcategory_slug` on each item for future client-side chip labelling.
- Filter chips + Clear button surface active state; modal state resets on close.
- Verified 8/8 pytest backend + Playwright E2E (test_reports/iteration_49.json).

## 2026-02-24 — Social.docx Issue #1: Approved products visible in Darkstore Catalog (COMPLETE)
- Admin approval of a Darkstore-authored custom `PartnerProduct` now promotes it to `mart_products`, making it visible in every Darkstore's Master Catalog search.
- New Admin UI at `/admin/mart-partner-approvals`.

## 2026-02 — Social.docx Phase 4: Issues #10 + #11 (COMPLETE)
- #10: India (IN) vehicle configs in `express_vehicles` and delivery pricing.
- #11: SENDbakēd branding text sweep across marketing + product UI.

## 2026-02 — SENDbakēd Driver App — Slices 1-9 (COMPLETE)
- Full driver lifecycle: KYC, auth, jobs, wallet, live nav map, admin payout console, in-ride chat, public tracking page.
- Realtime WSS with interpolated live GPS, Redis Pub/Sub broker for multi-worker fan-out, Uvicorn `--workers 4` in supervisor.
- Pytest coverage: `backend/tests/test_pubsub_contract.py`, `test_multiworker_fanout.py`.

## Open — Social.docx Roadmap
### Phase 1 (Inventory) — ✅ COMPLETE
_(all four inventory issues shipped)_

### Phase 2 (Driver) — ✅ COMPLETE
_(both driver issues shipped)_

### Phase 3 (Customer / Location) — ✅ COMPLETE
_(#7 shipped — every checkout now uses the Google Maps picker)_

### Phase 5 (Website UX) — ✅ COMPLETE
_(all five UX polish issues shipped: #12 mobile menu, #13 top header, #14 footer, #15 word sweep, #16 product card + button)_

### Phase 7 — P2
- Analytics dashboard (Slice D)
- Return / Refund handling (Slice H)

### Phase 8 — P2
- Real Stripe payment gateway integration for Wallet & Checkout
