# Helper: apply/restore SHOP CI CMS mutations for UI live-sync testing. usage: python cms_mutate.py apply|restore
import copy, json, os, sys, requests
B = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
s = requests.Session()
tok = s.post(f"{B}/api/admin/auth/login", json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}).json()["access_token"]
s.headers["Authorization"] = f"Bearer {tok}"
H = "hps_ci_shop_010_hero"; BK = "/tmp/hero_backup.json"
items = s.get(f"{B}/api/admin/homepage-sections", params={"country": "CI", "module": "shop"}).json()["items"]
hero = next(i for i in items if i["id"] == H)
if sys.argv[1] == "apply":
    json.dump(hero, open(BK, "w"))
    cfg = copy.deepcopy(hero["config"])
    cfg["slides"][0]["headline_fr"] = "TEST_Bannière QA FR"
    cfg["slides"][0]["image"] = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1600"
    cfg["slides"][0]["image_mobile"] = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800"
    print(s.patch(f"{B}/api/admin/homepage-sections/{H}", json={"config": cfg}).status_code)
    print(s.patch(f"{B}/api/admin/homepage-sections/reorder", json={"items": [
        {"id": "hps_ci_shop_020_category_grid", "display_order": 30}, {"id": "hps_ci_shop_030_fresh_drops", "display_order": 20}]}).status_code)
    print(s.patch(f"{B}/api/admin/homepage-sections/hps_ci_shop_040_under_10k", json={"is_enabled": False}).status_code)
    r = s.post(f"{B}/api/admin/homepage-sections", json={"country": "CI", "module": "shop", "section_type": "promotional_banner",
        "display_order": 15, "title": "TEST_Promo QA", "subtitle": "qa", "config": {"title_fr": "TEST_Promo QA FR", "cta_label": "Go", "cta_label_fr": "Aller", "cta_link": "/shop"}})
    print(r.status_code, r.json()["id"])
else:
    orig = json.load(open(BK))
    print(s.patch(f"{B}/api/admin/homepage-sections/{H}", json={"config": orig["config"], "title": orig["title"]}).status_code)
    print(s.patch(f"{B}/api/admin/homepage-sections/reorder", json={"items": [
        {"id": "hps_ci_shop_020_category_grid", "display_order": 20}, {"id": "hps_ci_shop_030_fresh_drops", "display_order": 30}]}).status_code)
    print(s.patch(f"{B}/api/admin/homepage-sections/hps_ci_shop_040_under_10k", json={"is_enabled": True}).status_code)
    for i in items:
        if (i.get("title") or "").startswith("TEST_"):
            print("del", i["id"], s.delete(f"{B}/api/admin/homepage-sections/{i['id']}").status_code)
