"""SENDbakēd multi-stop lifecycle helpers.

Owns two concerns:
  1) Enriching the customer-supplied `stops[]` payload at booking creation
     time with per-leg progression state and a per-drop delivery PIN.
  2) Advancing a single leg (pickup or drop) for a specific stop sequence,
     enforcing ordered execution and PIN verification, and cascading the
     result to the overall booking status.

The `stops[]` JSONB is the ONLY source of truth for driver-side execution —
no parallel model, no shadow table.

Enriched shape (per stop, keyed by 1-based `sequence`):
  {
    "sequence": 1,
    "pickup": {
      "lat": .., "lng": .., "address": ..,
      "status": "pending" | "completed",
      "completed_at": iso8601 | null
    },
    "drop": {
      "lat": .., "lng": .., "address": ..,
      "receiver_name": .., "receiver_phone": ..,
      "delivery_pin": "1234",       # NEVER surfaced to the customer API
      "status": "pending" | "completed",
      "completed_at": iso8601 | null
    }
  }
"""
from __future__ import annotations
import logging
import secrets
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy.orm.attributes import flag_modified

from core.providers.sms_provider import send_sms

logger = logging.getLogger("baked.express.multi_stop")


def _pin() -> str:
    """4-digit human-readable PIN (allow leading zeros)."""
    return f"{secrets.randbelow(10_000):04d}"


def _addr_of(entry: dict) -> str:
    if not isinstance(entry, dict):
        return ""
    return (
        entry.get("formatted_address")
        or entry.get("address")
        or entry.get("line1")
        or ""
    )


def enrich_stops(raw_stops: list[dict]) -> list[dict]:
    """Normalise + enrich the raw customer-supplied stops payload.

    Accepts the shape the wizard sends today
    (`{pickup:{lat,lng,formatted_address,...}, drop:{lat,lng,...},
      receiver:{name,phone}?}` per stop) and adds `sequence`, per-leg
    `status/completed_at`, and a `delivery_pin` per drop.
    """
    enriched: list[dict] = []
    for idx, stop in enumerate(raw_stops or [], start=1):
        pickup_src = (stop or {}).get("pickup") or {}
        drop_src = (stop or {}).get("drop") or {}
        receiver_src = (stop or {}).get("receiver") or {}
        enriched.append({
            "sequence": idx,
            "pickup": {
                "lat": pickup_src.get("lat") or pickup_src.get("latitude"),
                "lng": pickup_src.get("lng") or pickup_src.get("longitude"),
                "address": _addr_of(pickup_src),
                "building": pickup_src.get("building"),
                "landmark": pickup_src.get("landmark"),
                "status": "pending",
                "completed_at": None,
            },
            "drop": {
                "lat": drop_src.get("lat") or drop_src.get("latitude"),
                "lng": drop_src.get("lng") or drop_src.get("longitude"),
                "address": _addr_of(drop_src),
                "building": drop_src.get("building"),
                "landmark": drop_src.get("landmark"),
                "receiver_name": receiver_src.get("name") or drop_src.get("receiver_name"),
                "receiver_phone": receiver_src.get("phone") or drop_src.get("receiver_phone"),
                "delivery_pin": _pin(),
                "status": "pending",
                "completed_at": None,
            },
        })
    return enriched


def strip_pins(stops: Optional[list[dict]]) -> Optional[list[dict]]:
    """Return a shallow-copied stops list with `delivery_pin` scrubbed —
    used before serialising the booking to the customer API."""
    if not stops:
        return stops
    out: list[dict] = []
    for s in stops:
        s = dict(s)
        drop = dict(s.get("drop") or {})
        drop.pop("delivery_pin", None)
        s["drop"] = drop
        out.append(s)
    return out


async def dispatch_delivery_pins(booking) -> None:
    """Best-effort SMS delivery of the per-drop delivery PIN to each
    receiver. Fire-and-forget: errors are logged, never raised.

    The message body includes the booking ref, shipment number, PIN, and
    a short instruction. Customer-facing language is French-first per SEND
    conventions.
    """
    if not booking.stops:
        return
    total = len(booking.stops)
    for stop in booking.stops:
        drop = stop.get("drop") or {}
        phone = drop.get("receiver_phone")
        pin = drop.get("delivery_pin")
        if not phone or not pin:
            continue
        seq = stop.get("sequence")
        # French-first / English-second — no ambiguous translation.
        if total > 1:
            body = (
                f"SENDbakēd — Colis {seq}/{total} (Réf {booking.ref}).\n"
                f"Code de livraison: {pin}\n"
                f"Communiquez-le au livreur uniquement à la remise du colis.\n"
                f"— Delivery PIN: {pin} (share only at handover)."
            )
        else:
            body = (
                f"SENDbakēd — Réf {booking.ref}.\n"
                f"Code de livraison: {pin}\n"
                f"Communiquez-le au livreur uniquement à la remise du colis.\n"
                f"— Delivery PIN: {pin} (share only at handover)."
            )
        try:
            await send_sms(phone, body, tag=f"send.delivery_pin.{booking.id}.{seq}")
        except Exception as e:  # noqa: BLE001
            logger.warning("delivery_pin.sms_failed booking=%s seq=%s err=%s", booking.id, seq, e)


