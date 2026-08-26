# BAKED.CI — Multi-Developer Module Separation Assessment

**Status:** Phase 1 (assessment) — no code changes made yet.
**Author:** e1 (AI dev agent), 2026-02
**Requested by:** _Fixing_Prompt.docx_ (Sections 15–17)

---

## A. Current architecture

**Stack**
- Backend: FastAPI + SQLAlchemy async + Postgres, one process, `--workers 4` under supervisor. Realtime layer over Redis pub/sub.
- Frontend: React (CRA), react-router-dom, TailwindCSS + shadcn/ui, `@vis.gl/react-google-maps`.
- Auth: JWT (admin, driver, partner, supplier, customer) + Emergent-managed Google Auth (customers).
- DB: 25 Alembic migrations, one database, one schema.

**Repo layout today**

```
/app/backend/
   server.py                     # boots app, registers ~40 routers
   core/          (3.8k LOC)     # config, db, deps, models, security, mailer, providers
      models/                    # all SQLAlchemy models — SHARED SCHEMA
   shared/       (10.3k LOC)     # cross-module business services
      auth/  customer/  addresses/  admin/  ai/
      notifications/  config_svc/
      suppliers/  supplier_invoices/  purchase_orders/
   modules/       (9.5k LOC)     # feature modules (mixed maturity)
      mart/         → customer catalog + orders
      mart_partner/ → partner ops (inventory, staff, picker, replenishment)
      express/      → SENDbakēd customer/booking side (pre-Driver PWA)
      driver/       → SENDbakēd Driver PWA (Slice 2-9)
      realtime/     → WSS pub/sub (Slice 7-8)
   migrations/versions/           # 25 alembic files

/app/frontend/src/
   App.js                         # top-level route mounts (see below)
   apps/          (13.5k LOC)     # per-persona SPA shells
      customer/  admin/  driver/  send-track/
      partner-portal/  partner-hub/  partner-landing/
      martbaked-sellers/
   pages/         (12.5k LOC)     # legacy top-level pages + persona subdirs
      admin/  express/  mobile/  legal/
      (Cart/Category/Home/Product* at root — customer web)
   components/    (6.4k LOC)      # cross-cutting UI
      ui/ (shadcn)  layout/  auth/  address/
      admin/  express/  mart/  mobile/
      invoices/  notifications/  profile/  purchase-orders/
```

**Route mount table (App.js)**

| URL prefix                          | App              | Persona                |
|---|---|---|
| `/admin/*`                          | AdminApp         | Super admin / ops      |
| `/driver/*`                         | DriverApp        | SENDbakēd rider PWA    |
| `/send/track/:jobId`                | SendTrackApp     | Public customer track  |
| `/partner-portal/*`                 | PartnerPortalApp | Partner (MART + more)  |
| `/partner/*`                        | PartnerHubApp    | Partner marketing hub  |
| `/Sell-on-baked/*`                  | PartnerLandingApp| Partner onboarding LP  |
| `/martbaked/sellers/*`              | SellerApp        | MART customer          |
| `/martbaked/sellers/portal/*` (leg) | SellerPortalApp  | Supplier portal (old)  |
| `/martbaked/:sellerSlug/portal/*`   | SellerPortalApp  | Supplier portal (new)  |
| `/*`                                | CustomerApp      | Customer web/mobile    |

**API prefix table (server.py)** — 40 routers, grouped:

| Prefix (representative)          | Owner today          | Notes                          |
|---|---|---|
| `/api/auth/*`, `/api/customer/*`, `/api/addresses/*`, `/api/config/*`, `/api/ai/*` | Core                  | shared services                |
| `/api/admin/*` (+ several)       | Core (super-admin)   | 12+ admin sub-routers          |
| `/api/mart/*`, `/api/orders/*`   | MART                 | customer catalog + orders      |
| `/api/mart-partner/*` (7 sub-routers) | MART               | partner ops (staff, inv, picker) |
| `/api/express/*`                 | EXPRESS              | booking, live-track (old WS)   |
| `/api/driver/*`, `/api/send/track/*` | EXPRESS/Driver     | SENDbakēd driver PWA (new)     |
| `/api/ws/*`                      | Core (Realtime)      | WSS pub/sub (Redis-backed)     |
| `/api/suppliers/*`, `/api/purchase-orders/*`, `/api/invoices/*`, `/api/notifications/*` | Core (Commerce ops)  | cross-module supplier chain    |

