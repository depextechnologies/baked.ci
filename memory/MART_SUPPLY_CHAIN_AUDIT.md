# MARTbakēd Supply-Chain Audit — Phase 0

**Date:** Feb 2026
**Prompt:** `Inventory_Prompt.txt` v3 (86p6gulf) — Complete supply-chain platform program
**Rule of this document:** No code changes yet. This is the mandatory pre-implementation baseline per §33 + Phase 0. Every subsequent phase must reference this file.

Legend:
- ✅ **EXISTS** — feature is built, tested, and integrated
- 🟡 **PARTIAL** — foundation exists but is incomplete
- 🔴 **MISSING** — no code / DB / API yet
- 🚫 **BROKEN** — exists but does not meet the acceptance standard in §37
- ⚠️ **DUPLICATE** — competing implementations that must be reconciled

Alembic head at time of audit: **`0010_store_transfers`**

---

## Section-by-section coverage of the Inventory Prompt

### §1 · MVP tenancy (1 partner → 1 store → 1 warehouse)
- **UI**: ✅ Store switcher hidden per prior directive.
- **DB**: ✅ multi-store foundation preserved (partner_id, warehouse_id, store_id).
- **Action**: none.

### §2 · Core operating model (13-step chain)
The chain runs: Master Product → **Supplier Product Mapping** → Assortment → **Purchase Order** → **Supplier Dispatch** → Receiving → GRN → Verification → Put-away → Location → Inventory → **Replenishment** → Order → Reservation → Picking → Packing → Dispatch → Driver → Customer.

Coverage right now:

| Step | Status | Notes |
|---|---|---|
| Master Product          | ✅        | `mart_products` (Phase 2). Missing MRP/cost/margin/tax fields — see §5. |
| Supplier Product Mapping | 🔴       | No table exists. |
| Dark Store Assortment   | ✅        | `partner_products` links a master SKU to a store. |
| Purchase Order          | 🔴        | No PO tables / routes / UI. Existing `PartnerReplenishment` is admin-side stock request, **not a PO to a supplier**. |
| Supplier Dispatch       | 🔴        | Depends on PO — missing. |
| Receiving               | ✅        | `partner_receipts` + items. Missing batch/lot/expiry capture. |
| GRN document            | 🟡        | Receipts serve as GRN in-app but **no PDF/Excel generator**. |
| Quality/Quantity verify | ✅        | Verify → Put-away lifecycle enforced. |
| Put-away                | ✅        | Optional bin selection on each receipt line. |
| Warehouse location      | ✅        | Full Zone→Aisle→Rack→Shelf→Bin. `partner_product_locations` join. |
| Inventory               | ✅        | `partner_inventory` with available/reserved/damaged/expired + never-negative CHECKs. |
| Replenishment           | ✅        | Admin-owned queue with lifecycle. Not linked to a supplier / PO yet. |
| Customer Order          | ✅        | Order lifecycle exists in `mart_partner/routes.py`. |
| Stock Reservation       | 🟡        | Reserved qty column exists but no atomic `SELECT … FOR UPDATE` on order creation. |
| Picking                 | 🔴        | No picker screen. Order status flips but no bin-by-bin task list. |
| Packing                 | 🔴        | Same. |
| Dispatch → Driver       | 🟡        | Order state includes `handed_off`; no dedicated dispatch screen. |

### §3 · Warehouse operational backbone
- Schema: ✅ (`warehouse_zones/aisles/racks/shelves/bins`).
- Partner UI: ✅ (`WarehouseEditor.jsx`).
- SA visibility: 🟡 read-only bin paths embedded in transfers/inventory drilldowns, but no dedicated "Warehouse tab" in Control Tower.
- Location path in picker: 🔴 blocked until picker screen exists.

### §4 · Catalogue distinction (Master · Assortment · Supplier · Physical)
- Master: ✅ `mart_products` + `mart_categories`/`mart_subcategories`/`mart_brands`.
- Assortment (per-store enable/disable): ✅ `partner_products.is_active`.
- Supplier catalogue: 🔴 no supplier schema at all.
- Physical inventory: ✅.

