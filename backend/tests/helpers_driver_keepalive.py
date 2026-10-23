# Helper: keep the IN test driver online near Connaught Place for N seconds, then set offline.
import os, sys, time, requests
B = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
dur = int(sys.argv[1]) if len(sys.argv) > 1 else 120
delay = int(sys.argv[2]) if len(sys.argv) > 2 else 0
time.sleep(delay)
P = "+919990001234"
code = requests.post(f"{B}/api/driver/auth/request-otp", json={"phone_e164": P, "country": "IN"}).json()["dev_hint"]
tok = requests.post(f"{B}/api/driver/auth/verify-otp", json={"phone_e164": P, "code": code}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
print("online", requests.post(f"{B}/api/driver/me/online", json={"is_online": True, "lat": 28.6139, "lng": 77.209}, headers=h).status_code, flush=True)
end = time.time() + dur
while time.time() < end:
    print("ping", requests.post(f"{B}/api/driver/me/location", json={"lat": 28.616, "lng": 77.211}, headers=h).status_code, flush=True)
    time.sleep(20)
print("offline", requests.post(f"{B}/api/driver/me/online", json={"is_online": False}, headers=h).status_code, flush=True)