---

## B. Current module detection

| Doc module     | Present today? | Backend code path                                          | Frontend code path                                         |
|---|---|---|---|
| **FOODbaked**  | ❌ Not started  | (none)                                                     | (none)                                                     |
| **MARTbaked**  | ✅ Substantial | `modules/mart/`, `modules/mart_partner/`                    | `apps/martbaked-sellers/`, `pages/admin/AdminMartCatalog.jsx`, `pages/mobile/*`, `pages/CartPage.jsx`, `pages/CategoryPage.jsx`, `pages/ProductListPage.jsx`, `pages/ProductDetailPage.jsx`, `pages/CheckoutPage.jsx`, `pages/OrderPages.jsx`, `components/mart/` |
| **SHOPbaked**  | ❌ Not started  | (none)                                                     | (none)                                                     |
| **AUTObaked**  | ❌ Not started  | (none)                                                     | (none)                                                     |
| **IMMObaked**  | ❌ Not started  | (none)                                                     | (none)                                                     |
| **EXPRESSbaked** | ✅ Substantial | `modules/express/`, `modules/driver/`, `modules/realtime/` | `apps/driver/`, `apps/send-track/`, `pages/express/`, `components/express/` |
| **Core**       | ✅ Broad, mixed | `core/`, `shared/`, most of `modules/admin/`, `notifications/`, `suppliers/`, `purchase_orders/`, `supplier_invoices/` | `apps/admin/`, `apps/customer/`, `apps/partner-portal/`, `apps/partner-hub/`, `apps/partner-landing/`, `components/ui/`, `components/auth/`, `components/layout/`, `components/address/`, `components/notifications/`, `components/profile/`, `pages/legal/`, `pages/HomePage.jsx`, `pages/ComingSoon*.jsx` |

**Two modules (MART, EXPRESS) exist. Four (FOOD, SHOP, AUTO, IMMO) are placeholders**
— the doc names them but there is no code for them yet.

---

## C. Shared dependencies (as-is)

**Backend — genuinely cross-module (belongs in Core / Shared):**
- `core/models/*` — one SQLAlchemy Base, one `users`, `partners`, `warehouses`, etc.
- `core/security.py` — JWT + password hashing (all personas use it).
- `core/db.py` — one async engine + `SessionLocal`.
- `shared/auth/` — auth surface, role decorators.
- `shared/customer/` — customer profile / wallet.
- `shared/addresses/` — reusable address book (used by MART + EXPRESS drop-off).
- `shared/config_svc/` — country config (CI, IN) — used by every module.
- `shared/notifications/` — SMS / in-app inbox (multi-persona).
- `shared/ai/` — Claude Sonnet Emergent LLM wrapper.
- `modules/realtime/` — Redis pub/sub broker → **belongs in Core (Realtime service)**, not per-module.
- **Commerce chain** (`suppliers/`, `supplier_invoices/`, `purchase_orders/`) — currently MART-only in behaviour, but the schema is cross-vertical (FOOD suppliers will reuse it). **Ambiguous** — see risk R2 below.

**Frontend — genuinely shared:**
- `components/ui/*` (shadcn) — 40+ primitives, everyone uses them.
- `components/layout/` — Nav, Footer, BakedLogo — shell chrome.
- `components/auth/` — PhoneLoginDialog, EmergentGoogleButton.
- `components/address/` — reusable address selector (Google Places).
- `apps/customer/` — customer shell (nav, home, profile, wallet) — feeds every module.
- `pages/HomePage.jsx`, `pages/ComingSoon*.jsx` — hub landing.
- `contexts/BakedContexts.jsx` — country/geolocation/currency context.

