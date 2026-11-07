# Iteration 41: retest of iteration-40 fixes — PUT /payments partial patch + account ownership,
# payment-out account ownership, money_guard (403) on /accounts/{id}, /reports/*, /shops/overview, /expenses,
# plus regressions: staff day-to-day flows still work, owner still sees money, "Open reports" grant unlocks.
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TAG = uuid.uuid4().hex[:6]
MONEY_PATHS = ["/reports/summary", "/reports/pnl", "/reports/debtors", "/reports/receivables", "/reports/cashflow",
               "/reports/stock-valuation", "/shops/overview", "/expenses"]


def _login(email, pw="tredi1234"):
    r = requests.post(f"{API}/auth/login", data={"username": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def _signup_code(email):
    import hashlib
    from dotenv import dotenv_values
    from pymongo import MongoClient
    env = dotenv_values("/app/backend/.env")
    r = requests.post(f"{API}/auth/signup-code", json={"email": email})
    if r.status_code != 200:
        return ""
    rec = MongoClient(env["MONGO_URL"])[env["DB_NAME"]].signup_codes.find_one({"email": email})
    for n in range(1_000_000):
        c = f"{n:06d}"
        if hashlib.sha256(f"{email}:{c}:{env.get('JWT_SECRET', '')}".encode()).hexdigest() == rec["hash"]:
            return c
    raise AssertionError("code not recovered")


@pytest.fixture(scope="module")
def fx():
    email = f"test_{TAG}@resend.dev"
    r = requests.post(f"{API}/auth/register", json={"name": f"TEST_Owner {TAG}", "email": email, "password": "Testpw12345",
                                                     "code": _signup_code(email)})
    assert r.status_code == 201, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    assert requests.post(f"{API}/business", json={"name": f"TEST_Biz {TAG}", "type": "Retail"}, headers=h).status_code == 200
    a = requests.post(f"{API}/accounts", json={"name": "TEST_Till", "kind": "cash", "opening_balance": 1000}, headers=h).json()
    b = requests.post(f"{API}/accounts", json={"name": "TEST_Bank", "kind": "bank", "detail": "GTB 0123456789", "opening_balance": 0}, headers=h).json()
    item = requests.post(f"{API}/items", json={"name": "TEST_Tile", "selling_price": 500, "cost_price": 300}, headers=h).json()
    cust = requests.post(f"{API}/customers", json={"name": "TEST_Kola Ade", "phone": "2348031234567"}, headers=h).json()
    rep = requests.post(f"{API}/team", json={"name": f"TEST_Rep {TAG}", "email": f"test_rep_{TAG}@resend.dev", "role": "sales",
                                             "password": "Reppw12345"}, headers=h)
    assert rep.status_code == 201, rep.text
    rh = _login(f"test_rep_{TAG}@resend.dev", "Reppw12345")
    # a foreign account (seeded owner business) — read only
    oh = _login("owner@tredi.app")
    foreign = requests.get(f"{API}/accounts", headers=oh).json()["accounts"][0]["id"]
    return {"h": h, "a": a, "b": b, "item": item, "cust": cust, "rep_id": rep.json()["id"], "rh": rh, "foreign": foreign}


class TestPaymentFix:
    def test_date_only_keeps_account(self, fx):
        h = fx["h"]
        p = requests.post(f"{API}/payments", json={"customer_id": fx["cust"]["id"], "amount": 400, "account_id": fx["a"]["id"],
                                                  "allocations": []}, headers=h)
        assert p.status_code in (200, 201), p.text
        fx["pid"] = p.json()["id"]
        r = requests.put(f"{API}/payments/{fx['pid']}", json={"date": "2026-01-11"}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["account_id"] == fx["a"]["id"]
        assert r.json()["created_at"].startswith("2026-01-11")

    def test_note_only_keeps_account(self, fx):
        r = requests.put(f"{API}/payments/{fx['pid']}", json={"note": "TEST note"}, headers=fx["h"])
        assert r.status_code == 200 and r.json()["account_id"] == fx["a"]["id"] and r.json()["note"] == "TEST note"

    def test_move_account_then_balances(self, fx):
        h = fx["h"]
        r = requests.put(f"{API}/payments/{fx['pid']}", json={"account_id": fx["b"]["id"]}, headers=h)
        assert r.status_code == 200 and r.json()["account_id"] == fx["b"]["id"]
        accs = {x["id"]: x for x in requests.get(f"{API}/accounts", headers=h).json()["accounts"]}
        assert accs[fx["b"]["id"]]["balance"] == 400
        assert accs[fx["a"]["id"]]["balance"] == 1000

    def test_foreign_account_rejected(self, fx):
        r = requests.put(f"{API}/payments/{fx['pid']}", json={"account_id": fx["foreign"]}, headers=fx["h"])
        assert r.status_code == 400, r.text
        g = requests.get(f"{API}/accounts/{fx['b']['id']}", headers=fx["h"])
        assert g.status_code == 200

    def test_explicit_null_clears_account(self, fx):
        r = requests.put(f"{API}/payments/{fx['pid']}", json={"account_id": None}, headers=fx["h"])
        assert r.status_code == 200 and r.json()["account_id"] is None

    def test_payment_out_foreign_account_rejected(self, fx):
        r = requests.post(f"{API}/customers/{fx['cust']['id']}/payment-out", json={"amount": 50, "account_id": fx["foreign"]}, headers=fx["h"])
        assert r.status_code == 400, r.text

    def test_payment_out_own_account_ok(self, fx):
        r = requests.post(f"{API}/customers/{fx['cust']['id']}/payment-out", json={"amount": 50, "account_id": fx["a"]["id"]}, headers=fx["h"])
        assert r.status_code == 201 and r.json()["amount"] == -50


class TestMoneyGuard:
    def test_rep_me_flag(self, fx):
        me = requests.get(f"{API}/auth/me", headers=fx["rh"]).json()
        me = me.get("user") or me
        assert me["role"] == "sales" and me["can_see_money"] is False

    def test_rep_account_statement_403(self, fx):
        lst = requests.get(f"{API}/accounts", headers=fx["rh"]).json()
        assert lst.get("restricted") is True
        r = requests.get(f"{API}/accounts/{fx['a']['id']}", headers=fx["rh"])
        assert r.status_code == 403, r.text[:200]

    @pytest.mark.parametrize("path", MONEY_PATHS)
    def test_rep_money_paths_403(self, fx, path):
        r = requests.get(f"{API}{path}", headers=fx["rh"])
        assert r.status_code == 403, f"{path}: {r.status_code} {r.text[:150]}"

    @pytest.mark.parametrize("path", MONEY_PATHS + ["/accounts/{a}"])
    def test_owner_money_paths_200(self, fx, path):
        r = requests.get(f"{API}{path.format(a=fx['a']['id'])}", headers=fx["h"])
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:150]}"


class TestStaffRegressions:
    @pytest.mark.parametrize("path", ["/dashboard", "/customers", "/items", "/invoices", "/shortcuts", "/notifications", "/accounts"])
    def test_rep_daily_reads_ok(self, fx, path):
        r = requests.get(f"{API}{path}", headers=fx["rh"])
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:150]}"

    def test_rep_can_take_payment(self, fx):
        r = requests.post(f"{API}/payments", json={"customer_id": fx["cust"]["id"], "amount": 100, "account_id": fx["a"]["id"],
                                                  "allocations": []}, headers=fx["rh"])
        assert r.status_code in (200, 201), r.text

    def test_rep_can_log_expense(self, fx):
        r = requests.post(f"{API}/expenses", json={"category": "Fuel", "amount": 20, "note": "TEST_fuel", "account_id": fx["a"]["id"]}, headers=fx["rh"])
        print("rep expense create:", r.status_code, r.text[:150])
        assert r.status_code in (200, 201), r.text

    def test_rep_cannot_self_escalate(self, fx):
        r = requests.put(f"{API}/team/{fx['rep_id']}", json={"role": "sales", "can": {"reports": True}}, headers=fx["rh"])
        print("rep self-escalate:", r.status_code, r.text[:150])
        assert r.status_code in (401, 403), "a sales rep can grant themselves 'Open reports' via PUT /team/{own id}"

    def test_open_reports_grant_unlocks(self, fx):
        r = requests.put(f"{API}/team/{fx['rep_id']}", json={"role": "sales", "can": {"reports": True}}, headers=fx["h"])
        assert r.status_code == 200, r.text
        assert requests.get(f"{API}/reports/summary", headers=fx["rh"]).status_code == 200
        assert requests.get(f"{API}/accounts/{fx['a']['id']}", headers=fx["rh"]).status_code == 200
        requests.put(f"{API}/team/{fx['rep_id']}", json={"role": "sales", "can": {"reports": False}}, headers=fx["h"])
        assert requests.get(f"{API}/reports/summary", headers=fx["rh"]).status_code == 403


class TestSeededRep:
    def test_amina_guarded(self):
        h = _login("amina@tredi.app")
        accs = requests.get(f"{API}/accounts", headers=h).json()
        assert accs.get("restricted") is True
        if accs["accounts"]:
            assert requests.get(f"{API}/accounts/{accs['accounts'][0]['id']}", headers=h).status_code == 403
        assert requests.get(f"{API}/reports/summary", headers=h).status_code == 403
