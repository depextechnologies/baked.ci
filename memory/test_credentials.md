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

## Notes
- Legacy `/martbaked/sellers/portal/*` still works — auto-redirects to the resolved slug URL client-side.
