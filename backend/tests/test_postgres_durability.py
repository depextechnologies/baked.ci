"""PostgreSQL durability / self-heal tests for BAKED platform.

Verifies that the /app/.emergent/postgres_launcher.sh recovers autonomously
after supervisor restart/stop-start cycles, and that role/DB/migrations
are idempotently re-established on every boot.
"""
import os
import subprocess
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
HEALTH = f"{BASE_URL}/api/health"
LOG = "/var/log/supervisor/postgres.out.log"
APP_USER = "baked"
APP_PASS = "baked_local_dev"
APP_DB = "baked"

# ---------- helpers ----------
def sh(cmd, check=False, timeout=60):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise AssertionError(f"cmd failed: {cmd}\nstdout={r.stdout}\nstderr={r.stderr}")
    return r

def wait_health_ok(timeout=30):
    """Poll /api/health until 200 with db:up, or timeout."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            r = requests.get(HEALTH, timeout=5)
            last = (r.status_code, r.text)
            if r.status_code == 200 and r.json().get("db") == "up":
                return True, last
        except Exception as e:
            last = ("EXC", str(e))
        time.sleep(1)
    return False, last

def wait_pg_ready(timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = sh("sudo -u postgres /usr/lib/postgresql/15/bin/pg_isready -q")
        if r.returncode == 0:
            return True
        time.sleep(1)
    return False


# ---------- Baseline ----------
class TestBaseline:
    def test_health_ok_initially(self):
        r = requests.get(HEALTH, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "ok"
        assert body["db"] == "up"


# ---------- PRIMARY DURABILITY: restart ----------
class TestRestartDurability:
    def test_restart_postgres_recovers(self):
        sh("sudo supervisorctl restart postgres", check=True)
        # supervisor returns immediately; bootstrap runs async
        ok, last = wait_health_ok(timeout=45)
        assert ok, f"health did not recover after restart, last={last}"

        # pg_isready
        assert wait_pg_ready(10), "pg_isready never returned accepting connections"

        # role round-trip
        r = sh(f'PGPASSWORD={APP_PASS} psql -h 127.0.0.1 -U {APP_USER} -d {APP_DB} -tAc "SELECT 1"')
        assert r.returncode == 0 and r.stdout.strip() == "1", f"role round-trip failed: {r.stdout} / {r.stderr}"

        # database exists
        r = sh(f"sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname='{APP_DB}'\"")
        assert r.stdout.strip() == "1"

        # alembic step visible in log
        log = open(LOG).read()
        assert "running alembic upgrade head" in log, "alembic upgrade line missing from postgres log"
        assert "bootstrap: pg ready" in log
        assert "role OK" in log or "role setup FAILED" not in log
        assert "app credentials round-trip OK" in log


# ---------- PRIMARY DURABILITY 2: stop/start ----------
class TestStopStartDurability:
    def test_stop_start_postgres_recovers(self):
        sh("sudo supervisorctl stop postgres", check=True)
        time.sleep(3)
        # health should be degraded now
        try:
            r = requests.get(HEALTH, timeout=5)
            assert r.status_code == 503, f"expected 503 while pg down, got {r.status_code}: {r.text}"
            body = r.json()
            assert body.get("db") == "down"
            assert body.get("status") == "degraded"
        except requests.RequestException:
            pytest.fail("health endpoint should return 503, not raise")

        sh("sudo supervisorctl start postgres", check=True)
        ok, last = wait_health_ok(timeout=45)
        assert ok, f"health did not recover after start, last={last}"

        # Seed data endpoints
        r = requests.get(f"{BASE_URL}/api/config/countries", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) == 2

        r = requests.get(f"{BASE_URL}/api/express/vehicles?country=CI", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) == 5

        r = requests.get(f"{BASE_URL}/api/mart/categories", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) == 9


# ---------- IDEMPOTENCY: password drift auto-recovery ----------
class TestPasswordDriftRecovery:
    def test_alter_role_drift_is_healed_on_restart(self):
        # drift: change password out from under the app
        r = sh("sudo -u postgres psql -c \"ALTER ROLE baked WITH PASSWORD 'wrong_password'\"")
        assert r.returncode == 0, f"drift setup failed: {r.stderr}"

        # confirm drift
        r = sh(f'PGPASSWORD={APP_PASS} psql -h 127.0.0.1 -U {APP_USER} -d {APP_DB} -tAc "SELECT 1"')
        assert r.returncode != 0, "expected auth failure after drift, but succeeded"

        # restart -> launcher must ALTER back to APP_PASS
        sh("sudo supervisorctl restart postgres", check=True)
        ok, last = wait_health_ok(timeout=45)
        assert ok, f"health did not recover after drift+restart, last={last}"

        r = sh(f'PGPASSWORD={APP_PASS} psql -h 127.0.0.1 -U {APP_USER} -d {APP_DB} -tAc "SELECT 1"')
        assert r.returncode == 0 and r.stdout.strip() == "1", f"drift not healed: {r.stdout}/{r.stderr}"


# ---------- HEALTH ENDPOINT ----------
class TestHealthEndpointStates:
    def test_health_degraded_when_pg_down_then_recovered(self):
        sh("sudo supervisorctl stop postgres", check=True)
        time.sleep(3)
        r = requests.get(HEALTH, timeout=5)
        assert r.status_code == 503
        body = r.json()
        assert body["status"] == "degraded"
        assert body["db"] == "down"

        sh("sudo supervisorctl start postgres", check=True)
        ok, last = wait_health_ok(timeout=45)
        assert ok, f"health did not recover, last={last}"


# ---------- SEED DATA final check ----------
class TestSeedData:
    def test_countries(self):
        r = requests.get(f"{BASE_URL}/api/config/countries", timeout=10)
        assert r.status_code == 200
        codes = sorted([c["code"] for c in r.json()])
        assert codes == ["CI", "LR"]

    def test_express_vehicles_ci(self):
        r = requests.get(f"{BASE_URL}/api/express/vehicles?country=CI", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) == 5

    def test_mart_categories(self):
        r = requests.get(f"{BASE_URL}/api/mart/categories", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) == 9


# ---------- LOG VISIBILITY ----------
class TestLogVisibility:
    def test_log_contains_all_bootstrap_steps(self):
        log = open(LOG).read()
        for phrase in [
            "bootstrap: pg ready",
            "role OK",
            "database",
            "app credentials round-trip OK",
            "running alembic upgrade head",
        ]:
            assert phrase in log, f"missing '{phrase}' in postgres log"
