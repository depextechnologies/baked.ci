# BAKĒD — Test Credentials

## Super Admin
- Email: `depexopenai@gmail.com`
- Password: `baked@2026#!$@`

## MARTbakēd Partner Portal — Multi-store test set
Two active partners in Côte d'Ivoire (Abidjan, service radius 7 km) — created
so we can exercise the Inventory Allocation Engine's multi-partner routing.

- **Partner Alpha Store**  (`prt_c762370005f649db`)
  - Email: `partner-alpha-store@test.example`
  - Password: `Alpha1234!Beta`
  - Stocks: Banane Cavendish (900), Baguette Tradition (450), Lait UHT (750)

- **Partner Beta Store**   (`prt_302c83e9b8e34e30`)
  - Email: `partner-beta-store@test.example`
  - Password: `Alpha1234!Beta`
  - Stocks: Coca-Cola (850), Baguette Tradition (420 — cheaper of the two),
    Œufs Fermiers (900), Eau Minérale (1700)

Baguette is intentionally stocked by BOTH partners so the allocator's
"consolidate to fewer stores" tie-breaker can be observed.

## Customer OTP (Côte d'Ivoire — dev mode)
Any Ivorian mobile number works — the OTP is returned in the API response
(`dev_code`) since SMS is mocked in dev.

## Emergent LLM Key
- Present in `EMERGENT_LLM_KEY` in `/app/backend/.env`
- Model: claude-sonnet-4-6
