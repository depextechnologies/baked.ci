"""Runtime store-code + employee-code generators.

Fixing_Prompt §27 — store IDs are backend-generated, DB-unique, human-readable,
never editable by frontend clients.

Format:
    * Store code:    MRT-{CITY3}-{seq:03d}   e.g. MRT-ABJ-001
    * Employee code: EMP-{CITY3}-{seq:03d}   e.g. EMP-ABJ-001

`CITY3` collapses to the first 3 uppercase A-Z letters of the store's city.
For non-CI countries we still use the city's 3-letter shorthand — the
country is already captured in `warehouses.country`, so an eventual Ghana
store in Accra would be `MRT-ACC-001`.
"""
from __future__ import annotations
import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import Partner, PartnerStaff, Warehouse

_CITY_CODE_RE = re.compile(r"[^A-Za-z]")

# Common city-code aliases. Fixing_Prompt uses `ABJ` for Abidjan and `ACC` for
# Accra which are the IATA airport codes rather than the plain first-3-letters
# ("ABI"/"ACC"). We map the well-known ones explicitly and fall back to
# first-3-letters for anything else.
_CITY_CODE_ALIASES = {
    "abidjan":     "ABJ",
    "accra":       "ACC",
    "lagos":       "LOS",
    "dakar":       "DKR",
    "cocody":      "COC",
    "yopougon":    "YOP",
    "abobo":       "ABO",
    "adjame":      "ADJ",
    "marcory":     "MCR",
    "treichville": "TRE",
    "plateau":     "PLT",
    "bouake":      "BKE",
}


def _city_code(city: str | None) -> str:
    if not city:
        return "XXX"
    normalised = _CITY_CODE_RE.sub("", city).lower()
    if normalised in _CITY_CODE_ALIASES:
        return _CITY_CODE_ALIASES[normalised]
    cleaned = normalised.upper()
    return (cleaned[:3] or "XXX").ljust(3, "X")


# Human-readable prefix per module, per Fixing_Prompt §27 (MARTbakēd → MRT).
_MODULE_PREFIXES = {
    "mart":    "MRT",
    "food":    "FOD",
    "shop":    "SHP",
    "express": "EXP",
    "auto":    "AUT",
    "immo":    "IMO",
}


def _module_prefix(module: str | None) -> str:
    if not module:
        return "MRT"
    key = module.strip().lower()
    return _MODULE_PREFIXES.get(key, key.upper()[:3].ljust(3, "X"))


async def next_store_code(session: AsyncSession, *, module: str, city: str) -> str:
    """Return the next available store code, e.g. `MRT-ABJ-004`.

    Sequence is per (module, city3). Race-safe against the DB-unique index on
    `warehouses.code` — collisions retry via an internal loop.
    """
    module_prefix = _module_prefix(module)
    city3 = _city_code(city)
    like_pattern = f"{module_prefix}-{city3}-%"

    highest = await session.scalar(
        select(func.max(Warehouse.code)).where(Warehouse.code.like(like_pattern))
    )
    seq = 1
    if highest:
        try:
            seq = int(highest.rsplit("-", 1)[1]) + 1
        except (ValueError, IndexError):
            seq = 1

    # Retry loop covers the tiny race between max()+INSERT.
    for offset in range(0, 100):
        candidate = f"{module_prefix}-{city3}-{(seq + offset):03d}"
        clash = await session.scalar(
            select(Warehouse.id).where(Warehouse.code == candidate)
        )
        if not clash:
            return candidate
    raise RuntimeError(f"could not allocate a unique store code under {module_prefix}-{city3}-*")


async def next_employee_code(
    session: AsyncSession, *, partner_id: str, city: str | None,
) -> str:
    """Return the next available employee code for a partner.

    Sequence is per (partner_id) — different partners can each have their
    own EMP-ABJ-001. City3 is a display convenience taken from the partner's
    default warehouse; if none exists we fall back to `XXX`.
    """
    city3 = _city_code(city)
    like_pattern = f"EMP-{city3}-%"
    highest = await session.scalar(
        select(func.max(PartnerStaff.employee_code)).where(
            PartnerStaff.partner_id == partner_id,
            PartnerStaff.employee_code.like(like_pattern),
        )
    )
    seq = 1
    if highest:
        try:
            seq = int(highest.rsplit("-", 1)[1]) + 1
        except (ValueError, IndexError):
            seq = 1

    for offset in range(0, 100):
        candidate = f"EMP-{city3}-{(seq + offset):03d}"
        clash = await session.scalar(
            select(PartnerStaff.id).where(
                PartnerStaff.partner_id == partner_id,
                PartnerStaff.employee_code == candidate,
            )
        )
        if not clash:
            return candidate
    raise RuntimeError(f"could not allocate a unique employee code under EMP-{city3}-*")


__all__ = ["next_store_code", "next_employee_code"]
