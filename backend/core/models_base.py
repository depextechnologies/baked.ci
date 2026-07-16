"""Base Pydantic document model with audit fields. All persisted models extend BaseDocument."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
import uuid


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str = "") -> str:
    if prefix:
        return f"{prefix}_{uuid.uuid4().hex[:16]}"
    return str(uuid.uuid4())


class BaseDocument(BaseModel):
    """All persistent domain models extend this. Never exposes MongoDB _id."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)
    deleted_at: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    version: int = 1

    def to_mongo(self) -> dict:
        return self.model_dump(exclude_none=False)

    @classmethod
    def from_mongo(cls, doc: dict | None):
        if doc is None:
            return None
        doc.pop("_id", None)
        return cls(**doc)


def touch(doc: dict, actor_id: Optional[str] = None) -> dict:
    doc["updated_at"] = _now_iso()
    if actor_id:
        doc["updated_by"] = actor_id
    doc["version"] = doc.get("version", 1) + 1
    return doc
