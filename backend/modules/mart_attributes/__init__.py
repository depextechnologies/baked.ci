"""MARTbaked — Dynamic attribute engine.

Public API (customer + supplier + admin) for the dynamic category attribute
system. The engine is split into:

  * routes.py    — FastAPI routers (admin + public).
  * resolver.py  — reads the assignments table with inheritance + overrides.
  * validate.py  — type coercion + required-field checks used by the
                   supplier submission and admin approval flows.

Fixing_Prompt v6 (2026-02-28).
"""
