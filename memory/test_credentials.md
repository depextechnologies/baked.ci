# BAKĒD Platform test credentials

## Super Admin
- Email: `depexopenai@gmail.com`
- Password: `baked@2026#!$@`
- Route: `/admin/login`

## Test Partner (post-Slice 3)
- Email: `e2e-portal@test.example`
- Password: `MyNewPortalPassword123!`  (originally temp, then reset via UI)
- Route: `/partner-portal/login`
- Approved from application `MART-CI-2026-0002` in Slice 3 e2e test.

## Google Auth (Self-hosted white-label OAuth 2.0)
- **Client ID**: `360693268275-2aoffi301ndj669975frljudaso8o8dc.apps.googleusercontent.com`
- **Client Secret**: stored in `backend/.env` as `GOOGLE_CLIENT_SECRET`
- **Frontend env**: `REACT_APP_GOOGLE_CLIENT_ID` in `frontend/.env`
- **Backend env**: `APP_BASE_URL=https://baked.ci`, `SESSION_COOKIE_DOMAIN=` (set to `.baked.ci` at prod cutover)
- **Flow**: `useGoogleLogin({ flow: "auth-code", ux_mode: "popup" })` → `POST /api/auth/google/verify { code }`
- **Prod cutover**: DNS → cookie domain → remove preview URL from Google Console → remove `emergentagent.com` from Authorized Domains → BAKED_ENV=production
- Emergent-managed `/auth/google/session` endpoint removed; `AuthCallback.jsx` deleted.

## Emergent LLM key
- `EMERGENT_LLM_KEY` in `/app/backend/.env`
- Model: claude-sonnet-4-6
