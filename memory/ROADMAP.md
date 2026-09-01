# BAKĒD — Roadmap / Parked Backlog

_Last snapshot: 2026-03-01 after shipping SHOPbakēd Slices 1–9 + Unified Cart Drawer + Mixed Checkout._

## 🟡 Paused — Polish Backlog (ready to build)

### P1 · SHOPbakēd follow-ups (new)

- **SHOP min-order + shipping cost** — currently SHOP has no min-order gate and shipping is shown as "Calculated by seller". Wire per-seller shipping rules + optional min-order.
- **Unified order-history view** — `/orders` currently shows MART only. Add a merged view mixing SHOP orders (`/shop/orders/me`).
- **SHOP order tracking + notifications** — reuse SENDbakēd status pings for seller-shipped SHOP orders.
- **Return/Refund flow for SHOP** — extend Slice H to cover marketplace returns (seller-approved RMA).

### P1 · MART Supplier & Fulfilment

- **Handoff Screen** — driver/rider bag-pickup confirmation UI with printable slip. Route: `/partner-portal/martbaked/handoff`. Reuses `PartnerOrderPick` state; flips order `ready → out_for_delivery`. No new tables.
- **Batch Picking** — one picker works multiple orders in a single aisle sweep. New `pick_batch(id, partner_id, picker_staff_id, order_ids[], status, started_at)` table + `POST /api/partner/picker/batches`. UI groups items by shelf.
- **Duplicate Catcher** — debounced `GET /api/supplier/me/duplicate-check?name=…&ean=…` while a supplier types in `PortalProductRequests.jsx`; side-by-side master comparison to catch duplicate SKUs before submit.
- **Draft & Resume** — supplier product requests with `status='draft'`; new "Drafts" tab + `POST /me/product-requests/drafts` + `.../submit`.
- **Rich Image Gallery** — up to 5 photos per product request, drag-to-reorder, primary flag. New `supplier_product_request_images` table.

### P2 · Analytics & Payments

- **Analytics Dashboard (Slice D)** — partner-side charts (sales, top SKUs, waste %, avg pick time) via `recharts` (already in `package.json`).
- **Returns / Refunds (Slice H)** — customer-initiated returns + refund via wallet or original tender + restocking flow.
- **Real Stripe integration** — replace mocked wallet top-up + checkout with the pre-configured Stripe test key.

### India NCR follow-ups

- **Seed IN sub-categories & catalogue** — currently IN has 6 modules + 4 cities + 2 hubs seeded but no MART catalogue rows. QA can browse but not shop end-to-end.
- **Hindi locale** — `hi-IN` UI strings + a language switcher option.
- **INR-priced offers** — the `offers` table only has CI XOF prices; IN needs ₹-priced versions.

### Ops / Deploy

- **Search Console Verify** — after `www.baked.ci` is pointed at this deployment, click *Verify* in GSC (`googleba68425c95e3bcd1.html` already live), then submit `sitemap.xml`.
- **Hreflang FR** — French duplicates of meta title/description + `hreflang` alternates once FR marketing copy is signed off.

## ✅ Recently shipped (for context)

See `PRD.md` for the full running changelog. Recent highlights:

- IN NCR Hubs Seed — Sector 18 Noida + Alpha 1 Greater Noida (distance-based routing live)
- IN NCR Pincode Allowlist (201301–201318) + `postal_code` param on serviceability
- "Use my location" chip in TopNav country switcher; LR fully hidden (`production_visible=false`)
- India country added alongside Côte d'Ivoire (₹ INR, +91, en-IN, New Delhi center, geolocation auto-detect)
- White-label SEO — index.html title/OG/Twitter/JSON-LD, robots.txt, sitemap.xml, manifest.json, GSC HTML file
- SENDbakēd vehicle assets (Bike / 3W / Truck)
- P0 Correction Pass — SENDbakēd rebrand, module-scoped Partner Portal URLs, CI-only UI (LR hidden)
- Phase 6a — Tablet Picker Screen
- P2 — Product Approval Feedback Loop + Category Request Submission
- Phase 5 — Supplier Billing (3-way match)
- Phase 4 — GRN Docs + Replenishment → PO + PO Email Notifications
