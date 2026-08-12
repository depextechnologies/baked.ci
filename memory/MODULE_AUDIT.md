# MARTbakēd — Phase 1 Module Audit

**Date:** Feb 2026
**Author:** E1 (Emergent) — post-handoff audit before Phase 2 execution
**Scope:** MARTbakēd (Super Admin & Partner/Dark Store) — MVP tenancy = 1 Partner → 1 Store → 1 Warehouse.

Legend: ✅ Complete · 🟡 Partial · 🔴 Missing / placeholder · 🚫 Deferred (post-MVP)

Priority: **P0** must-ship for MVP, **P1** important, **P2** nice-to-have.

---

## 0. Foundation (auth, tenancy, RBAC)

| Concern | Status | Detail |
|---|---|---|
| Postgres schema, Alembic migrations 0001→0006 | ✅ | Warehouse hierarchy tables already exist (`warehouse_zones/aisles/racks/shelves/bins`) |
| Multi-role JWT (customer, partner-owner, partner-staff, admin) | ✅ | `require_role`, `require_store_context` |
| `partner_staff` w/ employee_code + roles (`owner/manager/packer/cashier/supervisor/inventory_manager/warehouse_manager/customer_support`) | ✅ | Migration 0005 |
| Store-context isolation (`_staff_store_id` on partner, cross-store 403) | ✅ | `_assert_owns_warehouse` |
| MVP-tenancy UI enforcement (hide multi-store switcher) | 🟡 | Store-context banner exists; NAV items OK. No store selector present — but banner mentions "signed in as" — user asked to also hide this. Refine in Phase 2 opening step. |
| Public partner application → Admin approval → Partner Portal → Warehouse setup | ✅ | Atomic approval, temp password email, audit log |

---

## 1. Super Admin modules

### 1.1 Overview / Dashboard
- Frontend: ✅ `AdminDashboard` shows platform KPIs (customers, orders, revenue by ccy, module tiles)
- Backend: ✅ `GET /admin/dashboard`
- **Status:** ✅ Complete (P0)

### 1.2 Countries / Cities / Roles / Admin Users
- ✅ Full CRUD in `AdminPages.jsx` + backend routes.
- **Status:** ✅ Complete (P0)

### 1.3 Stores (platform-wide)
- Frontend: ✅ `AdminStores.jsx` (list, lifecycle transitions, map preview)
- Backend: ✅ `store_routes.py` (GET, POST, PATCH, DELETE, lifecycle transitions)
- **Status:** ✅ Complete (P0)

### 1.4 Partner Applications (per-module)
- Frontend: ✅ `ModulePartnerApplications.jsx` (list, drawer, confirm/success dialogs, map preview)
- Backend: ✅ `mart_partner/routes.py` — mark-under-review, request-info, reject, approve (atomic + email)
- **Status:** ✅ Complete (P0)

### 1.5 Vendors (module-scoped)
- Frontend: ✅ `ModuleVendors` — approve/activate/reject/suspend, docs upload
- Backend: ✅ `module_routes.py`
- **Status:** ✅ Complete — but note MARTbakēd doesn't really use "vendors"; superseded by Partners for MART. (P1 — keep for MART? Currently duplicative.)

### 1.6 Catalogue (Categories / Subcategories / Brands / Products)
- **DB:** ✅ `mart_categories`, `mart_subcategories`, `mart_products`
- Frontend Admin:
  - Products: 🟡 `ModuleProducts` — **read-only list only**. No create/edit/delete. No approval workflow for partner-submitted products.
  - Categories/Subcategories: 🔴 **No admin UI at all**.
  - Brands: 🔴 No dedicated Brand table nor UI (brand is a `String` field on product).
- Backend Admin:
  - `GET /admin/modules/mart/products` ✅ (read-only)
  - `POST/PATCH/DELETE /admin/mart/categories` 🔴
  - `POST/PATCH/DELETE /admin/mart/subcategories` 🔴
  - `POST/PATCH/DELETE /admin/mart/products` 🔴
  - `GET /admin/mart/partner-product-submissions` (approval queue) 🔴
- **Status:** 🔴 **P0 GAP** — Phase 2 priority #1.

### 1.7 Inventory (SA cross-store view)
- Frontend: 🔴 Placeholder page — `ModuleComingSoon "Inventory management"` in AdminApp routes.
- Backend: 🔴 No admin inventory endpoint.
- Data source: `partner_products.stock_qty` (single scalar per SKU per store).
- **Status:** 🔴 **P0 GAP** — needs SA inventory dashboard summarising stock across stores.

