# i18n Coverage Report — 2026-03-08 (Phase C launch snapshot)

## Executive summary

| Metric | Value |
|---|---|
| Customer-facing JSX files scanned | **58** |
| Files with `useTranslation()` wired | **14** (24.1%) |
| Live `t()` / `T()` call sites | **128** |
| **Hardcoded English strings still visible to customers** | **445** |
| **Files with ≥1 hardcoded string** | **43 / 58 (74%)** |
| **String-level launch-blocker coverage** | ~22% (est. based on visible surface) |

Backend errors: **26/26 i18n tests pass** — every FR/EN request returns the right language.

---

## Route-path localisation — LAUNCH READY

All 22 customer-storefront routes now have French-primary + English-alias registrations, plus a `LocaleRouteSync` observer that swaps the URL bar on the fly when the user toggles FR/EN.

Migrated **this batch**:
- `/confidentialite` ⇄ `/privacy`
- `/conditions` ⇄ `/terms`

Full route matrix: see `PRD.md` §2026-03-08.

Deferred to post-launch (English brand names):
- `/send/*` — SENDbakēd deep booking funnel
- `/shop/*` — SHOPbakēd storefront

---

## Hardcoded-English hotspots (top 15 files)

Ranked by count. **Bold** = customer-storefront core (highest priority).

| # | File | Strings | Notes |
|---|---|---:|---|
| 1 | `pages/express/ExpressWizard.jsx` | 62 | SENDbakēd wizard — deferred |
| 2 | `pages/express/MoversWizard.jsx` | 49 | Movers wizard — deferred |
| 3 | **`pages/mobile/MobileAddresses.jsx`** | **23** | 🔴 checkout blocker |
| 4 | `pages/legal/PrivacyPolicy.jsx` | 23 | separate compliance page |
| 5 | **`components/address/AddressSelector.jsx`** | **22** | 🔴 shown on every add-to-cart |
| 6 | `pages/express/ExpressHome.jsx` | 19 | SENDbakēd landing — deferred |
| 7 | **`pages/mobile/MobileHelpSupport.jsx`** | **18** | account support flow |
| 8 | **`pages/mobile/MobileSettings.jsx`** | **17** | account settings |
| 9 | **`pages/mobile/MobileWallet.jsx`** | **15** | account wallet |
| 10 | **`pages/mobile/MobileOrderDelivered.jsx`** | **14** | 🔴 post-purchase surface |
| 11 | `pages/legal/TermsOfService.jsx` | 14 | separate compliance page |
| 12 | **`pages/mobile/MobileCheckout.jsx`** | **13** | 🔴 checkout blocker |
| 13 | `pages/mobile/MobileRefer.jsx` | 12 | referral flow |
| 14 | `pages/mobile/MobileRewards.jsx` | 11 | rewards flow |
| 15 | `pages/mobile/MobileActivities.jsx` | 11 | recent activity |

**Launch-critical residuals (🔴)**: **87 strings** across `MobileAddresses`, `AddressSelector`, `MobileCheckout`, `MobileOrderDelivered`. Every one of these appears in the primary MART checkout journey.

---

## Top-20 repeated hardcoded strings

Repeat count > 1 = candidate for a shared key in `common.json`:

- 3× `View all` → `common.view_all` (already exists)
- 3× `Drop-off`
- 3× `Toggle theme`
- 2× `Edit profile`, `How it works`, `Order summary`, `Total paid`
- 2× `No saved addresses yet`, `Dark Mode`, `Delivering to`
- 2× `Estimated Charges`, `Total Estimated Cost`, `Advance today:`
- 2× `Pickup Location`, `Loading & Unloading`, `Move type`

---

## Recommended follow-up plan

**Sprint 1 — pre-launch (est. 87 strings, 4 files):**
1. `MobileCheckout.jsx` — 13 strings (already partially wired)
2. `MobileAddresses.jsx` — 23 strings
3. `AddressSelector.jsx` — 22 strings
4. `MobileOrderDelivered.jsx` — 14 strings

**Sprint 2 — post-launch (est. 88 strings, 5 files):**
5. `MobileWallet.jsx` — 15 strings
6. `MobileSettings.jsx` — 17 strings
7. `MobileHelpSupport.jsx` — 18 strings
8. `MobileRefer.jsx`, `MobileRewards.jsx`, `MobileActivities.jsx` — 34 strings

**Sprint 3 — SENDbakēd + Legal (est. 167 strings, 4 files):**
9. `ExpressWizard.jsx` + `MoversWizard.jsx` + `ExpressHome.jsx` — 130 strings
10. `PrivacyPolicy.jsx` + `TermsOfService.jsx` — 37 strings (compliance-vetted French copy required)

---

## How to reproduce

```bash
python3 /app/scripts/i18n_coverage_sweep.py
```

Script is idempotent — safe to run in CI or before every release.
