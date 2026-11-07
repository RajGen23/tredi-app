# Probe: can a TEST_ sales rep raise their own role / money access via /team endpoints? (TEST_ data only)
import os, uuid, requests, sys
sys.path.insert(0, "/app/backend/tests")
from test_iter41_money_guard_payment_fix import _signup_code, _login, API

TAG = uuid.uuid4().hex[:6]
email = f"test_{TAG}@resend.dev"
r = requests.post(f"{API}/auth/register", json={"name": f"TEST_Owner {TAG}", "email": email, "password": "Testpw12345", "code": _signup_code(email)})
h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
requests.post(f"{API}/business", json={"name": f"TEST_Biz {TAG}", "type": "Retail"}, headers=h)
rep = requests.post(f"{API}/team", json={"name": f"TEST_Rep {TAG}", "email": f"test_rep_{TAG}@resend.dev", "role": "sales", "password": "Reppw12345"}, headers=h).json()
rh = _login(f"test_rep_{TAG}@resend.dev", "Reppw12345")
print("before: /reports/summary", requests.get(f"{API}/reports/summary", headers=rh).status_code)
r = requests.put(f"{API}/team/{rep['id']}", json={"role": "manager"}, headers=rh)
print("rep PUT own role=manager:", r.status_code, r.json().get("role") if r.ok else r.text[:100])
print("after: /reports/summary", requests.get(f"{API}/reports/summary", headers=rh).status_code)
r = requests.post(f"{API}/team", json={"name": f"TEST_Rep2 {TAG}", "email": f"test_rep2_{TAG}@resend.dev", "role": "manager", "password": "Reppw12345"}, headers=rh)
print("rep POST /team (invite manager):", r.status_code, r.text[:120])
team = requests.get(f"{API}/team", headers=rh)
print("rep GET /team:", team.status_code)
