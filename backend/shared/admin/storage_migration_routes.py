"""Admin — one-click storage migration endpoint (Fixing_Prompt v7).

Exposes the CLI's engine over HTTP so Super Admins can trigger the copy
from a browser without SSH access. The job runs in a FastAPI background
task; progress is available via a simple polling endpoint.

Endpoints:
    GET  /api/admin/storage/status       — current provider + last-job snapshot
    POST /api/admin/storage/enumerate    — count + first 200 discovered keys
    POST /api/admin/storage/migrate      — start migration (body: source, dest, dry_run)
    GET  /api/admin/storage/migrate/{id} — job progress
"""
from __future__ import annotations

import asyncio
import os
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.db import SessionLocal
from core.models import AdminUser
from shared.admin.routes import get_current_admin
from scripts.storage_migration import (
    MigrationReport, enumerate_keys, run_full,
)

router = APIRouter(prefix="/admin/storage", tags=["admin-storage"])

# In-memory job registry — kept small (one job at a time is the common
# case). Restarting the backend clears the registry; jobs themselves
# are idempotent so re-running is always safe.
_JOBS: dict[str, "JobState"] = {}


@dataclass
class JobState:
    id: str
    source: str
    dest: str
    dry_run: bool
    status: str = "pending"          # pending | running | done | failed
    started_at: str = ""
    finished_at: str = ""
    error: str = ""
    report: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


class MigrateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str = Field(..., description="local | emergent | s3")
    dest:   str = Field(..., description="local | emergent | s3")
    dry_run: bool = False


@router.get("/status")
async def storage_status(admin: AdminUser = Depends(get_current_admin)):
    provider = (os.environ.get("STORAGE_PROVIDER") or "local").lower()
    return {
        "active_provider": provider,
        "storage_local_path": os.environ.get("STORAGE_LOCAL_PATH") or "/app/backend/uploads",
        "last_job": next(iter(sorted(_JOBS.values(),
                              key=lambda j: j.started_at or "", reverse=True)),
                         None) and next(iter(sorted(_JOBS.values(),
                              key=lambda j: j.started_at or "", reverse=True))).to_dict(),
    }


@router.post("/enumerate")
async def storage_enumerate(admin: AdminUser = Depends(get_current_admin)):
    """Discover every object key currently referenced by the DB. Used by
    the admin UI to preview scope before running the actual migration."""
    async with SessionLocal() as session:
        keys = sorted(await enumerate_keys(session))
    return {"count": len(keys), "sample": keys[:200]}


@router.post("/migrate", status_code=202)
async def storage_migrate(
    payload: MigrateIn,
    background_tasks: BackgroundTasks,
    admin: AdminUser = Depends(get_current_admin),
):
    if payload.source.lower() == payload.dest.lower():
        raise HTTPException(400, "Source and destination providers must differ")
    for name in (payload.source, payload.dest):
        if name.lower() not in ("local", "emergent", "s3"):
            raise HTTPException(400, f"Unknown provider '{name}'")

    job = JobState(id=f"stmig_{uuid.uuid4().hex[:12]}",
                   source=payload.source, dest=payload.dest,
                   dry_run=payload.dry_run,
                   started_at=datetime.now(timezone.utc).isoformat())
    _JOBS[job.id] = job

    async def _run(job_id: str):
        j = _JOBS[job_id]
        j.status = "running"

        async def _on_progress(_event: str, report: MigrationReport):
            j.report = report.to_dict()

        try:
            report = await run_full(source_name=j.source, dest_name=j.dest,
                                    dry_run=j.dry_run, on_progress=_on_progress)
            j.report = report.to_dict()
            j.status = "done"
        except Exception as e:
            j.error = str(e)[:400]
            j.status = "failed"
        j.finished_at = datetime.now(timezone.utc).isoformat()

    background_tasks.add_task(_run, job.id)
    return job.to_dict()


@router.get("/migrate/{job_id}")
async def storage_migrate_status(
    job_id: str, admin: AdminUser = Depends(get_current_admin),
):
    j = _JOBS.get(job_id)
    if not j:
        raise HTTPException(404, "Job not found (backend may have restarted)")
    return j.to_dict()
