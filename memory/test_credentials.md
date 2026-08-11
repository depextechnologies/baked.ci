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

### Alpha Team — Staff logins (Slice B RBAC)
Login page: `/partner-portal/staff-login`

| Email                    | Password       | Role     | Store Code   |
| ------------------------ | -------------- | -------- | ------------ |
| `picker1@example.com`    | `Packer1234!`  | packer   | MRT-ABJ-001  |
| `manager1@example.com`   | `Packer1234!`  | manager  | MRT-ABJ-001  |

New staff can be invited from `/partner-portal/team` (owner + manager only).

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
