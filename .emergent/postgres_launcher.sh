#!/bin/bash
# Postgres 15 launcher for supervisor. Runs as the postgres user; recreates
# the `baked` role + DB idempotently on first boot so a fresh container is
# never missing the app's user. Data lives on the pod's ephemeral filesystem.
set -e

# Start PG in the background (postgres binary runs in foreground under supervisor)
/etc/init.d/postgresql start >/dev/null 2>&1 || true
# Wait until it's accepting connections
for i in $(seq 1 30); do
  if sudo -u postgres /usr/lib/postgresql/15/bin/pg_isready -q; then break; fi
  sleep 1
done

# Idempotent user + DB bootstrap. `$$DO$$` avoids the outer heredoc chewing $.
sudo -u postgres psql <<'SQL' >/dev/null 2>&1 || true
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='baked') THEN
    CREATE USER baked WITH PASSWORD 'baked_local_dev' SUPERUSER;
  END IF;
END $$;
SQL
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='baked'" 2>/dev/null | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE baked OWNER baked;" >/dev/null 2>&1 || true

# Re-run alembic migrations idempotently
cd /app/backend && alembic upgrade head >/var/log/supervisor/alembic.out.log 2>&1 || true

# Now foreground the real postgres server so supervisor keeps it alive
exec sudo -u postgres /usr/lib/postgresql/15/bin/postgres \
  -D /var/lib/postgresql/15/main \
  -c config_file=/etc/postgresql/15/main/postgresql.conf
