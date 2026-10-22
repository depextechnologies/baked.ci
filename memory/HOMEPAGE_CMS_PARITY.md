# Homepage parity & unified CMS — audit + contract (2026-06)

## Shared contract (website + Android + iOS)
- `GET /api/homepage?country=CI&module=<mart|food|shop|express>` → `{country, module, version, updated_at, sections[]}`
  - section: `{id, country, module, section_type, title, subtitle, config, display_order, is_enabled}` (enabled only, ordered)
  - i18n: EN in base field, FR in `<key>_fr` (top-level title/subtitle FR in `config.title_fr/subtitle_fr`)
  - responsive assets: `image` + optional `image_tablet` (<1024) / `image_mobile` (<768); hero legacy `mobile_background_image`
  - `Cache-Control: no-cache`
- `GET /api/homepage/version?country&module` → `{version}` (hash of id:order:updated_at; changes on edit/toggle/reorder/create/delete)
- Admin (existing): `/api/admin/homepage-sections` list/create/patch/delete/reorder/uploads (Super Admin Homepage Management UI).

## Native registry (`/app/mobile/src/components/cms/registry.tsx`)
| section_type | Native component |
|---|---|
| hero | HeroCarousel (slides, eyebrow, badge, CTAs, dots, 16:10 phone / 16:9 tablet) |
| category_grid | CategoryGrid (3/4/6 cols, catalogue names + sub-category counts) |
| product_carousel | ProductCarousel (filter=category/new, 2/3/4 per screen, add-to-cart) |
| promotional_banner | PromoBanner |
| banner_trio | BannerTrio |
| brand_carousel | BrandRow |
| cta_strip | CtaStrip |
Unknown types render nothing (same as website). Sync: cache-first (AsyncStorage `hp_<module>_<cc>`), refetch on module entry, version check on app foreground, pull-to-refresh, offline banner with cached content.

## Website audit
| Module | Website home | CMS status | Sections (CI) |
|---|---|---|---|
| SHOP | apps/shopbaked/pages/ShopHome.jsx | 100% CMS | hero, category_grid, product_carousel, promotional_banner, brand_carousel |
| MART | pages/ConfigHomepage.jsx | 100% CMS (trust strip migrated) | hero, category_grid, promotional_banner, product_carousel, banner_trio, product_carousel, brand_carousel, app_promotion, cta_strip, trust_strip |
| FOOD | apps/foodbaked/pages/FoodHome.jsx | CMS (module=food) + live restaurant data (15 km rules) | food_hero, food_categories, food_top_brands, food_featured_restaurants, food_promos, food_cuisines, food_usps, food_testimonial |
| SEND | pages/express/ExpressHome.jsx | HARDCODED — 0 CMS rows | to migrate next round |

## Status
- SHOP native: DONE (iteration_122 — live sync tests 1-5, 7-10 pass).
- MART native: DONE (iteration_123). Module-specific registry `MODULE_REGISTRY.mart` (components/cms/mart/*) mirrors ConfigHomepage.jsx: hero + country delivery panel, category grid, promo, 2 product carousels (/mart/products), banner row, brands, app_promotion (stores + QR + phone mockup on tablet), cta_strip, trust_strip.
- Migrated: website hardcoded TrustStrip → CMS `trust_strip` (hps_<cc>_110_trust_strip, bilingual items; admin editor). MART category/banner images added in CMS (both clients).
- FOOD native: DONE (iteration_124). `MODULE_REGISTRY.food` (components/cms/food/*) mirrors FoodHome.jsx: hero (mode pills, favourites, no-address banner) first, categories, top brands (/food/brands/top), featured (/food/home — backend 15 km + mode eligibility), promos, cuisines (→ discover?cuisines=), usps, testimonials. Shared feed via FoodDataProvider. Content fixes: usps title_en, african cuisine + Grill House images.
- Next: SEND (website ExpressHome is hardcoded → migrate into CMS, then native).
