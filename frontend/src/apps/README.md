# BAKĒD Frontend — Monorepo Layout (Phase 1a complete, 2026-02)

Fixing_Prompt.docx v2.0 target monorepo structure. Phase 1a is **complete**:
`App.js` is a thin dispatcher, each app owns its own router, and shared UI
lives in `packages/ui`. All source files still physically reside in the
legacy folders (`components/`, `pages/`) — that migration is intentionally
deferred to Phase 1b so this pass is zero-risk.

## Apps (each will become its own independently-deployable frontend)

| Folder                | Dev route      | Production domain                | Status         |
|-----------------------|----------------|----------------------------------|----------------|
| apps/customer         | /              | baked.ci                         | ✅ Phase 1a    |
| apps/admin            | /admin         | admin.baked.ci                   | ✅ Phase 1a    |
| apps/partner-landing  | /partner       | partner.baked.ci                 | ✅ Phase 1a    |
| apps/driver           | /driver        | driver.baked.ci                  | ⏳ Phase 2     |
| apps/mart-partner     | /mart-partner  | mart.partner.baked.ci            | ⏳ Phase 2 (next) |
| apps/food-partner     | /food-partner  | food.partner.baked.ci            | ⏳ Phase 2     |
| apps/shop-partner     | /shop-partner  | shop.partner.baked.ci            | ⏳ Phase 2     |
| apps/express-partner  | /express-partner | express.partner.baked.ci       | ⏳ Phase 2     |
| apps/auto-partner     | /auto-partner  | auto.partner.baked.ci            | ⏳ Phase 2     |
| apps/immo-partner     | /immo-partner  | immo.partner.baked.ci            | ⏳ Phase 2     |

## Shared packages

- `packages/ui` — design-system barrel consumed by every app (`BakedLogo`,
  Shadcn primitives, sonner `toast`). Currently re-exports from
  `src/components/ui`; Phase 1b will make this the canonical location.

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

- [x] Phase 1a — Scaffolding + per-app routers (`App.js` is now a dispatcher).
- [ ] Phase 1b — Physically relocate customer/admin pages under `apps/*`
      and adopt yarn workspaces (deferred; not blocking).
- [ ] Phase 2 — Build partner applications in the docx-defined order
      (MARTbakēd Partner is next).
