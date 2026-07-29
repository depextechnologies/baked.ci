# BAKĒD Platform v1.0 — Implementation Memory

## Original Problem Statement
Multi-business digital commerce ecosystem for Africa (launch: Côte d'Ivoire) with 6 business apps — MART, FOOD, SHOP, EXPRESS, AUTO, IMMO — plus Super Admin, AI Command Center, Shared Wallet, Shared Auth, Shared Notifications, Shared Analytics. Configuration-Driven Modular Monolith. Original request specified NestJS + Postgres + Prisma + Redis + RabbitMQ + Next.js — after discussion the user chose to proceed on Emergent's supported stack (React + FastAPI + MongoDB) with the same architecture pattern replicated faithfully.

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

## Backlog (prioritised)
- **P0**: Checkout + Order flow (Phase 2), Payment provider abstraction, Wallet
- **P1**: Super Admin Platform (Phase 6), RBAC-guarded admin endpoints, AI Business Insights UI
- ✅ **EXPRESSbakēd — Booking Wizard Redesign per Fixing_Prompt.docx (2026-02-24)** — full desktop/tablet parity with the Home page's 45/55 layout.
   - **New component** `/app/frontend/src/components/express/ExpressWizardShell.jsx`:
     - Desktop (≥ md): 45% left = step form, 55% right = persistent live Google Map (sticky).
     - Mobile: full-screen form with a compact map card on top of every step.
     - `<WizardMap>` sub-component: pickup/drop markers (A/B pins), Google Directions polyline (yellow), auto-fit bounds, live distance + ETA + selected-vehicle chip overlays.
   - **All 5 wizard steps refactored** (Location, Receiver, Vehicle, Package, Estimate) — now render inside `<ExpressWizardShell>` instead of a full-width column. Old `<RouteSummary>` mini-card removed (data lives on the map now).
   - **Step 3 (Vehicle Select)** now uses official EXPRESSbakēd branded assets (`vehicleImage(code)` from `expressAssets.js`) with the same radial-glow treatment as the home cards — replacing the generic Lucide bike/truck icons.
   - **Step 5 (Estimate)** shows a branded vehicle thumbnail beside "Change" and a live vehicle chip overlay on the map.
   - **Kept intact**: header, wizard progress stepper, Continue footer, all backend calls, dispatch + WebSocket tracking flow.
   - **Verified**: Step 1, 3, 5 desktop screenshots at 1440×900 show the persistent map + branded assets; light theme continues to adapt via `hsl(var(--border/card/muted))`.
- **P1**: Real SMS OTP (Twilio Verify or Africa's Talking) — swap `OTP_PROVIDER` env
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
