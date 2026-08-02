# BAKĒD Platform — Test Credentials

## Phone / OTP (Customer, Primary)
- Dev provider — code is returned in the /api/auth/otp/request response as `dev_code` and shown in the UI
- CI: country_code `+225`, any phone (e.g. `0102030405`)
- UK: country_code `+44`, any phone

## Google Auth (Self-hosted white-label OAuth 2.0)
- **Client ID**: `360693268275-2aoffi301ndj669975frljudaso8o8dc.apps.googleusercontent.com`
- **Client Secret**: stored in `backend/.env` as `GOOGLE_CLIENT_SECRET` (never commit)
- **Frontend env**: `REACT_APP_GOOGLE_CLIENT_ID` in `frontend/.env`
- **Backend env**:
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `APP_BASE_URL=https://baked.ci` (production canonical URL)
  - `SESSION_COOKIE_DOMAIN=` (empty in preview → host-only cookie; set to `.baked.ci` at production cutover so cookie is shared across baked.ci and *.baked.ci)
- **Flow**: `useGoogleLogin({ flow: "auth-code", ux_mode: "popup" })` → auth code → backend exchanges with Google using `redirect_uri=postmessage` → verifies id_token → issues app JWT
- **Backend endpoint**: `POST /api/auth/google/verify` with `{ code }` returns `{ access_token, customer }`
- **Google Cloud Console setup** — Authorized JavaScript Origins & Redirect URIs (owner action):
  - `https://baked-platform.preview.emergentagent.com` — preview only, **REMOVE after DNS cutover**
  - `https://baked.ci` — production (permanent)
  - `https://www.baked.ci` — production (permanent, optional)
- **Production cutover checklist**:
  1. Point `baked.ci` DNS at the deployment
  2. Set `SESSION_COOKIE_DOMAIN=.baked.ci` in backend/.env and restart backend
  3. In Google Cloud Console → OAuth Client → **remove** the preview URL from Authorized JS Origins and Authorized redirect URIs
  4. In Google Cloud Console → OAuth Consent Screen → **remove** `emergentagent.com` from Authorized Domains
  5. Change `BAKED_ENV=production` in backend/.env
- **Zero Emergent references** in the OAuth flow — Emergent-managed `/auth/google/session` endpoint removed; `AuthCallback.jsx` deleted.

## Super Admin (Email + Password)
- URL: /admin
- Email: `depexopenai@gmail.com`
- Password: `baked@2026#!$@`
- Role: `super_admin` (can create other super_admins/admins via /admin/admins)

## Emergent Universal LLM Key
- Env: EMERGENT_LLM_KEY in /app/backend/.env
- Model: claude-sonnet-4-6
