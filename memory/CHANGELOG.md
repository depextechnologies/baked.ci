# BAKĒD — Changelog (recent slices only; older detail lives in PRD.md)

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
### Phase 1 (Inventory) — NEXT
- #4: Zone → Aisle → Rack → Bin ↔ Category / Product mapping
- #8: Show pick location per order item
- #9: Supplier → Darkstore/FC assignment

### Phase 2 (Driver) — P1
- #5: New driver missing from Admin queue
- #6: Approved driver looped back to onboarding

### Phase 3 (Customer / Location) — P1
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
