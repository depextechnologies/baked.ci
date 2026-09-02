"""Local disk storage — the default provider.

Files are written under `STORAGE_LOCAL_PATH` (default `/app/backend/uploads`)
and served by FastAPI StaticFiles mounted at `/uploads`. The mount happens
in `server.py`, not here, so this module stays framework-agnostic.
"""
from __future__ import annotations
import hashlib
import logging
import os
import re
from pathlib import Path
from typing import Tuple

from .base import StorageProvider

log = logging.getLogger("baked.storage.local")


class LocalStorageProvider(StorageProvider):
    def __init__(self, root: str, url_prefix: str = "/uploads"):
        self.root = Path(root).resolve()
        self.url_prefix = url_prefix.rstrip("/") or "/uploads"
        self.root.mkdir(parents=True, exist_ok=True)
        log.info("local storage ready root=%s url_prefix=%s", self.root, self.url_prefix)

    # -----------------------------------------------------------------
    # helpers
    # -----------------------------------------------------------------
    _safe_seg = re.compile(r"[^A-Za-z0-9._\-]")

    def _absolute(self, path: str) -> Path:
        """Resolve `path` to an absolute location under `self.root`.

        Blocks path traversal: any `..` segment or absolute prefix is
        rejected. Also strips any characters that aren't URL-safe.
        """
        if not path or path.startswith("/") or ".." in path.replace("\\", "/").split("/"):
            raise ValueError("invalid storage path")
        safe_segments = [self._safe_seg.sub("_", seg) for seg in path.split("/") if seg]
        target = self.root.joinpath(*safe_segments)
        # Belt & braces: verify the resolved path is still inside root.
        try:
            target.resolve().relative_to(self.root)
        except ValueError as e:
            raise ValueError("path escapes storage root") from e
        return target

    # -----------------------------------------------------------------
    # StorageProvider API
    # -----------------------------------------------------------------
    def upload(self, path: str, data: bytes, content_type: str) -> dict:
        abs_path = self._absolute(path)
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(data)
        etag = hashlib.md5(data).hexdigest()
        return {
            "path": path,
            "size": len(data),
            "etag": etag,
            "content_type": content_type,
            "url": self.public_url(path),
        }

    def download(self, path: str) -> Tuple[bytes, str]:
        import mimetypes
        abs_path = self._absolute(path)
        if not abs_path.is_file():
            raise FileNotFoundError(path)
        ct, _ = mimetypes.guess_type(abs_path.name)
        return abs_path.read_bytes(), ct or "application/octet-stream"

    def delete(self, path: str) -> None:
        try:
            self._absolute(path).unlink(missing_ok=True)
        except (ValueError, OSError) as e:
            log.warning("local.delete failed path=%s err=%s", path, e)

    def exists(self, path: str) -> bool:
        try:
            return self._absolute(path).is_file()
        except ValueError:
            return False

    def public_url(self, path: str) -> str:
        # Keep as web path — the frontend passes it through
        # `REACT_APP_BACKEND_URL` when it needs an absolute URL.
        return f"{self.url_prefix}/{path.lstrip('/')}"