### 1.8 Orders
- Frontend: ✅ `ModuleOrders` — list w/ filter by status; read-only.
- Backend: ✅ `GET /admin/modules/mart/orders`
- Detail drilldown / actions: 🟡 read-only list only, no per-order drill-down showing picker/packer/driver/timestamps.
- **Status:** 🟡 (P1) — MVP-acceptable read; enrich later.

### 1.9 Customers
- Frontend: ✅ `ModuleCustomers` — searchable list w/ orders + spend.
- **Status:** ✅ (P1)

### 1.10 Drivers
- Frontend: ✅ CRUD + lifecycle transitions.
- **Status:** ✅ (P1)

### 1.11 Finance
- Frontend: ✅ `AdminFinance` — revenue by currency, module split.
- Backend: ✅ `/admin/finance`
- **Status:** ✅ (P1 baseline)

### 1.12 AI Operations (Command Center, Insights)
- Frontend: ✅ prompt CRUD + insights runner.
- **Status:** ✅ (P2 — leave alone in Phase 2; per user directive).

### 1.13 Analytics
- Frontend: ✅ `AdminAnalytics`
- **Status:** ✅ (P2)

### 1.14 Promotions
- Frontend: 🔴 `ModuleComingSoon`
- Backend: 🔴 none
- **Status:** 🔴 Deferred to Phase 4 (P1).

### 1.15 Support (tickets)
- Frontend: 🔴 `ModuleComingSoon`
- Backend: 🟡 `SupportTicket` table exists but no admin endpoints.
- **Status:** 🔴 Deferred to Phase 4 (P1).

### 1.16 Notifications
- Frontend: 🔴 no admin UI.
- Backend: ✅ Twilio SMS + SMTP wired via `notifications.py` — actually sends on approval/order events.
- **Status:** 🟡 (P1) — center UI can wait.

### 1.17 Settings
- Frontend: ✅ `AdminSystemSettings`, `AdminApiManagement`, `AdminInfrastructure`
- **Status:** ✅ (P1)

### 1.18 Audit Logs
- Frontend: ✅ `AdminAudit`
- Backend: ✅ `partner_staff_audit_log` + generic audit
- **Status:** ✅ (P1)

---

## 2. Partner / Dark Store modules

### 2.1 Login (owner + staff w/ Store ID + Employee ID)
- ✅ `PartnerLoginPage`, `StaffLoginPage`, first-login reset. (P0 done)

### 2.2 Dashboard
- ✅ 4 real metrics (orders today, revenue today, products live, inventory items), onboarding checklist. (P0 done)

### 2.3 Business Profile
- ✅ Read-only view. (P1)

### 2.4 Warehouse hierarchy (Zone → Aisle → Rack → Shelf → Bin)
- Frontend: ✅ `WarehouseEditor.jsx` — full nested tree editor
- Backend: ✅ `GET/POST/PATCH/DELETE /partner/warehouse/{wh}/nodes` — 5 levels with parent constraints
- **Status:** ✅ **Complete (P0)** — foundation for picking.

### 2.5 Products (Partner)
- Frontend: ✅ `ProductsPage` — search master catalog + link OR create custom SKU + edit/hide/delete
- Backend: ✅ `link_master_product`, `create_custom_product`, patch, delete
- Approval workflow: 🔴 **Partner-created custom products currently auto-live** — Fixing_Prompt requires SA approval before Publish.
- **Status:** 🟡 **P0 GAP** — enforce approval workflow.

### 2.6 Inventory (Partner)
- Backend: 🟡 stock is a flat `partner_products.stock_qty` scalar. No reserved / damaged / expired / movements ledger.
- Frontend: 🔴 no dedicated Inventory page in NAV — Products page shows a simple stock cell.
- **Status:** 🔴 **P0 GAP** — introduce inventory & movements.

### 2.7 Product ↔ Physical Location (Bin)
- Backend: 🔴 no `partner_product_locations` table linking `partner_product_id ↔ bin_id`.
- **Status:** 🔴 **P0 GAP** — the picker cannot function without this.

### 2.8 Orders (Partner Order Queue)
- Frontend: ✅ `OrdersPage` — status tabs (new/accepted/packing/ready/handed_off/completed/cancelled), state machine buttons
- Backend: ✅ transitions with stock restore on cancel
- **Status:** ✅ (P0) — but currently no separate Picker / Packer screens (Phase 3).