### §5 · Product creation — production-ready fields
`mart_products` today has: name, brand (as string), category_slug, subcategory_slug, unit, price, was_price, currency, currency_symbol, image, images (JSONB), badge, in_stock, description, sku_code, barcode, variants (JSONB), status, brand_id.

Missing per the prompt:

| Field                        | Status | Notes |
|---|---|---|
| manufacturer                 | 🔴 | new column |
| short_description            | 🔴 | new column |
| product_type                 | 🔴 | consider enum |
| tags                         | 🔴 | JSONB |
| ean_upc                      | 🔴 | separate from barcode |
| supplier_sku (default)       | 🔴 | belongs on `supplier_product_mapping` |
| tax_code / hsn               | 🔴 | new column |
| batch_tracking flag          | 🔴 | new column |
| expiry_tracking flag         | 🔴 | new column |
| unit_of_measure              | 🟡 | today `unit` is a free-string ("1 kg") |
| pack_size / net_qty / gross_qty | 🔴 | new columns |
| mrp                          | 🔴 | new column |
| cost_price                   | 🔴 | new column |
| tax_pct                      | 🔴 | new column |
| discount_pct                 | 🔴 | new column |
| margin (derived)             | 🔴 | computed |
| reorder_level                | 🟡 | today `low_stock_threshold` on partner_inventory only |
| minimum_stock                | 🔴 | new column |
| maximum_stock                | 🔴 | new column |
| preferred_supplier_id        | 🔴 | new column, depends on Suppliers module |
| storage_requirement          | 🔴 | new column |
| temperature_class            | 🔴 | new column (chilled/frozen/ambient) |

### §6 · Category management with request workflow
- SA CRUD: ✅ (`shared/admin/mart_catalog_routes.py`).
- Partner "Request New Category" workflow: 🔴 no such flow — partners currently cannot request categories at all.

### §7 · Two product paths (Add from BAKĒD / Request new)
- Add from master: ✅ (`link_master_product`).
- Request-new via approval: ✅ minimal (`create_custom_product` → `approval_status=pending`).
- Full request form (images, docs, supplier, MRP, proposed price, tax/HSN): 🟡 covered partially — most §5 fields missing.

### §8 · Supplier Management
- **Nothing exists.** No `suppliers` table, model, routes, or UI.

### §9 · "Sell on MARTbakēd" supplier application
- 🔴 missing. Existing "Sell on BAKĒD" is a *partner-store* application (`partner_applications`), not a supplier application.

### §10 · Supplier product mapping
- 🔴 no `supplier_product_mapping` table.

### §11 · Purchase Order module
- 🔴 no PO tables/models/routes/UI.

### §12 · Goods Receiving / GRN
- Backend: ✅ `partner_receipts` supports partial receive + damaged qty + notes.
- Missing (per §12 spec):
    - Batch / lot number capture: 🔴
    - Expiry date per line: 🔴
    - Rejected qty separate from damaged qty: 🟡 (only damaged today)
    - Accepted qty as a distinct number: 🟡 (today `put_away_qty` implies accepted)
    - Supplier link on the receipt: 🔴 (no supplier FK)
    - PO link on the receipt: 🔴 (blocked on PO module)
    - Supporting documents upload: 🔴

### §13 · GRN document generation
- PDF: 🔴
- Excel: 🔴
- Print / share / supplier copy: 🔴

### §14 · Put-away
- ✅ done. Bin optional today — spec says structured path should be required. Consider making `bin_id` mandatory (currently nullable).

### §15 · Inventory data model
- Present: available_qty, reserved_qty, damaged_qty, expired_qty. ✅
- Missing: in_transit_qty, quarantined_qty, reorder_level, minimum_stock, maximum_stock.
- Never-negative CHECKs: ✅.
- Adjustment writes movement: ✅.

### §16 · Inventory ledger — movement kinds required
Current allow-list (migration 0008):
`receive · adjustment_add · adjustment_remove · reserve · release · consume · damage · expire · transfer_in · transfer_out · return_in · opening_stock · put_away · stock_count · correction · pick · pack · dispatch`.

Spec requires: OPENING_STOCK, RECEIVING, PUT_AWAY, SALE, RESERVATION, RELEASE_RESERVATION, PICKED, DAMAGED, EXPIRED, RETURN, TRANSFER, ADJUSTMENT, STOCK_COUNT, LOSS, CORRECTION.

