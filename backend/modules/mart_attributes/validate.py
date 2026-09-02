"""Attribute value validation + coercion used at the supplier submit
boundary and admin approval boundary.

Given a resolved attribute list (see resolver.py) and a dict of raw values
posted by the supplier, returns:
  * a `values_snapshot` — dict written to `mart_products.details`. Each key
    is the attribute's IMMUTABLE key; each value is a small dict:
        {"v": <coerced value>, "label": <attribute.name at submit time>}
    The label snapshot means a later attribute rename never orphans this
    historical row.
  * `errors` — list[{field, code, message}] for missing-required or bad-
    type values.

Fixing_Prompt v6 §8 — never destroy existing product data.
"""
from __future__ import annotations
from datetime import date, datetime
from typing import Any


def _coerce(kind: str, raw: Any) -> tuple[bool, Any]:
    if raw is None or raw == "":
        return True, None
    if kind in ("short_text", "long_text"):
        return True, str(raw)
    if kind == "integer":
        try:
            return True, int(raw)
        except (TypeError, ValueError):
            return False, None
    if kind == "decimal":
        try:
            return True, float(raw)
        except (TypeError, ValueError):
            return False, None
    if kind == "boolean":
        if isinstance(raw, bool):
            return True, raw
        s = str(raw).strip().lower()
        if s in ("true", "1", "yes", "y", "on"):
            return True, True
        if s in ("false", "0", "no", "n", "off"):
            return True, False
        return False, None
    if kind == "date":
        if isinstance(raw, (date, datetime)):
            return True, raw.isoformat() if isinstance(raw, datetime) else raw.isoformat()
        try:
            return True, datetime.fromisoformat(str(raw)).date().isoformat()
        except Exception:
            return False, None
    if kind == "select":
        return True, str(raw)   # membership check happens against option list
    if kind == "multi_select":
        if isinstance(raw, list):
            return True, [str(x) for x in raw]
        if isinstance(raw, str):
            return True, [s.strip() for s in raw.split(",") if s.strip()]
        return False, None
    # Unknown type — pass through untouched so future types don't error.
    return True, raw


def validate_and_snapshot(resolved: list[dict], raw_values: dict) -> tuple[dict, list[dict]]:
    """Return (values_snapshot, errors).

    * `raw_values` maps attribute.key -> raw user input.
    * Only attributes present in `resolved` are considered — extras are
      dropped so a stale supplier form can't inject arbitrary keys.
    """
    snapshot: dict[str, dict] = {}
    errors: list[dict] = []
    for attr in resolved:
        key = attr["key"]
        raw = raw_values.get(key)
        ok, coerced = _coerce(attr["type"], raw)
        if not ok:
            errors.append({"field": key, "code": "invalid_type",
                           "message": f"Expected {attr['type']}"})
            continue
        if attr.get("is_required") and (coerced is None or coerced == [] or coerced == ""):
            errors.append({"field": key, "code": "required",
                           "message": f"{attr['name']} is required"})
            continue
        if coerced is None:
            continue
        # For select / multi_select, verify value membership.
        if attr["type"] == "select":
            allowed = {o["value"] for o in attr.get("options", [])}
            if allowed and coerced not in allowed:
                errors.append({"field": key, "code": "invalid_option",
                               "message": f"'{coerced}' not in allowed options"})
                continue
        if attr["type"] == "multi_select":
            allowed = {o["value"] for o in attr.get("options", [])}
            if allowed:
                bad = [c for c in coerced if c not in allowed]
                if bad:
                    errors.append({"field": key, "code": "invalid_option",
                                   "message": f"Options not allowed: {bad}"})
                    continue
        snapshot[key] = {"v": coerced, "label": attr["name"], "type": attr["type"]}
    return snapshot, errors
