# Round 3: Edit profile (name/email/photo/phone change) + movers quote currency/time slot + global search relevance
import os
import random
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
OTHER_EMAIL = "qa.profile@test.example"
OTHER_PHONE_LOCAL = "0700000098"  # +225700000098


def _rand_local():
    return "07" + "".join(random.choice("0123456789") for _ in range(8))


def _login(local):
    s = requests.Session()
    r = s.post(f"{API}/auth/otp/request", json={"country_code": "+225", "phone": local}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    v = s.post(f"{API}/auth/otp/verify", json={"challenge_id": d["challenge_id"], "code": d["dev_code"]}, timeout=30)
    assert v.status_code == 200, v.text
    s.headers["Authorization"] = f"Bearer {v.json()['access_token']}"
    return s, v.json()["customer"]


@pytest.fixture(scope="module")
def user():
    local = _rand_local()
    s, c = _login(local)
    yield {"s": s, "c": c, "local": local}
    s.delete(f"{API}/customers/me")  # soft-delete the TEST_ customer this module created


def _code(r):
    d = r.json().get("detail")
    return d.get("code") if isinstance(d, dict) else d


# --- PATCH /customers/me ---
class TestUpdateMe:
    def test_trim_collapse_lowercase(self, user):
        s = user["s"]
        em = f"TEST_R3_{random.randint(1000,99999)}@Example.COM"
        r = s.patch(f"{API}/customers/me", json={"name": "  TEST_Jean   Kouassi  ", "email": f"  {em} "})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_Jean Kouassi"
        assert r.json()["email"] == em.lower()
        g = s.get(f"{API}/customers/me").json()
        assert g["name"] == "TEST_Jean Kouassi" and g["email"] == em.lower()

    def test_invalid_email(self, user):
        r = user["s"].patch(f"{API}/customers/me", json={"email": "bad@x"})
        assert r.status_code == 422 and _code(r) == "invalid_email"

    def test_empty_name(self, user):
        r = user["s"].patch(f"{API}/customers/me", json={"name": "   "})
        assert r.status_code == 422 and _code(r) == "invalid_name"

    def test_email_taken_case_insensitive(self, user):
        r = user["s"].patch(f"{API}/customers/me", json={"email": OTHER_EMAIL.upper()})
        assert r.status_code == 409 and _code(r) == "email_taken"


# --- Photo upload/serve/delete ---
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


class TestPhoto:
    def test_upload_serve_delete(self, user):
        s = user["s"]
        r = s.post(f"{API}/customers/me/photo", files={"file": ("a.png", io.BytesIO(PNG), "image/png")})
        assert r.status_code == 200, r.text
        pic = r.json()["picture"]
        assert pic.startswith("/api/customers/photos/")
        g = requests.get(f"{BASE_URL}{pic}", timeout=30)
        assert g.status_code == 200 and g.headers["content-type"].startswith("image/png") and g.content == PNG
        d = s.delete(f"{API}/customers/me/photo")
        assert d.status_code == 200 and d.json()["picture"] is None
        assert s.get(f"{API}/customers/me").json()["picture"] is None

    def test_text_plain_rejected(self, user):
        r = user["s"].post(f"{API}/customers/me/photo", files={"file": ("a.txt", io.BytesIO(b"hello"), "text/plain")})
        assert r.status_code == 400 and _code(r) == "invalid_photo_type"

    def test_serve_outside_prefix_404(self):
        assert requests.get(f"{API}/customers/photos/../../etc/passwd", timeout=30).status_code == 404


# --- Phone change ---
class TestPhoneChange:
    def test_taken_same_short(self, user):
        s = user["s"]
        r = s.post(f"{API}/customers/me/phone/request", json={"country_code": "+225", "phone": OTHER_PHONE_LOCAL})
        assert r.status_code == 409 and _code(r) == "phone_taken", r.text
        r = s.post(f"{API}/customers/me/phone/request", json={"country_code": "+225", "phone": user["local"]})
        assert r.status_code == 409 and _code(r) == "same_phone", r.text
        r = s.post(f"{API}/customers/me/phone/request", json={"country_code": "+225", "phone": "12"})
        assert r.status_code == 422 and _code(r) == "invalid_phone", r.text

    def test_change_flow_and_login_with_new(self, user):
        s = user["s"]
        new_local = _rand_local()
        r = s.post(f"{API}/customers/me/phone/request", json={"country_code": "+225", "phone": new_local})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["challenge_id"] and d["dev_code"]
        bad = "000000" if d["dev_code"] != "000000" else "111111"
        w = s.post(f"{API}/customers/me/phone/verify", json={"challenge_id": d["challenge_id"], "code": bad})
        assert w.status_code == 400 and _code(w) == "otp_incorrect"
        ok = s.post(f"{API}/customers/me/phone/verify", json={"challenge_id": d["challenge_id"], "code": d["dev_code"]})
        assert ok.status_code == 200, ok.text
        new_phone = ok.json()["phone"]
        assert new_phone.endswith(new_local[1:])
        cid = s.get(f"{API}/customers/me").json()["id"]
        # reuse consumed challenge
        again = s.post(f"{API}/customers/me/phone/verify", json={"challenge_id": d["challenge_id"], "code": d["dev_code"]})
        assert again.status_code == 400
        s2, c2 = _login(new_local)
        assert c2["id"] == cid


# --- Movers quote ---
def _mq(**kw):
    items = requests.get(f"{API}/express/movers/items", params={"country": "CI"}, timeout=30).json()
    body = {"country": "CI", "pickup_lat": 5.36, "pickup_lng": -4.01, "drop_lat": 5.32, "drop_lng": -3.98,
            "items": [{"item_id": items[0]["id"], "qty": 1}]}
    body.update(kw)
    return requests.post(f"{API}/express/quote/movers", json=body, timeout=30)


class TestMovers:
    def test_ci_currency(self):
        r = _mq()
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["currency"] == "XOF" and d["currency_symbol"] == "CFA"
        assert d.get("total", 0) > 0 or any(isinstance(v, (int, float)) and v > 0 for v in d.values())

    def test_time_slot_code(self):
        slots = requests.get(f"{API}/express/movers/time-slots", params={"country": "CI"}, timeout=30).json()
        paid = [x for x in slots if x["surcharge"] > 0]
        base = _mq(time_slot_code=slots[0]["code"]).json()
        assert _mq(time_slot_code="nope_slot").status_code == 400
        assert _code(_mq(time_slot_code="nope_slot")) == "invalid_time_slot"
        if paid:
            p = _mq(time_slot_code=paid[0]["code"])
            assert p.status_code == 200
            assert p.json()["total"] > base["total"]

    def test_unknown_country_409(self):
        r = _mq(country="ZZ")
        assert r.status_code == 409 and _code(r) == "movers_pricing_unavailable", r.text


# --- Global search ---
def _search(q):
    r = requests.get(f"{API}/search", params={"q": q, "country": "CI", "language": "fr"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _mods(d):
    return {g.get("module") or g.get("key") for g in d["groups"]}


class TestSearch:
    @pytest.mark.parametrize("q", ["lait", "milk"])
    def test_milk(self, q):
        d = _search(q)
        g = [g for g in d["groups"] if (g.get("module") or "").upper() == "MART"]
        assert g, d
        names = " ".join(str(h.get("name") or h.get("title") or "") for h in g[0].get("hits", g[0].get("items", []))).lower()
        assert "lait" in names or "milk" in names, names

    def test_piza(self):
        d = _search("piza")
        assert d.get("corrected_from") == "piza" and d["query"] == "pizza", d
        assert any((g.get("module") or "").upper() == "FOOD" for g in d["groups"])

    def test_burgr(self):
        d = _search("burgr")
        assert d["query"] == "burger", d

    def test_garbage(self):
        d = _search("xyzqw")
        assert d["groups"] == [] and d["suggestions"] == []

    @pytest.mark.parametrize("q", ["colis", "parcel", "demenagement"])
    def test_send_intents(self, q):
        d = _search(q)
        assert any((g.get("module") or "").upper() == "SEND" for g in d["groups"]) or d.get("detected_intents"), d

    @pytest.mark.parametrize("q", ["robe", "shoes"])
    def test_shop(self, q):
        d = _search(q)
        assert any((g.get("module") or "").upper() == "SHOP" for g in d["groups"]), d
