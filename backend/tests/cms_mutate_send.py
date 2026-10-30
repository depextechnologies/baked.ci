# Helper: apply/restore SEND (express) CI CMS mutations for UI live-sync testing. usage: python cms_mutate_send.py apply|restore|show
import copy, json, os, sys, requests
B = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
s = requests.Session()
tok = s.post(f"{B}/api/admin/auth/login", json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}).json()["access_token"]
s.headers["Authorization"] = f"Bearer {tok}"
BK = "/tmp/send_backup.json"
U = f"{B}/api/admin/homepage-sections"
T, P, M, TR = ("hps_send_ci_030_send_service_tiles", "hps_send_ci_020_send_pickup_bar",
               "hps_send_ci_010_send_map_hero", "hps_send_ci_040_send_trust_banner")
KEYS = (M, P, T, TR)
items = s.get(U, params={"country": "CI", "module": "express"}).json()["items"]
by = {i["id"]: i for i in items}
if sys.argv[1] == "apply":
    json.dump(items, open(BK, "w"))
    cfg = copy.deepcopy(by[T]["config"])
    cfg["tiles"][0]["title_fr"] = "TEST_Moto QA"
    for t in cfg["tiles"]:
        if t["key"] == "fresh":
            t["enabled"] = False
    mv = [t for t in cfg["tiles"] if t["key"] == "movers"]
    cfg["tiles"] = mv + [t for t in cfg["tiles"] if t["key"] != "movers"]
    print(s.patch(f"{U}/{T}", json={"config": cfg}).status_code)
    c2 = copy.deepcopy(by[TR]["config"]); c2["text_fr"] = "TEST_Confiance QA"
    print(s.patch(f"{U}/{TR}", json={"config": c2}).status_code)
    print(s.patch(f"{U}/{M}", json={"is_enabled": False}).status_code)
    print(s.patch(f"{U}/reorder", json={"items": [{"id": T, "display_order": 15}]}).status_code)
elif sys.argv[1] == "restore":
    orig = {i["id"]: i for i in json.load(open(BK))}
    for k in KEYS:
        o = orig[k]
        print(k, s.patch(f"{U}/{k}", json={"config": o["config"], "title": o["title"], "subtitle": o["subtitle"], "is_enabled": o["is_enabled"]}).status_code)
    print(s.patch(f"{U}/reorder", json={"items": [{"id": k, "display_order": orig[k]["display_order"]} for k in KEYS]}).status_code)
    now = {i["id"]: i for i in s.get(U, params={"country": "CI", "module": "express"}).json()["items"]}
    F = ("config", "title", "subtitle", "is_enabled", "display_order")
    diff = [k for k in orig if {x: orig[k].get(x) for x in F} != {x: now.get(k, {}).get(x) for x in F}]
    print("DIFF", diff, "extra", [k for k in now if k not in orig])
r = requests.get(f"{B}/api/homepage", params={"country": "CI", "module": "express"}).json()
for x in r["sections"]:
    extra = [(t["key"], t.get("enabled"), t["title_fr"]) for t in x["config"].get("tiles", [])]
    print(x["display_order"], x["id"], x["config"].get("text_fr", ""), extra)
