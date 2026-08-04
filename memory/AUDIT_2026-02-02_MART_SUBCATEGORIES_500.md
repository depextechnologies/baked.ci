# P0 MART Category HTTP 500 — Fix & Regression Audit

**Reported:** Fixing_Prompt.docx — "MARTbakēd Category API Returning HTTP 500 After PostgreSQL Migration"
**Fixed:** 2026-02-02
**Status:** ✅ Resolved and platform-wide regression audit clean

---

## 1. Exact failing endpoint (identified from live traffic)

```
GET /api/mart/subcategories?country=CI&category=fruits-vegetables → HTTP 500
```

Confirmed from three sources:
- `/var/log/supervisor/backend.out.log` (three separate 500 responses to the same path from different client IPs)
- Browser Network tab (frontend calling `getCategoryDetail(slug)` triggers this)
- Live curl reproduction

## 2. Complete backend stack trace (from `/var/log/supervisor/backend.err.log`)

```
File "/root/.venv/lib/python3.11/site-packages/fastapi/routing.py", line 191, in run_endpoint_function
    return await dependant.call(**values)
File "/app/backend/modules/mart/routes.py", line 46, in list_subcategories
    .where(MartSubcategory.country == country.upper(), MartSubcategory.category_slug == category)
                                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AttributeError: type object 'MartSubcategory' has no attribute 'category_slug'
```

## 3. Root cause

The ORM route referenced a **column that does not exist on the model**.

- `MartSubcategory` (defined at `/app/backend/core/models/mart.py:42-58`) links to its parent through a foreign key `category_id → mart_categories.id`. **There is no `category_slug` column** on `mart_subcategories` — that denormalised column only exists on `MartProduct`.
- The route was written as if the parent slug was denormalised on the subcategory row. Post-PG migration nothing existed to reject the query at import time (Python `getattr` on a missing SQLAlchemy attribute is `AttributeError` at runtime, not startup).
- The `@router.get("/mart/subcategories")` handler crashes every request → HTTP 500 → frontend `AxiosError` on the category detail page.

## 4. Fix applied

**File:** `/app/backend/modules/mart/routes.py:38-63`
**Change:** join through `MartCategory` and filter on the real column `MartCategory.slug`.

```python
select(MartSubcategory)
    .join(MartCategory, MartCategory.id == MartSubcategory.category_id)
    .where(
        MartSubcategory.country == country.upper(),
        MartCategory.slug == category,
    )
    .order_by(MartSubcategory.order)
```

No schema or migration change was needed — the FK was correct all along, only the query was wrong.

## 5. Verification — every MART endpoint

| # | Endpoint | HTTP | Notes |
|---|---|---|---|
| 1 | `GET /api/mart/categories?country=CI` | 200 | 9 categories |
| 2 | `GET /api/mart/subcategories?country=CI&category=fruits-vegetables` | 200 | 5 subcategories (was 500) |
| 3 | `GET /api/mart/subcategories?country=CI&category=dairy-eggs` | 200 | |
| 4 | `GET /api/mart/subcategories?country=CI&category=snacks` | 200 | |
| 5 | `GET /api/mart/subcategories?country=CI&category=beverages` | 200 | |
| 6 | `GET /api/mart/subcategories?country=CI&category=bakery` | 200 | |
| 7 | `GET /api/mart/subcategories?country=CI&category=household` | 200 | |
| 8 | `GET /api/mart/products?country=CI&limit=5` | 200 | |
| 9 | `GET /api/mart/products?country=CI&category=fruits-vegetables&limit=100` | 200 | 25 products |
| 10 | `GET /api/mart/products/{id}` | 200 | Product Details |
| 11 | `GET /api/mart/products?country=CI&search=banane` | 200 | Search — 1 hit |
| 12 | `GET /api/mart/offers?country=CI` | 200 | |
| 13 | `GET /api/mart/stores?country=CI` | 200 | |
| 14 | `GET /api/mart/delivery-slots?country=CI` | 200 | |
| 15 | `GET /api/mart/payment-methods?country=CI` | 200 | |

## 6. Platform-wide regression audit — every other module

| Endpoint | HTTP | Notes |
|---|---|---|
| `GET /api/health` | 200 | `db: up` |
| `GET /api/config/countries` | 200 | CI + LR |
| `GET /api/config/modules?country=CI` | 200 | 6 modules |
| `GET /api/express/vehicles?country=CI` | 200 | 5 vehicles |
| `GET /api/express/package-types?country=CI` | 200 | 6 |
| `GET /api/express/weight-tiers?country=CI` | 200 | tiers |
| `GET /api/express/movers/categories?country=CI` | 200 | 6 |
| `GET /api/express/movers/items?country=CI` | 200 | 54 |
| `GET /api/express/movers/move-types?country=CI` | 200 | |
| `GET /api/express/movers/time-slots?country=CI` | 200 | |
| `GET /api/express/delivery-preferences?country=CI` | 200 | |
| `POST /api/auth/otp/request` | 200 | Dev-code returned |
| `POST /api/auth/google/verify` | 401 (correctly) | Rejects bad codes cleanly |
| `POST /api/admin/auth/login` | 200 | JWT issued for `depexopenai@gmail.com` |

Similar `AttributeError: no attribute 'x'` traps were grepped for across all modules. None found.

## 7. Frontend screenshot proof

`/categories/fruits-vegetables` renders end-to-end:
- Left rail: **Fresh Vegetables**, Fresh Fruits, Mangoes & Melons, Tropical, Exotics
- Grid: **6 products** — Pomme de Terre (1000 CFA, 18% OFF), Oignon Rouge (900 CFA), Tomates Fraîches (1200 CFA, 20% OFF), Carotte (700 CFA, 22% OFF), Poivron Vert (1300 CFA), Ail Frais
- Every image, price, discount badge, `+Add` button renders correctly
- Playwright hooked `page.on("response")` and confirmed **all three API calls returned 200** (was previously 500 on `/subcategories`)

## 8. Deliverables checklist (from docx)

| Deliverable | Status |
|---|---|
| Exact API that failed | ✅ `GET /api/mart/subcategories?country=CI&category=fruits-vegetables` |
| Complete backend stack trace | ✅ Section 2 above |
| Root cause analysis | ✅ Section 3 |
| SQL/query fix applied | ✅ Section 4 (join through `MartCategory` on real FK) |
| Database/schema changes | ✅ None needed — schema was correct, only the query was wrong |
| Confirmation all MART endpoints 200 | ✅ 15/15 pass |
| Screenshots + API responses | ✅ Section 5–7 |

## 9. Files changed

- `/app/backend/modules/mart/routes.py` — one function (`list_subcategories`) rewritten to join through `MartCategory`.

No schema change, no migration, no seed change.

## 10. Follow-ups worth doing (not blocking)

- Add a lightweight integration test in `/app/backend/tests/` that hits every MART route in a loop and fails CI on any non-200 — this exact bug class (missing column referenced in a select) would have been caught pre-merge with 20 lines of pytest.
- The Alembic `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` warnings in the PG log come from uvicorn's reload spawning two workers that race on `alembic upgrade head`. Benign, but worth silencing by moving the upgrade into `postgres_launcher.sh` (one caller, one lock).
