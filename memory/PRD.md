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
   - Verified end-to-end via curl (earn 3200 → redeem 1000 → balance 5400 after 2 orders) + mobile screenshots (checkout tile, confirmation card, rewards list).

## Backlog (prioritised)
- **P0**: Checkout + Order flow (Phase 2), Payment provider abstraction, Wallet
- **P1**: Super Admin Platform (Phase 6), RBAC-guarded admin endpoints, AI Business Insights UI
- **P1**: Real SMS OTP (Twilio Verify or Africa's Talking) — swap `OTP_PROVIDER` env
- **P2**: FOOD / SHOP / EXPRESS / AUTO / IMMO business modules
- **P2**: Partner Portal, Driver Portal
- **P2**: Notifications engine, Analytics, Search (OpenSearch), Media (MinIO)
- **P2**: RabbitMQ swap for the event bus (interface preserved)
