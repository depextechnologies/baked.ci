# Helper: mutate/restore baked homepage (shop row disable + express tagline) for UI CMS test
import json, os, sys, requests
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
tok = requests.post(f"{API}/admin/auth/login", json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}).json()
tok = tok.get("access_token") or tok.get("token")
H = {"Authorization": f"Bearer {tok}"}
items = requests.get(f"{API}/admin/homepage-sections", params={"country": "CI", "module": "baked"}, headers=H).json()["items"]
grid = next(i for i in items if i["section_type"] == "app_module_grid")
shop = next(i for i in items if i["section_type"] == "app_category_row" and i["config"].get("source_module") == "shop")
BK = "/tmp/baked_grid_backup.json"
if sys.argv[1] == "mutate":
    json.dump(grid["config"], open(BK, "w"))
    cfg = json.loads(json.dumps(grid["config"]))
    for it in cfg["items"]:
        if it["module"] == "express":
            it["tagline_fr"] = "TEST Tagline FR"
    print(requests.patch(f"{API}/admin/homepage-sections/{grid['id']}", json={"config": cfg}, headers=H).status_code)
    print(requests.patch(f"{API}/admin/homepage-sections/{shop['id']}", json={"is_enabled": False}, headers=H).status_code)
else:
    print(requests.patch(f"{API}/admin/homepage-sections/{grid['id']}", json={"config": json.load(open(BK))}, headers=H).status_code)
    print(requests.patch(f"{API}/admin/homepage-sections/{shop['id']}", json={"is_enabled": True}, headers=H).status_code)
