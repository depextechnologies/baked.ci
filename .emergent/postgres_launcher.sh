#!/bin/bash
# BAKĒD postgres launcher — bulletproof edition (2026-07-30 v2).
#
# Failure modes fixed since v1:
#   * v1 called `/etc/init.d/postgresql start` AND `exec postgres` — two
#     instances competed for port 5432 and role-creation race-condition'd.
#   * v1 swallowed all errors with `>/dev/null 2>&1 || true`, hiding
#     `alembic: command not found` and any psql failure.
#   * v1 used a relative `alembic` path — supervisor's PATH doesn't include
#     the app venv so upgrades silently no-op'd.
#
# This version:
#   * Boots ONE postgres, in the foreground, under supervisor.
#   * Uses a **sidecar bootstrap** run once via pg_isready + retry loop.
#   * Uses ABSOLUTE paths and prints every step to stdout so supervisor logs
#     make it obvious when something breaks.
#   * ALTERs the role on every boot to guarantee the password matches
#     what the app expects, even if a previous partial state left it wrong.

set -u
PG_BIN=/usr/lib/postgresql/15/bin
PGDATA=/var/lib/postgresql/15/main
PGCONF=/etc/postgresql/15/main/postgresql.conf
APP_USER=baked
APP_PASS=baked_local_dev
APP_DB=baked
ALEMBIC=/root/.venv/bin/alembic
APP_DIR=/app/backend

log() { echo "[pg-launcher $(date -u +%FT%TZ)] $*"; }

# ---- 1) Kick off the bootstrap in the background so we can then exec PG. ----
# The bootstrap waits for the socket, then upserts role + DB + migrations.
(
  log "bootstrap: waiting for postgres to accept connections…"
  for i in $(seq 1 60); do
    if sudo -u postgres "${PG_BIN}/pg_isready" -q; then
      log "bootstrap: pg ready after ${i}s"
      break
    fi
    sleep 1
  done

  # Role + DB — idempotent. ALTER covers "role exists but with wrong password".
  log "bootstrap: ensuring role '${APP_USER}' and database '${APP_DB}' exist"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${APP_USER}') THEN
    CREATE ROLE ${APP_USER} LOGIN SUPERUSER PASSWORD '${APP_PASS}';
  ELSE
    ALTER ROLE ${APP_USER} WITH LOGIN SUPERUSER PASSWORD '${APP_PASS}';
  END IF;
END \$\$;
SQL
  if [ $? -ne 0 ]; then log "bootstrap: role setup FAILED"; else log "bootstrap: role OK"; fi

  DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${APP_DB}'")
  if [ "${DB_EXISTS}" != "1" ]; then
    sudo -u postgres createdb -O "${APP_USER}" "${APP_DB}"
    log "bootstrap: created database '${APP_DB}'"
  else
    log "bootstrap: database '${APP_DB}' already exists"
  fi

  # Sanity: can the app credentials round-trip?
  if PGPASSWORD="${APP_PASS}" psql -h 127.0.0.1 -U "${APP_USER}" -d "${APP_DB}" -tAc "SELECT 1" | grep -q 1; then
    log "bootstrap: app credentials round-trip OK"
  else
    log "bootstrap: app credentials round-trip FAILED"
  fi

  # Migrations — absolute path so supervisor's stripped PATH works.
  if [ -x "${ALEMBIC}" ]; then
    log "bootstrap: running alembic upgrade head"
    (cd "${APP_DIR}" && "${ALEMBIC}" upgrade head 2>&1) | while read -r L; do log "alembic: ${L}"; done
  else
    log "bootstrap: alembic binary not found at ${ALEMBIC}"
  fi

  log "bootstrap: complete"
) &

# ---- 2) Foreground postgres — supervisor owns the lifecycle. ----
log "starting postgres in foreground"
exec sudo -u postgres "${PG_BIN}/postgres" -D "${PGDATA}" -c config_file="${PGCONF}"