Gaps: **LOSS** kind missing. `SALE` may be represented by `consume`; rename or alias for report clarity. Spec-mandated `before_qty` field on each movement is absent — today we store only `balance_after`.

### §17 · Replenishment
- Admin auto-generate + approve + mark received: ✅.
- Preferred supplier, supplier price, supplier lead time on suggestion: 🔴 (blocked on Suppliers).
- "Create PO from replenishment screen": 🔴 (blocked on PO module).

### §18 · Supplier selection UI
- 🔴 no suppliers → no selection screen.

### §19 · Supplier billing / 3-way matching (PO ↔ GRN ↔ Invoice)
- 🔴 nothing.

### §20 · Supplier payment
- 🔴 nothing.

### §21 · Bulk import (Product, Inventory, Adjustments, Supplier mapping, Supplier price, PO)
- 🔴 nothing.

### §22 · Import validation (preview + error report)
- 🔴 blocked on §21.

### §23 · Picking integration
- Picker UI: 🔴.
- Bin path on picker task: 🔴.
- Scan-bin + scan-product workflow: 🔴.

### §24 · Order reservation atomicity
- reserved_qty column exists.
- Explicit `SELECT … FOR UPDATE` in order creation transaction: 🔴 (not present in `mart/routes.py` order creation).

### §25 · Dark Store responsibilities
- Receive · counts · manage bins · assign products to locations · manage store stock · manage replenishment: ✅ (partial — no purchase-request creation).
- Pick / pack / dispatch: 🔴 no dedicated worker screens.

### §26 · Super Admin responsibilities
- Manage master cat / subcat / brands / products: ✅.
- Approve new products: ✅.
- Approve new categories: 🔴.
- Approve supplier applications: 🔴.
- View supplier performance, invoices, stock exceptions: 🔴.
- Network inventory: ✅ (Control Tower).
- Stock movements: ✅.

### §27 · RBAC
Existing roles (`core/models/partner_staff.py::PARTNER_STAFF_ROLES`):
`owner · manager · packer · cashier · supervisor · inventory_manager · warehouse_manager · customer_support`.

Missing per §27: **PICKER (dedicated)**, **SUPPLIER (portal user type)**, **FINANCE**. Today the "picker" role is `packer` — spec wants both. **Finance** and **Supplier** are new user types.

### §28 · Document generation
- ✅ none.
- Any doc rendering library: none installed.
- Suggested libs (Phase 3): `reportlab` or `weasyprint` + `openpyxl`.

### §29 · Search and identification
- Search products by name/SKU/barcode/brand/supplier SKU/category: 🟡 (partial — no supplier SKU because no suppliers).
- Search warehouse by Zone/Aisle/Rack/Shelf/Bin: 🟡 possible via the tree but no unified search endpoint.

### §30 · Data integrity rules
- Duplicate master SKU: enforced via `uq_mart_products_sku_country`.
- Duplicate barcode per country: enforced.
- Negative inventory: enforced (`ck_partner_inv_*_nonneg`, `ck_partner_products_stock_qty_nonneg`).
- Inventory without valid warehouse: enforced by FK.
- Receiving against nonexistent PO: N/A yet (no POs).
- Unapproved product publication: enforced (custom SKU pending workflow).
- Unapproved **category** publication: 🔴 no such workflow yet.

