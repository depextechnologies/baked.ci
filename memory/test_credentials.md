# BAKĒD Platform — Test Credentials

## Phone / OTP (Customer, Primary)
- Dev provider — code is returned in the /api/auth/otp/request response as `dev_code` and shown in the UI
- CI: country_code `+225`, any phone (e.g. `0102030405`)
- UK: country_code `+44`, any phone

## Google Auth
- Emergent-managed. Frontend redirects to `https://auth.emergentagent.com/?redirect=<origin>/`

## Super Admin (Email + Password)
- URL: /admin
- Email: `depexopenai@gmail.com`
- Password: `baked@2026#!$@`
- Role: `super_admin` (can create other super_admins/admins via /admin/admins)

## Emergent Universal LLM Key
- Env: EMERGENT_LLM_KEY in /app/backend/.env
- Model: claude-sonnet-4-6
