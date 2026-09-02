"""Pluggable storage providers (Fixing_Prompt v7 — 2026-02-28).

Everything in the codebase that stores or retrieves an uploaded file goes
through `core.providers.object_storage.put_object` / `get_object`. That
module now delegates to the provider selected by `STORAGE_PROVIDER` env
(`local` (default) · `emergent` · `s3`), so switching backends is a one-
line configuration change with zero code churn at call sites.

Design goals (from the Fixing_Prompt):
  * Single centralized abstraction — no `if provider == "..."` scattered
    across routes.
  * Default = local disk, no external creds required for dev / preview /
    self-hosted `baked.ci` installs.
  * S3 is a drop-in: set `STORAGE_PROVIDER=s3` + the four `AWS_*` env vars
    and restart. No route rewrites, no DB migration.
  * The provider returns a WEB-accessible URL/path — never a filesystem
    path. Under `local`, that's `/uploads/<slug>/<uuid>.<ext>` served by
    FastAPI StaticFiles.
"""
