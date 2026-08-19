"""Load /app/backend/.env into os.environ so pytest sees REDIS_URL, DATABASE_URL, etc.

Kept minimal on purpose — the tests use their own SessionLocal via the app code."""
import os
from pathlib import Path

_ENV_PATH = Path(__file__).parent / ".env"


def _load_env():
    if not _ENV_PATH.is_file(): return
    for line in _ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip()
        # Don't overwrite anything the harness set intentionally.
        os.environ.setdefault(k, v.strip('"').strip("'"))


_load_env()
