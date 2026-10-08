## 2026-02-05 (d) — Phase 4b Web Push wakes the partner's phone

### Shipped
- **VAPID keypair generated and stored** in `backend/.env` under
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_PEM_B64`, `VAPID_SUBJECT`.
- **DB migration 0066** adds `partner_push_subscriptions`
  (endpoint PK, restaurant_id FK, p256dh, auth, user_agent, created_at,
  last_notified_at) + an index on `restaurant_id`.
- **`modules/food/push.py`** — pywebpush-based dispatcher with:
  * `save_subscription` / `delete_subscription`
  * `_dispatch_to_restaurant` — fans out a VAPID-signed payload to every
    device, prunes HTTP 410/404 revoked endpoints, bumps `last_notified_at`.
  * `fire_and_forget(session_factory, rid, payload)` — scheduled onto the
    event loop so a slow push service never blocks the customer's HTTP
    response.
  * Payload builders `new_order_payload` / `new_reservation_payload`.
- **Order-create hook** — `POST /food/customer/orders` now fires
  `fire_and_forget` with `new_order_payload(detail)` right after the WS
  publish. Reservations hook is wired the same way via the builder.
- **New endpoints**:
  * `GET  /food/manage/{rid}/push/vapid-public-key` → `{public_key}`
  * `POST /food/manage/{rid}/push/subscribe        {endpoint, keys, user_agent}`
  * `POST /food/manage/{rid}/push/unsubscribe       {endpoint}`
  * `GET  /food/manage/{rid}/push/status            → {configured, subscriptions}`
- **Frontend**:
  * `/public/sw-partner-push.js` — narrow-scope service worker that
    renders `showNotification` on `push` events and focuses / opens
    `/partner/food/*` on `notificationclick`.
  * `components/PartnerPushOptIn.jsx` — a FR-first opt-in card on the
    dashboard. Handles permission prompt, SW registration, VAPID fetch,
    `PushManager.subscribe`, persistence, unsubscribe. Shows "N devices
    subscribed" and recoverable error states (denied / unconfigured /
    unsupported).
- **Dependencies**: `pywebpush==2.5.0` + `py-vapid==1.9.4` added to
  `backend/requirements.txt`.

### Verification
- Backend pytest: **67/67 PASS** (7 new push + 12 pause + 13 CMS +
  29 search + 6 min-order).
- Live preview: partner dashboard shows the new "Notifications sur le
  téléphone" card between the pause controls and the self-service panel.
  Service worker file served with correct `application/javascript` MIME.
- Idempotent `ON CONFLICT (endpoint) DO UPDATE` — re-subscribing the
  same device on every app boot is a no-op.


## 2026-02-05 (c) — Phase 4 Partner Dashboard & Notification Center

### Shipped
- **DB migration 0065** — `delivery_paused_until`, `pickup_paused_until`
  nullable TIMESTAMPTZ on `food_restaurants` (mirrors the existing
  `reservations_paused_until`).
- **Pause / resume endpoints** (`partner_router /food/manage/{rid}`):
  * `GET  /service-status`                  — read current pause state
  * `POST /pause   {service, minutes}`      — delivery / pickup / all; 0 = indefinite
  * `POST /resume  {service, minutes}`      — clear the pause (`service` scope)
  * `GET  /dashboard-stats`                 — orders_today / pending / ready /
    revenue_today / avg_prep_minutes / currency
  WS fan-out via `food.service.paused` / `food.service.resumed` so a
  pause on one partner device appears live on another.
- **Order gate** — `POST /food/customer/orders` returns HTTP 409
  `{code: service_paused, service, paused_until, message}` while the
  relevant service is paused. Pickup and delivery are independent so a
  partner can shut only delivery without stopping walk-ins.
- **Partner Pause card** — `components/PartnerPauseCard.jsx` with per-service
  preset chips (15 min · 30 min · 1 h · Until manual), live
  "Resumes in Xm Ys" countdown, FR-first.
- **Notification Center drawer** — `components/PartnerNotificationCenter.jsx`
  mirrors every WS frame into a 50-entry history kept in localStorage
  (zero schema cost). Bell with unread badge in the partner shell, mark
  all read on open, deep-link to the related entity on click.
- **Partner Dashboard upgrade** — live KPI strip reactive to the same WS
  `updatesVersion` the notification engine fires, so the stats refresh
  the instant a new order arrives.
- **Public restaurant payload** — `_restaurant_row` now carries
  `delivery_paused` / `pickup_paused` so the customer microsite can hide
  a paused service without an extra fetch.

### Verification
- Backend pytest: **60/60 PASS** (12 new pause/stats + 13 FOOD CMS +
  29 search + 6 min-order).
- Live smoke on preview URL: partner-kpi-strip, partner-pause-card
  (delivery + pickup), partner-notif-bell and partner-notif-drawer all
  render and function correctly for the qa-burger partner.


## 2026-02-05 (b) — FOOD CMS brought to full parity with MART

Follow-up to the earlier CMS wiring: the user asked for MART-style
behaviour where Super Admin truly owns every section (edit, add, reorder,
disable, delete) and nothing is hardcoded. Shipped:

- **`backend/modules/homepage/seed.py`** — added `seed_food_homepage()`
  which idempotently seeds 7 default FOOD sections per country (hero,
  categories, featured_restaurants, promos, cuisines, usps, testimonial).
  Insert-only-if-missing, deterministic ids (`hps_food_<cc>_<seq>_<type>`),
  bilingual FR/EN config stored under `*_fr` / `*_en` keys so admin edits
  survive restarts and never clash with admin-created rows (which use
  UUID-style ids).
- **`backend/seed.py`** — wired `seed_food_homepage()` into boot alongside
  the MART seed.
- **`frontend/.../FoodHome.jsx`** — removed the client-side
  `DEFAULT_SECTIONS` fallback. If admin deletes every row the page now
  renders an empty-state CTA pointing to the configurator — exactly
  mirroring MART behaviour. Admin truly owns everything.
- **`backend/tests/test_food_homepage_cms.py`** — +2 new tests covering
  the seeded stack (7 types per country) and deterministic-id contract.

Verification: 48/48 backend tests pass. Admin UI now shows 7 pre-populated
sections for CI and 7 for IN, each editable with bilingual title/subtitle,
rich config fields, Preview button, reorder arrows, enable/disable toggle
and confirmation on delete — identical UX to the MART homepage manager.


## 2026-02-05 — FOOD Homepage CMS wired end-to-end

### The bug
Super Admin's /admin/modules/food/homepage-management listed three
ENABLED rows (Best Deal Ever, Best Festive Offer, evryday) but NONE
of them rendered on the customer /food page. Two architectural flaws:

1. `FoodHome.jsx` built a `type → section` map (`sx[s.section_type] = s`)
   which collapsed duplicate `section_type` down to the last row and
   dropped every row that shared a type. The two `food_promos` rows
   became one — then the one with no `banners` config overwrote the
   one with content, so neither rendered.
2. The JSX layout was HARDCODED top-to-bottom. Admin ↑/↓ updated
   `display_order` in the DB but FoodHome never read it; the field
   was a cosmetic sort key for the admin table only.

### Fix shipped
- `frontend/src/apps/foodbaked/pages/FoodHome.jsx` — rewritten so
  layout is driven by `homepage.sections.sort(display_order).map(renderSection)`.
  Hero is pulled out and rendered first (always); every other row maps
  1:1 to a typed renderer (`PromoStrip`, `CategoryStrip`, `RestaurantCarousel`,
  `CuisineCarousel`, `USPGrid`, `TestimonialBanner`). Multiple rows of the
  same `section_type` render independently. When the CMS returns zero
  rows for a country, a `DEFAULT_SECTIONS` fallback keeps the live page
  populated so a fresh country install is never empty.
- Added `?preview_country=XX` query-string escape hatch so Super Admin
  can preview any country's homepage without flipping their location.
- `backend/core/models/homepage.py` — added `food_testimonial` to the
  section_type whitelist.
- `frontend/src/pages/admin/AdminHomepageManagement.jsx` — added
  bilingual title_fr / title_en / subtitle_fr / subtitle_en fields to
  every food_* schema (frontend already honours per-language fallback).
  Added a new `food_testimonial` schema and a 'Preview' button that
  opens `/food?preview_country=<cc>` in a new tab.
- `backend/tests/test_food_homepage_cms.py` — 11 new regression tests:
  duplicate-type preservation, display_order ordering, enabled filter,
  country/module isolation, config shape invariants.

### Verification
- Backend pytest: 46/46 PASS (11 new CMS + 29 search + 6 min-order).
- Frontend testing_agent (iteration_104): 12/12 PASS incl. admin reorder
  → customer render, enable/disable, add new section, delete safety
  prompt, bilingual testimonial, country isolation, preview link,
  global shell untouched.
- Zero duplicate hardcoded/CMS sections — FoodHome has no demo content
  that competes with CMS rows.


## 2026-02-05 — Checkout Integrity P0 (Subtotal=₹0 after login) + Min-Order Removed

### Root cause of the "₹527 cart → ₹0 subtotal after login" bug
`CheckoutPage.jsx` read `cart.mart?.subtotal` with a `??` fallback. After a
guest→auth transition, the client-side cart hydrator pulls MART from the
server (empty — guest items were FOOD) + SHOP from the server (empty) +
FOOD from localStorage (3 items worth ₹527). That left `cart.mart.subtotal
= 0` which is defined-but-zero, so `??` returned 0 instead of recomputing
from items. The same page also treated every non-SHOP item as MART, so
the FOOD rows were tagged "MART" in the Order Summary but their price
never hit `martSubtotal`. Divergence between the item list (₹527) and
the total (₹29 = delivery only) was baked in.

### Fixes shipped
- `frontend/src/pages/CheckoutPage.jsx` — totals are now derived directly
  from `cart.items`. One line-total helper (`lineTotal(i)`), three bucket
  filters (`martItems/shopItems/foodItems`), one subtotal per bucket, and
  the Total is always `subtotal + deliveryFee`. FOOD subtotal line
  rendered. FOOD chip (red) rendered on FOOD rows. `placeOrder()` now also
  posts `/api/food/customer/orders` per restaurant when the cart contains
  FOOD rows (mirrors the CartDrawer code path).
- `frontend/src/lib/checkout.js` + `backend/modules/mart/cart_rules.py` —
  BAKĒD v1.1: minimum-order rule REMOVED. The helpers still return the
  `min_order`/`shortfall`/`reason` fields for API-compat but
  `eligible === true` always and `shortfall === 0` always. UI warnings
  that depend on `!eligible` are now dead code (left in place so adding
  the rule back is one-line).
- `backend/modules/mart/orders.py` — removed the `HTTPException(400, ...)`
  that blocked carts below the threshold. Rewards redemption now caps at
  the full payable total rather than at `total - min_order`.
- `backend/tests/test_min_order_eligibility.py` — rewritten to assert the
  INVERSE of the old rule so any future regression that re-introduces a
  min-order gate fails loudly. Hardcoded product IDs replaced with a
  live-lookup fixture so the suite survives catalogue reseeds. **6/6 PASS.**

### Verification
- Backend pytest: 6/6 min-order + 29/29 search + 11/11 food tests PASS.
- Frontend testing_agent (iteration_103): P0 scenario reproduced live —
  guest in IN added FOOD items from Burger Hub, logged in via OTP, and
  /checkout showed: FOOD subtotal = ₹328, Subtotal = ₹328, Total = ₹328,
  FOOD chip rendered, no minimum-order warning, Place-order enabled.
- Order persistence: GET /api/orders/{id} returns the same total as
  the POST response (authoritative server-side pricing).


## 2026-02-05 — Global Search Audit & Elastic/Fuzzy Overhaul

### Root causes of the 3 reported bugs (Lait Frais / Signature Car Parts / Send Parcel)
1. **`unaccent` extension was never installed** → every MART/SHOP query threw
   `function unaccent(…) does not exist` inside the provider, caught silently
   and returned 0 hits. That made real catalogue items appear un-searchable.
2. **SEND intent destinations pointed to non-existent React Router paths**
   (`/send/book/parcel`, `/send/book/movers`). React Router fell through and
   kept rendering whatever was underneath (MART homepage), while the SEND tab
   lit up — exactly the "Send Parcel → MART content" symptom reported.
3. **SHOP result URLs used `/shopbaked/product/{slug}`** which is not a real
   route; actual route is `/shop/p/{productId}`. Same for category.

### Fixes shipped
- `backend/migrations/versions/0064_search_pg_extensions.py` — installs
  `unaccent` + `pg_trgm` and creates trigram GIN indexes on
  `mart_products.name`, `mart_products.brand`, `shop_products.title`,
  `shop_products.title_fr`, `food_restaurants.name`, `food_menu_items.name`.
- `backend/modules/search/__init__.py` — rewritten orchestrator with
  deterministic 8-tier ranking:
    1.00 exact · 0.95 exact category · 0.90 prefix · 0.80 word-boundary ·
    0.70 multi-token · 0.55 contains · 0.50 brand/cat · 0.45 description ·
    pg_trgm similarity() floor for typo tolerance (disabled under 4 chars
    so "lai" doesn't match "balais"). SHOP searches products, categories
    AND brands. All destination URLs now map to real routes:
    `/products/{id}` (MART), `/shop/p/{slug}` + `/shop/c/{slug}` + `/shop?brand=…`
    (SHOP), `/foodbaked/restaurants/{slug}` (FOOD).
- `backend/scripts/seed_search_intents.py` — SEND destinations fixed to
  `/send/parcel`, `/send/movers`, `/send/book/vehicle`; expanded phrase lists
  (parcel, courier, package, moving service, demenagement, movers, …).
  Intent detection now also accepts token-overlap and difflib fuzzy matches.
- `GlobalSearchDropdown.jsx` + `GlobalSearchResultsPage.jsx` — reactive FR/EN
  via `react-i18next` instead of one-shot `localStorage` read.
- `backend/tests/test_global_search.py` — 29 tests passing (13 original +
  16 new regressions covering the exact user scenarios).

### Verification
- Backend: 29/29 search tests + 11/11 food dispatch & menu tests PASS.
- Frontend (testing_agent iteration_102): 16/16 end-to-end scenarios PASS
  (Lait Frais, Lai prefix, lait fris typo, Send Parcel, courier, shift home,
  book truck, pizza, burger, Signature Car Parts click-through, FR→EN
  toggle, cross-module search from /foodbaked, legacy /products?search=
  backward compat, empty state).


# BAKĒD — Changelog (recent slices only; older detail lives in PRD.md)

## 2026-02-25 (later 3) — Language cleanup + demo gallery seed — COMPLETE

**What was fixed**
- **Bilingual display bug**: FOODbakēd customer UI was showing `Aperçu · Overview`, `Partager · Share`, etc. simultaneously. Full audit of `/app/frontend/src/apps/foodbaked/pages/RestaurantMicrosite.jsx` — every hard-coded bilingual string now runs through `useTranslation("customer")` with i18n keys under `food.*`. Selecting FR shows only French; EN shows only English. The global BAKED language switcher stays the single source of truth.
- **New i18n keys** added to `/app/frontend/src/i18n/locales/{fr,en}/customer.json` under a new `food` namespace (35+ keys covering tabs, quick actions, gallery, overview headings, reserve CTA, empty states).
- **Demo gallery seed**: burger-hub + spice-nation restaurants now have 4-5 photos each (Unsplash CDN URLs, real food + interior + ambience + exterior), inserted into the standard `food_restaurant_photos` table — same architecture partners use. Reservations enabled on both. This is what makes the premium 4+ gallery layout render (main image left + 2×2 side grid).

**Deferred to next pass** (explicitly not in this small pass)
- Onboarding step: "Do you offer table reservations?" toggle in the seller wizard (needs a new field on `food_applications` + wizard step-4 UI + auto-map to `reservations_enabled=true` on approval).
- Floor plan / table management: schema for `food_restaurant_areas` + `food_restaurant_tables`, partner CRUD, capacity source-of-truth switch from slot-based to table-based.
- Super Admin visibility columns: Reservations Enabled / Floor Plan Configured on the admin restaurants table.
- Reviews CRUD Phase 2 (order-gated POST + partner response + moderation).
- Offers partner CRUD UI.


## 2026-02-25 (later 2) — Partner Menu Docs Upload UI — COMPLETE

**Backend** (`/app/backend/modules/food/microsite.py` — append)
- `POST /api/food/manage/{rid}/uploads/doc` — multipart file upload. Accepts admin OR food_partner JWT (`_get_menu_writer`) and `application/pdf` + jpg/png/webp. 15 MB cap. Stores via `core.providers.object_storage` under `baked-platform/food/menu_docs/{rid}/{ts}.{ext}`; returns `{file_url}` (served publicly through the existing `/api/food/uploads/{key}` handler).
- `GET/POST/PATCH/DELETE /api/food/manage/{rid}/menu-docs` — CRUD over `food_restaurant_menu_docs`. Sort-order auto-advanced. Tenant-isolated via `_get_menu_writer`.

**Frontend** (`/app/frontend/src/apps/foodbaked/pages/PartnerRestaurantProfilePage.jsx`)
- New "Documents de menu · Menu documents" panel below Gallery. Bilingual FR-first, dark theme + green primary button. Test-ids `partner-menu-docs`, `menudoc-label-input`, `menudoc-upload-btn`, `menudoc-file-input`, `menudoc-{docId}`, `menudoc-rename-{docId}`, `menudoc-open-{docId}`, `menudoc-delete-{docId}`.
- Flow: partner types an optional label → picks a PDF or image → `POST /uploads/doc` returns `file_url` → `POST /menu-docs` persists the record → the customer Menu tab (already shipping since Phase 1) picks it up automatically.
- In-place rename (blur-to-save), open (external link), delete (confirm).

**Verified** end-to-end with curl (partner `qa-burger@test.example`): PDF upload succeeded, doc listed on GET, appears on the customer Menu tab.


## 2026-02-25 (later) — FOODbakēd Restaurant Header / Hero Redesign — COMPLETE

Refactored the top of the restaurant microsite so the page hierarchy becomes: **global header → module nav → identity → quick actions → gallery → sticky tabs → active tab content → global footer**. All existing global chrome (BAKED header, location, search, cart, module nav, footer) is untouched — no duplication.

**Changed file**: `/app/frontend/src/apps/foodbaked/pages/RestaurantMicrosite.jsx` (only the `Hero`, `RestaurantIdentity` merged into `Hero`, and `StickyTabs` components).

**What's new**
- **Information header first** — name (up to `text-4xl`), cuisines, address, then a chip row: `Ouvert/Fermé · Open/Closed` (with today's ranges), `price_range · prix pour deux`, `contact_phone` (click-to-dial), and prep-time. Values gracefully hide when the underlying data isn't present — nothing hard-coded.
- **Ratings on the right** — up to two `RatingChip`s. Renders "Avis · Ratings" from real `reviews_summary.average / count` (empty-safe: hidden when count = 0), plus the legacy denormalised delivery/rating chip when `restaurant.review_count > 0`. Extensible to a distinct "Dining Rating" once separate fields exist.
- **Quick actions row** — Direction (opens Google Maps with stored coords or falls back to address), Partager · Share (uses `navigator.share` if available, otherwise clipboard-copy + toast), Avis · Reviews (deep-links to the Reviews tab), Réserver · Book a table (opens existing `ReservationModal` — reservation backend unchanged).
- **Adaptive gallery grid**
  - 0 images → subtle empty state (no more grey placeholder wall)
  - 1 image → single elegant hero (`h-[360px] lg:h-[440px]`)
  - 2 images → symmetrical split
  - 3 images → 1 large + 2 stacked
  - 4+ images → reference-inspired **65-70% main / 30-35% 2×2 side grid** with a "Voir la galerie · View gallery" overlay on the last tile when total > 5
  - Mobile → horizontally swipeable snap-carousel (`w-[85%]` tiles). Never overflows.
- **Sticky tab navigation** — full-width horizontal bar with an animated green underline for the active tab. Sticks below the global header (`sticky top-16 z-30`) so nav is always reachable while scrolling. Overflow-scrolls on mobile without breaking layout. Bilingual FR/EN inline (`Aperçu · Overview`).

**Preserved**
- Reservation flow, order flow, review flow, cart, auth, location — all unchanged.
- Data model, migrations, and existing partner portal — untouched.
- All test-ids (identity, tabs, gallery, quick actions) so the existing regression suite still exercises the same DOM anchors.


## 2026-02-25 — FOODbakēd Restaurant Microsite (Phase 1) — COMPLETE

Transformed the FOOD restaurant detail page from "just a menu" into a complete restaurant microsite. This is Phase 1 — Reviews CRUD, Offers CRUD, and uploaded menu PDFs upload UI ship in the follow-up (schemas + display already here).

**Migration `0059_restaurant_microsite.py`**
- `food_restaurants` gains description, price_range, address, latitude/longitude, opening_hours (JSONB), facilities (JSONB), highlights (JSONB), contact_phone, contact_email.
- New `food_restaurant_photos`, `food_restaurant_offers`, `food_restaurant_menu_docs`, `food_reviews` (order-gated architecture with partner_response + moderation status + uq_review_per_order).

**Backend routes (`/app/backend/modules/food/microsite.py`)**
- `GET /food/restaurants/{slug}/microsite?country=…` — one-shot: restaurant + photos + active offers + menu_docs + rating_summary (real aggregates from `food_reviews`).
- `GET /food/restaurants/{slug}/photos?category=…` — public gallery.
- Partner-scoped (tenant-isolated via `_get_menu_writer`): `PATCH /manage/{rid}/profile`, `GET/POST/PATCH/DELETE /manage/{rid}/photos`, `POST /manage/{rid}/photos/reorder`.

**Frontend**
- **`RestaurantMicrosite.jsx`** — hero gallery + identity bar + sticky tabs + Outlet-based nested routing. Categories in lightbox (all/food/ambience/interior/exterior/menu) + keyboard nav.
- Six tab views: Overview (highlights + offers + about + cuisines + hours + address + reviews teaser + reservation teaser), Order (delegates to existing FoodRestaurantDetail — hero hidden via CSS since microsite already renders one), Menu (structured read-only + uploaded PDFs), Photos (masonry + lightbox + category filter), Reviews (rating breakdown + list, empty-state architecture), Book a Table (opens ReservationModal).
- Legacy `/food/r/:slug` → 301-style client redirect to `/foodbaked/restaurants/:slug`.
- Partner portal gains **`/partner/food/profile`** — profile fields + highlights chips + opening hours + full gallery uploader (uses existing `FoodImageUploader` → Emergent Object Storage). Set cover, delete, category select.
- Uses global Baked cart/auth/location — no duplicates.

**Deferred (follow-up pass)**
- Customer review submission (order-gated) + partner response + super-admin moderation
- Partner Offers CRUD UI (backend schema + Overview display already shipped)
- Partner Menu-docs upload UI (backend schema + Menu tab display already shipped)


## 2026-02-24 — FOODbakēd Table Reservations + Real-Time Notification Engine — COMPLETE

**Goal**: Let diners reserve a table with date/time/party size straight from the restaurant page, plus full partner management + real-time alerts.

**Delivered**
- **DB (migration `0058_food_reservations.py`)**
  - `food_restaurants` gained `reservations_enabled` + `reservations_paused_until`.
  - New `food_reservation_settings` (per restaurant): slot_capacity, min/max party, lead-time, slot_interval (15/30/60), advance days, auto_confirm, hours (JSONB), blackout_dates (JSONB), sound_new_order / sound_new_reservation / sound_volume.
  - New `food_reservations` + `food_reservation_events` for full audit trail. Booking references formatted `R-XXXXXX` (unambiguous alphabet).

- **Backend routes (`/app/backend/modules/food/reservations.py`)**
  - Public: `GET /food/restaurants/{slug}/reservation-config`, `/reservation-slots`, `POST /reservations` (guest OR auth). Slug collision (CI/IN) disambiguated via optional `country` query.
  - Customer: `GET /food/customer/reservations` + `POST /reservations/{id}/cancel`. Guest rows with matching phone/email are auto-claimed on first authenticated fetch.
  - Partner/admin: `GET /food/manage/{rid}/reservations` (+ filters), `PATCH /{id}` (confirm/reject/cancel/no_show/complete — terminal states rejected), `GET/PUT /reservation-settings`, `PATCH /reservation-toggle` (enabled + pause_hours).
  - WebSocket: `wss://…/api/food/manage/{rid}/ws?token=<partner_jwt>` — subscribes to `food:restaurant:{rid}`. Frames: `food.reservation.created` / `food.reservation.updated` / (reserved) `food.order.created`. Tenant-isolated: partner JWT for other restaurant → close code 4403.
  - Emails via existing `core.mailer` on create/confirm/reject (best-effort, async).

- **Frontend**
  - `ReservationModal.jsx` — public booking flow on `/food/r/:slug` (only when reservations enabled). Auto-prefill from logged-in Baked customer.
  - `MyReservationsPage.jsx` — `/foodbaked/reservations/me` (customer).
  - Partner portal (mounted under `/partner/food`) gained **Reservations** inbox with confirm/reject/complete/no_show/cancel actions and **Paramètres** for capacity/interval/hours/blackout/party-size/lead-time + sound preferences.
  - `RestaurantNotificationEngine.jsx` — WebSocket + procedurally-generated Web Audio chime (no asset, autoplay-safe via `Activer les alertes` gesture) + Accept/Reject modal + FIFO queue for multiple incoming events.

- **Real-time infrastructure**: Reuses existing `modules/realtime` pubsub. Testing agent found a stale `/usr/bin/redis-server` symlink → fixed and Redis is now healthy (`redis-cli ping = PONG`). Multi-worker WS broadcast confirmed via test.

**Verification** (`/app/test_reports/iteration_93.json`)
- Backend pytest 9/9 pass (`test_food_reservations.py`).
- Full frontend flow: guest booking (Burger Hub → date/party/slot/contact → success + `R-XXXXXX`), partner login → inbox with pending count + Confirm/Reject, settings page renders every requested testid.
- Real-time e2e (testing agent): partner WS receives `food.reservation.created` within 5s of a public POST; wrong-restaurant WS closed 4403; frontend notification modal appears without a refresh.
- FOODbakēd Sellers wizard regression clean (translate="no" fix from iter92 still holds).


## 2026-02-24 — FOODbakēd Seller Wizard — insertBefore Runtime Error Fix — COMPLETE

**Symptom**: `NotFoundError: Failed to execute 'insertBefore' on 'Node'` at `/foodbaked/sellers/apply/step-2`. Stack pointed at React DOM reconciliation (`insertOrAppendPlacementNode` → `commitPlacement`).

**Root cause**: The FOODbakēd Sellers wizard intentionally renders **inline bilingual strings** (e.g. `Suivant · Next`, `Téléverser · Upload`) as bare text nodes sitting alongside React elements. When Chrome / Google Translate auto-translated the page, it wrapped those text nodes in `<font>` tags — the next React commit (e.g. `uploading` state flipping the upload button label) then tried to `insertBefore` against a parent that no longer contained the expected text node.

**Fix (3 layers, defense-in-depth)**:
1. **`/app/frontend/public/index.html`** — `<html lang="fr" translate="no">`, `<meta name="google" content="notranslate">`, `<body class="notranslate">`. The platform owns its own FR ↔ EN via `react-i18next` (`/src/i18n/`), so blocking browser-level auto-translation is the correct architecture — the in-app language switcher continues to work.
2. **`/app/frontend/src/apps/foodbaked/SellersApp.jsx`** — Step 2's `label_fr` and the upload button label are now wrapped in `<span>` so React always manages a stable DOM anchor even if a rogue translator extension bypasses the `translate="no"` hint.
3. **`WizardErrorBoundary`** wraps `<FoodSellersApp>` — any future reconciliation error surfaces as a friendly bilingual "Recharger · Reload" card (`[data-testid="sellers-error-boundary"]`) instead of the dev overlay. Draft data is preserved server-side.

**Verification** (`/app/test_reports/iteration_92.json`):
- 0 pageerror, 0 React runtime errors across signup → Step1 → Step2 (back/forward/reload + simulated `<font>`-wrap DOM mutation) → Step3 → Step4 → Step5 → Step6 review.
- Save-and-Resume verified: logout via portal-logout → phone-OTP re-login → dashboard rehydrated at correct step.
- `yarn build` production build succeeds (2.27s).


## 2026-02-05 — Phase C: Phase-A Dispatch Pytest Suite — COMPLETE

**Coverage**: 22 direct-DB pytests over `modules.express.dispatch` — the algorithmic core of Phase A real-driver dispatch.

**File**: `backend/tests/test_express_dispatch_phase_a.py` (all 22 tests pass, 2.74s runtime).

**Contracts locked in**
- `find_nearest_driver` — nearest-first ranking, freshness gate (`last_seen_at ≥ now − STALE_AFTER_SECONDS`), `linked_driver_id IS NOT NULL` guard (excludes legacy seed rows), `is_available=True`, MATCH_RADIUS_KM cap, `exclude_ids` skip, country isolation.
- Vehicle fallback chain — bike→scooter, three_wheeler→mini_truck→truck, own-family scanned first.
- Cold-chain guarantee — `ref_tricycle` NEVER dispatches to a non-refrigerated driver (even in-family), and `REFRIGERATED_CODES = {ref_tricycle, ref_utility, ref_truck}`.
- `dispatch_next_offer` — sets `status='offering' + offered_to_driver_id + offer_expires_at`; on exhausted pool reverts to `status='searching'` and nulls the offer fields.
- `accept_offer_atomic` — winning driver flips row + reserves `module_driver.active_booking_id`; expired offer → `expired`; wrong driver → `offer_gone`; second attempt after success → `already_taken`.
- **Race semantics** — two `asyncio.gather()` accepts against isolated sessions produce exactly one winner (single `UPDATE .. WHERE`).
- `decline_offer` — appends to `declined_driver_ids`, immediately re-dispatches to the next eligible driver, falls back to `searching` when pool exhausts.

**Fix — MultiShipmentsWizard vehicle card HTML nesting**: outer `<button>` → `<div role="button" tabIndex + onKeyDown>` so the inner Info button no longer produces the "button descendant of button" React hydration warning flagged in iteration_86.json.



## 2026-03-10 — Global Inter Typography Migration — COMPLETE

**Previous typography**: Poppins imported in `src/index.css` line 1 and applied to `body`. Partner-landing + partner-hub each shipped their own Inter fallback stack. Driver + SendTrack had 3 inline `fontFamily: "Inter, system-ui, sans-serif"` overrides. Three sources of truth, one legacy default.

**New typography**: Inter as the single global font, driven by one CSS variable exposed on `:root`.

**Files touched (10 total)**
- `src/index.css` — Google Font `@import` swapped from Poppins → Inter (weights 400/500/600/700/800). Added `:root { --font-family-sans: "Inter", "SF Pro Display", "Roboto", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }`. `body`, `html`, `.baked-logo-text` now use `var(--font-family-sans)`. New global `input, textarea, select, button, optgroup, option { font-family: inherit; }` rule so typed text follows Inter.
- `tailwind.config.js` — `theme.extend.fontFamily = { sans: ["var(--font-family-sans)"], inter: ["var(--font-family-sans)"] }` so `font-sans` / `font-inter` utilities inherit the global stack.
- `apps/partner-landing/partner-landing.css` — inlined Inter stack replaced with `var(--font-family-sans)`.
- `apps/partner-hub/partner-hub.css` — same.
- `apps/send-track/SendTrackApp.jsx`, `apps/driver/DriverApp.jsx` — 3 inline `fontFamily: "Inter, system-ui, sans-serif"` swapped to `"var(--font-family-sans)"`.
- Email templates now prepend `'Inter'` with `Arial` fallback: `core/emails.py`, `shared/purchase_orders/notifications.py`, `modules/mart_partner/notifications.py`, `modules/mart_partner/routes.py`, `modules/driver/routes.py`. Generated-code + temp-password rows keep their intentional `ui-monospace` stack.

**Legacy declarations audited & removed**
- `Poppins` → 0 references remain (grepped across `frontend/src`, `backend`, `public/`)
- Google Fonts `@import` → single source (`Inter` only)
- Inline `fontFamily` in JSX → 3 files, all point to the CSS var now

**Visual regression check** (computed `font-family` on rendered elements via Playwright)
- `/` (customer home) → `Inter, "SF Pro Display", …` ✅
- `/shop` (SHOP home) → same ✅
- `/driver` (driver portal) → same ✅
- `/admin/login` (super admin) → same ✅
- 200-element sample scan: **0 Poppins leaks** ✅
- French characters (é, à, ê, œ) render correctly on `/` (FR default) ✅

**Branding preserved** — the migration touched typography tokens only; MART green, SHOP amber, AUTO red, IMMO purple, SEND yellow untouched.


## 2026-03-10 — SHOP Admin Approval Bilingual View — COMPLETE

Admin reviewers can now catch broken French copy **before** a product goes live.

**Backend**
- `modules/shop/routes.py` — `_admin_product_dict` now returns `title_fr` + `description_fr` (used by both `GET /product-requests` list and `GET /product-requests/{id}` detail endpoints).
- Verified via curl: `GET /api/admin/modules/shop/product-requests?country=CI&bucket=pending` returns each row with `title_fr` and `description_fr`.

**Frontend** — `pages/admin/AdminShopProductApprovals.jsx`
- **List row**: prefers French title with an EN sub-line when both are set (`{p.title_fr || p.title}` + `EN · {p.title}`). Products lacking a French title render a red `FR MISSING` badge next to the product id (data-testid `shop-approval-missing-fr-{id}`).
- **Drawer header**: title bar now shows the French title first with a fallback to English, plus a top-of-drawer warning ("⚠ French title missing — customer will see the English fallback") when `title_fr` is empty (`data-testid="shop-approval-drawer-fr-missing"`).
- **Drawer body**: new bilingual panels — `TITRE · FR` next to `TITLE · EN`, and `DESCRIPTION · FR` next to `DESCRIPTION · EN`, both with `MISSING` chips + italicised placeholder text ("Non fourni — retombe sur l'anglais") when the FR value is empty. Every panel has a `data-testid` (`shop-approval-title-fr`, `shop-approval-title-en`, `shop-approval-description-fr`, `shop-approval-description-en`, `shop-approval-titles-panel`, `shop-approval-descriptions-panel`).

**Verified end-to-end** with two forced pending products (one bilingual, one FR-null):
- List: bilingual row shows "Premium Accessoires de mode femme / EN · Premium Women's Fashion Accessories"; missing-FR row shows "Everyday Women's Streetwear / FR MISSING badge".
- Drawer for the bilingual product: shows both TITRE · FR and TITLE · EN side by side, plus both descriptions side by side.


## 2026-03-10 — SHOP Product Bilingual Columns — COMPLETE

**Schema**:
- `migrations/versions/0047_shop_bilingual_product.py` — adds `shop_products.title_fr` (VARCHAR 400, nullable) + `shop_products.description_fr` (TEXT, nullable). English canonical column stays unchanged.
- `core/models/shop.py` — `ShopProduct.title_fr` + `ShopProduct.description_fr` mapped columns with docstring calling out the fallback rule (FR falls back to `title` when empty).

**Backend endpoints round-tripping the new fields**:
- `POST /api/shop/portal/products` — accepts `title_fr` + `description_fr`
- `PATCH /api/shop/portal/products/{id}` — accepts `title_fr` + `description_fr`
- `GET /api/shop/portal/products/{id}` — returns both
- `GET /api/shop/portal/products` — returns both (list view)
- `GET /api/shop/products/{id}` (public PDP) — returns both
- `GET /api/shop/products` (public list) — returns both
- `GET /api/shop/cart/me` — `items[].product.title_fr` for cart-line rendering

**Seller portal UI** (`apps/martbaked-sellers/portal/PortalShop.jsx`):
- Grid form now shows Title(EN) alongside Titre(FR), and Description(EN) alongside Description(FR)
- Helper text distinguishes canonical vs override
- Left-hand product list prefers FR title with "FR + EN" badge when both are set

**Frontend consumers** (`apps/shopbaked/lib/i18nCms.js`):
- New `pickProductTitle(product, lang)` + `pickProductDescription(product, lang)` — pick FR when lang=fr, English otherwise, always safe for null/undefined
- Wired into `ShopHome.jsx` ProductCard, `ShopProduct.jsx` PDP heading + image alt + description, `ShopCheckout.jsx` cart-line label

**Demo seed** (`modules/shop/demo_products_seed.py`):
- `_title_for` now returns `(english_title, french_title)` tuple
- `_description_for` now returns `(english_desc, french_desc)` tuple
- Seed writes BOTH into every demo product; 362 demo rows across CI + IN reseeded

**Live verified**:
- API: `/api/shop/products?country=CI&limit=2` returns `title=Premium Motorcycle Parts & Accessories` and `title_fr=Premium Pièces & accessoires moto` ✅
- `/shop/c/mode-femme` FR default → French titles ("Premium Accessoires de mode femme")
- Click "EN" toggle → titles instantly swap to English ("Premium Women's Fashion Accessories")
- Category title also swaps ("Mode Femme" ↔ "Women's Fashion")


## 2026-03-10 — SHOPbakēd Full French Localisation — COMPLETE

Root-cause audit: SHOP frontend was **never** wired to i18next — components used hardcoded English + raw CMS values. CMS seed and product/attribute seeds were English-only. This slice fixes the root cause across all three layers.

**Frontend files rewired to `useTranslation` + bilingual CMS picker:**
- `apps/shopbaked/pages/ShopHome.jsx` (hero, USP, category grid, carousels, promo banners, brand rail, CTA strip, ProductCard) — 45+ strings
- `apps/shopbaked/pages/ShopCategoriesIndex.jsx` — 8 strings
- `apps/shopbaked/pages/ShopCategory.jsx` (search, filters, empty state, fresh-drops strip) — 15 strings
- `apps/shopbaked/pages/ShopProduct.jsx` (stock, SKU, condition, colour swatches, CTA states) — 13 strings
- `apps/shopbaked/pages/ShopCheckout.jsx` + order confirmation + PIN card — 24 strings
- `components/address/AddressPill.jsx` (top-nav "CHOOSE DELIVERY / Set address") — 4 strings
- `apps/shopbaked/ShopbakedApp.jsx` — wired FR/EN toggle to global i18n

**CMS layer**: `modules/shop/homepage_seed.py` now injects `_fr` siblings on every hero slide, right-column promo, USP tile, category grid tile, product carousel, promotional banner and brand carousel. 40+ new bilingual JSON keys. Existing SHOP rows deleted & re-seeded (10 rows across CI + IN).

**Product layer**: `modules/shop/demo_products_seed.py`
- `_title_for` picks French labels (`Signature / Essentiel / Weekend / Premium`) for CI markets and uses `sub.name_fr` for the noun.
- New `_description_for` returns French demo description for CI.
- 362 demo products across CI + IN nuked & re-seeded with French titles/descriptions.

**Attribute layer**: `customer:shop.attr_name.*` (Size → Taille, Colour → Couleur, Storage → Stockage, Condition → État, Warranty → Garantie) and `customer:shop.colour_label.*` (black → noir, silver → argent, oak → chêne, space-grey → gris sidéral, etc.) map the English DB keys/values to French on the fly — no schema migration.

**Verified end-to-end** on the live preview (screenshots kept for record):
- `/shop` FR — zero English leaks ✅
- `/shop/categories` FR — "Toutes les catégories / X sous-cat." ✅
- `/shop/c/mode-femme` FR — French product titles + "Taille S · noir · +1 options" ✅
- `/shop/p/shpprd_demo_accessoires-mode-femme` FR — "COULEUR / TAILLE / Choisir les options / EN STOCK / État: neuf" ✅
- EN toggle in header instantly restores English across all pages ✅


## 2026-03-09 — Order Tracking i18n — COMPLETE

Localised the delivery-tracking surfaces so customers see their live updates in their language:

| File | Before | After | Δ |
|---|---:|---:|---:|
| `pages/mobile/MobileOrderTracking.jsx` | 11 | 0 | −11 |
| `pages/express/ExpressLiveTracking.jsx` | 7 | 0 | −7 |
| `components/mobile/OrderTimeline.jsx` | (in progress + pending) | 0 | −2 (via code→key mapping) |

Global coverage: **159 → 141 hardcoded strings (−11%)**. Cumulative Phase C onwards: **445 → 141 = −68%**.

**Keys added** — ~60 new keys under `customer:orders.tracking.*` + `customer:orders.live.*`:
- `tracking.*` (MART polling tracker) — `title`, `status_label`, `arriving_in`, `minutes_short`, `delivered_short`, `order_prefix`, `share_status_aria`, `share_title` / `share_text` (with `{{number}}`), `link_copied`, `your_delivery_partner`, `call_driver_aria`, `chat_driver_aria`, `order_progress`, `in_progress`, `pending`, `delivering_to`, `items_count` (with `{{count}}`), `need_help`, `contact_support`, `all_orders`, `continue_shopping`, `loading`, + 6 stage keys (`stage_placed/preparing/picked_up/on_the_way/delivered/cancelled`) + 5 timeline label keys (`timeline_placed/preparing/picked_up/on_the_way/delivered`).
- `live.*` (SEND WebSocket tracker) — `back_aria`, `live_badge`, `offline_badge`, `tracking_title`, `live_sub`, `loading`, `map_unavailable`, 6 stage keys (`stage_searching/driver_assigned/arriving/picked_up/in_transit/delivered`), `awaiting_driver`, `delivery_completed`, `eta_minutes` (with `{{n}}`), `locking_in_driver`, `finding_nearest`, `see_details_on_accept`, `pickup`, `dropoff`, `distance`, `trip_est`, `vehicle`, `total`, `cod_short`, `book_another`.

**Backend contract preserved**: the `/api/orders/{id}/tracking` endpoint continues to send timeline items with an English `label` and a stable `code`. `OrderTimeline` now reads `code` and maps to `orders.tracking.timeline_*` keys client-side — zero backend change, historical orders keep rendering, and admins can add new stages by extending the map without touching the API.

**Live verified**:
- `/send/booking/xxx/track` FR → "Chargement du suivi en direct…"
- Toggling EN swaps to "Loading live tracking…"


## 2026-03-09 — SEND Wizard i18n — COMPLETE

Localised the SENDbakēd booking funnel — the top offender identified in `I18N_COVERAGE_REPORT.md`:

| File | Before | After | Δ |
|---|---:|---:|---:|
| `pages/express/ExpressWizard.jsx` | 62 | 0 | −62 |
| `pages/express/MoversWizard.jsx` | 49 | 0 | −49 |
| `components/express/ExpressLayout.jsx` | 3 | 0 | −3 |
| **Total** | **114** | **0** | **−114** |

Global coverage: **290 → 159 hardcoded strings (−45%)**. Cumulative Phase C onwards: **445 → 159 = −64%**.

**Keys added** — ~160 new keys under `customer:send.wizard.*` (mirror in `en/` and `fr/` customer.json):
- Step labels (10) — `step_type`, `step_location`, `step_items`, `step_quote`, `step_timeslot`, `step_review`, `step_receiver`, `step_vehicle`, `step_package`, `step_estimate`
- Screen headers (6) — `header_movers`, `header_pickup_drop`, `header_receiver`, `header_vehicle`, `header_package`, `header_estimate`, `header_confirmed`
- Movers flow (~50) — `pickup_drop_details`, `building_access`, `service_lift`, `stairs_only`, `floor_label`, `parking_available`, `add_items`, `items_hint`, `items_count`, `custom_item_soon`, `estimated_charges`, `transportation`, `packing`, `labour`, `floor_fees`, `stair_fees`, `toll_permits`, `insurance_transit`, `total_estimated_cost`, `labour_movers`, `trust_movers`, `select_moving_date`, `select_time_slot`, `timings_include`, `review_confirm`, `terms_agree_prefix`, `terms_link`, `booking_safe`, `book_now`, `sign_in_to_book`, `accept_terms_first`, `booking_failed` — with `{{count}}` / `{{km}}` interpolation.
- Parcel flow (~55) — `who_delivering_to`, `receiver_name`, `phone_number`, `alt_number`, `building_apt`, `landmark`, `delivery_notes`, `delivery_preferences`, `choose_vehicle`, `prices_vary_demand`, `up_to_kg`, `eta_range`, `best_badge`, `all_deliveries_insured`, `safe_with_send`, `package_helps`, `package_type`, `package_weight`, `package_dimensions`, `additional_info`, `dim_length/width/height`, `booking_incomplete`, `restart_booking`, `selected_vehicle`, `change`, `price_breakdown`, `base_fare`, `distance`, `time`, `surcharge`, `service_fee`, `insurance`, `taxes`, `promo_line`, `estimated_total`, `insurance_included`, `goods_covered_up_to`, `have_promo`, `promo_ph`, `apply`, `final_price_note`, `payment`, `cash_on_delivery`, `pay_to_driver`, `baked_wallet`, `book_now_with_price`, `promo_applied` — with `{{price}}` / `{{code}}` interpolation.
- Booking confirmation (~15) — `booking_successful`, `booking_ref_note`, `your_move`, `your_delivery`, `load_label`, `slot_label`, `distance_label`, `est_eta_label`, `vehicle_label`, `total_to_pay`, `cod_short`, `move_confirmed`, `move_call_note`, `searching_driver`, `tracking_opens`, `track_order`, `book_another`.
- Shared UI (2) — `continue` (footer default), `step_x_of_y` (header counter).

**Extras**:
- `TimeSlotStep` date labels now use `i18n.language`-aware `toLocaleDateString("fr-FR" | "en-US")` so short-format dates (Lun 09 mars vs Mon 09 Mar) match the active language.
- `MoversWizard`'s local `useSteps()` hook + `useSteps()` in `ExpressWizard` re-render the step names when the language toggles — no page reload required.

**Live verified**:
- `/send/movers` FR → "DÉMÉNAGEURS PROFESSIONNELS / Type de déménagement / Déménagement clé en main"
- `/send/book/location` FR → "Étape 1 sur 5 / Lieu de ramassage & livraison / Ramassage & livraison / Destinataire / Véhicule / Colis / Estimation / Continuer"
- `/send/book/location?lang=en` (localStorage) → "Step 1 of 5 / Pick-up & Drop Location / Pickup & Drop / Receiver / Vehicle / Package / Estimate / Continue"


## 2026-03-08 — Account Screens i18n — COMPLETE

Rewired the 6 account/profile mobile screens through `useTranslation("customer")`:

| File | Before | After | Δ |
|---|---:|---:|---:|
| `MobileWallet.jsx` | 15 | 0 | −15 |
| `MobileSettings.jsx` | 17 | 0 | −17 |
| `MobileHelpSupport.jsx` | 18 | 0 | −18 |
| `MobileRefer.jsx` | 12 | 0 | −12 |
| `MobileRewards.jsx` | 11 | 0 | −11 |
| `MobileActivities.jsx` | 11 | 0 | −11 |
| **Total** | **84** | **0** | **−84** |

Global coverage: **374 → 290 hardcoded strings (−22%)**. Cumulative (Phase C onwards): **445 → 290 = −35%**.

**Bonus fix** — `DesktopProfileShell.jsx`: the desktop-only guest state ("Sign in to view your profile") + sidebar nav labels + Log-out button were still hardcoded English. Now routed through `t("profile.*")` with locale-aware URLs via `useLocalePath()`.

**Keys added** — 6 new namespaces to `customer.json`:
- `wallet_extra.*` — 22 keys (hero card, action grid, auto-topup, transaction rows, ecosystem strip, trust)
- `settings.*` — 32 keys (profile editor, notifications toggles, language/currency/region, appearance, privacy, delete flow)
- `help.*` — 34 keys (quick actions, 8 category cards with descriptions, ticket form, 4 statuses, empty state, contact strip)
- `refer.*` — 22 keys (hero card, code/link copy, 4 share channels, stats, 3-step how-it-works)
- `rewards_page.*` — 15 keys (points card, conversion strip, recent list, use-your-points tiers)
- `activities.*` — 21 keys (tabs, filters, tracking hero, empty states, coming-soon module cards)

**Live proof**: `/portefeuille` guest view now renders "Connectez-vous pour accéder à votre profil / Votre identité BAKĒD fonctionne sur tous les services..." — zero English leaks.


## 2026-03-08 — Checkout String i18n — COMPLETE

Localised the 4 launch-blocker files identified in `I18N_COVERAGE_REPORT.md`:

| File | Before | After | Δ |
|---|---:|---:|---:|
| `pages/mobile/MobileCheckout.jsx` | 13 | 0 | −13 |
| `pages/mobile/MobileAddresses.jsx` | 23 | 0 | −23 |
| `components/address/AddressSelector.jsx` | 22 | 0 | −22 |
| `pages/mobile/MobileOrderDelivered.jsx` | 14 | 0 | −14 |
| **Total** | **72** | **0** | **−72** |

Global coverage: **445 → 374 hardcoded strings (−16%)**. All 4 target files removed from the top-15 offender list. Every string customers see during the money-moment now switches between FR and EN via `useTranslation("customer")`.

**Keys added** (mirror in `/app/frontend/src/i18n/locales/{fr,en}/customer.json`):
- `checkout.*` — 30 new keys (delivery slots, payment methods, points redemption, min-order banner, toast strings, order-placed flow, total payable, trust strip)
- `address.*` — 25 new keys (form labels, placeholders, toast copy, empty state, ecosystem strip, sign-in prompt, saved-count with i18next `_one`/`_other` plurals)
- `address_selector.*` — 25 new keys (modal title, detect button, saved/recent sections, serviceability states, confirmation flow, all toast strings)
- `orders.*` — 15 new keys (rating card, freshness guarantee, delivery summary, order summary, sticky footer)

**Live verified**:
- `/produits`, `/`, `/panier`, `/paiement` all render in French
- Zero English leaks on `/paiement` login prompt or `/compte/adresses` guest prompt
- Homepage delivery panel, category strip, footer all French


## 2026-03-08 — Launch route audit + i18n coverage sweep — COMPLETE

**Batch route migration**:
- `/confidentialite` ⇄ `/privacy` — PrivacyPolicy route + `ROUTE_MAP.privacy` + Footer link
- `/conditions` ⇄ `/terms` — TermsOfService route + `ROUTE_MAP.terms` + Footer link

Both aliases registered in `DesktopCustomerShell` + `MobileCustomerShell`. `LocaleRouteSync` swaps them on the fly. Live verified with headless browser: `/confidentialite` → toggle EN → `/privacy`, `/terms` → toggle FR → `/conditions`, footer terms link href respects language.

**Ordered launch-critical route list** (22 pairs total):
1. `/` (same both langs)
2. `/categories`, `/categories/:slug` (same both langs)
3–4. `/produits` ⇄ `/products` [+/`:id`]
5. `/panier` ⇄ `/cart`
6. `/paiement` ⇄ `/checkout`
7–10. `/commandes` ⇄ `/orders` [+/`:id`, `/suivi`, `/confirmation`, `/livree`]
11. `/portefeuille` ⇄ `/wallet`
12. `/compte` ⇄ `/profile`
13–18. `/compte/{adresses,parametres,aide,activites,recompenses,parrainage}` ⇄ `/profile/{addresses,settings,help,activities,rewards,refer}`
19. `/confidentialite` ⇄ `/privacy`
20. `/conditions` ⇄ `/terms`

Deferred (branded English paths, out of launch scope): `/send/*` (SENDbakēd deep booking flows), `/shop/*` (SHOPbakēd storefront).

**Coverage sweep** — script at `/app/scripts/i18n_coverage_sweep.py`, full report at `/app/memory/I18N_COVERAGE_REPORT.md`.

| Metric | Value |
|---|---|
| Files scanned | 58 |
| Files with `useTranslation()` | 14 (24%) |
| Live `t()` call sites | 128 |
| **Hardcoded English strings** | **445** across 43 files |
| Top offender | `pages/express/ExpressWizard.jsx` (62) — deferred |
| Launch-blockers | **87 strings across 4 files** (MobileAddresses, AddressSelector, MobileCheckout, MobileOrderDelivered) |
| Backend errors i18n | 26/26 tests green (previous iteration) |

Recommended follow-up ordered by impact:
1. Sprint 1 (pre-launch): 4 checkout files, 87 strings
2. Sprint 2 (post-launch nice-to-have): 6 mobile profile files, ~88 strings
3. Sprint 3 (SEND funnel + legal): 5 files, ~167 strings


## 2026-03-08 — Phase C+ · URL Auto-Sync (LocaleRouteSync) — COMPLETE

Added `i18n/LocaleRouteSync.jsx` — a side-effect-only observer mounted inside both `DesktopCustomerShell` and `MobileCustomerShell` in `apps/customer/CustomerApp.jsx`. It watches `location.pathname` and `i18n.language`; when they disagree, it reverse-matches the current URL against `ROUTE_MAP` (both static aliases and `:param` patterns via `matchPath`) and rewrites the URL bar with `navigate(newPath, { replace: true })`.

**Verified with browser automation** (7/7 scenarios):
- Land on `/produits` in FR → stays `/produits`
- Toggle EN → URL auto-swaps to `/products`
- Toggle FR back → URL becomes `/produits`
- Query strings preserved: `/produits?search=milk` → `/products?search=milk`
- Toggle EN on `/panier` → becomes `/cart`
- Home `/` (same path both langs) — no swap
- Unknown routes (`/admin`, `/shop`, `/send`) — left alone (no false rewrites)

**Implementation notes**:
- Exact-string matches are tried before `:param` patterns so `/panier` never gets falsely matched by `/produits/:id`.
- `useRef` guard prevents any infinite loop when we ourselves navigate.
- Hash + search preserved.
- Zero DOM output (`return null`).


## 2026-03-08 — Phase C · French Route Renaming — COMPLETE

Localised customer-facing URLs so French users see native French paths in the URL bar. English aliases stay live so external bookmarks and share URLs keep working.

**Route mapping** (`i18n/routes.js`):
- `/products` ⇄ `/produits`
- `/cart` ⇄ `/panier`
- `/checkout` ⇄ `/paiement`
- `/orders` ⇄ `/commandes`
- `/orders/:id/track` ⇄ `/commandes/:id/suivi`
- `/orders/:id/delivered` ⇄ `/commandes/:id/livree`
- `/wallet` ⇄ `/portefeuille`
- `/profile` ⇄ `/compte`
- `/profile/addresses|settings|help|activities|rewards|refer` ⇄ `/compte/adresses|parametres|aide|activites|recompenses|parrainage`

**Public API**:
- `useLocalePath()` hook returns `path(key, params?)` bound to current i18next language.
- `resolvePath(key, lang, params?)` for tests / non-hook code.

**Files updated**:
- `apps/customer/CustomerApp.jsx` — dual FR+EN route registration for both DesktopCustomerShell and MobileCustomerShell.
- Navigation: `TopNav`, `MobileBottomNav`, `MobileShell` (path detection matches both prefixes).
- Pages: `HomePage`, `MobileHome`, `CartPage`, `MobileCart`, `CheckoutPage`, `MobileCheckout`, `ProductDetailPage`, `MobileProductDetail`, `ProductCard`, `ConfigHomepage` (Hero + BannerTrio + CtaStrip).
- `ConfigHomepage` gets a `cmsToLocale()` helper that remaps CMS-supplied URLs (`/products?category=…`) to the current language while preserving query strings and hash fragments — Super Admin can still type raw URLs.

**Testing** — `test_reports/iteration_83.json` (frontend testing agent, ~92% pass on 10+ scenarios):
- All 12 FR routes + 8 EN aliases return HTTP 200 and render their proper shells.
- LanguageSwitcher persists `localStorage.baked_language` + syncs `<html lang>`.
- TopNav cart button → `/panier` in FR, `/cart` in EN. Account button → `/compte` in FR, `/profile` in EN.
- Mobile bottom-nav active-state matches both `/panier` and `/cart`.
- MobileShell header variant detection works on FR aliases (`isCart`, `isCheckout`, `isProfile`).
- Post-agent fix: ConfigHomepage hero CTAs + banner row + CTA strip all correctly emit FR URLs with query strings preserved.

**Deferred (P2)**: Deep pages that navigate back with `nav("/profile")` etc. still work because both aliases resolve. Migrating those Back buttons to `useLocalePath` is cosmetic-only and can happen incrementally.


## 2026-03-08 — Phase D · Backend HTTPException i18n sweep — COMPLETE

Localised the customer + supplier + driver error surfaces (~140 `raise HTTPException` sites across 11 files) so every 4xx/5xx body now renders in the caller's language.

**Middleware**: added ASGI-level `_BakedLanguageMiddleware` in `server.py` that stashes `resolve_lang(request)` into a request-scoped ContextVar (`core.i18n._current_lang`). Endpoint code now calls `t(key, current_lang(), **params)` with **zero** signature churn — no need to inject `Request` into every handler. `BaseHTTPMiddleware` was intentionally avoided (it spawns the endpoint on a fresh task whose context copy doesn't see mid-request `.set()` calls).

**Files fully swept:**
- `modules/mart/orders.py` — cart empty, address missing, allocation failure, min-order, out-of-stock, order not-found, cancel-status, payment intent
- `modules/mart/routes.py` — product not found, item not found
- `modules/express/routes.py` — booking not-found, cancel gate, driver-status transition + auth
- `modules/driver/routes.py` — all OTP flows, KYC step gate, upload validation, submit, online gate, geo push, offer accept/decline, job lifecycle (accept/decline/arrive/verify pickup+delivery), earnings/withdrawal gates, in-ride chat, tracking token, admin approve/reject
- `modules/shop/routes.py` + `storefront_routes.py` + `portal_routes.py` — category/subcategory/product/variant/order + assignment CRUD, checkout empty/insufficient-stock, seller order lifecycle (invalid_transition, pin_locked, wrong_pin), shop_not_enabled
- `shared/auth/routes.py` — OTP challenge invalid/expired/incorrect, Google config/exchange/id_token/credential/email verification
- `shared/customer/routes.py` — address not-found, ticket category/not-found
- `shared/addresses/routes.py` — recent-search delete
- `shared/suppliers/portal_routes.py` — bearer/token/role/supplier gates, document CRUD, supply-location, catalogue upsert, product-request submit/resubmit, uploads (kind/size/mime/storage), file-proxy auth, admin approve/reject

**Locale dictionaries** (`i18n/locales/{fr,en}/errors.json`) — extended with 100+ new keys grouped under `generic / auth / supplier / order / customer / driver / shop / upload`. All keys ship with FR + EN and support `{param}` interpolation.

**Tests** — new `tests/test_i18n_errors_e2e.py` (11/11 green) covering:
- Middleware picks up `X-BAKED-Language`, `?lang=`, `Accept-Language` (FR default).
- Header precedence (`X-BAKED-Language` beats `?lang` beats `Accept-Language`).
- Structured `{code, message}` errors keep `code` untouched while `message` gets translated.
- Sequential requests in the same event loop don't bleed language across (ContextVar isolation verified).

Combined with existing `test_i18n_backend.py` (15/15), **26/26 i18n tests pass**.

**Live curl proof** (external preview URL):
```
GET /api/mart/products/nope-xyz  X-BAKED-Language: fr → "Produit introuvable."
GET /api/mart/products/nope-xyz  X-BAKED-Language: en → "Product not found."
GET /api/shop/products/nope-xyz  X-BAKED-Language: fr → "Produit SHOP introuvable."
```

**Known deferred (P2)**: `shared/admin/*` (super-admin dashboards — French-only for the launch team, low visibility), `modules/mart_partner/*`, `shared/purchase_orders/*`. Also 1 pass-through in `modules/mart/orders.py:437` that forwards the payment provider's own error message verbatim.


## 2026-03-07 (part 2) — Phase D roll-out · All email call sites migrated — COMPLETE

Every `send_email_async` call site has been re-wired through the localised email pipeline (`core.emails.send_localised_email` + `core.i18n.t`). Emails now arrive in the recipient's language — French for CI + African cohorts, English for IN + explicit `X-BAKED-Language: en` requests.

**Sites migrated (5 total):**

| Site | File | Template | Language source |
|---|---|---|---|
| Driver password reset | `modules/driver/routes.py` | `driver_password_reset` | Driver `preferred_language` → `resolve_lang(request)` → FR |
| MART store approval | `modules/mart_partner/routes.py` | `mart_store_approved` | Partner `preferred_language` → country default (IN → EN, else FR) |
| MART partner staff invite | `modules/mart_partner/staff_routes.py` | `staff_invite` | Partner country default |
| Purchase-order submitted / acknowledged / shipped | `shared/purchase_orders/notifications.py` | `po_submitted` / `po_acknowledged` / `po_shipped` | Partner country default |
| Partner new-order alert | `modules/mart_partner/notifications.py` | *(kept as-is — pure French, in-line doc-comment points to `partner_new_order` slot in Phase D.2)* | — |

**New locale keys (FR + EN):**
- `emails.driver_password_reset` — subject / greeting / body / warning / signoff.
- `emails.mart_store_approved` — subject / greeting / intro / `cta_dashboard` / signoff (interpolates `name`, `business_name`, `store_code`).
- `emails.po_submitted` — subject / greeting / intro / `cta_view` / signoff (interpolates `po_code`, `line_count`).
- `emails.po_acknowledged` — subject / greeting / body / signoff (interpolates `po_code`).
- `emails.po_shipped` — subject / greeting / body / signoff (interpolates `po_code`, `supplier_name`, `warehouse_name`).

Every new template pair was regression-checked with a live `python -c` script that renders both FR and EN with representative params and asserts they differ.

**Language selection rules baked in:**
1. Model-level `preferred_language` wins when present (driver, partner).
2. Falls back to country default — French for CI + African markets, English for IN.
3. Request-scoped `X-BAKED-Language` from the frontend axios interceptor overrides both for endpoints where the caller can pick (e.g. driver forgot-password from the mobile app).

**Test coverage:**
- 15/15 pytest suite still green (`tests/test_i18n_backend.py`).
- Live-endpoint smoke: `POST /api/driver/auth/forgot-password` with FR + EN headers both return 200 with no backend errors.

**Backend still emits English (backlog):**
- `mart_partner/notifications.py` new-order alert — French-only by design (partners are CI-only today); English variant to ship once IN partner cohort lands.
- ~30 non-email `HTTPException` sites outside `apply/start` still emit raw English `detail`. Tracked as Phase D.2 in `/app/memory/I18N_PLAN.md`.

---


## 2026-03-07 — Workstream 3 Phase D · Backend Localisation — COMPLETE

Server-emitted strings (errors, emails, SMS) are now bilingual, driven by the caller's UI language. End-to-end path proven: frontend axios interceptor sets `X-BAKED-Language: fr|en` → backend `resolve_lang(request)` → `t(key, lang)` → localised `HTTPException.detail`.

**New backend module — `core.i18n`:**
- Loads JSON dictionaries from `/app/backend/i18n/locales/{fr,en}/*.json` once at import (`@lru_cache`).
- `t(key, lang, **params)` — dot-path lookup with FR → EN → key fallback + `str.format` interpolation.
- `resolve_lang(request)` — precedence: `X-BAKED-Language` header → `?lang=` query → `Accept-Language` → French.

**Locale bundles shipped:**
- `errors.json` — 21 keys across generic / auth / supplier / order / upload (FR + EN).
- `emails.json` — 8 templates (order_confirmed, order_delivered, magic_link, otp, staff_invite, supplier_approved, supplier_rejected, brand) with subject / preheader / greeting / intro / body / cta / warning / footer / signoff slots.
- `sms.json` — 8 one-liners (otp, order_confirmed, order_on_the_way, order_delivered, driver_assigned, driver_reminder, password_reset, supplier_approved).

**New backend helper — `core.emails.send_localised_email`:**
- Single HTML shell (brand header + preheader + body + CTA button + signoff + footer) for every transactional email.
- Text-part auto-derived from the same keys for accessibility / SMS-client fallback.
- Best-effort semantics (never raises) — mirrors existing `send_email_async` contract.
- Bonus: `render_sms(template, lang, **params)` returns the localised SMS body for direct hand-off to `SmsProvider.send()`.

**Frontend wiring — `lib/api.js`:**
- Every axios request now carries `X-BAKED-Language` derived from `localStorage.baked_language`. Toggling the FR/EN switcher immediately affects error toasts, emails and SMS on the next request — no explicit passthrough per call site.

**Live-endpoint proof — `POST /martbaked/sellers/apply/start`:**
- Migrated three raw English `HTTPException` messages to `t(…)` keys: `errors.supplier.business_type_invalid`, `errors.supplier.already_active`, `errors.supplier.already_submitted`.
- Verified via curl: `X-BAKED-Language: fr` returns *"Le type d'activité choisi n'est pas valide."*; `X-BAKED-Language: en` returns *"The selected business type is not valid."*.

**Test coverage — `backend/tests/test_i18n_backend.py`:**
- 15 tests, all passing. Covers `t()` fallback + interpolation + missing-param resilience + EN-fallback-when-FR-missing, `resolve_lang()` header/query/Accept-Language precedence, `send_localised_email()` FR/EN dispatch + CTA rendering + language fallback.

**Not migrated (deferred backlog):**
- Order confirmation / driver assignment call sites still emit hardcoded strings — the helpers are ready; adopting them across the 40+ existing `send_email_async` sites is a follow-up sweep tracked in `/app/memory/I18N_PLAN.md` Phase D.2.
- Backend error messages outside `apply/start` still raw English. Convert as sites are touched.

---


## 2026-03-06 (part 2) — Partner Landing full-page French — COMPLETE

Every remaining hardcoded string on `/Sell-on-baked` is now bilingual. Section-by-section:

- **TrustBar** — six pill items (Trusted by 5k+, Secure payments, AI-powered marketing, Fast settlement, 24/7 operations, Africa-first infrastructure) → `partner.trust.*`.
- **Opportunities cards (6)** — MART / FOOD / SHOP / SEND / AUTO / IMMO taglines, descriptions and the "Now onboarding" badge all sourced from `partner.opportunities.items.{key}` + `partner.opportunities.badge_onboarding`. Apply-CTA reused `partner.nav.apply_now`.
- **StatsSection (Why Partner — 6 tiles)** — value / label / hint per tile: customers, ops, ai, payments, marketing, analytics. All under `partner.stats.*`.
- **GrowthSection** — eyebrow, two-line title, body, 7 bullets, primary CTA all under `partner.growth.*` (bullet keys `b1`…`b7`).
- **Testimonials carousel (3 partners)** — Aïcha Konan / Kouassi Traoré / Mariam Diallo quotes, roles and locations under `partner.testimonials.items.{aicha|kouassi|mariam}`.
- **TimelineSection (5 steps)** — Submit Application → Verification → Training → Business Activation → Start Receiving Orders under `partner.timeline.steps.s1…s5` + section eyebrow + two-line title.
- **FinalCTASection + PartnerFooter** — already migrated in previous batch, verified consistent.

**Locale footprint added:** `~30 additional keys` on top of the earlier partner namespace, doubling the coverage of the marketing page. Every EN/FR pair round-trips via the shared TopNav / mobile-drawer `LanguageSwitcher`.

**Screenshots captured:**
- `Sell-on-baked` opportunities section: **OPPORTUNITÉS · Choisissez votre opportunité · Sélectionnez la catégorie…** + 6 cards fully French incl. **RECRUTEMENT OUVERT** badges and **Postuler** CTAs.
- `Sell-on-baked` stats section: **POURQUOI DEVENIR PARTENAIRE BAKĒD · Conçu pour grandir. Conçu pour l'Afrique.** + 6 tiles (**Clients potentiels · Opérations continues · Assistant business · Paiements rapides & sécurisés · Croissance marketing · Analyses intelligentes**).

**Left English (backlog):** none on `/Sell-on-baked` — the entire page is French-first now. Remaining Phase D–I items (Admin console labels, backend errors + emails, DB bilingual product columns) unchanged.

---


## 2026-03-06 — Workstream 3 Phase B follow-up · Visible-first migration — COMPLETE

Delivered the user's called-out gaps (homepage "Shop by category" / "Delivery in", full footer, all inside pages like "Sell on Baked" / "Partnership" / careers / help / contact) plus the ComingSoonLanding placeholder used by 24 footer routes.

**Files migrated:**
- `Footer.jsx` — rewritten to consume `common:footer.*` keys. Columns Liens utiles / Opportunités / Support fully bilingual; store badges + copyright translated.
- `ConfigHomepage.jsx` — Hero delivery panel (LIVRAISON EN, Livraison gratuite dès X, Frais de livraison, Commande minimum, Populaire près de chez vous); CategoryGrid eyebrow/title/link ("ACHETEZ PAR CATÉGORIE / Catégories / VOIR TOUT"); TrustStrip (Livraison ultra-rapide, Large gamme de produits, Meilleurs prix & offres, Retours faciles); ProductCarousel view-all link.
- `ComingSoonLanding.jsx` — refactored to i18n. `landing.json` FR/EN covers 25 slugs (careers, help, contact, blog, news, terms, privacy, partner, invest, franchise, delivery-partner, driver-registration, merchant-registration, shop/seller, food/partner, mart/seller/partner, auto/seller/partner, immo/agent/broker/partner, baked-delivery, about, investors).
- `PartnerLandingApp.jsx` (Sell-on-BAKĒD marketing page) — Navbar, Hero, Opportunities section, Why Partner section, Final CTA, and Footer all consume the new `partner` namespace. Card body copy for six opportunities and stats grid still English-only (backlog).

**New locale namespaces:**
- `landing` — 25 slug keys × FR/EN (footer landings + coming-soon placeholders).
- `partner` — nav, hero, opportunities, why, final_cta, footer × FR/EN (Sell-on-BAKĒD marketing page).
- `common.footer.*` — 20 keys covering site footer nav, sections and delivery panel labels.
- `common.trust.*` — TrustStrip icons on customer homepage.

**Fixes rolled up:**
- `i18n/index.js` — dropped `htmlTag` from detector chain so a pre-set `<html lang="en">` no longer pins the app to English. `caches: ["localStorage"]` only (no cookie caching) so stale cookies from previous sessions can't override French-first behaviour.
- `public/index.html` — root `<html lang="fr">`.
- `BakedContexts.jsx` — mount-time effect forces `i18n.changeLanguage(language)` so context + i18next stay in lock-step across the initial paint.
- `TopNav.jsx` — replaced fragile Popover-based FR/EN switcher (Radix portal was racing with i18n re-render, failing to reopen) with the shared inline `<LanguageSwitcher />`. `top-nav-language-switcher` testid preserved on wrapper for backward-compat with existing tests.

**Visible outcome (screenshots captured):**
- `/` — hero, delivery panel, category grid eyebrow/title/link, TrustStrip, and full footer all in FR.
- `/Sell-on-baked` — nav (Solutions / Devenir partenaire / Pourquoi BAKĒD / Ressources / Support / Se connecter / Postuler), hero ("Développez votre activité avec BAKĒD.", "Rejoignez des milliers d'entreprises..."), section headers, final CTA, footer all in FR.
- `/careers`, `/help`, `/contact`, `/blog`, `/terms`, `/privacy` — placeholder cards fully FR.

**Still English (backlog, tracked in `/app/memory/I18N_PLAN.md` Phase D–I):**
- PartnerLandingApp opportunity CARDs body copy, stats grid, testimonials, timeline (visible when scrolling below the fold on `/Sell-on-baked`).
- Admin console labels beyond nav (Phase G).
- Backend error messages + transactional emails (Phase D).
- Dynamic product `name` / `description` DB columns (Phase H).

---


## 2026-03-05 (evening) — QA v15 Workstream 3 Phase A · i18n Foundation — COMPLETE

**User-approved plan:** `/app/memory/I18N_PLAN.md` — Phase A + language-switcher polish across all 6 shells. Vendor: Emergent LLM key / Claude for future backfill. Admin path segments stay English (labels translate). Machine translation deferred; hand-written French for top ~50 critical strings shipped.

- **`i18next` + `react-i18next` + `i18next-browser-languagedetector` installed via yarn.**
- **`/app/frontend/src/i18n/index.js` (new)** — bundles 5 namespace files per locale (`common`, `customer`, `admin`, `seller`, `driver`), fallbackLng = `fr`, `saveMissing` warns in dev. Detector order deliberately drops `navigator` so every fresh visitor lands in French regardless of browser locale — English is only reached via the header toggle (persists to localStorage) or `?lang=en` deep-link.
- **`/app/frontend/src/i18n/LanguageSwitcher.jsx` (new)** — shared React component with three variants (`compact` two-pill, `menu` labelled row, `inline` text link). Every node carries `data-testid=lang-switcher` / `lang-switcher-fr` / `lang-switcher-en` so the testing agent can locate the toggle in any shell with a single selector.
- **10 locale JSON files** — hand-written French for cart, checkout, product, orders, home, auth, admin nav, seller apply wizard, driver dashboard/trip; parallel English strings for the QA team.
- **`AppProvider.setLanguage`** now calls `i18n.changeLanguage()` in the same effect that writes to `localStorage`, so `useTranslation` hooks re-render in lock-step with the context. `detectInitialLanguage` simplified to `saved → ?lang → 'fr'` (no navigator sniff) — French-first per client brief.
- **CartPage pilot** — `pages/CartPage.jsx` migrated to `useTranslation("customer")`. Live toggle: FR shows "Votre panier est vide / Ajoutez des articles pour commencer votre commande. / Découvrir les produits"; EN shows English equivalents. Order Summary heading, subtotal, delivery fee, total, mixed-cart note, sign-in CTA all keyed.
- **Language switcher wired across all 6 shells:**
  1. Desktop TopNav — existing popover (kept, already syncs)
  2. Mobile drawer footer — replaced ad-hoc FR/EN buttons with the shared `<LanguageSwitcher variant="compact" />`
  3. `MobileSettings` row — existing "Language" nav row (kept)
  4. Admin sidebar footer — new switcher below Sign out
  5. Seller portal sidebar footer — new switcher below Back to Sellers Home
  6. Driver Profile page — new "Language" row below Sign out button
  Plus: `SellerApplyWizard` header (public seller /apply flow) gets its own switcher so applicants can toggle FR/EN before login.
- **Testing agent iteration_81**: Cart FR/EN toggle round-trips correctly, deep-link `?lang=fr|en` overrides, no regressions to Workstreams 1/2/4 (SHOP + SEND + India parity all green). Two gap items surfaced (mobile home top-bar switcher missing, public seller /apply switcher missing) — both fixed in-session before finish. Remaining LOW items (unauth admin/driver login page switchers) parked in backlog.

**What is NOT translated yet (Phase B → I in the plan):** every page other than Cart. Categories, product detail, checkout, orders, wallet, profile, admin console labels, seller portal steps beyond header, driver ride sheets — all still show hardcoded English/French mix. That work is scoped and sequenced in `/app/memory/I18N_PLAN.md`.

---

## 2026-03-05 — QA v15 Workstreams 1 + 2 + 4 (SHOP QA · SEND rename · India parity) — COMPLETE

**Testing case.xlsx** priority order 1 → 2 → 4 → 3. Workstream 3 (French-first i18n) is planned in `/app/memory/I18N_PLAN.md`, awaiting user approval before code changes.

### Workstream 1 — SHOP Storefront QA
- **Item A** — `/shop/categories` uses `mx-auto max-w-7xl px-4 sm:px-6` for balanced left/right margins across breakpoints (no more edge-to-edge grid).
- **Item B** — `ShopHome.jsx / ProductCarouselSection` now fetches its own list scoped to the section's configured `filter` (category slug) + optional `subcategory`. Blank / `bestsellers` / `new` keep the shared homepage list so older seeds still work.
- **Item C** — `POST /martbaked/sellers/apply/start` accepts an optional `module: "shop" | "mart"`. When set to `shop`, the created supplier is tagged `modules=["SHOP"]` and shows up under `/admin/modules/shop/suppliers` Submitted tab. Existing draft applications gain `SHOP` appended (not overwritten) on re-apply. Frontend `SellerApplyWizard` sends the module flag automatically when mounted under `/shopbaked/sellers/apply`.

### Workstream 2 — SEND URL rename
- `/express/*` → `/send/*` for every customer-facing route.
- `/express` and `/express/*` legacy paths **soft-redirect** via a new `<ExpressLegacyRedirect>` bridge that preserves query + hash + trailing segments. Bookmarks, QR codes and shared links continue to work.
- Bottom nav, module tabs, mobile shell, `modules.js` route, express bottom nav, config homepage — all point to `/send`.
- **Module code, database enums, backend API prefix `/api/express/*` unchanged** — internal identifiers preserved as per the "URL rename only" contract.
- Testing agent iteration_80 verified all `/send/*` routes render, `/express/*` correctly redirects, backend API untouched.

### Workstream 4 — India data parity
- `SHOP_COUNTRIES = ("CI", "IN")` — full 19-category tree seeded for India.
- `SHOP_HOMEPAGE_COUNTRIES = ("CI", "IN")` — 5 CMS sections seeded for IN with India-specific hero copy ("Shipped across India", "Delhi NCR same-day"). CI copy untouched.
- `seed_shop_demo_products(session, country="IN")` — 181 IN products + 362 variants, one per subcategory, currency `INR`, prices scaled `× 0.14` from XOF and rounded so IN gets natural ₹ pricing (e.g. iPhone accessory tier ~₹500-3 500 instead of raw XOF numbers).
- MART `_seed_products` extended: both `PRODUCTS_CI` and `EXTRA_PRODUCTS_CI` are mirrored into IN with INR pricing + "Delhi NCR 20-30 min" descriptions. `country="IN"` products now populate `/api/mart/products?country=IN`.
- `ShopHome`, `ShopCategoriesIndex`, `ShopCategory` read `useApp().country?.code` and fire APIs with the active country instead of hard-coded `CI`. IN customers now land on `/shop` and see IN inventory + hero copy natively.
- Verified: `curl /api/shop/products?country=IN&limit=100` → 100 items in INR; `curl /api/shop/catalogue?country=IN` → 19 categories with subcategories; `curl /api/mart/products?country=IN&limit=100` → 100 IN MART products in INR.

### Workstream 3 — French-first i18n (PLANNING ONLY)
- `/app/memory/I18N_PLAN.md` — full 9-phase implementation plan spanning customer, admin, seller, driver + backend errors/emails. Library choice: **react-i18next**. Route strategy: dual-path with French canonical. Ready for user sign-off.
- No code touched.

Test coverage: iteration_80 → 4/4 backend suites + 4/4 frontend suites pass. Zero regressions on the Playwright SHOP wizard suite from 2026-03-04.

---


## 2026-03-04 — Playwright regression for SHOP seller Step-4 location picker — COMPLETE
Belt-and-braces coverage for the white-on-white autocomplete + India-PIN fixes shipped earlier today.

- **`backend/tests/test_shop_seller_location_picker.py` (new)** — 3 tests × 15 s total, all deterministic:
  * `test_location_autocomplete_visible_and_pickable[desktop]` — 1440×900 viewport. Types "Greater Noida 201310", asserts dropdown `background-color === rgb(255,255,255)`, first row luminance `< 128` (dark text), positive `z-index`, click resolves the address into `[data-testid="apply-location-formatted-address"]`, and the resolved value survives a scroll-induced re-render.
  * `test_location_autocomplete_visible_and_pickable[mobile]` — same journey at 390×844 so the responsive layout gets equal protection.
  * `test_ci_supported_country_still_accepted` — belt-and-braces: adding IN to `SUPPORTED` did not break CI. Confirms the picker mounts, is enabled, and preserves the same white-bg invariant when a suggestion happens to render.
- Uses the **real Google Places API** (dev key already in `frontend/.env`); the test `pytest.skip`s gracefully when Places is unreachable / rate-limited so upstream flake never turns CI red on a bug that isn't ours. The CSS + DOM assertions are the deterministic core.
- **Wizard change enabling the test** — `SellerApplyWizard.jsx` now honours `?step=<n>` in the URL when combined with `?app=<id>`, and `refresh()` learned a `keepCurrent` flag so the initial deep-link isn't clobbered by the server's `current_step` value. Non-invasive, in-place: the wizard still resets `current` after each `save → refresh` cycle so the resume-from-draft UX is unchanged.

Run: `cd /app/backend && python3 -m pytest tests/test_shop_seller_location_picker.py -q -n0` → **3 passed in ~15 s**. Ran three times in a row without flake.




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

## 2026-10-08 — Cron-Scheduled Vendor Payouts (P0)
- Added `.emergent/crons.yml` with hourly fire; each vendor's own schedule (daily / weekly Thursday / monthly / custom) decides if they are due in **Africa/Abidjan** time.
- Migration 0070: `vendor_payout_config.timezone`, `last_payout_run_at`, `last_payout_period_end`; `vendor_payouts.trigger` ("manual"|"cron") + `period_end_date`; new `vendor_payout_runs` audit table; unique index `ux_vp_cron_daily` for DB-level idempotency.
- New module `modules/vendor_settlement_cron.py` with pure schedule evaluator, bundler reusing the existing settlement engine, HTTP cron webhook (Bearer `WEBHOOK_CRON_SECRET`), Super Admin preview / run-now / runs log endpoints.
- Settlement engine strictly separated from money transfer: cron creates `scheduled` payouts, Super Admin still must `mark-paid`.
- Super Admin "Scheduled Payouts" tab under FOODbakēd Vendor Settlement with per-vendor table (commission, schedule, TZ, last payout, next scheduled, pending, eligible, would-pay, status) + Preview next payout run dry-run button + Run scheduler now override.
- Pytest coverage: 12 new tests — timezone math (Abidjan), monthly day clamping (31→28 in Feb), paused, below min, already-generated-today, dry-run never writes, webhook auth. All 24 vendor-settlement tests green.

## 2026-10-08 — P0 Core Customer Discovery (location-aware FOODbakēd)
- Migration 0071: `food_restaurants.delivery_enabled`, `delivery_radius_km` (nullable, 5 km default surfaced by the API), `pickup_enabled`, `polygon_zone`; coord-partial index; seeds the new `food_top_brands` CMS section for CI + IN.
- New module `backend/modules/food/discovery.py` — haversine helper + ETA engine (prep + distance / 25 km/h) + three endpoints:
  - `GET /api/food/discovery?country&lat&lng&mode&cuisine` (location-aware list)
  - `GET /api/food/brands/top` (one card per brand, nearest open branch wins)
  - `GET /api/food/discovery/check` (single-restaurant eligibility probe for checkout)
- `/api/food/home`, `/api/food/restaurants` and `/api/food/search` all take optional `lat` / `lng` / `mode` and enrich rows with `distance_km`, `eta_min/max`, `mode_eligible`. Country-only fallback preserved when the customer hasn't picked an address yet.
- Admin restaurant form (`AdminFood.jsx`) gained Address + Latitude / Longitude / Delivery radius / Delivery-enabled / Pickup-enabled fields with "Set address" & "Set radius" warnings when missing.
- Super Admin Homepage Management supports the new `food_top_brands` section type (title/subtitle in FR + EN, limit, auto|curated selection).
- Frontend FoodHome (`/food`): new `TopBrandsCarousel` renders black-on-dark / white-on-light (per product), reads `activeAddress`, snap-scroll + desktop arrows + swipe mobile; new amber banner nudges customers to pick an address when none is set; home refetches on `lat/lng/mode` change.
- Pytest `tests/test_food_discovery.py` 13/13 pass (haversine, ETA, Scenarios A/C/D/E, pickup wider radius, no-coords fallback, brand ETA, seeded section, search distance). Full discovery + favourites + cron settlement suites 31/31 pass. Frontend testing_agent verified all 15 feature scenarios green.