**Frontend — ambiguous / needs reclassification:**
- `pages/mobile/Mobile*.jsx` — 17 files, ALL currently wired to MART (cart, category, checkout, tracking) but the file names are generic. Two options: (a) move to `modules/mart/` verbatim, (b) split — `MobileHome.jsx`/`MobileProfile.jsx`/`MobileWallet.jsx` stay in Core, the rest go to MART.
- `apps/partner-portal/`, `apps/partner-hub/`, `apps/partner-landing/` — currently MART-only but designed to host multiple business types.

---

## D. Conflicts / risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | `core/models/` is **one file per entity family**, not one file per module. E.g. `mart.py` has 8 classes, `driver.py` has 4. If two devs add rows to `catalog_inventory.py` on different branches, merge conflicts. | Medium | Split per module: `core/models/mart/`, `core/models/express/`, etc. (Phase 2, safe rename.) |
| R2 | Supplier / PO / invoice / notification chains sit in `shared/` but behave like MART today. FOOD will reuse them. Ambiguous ownership. | Medium | Formally **move to Core Commerce Ops** with a documented "any module can consume via `shared.suppliers.*`" contract. |
| R3 | 40 routers registered in `server.py` — a single dev doing a merge on `server.py` will conflict weekly. | High | Introduce a **module registry**: each module exports `def register(api_router): ...`. `server.py` iterates `MODULES = [core, mart, express, driver, realtime, ...]`. Zero merge friction. |
| R4 | Legacy top-level pages (`pages/CartPage.jsx`, `pages/CategoryPage.jsx`, etc.) are MART but sit at the root of `pages/`. If FOOD adds a cart page, name collision. | High | Move ALL MART-only top-level pages to `apps/mart/` (new folder) or `modules/mart/pages/` in Phase 2. |
| R5 | `modules/mart_partner/` is 5k LOC and mixes partner ops (staff/picker) with mart-specific catalog code. Actual boundary is fuzzy. | Medium | Two-phase: (a) rename to `modules/mart/partner/` so it's transparently owned by the MART dev; (b) later, if we find true cross-vertical partner behaviour, extract only that slice to Core. |
| R6 | Migrations are numbered sequentially (`0001` → `0025`). Two devs can't add migrations on parallel branches without stepping on each other. | High | Convention: prefix migration IDs with module (`0026_mart_...`, `0027_food_...`) — Alembic supports parallel chains via `depends_on`. **Or** designate the Tech Lead as sole migration author. |
| R7 | `frontend/src/App.js` mounts all routes — one file, everyone edits. | High | Same fix as R3 but for React Router: expose a `getRoutes()` from each module's shell. `App.js` maps over module modules. |
| R8 | Currently no CODEOWNERS / no eslint boundary rule. Nothing prevents FOOD dev from editing MART code. | Medium | Add `CODEOWNERS`, add `eslint-plugin-boundaries` config with the module→module import matrix. |
| R9 | 4 of 6 modules don't exist. Assessment must not create empty scaffolding that later diverges from the doc's real intent. | Medium | Only scaffold module folders on demand when their first dev picks up a feature. Reserve the URL prefixes now (routing stubs → coming-soon page). |
| R10 | Preview URLs, `.env` keys, and supervisor configs are shared. Any module dev can accidentally break the preview. | Low | Not a code issue — write ops runbook + PR checklist. |

---

## E. Recommended target structure

**Do not create six disconnected apps** (doc §17). We keep one platform. Concretely:

