"""Abstract storage provider interface."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Tuple


class StorageProvider(ABC):
    """All concrete storage backends implement this contract.

    `path` is a provider-independent object key — usually
    `<app>/<scope>/<uuid>.<ext>`. It is what the DB persists.
    """

    @abstractmethod
    def upload(self, path: str, data: bytes, content_type: str) -> dict:
        """Store bytes under `path`. Return `{path, size, etag, url}`."""

    @abstractmethod
    def download(self, path: str) -> Tuple[bytes, str]:
        """Return `(bytes, content_type)` for `path`. Raise on miss."""

    @abstractmethod
    def delete(self, path: str) -> None:
        """Best-effort delete. Silently succeeds if the object is absent."""

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Return True if the object exists."""

    def public_url(self, path: str) -> str:
        """Return the web-accessible URL for this object.

        Default: return the object key unchanged (S3-style callers already
        get a signed URL back from `upload`). LocalStorageProvider overrides.
        """
        return path
