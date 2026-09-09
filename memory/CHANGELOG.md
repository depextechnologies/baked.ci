# BAKĒD — Changelog (recent slices only; older detail lives in PRD.md)

## 2026-03-08 — Checkout String i18n — COMPLETE

Localised the 4 launch-blocker files identified in `I18N_COVERAGE_REPORT.md`:

| File | Before | After | Δ |
|---|---:|---:|---:|
| `pages/mobile/MobileCheckout.jsx` | 13 | 0 | −13 |
| `pages/mobile/MobileAddresses.jsx` | 23 | 0 | −23 |
| `components/address/AddressSelector.jsx` | 22 | 0 | −22 |
| `pages/mobile/MobileOrderDelivered.jsx` | 14 | 0 | −14 |
| **Total** | **72** | **0** | **−72** |

Global coverage: **445 → 374 hardcoded strings (−16%)**. All 4 target files removed from the top-15 offender list. Every string customers see during the money-moment now switches between FR and EN via `useTranslation("customer")`.

**Keys added** (mirror in `/app/frontend/src/i18n/locales/{fr,en}/customer.json`):
- `checkout.*` — 30 new keys (delivery slots, payment methods, points redemption, min-order banner, toast strings, order-placed flow, total payable, trust strip)
- `address.*` — 25 new keys (form labels, placeholders, toast copy, empty state, ecosystem strip, sign-in prompt, saved-count with i18next `_one`/`_other` plurals)
- `address_selector.*` — 25 new keys (modal title, detect button, saved/recent sections, serviceability states, confirmation flow, all toast strings)
- `orders.*` — 15 new keys (rating card, freshness guarantee, delivery summary, order summary, sticky footer)

**Live verified**:
- `/produits`, `/`, `/panier`, `/paiement` all render in French
- Zero English leaks on `/paiement` login prompt or `/compte/adresses` guest prompt
- Homepage delivery panel, category strip, footer all French


## 2026-03-08 — Launch route audit + i18n coverage sweep — COMPLETE

**Batch route migration**:
- `/confidentialite` ⇄ `/privacy` — PrivacyPolicy route + `ROUTE_MAP.privacy` + Footer link
- `/conditions` ⇄ `/terms` — TermsOfService route + `ROUTE_MAP.terms` + Footer link

Both aliases registered in `DesktopCustomerShell` + `MobileCustomerShell`. `LocaleRouteSync` swaps them on the fly. Live verified with headless browser: `/confidentialite` → toggle EN → `/privacy`, `/terms` → toggle FR → `/conditions`, footer terms link href respects language.

**Ordered launch-critical route list** (22 pairs total):
1. `/` (same both langs)
2. `/categories`, `/categories/:slug` (same both langs)
3–4. `/produits` ⇄ `/products` [+/`:id`]
5. `/panier` ⇄ `/cart`
6. `/paiement` ⇄ `/checkout`
7–10. `/commandes` ⇄ `/orders` [+/`:id`, `/suivi`, `/confirmation`, `/livree`]
11. `/portefeuille` ⇄ `/wallet`
12. `/compte` ⇄ `/profile`
13–18. `/compte/{adresses,parametres,aide,activites,recompenses,parrainage}` ⇄ `/profile/{addresses,settings,help,activities,rewards,refer}`
19. `/confidentialite` ⇄ `/privacy`
20. `/conditions` ⇄ `/terms`

Deferred (branded English paths, out of launch scope): `/send/*` (SENDbakēd deep booking flows), `/shop/*` (SHOPbakēd storefront).

**Coverage sweep** — script at `/app/scripts/i18n_coverage_sweep.py`, full report at `/app/memory/I18N_COVERAGE_REPORT.md`.

| Metric | Value |
|---|---|
| Files scanned | 58 |
| Files with `useTranslation()` | 14 (24%) |
| Live `t()` call sites | 128 |
| **Hardcoded English strings** | **445** across 43 files |
| Top offender | `pages/express/ExpressWizard.jsx` (62) — deferred |
| Launch-blockers | **87 strings across 4 files** (MobileAddresses, AddressSelector, MobileCheckout, MobileOrderDelivered) |
| Backend errors i18n | 26/26 tests green (previous iteration) |

Recommended follow-up ordered by impact:
1. Sprint 1 (pre-launch): 4 checkout files, 87 strings
2. Sprint 2 (post-launch nice-to-have): 6 mobile profile files, ~88 strings
3. Sprint 3 (SEND funnel + legal): 5 files, ~167 strings


## 2026-03-08 — Phase C+ · URL Auto-Sync (LocaleRouteSync) — COMPLETE

Added `i18n/LocaleRouteSync.jsx` — a side-effect-only observer mounted inside both `DesktopCustomerShell` and `MobileCustomerShell` in `apps/customer/CustomerApp.jsx`. It watches `location.pathname` and `i18n.language`; when they disagree, it reverse-matches the current URL against `ROUTE_MAP` (both static aliases and `:param` patterns via `matchPath`) and rewrites the URL bar with `navigate(newPath, { replace: true })`.

**Verified with browser automation** (7/7 scenarios):
- Land on `/produits` in FR → stays `/produits`
- Toggle EN → URL auto-swaps to `/products`
- Toggle FR back → URL becomes `/produits`
- Query strings preserved: `/produits?search=milk` → `/products?search=milk`
- Toggle EN on `/panier` → becomes `/cart`
- Home `/` (same path both langs) — no swap
- Unknown routes (`/admin`, `/shop`, `/send`) — left alone (no false rewrites)

**Implementation notes**:
- Exact-string matches are tried before `:param` patterns so `/panier` never gets falsely matched by `/produits/:id`.
- `useRef` guard prevents any infinite loop when we ourselves navigate.
- Hash + search preserved.
- Zero DOM output (`return null`).


## 2026-03-08 — Phase C · French Route Renaming — COMPLETE

Localised customer-facing URLs so French users see native French paths in the URL bar. English aliases stay live so external bookmarks and share URLs keep working.

**Route mapping** (`i18n/routes.js`):
- `/products` ⇄ `/produits`
- `/cart` ⇄ `/panier`
- `/checkout` ⇄ `/paiement`
- `/orders` ⇄ `/commandes`
- `/orders/:id/track` ⇄ `/commandes/:id/suivi`
- `/orders/:id/delivered` ⇄ `/commandes/:id/livree`
- `/wallet` ⇄ `/portefeuille`
- `/profile` ⇄ `/compte`
- `/profile/addresses|settings|help|activities|rewards|refer` ⇄ `/compte/adresses|parametres|aide|activites|recompenses|parrainage`

**Public API**:
- `useLocalePath()` hook returns `path(key, params?)` bound to current i18next language.
- `resolvePath(key, lang, params?)` for tests / non-hook code.

**Files updated**:
- `apps/customer/CustomerApp.jsx` — dual FR+EN route registration for both DesktopCustomerShell and MobileCustomerShell.
- Navigation: `TopNav`, `MobileBottomNav`, `MobileShell` (path detection matches both prefixes).
- Pages: `HomePage`, `MobileHome`, `CartPage`, `MobileCart`, `CheckoutPage`, `MobileCheckout`, `ProductDetailPage`, `MobileProductDetail`, `ProductCard`, `ConfigHomepage` (Hero + BannerTrio + CtaStrip).
- `ConfigHomepage` gets a `cmsToLocale()` helper that remaps CMS-supplied URLs (`/products?category=…`) to the current language while preserving query strings and hash fragments — Super Admin can still type raw URLs.

**Testing** — `test_reports/iteration_83.json` (frontend testing agent, ~92% pass on 10+ scenarios):
- All 12 FR routes + 8 EN aliases return HTTP 200 and render their proper shells.
- LanguageSwitcher persists `localStorage.baked_language` + syncs `<html lang>`.
- TopNav cart button → `/panier` in FR, `/cart` in EN. Account button → `/compte` in FR, `/profile` in EN.
- Mobile bottom-nav active-state matches both `/panier` and `/cart`.
- MobileShell header variant detection works on FR aliases (`isCart`, `isCheckout`, `isProfile`).
- Post-agent fix: ConfigHomepage hero CTAs + banner row + CTA strip all correctly emit FR URLs with query strings preserved.

**Deferred (P2)**: Deep pages that navigate back with `nav("/profile")` etc. still work because both aliases resolve. Migrating those Back buttons to `useLocalePath` is cosmetic-only and can happen incrementally.


## 2026-03-08 — Phase D · Backend HTTPException i18n sweep — COMPLETE

Localised the customer + supplier + driver error surfaces (~140 `raise HTTPException` sites across 11 files) so every 4xx/5xx body now renders in the caller's language.