```
/app/backend/
    server.py                    # tiny: iterate MODULES and call .register()
    modules_registry.py          # NEW — list of module packages
    core/                        # unchanged (interface stable)
       models/                      # SPLIT: mart/*, express/*, food/* subdirs
       config.py  db.py  security.py  serializers.py
    shared/                      # unchanged (interface stable)
       auth/  customer/  addresses/  notifications/
       config_svc/  ai/  admin/
       suppliers/  supplier_invoices/  purchase_orders/    # commerce ops
    modules/
       mart/            # SUPER-package: rolls up modules/mart/* + modules/mart_partner/*
          routes.py            (customer-side catalog + orders)
          partner/             (was modules/mart_partner/*)
          models/              (was portions of core/models/mart.py)
          register.py          → adds routers to api_router
       express/         # SUPER-package: rolls up modules/express + modules/driver + …/realtime
          bookings/            (was modules/express/*)
          driver/              (was modules/driver/*)
          realtime/            (was modules/realtime/*)
          register.py
       food/            # PLACEHOLDER — coming-soon router + docs
       shop/            # PLACEHOLDER
       auto/            # PLACEHOLDER
       immo/            # PLACEHOLDER
    migrations/versions/       # convention: prefix with module (mart_, express_, food_, core_)

/app/frontend/src/
    App.js                       # iterates MODULES and appends routes
    modules_registry.js
    core/                        # NEW — hosts shared cross-module utilities
       components/ui/           (was frontend/src/components/ui/)
       components/layout/       (was frontend/src/components/layout/)
       components/auth/
       components/address/
       contexts/
       hooks/
       utils/
    modules/
       mart/
          pages/               (was pages/Cart*, Category*, Checkout*, Product*, mobile/*)
          components/          (was components/mart/*)
          app/                 (was apps/martbaked-sellers/*)
          routes.js
       express/
          pages/               (was pages/express/*)
          components/          (was components/express/*)
          driver/              (was apps/driver/*)
          send-track/          (was apps/send-track/*)
          routes.js
       food/            # PLACEHOLDER
       shop/            # PLACEHOLDER
       auto/            # PLACEHOLDER
       immo/            # PLACEHOLDER
    apps/                        # SHRINKS — only truly cross-persona shells remain
       customer/  admin/  partner-portal/  partner-hub/  partner-landing/
    pages/                       # SHRINKS — only Home, ComingSoon, legal stay here
```

**Reservations for the 4 not-yet-built modules:**
- URL prefixes reserved with coming-soon stubs: `/food/*`, `/shop/*`, `/auto/*`, `/immo/*`, `/api/food/*`, etc.
- Docs template shipped so each dev writes their own `docs/modules/FOODbaked.md`, etc.
- No empty backend routes for FOOD/SHOP/AUTO/IMMO beyond a health-check — avoid dead-code drift (R9).

---

## F. Developer ownership map

| Dev | Module | Backend paths | Frontend paths | Docs |
|---|---|---|---|---|
| Dev 1 | **FOODbaked** | `modules/food/**` + `migrations/versions/*food_*` | `frontend/src/modules/food/**` | `docs/modules/FOODbaked.md` |
| Dev 2 | **MARTbaked** | `modules/mart/**` + `migrations/versions/*mart_*` | `frontend/src/modules/mart/**` | `docs/modules/MARTbaked.md` |
| Dev 3 | **SHOPbaked** | `modules/shop/**` + `migrations/versions/*shop_*` | `frontend/src/modules/shop/**` | `docs/modules/SHOPbaked.md` |
| Dev 4 | **AUTObaked** | `modules/auto/**` + `migrations/versions/*auto_*` | `frontend/src/modules/auto/**` | `docs/modules/AUTObaked.md` |
| Dev 5 | **IMMObaked** | `modules/immo/**` + `migrations/versions/*immo_*` | `frontend/src/modules/immo/**` | `docs/modules/IMMObaked.md` |
| Dev 6 | **EXPRESSbaked** | `modules/express/**` + `migrations/versions/*express_*` | `frontend/src/modules/express/**` | `docs/modules/EXPRESSbaked.md` |
| **Tech Lead** | Core + Shared + integration + deployment | `core/**`, `shared/**`, `server.py`, `modules_registry.py`, migrations under `core_*`, supervisor + `.env`, all release ops | `frontend/src/core/**`, `frontend/src/apps/{customer,admin,partner-*}/`, `App.js`, `modules_registry.js`, root `pages/{Home,ComingSoon,legal}`, `contexts/BakedContexts.jsx` | `docs/architecture/**` |

