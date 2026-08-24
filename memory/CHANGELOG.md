# BAKĒD — Changelog (recent slices only; older detail lives in PRD.md)

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

### Phase 3 (Customer / Location) — NEXT / P1
- #7: Google Maps address picker

### Phase 5 (Website UX) — P1
- #12: Mobile menu
- #13: Top header cleanup
- #14: Footer redesign
- #15: Word sweep (branding consistency)
- #16: Product card `+` button

### Phase 7 — P2
- Analytics dashboard (Slice D)
- Return / Refund handling (Slice H)

### Phase 8 — P2
- Real Stripe payment gateway integration for Wallet & Checkout
