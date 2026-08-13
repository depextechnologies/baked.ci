# BAKĒD — Test Credentials

## Super Admin
- Email: `depexopenai@gmail.com`
- Password: `baked@2026#!$@`

## MARTbakēd Partner Portal — Multi-store test set

### Partner Alpha Store (`prt_alpha_demo_seed`) — Owner login
- Email: `partner-alpha-store@test.example`
- Password: `Alpha1234!Beta`
- Store code: `MRT-ABJ-001`

### Partner Beta Store (`prt_beta_demo_seed`) — Owner login
- Email: `partner-beta-store@test.example`
- Password: `Alpha1234!Beta`
- Store code: `MRT-ABJ-002`

### Alpha Team — Staff logins (Slice B RBAC + Phase 1 multi-store)
Login page: `/partner/staff-login`. Staff login accepts EITHER email OR employee_code.

| Employee ID   | Email                    | Password       | Role     | Store Code   |
| ------------- | ------------------------ | -------------- | -------- | ------------ |
| `EMP-ABJ-001` | `picker1@example.com`    | `Packer1234!`  | packer   | MRT-ABJ-001  |
| `EMP-ABJ-002` | `manager1@example.com`   | `Packer1234!`  | manager  | MRT-ABJ-001  |

Extended roles now supported: owner (Partner row), manager, packer, cashier,
supervisor, inventory_manager, warehouse_manager, customer_support.

Store lifecycle statuses: pending, under_review, additional_info_required,
approved, rejected, setup_required, setup_in_progress, **active** (only
this state accepts staff logins & orders), temporarily_suspended,
maintenance, closed.

New staff can be invited from `/partner-portal/team` (owner + manager only)
— an `employee_code` is auto-generated (EMP-{CITY3}-{seq:03d}) at invite time.

## MARTbakēd Supplier Portal — Phase 2A (Onboarding Foundation)

### Approved Demo Supplier (DEMO Delta Beverages CI) — can log in
- URL: `/martbaked/sellers/login`
- Email: `demo-delta-supplier@test.example`
- Password: `Supplier1234!`
- Supplier code: `SUP-CI-0001` · Application code: `MART-SUP-2026-00001`

### Submitted Demo Supplier (DEMO Echo Fresh Produce) — SA review queue
- Application code: `MART-SUP-2026-00002`
- Business email: `demo-echo-supplier@test.example`
- Not activated (login denied until SA approves)

### Action-Required Demo Supplier (DEMO Foxtrot Snacks Co.)
- Application code: `MART-SUP-2026-00003`
- Business email: `demo-foxtrot-supplier@test.example`
- Awaits document re-upload (see `action_required_notes` on public status endpoint)

## Customer OTP (Côte d'Ivoire — dev mode)
Any Ivorian mobile number works — OTP is returned in the API response
(`dev_code`) since SMS is mocked in dev.

## Emergent LLM Key
- Present in `EMERGENT_LLM_KEY` in `/app/backend/.env`
- Model: claude-sonnet-4-6

## Optional SMTP (Slice B staff invites — falls back to in-app link)
When configured, staff-invite emails will be sent. If any of these are missing,
the invite link is returned in the API response so the owner can share it manually.

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<username>
SMTP_PASSWORD=<password>
SMTP_FROM_EMAIL=no-reply@baked.ci
SMTP_FROM_NAME=BAKĒD
SMTP_USE_TLS=true
```
