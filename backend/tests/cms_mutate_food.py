# Helper: apply/restore FOOD CI CMS mutations for UI live-sync testing. usage: python cms_mutate_food.py apply|restore
import copy, json, os, sys, requests
B = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
s = requests.Session()
tok = s.post(f"{B}/api/admin/auth/login", json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}).json()["access_token"]
s.headers["Authorization"] = f"Bearer {tok}"
BK = "/tmp/food_backup.json"
U = f"{B}/api/admin/homepage-sections"
KEYS = ("hps_food_ci_040_food_promos", "hps_food_ci_060_food_usps", "hps_food_ci_030_food_featured_restaurants", "hps_food_ci_050_food_cuisines")
items = s.get(U, params={"country": "CI", "module": "food"}).json()["items"]
by = {i["id"]: i for i in items}
if sys.argv[1] == "apply":
    json.dump(items, open(BK, "w"))
    cfg = copy.deepcopy(by["hps_food_ci_040_food_promos"]["config"])
    cfg["banners"][0]["headline_fr"] = "TEST_Promo QA Titre"
    print(s.patch(f"{U}/hps_food_ci_040_food_promos", json={"config": cfg}).status_code)
    print(s.patch(f"{U}/hps_food_ci_060_food_usps", json={"is_enabled": False}).status_code)
    print(s.patch(f"{U}/reorder", json={"items": [{"id": "hps_food_ci_050_food_cuisines", "display_order": 30},
                                                   {"id": "hps_food_ci_030_food_featured_restaurants", "display_order": 50}]}).status_code)
else:
    orig = {i["id"]: i for i in json.load(open(BK))}
    for k in KEYS:
        o = orig[k]
        print(k, s.patch(f"{U}/{k}", json={"config": o["config"], "title": o["title"], "subtitle": o["subtitle"], "is_enabled": o["is_enabled"]}).status_code)
    print(s.patch(f"{U}/reorder", json={"items": [{"id": k, "display_order": orig[k]["display_order"]} for k in KEYS]}).status_code)
    now = {i["id"]: i for i in s.get(U, params={"country": "CI", "module": "food"}).json()["items"]}
    F = ("config", "title", "subtitle", "is_enabled", "display_order")
    diff = [k for k in orig if {x: orig[k].get(x) for x in F} != {x: now.get(k, {}).get(x) for x in F}]
    print("DIFF", diff, "extra", [k for k in now if k not in orig])
