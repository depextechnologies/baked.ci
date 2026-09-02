"""E.164 normalisation used across auth / supplier / SHOP-SMS flows.

Historically each entry point had its own `_e164()` that naively concatenated
`country_code` with the phone digits. When the client sent `country_code='CI'`
(ISO 3166-1 alpha-2) instead of `+225` (dial code) the stored phone became
`+CI2250700...` — invalid E.164, rejected by Twilio in prod.

This helper accepts either form:
  * ISO 3166-1 alpha-2 (`CI`, `LR`, `IN`, `US`)  → maps via table below
  * Dial code with or without `+` (`225`, `+225`) → used as-is

If the incoming phone already starts with `+` we treat it as fully-qualified
E.164 and ignore the country_code — the client already did the work.
"""
from __future__ import annotations

# Bakēd-supported markets today + a couple of near-term expansion targets so
# ops can add a country without a code change. Extend as the platform ships
# to new regions.
ISO2_TO_DIAL = {
    "CI": "225",   # Côte d'Ivoire
    "LR": "231",   # Liberia
    "GH": "233",   # Ghana
    "NG": "234",   # Nigeria
    "SN": "221",   # Senegal
    "BJ": "229",   # Benin
    "TG": "228",   # Togo
    "BF": "226",   # Burkina Faso
    "ML": "223",   # Mali
    "GN": "224",   # Guinea
    "CM": "237",   # Cameroon
    "IN": "91",    # India
    "US": "1",     # United States
    "GB": "44",    # United Kingdom
    "FR": "33",    # France
    "CA": "1",     # Canada
}


def to_e164(country_code: str, phone: str) -> str:
    """Return a clean E.164 string like `+2250700123456`.

    Rules:
      1. If `phone` starts with `+`, trust the client and only sanitise digits.
      2. Otherwise resolve the dial code from `country_code`:
         a. `+225` / `225` → `225`
         b. `CI`          → lookup `ISO2_TO_DIAL['CI']` → `225`
         c. Unknown       → fall through as-is (bug-visible failure > silent
                            malformed data)
    """
    raw = (phone or "").strip()
    if raw.startswith("+"):
        digits = "".join(ch for ch in raw[1:] if ch.isdigit())
        return f"+{digits}"

    cc = (country_code or "").strip()
    if cc.startswith("+"):
        dial = "".join(ch for ch in cc[1:] if ch.isdigit())
    elif cc.isdigit():
        dial = cc
    else:
        dial = ISO2_TO_DIAL.get(cc.upper(), cc)  # fall through on miss

    digits = "".join(ch for ch in raw if ch.isdigit()).lstrip("0")
    # If the phone digits already start with the dial code (e.g. client
    # accidentally double-prefixes) don't stack it.
    if digits.startswith(dial):
        return f"+{digits}"
    return f"+{dial}{digits}"
