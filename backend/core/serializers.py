"""Generic helper for turning ORM rows into JSON-safe dicts for API responses."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import inspect as sa_inspect


def row_to_dict(obj, rename: Optional[dict] = None) -> dict:
    # Iterate the mapper's actual columns (not vars(obj)) so nullable columns
    # that were never explicitly set — e.g. active_booking_id on a freshly
    # created driver — still show up as `null` instead of being silently
    # dropped from the response.
    #
    # Columns still "unloaded" at this point (per SQLAlchemy's identity map)
    # are, with Base.__mapper_args__ eager_defaults=True already fetching
    # every server_default/onupdate column via RETURNING, exactly the ones
    # that were never assigned a value at all — genuinely NULL in the row.
    # Read them as None directly rather than via getattr, which would
    # trigger a synchronous lazy-load and crash (MissingGreenlet) in this
    # async ORM.
    # Use mapper.column_attrs (Python-side attribute names) rather than
    # mapper.columns (raw DB column names) — for columns whose DB name was
    # overridden via mapped_column("db_name", ...) (e.g. AuditLog.metadata_ ->
    # db column "metadata"), those two names differ. getattr(obj, "metadata")
    # would resolve to the inherited SQLAlchemy Base.metadata registry instead
    # of the instance's JSONB value, and encoding that graph recurses forever.
    insp = sa_inspect(obj)
    data = {}
    for attr in insp.mapper.column_attrs:
        key = attr.key
        if key in insp.unloaded:
            value = None
        else:
            value = getattr(obj, key)
        if isinstance(value, Decimal):
            value = float(value)
        elif isinstance(value, (datetime, date)):
            value = value.isoformat()
        data[key] = value
    if rename:
        for old, new in rename.items():
            if old in data:
                data[new] = data.pop(old)
    return data


def customer_to_dict(customer) -> dict:
    return row_to_dict(customer, rename={"referred_by_customer_id": "referred_by"})
