# BAKĒD Platform — French-First i18n Implementation Plan (Workstream 3)

**Status:** DRAFT — awaiting user approval before implementation
**Owner:** E1 (continuation session)
**Prepared:** Feb 2026
**Related PRD sections:** Testing case.xlsx Workstream 3 · Cascade from Workstreams 1, 2, 4 (completed)

---

## 1. Objective

Turn BAKĒD into a **French-first, fully bilingual platform** with English available as a live, in-app language toggle. Scope covers **every user-facing and internal surface** (customer storefronts MART/SHOP/SEND, Admin, Seller portals, Driver portals, transactional emails, error messages, forms, validations, and dynamic homepage/catalog content).

**Non-negotiables from client brief:**
- French = default language everywhere (already the fallback in `AppProvider.detectInitialLanguage`, needs strengthening to override browser preference on first paint for CI market).
- English = selectable via a global switcher present on every top-level layout.
- **Instant switch** — no page reload, no loss of form data, cart, filters, or route state.
- **Centralised architecture** — one i18n system feeds all applications; no duplicated FR/EN page trees.
- **New features must be bilingual from day one** — enforced via lint rule + PR checklist.

**Explicitly out-of-scope:**
- Do not translate DB field names, API path segments, status enums, code identifiers, tokens, or webhook payloads.
- Do not migrate existing route names in one shot — English routes stay live as **aliases** with French as canonical (per user's ask 2b).
- Not required: right-to-left language support (only fr + en).

---

## 2. Current State Audit

| Area | Current Behaviour | Gap |
|---|---|---|
| Language storage | `localStorage.baked_language` + `AppProvider.language` state (`fr`/`en`), default falls back to `fr` after browser sniff | ✅ Foundation is right — just needs to bias to `fr` before browser sniff |
| Language switcher | Present in 3 places: `TopNav`, `MobileHeader`, `MobileSettings` | Missing from Admin shell, Seller portal shell, Driver shell, Login dialogs |
| Translated strings | ~12 files use manual `locale === "fr" ? … : …` inline ternaries (product cards, some admin sections). No shared dictionary | Not scalable; new strings won't be discoverable |
| Route paths | 100% English today (`/products`, `/cart`, `/checkout`, `/orders`, …) | Need French aliases + set French as canonical navigation destination |
| Dynamic content (DB) | `name_fr` / `name_en` columns exist on `MartCategory`, `MartSubcategory`, `ShopCategory`, `ShopSubcategory`, `HomepageSection` | Product `name` / `description` are single-language (French for CI, hard-coded English for IN). Homepage `title` / `subtitle` are single-language JSONB |
| Transactional emails | Templates hard-coded in French/English mix (order confirmations, magic-link, driver invites) | Need locale-scoped templates keyed off `user.preferred_language` |
| Errors / validation | FastAPI raises English `HTTPException(400, "…")`; frontend surfaces them raw | Need centralised error catalogue with `code` → i18n key mapping |
| SEO metadata | Static `<title>`, no locale variants | Add per-route localised titles + `<link rel="alternate" hreflang>` |
| Testing | No automated i18n tests | Add Playwright smoke covering FR/EN toggle across every top-level route |

**Sizing (from codebase survey):**
- 205 total React files (frontend/src)
- 68 customer-facing pages · 26 admin pages · 11 seller portal · 5 driver
- ~96 files with hard-coded JSX text strings (majority customer + admin)
- 39 files reading `useApp().language`

**No i18n library currently installed.** Fresh choice — see §3.

---

## 3. Architectural Decisions

### 3.1 Library choice — **`react-i18next` v15** (recommended)

| Option | Verdict |
|---|---|
| **react-i18next** | ✅ Recommended. De-facto standard, native React hooks (`useTranslation`), namespaces, plural support, ICU MessageFormat, lazy-load per module, React Suspense integration, mature Playwright helpers, tiny runtime (~10 KB gz) |
| FormatJS / `react-intl` | Robust but verbose (`<FormattedMessage />` everywhere); ICU-only |
| LinguiJS | Excellent DX but macro-based; requires babel plugin — extra CI complexity |
| Custom `t()` helper | Fast to ship but zero pluralisation, no interpolation types, no dev warnings for missing keys — will bite us within a quarter |

**Verdict:** react-i18next. It scales to Admin + Driver + Seller shells with almost zero incremental cost.

### 3.2 Translation-key structure — **flat namespaced JSON per surface**

```
/app/frontend/src/i18n/
  index.js              # i18next init, detector, resource bundling, React Suspense loader
  detector.js           # priority: URL ?lang= → localStorage → cookie → navigator → 'fr' fallback
  locales/
    fr/
      common.json       # buttons, currency, dates, generic ("Save", "Cancel", "Loading…")
      customer.json     # customer storefront (MART + SHOP + SEND common)
      mart.json         # MART-specific
      shop.json         # SHOP-specific
      send.json         # SEND-specific
      seller.json       # Seller portal
      driver.json       # Driver app
      admin.json        # Admin console
      auth.json         # Login, register, magic-link, OTP
      errors.json       # API error catalogue keyed by backend `code`
      emails.json       # Transactional email templates (title, body, cta)
    en/
      …mirror of fr/…
```

**Key naming convention:** `namespace:section.action.state` → e.g. `common:btn.save`, `customer:cart.empty.title`, `errors:supplier.already_active`.

**Interpolation:** ICU style — `t("customer:cart.totals", { count: 3, currency: fmt(total) })` produces "3 articles · 4 800 XOF".

**Currency + date formatting** delegated to `Intl.NumberFormat` / `Intl.DateTimeFormat` seeded with `${language}-${country}` locale (already computed in `AppProvider.uiLocale`).

### 3.3 Language persistence & switching

- `localStorage.baked_language` remains the source of truth (already used).
- On switch:
  1. Call `i18n.changeLanguage(next)`
  2. `AppProvider.setLanguage(next)`
  3. If canonical route is language-scoped (see §3.4), swap segment in `history.replaceState` (no reload) — e.g. `/panier` ↔ `/cart` while preserving query + hash + scroll.
  4. Persist user's choice server-side for logged-in users via new endpoint `PATCH /api/me/preferences {language: 'fr'|'en'}` so cross-device experience is consistent.
- Language toggle is available in **6 places**:
  1. Desktop `TopNav` (existing — polish)
  2. Mobile `MobileHeader` (existing)
  3. Mobile `MobileSettings` (existing)
  4. **NEW** `AdminShell` header (all `/admin/*` layouts)
  5. **NEW** `SellerPortalApp` shell header
  6. **NEW** `DriverApp` bottom-drawer settings
- **Auth pages (`GlobalLoginDialog`, `/auth/*`)** get a subtle language link in the footer of the dialog.

### 3.4 Route-alias strategy — **dual-path with canonical redirect**

Per user decision 2b (both work, French is canonical):

- **Every French route added as a first-class `<Route>`** alongside the English one, both pointing to the same page component.
- All internal navigation (`<Link>`, `navigate()`, backend-generated deep links, emails) uses **French** paths.
- Landing on an English route while `language === 'fr'` performs a soft `history.replaceState` to the French equivalent (no page flash, preserves query/hash). Reverse when switching to English.
- The active language for a raw URL visit is inferred from the segment (`/panier` → force `language = 'fr'`, `/cart` → force `en`) so a shared link "just works" without asking the recipient to toggle.
- SEO: emit `<link rel="alternate" hreflang="fr" href="…" />` and `hreflang="en"` pairs on all pages, plus `hreflang="x-default"` pointing to the French URL (French-first).

**Full route table** (excerpt — full JSON generated in implementation as `/app/frontend/src/i18n/routeMap.js`):

| Surface | English | French (canonical) |
|---|---|---|
| Home | `/` | `/` (unchanged) |
| Categories index | `/categories` | `/categories` (identical word) |
| Category | `/categories/:slug` | `/categories/:slug` |
| Products list | `/products` | `/produits` |
| Product | `/products/:id` | `/produits/:id` |
| Cart | `/cart` | `/panier` |
| Checkout | `/checkout` | `/commander` |
| Orders list | `/orders` | `/commandes` |
| Order tracking | `/orders/:id/track` | `/commandes/:id/suivi` |
| Order confirmation | `/orders/:id/confirmation` | `/commandes/:id/confirmation` |
| Order delivered | `/orders/:id/delivered` | `/commandes/:id/livre` |
| Wallet | `/wallet` | `/portefeuille` |
| Profile | `/profile` | `/profil` |
| Profile addresses | `/profile/addresses` | `/profil/adresses` |
| Profile settings | `/profile/settings` | `/profil/parametres` |
| Profile help | `/profile/help` | `/profil/aide` |
| Profile activities | `/profile/activities` | `/profil/activites` |
| Profile rewards | `/profile/rewards` | `/profil/recompenses` |
| Profile refer | `/profile/refer` | `/profil/parrainer` |
| SHOP home | `/shop` | `/boutique` |
| SHOP categories | `/shop/categories` | `/boutique/categories` |
| SHOP category | `/shop/c/:slug` | `/boutique/c/:slug` |
| SHOP product | `/shop/p/:id` | `/boutique/p/:id` |
| SHOP checkout | `/shop/checkout` | `/boutique/commander` |
| SHOP order | `/shop/order/:id` | `/boutique/commande/:id` |
| SEND (brand) | `/send` | `/send` (kept per user 1a) |
| Food | `/food` | `/restauration` |
| Auto | `/auto` | `/auto` |
| Immo | `/immo` | `/immobilier` |
| Privacy | `/privacy` | `/confidentialite` |
| Terms | `/terms` | `/conditions` |
| Help | `/help` | `/aide` |
| Contact | `/contact` | `/contact` |
| Careers | `/careers` | `/carrieres` |
| News/Blog | `/blog`, `/news` | `/actualites` |
| Seller apply | `/martbaked/sellers/apply` | `/martbaked/vendeurs/candidature` |
| Seller portal | `/seller/dashboard`, `/seller/orders`, `/seller/catalog`, … | `/vendeur/tableau-de-bord`, `/vendeur/commandes`, `/vendeur/catalogue`, … |
| Driver | `/driver`, `/driver/orders`, `/driver/earnings`, `/driver/profile` | `/livreur`, `/livreur/commandes`, `/livreur/revenus`, `/livreur/profil` |
| Admin | `/admin/**` (kept as-is by convention) | `/admin/**` alias — labels translate, paths stay English (internal ops), *unless* user overrides |

**Note:** SEND stays `/send` per user's decision; Admin path segments stay English to protect ops muscle memory (only UI labels translate). If the user wants Admin segments in French too, we add the same alias pattern in ~4 hours of extra work.

### 3.5 Backend translation strategy

Two layers:

**A. Dynamic content (already partially bilingual):**
- Categories, subcategories, homepage sections have `name_fr` / `name_en` — audit for coverage and backfill any missing.
- Add `name_fr` + `name_en` (and `description_fr` + `description_en`) to `MartProduct` and `ShopProduct` via alembic migration. Backfill existing rows: fr = current `name`, en = current `name` (temp copy) + queue Google Translate batch job.
- Add `title_fr/en`, `subtitle_fr/en` to `homepage_sections.config` JSONB (already flexible).
- API endpoints stay unchanged in path but return the field variant matching the `Accept-Language` header (or `?lang=` query, or `X-BAKED-Language` header set by the frontend interceptor).

**B. Server-emitted strings (errors, emails, SMS, push):**
- Introduce `/app/backend/i18n/` mirroring the frontend folder structure.
- New helper `t(key, lang, **kwargs) → str` backed by JSON dictionaries loaded once at boot.
- Every `HTTPException` refactored to raise a **stable code** (e.g. `SUPPLIER_ALREADY_ACTIVE`) — the frontend maps code → localized message via `errors:` namespace. Backwards-compat: still emit English `detail` for API consumers that don't localize.
- Email templates (Jinja2) split per locale: `templates/emails/order_confirmed.fr.html` + `.en.html`; `SMSProvider.send()` accepts `lang` and picks matching phrase.

### 3.6 Translation content pipeline

- **Phase 1 (this workstream):** Seed all keys with **human-crafted French** for high-visibility strings (nav, buttons, checkout, cart, order lifecycle, profile). Use **DeepL API** (paid, higher quality than Google) or Google Cloud Translate v3 for bulk backfill on the long tail. Keys where FR is authoritative and EN is machine-translated get a `_reviewed: false` flag in the JSON, surfaced in a `/admin/i18n` review console (Phase 2).
- **Phase 2 (post-launch, tracked as backlog):** In-app **admin i18n editor** at `/admin/i18n` — search key, edit FR/EN, mark reviewed, exports back to JSON diff for PR.
- **Vendor lock-in mitigation:** JSON files are the single source of truth. No SaaS dependency at runtime.

### 3.7 Fallback behaviour

- Missing FR key → fall back to EN → fall back to key path (dev warning in console).
- Missing dynamic `name_fr` → return `name_en` if present, else the raw `name`.
- `i18next` `saveMissing: true` in dev pipes missing keys to a warning file so QA catches them before merge.

---

## 4. Implementation Phases

Each phase is independently shippable and independently testable.

### Phase A — Foundation (1 PR, ~250 LoC frontend, ~50 backend)
1. Install `react-i18next`, `i18next`, `i18next-browser-languagedetector`, `i18next-http-backend`.
2. Create `/app/frontend/src/i18n/index.js` with detector chain, empty resources map, Suspense integration.
3. Wrap `<App />` in `<I18nextProvider>` at root.
4. Wire `AppProvider.setLanguage` to also call `i18n.changeLanguage`.
5. Skeleton `common.json`, `customer.json` with 10 sentinel keys each for smoke testing (`common:btn.save`, `common:btn.cancel`, `customer:home.hero.cta`).
6. Refactor **one page** (Cart is a good candidate — high traffic, medium size) to use `useTranslation`.
7. Add Playwright smoke test: switch language on Cart, assert text changes without reload.

**Exit criteria:** FR/EN toggle on `/cart` swaps text instantly, cart contents preserved.

### Phase B — Customer storefront translations (~2-3 PRs)
- Migrate: `HomePage`, `ProductDetail`, `CategoryPage`, `Cart`, `Checkout`, `Orders*`, `Profile*`, `Wallet`, `ConfigHomepage` (homepage sections), footer, all `LandingPages`.
- Extract every hardcoded string into `customer.json` + `mart.json` + `shop.json` + `send.json`.
- Human-review French (primary market); DeepL-translate English placeholders.

### Phase C — Route aliases + canonical redirects (~1 PR)
- Add French `<Route>` entries in `CustomerApp.jsx` + `MobileCustomerShell` + `ShopbakedApp.jsx`.
- Central `routeMap.js` exports both directions (`enToFr`, `frToEn`) + `useLocalisedNav()` helper that returns a `navigate` proxy always emitting the language-current path.
- Add `<LanguageRouteBridge>` component mounted at root that watches `useLocation` + `language` and does a `history.replaceState` when the URL segment mismatches the language.
- Update every `<Link to>` / `navigate()` call site to route through the helper (grep + codemod).
- Legacy paths keep redirecting (soft `replaceState` keeps SEO happy).

### Phase D — Backend errors + emails (~1 PR)
- Add `/app/backend/i18n/` with `common.json`, `errors.json`, `emails.json` × fr/en.
- New `t(key, lang, **kwargs)` helper (loads dictionaries at startup, single dict lookup, LRU-cached).
- Refactor top-25 most-frequent `HTTPException` sites to raise stable codes.
- Split email templates. Add `lang` param to `EmailProvider.send()`.
- Contract test: each error code has both FR and EN entries.

### Phase E — Partner/Seller portal (~1 PR)
- Same pattern applied to `apps/martbaked-sellers/*`, `pages/seller/*` (11 pages).
- Add language switcher to seller shell header.
- French route aliases (`/vendeur/*`).

### Phase F — Driver app (~1 PR)
- 5 pages, mostly action-heavy — quick migration.
- FR/EN toggle inside `DriverProfile`.
- Push notification templates localised (backend already knows driver's language after Phase D).

### Phase G — Admin console (~1 PR, largest)
- 26 pages. Labels translated; path segments **stay English** by default.
- Add EN/FR toggle to `AdminShell` header.
- Admin-only pages that surface user-facing content (email template preview, homepage editor) show a small "language you're editing" tab.

### Phase H — Dynamic content DB migration (~1 PR)
- Alembic migration `00XX_bilingual_product_fields.py` — adds `name_fr`, `name_en`, `description_fr`, `description_en` to `mart_products` + `shop_products`.
- Backfill script: bulk DeepL translation for existing 500+ rows.
- Update product APIs to return the language-matching field.
- Update all product form UIs (seller catalog editor, admin catalog) to expose the two-language input side-by-side.

### Phase I — QA, docs, guardrails (~1 PR)
- ESLint rule (`eslint-plugin-i18n-json-key-usage` or custom) that fails CI on new hard-coded JSX text longer than 3 chars.
- README section documenting `useTranslation` + key naming.
- Playwright regression suite: `test_i18n_toggle.py` iterates every top-level route and asserts the FR/EN toggle round-trips cleanly and no console errors fire.
- Manual QA script + spreadsheet coverage map linked from PRD.

**Estimated total effort:** ~9 PRs, ~1.5–2 developer weeks focused work if translations are machine-translated up-front, or ~3-4 weeks if all FR strings are human-reviewed first.

---

## 5. Migration & Regression Risks

| Risk | Mitigation |
|---|---|
| Existing tests break due to renamed URLs | Both routes remain live indefinitely; tests continue to work. Update snapshots incrementally. |
| Deep-linked URLs in the wild (emails, receipts, WhatsApp shares) | English routes never removed; soft-redirect only. Emails re-issued in French start using French URLs. |
| Third-party integrations (Twilio SMS templates, Google Analytics events keyed on paths) | Analytics: send `page_path` normalised to English before firing GA event (canonical URL trick). Twilio: templates loaded from JSON per locale. |
| Users mid-session while a hot-swap ships | Feature flag `i18n_v1_enabled=true` gates the new behaviour so rollback is one flag flip. |
| Admin muscle-memory | Admin path segments unchanged unless user explicitly requests. |
| Machine-translated EN sounds robotic | Every EN string is flagged `_reviewed: false` and shown in Phase 2 admin editor for professional review. |
| Cart / form state loss on language switch | Language switch is a pure client-side state change — no `window.location` mutation, no unmount. Verified in Phase A exit criteria. |
| SEO — duplicate content French + English | `hreflang` alternate + canonical French tag. Google respects this. |

---

## 6. Testing Plan

**Unit / component:**
- Snapshot `useTranslation` mock returns keys → assert no orphaned keys.
- Currency + date formatter tests per locale.

**Integration (backend):**
- `pytest` case per error code: request emits both `code` and correctly-localised `detail` for both `Accept-Language: fr` and `en`.
- Email preview endpoint returns FR + EN rendered HTML.

**E2E (Playwright, testing agent):**
- On every top-level route: land, toggle FR↔EN, assert page title + primary heading swap, cart badge persists, URL updates canonical.
- Guest cart → login → checkout in FR then repeat in EN; both flows complete.
- Admin: switch to FR, edit a supplier → save → toast text in FR; switch back to EN → toast text in EN on re-save.
- Driver: FR OTP flow → English OTP flow.

**Regression:**
- Re-run Workstreams 1, 2, 4 test suites to prove no functional regressions.
- Diff `i18n/locales/fr/*.json` vs `en/*.json` — CI fails on missing keys.

---

## 7. Deliverables & File Manifest (planned, not yet touched)

Frontend:
```
/app/frontend/src/i18n/
  index.js
  detector.js
  routeMap.js
  useLocalisedNav.js
  LanguageRouteBridge.jsx
  LanguageSwitcher.jsx        # extracted from TopNav/MobileHeader, shared
  locales/{fr,en}/*.json      # 9 namespace files each
/app/frontend/package.json    # +react-i18next, +i18next-*
```

Backend:
```
/app/backend/i18n/
  __init__.py
  loader.py                   # loads JSON dicts at boot, LRU cache
  common.json  errors.json  emails.json  fr/  en/
/app/backend/core/exceptions.py  # BakedError(code, **params) helper
/app/backend/templates/emails/*.{fr,en}.html
/app/backend/migrations/versions/00XX_bilingual_products.py
```

Docs:
```
/app/memory/I18N_PLAN.md            # this file
/app/memory/I18N_KEY_NAMING.md      # conventions doc for future contributors
/app/README.md                      # add "Localization" section
/app/design_guidelines.md           # add "always use useTranslation" rule
```

---

## 8. Open Questions for User (blocking)

1. **DeepL vs Google Cloud Translate for initial backfill?** DeepL is higher quality but costs ~$25 per 1M chars; Google is cheaper but less nuanced for e-commerce copy.
2. **Do you want the Phase 2 admin i18n editor built in this workstream or deferred to backlog?** Recommend deferred — the JSON files are directly editable by PR in the meantime.
3. **Admin path segments** — user preference above says "customer, admin, seller, driver, other portals must all support both languages". Confirm: does this mean **path segments** in Admin too (`/admin/commandes` etc.) or is translated UI labels sufficient while paths stay English (my current recommendation)?
4. **Timing** — should Phase A ship this session (foundation only, no visible change to users), then Phases B–I in follow-up sessions? Or batch A+B+C in one shipping wave for a visible French customer experience, then D–I incrementally?
5. **Translation ownership** — will French copy be reviewed by a native French speaker before rollout, or is the client comfortable shipping machine-translated FR with a `_reviewed: false` flag and iterating?

---

## 9. Rollout Plan Once Approved

1. Merge Phase A behind `i18n_v1_enabled` flag (off in prod, on in dev/preview).
2. Nightly Playwright smoke on preview.
3. Enable flag in production once Phases A+B+C are green.
4. Announce EN toggle to internal team (India-based QA can now operate the platform).
5. Iterate Phases D→I over the following sprints.

---

**Awaiting user sign-off on:**
- (a) Overall architecture (react-i18next, dual-path routes, JSON namespaces)
- (b) Answers to §8 open questions
- (c) Phase batching preference

After approval, first implementation PR = Phase A only, delivered same session.
