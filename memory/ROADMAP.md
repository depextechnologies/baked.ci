# BAKĒD — Roadmap / Parked Backlog

_Snapshot taken 2026-02-19 when the user paused MART/SEND polish to work on a different module. Resume from any pick below on request._

## 🟡 Paused — MART / SEND Polish Backlog

Ordered by expected impact. Every item is fully scoped and ready to build.

### P1 · MART Supplier & Fulfilment

- **Handoff Screen** — driver / rider bag-pickup confirmation UI (staff-side). Prints a delivery slip via reportlab and flips the order `ready → out_for_delivery`. Route: `/partner-portal/martbaked/handoff`. Reuses `PartnerOrderPick` state; no new tables required.
- **Batch Picking** — let a single picker aggregate multiple orders into one aisle sweep. New `pick_batch(id, partner_id, picker_staff_id, order_ids[], status, started_at)` table + `POST /api/partner/picker/batches`. UI shows an "Aisle plan" grouped by shelf location.
- **Duplicate Catcher** — while a supplier types a proposed product name in `PortalProductRequests.jsx`, hit a debounced `GET /api/supplier/me/duplicate-check?name=…&ean=…` and show a side-by-side match panel from the master catalogue so they don't propose a SKU that already exists.
- **Draft & Resume** — save an in-progress supplier product request as `status='draft'`. Add a "Drafts" tab in the same page. Endpoint changes: `POST /me/product-requests/drafts`, `POST /me/product-requests/drafts/{id}/submit`.
- **Rich Image Gallery** — up to 5 photos per product request with drag-to-reorder, primary-photo flag. Backend: `supplier_product_request_images` table; frontend uses the existing `/supplier/uploads` endpoint.

### P2 · Analytics & Returns

- **Analytics Dashboard (Slice D)** — partner-side charts for sales, top SKUs, waste %, avg pick time. Use `nivo` or `recharts` (already in `package.json`).
- **Returns / Refunds (Slice H)** — customer-initiated returns with reason codes, refund via wallet or original tender, restocking flow that lands back in `PartnerInventory`.

### P2 · Payments

- **Real Stripe integration** — replace the currently-MOCKED wallet top-up + checkout with the pre-configured Stripe test key already available in the environment. Existing shape of `POST /api/wallet/topup` unchanged.

### Ops / Deploy

- **Search Console Verify** — after `www.baked.ci` is pointed at this deployment, click *Verify* in GSC (the verification file `googleba68425c95e3bcd1.html` is already live at `/`), then **Sitemaps → Submit** `sitemap.xml`.
- **Hreflang FR** — add French duplicates of meta title/description + `hreflang` alternates once the FR marketing copy is signed off.

## ✅ Recently Shipped (for context)

See `PRD.md` for the full running changelog. Recent highlights:

- P0 Correction Pass — SENDbakēd rebrand, Module-scoped Partner Portal URLs, Côte d'Ivoire-only UI (2026-02-19)
- Phase 6a — Tablet Picker Screen (2026-02-19)
- P2 — Product Approval Feedback Loop + Category Request Submission (2026-02-19)
- Phase 5 — Supplier Billing (3-way match)
- Phase 4 — GRN Docs + Replenishment → PO + PO Email Notifications
- SENDbakēd vehicle assets swapped (Bike / 3W / Truck)
- White-label SEO + Brand Identity (index.html, manifest, robots.txt, sitemap.xml, JSON-LD)
