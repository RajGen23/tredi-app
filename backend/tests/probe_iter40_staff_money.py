# Read-only probe: which money endpoints still return figures to a sales rep (amina@tredi.app).
import os, requests
API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
tok = requests.post(f"{API}/auth/login", data={"username": "amina@tredi.app", "password": "tredi1234"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
me = requests.get(f"{API}/auth/me", headers=h).json()
print("me:", (me.get("user") or me).get("role"), (me.get("user") or me).get("can_see_money"))
accs = requests.get(f"{API}/accounts", headers=h).json()
print("accounts restricted:", accs.get("restricted"), "keys:", list(accs["accounts"][0].keys()) if accs["accounts"] else [])
if accs["accounts"]:
    r = requests.get(f"{API}/accounts/{accs['accounts'][0]['id']}", headers=h)
    print("account statement:", r.status_code, "closing" in r.text and r.json().get("closing"))
for path in ["/dashboard", "/expenses", "/reports/profit-loss", "/reports/summary", "/reports/sales", "/shops/overview"]:
    r = requests.get(f"{API}{path}", headers=h)
    print(path, r.status_code, r.text[:160].replace("\n", " "))