# --------------------------------------------------------------------------- #
# Progression                                                                 #
# --------------------------------------------------------------------------- #

class MultiStopError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _first_incomplete_leg(stops: list[dict]) -> Optional[tuple[int, str]]:
    """Return (sequence, leg) of the first leg still `pending`, in
    strictly-ordered execution (pickup 1 → drop 1 → pickup 2 → drop 2 → …)."""
    for stop in stops:
        seq = int(stop.get("sequence") or 0)
        for leg in ("pickup", "drop"):
            if (stop.get(leg) or {}).get("status") != "completed":
                return seq, leg
    return None


def summarise_progress(stops: Optional[list[dict]]) -> dict:
    if not stops:
        return {"total": 0, "completed": 0, "current": None}
    total = 0
    completed = 0
    for stop in stops:
        for leg in ("pickup", "drop"):
            entry = stop.get(leg) or {}
            if entry.get("lat") is not None or entry.get("address"):
                total += 1
                if entry.get("status") == "completed":
                    completed += 1
    curr = _first_incomplete_leg(stops)
    return {
        "total": total,
        "completed": completed,
        "current": {"sequence": curr[0], "leg": curr[1]} if curr else None,
    }


def advance_stop_leg(
    booking,
    *,
    sequence: int,
    leg: str,
    delivery_pin: Optional[str] = None,
) -> tuple[dict, str]:
    """Mutate `booking.stops` to mark `(sequence, leg)` complete and return
    the (updated_stop, new_overall_status).

    Enforces:
      * booking is a multi-stop booking (`stops` present)
      * sequence + leg exist
      * this leg is NOT already completed
      * every prior pickup/drop in strict order is completed
      * PIN required + valid for `leg == 'drop'`

    Overall status cascade:
      * first pickup completion            → 'picked_up'
      * any subsequent leg (not final drop) → 'in_transit'
      * final drop completion               → 'delivered'
    """
    if not booking.stops:
        raise MultiStopError("not_multi_stop", "Booking has no multi-stop payload.")
    if leg not in ("pickup", "drop"):
        raise MultiStopError("invalid_leg", "leg must be 'pickup' or 'drop'.")

    stops = booking.stops
    target = next((s for s in stops if int(s.get("sequence") or 0) == int(sequence)), None)
    if target is None:
        raise MultiStopError("stop_not_found", f"Stop sequence {sequence} not found.")

    entry = target.get(leg) or {}
    if entry.get("status") == "completed":
        raise MultiStopError("leg_already_completed", f"{leg.capitalize()} {sequence} is already completed.")

    # Strict ordering — the leg being confirmed must be the first pending one.
    curr = _first_incomplete_leg(stops)
    if not curr or curr != (int(sequence), leg):
        expected = (
            f"pickup {curr[0]}" if curr and curr[1] == "pickup"
            else (f"drop {curr[0]}" if curr else "none")
        )
        raise MultiStopError(
            "out_of_sequence",
            f"Cannot confirm {leg} {sequence} — next required checkpoint is {expected}.",
        )

    if leg == "drop":
        expected_pin = str(entry.get("delivery_pin") or "").strip()
        supplied = (delivery_pin or "").strip()
        if not expected_pin:
            raise MultiStopError("pin_missing_server", "Delivery PIN is missing on this stop.")
        if supplied != expected_pin:
            raise MultiStopError("pin_invalid", "Delivery PIN is invalid.")

    entry["status"] = "completed"
    entry["completed_at"] = datetime.now(timezone.utc).isoformat()
    target[leg] = entry
    booking.stops = stops
    try:
        flag_modified(booking, "stops")
    except Exception:
        # Non-mapped (test double) — mutation is still visible via booking.stops.
        pass

    # Cascade overall booking status.
    remaining = _first_incomplete_leg(stops)
    total_legs = sum(
        1 for s in stops for L in ("pickup", "drop")
        if (s.get(L) or {}).get("address") or (s.get(L) or {}).get("lat") is not None
    )
    completed_legs = sum(
        1 for s in stops for L in ("pickup", "drop")
        if (s.get(L) or {}).get("status") == "completed"
    )
    if remaining is None:
        new_status = "delivered"
    elif completed_legs == 1 and leg == "pickup" and sequence == 1:
        new_status = "picked_up"
    else:
        new_status = "in_transit"
    return target, new_status