**Middleware**: added ASGI-level `_BakedLanguageMiddleware` in `server.py` that stashes `resolve_lang(request)` into a request-scoped ContextVar (`core.i18n._current_lang`). Endpoint code now calls `t(key, current_lang(), **params)` with **zero** signature churn — no need to inject `Request` into every handler. `BaseHTTPMiddleware` was intentionally avoided (it spawns the endpoint on a fresh task whose context copy doesn't see mid-request `.set()` calls).

**Files fully swept:**
- `modules/mart/orders.py` — cart empty, address missing, allocation failure, min-order, out-of-stock, order not-found, cancel-status, payment intent
- `modules/mart/routes.py` — product not found, item not found
- `modules/express/routes.py` — booking not-found, cancel gate, driver-status transition + auth
- `modules/driver/routes.py` — all OTP flows, KYC step gate, upload validation, submit, online gate, geo push, offer accept/decline, job lifecycle (accept/decline/arrive/verify pickup+delivery), earnings/withdrawal gates, in-ride chat, tracking token, admin approve/reject
- `modules/shop/routes.py` + `storefront_routes.py` + `portal_routes.py` — category/subcategory/product/variant/order + assignment CRUD, checkout empty/insufficient-stock, seller order lifecycle (invalid_transition, pin_locked, wrong_pin), shop_not_enabled
- `shared/auth/routes.py` — OTP challenge invalid/expired/incorrect, Google config/exchange/id_token/credential/email verification
- `shared/customer/routes.py` — address not-found, ticket category/not-found
- `shared/addresses/routes.py` — recent-search delete
- `shared/suppliers/portal_routes.py` — bearer/token/role/supplier gates, document CRUD, supply-location, catalogue upsert, product-request submit/resubmit, uploads (kind/size/mime/storage), file-proxy auth, admin approve/reject

**Locale dictionaries** (`i18n/locales/{fr,en}/errors.json`) — extended with 100+ new keys grouped under `generic / auth / supplier / order / customer / driver / shop / upload`. All keys ship with FR + EN and support `{param}` interpolation.

**Tests** — new `tests/test_i18n_errors_e2e.py` (11/11 green) covering:
- Middleware picks up `X-BAKED-Language`, `?lang=`, `Accept-Language` (FR default).
- Header precedence (`X-BAKED-Language` beats `?lang` beats `Accept-Language`).
- Structured `{code, message}` errors keep `code` untouched while `message` gets translated.
- Sequential requests in the same event loop don't bleed language across (ContextVar isolation verified).

Combined with existing `test_i18n_backend.py` (15/15), **26/26 i18n tests pass**.

**Live curl proof** (external preview URL):
```
GET /api/mart/products/nope-xyz  X-BAKED-Language: fr → "Produit introuvable."
GET /api/mart/products/nope-xyz  X-BAKED-Language: en → "Product not found."
GET /api/shop/products/nope-xyz  X-BAKED-Language: fr → "Produit SHOP introuvable."
```

**Known deferred (P2)**: `shared/admin/*` (super-admin dashboards — French-only for the launch team, low visibility), `modules/mart_partner/*`, `shared/purchase_orders/*`. Also 1 pass-through in `modules/mart/orders.py:437` that forwards the payment provider's own error message verbatim.


## 2026-03-07 (part 2) — Phase D roll-out · All email call sites migrated — COMPLETE

Every `send_email_async` call site has been re-wired through the localised email pipeline (`core.emails.send_localised_email` + `core.i18n.t`). Emails now arrive in the recipient's language — French for CI + African cohorts, English for IN + explicit `X-BAKED-Language: en` requests.

**Sites migrated (5 total):**

| Site | File | Template | Language source |
|---|---|---|---|
| Driver password reset | `modules/driver/routes.py` | `driver_password_reset` | Driver `preferred_language` → `resolve_lang(request)` → FR |
| MART store approval | `modules/mart_partner/routes.py` | `mart_store_approved` | Partner `preferred_language` → country default (IN → EN, else FR) |
| MART partner staff invite | `modules/mart_partner/staff_routes.py` | `staff_invite` | Partner country default |
| Purchase-order submitted / acknowledged / shipped | `shared/purchase_orders/notifications.py` | `po_submitted` / `po_acknowledged` / `po_shipped` | Partner country default |
| Partner new-order alert | `modules/mart_partner/notifications.py` | *(kept as-is — pure French, in-line doc-comment points to `partner_new_order` slot in Phase D.2)* | — |

**New locale keys (FR + EN):**
- `emails.driver_password_reset` — subject / greeting / body / warning / signoff.
- `emails.mart_store_approved` — subject / greeting / intro / `cta_dashboard` / signoff (interpolates `name`, `business_name`, `store_code`).
- `emails.po_submitted` — subject / greeting / intro / `cta_view` / signoff (interpolates `po_code`, `line_count`).
- `emails.po_acknowledged` — subject / greeting / body / signoff (interpolates `po_code`).
- `emails.po_shipped` — subject / greeting / body / signoff (interpolates `po_code`, `supplier_name`, `warehouse_name`).

Every new template pair was regression-checked with a live `python -c` script that renders both FR and EN with representative params and asserts they differ.

**Language selection rules baked in:**
1. Model-level `preferred_language` wins when present (driver, partner).
2. Falls back to country default — French for CI + African markets, English for IN.
3. Request-scoped `X-BAKED-Language` from the frontend axios interceptor overrides both for endpoints where the caller can pick (e.g. driver forgot-password from the mobile app).

**Test coverage:**
- 15/15 pytest suite still green (`tests/test_i18n_backend.py`).
- Live-endpoint smoke: `POST /api/driver/auth/forgot-password` with FR + EN headers both return 200 with no backend errors.

**Backend still emits English (backlog):**
- `mart_partner/notifications.py` new-order alert — French-only by design (partners are CI-only today); English variant to ship once IN partner cohort lands.
- ~30 non-email `HTTPException` sites outside `apply/start` still emit raw English `detail`. Tracked as Phase D.2 in `/app/memory/I18N_PLAN.md`.

---


## 2026-03-07 — Workstream 3 Phase D · Backend Localisation — COMPLETE

Server-emitted strings (errors, emails, SMS) are now bilingual, driven by the caller's UI language. End-to-end path proven: frontend axios interceptor sets `X-BAKED-Language: fr|en` → backend `resolve_lang(request)` → `t(key, lang)` → localised `HTTPException.detail`.

**New backend module — `core.i18n`:**
- Loads JSON dictionaries from `/app/backend/i18n/locales/{fr,en}/*.json` once at import (`@lru_cache`).
- `t(key, lang, **params)` — dot-path lookup with FR → EN → key fallback + `str.format` interpolation.
- `resolve_lang(request)` — precedence: `X-BAKED-Language` header → `?lang=` query → `Accept-Language` → French.

**Locale bundles shipped:**
- `errors.json` — 21 keys across generic / auth / supplier / order / upload (FR + EN).
- `emails.json` — 8 templates (order_confirmed, order_delivered, magic_link, otp, staff_invite, supplier_approved, supplier_rejected, brand) with subject / preheader / greeting / intro / body / cta / warning / footer / signoff slots.
- `sms.json` — 8 one-liners (otp, order_confirmed, order_on_the_way, order_delivered, driver_assigned, driver_reminder, password_reset, supplier_approved).

**New backend helper — `core.emails.send_localised_email`:**
- Single HTML shell (brand header + preheader + body + CTA button + signoff + footer) for every transactional email.
- Text-part auto-derived from the same keys for accessibility / SMS-client fallback.
- Best-effort semantics (never raises) — mirrors existing `send_email_async` contract.
- Bonus: `render_sms(template, lang, **params)` returns the localised SMS body for direct hand-off to `SmsProvider.send()`.

**Frontend wiring — `lib/api.js`:**
- Every axios request now carries `X-BAKED-Language` derived from `localStorage.baked_language`. Toggling the FR/EN switcher immediately affects error toasts, emails and SMS on the next request — no explicit passthrough per call site.

**Live-endpoint proof — `POST /martbaked/sellers/apply/start`:**
- Migrated three raw English `HTTPException` messages to `t(…)` keys: `errors.supplier.business_type_invalid`, `errors.supplier.already_active`, `errors.supplier.already_submitted`.
- Verified via curl: `X-BAKED-Language: fr` returns *"Le type d'activité choisi n'est pas valide."*; `X-BAKED-Language: en` returns *"The selected business type is not valid."*.

**Test coverage — `backend/tests/test_i18n_backend.py`:**
- 15 tests, all passing. Covers `t()` fallback + interpolation + missing-param resilience + EN-fallback-when-FR-missing, `resolve_lang()` header/query/Accept-Language precedence, `send_localised_email()` FR/EN dispatch + CTA rendering + language fallback.

**Not migrated (deferred backlog):**
- Order confirmation / driver assignment call sites still emit hardcoded strings — the helpers are ready; adopting them across the 40+ existing `send_email_async` sites is a follow-up sweep tracked in `/app/memory/I18N_PLAN.md` Phase D.2.
- Backend error messages outside `apply/start` still raw English. Convert as sites are touched.

---


## 2026-03-06 (part 2) — Partner Landing full-page French — COMPLETE

Every remaining hardcoded string on `/Sell-on-baked` is now bilingual. Section-by-section:

- **TrustBar** — six pill items (Trusted by 5k+, Secure payments, AI-powered marketing, Fast settlement, 24/7 operations, Africa-first infrastructure) → `partner.trust.*`.
- **Opportunities cards (6)** — MART / FOOD / SHOP / SEND / AUTO / IMMO taglines, descriptions and the "Now onboarding" badge all sourced from `partner.opportunities.items.{key}` + `partner.opportunities.badge_onboarding`. Apply-CTA reused `partner.nav.apply_now`.
- **StatsSection (Why Partner — 6 tiles)** — value / label / hint per tile: customers, ops, ai, payments, marketing, analytics. All under `partner.stats.*`.
- **GrowthSection** — eyebrow, two-line title, body, 7 bullets, primary CTA all under `partner.growth.*` (bullet keys `b1`…`b7`).
- **Testimonials carousel (3 partners)** — Aïcha Konan / Kouassi Traoré / Mariam Diallo quotes, roles and locations under `partner.testimonials.items.{aicha|kouassi|mariam}`.
- **TimelineSection (5 steps)** — Submit Application → Verification → Training → Business Activation → Start Receiving Orders under `partner.timeline.steps.s1…s5` + section eyebrow + two-line title.
- **FinalCTASection + PartnerFooter** — already migrated in previous batch, verified consistent.

**Locale footprint added:** `~30 additional keys` on top of the earlier partner namespace, doubling the coverage of the marketing page. Every EN/FR pair round-trips via the shared TopNav / mobile-drawer `LanguageSwitcher`.

**Screenshots captured:**
- `Sell-on-baked` opportunities section: **OPPORTUNITÉS · Choisissez votre opportunité · Sélectionnez la catégorie…** + 6 cards fully French incl. **RECRUTEMENT OUVERT** badges and **Postuler** CTAs.
- `Sell-on-baked` stats section: **POURQUOI DEVENIR PARTENAIRE BAKĒD · Conçu pour grandir. Conçu pour l'Afrique.** + 6 tiles (**Clients potentiels · Opérations continues · Assistant business · Paiements rapides & sécurisés · Croissance marketing · Analyses intelligentes**).

**Left English (backlog):** none on `/Sell-on-baked` — the entire page is French-first now. Remaining Phase D–I items (Admin console labels, backend errors + emails, DB bilingual product columns) unchanged.

---


## 2026-03-06 — Workstream 3 Phase B follow-up · Visible-first migration — COMPLETE

Delivered the user's called-out gaps (homepage "Shop by category" / "Delivery in", full footer, all inside pages like "Sell on Baked" / "Partnership" / careers / help / contact) plus the ComingSoonLanding placeholder used by 24 footer routes.

**Files migrated:**
- `Footer.jsx` — rewritten to consume `common:footer.*` keys. Columns Liens utiles / Opportunités / Support fully bilingual; store badges + copyright translated.
- `ConfigHomepage.jsx` — Hero delivery panel (LIVRAISON EN, Livraison gratuite dès X, Frais de livraison, Commande minimum, Populaire près de chez vous); CategoryGrid eyebrow/title/link ("ACHETEZ PAR CATÉGORIE / Catégories / VOIR TOUT"); TrustStrip (Livraison ultra-rapide, Large gamme de produits, Meilleurs prix & offres, Retours faciles); ProductCarousel view-all link.
- `ComingSoonLanding.jsx` — refactored to i18n. `landing.json` FR/EN covers 25 slugs (careers, help, contact, blog, news, terms, privacy, partner, invest, franchise, delivery-partner, driver-registration, merchant-registration, shop/seller, food/partner, mart/seller/partner, auto/seller/partner, immo/agent/broker/partner, baked-delivery, about, investors).
- `PartnerLandingApp.jsx` (Sell-on-BAKĒD marketing page) — Navbar, Hero, Opportunities section, Why Partner section, Final CTA, and Footer all consume the new `partner` namespace. Card body copy for six opportunities and stats grid still English-only (backlog).

**New locale namespaces:**
- `landing` — 25 slug keys × FR/EN (footer landings + coming-soon placeholders).
- `partner` — nav, hero, opportunities, why, final_cta, footer × FR/EN (Sell-on-BAKĒD marketing page).
- `common.footer.*` — 20 keys covering site footer nav, sections and delivery panel labels.
- `common.trust.*` — TrustStrip icons on customer homepage.

**Fixes rolled up:**
- `i18n/index.js` — dropped `htmlTag` from detector chain so a pre-set `<html lang="en">` no longer pins the app to English. `caches: ["localStorage"]` only (no cookie caching) so stale cookies from previous sessions can't override French-first behaviour.
- `public/index.html` — root `<html lang="fr">`.
- `BakedContexts.jsx` — mount-time effect forces `i18n.changeLanguage(language)` so context + i18next stay in lock-step across the initial paint.
- `TopNav.jsx` — replaced fragile Popover-based FR/EN switcher (Radix portal was racing with i18n re-render, failing to reopen) with the shared inline `<LanguageSwitcher />`. `top-nav-language-switcher` testid preserved on wrapper for backward-compat with existing tests.

**Visible outcome (screenshots captured):**
- `/` — hero, delivery panel, category grid eyebrow/title/link, TrustStrip, and full footer all in FR.
- `/Sell-on-baked` — nav (Solutions / Devenir partenaire / Pourquoi BAKĒD / Ressources / Support / Se connecter / Postuler), hero ("Développez votre activité avec BAKĒD.", "Rejoignez des milliers d'entreprises..."), section headers, final CTA, footer all in FR.
- `/careers`, `/help`, `/contact`, `/blog`, `/terms`, `/privacy` — placeholder cards fully FR.

**Still English (backlog, tracked in `/app/memory/I18N_PLAN.md` Phase D–I):**
- PartnerLandingApp opportunity CARDs body copy, stats grid, testimonials, timeline (visible when scrolling below the fold on `/Sell-on-baked`).
- Admin console labels beyond nav (Phase G).
- Backend error messages + transactional emails (Phase D).
- Dynamic product `name` / `description` DB columns (Phase H).

---


## 2026-03-05 (evening) — QA v15 Workstream 3 Phase A · i18n Foundation — COMPLETE

**User-approved plan:** `/app/memory/I18N_PLAN.md` — Phase A + language-switcher polish across all 6 shells. Vendor: Emergent LLM key / Claude for future backfill. Admin path segments stay English (labels translate). Machine translation deferred; hand-written French for top ~50 critical strings shipped.

- **`i18next` + `react-i18next` + `i18next-browser-languagedetector` installed via yarn.**
- **`/app/frontend/src/i18n/index.js` (new)** — bundles 5 namespace files per locale (`common`, `customer`, `admin`, `seller`, `driver`), fallbackLng = `fr`, `saveMissing` warns in dev. Detector order deliberately drops `navigator` so every fresh visitor lands in French regardless of browser locale — English is only reached via the header toggle (persists to localStorage) or `?lang=en` deep-link.
- **`/app/frontend/src/i18n/LanguageSwitcher.jsx` (new)** — shared React component with three variants (`compact` two-pill, `menu` labelled row, `inline` text link). Every node carries `data-testid=lang-switcher` / `lang-switcher-fr` / `lang-switcher-en` so the testing agent can locate the toggle in any shell with a single selector.
- **10 locale JSON files** — hand-written French for cart, checkout, product, orders, home, auth, admin nav, seller apply wizard, driver dashboard/trip; parallel English strings for the QA team.
- **`AppProvider.setLanguage`** now calls `i18n.changeLanguage()` in the same effect that writes to `localStorage`, so `useTranslation` hooks re-render in lock-step with the context. `detectInitialLanguage` simplified to `saved → ?lang → 'fr'` (no navigator sniff) — French-first per client brief.
- **CartPage pilot** — `pages/CartPage.jsx` migrated to `useTranslation("customer")`. Live toggle: FR shows "Votre panier est vide / Ajoutez des articles pour commencer votre commande. / Découvrir les produits"; EN shows English equivalents. Order Summary heading, subtotal, delivery fee, total, mixed-cart note, sign-in CTA all keyed.
- **Language switcher wired across all 6 shells:**
  1. Desktop TopNav — existing popover (kept, already syncs)
  2. Mobile drawer footer — replaced ad-hoc FR/EN buttons with the shared `<LanguageSwitcher variant="compact" />`
  3. `MobileSettings` row — existing "Language" nav row (kept)
  4. Admin sidebar footer — new switcher below Sign out
  5. Seller portal sidebar footer — new switcher below Back to Sellers Home
  6. Driver Profile page — new "Language" row below Sign out button
  Plus: `SellerApplyWizard` header (public seller /apply flow) gets its own switcher so applicants can toggle FR/EN before login.
- **Testing agent iteration_81**: Cart FR/EN toggle round-trips correctly, deep-link `?lang=fr|en` overrides, no regressions to Workstreams 1/2/4 (SHOP + SEND + India parity all green). Two gap items surfaced (mobile home top-bar switcher missing, public seller /apply switcher missing) — both fixed in-session before finish. Remaining LOW items (unauth admin/driver login page switchers) parked in backlog.

**What is NOT translated yet (Phase B → I in the plan):** every page other than Cart. Categories, product detail, checkout, orders, wallet, profile, admin console labels, seller portal steps beyond header, driver ride sheets — all still show hardcoded English/French mix. That work is scoped and sequenced in `/app/memory/I18N_PLAN.md`.

---

## 2026-03-05 — QA v15 Workstreams 1 + 2 + 4 (SHOP QA · SEND rename · India parity) — COMPLETE

**Testing case.xlsx** priority order 1 → 2 → 4 → 3. Workstream 3 (French-first i18n) is planned in `/app/memory/I18N_PLAN.md`, awaiting user approval before code changes.

### Workstream 1 — SHOP Storefront QA
- **Item A** — `/shop/categories` uses `mx-auto max-w-7xl px-4 sm:px-6` for balanced left/right margins across breakpoints (no more edge-to-edge grid).
- **Item B** — `ShopHome.jsx / ProductCarouselSection` now fetches its own list scoped to the section's configured `filter` (category slug) + optional `subcategory`. Blank / `bestsellers` / `new` keep the shared homepage list so older seeds still work.
- **Item C** — `POST /martbaked/sellers/apply/start` accepts an optional `module: "shop" | "mart"`. When set to `shop`, the created supplier is tagged `modules=["SHOP"]` and shows up under `/admin/modules/shop/suppliers` Submitted tab. Existing draft applications gain `SHOP` appended (not overwritten) on re-apply. Frontend `SellerApplyWizard` sends the module flag automatically when mounted under `/shopbaked/sellers/apply`.

### Workstream 2 — SEND URL rename
- `/express/*` → `/send/*` for every customer-facing route.
- `/express` and `/express/*` legacy paths **soft-redirect** via a new `<ExpressLegacyRedirect>` bridge that preserves query + hash + trailing segments. Bookmarks, QR codes and shared links continue to work.
- Bottom nav, module tabs, mobile shell, `modules.js` route, express bottom nav, config homepage — all point to `/send`.
- **Module code, database enums, backend API prefix `/api/express/*` unchanged** — internal identifiers preserved as per the "URL rename only" contract.
- Testing agent iteration_80 verified all `/send/*` routes render, `/express/*` correctly redirects, backend API untouched.

### Workstream 4 — India data parity
- `SHOP_COUNTRIES = ("CI", "IN")` — full 19-category tree seeded for India.
- `SHOP_HOMEPAGE_COUNTRIES = ("CI", "IN")` — 5 CMS sections seeded for IN with India-specific hero copy ("Shipped across India", "Delhi NCR same-day"). CI copy untouched.
- `seed_shop_demo_products(session, country="IN")` — 181 IN products + 362 variants, one per subcategory, currency `INR`, prices scaled `× 0.14` from XOF and rounded so IN gets natural ₹ pricing (e.g. iPhone accessory tier ~₹500-3 500 instead of raw XOF numbers).
- MART `_seed_products` extended: both `PRODUCTS_CI` and `EXTRA_PRODUCTS_CI` are mirrored into IN with INR pricing + "Delhi NCR 20-30 min" descriptions. `country="IN"` products now populate `/api/mart/products?country=IN`.
- `ShopHome`, `ShopCategoriesIndex`, `ShopCategory` read `useApp().country?.code` and fire APIs with the active country instead of hard-coded `CI`. IN customers now land on `/shop` and see IN inventory + hero copy natively.
- Verified: `curl /api/shop/products?country=IN&limit=100` → 100 items in INR; `curl /api/shop/catalogue?country=IN` → 19 categories with subcategories; `curl /api/mart/products?country=IN&limit=100` → 100 IN MART products in INR.

### Workstream 3 — French-first i18n (PLANNING ONLY)
- `/app/memory/I18N_PLAN.md` — full 9-phase implementation plan spanning customer, admin, seller, driver + backend errors/emails. Library choice: **react-i18next**. Route strategy: dual-path with French canonical. Ready for user sign-off.
- No code touched.

Test coverage: iteration_80 → 4/4 backend suites + 4/4 frontend suites pass. Zero regressions on the Playwright SHOP wizard suite from 2026-03-04.

---


## 2026-03-04 — Playwright regression for SHOP seller Step-4 location picker — COMPLETE
Belt-and-braces coverage for the white-on-white autocomplete + India-PIN fixes shipped earlier today.

- **`backend/tests/test_shop_seller_location_picker.py` (new)** — 3 tests × 15 s total, all deterministic:
  * `test_location_autocomplete_visible_and_pickable[desktop]` — 1440×900 viewport. Types "Greater Noida 201310", asserts dropdown `background-color === rgb(255,255,255)`, first row luminance `< 128` (dark text), positive `z-index`, click resolves the address into `[data-testid="apply-location-formatted-address"]`, and the resolved value survives a scroll-induced re-render.
  * `test_location_autocomplete_visible_and_pickable[mobile]` — same journey at 390×844 so the responsive layout gets equal protection.
  * `test_ci_supported_country_still_accepted` — belt-and-braces: adding IN to `SUPPORTED` did not break CI. Confirms the picker mounts, is enabled, and preserves the same white-bg invariant when a suggestion happens to render.
- Uses the **real Google Places API** (dev key already in `frontend/.env`); the test `pytest.skip`s gracefully when Places is unreachable / rate-limited so upstream flake never turns CI red on a bug that isn't ours. The CSS + DOM assertions are the deterministic core.
- **Wizard change enabling the test** — `SellerApplyWizard.jsx` now honours `?step=<n>` in the URL when combined with `?app=<id>`, and `refresh()` learned a `keepCurrent` flag so the initial deep-link isn't clobbered by the server's `current_step` value. Non-invasive, in-place: the wizard still resets `current` after each `save → refresh` cycle so the resume-from-draft UX is unchanged.

Run: `cd /app/backend && python3 -m pytest tests/test_shop_seller_location_picker.py -q -n0` → **3 passed in ~15 s**. Ran three times in a row without flake.




## 2026-03-04 — Module-aware cart theming + India PIN + location dropdown — COMPLETE
Fixing_Prompt v14 shipped end-to-end.

- **`lib/cartTheme.js` (new)** — shared `detectCartMode(cart)` returns one of `MART_ONLY / SHOP_ONLY / MIXED / EMPTY`; `getCartTheme(cart)` maps to `{ accent, accent_soft, text_on, label }`. Tokens: MART green `#77BC1F`, SHOP gold `#FCC44C`, MIXED neutral `#E5E7EB`. `lineAccent(item)` returns per-item accent for badge/stepper colours regardless of the aggregate mode. Designed to scale — adding FOOD/AUTO/SEND later just adds more theme entries.
- **`pages/CartPage.jsx` + `pages/mobile/MobileCart.jsx`** — replaced hard-coded `#77BC1F` on CTAs, empty-state buttons and quantity steppers with `theme.accent`/`lineAccent(it)`. MIXED cart shows a small "This cart has products from multiple BAKĒD modules." note next to the CTA.
- **`components/mobile/QuantityStepper.jsx`** — accepts an `accent` prop (default MART green for existing callers). Mobile cart passes `lineAccent(item)` so each row's + button matches its module.
- **`pages/CheckoutPage.jsx` + `pages/mobile/MobileCheckout.jsx`** — place-order CTA now module-aware; SHOP-only checkout renders in gold, MIXED in neutral, MART green stays for MART-only carts.
- **`apps/partner-hub/WarehouseLocationPicker.jsx`** — India (`IN`) added to `SUPPORTED` list; NCR pilot centre (Noida) added to `COUNTRY_CENTER`. Places-autocomplete no longer rejects Indian addresses. Autocomplete dropdown swapped from theme-variable colours to explicit `#FFFFFF` background + `#111827` text + `zIndex 60` + `shadow-2xl`, so suggestions stay legible regardless of the parent theme context (fixes the white-on-white bug seen in the SHOP seller wizard).
- **Backend** — `shared/addresses/routes.py::_matches_country_pincode_allowlist` already allowed Noida + Greater Noida pincodes (201301–201318); verified `GET /api/addresses/serviceability?country=IN&postal_code=201310` returns `{serviceable: true, match: "pincode_allowlist"}`. No backend change needed for India PIN.

Verified visually:
  * SHOP-only cart: entire CTA + steppers gold.
  * MART-only cart: green (unchanged).
  * MIXED cart: neutral CTA, per-line green/gold steppers, mixed-module note visible.
  * India PIN 201310 serviceability returns `true` end-to-end.




## 2026-03-04 — Apply-uploads security hardening (rate limit + signed URLs) — COMPLETE
Follow-up to the 2026-03-03 QA #8 fix — the public seller-apply upload endpoint is now guarded against abuse and PII leakage.

- **`core/utils/rate_limit.py` (new)** — in-memory per-IP sliding-window limiter. `check_rate_limit(request, bucket, limit, per_seconds)` raises `HTTPException(429, {code: "rate_limited", retry_after_seconds})` with a `Retry-After` header. XFF-aware (left-most token wins) so the source IP survives the k8s ingress hop. Note: state is per uvicorn worker → effective per-IP ceiling ≈ `workers × limit` (documented; move to Redis for exact enforcement).
- **`core/utils/signed_url.py` (new)** — HMAC-SHA256 signer. `sign_url(base, path, ttl_seconds=…)` returns `<base>?exp=…&sig=…`. `verify_signature(path, exp, sig)` constant-time compares. Secret resolution: `SIGNED_URL_SECRET` → `JWT_SECRET` → `SECRET_KEY` → dev fallback, so rotating the app-wide JWT secret globally revokes every previously-issued signed URL.
- **`shared/suppliers/routes.py::apply_upload`** — now:
  * Rate-limits at 20/min and 200/hour per IP before touching object storage (cheap reject path).
  * Returns `{storage_path, file_url}` — `file_url` is a 24 h-signed URL. `storage_path` is the canonical key persisted to `supplier_documents.storage_path` for later re-signing.
- **`shared/suppliers/routes.py::apply_file_serve`** — mandatory HMAC signature check on every request. Unsigned / expired / tampered URLs → 403 `bad_signature`. Ruled out the previous "opaque path is enough" behaviour so leaked links stop working after 24 h.
- **`shared/suppliers/routes.py::apply_save_step` (step=8)** — extracts `storage_path` from the incoming signed URL (or accepts an explicit `storage_path` field) so the DB always has the canonical, re-signable key.
- **`_load_full_snapshot`** — re-mints fresh signed URLs from `storage_path` at every read (admin queue + seller portal). Legacy rows without `storage_path` fall back to their stored `file_url` for compatibility with pre-hardening data.
- **Wizard label parity** — `SellerApplyWizard.jsx` now reads `useSellerModule()` at the top and uses `MOD_LABEL` (`MARTbakēd` / `SHOPbakēd`) for the eyebrow, and `SELLERS_HOME` for the "Back to home" link. Fixes the stale "MARTBAKĒD SUPPLIER ONBOARDING" copy on the SHOP wizard.
- **Regression tests** — `/app/backend/tests/test_apply_upload_hardening.py` (6 tests, all pass, stable across runs): unsigned rejected, tampered rejected, expired rejected, signed 200, rate-limit trips within a 120-request burst, and the upload response shape (`storage_path` + signed `file_url`).




## 2026-03-03 — Testing case.xlsx QA (8 defects) — COMPLETE
Root-cause fixes across DB → API → frontend for every defect the user filed in Testing case.xlsx.

**Bug #1 — SHOP category page margin**  
`apps/shopbaked/pages/ShopCategory.jsx` — wrapped the whole page in `mx-auto max-w-7xl px-4 sm:px-6` so it aligns with the header and rest of the storefront (was stretching edge-to-edge). Stripped duplicated `px-4` on inner rows.

**Bug #2 — Home Product Carousel "View all" always went to /categories**  
`apps/shopbaked/pages/ShopHome.jsx::ProductCarouselSection` + `pages/ConfigHomepage.jsx::ProductCarousel` — new deep-link priority chain: (1) explicit `view_all_link` / `link`, (2) auto-derived from `filter` (category slug) → `/shop/c/<slug>` (SHOP) or `/products?category=<slug>` (MART), (3) fallback `/categories`. Applies to every CMS-driven carousel automatically.

**Bug #3 — Home category tile lands on all-products page**  
Both `ShopHome.jsx::CategoryGridSection` and `ConfigHomepage.jsx::CategoryGrid` now prefer an explicit `c.link` when the admin has set one, otherwise deep-link to the slug-based category page. Explicit link normalisation (`/shopbaked` → runtime `basePath`) keeps CMS content portable.

**Bug #4 — Banner Trio image upload → HTTP 413**  
`pages/admin/AdminHomepageManagement.jsx` — added a canvas-based `compressImageIfNeeded` pass that resizes to ≤2200 px longest side and re-encodes as JPEG at progressive quality (0.85 → 0.75 → 0.65 → 0.55) until the payload is ≤900 KiB — comfortably under nginx-ingress's default 1 MiB body limit and our app-level 8 MiB cap. Skips SVG/GIF. Non-blocking toast informs the admin when an auto-optimisation kicked in.

**Bug #5 — Category Grid tile edit missing link field**  
Same file — added `F.url("link", "Target link (blank ⇒ /shop/c/{slug})")` to the `category_grid` schema; renderer respects it via the fix from Bug #3. The tile form is now full: Slug / Display name / Icon URL / Target link.

**Bug #6 — Seller Apply Step 2 country picker shows CI + LR**  
`apps/martbaked-sellers/SellerApplyWizard.jsx` — replaced `+231 (LR)` with `+91 (IN)`. Backend `core/utils/phone.py` already supported IN dial code — no backend change needed.

**Bug #7 — SHOP Step 5 shows MART categories**  
Root cause was two-fold and required a schema change:
  1. `SellerApplyWizard.jsx::StepCategories` was hard-coded to `/mart/categories`. Now uses `useSellerModule()` and calls `/shop/catalogue` when the seller portal is SHOP, normalising the tree to a list of `{id, name}` cards.
  2. Backend `supplier_category_interests.category_id` had a hard FK on `mart_categories` that rejected SHOP category IDs. Alembic migration `0046_sci_module` drops the FK and adds a `module` VARCHAR(8) discriminator + `ix_sci_supplier_module` index. The step-5 handler in `shared/suppliers/routes.py` now accepts `module` per item and looks up in the right table (MartCategory vs ShopCategory).

**Bug #8 — Seller Apply document upload asks for a URL**  
New public upload endpoints in `shared/suppliers/routes.py`:
  * `POST /api/martbaked/sellers/apply/{app_id}/uploads` (multipart, kind=document|image, max 8 MiB, PDF+image only, only draft/action_required apps).
  * `GET  /api/martbaked/sellers/apply/{app_id}/files/{path:path}` (public preview by opaque timestamped path).
New reusable `ApplyFileUpload` component in `SellerApplyWizard.jsx` renders "Choose file" + preview link + Replace + clear. Wired into Step 8 (Documents) *and* Step 3 (Owner ID document) — both now accept real files instead of paste-a-URL.

**Testing** — `testing_agent iter79`: 10/10 backend pytests + 8/8 UI bug verifications + 3/3 regression checks (MART home, SHOP admin, guest cart) all PASS.

**Deferred security follow-ups** (raised by testing agent — worth tracking): (a) rate-limit the public `/apply/{id}/uploads` endpoint per-IP; (b) switch to signed URLs for submitted apps' file-serve so post-submit PII stops being retrievable from an opaque path alone.




## 2026-03-03 — SHOP Admin Surface Phase 2 (Catalog + Attributes + Approvals + Products) — COMPLETE
Four SHOP-native admin pages plus the backend endpoints that back them.

- **Backend `modules/shop/routes.py`** — added full CRUD:
  * `GET/POST/PATCH/DELETE /admin/modules/shop/categories[/{id}]` — with sub-count preload and 409 guard when products still reference the row.
  * `GET/POST/PATCH/DELETE /admin/modules/shop/subcategories[/{id}]` — parent validation, unique slug per parent.
  * `GET/POST /admin/modules/shop/categories/{cat_id}/attributes` and `PATCH/DELETE /admin/modules/shop/assignments/{id}` — assign SHOP attribute definitions (from mart_attributes where module='shop') to shop_categories/shop_subcategories via shop_category_attributes with `is_required / customer_visible / supplier_editable / sort_order` toggles.
- **Backend `modules/mart_attributes/routes.py`** — added optional `module` query filter to `GET /admin/mart/attributes` and `module` field to `AttributeIn` so SHOP-scoped definitions live in the same table without polluting MART's list.
- **Frontend** — four new pages, all module-accent amber:
  * `AdminShopCatalog.jsx` (`/admin/modules/shop/catalog`) — split-pane categories + sub-categories editor with search, image thumbnails, add/edit modal, delete-with-confirm.
  * `AdminShopAttributes.jsx` (`/admin/modules/shop/attributes`) — left pane definitions (create/soft-delete) + right pane assignments per category/sub-cat scope with inline toggle chips.
  * `AdminShopProductApprovals.jsx` (`/admin/modules/shop/approvals`) — 3-bucket queue with select-all + bulk approve/reject, per-product detail drawer showing images/variants/meta, notes-required rejection guard.
  * `AdminShopProducts.jsx` (`/admin/modules/shop/products`) — read-only browser with country/status/search filters + storefront preview link.
- **Frontend `AdminApp.jsx`** — introduced `CatalogSwitch / AttributesSwitch / ApprovalsSwitch / ProductsSwitch` wrappers that read the workspace `:code` outlet context and mount the MART or SHOP-native component. Zero route reshuffle needed.
- **Frontend `ModuleWorkspace.jsx`** — un-gated `products / catalog / attributes / approvals` so SHOP admins now see them. `category-requests / inventory / purchase-orders / invoices / suppliers/product-requests` remain MART-only.
- **Testing** — new pytest file `/app/backend/tests/test_shop_admin_phase2.py` (13 tests, all pass). Testing agent iteration 78: 12/12 UI end-to-end scenarios PASS, MART side untouched.




## 2026-03-03 — SHOP Admin Surface Phase 1 — COMPLETE
First slice of the SHOP admin console: expose the existing Suppliers governance flow inside the SHOP module workspace without duplicating any code.

- **Backend** — `GET /api/admin/modules/mart/suppliers/applications` gained an optional `module` query filter that matches on `Supplier.modules ? '<MODULE>'` (JSONB single-element containment). Bucket counts also honour the filter so the SHOP queue is fully scoped. Router prefix unchanged (backwards-compatible with existing MART bookmarks/integrations).
- **Frontend `AdminSupplierApplications.jsx`** — accepts a new `module` prop (default `"mart"`), passes `module=<MOD>.toUpperCase()` on every list query, and re-labels the header + colour token (green for MART, amber for SHOP).
- **Frontend `AdminSuppliersShell.jsx`** — reads the module code from the workspace outlet context, propagates it down, and hides the MART-specific "Product Requests" tab under SHOP (that flow depends on the MART master-product model and needs a SHOP-native version — see Phase 2).
- **Frontend `ModuleWorkspace.jsx`** — dropped `martOnly:true` on the `suppliers` entry so SHOP admins finally see a "Suppliers" tab in `/admin/modules/shop`. The rest of the MART-heavy entries (Catalog/Attributes/Approvals/Category Requests/Product Requests/Inventory/Purchase Orders/Invoices) remain MART-only pending Phase 2.
- **DB touch-up** — flipped `sup_demo_delta_seed.modules` from `["MART"]` → `["MART","SHOP"]` so the SHOP admin queue has real data to demo (matches the seed intent from the handoff summary).
- Verified live: `/admin/modules/shop/suppliers` renders "SHOPbakēd · Suppliers" with amber tint, Approved bucket shows DEMO Delta Beverages, Product Requests tab hidden. MART side untouched (`/admin/modules/mart/suppliers` still shows both tabs and only MART-tagged suppliers).




## 2026-03-02 — Guest MART Card Snapshot — COMPLETE
Mirror of the SHOP guest-cart pattern for MART lines so the cart drawer/page can render offline.

- `contexts/BakedContexts.jsx::addItem` — MART guest add now captures a full snapshot at add-time: `{id, name, unit, image, brand, price, currency, currency_symbol, was_price, compare_at_price, original_price, master_price, is_stocked_locally}`. All three callers (`components/mart/ProductCard.jsx`, `pages/ProductDetailPage.jsx`, `pages/mobile/MobileProductDetail.jsx`) already pass the full product object → zero call-site changes needed.
- `contexts/BakedContexts.jsx::hydrateGuest` — MART branch prefers `snapshot` when present, falls back to `GET /api/mart/products/{id}` only for legacy guest entries added before this change (backward-compat, no cart is stranded after the upgrade).
- Verified live: guest adds "Banane Cavendish", opens `/cart` — **0** `/api/mart/products/{id}` fetches during hydrate; the cart row, subtotal, delivery, min-order warning, and "Login to Proceed" CTA all render straight from localStorage.




## 2026-03-02 — Guest Cart + Login-at-Checkout (Fixing_Prompt guest_cart) — COMPLETE
Full behaviour change requested via Fixing_Prompt.docx: customers must be able to shop, add to cart, view cart and mutate quantities without any login prompt. Login is deferred to the "Proceed to Checkout" step. Applies to both SHOPbakēd and MARTbakēd; MART guest cart already existed, SHOP was the gap.

- **`contexts/BakedContexts.jsx` — CartProvider extended**
  * `hydrateGuest` now hydrates BOTH modules: MART entries fetch `/mart/products/{id}` (unchanged), SHOP entries render from the `snapshot` object captured at add-time (`title, image, price, compare_at_price, currency, sku, variant_attributes`) so no per-load network round-trip is required.
  * New `mergeGuestIntoServer` — on the null→customer edge (fresh login) each guest line is replayed via `POST /api/shop/cart/items` or `POST /api/carts/me/items`. Both endpoints upsert on duplicate ⇒ natural quantity merge. Guest localStorage cleared to `{items:[]}` on success.
  * `addShopVariant(variantId, qty, snapshot?)` — dropped the `if (!customer) throw` guard. Guest path writes `{ id:"gs_<variantId>", module:"shop", variant_id, product_id, quantity, snapshot }` to `baked_guest_cart`.
  * `prevCustomerId` ref tracks auth transitions so the merge fires exactly once per login (never on every hot-reload or refresh).
- **`apps/shopbaked/pages/ShopHome.jsx::ProductCard`** — `addToCart` now routes through `useCart().addShopVariant(...)` with a full product snapshot. Removed the raw `api.post("/shop/cart/items")` call and the 401 → "Please sign in to add to cart" toast.
- **`apps/shopbaked/pages/ShopProduct.jsx`** — PDP `addToCart` now guest-friendly: no `!customer` early-return, snapshots the active variant SKU/attributes into the guest cart.
- **`pages/CartPage.jsx`** — `doCheckout` gates guests with `openLogin("/checkout")` (never blocks). Checkout button label switches to `"Login to Proceed"` when logged out; only disabled for authed users when min-order or unavailable-items rules fail.
- **`pages/mobile/MobileCart.jsx`** — Same gate + label swap on the sticky bottom CTA (`"Login to Proceed"` guest / `"Checkout"` authed).
- Reused the existing `openLogin(target)` → `sessionStorage.baked_post_login` → `loginWithToken` auto-redirect plumbing for the checkout-intent state (Fixing_Prompt §12). No new auth architecture introduced.
- Tested end-to-end via `testing_agent iter77`: all 10 acceptance tests PASS on desktop 1920 + mobile 390. Guest add, multi-add, qty stepper, refresh persistence, cancel-login, cart merge (guest+server via upsert), authed regression, and PDP add-to-cart all green.




## 2026-03-02 — SHOP Product Carousel: single-row horizontal scroll — COMPLETE
- `ProductCarouselSection` (`apps/shopbaked/pages/ShopHome.jsx`) refactored from a wrapping responsive grid into a single-row horizontal scroll rail with snap points, matching the "Fresh drops" Fixing_Prompt behaviour.
- Cards-per-viewport: mobile 2 (`basis-[46%]`), tablet 3, laptop 4, desktop ≥xl 5. All extra items remain in the same row and are revealed via swipe (touch) or hover-fade prev/next chevrons (pointer).
- Applies to every CMS section with `section_type: product_carousel` automatically — no admin action needed.
- `View all` unchanged; still deep-links to `section.config.view_all_link` or `/shop/categories`.
- data-testid renamed rail → `shopbaked-product-carousel-rail`; added `shopbaked-carousel-prev` / `shopbaked-carousel-next`. Verified live at 1920×900 and 390×800.




## 2026-03-02 — Driver OTP wired to Twilio SMS (was mocked) — COMPLETE
- `POST /api/driver/auth/request-otp` now calls `core.providers.otp_provider.get_otp_provider().send_code(phone, code, locale)` — the same integration path already used by customer login (`shared/auth/routes.py`) and supplier onboarding (`shared/suppliers/routes.py`).
- Previously the endpoint only generated the code + printed it to the backend log — no SMS was ever dispatched, which is why baked.ci `/driver/login` never received a text.
- Provider selection remains env-driven (`OTP_PROVIDER=twilio` uses `TwilioSmsProvider` with `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_PHONE`). Preview env still falls back to dev-echo and surfaces `dev_hint` when `APP_ENV != production`.
- Locale routing: `country == "CI"` sends the French SMS body; every other country gets the English body — matches the customer OTP behaviour.
- Verified in preview: `curl POST /api/driver/auth/request-otp {phone_e164:"+919990004321", country:"IN"}` returned `{otp_id, dev_hint:"098126"}` and the backend log confirmed `otp.dev_send` provider dispatch.




## 2026-03-01 — SHOPbakēd Seller Routes + Sell-on-BAKĒD Link — COMPLETE
- New route `/shopbaked/sellers/*` in `App.js` mounts `<SellerApp module="shop" />` — reuses the entire MART seller flow (landing / apply wizard / login / activate / application-status) with a SHOP-branded skin. No component duplication.
- `SellerApp.jsx` gained a `SellerModuleContext` + `SELLER_MODULE_PROFILES` registry keyed on `mart | shop`. Each profile carries `{code, label, accent, basePath, tagline, hero_desc, code_prefix}` so nested components read the right module without extra prop threading.
- Injected the module's accent as a scoped CSS custom-property override (`--pl-accent`, `--pl-accent-soft`) on the SellerApp root, so the entire partner-landing stylesheet re-tints without a stylesheet fork. Also swaps `<title>` to "SHOPbakēd Sellers — Grow with BAKĒD".
- `SellerHeader`, `SellerFooter`, `SellerLanding` (hero copy, CTAs, "Check my application status" link) all consume `useSellerModule()` and drive their links off `mod.basePath`.
- `PartnerLandingApp.jsx` SHOPbakēd card recoloured to SHOP amber `#FCC44C` and rewired: `cardHref: "/shopbaked/sellers"`, `applyHref: "/shopbaked/sellers/apply"`, `internal: true` (no more external `shop.partner.baked.ci`). Outer atom + card gradients + copy all module-consistent.
- Seller data model is intentionally unified — Supplier records still live under `/api/suppliers`, so a seller who applied via `/shopbaked/sellers/apply` and gets approved lands in the same `/martbaked/{slug}/portal/...` post-login. Their `modules[]` array gates the SHOP tab there (already implemented iter71).
- Verified: `/shopbaked/sellers` shows "Become a SHOPbakēd Seller." with amber CTAs; `/shopbaked/sellers/login` shows the amber Sign in button and "SHOPbakēd Seller Program" footer; `/Sell-on-baked` SHOPbakēd card is now amber and routes internally to /shopbaked/sellers.



## 2026-03-01 — SHOP Hero Inline Editor (Fixing_Prompt v12) — COMPLETE
- Extended the existing schema-driven `SectionEditor` in `pages/admin/AdminHomepageManagement.jsx` with two new field kinds — `group` (nested object) and `bool` (checkbox) — and a schema-level `tabs` option so section types can split their config across multiple focused surfaces.
- Hero schema now declares 4 tabs: **Basics**, **Slides**, **Right Banners**, **USP Strip**. Each maps to the exact JSONB slices the frontend renderer already consumes (`slides[]`, `right_top`, `right_bottom`, `usp[]`) — zero new endpoints.
- `_SLIDE_FIELDS` / `_PROMO_FIELDS` / `_USP_FIELDS` builder constants give admins per-item form controls (eyebrow, headline, description, image w/ upload, badge, primary + secondary CTAs; enabled toggle for right banners; icon key + title + subtitle for USP tiles).
- `setGroupField` state helper handles nested `config[groupName][subField]` writes so `right_top`/`right_bottom` edits round-trip through the existing PATCH endpoint intact.
- data-testids added: `hp-editor-tab-{basics|slides|right|usp}`, `hp-editor-group-right_top`, `hp-editor-group-right_bottom`, `hp-editor-list-item-slides-{i}`, `hp-editor-list-item-usp-{i}`, `hp-editor-list-add-{name}`.
- Verified in the deployed admin UI on desktop 1440: all 4 tabs render, slides list shows 3 pre-seeded entries with image previews + Upload buttons, right banners show the two grouped forms with Enabled checkboxes, USP shows 4 tiles.



## 2026-03-01 — SHOP Hero Carousel + Right Promos + USP Strip (Fixing_Prompt v11) — COMPLETE
Redesigned the SHOPbakēd homepage hero per Fixing_Prompt v11:

- **Data model — reused existing CMS** (`HomepageSection` config JSONB, no schema change). Seeded `hps_ci_shop_010_hero.config` with:
  * `slides[]` — array of {eyebrow, headline, description, image, badge, cta_label/cta_link, secondary_cta_label/secondary_cta_link}
  * `right_top` + `right_bottom` — {enabled, image, label, heading, description, cta_label, cta_link, badge}
  * `usp[]` — 4 tiles {icon, title, subtitle}: Vetted sellers · Same-day CI · Fresh drops · Affordable Pricing
  All editable from existing `/admin/homepage-management`. No hard-coded frontend content.
- **Frontend rewrite** (`apps/shopbaked/pages/ShopHome.jsx::HeroSection`):
  * Grid `lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]` — LEFT carousel + RIGHT stacked promos (hidden `< lg` for mobile).
  * `HeroCarousel` — auto-rotates every 5.5s, pauses on hover, touch swipe on mobile, keyboard-accessible indicators, staggered opacity transitions, per-slide badge/eyebrow/secondary CTA support. First slide `loading=eager`, rest lazy per spec §12.
  * `RightPromo` — image-cover card with optional badge, label, heading, description, amber CTA button.
  * `UspTile` — icon-mapped tiles (`shield/truck/sparkles/tag` → lucide icons). Row hidden below `lg` per spec §9.
  * Falls back to legacy single-hero fields (`cfg.background_image/cta_label/…`) when `slides[]` is absent for older seeds.
- data-testids: `shopbaked-hero-carousel`, `shopbaked-hero-slide-{i}`, `shopbaked-hero-cta-{i}`, `shopbaked-hero-dot-{i}`, `shopbaked-hero-right-top`, `shopbaked-hero-right-bottom`, `shopbaked-hero-usp`, `shopbaked-hero-indicators`.
- Verified: Desktop 1440 shows carousel + 2 right promos + 4 USP tiles + 3 pagination dots. Mobile 390 shows carousel only (`right_top_visible=False, usp_visible=False`).



## 2026-03-01 — SHOP Card/Image/Zoom/Filters (Fixing_Prompt v10) — COMPLETE
Four asks shipped:

- **§1 MART-style product cards** (`apps/shopbaked/pages/ShopHome.jsx::ProductCard`): image | name | important spec | price (+ strike-through + % off badge) | amber `+` add-to-cart button. Add button posts `/api/shop/cart/items` for the cheapest active variant without navigating. `data-testid=shopbaked-card-add-{id}`.
- **§2 Realistic per-theme images**: rewrote `modules/shop/demo_products_seed.py::_keyword_image` with a 40+ theme bank of direct Unsplash CDN URLs (dresses, menswear, sneakers, headphones, watches, sofas, etc.) + slug→theme lookup with fuzzy fallback. Backend enriched public products endpoint to include `min_price`, `compare_at_price`, `currency`, `first_variant_id`, `variant_attributes`, `variant_count` from cheapest active variant. Backfilled all 181 products + 362 variants.
- **§3 PDP image zoomer** (`apps/shopbaked/pages/ShopProduct.jsx::ProductImageZoom`): MART-parity hover-zoom (2.2× scale, transform-origin follows pointer, "Hover to zoom" affordance, disabled on `pointer: coarse` touch devices which have native pinch).
- **§4 Category filter drawer** (`apps/shopbaked/pages/ShopCategory.jsx::FilterDrawer`): right-side sheet with Max Price slider + Brand / Colour / Size facet chips (chip counts + toggle state). Trigger from new `SlidersHorizontal` icon in header; badge shows active filter count. `data-testids`: `shopbaked-category-filters`, `shopbaked-filters-drawer`, `shopbaked-filter-price`, `shopbaked-facet-{brand|colour|size}-{val}`, `shopbaked-filters-apply`, `shopbaked-filters-clear`.
- Smoke-verified on desktop 1440: /shop/c/mode-femme renders realistic dress + fashion imagery, cards show price/spec/`+` button, filter drawer opens, PDP image zooms on hover.



## 2026-03-01 — SHOP Product Grid Responsive Columns — COMPLETE
Per user spec (mobile: 2 / laptop: 4 / desktop: 5):
- `ShopCategory` product grid → `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`.
- `ShopHome` ProductCarousel `≥ sm` fallback grid → `sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` (mobile still uses the 2-up snap-scroll rail).
- Verified: 1440×900 shows 5 cards per row on /shop/c/mode-femme; 390×844 shows 2 cards per row.



## 2026-03-01 — SHOP Categories responsive grid — COMPLETE
- `ShopCategoriesIndex.jsx` grid → `grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6 md:gap-4` — mobile keeps its 3-up layout, tablet is 4, desktop shows 6 tiles per row per user spec. Verified at 1440×900 → 19 tiles render in a clean 6-column layout.



## 2026-03-01 — SHOP Demo Products (Fixing_Prompt v8) — COMPLETE
Populated every SHOP subcategory with a placeholder product so the storefront isn't empty before real sellers list inventory:

- **New idempotent seed** `modules/shop/demo_products_seed.py` — one demo product per subcategory (181 rows total across 19 categories), each with 2 variants (362 variants) covering colour/size/capacity attribute overrides.
- Uses Unsplash placeholder images from a per-category bank (fashion / apparel / electronics / home / etc.) so tile visuals stay on-theme.
- Products carry `status='active'` (matches the public storefront endpoint filter `status == 'active'`), attached to the demo supplier `sup_demo_delta_seed`.
- Deterministic ids (`shpprd_demo_{sub_slug}`, `shpvar_demo_{sub_slug}_{idx}`) so re-seeds skip existing rows and never touch real seller listings.
- Wired into `run_seed()` after homepage seed. Backfilled existing rows via one-off SQL to flip `published → active`.
- Verified: `/shop` Fresh drops rail now shows 2-up horizontal cards with real images; `/shop/c/mode-femme` shows 12 populated products across sub-categories with Mode Femme-appropriate imagery, left subcategory rail, and "Fresh drops in Mode Femme" promo strip.



## 2026-03-01 — SHOP Home Carousels + Category Landing Parity (Fixing_Prompt v7) — COMPLETE
User asked for "view all" links, a 2-up horizontal product rail, and MART-style category landing:

- **ProductCarouselSection** (`ShopHome.jsx`): mobile now renders a horizontal snap-scroll rail (`sm:hidden overflow-x-auto snap-x`) showing ~2 product cards per screen; `≥ sm` falls back to the existing 2/3/4-col grid. "N live" counter replaced with an amber "View all →" link (`shopbaked-carousel-view-all`) that deep-links to `section.config.view_all_link || /shop/categories` so admins can retarget the CTA per rail.
- **CategoryGridSection** (`ShopHome.jsx`): "N tiles" counter replaced with an amber "View all →" link (`shopbaked-category-view-all`) → `/shop/categories`.
- **ShopCategory** rewrite (`apps/shopbaked/pages/ShopCategory.jsx`): full parity with MART's Blinkit-style detail page — back button + category title + layout toggle (grid/list) header row, in-page search box, LEFT vertical subcategory rail (with icons) + RIGHT 2-col product grid. SHOP amber accent (#FCC44C) instead of MART green. Uses `/shop/products?category&subcategory` and `/shop/catalogue` for data.
- data-testids preserved: `shopbaked-category-back`, `shopbaked-category-search`, `shopbaked-sub-rail`, `shopbaked-sub-all`, `shopbaked-sub-{slug}`, `shopbaked-category-grid`, `shopbaked-category-empty`.
- Smoke-verified on mobile 390×844.



## 2026-03-01 — SHOPbakēd Mobile Header + 3-Column Categories (Fixing_Prompt v6) — COMPLETE
User-reported parity gap with MART mobile layout:

- **§Header missing on /shop**: `MobileShell.jsx` didn't include `/shop*` routes in `showHeader`. Fixed by extending `isHome`, `isCategory`, `isProduct`, `isCheckout`, `isOrder` route matchers to also match SHOP paths (`/shop`, `/shop/categories`, `/shop/c/*`, `/shop/p/*`, `/shop/checkout`, `/shop/order/*`). Header now renders on every SHOP screen.
- **§Header branding**: `MobileHeader.jsx` reads `activeModule` from `useApp()` and drives the notification bell tint/dot + drawer link icons + search-bar target from `MODULES[activeModule].color`. On /shop everything paints SHOP amber (#FCC44C); on / back to MART green (#77BC1F).
- **§3 tiles/row on mobile**: `ShopHome.jsx` `CategoryGridSection` grid changed to `grid-cols-3 md:grid-cols-4 lg:grid-cols-6` (was single-column below `sm`). `ShopCategoriesIndex.jsx` grid changed to `grid-cols-3` with tighter tile sizing (aspect-square + text-[11px]). Matches MART's 3-per-row mobile pattern.
- Verified on 390×844 viewport: header renders, bell/map pin amber, ShopHome category rail 3-per-row, /shop/categories 3-per-row.



## 2026-03-01 — SHOPbakēd Module Context / Navigation / Branding (Fixing_Prompt v5) — COMPLETE
Fixed the mobile SHOPbakēd "context leak" reported with 3 screenshots:

- **§3 / §6 Bottom nav is module-aware**: `MobileBottomNav.jsx` reads `activeModule` from `useApp()` and resolves Home/Categories destinations via a HOME/CATS route table (`mart→/, shop→/shop, shop→/shop/categories, …`). Active-tint pulled from the `MODULES` registry (SHOP amber #FCC44C, MART green #77BC1F, etc.) plus a matching FAB gradient. Cart + Profile tabs stay MART green — they're global infrastructure.
- **§2 New SHOP Categories page**: `apps/shopbaked/pages/ShopCategoriesIndex.jsx` at `/shop/categories` fetches `/api/shop/catalogue?country=CI` and renders the full SHOP tree (Mode Femme, Mode Homme, Shoes & Sneakers, Electronics, Home, …) — 19 tiles rendered on preview DB. Zero MART leak.
- **§1 App-selector shows active module**: `AppSelectorSheet.jsx` now reads `activeModule` and paints an "Active" chip + thicker tinted border on the currently-selected card (testid `m-app-selector-current-{code}`). Swaps live when the user switches modules.
- **§9 Cart cross-module regression**: unchanged — iter71 fix stands. Verified in testing agent iter75 (add MART then SHOP → both persist through module switches).
- Testing agent iter75 — Tests A / B / C all PASS on mobile 420×900. Zero critical issues. Minor testid alias added for cross-viewport spec parity (`data-cart-module-badge` on the mobile cart line).



## 2026-03-01 — SHOP Delivery PIN SMS + E.164 Fix — COMPLETE
- **PIN SMS wiring**: `POST /api/shop/checkout` now fires `send_sms(customer.phone, body, tag='shop_delivery_pin')` after commit inside a try/except — order flow never fails if SMS hiccups. Response gains a `delivery_pin_sms: {attempted, delivered, channel, phone}` object so the UI can toast the customer's inbox. Reuses the existing pluggable `sms_provider` (dev logs / Twilio in prod).
- **Frontend toasts**: `CheckoutPage.jsx` + `MobileCheckout.jsx` — after a SHOP order succeeds, toast "Delivery PIN sent to +…" when `delivered=true`, else "Delivery PIN is on your order page". `ShopOrderConfirmation` PIN card gains "Also sent by SMS to your registered phone" caption.
- **E.164 normalisation bug (BLOCKER for real Twilio)**: iter74 testing agent found `_e164()` in `shared/auth/routes.py` + `shared/suppliers/routes.py` was concatenating raw ISO2 country_code producing malformed `+CI2250700...` phones. Fixed with a shared `core/utils/phone.py::to_e164` that:
  - accepts either ISO2 (`CI`) → dial code via `ISO2_TO_DIAL` map (CI/LR/GH/NG/SN/BJ/TG/BF/ML/GN/CM/IN/US/GB/FR/CA), or `+225`/`225`
  - trusts client-provided `+…` phones as-is
  - guards against double-prefixing when digits already start with the dial code
- **Data backfill**: repaired 16 malformed `+XX...` phone rows across `customers`, `supplier_applications`, `suppliers`.
- Testing agent iter74 — 10/10 backend pytest + full Playwright pass. Zero critical issues remaining (the E.164 blocker was fixed post-report).



## 2026-03-01 — SHOP Delivery Lifecycle + PIN-Gated Handoff — COMPLETE
Full SHOP fulfilment flow now green:

- **Migration 0045** adds `delivery_pin` (varchar 6), `delivery_pin_attempts` (int), `delivered_at` (timestamptz) to `shop_orders`.
- **Backend**: `POST /shop/checkout` mints a `secrets.randbelow(1_000_000)` 6-digit PIN, stored on the order and returned only to the customer via `/shop/orders/me` + `/shop/orders/{id}` (`expose_pin=True` flag in `_order_dict`). Seller-facing `_seller_order_dict` NEVER surfaces the PIN.
- **Seller portal endpoints** (`/app/backend/modules/shop/portal_routes.py`): `GET /shop/portal/orders` (with buckets), `GET /shop/portal/orders/{id}`, `POST /shop/portal/orders/{id}/status` (Pydantic pattern `packing|shipped` — `delivered` intentionally rejected), `POST /shop/portal/orders/{id}/deliver` (constant-time `secrets.compare_digest` PIN check + 5-attempt brute-force lock, idempotent on already-delivered).
- **SA override** (`/app/backend/modules/shop/routes.py`): `POST /admin/modules/shop/orders/{id}/status` accepts any of `pending_payment|paid|packing|shipped|delivered|cancelled|refunded`; auto-stamps `delivered_at` when SA flips to delivered.
- **Frontend**:
  - `apps/shopbaked/pages/ShopCheckout.jsx` ShopOrderConfirmation shows a big amber PIN card (`shopbaked-order-pin-card` / `shopbaked-order-pin`) when status ∈ {paid, packing, shipped}; swaps to a green Delivered banner with `delivered_at` timestamp on completion.
  - `pages/mobile/MobileActivities.jsx` — status pill green (#77BC1F) when SHOP order is `shipped` or `delivered` (MART unchanged: only delivered = green). Added `data-testid="m-act-ord-status-{id}"`. Reads `?tab=orders` deep-link from URL.
  - New `apps/martbaked-sellers/portal/PortalShopOrders.jsx` — bucket bar (paid → packing → shipped → delivered → cancelled), row detail drawer with `Start packing`/`Mark shipped` actions and PIN input for delivery.
- **Seed**: `sup_demo_delta_seed` now populates `seller_slug='delta'` so `/martbaked/delta/portal/shop-orders` resolves on fresh installs. Backfilled on the existing row.
- Testing agent iter73 — 19/19 backend tests + full Playwright pass. Zero critical issues.



## 2026-03-01 — Order History Merge (MART + SHOP) — COMPLETE
- `MobileActivities.jsx` (which DesktopProfileShell also renders) now Promise.all's `/api/orders/me` (MART/FOOD) + `/api/shop/orders/me`. SHOP orders are normalised with `normaliseShopOrder()` (snapshot.lines → items[], delivery_address → address) and merged in place, sorted by created_at desc.
- Filter chips are module-aware: ALL/MART green (#77BC1F), SHOP amber (#FCC44C), FOOD orange (#FF7043).
- Row click is module-aware: SHOP → `/shop/order/{id}` (ShopOrderConfirmation), MART/FOOD → `/orders/{id}`.
- Both endpoints have independent `.catch(() => [])`, so one transient 500 never hides the other module's orders.
- Testing agent iter72 — 3/3 backend contract tests + all Playwright bullets green. Zero action items.



## 2026-03-01 — SHOPbakēd Fixing_Prompt v3 (Homepage / Images / Branding / Global Cart) — COMPLETE
Four P0 issues from customer's v3 fixing prompt resolved:

- **§4 CRITICAL global-cart bug**: SHOP → MART flow was silently wiping SHOP lines. Root cause in `contexts/BakedContexts.jsx` `CartProvider.addItem` — it called `setCart(martOnlyResponse)`, replacing the merged (MART + SHOP) state. Fixed by switching to `await load()` (which re-fetches both `/carts/me` + `/shop/cart/me` and rebuilds the merged shape). Same `await load()` pattern applied to `clear()`.
- **§1 Homepage Management not reflected**: Rewrote `apps/shopbaked/pages/ShopHome.jsx` with a full renderer registry for every section type (`hero`, `category_grid`, `product_carousel`, `promotional_banner`, `banner_trio` — the missing one that caused "Explore our latest collection" to vanish — `brand_carousel`, `cta_strip`). Storefront is now 100% CMS-driven from `/api/homepage?country=CI&module=shop`. Empty state (`shopbaked-home-empty`) points admin to `/admin/homepage-management` when no sections are enabled.
- **§2 Uploaded images not rendering**: Added `abs()` resolver in ShopHome that prefixes `/api/homepage/uploads/…` relative URLs with `REACT_APP_BACKEND_URL`. Applied to hero.background_image, category.image, banner.image, brand.image, and product cards. Mirrors the working MART implementation in `ConfigHomepage.jsx`.
- **§3 Branding accent leaking across modules**: Cart icon + badge (TopNav.jsx), AI Sparkles icon (TopNav.jsx), and delivery MapPin (AddressPill.jsx) now derive their colour from `useApp().activeModule` via the `MODULES` registry. Route change → `ModuleTabs` mount-effect syncs `activeModule` → all three icons flip green ↔ amber ↔ next module colour with no FOUC after hard refresh.
- Testing agent iter71 — 13/13 backend + all Playwright bullets green. Zero action items.



## 2026-03-01 — SHOPbakēd Cart Integration Fixes (Fixing_Prompt.docx) — COMPLETE
Three P0 fixes shipped from customer's follow-up prompt with attached screenshots:

- **Issue 1 — "Coming soon" toast on SHOP switch**: `/app/frontend/src/lib/modules.js` — SHOP module status flipped from `coming_soon` → `active`. Fixes toast fire in `ModuleTabs.onTab` and re-enables the SHOP card in `AppSelectorSheet` (no more "Soon" chip).
- **Issue 2 — "Go to checkout →" CTA on /shop**: `/app/frontend/src/apps/shopbaked/pages/ShopHome.jsx` — removed the SHOP-specific top-right CTA. Cart access remains ONLY through the global header cart icon. `CartPage.doCheckout` and `MobileCart.goCheckout` now always route to `/checkout` (unified), never `/shop/checkout`.
- **Issue 3 — CRITICAL: SHOP add-to-cart succeeded but cart stayed empty**: `/app/frontend/src/apps/shopbaked/pages/ShopProduct.jsx` — `addToCart` was calling `api.post("/shop/cart/items", …)` directly, bypassing CartContext. Fixed to route through `useCart().addShopVariant(variantId, 1)` which posts + `await load()` refreshes the merged MART+SHOP cart. Result: nav cart badge (`top-nav-cart-count`) increments 0→1 immediately, `/cart` shows the SHOP line with `cart-module-badge-{id}='SHOP'` + variant attributes.
- Guest add-to-cart now opens the global sign-in dialog (`openLogin()`) instead of erroring silently.
- Testing agent iter70 — 9/9 Playwright bullets green (incl. persistence across refresh, module-switch, mixed cart, unified checkout). Backend regression 3/3.



## 2026-03-01 — SHOPbakēd Unified Cart Drawer + Mixed Checkout (COMPLETE)
- **Frontend-only iteration** — backend SHOP + MART cart/checkout endpoints unchanged (already isolated by design).
- `contexts/BakedContexts.jsx`: `CartProvider.load()` now `Promise.all`s `/carts/me` (MART) and `/shop/cart/me` (SHOP), merging into a single `cart.items` list with per-item `module` field. Exposes `cart.mart` / `cart.shop` sub-totals for the UI. Per-endpoint `.catch → empty` so one failing module never blanks the other.
- `pages/CartPage.jsx`: Each line renders a MART (green) / SHOP (amber) badge via `data-testid=cart-module-badge-{id}`. Order Summary splits into `cart-summary-mart-subtotal` + `cart-summary-shop-subtotal` when both modules present. **Min-order gate applies to MART only** (`minOrderOk = hasMart ? martEligible : true`). SHOP-only cart routes Checkout button to `/shop/checkout`; anything else routes to `/checkout`.
- `pages/mobile/MobileCart.jsx`: Same treatment, `m-cart-badge-{id}` per row, `goCheckout` mirrors desktop routing.
- `pages/CheckoutPage.jsx` + `pages/mobile/MobileCheckout.jsx`: `placeOrder` now places MART first, then SHOP (inner try/catch so SHOP failure surfaces a toast but preserves the MART receipt navigation). SHOP-only checkout routes to `/shop/order/{id}`.
- Testing agent iteration 69: 3/3 pytest (mixed carts stay independent, dual-checkout mints both orders, SHOP-only routes correctly), 5/5 Playwright review-request bullets green.



## 2026-02-24 — Social.docx Issue #16: Product card + button (COMPLETE)
- Restored / polished the tap-to-add `+` pill on customer product cards.
- Desktop `ProductCard.jsx`: replaced text `+ Add` with lucide Plus icon + 'Add', h-9 (36px), `active:scale-95`, `aria-label`.
- Mobile `MobileProductCard.jsx` row layout: added the missing Plus icon + bumped to h-9 (was h-6 text-only); `aria-label`.
- Mobile grid layout already had the Plus icon — added the missing `aria-label` for a11y consistency.
- Testing agent verified 60/60 product cards on desktop + mobile home carousel + mobile row toggle. Tap → cart badge increments, stepper replaces the pill; removing the last unit restores the pill (`/app/test_reports/iteration_60.json`).
- **Phase 5 (Website UX polish) is now fully shipped** — all of #12, #13, #14, #15, #16 are live.

## 2026-02-24 — Social.docx Issue #15: Word sweep / branding consistency (COMPLETE)
- Canonical: `BAKĒD` (uppercase + macron) and `MARTbakēd / SENDbakēd / SHOPbakēd / FOODbakēd / AUTObakēd / IMMObakēd`.
- Fixed user-visible copy in 9 spots:
  - Frontend: `SupplierInvoicesPage.jsx`, `BakedLogo.jsx` altBrand, `MobileOrderConfirmation.jsx`, `MobileRewards.jsx`, `DesktopProfileShell.jsx`, `MobileProfile.jsx`
  - Backend: `supplier_invoices/service.py` (audit actor labels), `purchase_orders/notifications.py` (email subjects + brand chip), `purchase_orders/grn.py` (PDF header + footer_note)
- Fixed 3 stale test assertions in `test_purchase_orders_phase4c_notifications.py` that hardcoded the old `[BAKED]` subject prefix.
- Left untouched (by design): asset URLs on the Emergent CDN (immutable filenames), the `BAKED_ENV` env var name, the `_make_ref_code` referral prefix (ASCII by design), and code comments.
- Repo-wide grep now returns ZERO visible-text violations of `MARTbaked`, `SENDbaked`, `baked Rewards`, or `[BAKED]`.

## 2026-02-24 — Social.docx Issue #14: Footer redesign v2 (COMPLETE — user-corrected spec)
- Rewrote to exact 4-section spec provided by user:
  - **Brand**: BAKĒD logo + Google Play + Apple App Store download buttons
  - **Useful links**: About us · FAQs · Blogs/News · Career
  - **Opportunities**: Partner with Baked · Sell on Baked · Delivery Partner · Invest with us
  - **Support**: Help Center · Contact Us · Terms & Conditions · Privacy Policy
- Clean single-line copyright bar underneath.
- Kept all existing correct URLs (/about /help /blog /careers /partner /Sell-on-baked /driver /invest /contact /terms /privacy).
- Store badges link to `play.google.com/store` and `apple.com/app-store/` — swap to real listings when live.

## 2026-02-24 — Social.docx Issue #14: Footer redesign v1 (SUPERSEDED)
- Brand column: logo + green Sparkles icon + brand promise ("Groceries, rides, deliveries and homes — one app for everyday Africa. Fast, fair, and unapologetically local.") + 5 social pills (Facebook / Instagram / Twitter / LinkedIn / YouTube) + mailto contact.
- Legal bar (row 2): copyright with current year, country flag + name, and 4 quick legal links (Terms / Privacy / Cookies / Accessibility).
- All existing `footer-link-*` testids preserved (no regression on Issue #12 links).
- Verified 28/29 desktop checks by testing agent (`/app/test_reports/iteration_58.json`). Mobile stacking is untestable in preview because `/terms` and `/privacy` switch to MobileShell — a shell/route decision, not a Footer bug.

## 2026-02-24 — Homepage CMS Phase A (COMPLETE)
- Backend: new `homepage_sections` table (`country`, `section_type`, JSONB `config`, `display_order`, `is_enabled`) + migration 0029. JSON config keeps future section types migration-free.
- Public route `GET /api/homepage?country=CI|IN` returns enabled sections ordered.
- Admin routes `GET/POST/PATCH/DELETE /api/admin/homepage-sections` + `PATCH /reorder`.
- Seeded 10 default sections × 2 countries (CI + IN): hero, module_switcher, category_grid, promotional_banner, product_carousel×2, banner_trio, brand_carousel, app_promotion, cta_strip.
- Admin UI `/admin/homepage-management` (new sidebar link, Home icon): country selector, table with order/status/actions, up/down reorder, enable/disable toggle, delete, and a **schema-driven editor drawer** — each section_type declares its fields in `SECTION_SCHEMAS`, so future types don't require rebuilding the editor.
- Customer homepage swapped to `ConfigHomepage.jsx` which fetches the config and renders 9 minimal per-type renderers. Empty-state points admins at `/admin/homepage-management`.
- Preserved MART/FOOD/SHOP/SEND/AUTO/IMMO module switcher (module_switcher section, ordered #2).
- Also fixed migration 0025 to seed IN country row before FK-dependent vehicle inserts (post-DB-reset resilience).

Phase B (editors polish + object-storage image uploads) and Phase C (Baked Mart PDF visual redesign, brand logos, QR codes, exact typography) to follow.

## 2026-02-24 — Issue #13 rework per user spec (COMPLETE)
- **Removed** Offers icon and Orders icon from TopNav (per user requirement).
- **Added** AI Assistant menu item ([data-testid="top-nav-ai-assistant"]) using green Sparkles icon → routes to `/ai-assistant`.
- **Converted** FR/EN pill switcher into a proper dropdown ([data-testid="top-nav-language-switcher"]) — trigger shows current locale (FR or EN) with chevron; opens a Popover with "FR — Français" / "EN — English" options.
- Kept everything else unchanged: Logo, Address, Country, Search, Account, Cart, Theme.
- Offers + Orders still exist as routes and in the mobile & desktop side drawers (AI Assistant added there too).
- Routes / pages / backend for Offers and Orders are untouched.

## 2026-02-24 — Social.docx Issue #13: Top header tightening (SUPERSEDED)
- Cart button: badge moved to top-right (`-top-1.5 -right-1.5`), amount `whitespace-nowrap` + only shown on `lg+`, `shrink-0` on the wrapper.
- Offers / Orders / Login collapsed from icon+label stacks into consistent icon-only 40×40 pill buttons on `md+`.
- Language switcher and Theme toggle hidden below `lg` (they duplicate what's in the drawer).
- Hamburger (`topnav-hamburger`) visible whenever below `lg` — one obvious escape hatch.
- Address pill hidden below `lg`; at `lg` uses a compact "Set address" label with `max-w-[140px]` (grows to 240px at `xl+`).
- Verified 100% by testing agent across 1440 / 1200 / 1024 / 820 / 700 (`/app/test_reports/iteration_57.json`).

## 2026-02-24 — Social.docx Issue #12: Mobile hamburger menu (COMPLETE)
- Root cause: `MobileHeader` had no hamburger/menu access and `TopNav` at small viewports crammed all desktop chrome into one overflowing row.
- Fix (MobileHeader): added a `Menu` icon button ([data-testid="m-header-menu"]) that opens a right-side Sheet drawer ([data-testid="m-header-drawer"]) with Auth block, 6 quick-nav items, Country switcher, FR/EN language pills, theme toggle, and Sign out.
- Fix (TopNav): hid country popover / offers / orders / account / language / theme on `<md` viewports and moved them into a mirrored drawer accessible via [data-testid="topnav-hamburger"].
- Auto-close on route change via `useEffect` watching `location.pathname + location.search`.
- Added `SheetDescription` (sr-only) to satisfy Radix a11y contract.
- Human-readable label fallbacks (`tOr()` helper) so missing i18n keys never leak.
- Verified 100% by testing agent across mobile 390×800, desktop 1280×800, and small-desktop 600×800 (`/app/test_reports/iteration_56.json`).

## 2026-02-24 — Social.docx Issue #7: Google Maps address picker on checkout (COMPLETE)
- Root cause: `CheckoutPage.jsx` used an inline text-only "Add address" form that produced addresses without lat/lng/place_id — deliveries relied on free-text strings only.
- Fix: removed the inline form entirely. `+ Add new address` now opens the existing shared `AddressSelector` (Google Places autocomplete + Advanced Marker map preview + serviceability + auto-save).
- `saveAddress(candidate)` callback POSTs the picked place (with `latitude`, `longitude`, `place_id`, `formatted_address`, `region`, `postal_code`, `instructions`) to `/customers/me/addresses` and auto-selects the new row.
- Each address row on checkout now shows a `📍 lat, lng` pin sub-line proving the coordinate is stored.
- Testing agent 100% E2E (real Google Places autocomplete succeeded in preview): 8/8 acceptance points + placed a real COD order and confirmed `address_snapshot` carries the coordinates end-to-end (`/app/test_reports/iteration_55.json`).

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

### Phase 3 (Customer / Location) — ✅ COMPLETE
_(#7 shipped — every checkout now uses the Google Maps picker)_

### Phase 5 (Website UX) — ✅ COMPLETE
_(all five UX polish issues shipped: #12 mobile menu, #13 top header, #14 footer, #15 word sweep, #16 product card + button)_

### Phase 7 — P2
- Analytics dashboard (Slice D)
- Return / Refund handling (Slice H)

### Phase 8 — P2
- Real Stripe payment gateway integration for Wallet & Checkout
