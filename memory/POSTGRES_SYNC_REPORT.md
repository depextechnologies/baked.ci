# BAKĒD PostgreSQL Synchronization Report

**Date**: 2026-07-29
**Instruction**: `Fixing_Prompt.docx` — mandatory baseline sync with `depextechnologies/baked.ci` (PostgreSQL, main).

---

## Phase 1 — Synchronize with GitHub ✅

- **Repository**: https://github.com/depextechnologies/baked.ci (public)
- **Branch**: `main`
- **Commit pulled**: `2858069 yml file (3 days ago)`
- **Sync method**:
  1. Cloned into `/tmp/baked-pg` (scratch) — verified structure + zero MongoDB imports.
  2. Backed up previous MongoDB codebase to `/tmp/baked_backup/app_mongo_snapshot.tgz` (95 MB) and `/tmp/baked_backup/.emergent` + `/tmp/baked_backup/memory_current` for safe rollback if ever needed.
  3. Wiped `/app` (preserving only `/app/.emergent` platform metadata and `/app/.git`).
  4. Copied full GitHub tree into `/app`.
  5. Restored `/app/memory/PRD.md` + `/app/memory/test_credentials.md` from backup so historical sign-off records remain intact.

## Phase 2 — PostgreSQL Verification ✅

| Check | Result |
|---|---|
| PostgreSQL 15 installed and running (`pg_isready` → `accepting connections`) | ✅ |
| DB `baked` + user `baked` created (SUPERUSER, password `baked_local_dev`) | ✅ |
| `backend/.env` written with `DATABASE_URL=postgresql+asyncpg://baked:baked_local_dev@127.0.0.1:5432/baked` | ✅ |
| `pip install -r requirements.txt` — installed `sqlalchemy[asyncio]==2.0.35`, `asyncpg==0.29.0`, `alembic==1.13.3` | ✅ |
| Alembic migration applied: `3200d0b5b23c initial schema` | ✅ |
| MongoDB imports (`motor`, `pymongo`, `MongoClient`, `bson`) anywhere in `/app/backend` | **0 hits** ✅ |
| SQLAlchemy models present under `backend/core/models` + repositories | ✅ |
| Auth uses PostgreSQL (`backend/shared/auth`) | ✅ |
| EXPRESSbakēd uses PostgreSQL (`backend/modules/express/{routes,dispatch,tracking,pricing,seed}.py`) | ✅ |
| MARTbakēd uses PostgreSQL (`backend/modules/mart/`) | ✅ |
| Shared platform modules (`shared/customer`, `shared/admin`, `shared/addresses`, `shared/config_svc`, `shared/ai`) use PostgreSQL | ✅ |

## Phase 3 — Architecture Validation ✅

| Runtime check | Result |
|---|---|
| `sudo supervisorctl start backend` — backend RUNNING (pid `3965`) | ✅ |
| `GET /api/health` → `{"status":"ok"}` | ✅ |
| `GET /api/config/countries` returns CI + LR (seed applied) | ✅ |
| `GET /api/express/vehicles?country=CI` returns bike/scooter/three_wheeler/mini_truck/truck | ✅ |
| `POST /api/admin/auth/login` (email `depexopenai@gmail.com` / pw from env) → JWT returned | ✅ |
| `sudo supervisorctl start frontend` — frontend RUNNING (pid `4022`) | ✅ |
| Browser tab title: `Baked | One app for everything.` (white-label carried through) | ✅ |
| MART home (`/`) renders: module tabs, hero, categories, deals, AI assistant | ✅ (screenshot) |
| EXPRESSbakēd home (`/express`) renders: 45/55 split, branded vehicle cards, live Google Map with dispatched driver markers, all module tabs | ✅ (screenshot) |

## Phase 4 — Ready to Continue Development ✅

All future work uses SQLAlchemy 2.0 async models + Alembic migrations. **No new MongoDB code will be introduced.** Any legacy MongoDB reference that surfaces during subsequent work will be migrated as it's found.

---

## Rollback Safety Net

Full snapshot of the previous MongoDB codebase preserved at:
- `/tmp/baked_backup/app_mongo_snapshot.tgz` (95 MB)
- `/tmp/baked_backup/emergent_meta/` (platform metadata copy)
- `/tmp/baked_backup/memory_current/` (PRD.md + credentials copy)

If rollback needed: `tar xzf /tmp/baked_backup/app_mongo_snapshot.tgz -C /`.

## Deferred / Follow-ups

- Rotate `JWT_SECRET` and `baked` DB password before production deploy.
- Wave-2 Google OAuth (still Emergent-hosted) — pending your `baked.ci` DNS go-live.
- Enable Google Directions API on the Maps project so the wizard route polyline renders (unchanged from previous session).

**Sign-off**: PostgreSQL is the active baseline. Development is unblocked.
