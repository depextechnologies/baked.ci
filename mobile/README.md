# BAKĒD Super App (React Native · Expo SDK 58 · TypeScript · Expo Router)

Customer mobile client for baked.ci. It's a separate frontend that uses the **existing** FastAPI backend and PostgreSQL database. It has no backend or data of its own, and the website in `/app/frontend` is unchanged.

## Run
- `npm install`
- `npx expo start --tunnel ngrok`: scan the QR with Expo Go (Android/iOS). In the preview pod this runs as the supervisor program `expo-mobile`.
- `npm run export:web`: builds the Expo Web preview into `dist/`. The backend serves it at `/api/app-preview/`.
- `npm run typecheck`
- Env (`.env`): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_ORIGIN`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
- Future store builds: EAS. Bundle/package id is `ci.baked.app`, and universal links (`baked.ci`) are declared in `app.json`.

## Phase A — Audit: API reuse map
| Mobile feature | Existing backend API reused |
|---|---|
| Phone OTP login / session | `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `GET /api/auth/me` (JWT bearer, stored in SecureStore) |
| Country / currency / phone code | `GET /api/config/countries` |
| Saved addresses / serviceability | `GET /api/customers/me/addresses`, `GET /api/addresses/serviceability` |
| Address autocomplete / GPS | Google Places API (New) with the existing Maps key, plus `expo-location` |
| Global search | `GET /api/search`, `POST /api/search/click` (same fuzzy engine and intents as the website) |
| Wallet / rewards | `GET /api/customers/me/wallet`, `GET /api/customers/me/rewards` |
| Notifications bell | **new** `GET /api/customers/me/notifications`, `POST …/read-all`, `POST …/{id}/read`. Additive only: same table and helpers as the partner/admin bells |
| Module homes | MART `/api/mart/categories` · FOOD `/api/food/categories` · SHOP `/api/shop/categories` · SEND `/api/express/services` |
| Activity | `/api/orders/me` · `/api/food/customer/orders` · `/api/shop/orders/me` · `/api/express/bookings/mine` |

### Gaps / dependencies found
- **Push notifications:** no customer push-token registry and no Expo push sender exist yet. Planned for Phase E (needs an EAS project id).
- **Wallet:** the backend reports balance `0` and "not activated". Top-up and wallet payment are not implemented, so the app shows the real 0 balance.
- **Customer notifications:** no backend events write `recipient_kind="customer"` rows yet, so the bell is live but empty until lifecycle events dispatch to customers.
- **Module statuses:** `GET /api/config/modules` reports FOOD/SHOP/SEND as `coming_soon`, but the website hard-codes them as active. The app follows the approved rule (MART/FOOD/SHOP/SEND active).
- **CI phone normalisation:** `core/utils/phone.py` strips the leading 0 (`0700000001` → `+225700000001`). Since 2021, CI numbers are 10 digits including the leading 0. This affects the website too and needs an owner decision before it is changed, because existing accounts are keyed on the stored format.
- **Maps key:** the shared Maps key is HTTP-referrer restricted. Native builds send the baked.ci referer. For production, create Android/iOS-restricted keys.

## Structure
- `src/app`: routes (onboarding, location-permission, address, welcome, login, otp, wallet, notifications, `(tabs)`: index/explore/switcher/activity/profile)
- `src/state`: App (language, onboarding, module context, address), Session (secure token), Switcher sheet
- `src/components`: TabBar, SwitcherSheet, home/*, module/*, ui/*
- `src/lib`: api client (timeout + retry + 401 handling), i18n (FR default / EN), places, location, modules registry
