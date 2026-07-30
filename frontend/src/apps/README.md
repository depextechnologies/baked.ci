# BAKĒD Frontend — Monorepo Layout (Phase 1a scaffolding, 2026-07-30)

This directory tree is the target monorepo structure per Fixing_Prompt.docx v2.0.
It currently coexists with the existing single-app `src/` tree — Phase 1b
will migrate the existing pages into these buckets without changing behaviour.

## Apps (each will become its own independently-deployable frontend)

| Folder                | Dev route      | Production domain                |
|-----------------------|----------------|----------------------------------|
| apps/customer         | /              | baked.ci                         |
| apps/partner-landing  | /partner       | partner.baked.ci                 |
| apps/admin            | /admin         | admin.baked.ci                   |
| apps/driver           | /driver        | driver.baked.ci                  |
| apps/mart-partner     | /mart-partner  | mart.partner.baked.ci            |
| apps/food-partner     | /food-partner  | food.partner.baked.ci            |
| apps/shop-partner     | /shop-partner  | shop.partner.baked.ci            |
| apps/express-partner  | /express-partner | express.partner.baked.ci       |
| apps/auto-partner     | /auto-partner  | auto.partner.baked.ci            |
| apps/immo-partner     | /immo-partner  | immo.partner.baked.ci            |

## Shared packages

- `packages/ui`  — design-system components consumed by every app (buttons,
  cards, modals, `BakedLogo`, form primitives). Currently re-exports from
  the existing `src/components/ui` shadcn tree; Phase 1b will make this the
  canonical location.

## Non-frontend shared services (unchanged)

All apps talk to the **same** FastAPI backend at `/api/*` and the **same**
PostgreSQL database. Authentication, RBAC, notifications, AI, and file
storage are single instances — never duplicated per frontend.

## Path-prefixed dev routing (approved Option A)

Instead of multi-domain routing, dev/preview uses path prefixes:
`baked-platform.preview.emergentagent.com/partner/*` etc. When production
DNS goes live at `baked.ci`, each prefix maps 1:1 to a subdomain via
Nginx `server_name` rules — zero application-code changes required.

## Migration status

- [x] Phase 1a — Scaffolding + Partner Landing app + `/partner` route (this pass)
- [ ] Phase 1b — Move existing customer + admin pages into `apps/customer/` and
      `apps/admin/`, convert `frontend/` to yarn workspaces (one focused pass)
- [ ] Phase 2 — Build partner applications in the docx-defined order