### 2.9 Picking / Packing screens (Picker & Packer worker UIs)
- **Status:** 🔴 P0 for Phase 3 (out of scope this iteration).

### 2.10 Staff Management (Team)
- ✅ `TeamPage.jsx` — CRUD w/ RBAC. (P0 done)

### 2.11 Wallet
- ✅ `WalletPage.jsx` — top up, withdraw, ledger. (P1 baseline)

### 2.12 Reports / Analytics (Partner)
- 🔴 no dedicated page. Dashboard covers "today at a glance".
- **Status:** 🔴 (P1) — deferred.

### 2.13 Support (Partner tickets)
- 🔴 not in nav.
- **Status:** 🔴 (P1) — deferred.

### 2.14 Settings
- 🔴 not in nav.
- **Status:** 🔴 (P1) — deferred.

---

## 3. Phase 2 GAP List — must build in this iteration

Ordered by user's list. Each item = new work.

| # | Item | Where | Backend? | Frontend? | Priority |
|---|---|---|---|---|---|
| 1 | Admin **Category CRUD** UI + API | `/admin/mart/categories` | Add | Add | P0 |
| 2 | Admin **Subcategory CRUD** UI + API | `/admin/mart/subcategories` | Add | Add | P0 |
| 3 | Admin **Brand CRUD** (new table `mart_brands`) | `/admin/mart/brands` | Add table + API | Add | P0 |
| 4 | Admin **Product CRUD** UI + API (master catalog) | `/admin/mart/products` | Add | Add | P0 |
| 5 | Variants — model within `mart_products`: keep single row + optional `variants JSONB` for MVP simplicity (spec cost too high otherwise) | — | Extend model | Extend form | P0 |
| 6 | SKU code (`sku_code`), Barcode (`barcode`) on `mart_products` | `mart_products` alter | Migration 0007 | Form field | P0 |
| 7 | Pricing — already covered on product | — | ✅ | ✅ | P0 |
| 8 | **Product approval workflow** — new `partner_products.approval_status` (`draft/pending/approved/rejected/changes_requested`) + admin queue + notes | `/admin/mart/partner-products/pending` | Migration + APIs | Approval queue UI + Partner "pending approval" badges | P0 |
| 9 | Partner product enable/disable — already ✅ (`is_active`) | — | ✅ | ✅ | P0 |
| 10 | **Inventory system** — new `partner_inventory` row per SKU with fields: `available_qty`, `reserved_qty`, `damaged_qty`, `expired_qty`, `low_stock_threshold` | new table `partner_inventory` | Migration + APIs | New Inventory page in partner portal + SA inventory summary | P0 |
| 11 | **Stock movements ledger** — new `partner_stock_movements` (id, partner_product_id, kind, delta_qty, reason, actor_id, created_at). Also enforce **never negative**. | new table | Migration + service | Movements list in Inventory page | P0 |
| 12–18 | Warehouse hierarchy (Warehouse/Zone/Aisle/Rack/Shelf/Bin) | ✅ already built | — | — | ✅ |
| 19 | **Product ↔ Bin location assignment** — new `partner_product_locations` (partner_product_id, bin_id, quantity_at_location, is_primary) | new table | Migration + APIs | UI to attach a SKU to a bin (in ProductsPage or WarehouseEditor) | P0 |
| 20 | **Stock by physical location** — API + report | GET `/partner/inventory/by-location` | API | Table view | P0 |

Refactor: **Hide multi-store selector/switcher** — MVP tenancy enforcement (no store switcher present in current UI, but sidebar shows warehouse code + banner. Add a hidden feature flag guard so we never accidentally add one back until post-MVP).

---

## 4. Explicit NO-GO items (per user)

- 🚫 Do NOT touch AI operations in this iteration.
- 🚫 Do NOT rebuild functionality already present.
- 🚫 Do NOT delete multi-store DB foundation (keep `partner_id`, `store_id`, `warehouse_id`).
- 🚫 Do NOT introduce a store switcher / multi-store dashboards / multi-store reports.

---

## 5. Phase 2 Completion Criteria

A phase-2 module is complete when:
1. Alembic migration applied cleanly.
2. Backend CRUD + validation + RBAC + never-negative enforcement.
3. Admin UI or Partner UI exists (as applicable).
4. Approval workflow honoured (partner → pending → approved/rejected).
5. Empty states / loading / error states real, not placeholders.
6. Basic tests pass (pytest for backend, screenshot smoke).

---

*This audit is the source of truth for the remainder of Phase 2. Everything below "Phase 3" is intentionally out of scope for this iteration.*
