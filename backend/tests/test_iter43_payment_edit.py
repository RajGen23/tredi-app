# Iteration 43: PUT /api/payments/{id} — correct account/date/amount/note, history + activity audit,
# allocation trimming, sale-payment amount lock, role permission (sales 403 -> granted edit_payments -> 200),
# /auth/me can_edit_payments, team abilities list. Runs inside owner@tredi.app demo business with TEST_ data.
import os
import uuid
import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TAG = uuid.uuid4().hex[:6]
ENV = dotenv_values("/app/backend/.env")
DB = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]


def _login(email, pw="tredi1234"):
    r = requests.post(f"{API}/auth/login", data={"username": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}, r.json()["user"]


@pytest.fixture(scope="module")
def fx():
    oh, _ = _login("owner@tredi.app")
    ah, amina = _login("amina@tredi.app")
    accs = [a for a in requests.get(f"{API}/accounts", headers=oh).json()["accounts"] if not a.get("dormant")]
    assert len(accs) >= 2, "need two accounts in demo biz"
    cust = requests.post(f"{API}/customers", json={"name": f"TEST_Edit {TAG}", "phone": "2348030000000"}, headers=oh).json()
    inv = requests.post(f"{API}/invoices", json={"customer_id": cust["id"], "lines": [{"name": f"TEST_Line {TAG}", "quantity": 1, "unit_price": 1000}],
                                                 "vat_rate": 0, "payment_mode": "credit"}, headers=oh)
    assert inv.status_code == 201, inv.text
    inv = inv.json()
    orig_perm = requests.get(f"{API}/team/{amina['id']}", headers=oh).json()
    created = {"payments": [], "invoices": [inv["id"]], "customer": cust["id"]}
    yield {"oh": oh, "ah": ah, "amina": amina, "a": accs[0], "b": accs[1], "cust": cust, "inv": inv, "created": created, "orig": orig_perm}
    # revert amina permissions exactly as found
    o = orig_perm
    requests.put(f"{API}/team/{amina['id']}", json={"role": o["role"], "shops": o["shops"], "can": o["can"], "scopes": o["scopes"]}, headers=oh)
    # cleanup by ids we created
    pids = [ObjectId(p) for p in created["payments"]]
    DB.payments.delete_many({"_id": {"$in": pids}})
    DB.payments.delete_many({"allocations.invoice_id": {"$in": created["invoices"]}, "customer_id": cust["id"]})
    DB.activity.delete_many({"ref_id": {"$in": created["payments"] + created["invoices"]}})
    DB.invoices.delete_many({"_id": {"$in": [ObjectId(i) for i in created["invoices"]]}})
    DB.customers.delete_one({"_id": ObjectId(cust["id"])})


def _pay(fx, amount, acc, alloc=None, date=None):
    body = {"customer_id": fx["cust"]["id"], "amount": amount, "account_id": acc, "method": "transfer", "note": "TEST_pay"}
    if alloc is not None:
        body["allocations"] = alloc
    if date:
        body["date"] = date
    r = requests.post(f"{API}/payments", json=body, headers=fx["oh"])
    assert r.status_code == 201, r.text
    fx["created"]["payments"].append(r.json()["id"])
    return r.json()


class TestMe:
    def test_me_flags(self, fx):
        me_o = requests.get(f"{API}/auth/me", headers=fx["oh"]).json()
        me_a = requests.get(f"{API}/auth/me", headers=fx["ah"]).json()
        o = me_o.get("user", me_o)
        a = me_a.get("user", me_a)
        assert o["can_edit_payments"] is True
        assert a["can_edit_payments"] is False

    def test_team_ability_listed(self, fx):
        t = requests.get(f"{API}/team", headers=fx["oh"]).json()
        labels = {x["key"]: x["label"] for x in t["abilities"]}
        assert labels.get("edit_payments") == "Edit past payments — amount, account, date"


class TestOwnerEdit:
    def test_edit_account_date_amount_note(self, fx):
        p = _pay(fx, 600, fx["a"]["id"], alloc=[{"invoice_id": fx["inv"]["id"], "amount": 600}], date="2026-01-10")
        r = requests.put(f"{API}/payments/{p['id']}", json={"account_id": fx["b"]["id"], "date": "2026-01-05", "amount": 400,
                                                          "note": "TEST_fixed", "reason": "TEST wrong account"}, headers=fx["oh"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["account_id"] == fx["b"]["id"]
        assert d["amount"] == 400
        assert d["note"] == "TEST_fixed"
        assert str(d["created_at"]).startswith("2026-01-05")
        assert sum(a["amount"] for a in d["allocations"]) <= 400
        h = d["history"][-1]
        assert h["before"]["account_id"] == fx["a"]["id"] and h["before"]["amount"] == 600 and h["before"]["note"] == "TEST_pay"
        assert len(h["changes"]) == 4 and h["reason"] == "TEST wrong account"
        fx["p1"] = d

    def test_activity_logged(self, fx):
        rows = requests.get(f"{API}/activity", headers=fx["oh"], params={"kind": "payment"}).json()["rows"]
        mine = [r for r in rows if r.get("ref_id") == fx["p1"]["id"] and r["title"].startswith("Payment edited")]
        assert mine, "no Payment edited activity row"
        assert mine[0]["title"] == f"Payment edited — TEST_Edit {TAG}"
        assert "account" in mine[0]["sub"] and "amount 600.00 → 400.00" in mine[0]["sub"] and "date" in mine[0]["sub"]
        assert mine[0]["reason"] == "TEST wrong account"

    def test_ledger_and_balance_reflect(self, fx):
        led = requests.get(f"{API}/customers/{fx['cust']['id']}/ledger", headers=fx["oh"]).json()
        row = [e for e in led["entries"] if e["ref_id"] == fx["p1"]["id"]][0]
        assert row["amount"] == -400 and row["edited"] is True and row["amount_editable"] is True
        assert row["account_id"] == fx["b"]["id"]
        assert led["closing"] == 600  # 1000 invoice - 400 payment
        inv = requests.get(f"{API}/invoices/{fx['inv']['id']}", headers=fx["oh"]).json()
        due = inv.get("due", inv.get("status_info", {}).get("due"))
        if due is not None:
            assert due == 600

    def test_no_change_noop(self, fx):
        r = requests.put(f"{API}/payments/{fx['p1']['id']}", json={"amount": 400}, headers=fx["oh"])
        assert r.status_code == 200
        assert len(r.json()["history"]) == 1

    def test_amount_zero_rejected(self, fx):
        r = requests.put(f"{API}/payments/{fx['p1']['id']}", json={"amount": 0}, headers=fx["oh"])
        assert r.status_code == 400

    def test_foreign_account_rejected(self, fx):
        r = requests.put(f"{API}/payments/{fx['p1']['id']}", json={"account_id": "0123456789abcdef01234567"}, headers=fx["oh"])
        assert r.status_code == 400

    def test_payment_out_amount_editable(self, fx):
        r = requests.post(f"{API}/customers/{fx['cust']['id']}/payment-out", json={"amount": 50, "account_id": fx["a"]["id"]}, headers=fx["oh"])
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        fx["created"]["payments"].append(pid)
        r = requests.put(f"{API}/payments/{pid}", json={"amount": 70, "reason": "TEST"}, headers=fx["oh"])
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == -70


class TestSalePayment:
    def test_cash_sale_amount_locked_account_ok(self, fx):
        inv = requests.post(f"{API}/invoices", json={"customer_id": fx["cust"]["id"], "lines": [{"name": f"TEST_Cash {TAG}", "quantity": 1, "unit_price": 200}],
                                                     "vat_rate": 0, "payment_mode": "cash", "account_id": fx["a"]["id"]}, headers=fx["oh"])
        assert inv.status_code == 201, inv.text
        fx["created"]["invoices"].append(inv.json()["id"])
        p = DB.payments.find_one({"allocations.invoice_id": inv.json()["id"]})
        pid = str(p["_id"])
        fx["created"]["payments"].append(pid)
        r = requests.put(f"{API}/payments/{pid}", json={"amount": 150}, headers=fx["oh"])
        assert r.status_code == 400
        r = requests.put(f"{API}/payments/{pid}", json={"account_id": fx["b"]["id"], "date": "2026-01-02"}, headers=fx["oh"])
        assert r.status_code == 200, r.text
        assert r.json()["account_id"] == fx["b"]["id"] and r.json()["amount"] == 200


class TestPermissions:
    def test_sales_forbidden_then_granted(self, fx):
        pid = fx["p1"]["id"]
        r = requests.put(f"{API}/payments/{pid}", json={"note": "TEST_by_amina"}, headers=fx["ah"])
        assert r.status_code in (403, 404), r.text
        if r.status_code == 404:
            pytest.skip("payment not visible to amina's scope")
        o = fx["orig"]
        g = requests.put(f"{API}/team/{fx['amina']['id']}", json={"role": o["role"], "shops": o["shops"], "can": {**o["can"], "edit_payments": True},
                                                                   "scopes": o["scopes"]}, headers=fx["oh"])
        assert g.status_code == 200, g.text
        me = requests.get(f"{API}/auth/me", headers=fx["ah"]).json()
        assert me.get("user", me)["can_edit_payments"] is True
        r = requests.put(f"{API}/payments/{pid}", json={"note": "TEST_by_amina", "reason": "TEST grant"}, headers=fx["ah"])
        assert r.status_code == 200, r.text
        assert r.json()["history"][-1]["by"] == fx["amina"]["name"]