Enforcement (Phase 3): `CODEOWNERS`, PR labels auto-applied by path, `eslint-plugin-boundaries` config, backend import-linter rules.

---

## G. Migration plan — safe, phased, reversible

**Phase 1 · Assessment (this document)** — 0 code changes, 100% reversible.

**Phase 2 · Non-destructive scaffold** — ~1 day, no behaviour change.
1. Create `docs/modules/*.md` templates + `docs/architecture/MODULE_BOUNDARIES.md` (this file).
2. Add `backend/modules_registry.py` — but keep `server.py` as-is (registry becomes the "future path"; nothing breaks).
3. Add `frontend/src/modules_registry.js` — same principle.
4. Create empty `backend/modules/{food,shop,auto,immo}/__init__.py` with a `register(api_router)` that mounts `/api/{food,…}/health` returning `{status:"coming_soon"}`.
5. Create empty `frontend/src/modules/{food,shop,auto,immo}/routes.js` mounting a coming-soon page.
6. Add `CODEOWNERS`.
7. Add ESLint boundaries config (warn, not error, first).
8. Regression: run existing test suites — MUST be zero delta.

**Phase 3 · Non-invasive rehousing of MART & EXPRESS** — 1-2 days per module.
- Move `modules/mart_partner/` → `modules/mart/partner/` (import rewrite, no behaviour change).
- Move `frontend/src/apps/martbaked-sellers/` → `frontend/src/modules/mart/app/`.
- Move MART pages (`CartPage`, `CategoryPage`, `ProductListPage`, `ProductDetailPage`, `CheckoutPage`, `OrderPages`, all `pages/mobile/*` except Home/Profile/Wallet) into `modules/mart/pages/`.
- Move `apps/driver/` + `apps/send-track/` + `pages/express/` + `components/express/` → `frontend/src/modules/express/`.
- After each move, regression = pytest + one screenshot smoke.

**Phase 4 · Core carve-out** — 1 day.
- Move `frontend/src/components/{ui,layout,auth,address}` → `frontend/src/core/components/`.
- Move `frontend/src/contexts/` → `frontend/src/core/contexts/`.
- Alias imports (`@/core/*`) so nothing in modules changes.

**Phase 5 · Model split** — 1 day.
- Break `core/models/mart.py` (8 classes) into `core/models/mart/*.py`.
- Break `core/models/express.py` (2 classes) into `core/models/express/*.py`.
- Same for other multi-class files. Keep re-exports in `__init__.py` so external imports don't break.

**Phase 6 · Governance** — 0.5 day.
- Flip ESLint boundaries from `warn` to `error`.
- Add import-linter to Python CI (block `modules/mart/**` importing `modules/express/**`).
- Add PR template with "which module did I touch?" checkbox.

**Rollback per phase:** each phase is one PR; revert = one PR revert. No database migration is required for Phases 2–4. Phase 5 renames modules but no schema changes.

---

## H. Key non-goals (per doc §14 and §17)

- No framework migration (still FastAPI + React + Postgres + Redis).
- No new database.
- No API contract breakage — legacy `/api/mart-partner/*`, `/api/express/*` etc. remain live during and after the refactor.
- No destructive Git operations. Branches recommended (§11) but not created automatically.
- Not creating six disconnected apps — one platform, one Core, six modules.
- Not scaffolding empty code inside FOOD/SHOP/AUTO/IMMO beyond a coming-soon health check and doc stubs (avoid dead-code drift).

---

## I. Immediate next step

**Awaiting your approval to start Phase 2 (Non-destructive scaffold).** Phase 2 is small, reversible, and lands the docs + registries + coming-soon stubs without moving a single existing file.

If you'd rather I execute a different phase order (e.g. do the model split first, or do EXPRESS rehousing before MART), tell me.