### §31 · Audit logging
- Generic `audit_events` table + `_audit()` helper: ✅ used by every admin route (catalog CRUD, approvals, replenishment, transfers).
- Coverage against spec:
    - Product create/modify ✅ · category create ✅ · category approval 🔴 (no approval workflow yet)
    - Supplier approval/suspension 🔴 · PO events 🔴 · GRN verification 🟡 (transitions logged) · inventory adjustment ✅ · stock count ✅ · location assignment 🔴 (create_product_location doesn't audit) · price change ✅ (via product update) · supplier invoice 🔴 · payment approval 🔴 · payment release 🔴

### §32 · UI/UX
- Design system: ✅ Tailwind + shadcn/ui + partner-portal design tokens.
- Existing nav/typography/spacing/colors respected across new pages.
- **Anti-pattern warning**: prompt forbids exposing DB identifiers like `psku_xxxxx` to users. Current implementation exposes them in some `data-testid`s (fine) but also in a couple of partner-facing modals for reserved item lookup. Needs sweep during Phase 4.

---

## Grand gap summary

| Module | Status | Highest-priority missing pieces |
|---|---|---|
| Master Catalogue                | 🟡 | MRP, cost, tax, HSN, manufacturer, batch/expiry flags, pack size |
| Category request workflow       | 🔴 | end-to-end partner→SA approval |
| Suppliers                       | 🔴 | table, application, verification, portal |
| Supplier product mapping        | 🔴 | table + admin UI |
| Purchase Orders                 | 🔴 | full module |
| Goods Receiving                 | 🟡 | link to PO/supplier, batch/lot/expiry, rejected/accepted split |
| GRN document                    | 🔴 | PDF + Excel generation |
| Warehouse hierarchy             | ✅ | (done in earlier phase) |
| Inventory                       | 🟡 | in_transit_qty, quarantined_qty, min/max/reorder columns |
| Movements ledger                | 🟡 | add LOSS kind + `before_qty` column |
| Replenishment                   | 🟡 | wire preferred_supplier + create-PO shortcut |
| Store transfers                 | ✅ | (Batch 3b done) |
| Reservation locking             | 🟡 | add SELECT FOR UPDATE in order creation |
| Picking / Packing / Dispatch    | 🔴 | worker screens missing entirely |
| Supplier billing (3-way match)  | 🔴 | invoice + matching logic |
| Supplier payment                | 🔴 | workflow + RBAC |
| Bulk import (5 types)           | 🔴 | + preview/validation UI |
| Document generation             | 🔴 | reportlab/openpyxl not installed |
| Reports                         | 🔴 | inventory valuation, low-stock, supplier outstanding etc. |
| RBAC additions                  | 🟡 | picker (distinct from packer), supplier, finance roles |
| Bin-required put-away           | 🟡 | make `receipt_item.bin_id` NOT NULL after data migration |

---

## Recommended execution order (per prompt phases §34)

The prompt itself dictates ordering. Restated for clarity:

| Phase | Scope (source-of-truth summary) | Estimated size |
|---|---|---|
| Phase 1 · Master Catalogue    | Extend `mart_products`, add missing fields, brands cleanup, category-request workflow, refactored product creation UI | Medium (fits one iteration) |
| Phase 2 · Suppliers           | `suppliers` + `supplier_applications` + `supplier_product_mapping` + Sell-on-MARTbakēd form + SA verification queue + Dark-Store supplier directory | Large (one dedicated iteration) |
| Phase 3 · Purchasing + Receiving | `purchase_orders` + `purchase_order_items` + supplier confirmation + dispatch + link receipts to POs + batch/lot/expiry + PDF/Excel GRN generation | Very large — likely split into 3a (PO CRUD) + 3b (receiving-against-PO) + 3c (GRN docs) |
| Phase 4 · Warehouse + Inventory | Extend inventory columns (in_transit/quarantined/min/max/reorder); make bin path mandatory on put-away; SA warehouse drill-down; stock count enhancements | Medium |
| Phase 5 · Fulfillment + Supplier Settlement | Picker screen + Packer screen + Dispatch handoff + supplier invoices + 3-way matching + supplier payment workflow | Very large — must split |
| Phase 6 · Bulk ops + Reporting | 6 import types + preview UI + 11 reports | Large |

Each phase must produce its own audit → build → test → completion report per §34/§37.

**Zero code changes made in this audit iteration** — the prompt in §33 mandates a full audit *before* any implementation.

---

## Constraints re-affirmed for later phases

1. Never rebuild what exists (Phase 2 catalogue + Batch 2 receiving + Batch 3a replenishment + Batch 3b transfers all stay).
2. Never expose raw DB identifiers to operational users.
3. Never allow negative inventory (already enforced).
4. Never publish a product / category without approval.
5. Never grant financial permissions implicitly via store membership.
6. Never break existing customer, admin, partner, or order flows.

---

*Audit complete. Awaiting user prioritisation to begin Phase 1 (Master Catalogue completion).*
