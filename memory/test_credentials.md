# BAKĒD Platform — Test Credentials

## Phone / OTP (Customer, Primary)
- Dev provider — code is returned in the /api/auth/otp/request response as `dev_code` and shown in the UI
- CI: country_code `+225`, any phone (e.g. `0102030405`)
- UK: country_code `+44`, any phone

## Google Auth (Self-hosted white-label OAuth 2.0)
- **Client ID**: `360693268275-2aoffi301ndj669975frljudaso8o8dc.apps.googleusercontent.com`
- **Client Secret**: stored in `backend/.env` as `GOOGLE_CLIENT_SECRET` (never commit)
- **Frontend env**: `REACT_APP_GOOGLE_CLIENT_ID` in `frontend/.env`
- **Flow**: `useGoogleLogin({ flow: "auth-code", ux_mode: "popup" })` → auth code → backend exchanges with Google using `redirect_uri=postmessage` → verifies id_token → issues app JWT
- **Backend endpoint**: `POST /api/auth/google/verify` with `{ code }` returns `{ access_token, customer }`
- **Google Cloud Console setup** — Authorized JavaScript Origins & Redirect URIs must include (owner action):
  - `https://baked-platform.preview.emergentagent.com` (dev)
  - `https://baked.ci` (production)
  - `https://www.baked.ci` (production)
  - Add `/auth/google` suffix on each for the redirect URI list (even though the popup flow doesn't use it, GIS validates the client)
- **Zero Emergent references** — the Emergent-managed `/auth/google/session` endpoint has been removed. `AuthCallback.jsx` deleted.

## Super Admin (Email + Password)
- URL: /admin
- Email: `depexopenai@gmail.com`
- Password: `baked@2026#!$@`
- Role: `super_admin` (can create other super_admins/admins via /admin/admins)

## Emergent Universal LLM Key
- Env: EMERGENT_LLM_KEY in /app/backend/.env
- Model: claude-sonnet-4-6
