# Helper: apply/restore MART CI CMS mutations for UI live-sync testing. usage: python cms_mutate_mart.py apply|restore
import copy, json, os, sys, requests
B = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
s = requests.Session()
tok = s.post(f"{B}/api/admin/auth/login", json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}).json()["access_token"]
s.headers["Authorization"] = f"Bearer {tok}"
BK = "/tmp/mart_backup.json"
U = f"{B}/api/admin/homepage-sections"
items = s.get(U, params={"country": "CI", "module": "mart"}).json()["items"]
by = {i["id"]: i for i in items}
if sys.argv[1] == "apply":
    json.dump(items, open(BK, "w"))
    cfg = copy.deepcopy(by["hps_ci_010_hero"]["config"])
    cfg["background_image"] = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1600"
    print(s.patch(f"{U}/hps_ci_010_hero", json={"config": cfg}).status_code)
    print(s.patch(f"{U}/hps_ci_090_app_promotion", json={"title": "TEST_App QA Titre"}).status_code)
    print(s.patch(f"{U}/reorder", json={"items": [{"id": "hps_ci_040_promotional_banner", "display_order": 30},
                                                   {"id": "hps_ci_030_category_grid", "display_order": 40}]}).status_code)
    print(s.patch(f"{U}/hps_ci_110_trust_strip", json={"is_enabled": False}).status_code)
else:
    orig = {i["id"]: i for i in json.load(open(BK))}
    for k in ("hps_ci_010_hero", "hps_ci_090_app_promotion", "hps_ci_110_trust_strip", "hps_ci_030_category_grid", "hps_ci_040_promotional_banner"):
        o = orig[k]
        print(k, s.patch(f"{U}/{k}", json={"config": o["config"], "title": o["title"], "subtitle": o["subtitle"], "is_enabled": o["is_enabled"]}).status_code)
    print(s.patch(f"{U}/reorder", json={"items": [{"id": k, "display_order": orig[k]["display_order"]}
                                                   for k in ("hps_ci_030_category_grid", "hps_ci_040_promotional_banner")]}).status_code)
    now = {i["id"]: i for i in s.get(U, params={"country": "CI", "module": "mart"}).json()["items"]}
    diff = [k for k in orig if {x: orig[k][x] for x in ("config", "title", "subtitle", "is_enabled", "display_order")} !=
            {x: now.get(k, {}).get(x) for x in ("config", "title", "subtitle", "is_enabled", "display_order")}]
    print("DIFF", diff, "extra", [k for k in now if k not in orig])
