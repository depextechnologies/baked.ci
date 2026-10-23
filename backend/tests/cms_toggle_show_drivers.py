# Helper: toggle send_map_hero.config.show_drivers for a country. usage: python cms_toggle_show_drivers.py IN off|on|show
import os, sys, requests
B = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
s = requests.Session()
tok = s.post(f"{B}/api/admin/auth/login", json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}).json()["access_token"]
s.headers["Authorization"] = f"Bearer {tok}"
U = f"{B}/api/admin/homepage-sections"
cc, mode = sys.argv[1], sys.argv[2]
items = s.get(U, params={"country": cc, "module": "express"}).json()["items"]
maps = [i for i in items if i["section_type"] == "send_map_hero"]
for m in maps:
    print(m["id"], m["country"] if "country" in m else "", m["config"])
    if mode in ("off", "on"):
        cfg = dict(m["config"]); cfg["show_drivers"] = (mode == "on")
        print("patch", s.patch(f"{U}/{m['id']}", json={"config": cfg}).status_code)
r = requests.get(f"{B}/api/homepage", params={"country": cc, "module": "express"}).json()
print([(x["id"], x["config"].get("show_drivers")) for x in r["sections"] if x["section_type"] == "send_map_hero"])
