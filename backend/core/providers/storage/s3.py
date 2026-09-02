"""AWS S3 storage provider (deferred activation).

Lives here as a first-class implementation so switching from local to S3
is a config-only change. `boto3` is imported lazily so environments that
never enable S3 don't pay the dependency cost.
"""
from __future__ import annotations
import logging
import os
from typing import Tuple

from .base import StorageProvider

log = logging.getLogger("baked.storage.s3")


class S3StorageProvider(StorageProvider):
    def __init__(self):
        try:
            import boto3  # noqa: F401 — imported for its side effect only
        except ImportError as e:
            raise RuntimeError(
                "STORAGE_PROVIDER=s3 requires the boto3 package. "
                "Run `pip install boto3` inside the backend image."
            ) from e
        self.bucket = os.environ["AWS_S3_BUCKET"]
        self.region = os.environ.get("AWS_REGION")
        endpoint = os.environ.get("AWS_S3_ENDPOINT") or None
        self.public_prefix = (os.environ.get("AWS_S3_PUBLIC_URL") or "").rstrip("/")
        import boto3  # local scope so type checker sees it
        self._client = boto3.client(
            "s3",
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
            region_name=self.region,
            endpoint_url=endpoint,
        )
        log.info("s3 storage ready bucket=%s region=%s", self.bucket, self.region)

    def upload(self, path: str, data: bytes, content_type: str) -> dict:
        self._client.put_object(Bucket=self.bucket, Key=path, Body=data,
                                ContentType=content_type)
        return {"path": path, "size": len(data), "etag": None,
                "content_type": content_type, "url": self.public_url(path)}

    def download(self, path: str) -> Tuple[bytes, str]:
        obj = self._client.get_object(Bucket=self.bucket, Key=path)
        return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")

    def delete(self, path: str) -> None:
        try:
            self._client.delete_object(Bucket=self.bucket, Key=path)
        except Exception as e:
            log.warning("s3.delete failed path=%s err=%s", path, e)

    def exists(self, path: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=path)
            return True
        except Exception:
            return False

    def public_url(self, path: str) -> str:
        if self.public_prefix:
            return f"{self.public_prefix}/{path.lstrip('/')}"
        # Default virtual-hosted style
        if self.region and self.region != "us-east-1":
            return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{path}"
        return f"https://{self.bucket}.s3.amazonaws.com/{path}"
