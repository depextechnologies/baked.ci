# BAKĒD — Test Credentials

## Super Admin
- Email: `depexopenai@gmail.com`
- Password: `baked@2026#!$@`
- Path: `/admin/login`

## Partner (Store Manager / Owner)
- Email: `partner-alpha-store@test.example`
- Password: `Alpha1234!Beta`
- Partner ID: `prt_alpha_demo_seed`
- Warehouse: `MRT-ABJ-001` (Côte d'Ivoire)

## Picker
- Employee: `EMP-ABJ-001`
- Password: `Packer1234!`
- Warehouse: `MRT-ABJ-001`

## Suppliers
### DEMO Delta Beverages CI (approved)
- Email: `demo-delta-supplier@test.example`
- Password: `Supplier1234!`
- Code: `SUP-CI-0001`
- Slug: `delta` → portal path `/martbaked/delta/portal/dashboard`

### DEMO Echo Fresh Produce (approved during P0 verification)
- Slug: `echo` → portal path `/martbaked/echo/portal/dashboard`
- Login credentials: request activation from Super Admin after approval (activation email flow)

## SENDbakēd Test Driver (phone OTP)
- Country: IN (India)
- Phone: `+919990001234`
- Driver ID: `drv_80fb10f9def94f95`
- Status: `approved` + `is_online=true` (KYC + admin approval already done in DB)
- PWA login: `https://baked-platform.preview.emergentagent.com/driver`
- **How to get the OTP** (mocked SMS): after tapping Continue on the phone-entry screen, open DevTools → Network → the response to `/api/driver/auth/request-otp` returns `dev_hint` = the 6-digit code. It's also printed to `/var/log/supervisor/backend.err.log`. OTP is valid for 10 minutes.
- Active demo job auto-dispatched — you'll see an incoming-request overlay right after login. Accept it to walk the delivery + chat + wallet flows.
- **Customer tracking page** (public, no login):
  - Format: `https://baked-platform.preview.emergentagent.com/send/track/{JOB_ID}?t={SHARE_TOKEN}`
  - To dispatch a fresh job + get a fresh tracking link, hit `POST /api/admin/drivers/drv_80fb10f9def94f95/dispatch-demo-job` with the Super Admin JWT — the response includes `id` and `share_token`.

## Notes
- Legacy `/martbaked/sellers/portal/*` still works — auto-redirects to the resolved slug URL client-side.
- **Driver email login** (2026-02): the redesigned `/driver/login` supports three paths:
  1. **Mobile Login** — phone + OTP (existing, dev_hint returned in response)
  2. **Email Login** — email + password; unknown email on first submit auto-registers the driver
  3. **Continue with Google** — uses shared Emergent-managed Google OAuth (`GOOGLE_CLIENT_ID` env)
  4. Continue with Apple — currently a "Coming soon" stub (Apple Services Key not provided yet)
- Test email driver (idempotent): `test.driver@baked.dev` / `driverPass123!` — created 2026-02-26. Onboarding status, no phone attached (KYC will collect it).

## Seeded Driver Applications (for Admin queue QA)
- `drv_seed_onb1` — Rahul Onboarding · IN · onboarding
- `drv_seed_onb2` — Awa Diallo · CI · onboarding
- `drv_seed_pend1` — Priya Kumar · IN · pending_review (full KYC — approve me)
- `drv_seed_pend2` — Kouame Bakayoko · CI · pending_review (full KYC)
- `drv_seed_appr1` — Existing Driver · IN · approved
