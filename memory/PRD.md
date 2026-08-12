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
- ⏳ **Remaining Batch 3 work**:
    - Inter-store Transfers with DRAFT→REQUESTED→APPROVED→IN_TRANSIT→RECEIVED lifecycle
    - Inventory Exceptions module (aggregated pending issues by category)
    - Order-reservation locking hardening (`SELECT … FOR UPDATE`)
    - Picker / Packer / Dispatch worker screens (Phase 3 core fulfillment loop)
- ⏳ Slice H · Return / Refund handling
- ⏳ Slice D · Analytics dashboard
- ⏳ Fulfillment loop (picker/packer/driver screens) — Phase 3

