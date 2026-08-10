"""JWT + password helpers. RBAC-aware token payload."""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from passlib.context import CryptContext

JWT_SECRET = os.environ.get("JWT_SECRET", "baked-dev-secret")
if (os.environ.get("APP_ENV") or "").lower() == "production" and (
    JWT_SECRET in ("baked-dev-secret", "change-me-to-a-long-random-value") or len(JWT_SECRET) < 32
):
    raise RuntimeError("JWT_SECRET must be set to a real random value (32+ chars) in production")
JWT_ALG = "HS256"
JWT_ACCESS_TTL_MIN = int(os.environ.get("JWT_ACCESS_TTL_MIN", "1440"))

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _pwd.verify(plain, hashed)
    except Exception:  # noqa: BLE001
        return False


def create_access_token(subject: str, role: str = "customer", extra: Optional[dict] = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=JWT_ACCESS_TTL_MIN)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
