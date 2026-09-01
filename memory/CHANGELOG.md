# BAKĒD — Changelog (recent slices only; older detail lives in PRD.md)

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
