# Iteration 36: batched GET /api/invoices + GET /api/customers must return the same numbers as the
# old per-row computation (re-implemented here directly against Mongo with pymongo), and be fast.
import os
import sys
import time
from datetime import date

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import deps  # noqa: E402  (loads backend/.env)

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
LIVE = ["draft", "quote", "cancelled"]
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def owner_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", data={"username": "owner@tredi.app", "password": "tredi1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def wich_headers():
    u = mdb.users.find_one({"email": "obinnowill@gmail.com"})
    if not u:
        pytest.skip("migrated owner not present")
    return {"Authorization": f"Bearer {deps.create_access_token(str(u['_id']))}"}


def old_paid(biz, iid):
    t = 0.0
    for p in mdb.payments.find({"business_id": biz, "deleted_at": None, "allocations.invoice_id": iid}):
        t += sum(a["amount"] for a in p.get("allocations", []) if a["invoice_id"] == iid)
    return round(t, 2)


def old_balance(biz, cid):
    c = mdb.customers.find_one({"_id": ObjectId(cid)})
    bal = c.get("opening_balance", 0) * (1 if c.get("opening_type") == "owes_me" else -1)
    for inv in mdb.invoices.find({"business_id": biz, "customer_id": cid, "deleted_at": None, "status": {"$nin": LIVE}}):
        bal += inv["totals"]["total"]
    for p in mdb.payments.find({"business_id": biz, "customer_id": cid, "deleted_at": None}):
        bal -= p["amount"]
    return round(bal, 2)


@pytest.fixture(scope="module", params=["owner", "wichflow"])
def hdr(request):
    return owner_headers() if request.param == "owner" else wich_headers()


class TestBatchedLists:
    def test_customers_match_old_math(self, hdr):
        t0 = time.time()
        r = requests.get(f"{BASE_URL}/api/customers", headers=hdr)
        took = time.time() - t0
        assert r.status_code == 200
        rows = r.json()
        print(f"customers: {len(rows)} rows in {took:.2f}s")
        assert took < 5
        biz = requests.get(f"{BASE_URL}/api/auth/me", headers=hdr).json()["business_id"]
        f = {"business_id": biz, "deleted_at": None}
        bad = []
        for c in rows[:400]:
            assert "_id" not in c
            exp_bal = old_balance(biz, c["id"])
            cnt, over = 0, 0
            for inv in mdb.invoices.find({**f, "customer_id": c["id"], "status": {"$nin": LIVE}}):
                st = deps.invoice_status(inv, old_paid(biz, str(inv["_id"])))
                if st["due"] > 0:
                    cnt += 1
                    over = max(over, st["days_overdue"])
            if abs(exp_bal - c["balance"]) > 0.01 or cnt != c["open_invoices"] or over != c["days_overdue"]:
                bad.append((c["name"], exp_bal, c["balance"], cnt, c["open_invoices"], over, c["days_overdue"]))
        assert not bad, bad[:10]

    def test_invoices_match_old_math(self, hdr):
        t0 = time.time()
        r = requests.get(f"{BASE_URL}/api/invoices", headers=hdr)
        took = time.time() - t0
        assert r.status_code == 200
        rows = r.json()
        print(f"invoices: {len(rows)} rows in {took:.2f}s")
        assert took < 6
        bad = []
        for d in rows[:400]:
            assert "_id" not in d
            inv = mdb.invoices.find_one({"_id": ObjectId(d["id"])})
            paid = old_paid(inv["business_id"], d["id"])
            st = deps.invoice_status(inv, paid)
            cust = mdb.customers.find_one({"_id": ObjectId(inv["customer_id"])}) if ObjectId.is_valid(inv.get("customer_id") or "") else None
            name = cust["name"] if cust else "Cash sale"
            accs = [i for i in (inv.get("bank_account_ids") or []) if ObjectId.is_valid(i) and mdb.accounts.find_one({"_id": ObjectId(i)})]
            got_pay = round(sum(p["amount"] for p in d["payments"]), 2)
            if (st["paid"] != d["paid"] or st["due"] != d["due"] or st["status"] != d["status"] or st["days_overdue"] != d["days_overdue"]
                    or name != d["customer_name"] or got_pay != paid or sorted(accs) != sorted(a["id"] for a in d["bank_accounts"])
                    or ("terms" not in d) or "shipping" not in d["totals"] or "discount_total" not in d["totals"]):
                bad.append((d.get("number"), st, {k: d[k] for k in ("paid", "due", "status", "days_overdue", "customer_name")}))
        assert not bad, bad[:5]

    def test_invoice_detail_and_customer_detail(self, hdr):
        invs = requests.get(f"{BASE_URL}/api/invoices", headers=hdr).json()
        if not invs:
            pytest.skip("no invoices")
        d = requests.get(f"{BASE_URL}/api/invoices/{invs[0]['id']}", headers=hdr)
        assert d.status_code == 200
        j = d.json()
        assert j["id"] == invs[0]["id"] and j["due"] == invs[0]["due"] and j["customer_name"] == invs[0]["customer_name"]
        assert "business" in j and "waybill" in j
        custs = requests.get(f"{BASE_URL}/api/customers", headers=hdr).json()
        withinv = next((c for c in custs if c["open_invoices"] > 0), custs[0])
        cd = requests.get(f"{BASE_URL}/api/customers/{withinv['id']}", headers=hdr)
        assert cd.status_code == 200
        cj = cd.json()
        assert abs(cj["balance"] - withinv["balance"]) < 0.01


class TestCreateFlows:
    def test_create_customer_and_invoice_then_cleanup(self):
        h = owner_headers()
        c = requests.post(f"{BASE_URL}/api/customers", headers=h, json={"name": "ZZ Iter36 Cust", "phone": "08031112222"})
        assert c.status_code == 201, c.text
        cid = c.json()["id"]
        try:
            lst = requests.get(f"{BASE_URL}/api/customers", headers=h).json()
            row = next(x for x in lst if x["id"] == cid)
            assert row["balance"] == 0 and row["open_invoices"] == 0
            inv = requests.post(f"{BASE_URL}/api/invoices", headers=h, json={
                "customer_id": cid, "lines": [{"name": "ZZ line", "quantity": 2, "unit_price": 1000}],
                "vat_rate": 0, "due_date": date.today().isoformat()})
            assert inv.status_code == 201, inv.text
            ij = inv.json()
            assert ij["customer_name"] == "ZZ Iter36 Cust" and ij["totals"]["total"] == 2000
            lst = requests.get(f"{BASE_URL}/api/customers", headers=h).json()
            row = next(x for x in lst if x["id"] == cid)
            print("after invoice:", row["balance"], row["open_invoices"], ij["status"])
            if ij["status"] not in ("draft", "quote"):
                assert row["balance"] == 2000 and row["open_invoices"] == 1
            il = requests.get(f"{BASE_URL}/api/invoices", headers=h).json()
            assert any(x["id"] == ij["id"] for x in il)
        finally:
            mdb.invoices.delete_many({"customer_id": cid})
            mdb.customers.delete_one({"_id": ObjectId(cid)})
            mdb.activity.delete_many({"ref_id": cid})
