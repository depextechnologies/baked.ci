"""CLI — one-click storage migration.

Usage:
    python scripts/migrate_storage.py --source emergent --dest local
    python scripts/migrate_storage.py --source local --dest s3 --dry-run
    python scripts/migrate_storage.py --list           # print discovered keys
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys

# Make sure `/app/backend` is on sys.path when this is called from anywhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.storage_migration import (  # noqa: E402
    run_full, enumerate_keys,
)
from core.db import SessionLocal  # noqa: E402


async def _print_progress(event: str, report):
    if event in ("start", "done"):
        print(f"[{event}] {json.dumps(report.to_dict())}", flush=True)
    else:
        print(f"[{event}] copied={report.copied} skipped_present={report.skipped_already_present} "
              f"skipped_missing={report.skipped_source_missing} failed={report.failed}",
              flush=True)


def _parse_args():
    p = argparse.ArgumentParser(description="One-click storage migration tool.")
    p.add_argument("--source", required=False, help="Source provider (local | emergent | s3)")
    p.add_argument("--dest",   required=False, help="Destination provider (local | emergent | s3)")
    p.add_argument("--dry-run", action="store_true",
                   help="Enumerate + list what would be copied without writing.")
    p.add_argument("--list", action="store_true",
                   help="Just enumerate every referenced key and exit.")
    return p.parse_args()


async def _list_only():
    async with SessionLocal() as session:
        keys = sorted(await enumerate_keys(session))
    print(json.dumps({"count": len(keys), "keys": keys}, indent=2))


async def _amain():
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = _parse_args()
    if args.list:
        await _list_only()
        return 0
    if not args.source or not args.dest:
        print("ERROR: --source and --dest are required (or use --list).", file=sys.stderr)
        return 2
    report = await run_full(source_name=args.source, dest_name=args.dest,
                            dry_run=args.dry_run, on_progress=_print_progress)
    print("\n=== FINAL REPORT ===")
    print(json.dumps(report.to_dict(), indent=2))
    return 0 if report.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(_amain()))
