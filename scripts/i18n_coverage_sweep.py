#!/usr/bin/env python3
"""i18n coverage sweep — Phase C launch report.

Scans customer-facing JSX files for hardcoded English text that isn't wired
through `useTranslation()` / `t()`. Reports coverage as:
  files_touched, total_hardcoded_strings, top offenders, per-file breakdown.

Heuristics (kept conservative to minimise false positives):
  * Only inspects React text nodes between `>` and `<`, JSX attributes
    (title/placeholder/aria-label/alt), and toast/alert string literals.
  * Ignores strings that:
      - contain only digits, punctuation, one-letter words, emojis, CSS
        tokens, testids, URLs, currency codes;
      - are already wrapped by `t(` or `T(` calls;
      - are entirely lowercase snake/dot-case (likely CSS classes / testids);
      - contain French diacritics (é/è/ê/à/ç/ù/ô/î/â) — already localised.
  * Includes only strings ≥ 2 real words (so isolated brand names, SKUs,
    and single icons don't inflate the count).
"""
import os
import re
import sys
from pathlib import Path
from collections import defaultdict, Counter

ROOTS = [
    Path("/app/frontend/src/apps/customer"),
    Path("/app/frontend/src/pages"),
    Path("/app/frontend/src/components/mart"),
    Path("/app/frontend/src/components/mobile"),
    Path("/app/frontend/src/components/layout"),
    Path("/app/frontend/src/components/profile"),
    Path("/app/frontend/src/components/address"),
    Path("/app/frontend/src/components/checkout"),
    Path("/app/frontend/src/components/express"),
]
EXCLUDE_DIRS = {"node_modules", "__tests__", "shopbaked", "admin", "martbaked-sellers",
                "partner-landing", "driver-app", "seller-portal"}

# JSX text between > and <, plus common attrs.
TEXT_NODE = re.compile(r">([^<>{}\n]{4,120})<")
ATTR_STR = re.compile(r'(?:title|placeholder|aria-label|alt|content|label)\s*=\s*"([^"{}\n]{4,120})"')
TOAST_STR = re.compile(r'toast\.(?:success|error|info|warning|loading)\s*\(\s*"([^"]{4,200})"')

FRENCH_DIACRITICS = re.compile(r"[éèêàçùôîâûïüœÉÈÊÀÇÙÔÎÂÛÏÜŒ]")
LOOKS_LIKE_CODE = re.compile(r"^[a-z0-9_\-./#]+$")  # css/testid/urls
STARTS_WITH_ANGULAR = re.compile(r"^[<>{}$]")
HAS_TWO_WORDS = re.compile(r"\b[A-Za-z]{2,}\b[^A-Za-z\n]+\b[A-Za-z]{2,}\b")

FILE_GLOBS = ("*.jsx", "*.js")


def keep(s: str) -> bool:
    s = s.strip()
    if not s or len(s) < 4:
        return False
    if s.startswith(("http", "data:", "/", "#", "{", "$", "&")):
        return False
    if FRENCH_DIACRITICS.search(s):
        return False
    if LOOKS_LIKE_CODE.match(s):
        return False
    if s.upper() == s and any(c.isalpha() for c in s):
        # Fully-uppercase — likely brand or abbreviation.
        return False
    if not HAS_TWO_WORDS.search(s):
        return False
    # Ignore common code-y tokens
    if any(needle in s for needle in ("className", "data-testid", "onClick", "PropTypes",
                                     ".jpg", ".png", ".svg", "http", "://")):
        return False
    return True


def scan_file(fp: Path):
    src = fp.read_text(errors="replace")
    hits = []
    for regex in (TEXT_NODE, ATTR_STR, TOAST_STR):
        for m in regex.finditer(src):
            frag = m.group(1)
            if keep(frag):
                # Skip if the fragment appears inside a `t("…")` call in a nearby span.
                start = max(0, m.start() - 60)
                context = src[start:m.end() + 5]
                if re.search(r"\bt\s*\([^)]{0,40}\)", context):
                    continue
                if "useTranslation" in src[:200]:  # file uses i18n already — still count residuals
                    pass
                hits.append(frag)
    return hits


def main():
    by_file = {}
    total = 0
    all_strings = Counter()
    for root in ROOTS:
        for fp in root.rglob("*"):
            if not fp.is_file():
                continue
            if fp.suffix not in (".jsx", ".js"):
                continue
            if any(d in fp.parts for d in EXCLUDE_DIRS):
                continue
            hits = scan_file(fp)
            if hits:
                rel = str(fp.relative_to("/app/frontend/src"))
                by_file[rel] = hits
                total += len(hits)
                for h in hits:
                    all_strings[h.strip()] += 1

    print("=" * 70)
    print(f"COVERAGE SWEEP — customer-facing JSX")
    print(f"Files scanned:   {sum(1 for r in ROOTS for _ in r.rglob('*.jsx'))}")
    print(f"Files with hits: {len(by_file)}")
    print(f"Total hardcoded English strings: {total}")
    print("=" * 70)

    print("\nTOP 20 MOST-REPEATED STRINGS:")
    for s, n in all_strings.most_common(20):
        print(f"  {n:3d} × {s[:80]!r}")

    print("\nTOP 15 FILES BY OFFENDER COUNT:")
    ranked = sorted(by_file.items(), key=lambda kv: -len(kv[1]))
    for fp, hits in ranked[:15]:
        print(f"  {len(hits):3d}  {fp}")

    print("\nSAMPLE STRINGS BY FILE (first 3 files):")
    for fp, hits in ranked[:3]:
        print(f"\n  {fp}:")
        for h in list(dict.fromkeys(hits))[:6]:
            print(f"     - {h!r}")


if __name__ == "__main__":
    main()
