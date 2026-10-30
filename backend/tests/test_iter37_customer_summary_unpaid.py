# Iteration 37: batched GET /customers/{id}/summary must equal the old per-invoice maths, and
# GET /customers/{id} 'unpaid' must leave out draft/quote/cancelled invoices. Plus auth regression.
import os
import sys
import time

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import deps  # noqa: E402  (loads backend/.env)

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
NOT_LIVE = ["draft", "quote", "cancelled"]
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def login(email, pw="tredi1234"):
    r = requests.post(f"{BASE_URL}/api/auth/login", data={"username": email, "password": pw})
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


def old_summary(biz, cid):
    purchased = unpaid = 0.0
    count = 0
    for inv in mdb.invoices.find({"business_id": biz, "deleted_at": None, "customer_id": cid, "status": {"$nin": NOT_LIVE}}):
        purchased += inv["totals"]["total"]
        unpaid += deps.invoice_status(inv, old_paid(biz, str(inv["_id"])))["due"]
        count += 1
    return round(purchased, 2), round(unpaid, 2), count


@pytest.fixture(scope="module", params=["owner", "wichflow"])
def hdr(request):
    return login("owner@tredi.app") if request.param == "owner" else wich_headers()


def biz_of(hdr):
    return requests.get(f"{BASE_URL}/api/auth/me", headers=hdr).json()["business_id"]


class TestCustomerSummary:
    def test_summary_matches_old_math(self, hdr):
        biz = biz_of(hdr)
        custs = requests.get(f"{BASE_URL}/api/customers", headers=hdr).json()
        assert custs, "no customers"
        bad, slow = [], 0.0
        for c in custs[:60]:
            t0 = time.time()
            r = requests.get(f"{BASE_URL}/api/customers/{c['id']}/summary", headers=hdr)
            slow = max(slow, time.time() - t0)
            assert r.status_code == 200, r.text
            s = r.json()
            p, u, n = old_summary(biz, c["id"])
            if (round(s["purchased"], 2), round(s["unpaid"], 2), s["invoices"]) != (p, u, n) or round(s["balance"], 2) != round(c["balance"], 2):
                bad.append((c["name"], s["purchased"], p, s["unpaid"], u, s["invoices"], n, s["balance"], c["balance"]))
        print(f"max summary latency {slow:.2f}s over {min(60, len(custs))} customers")
        assert not bad, bad[:5]


class TestCustomerDetailUnpaid:
    def test_unpaid_excludes_non_live(self, hdr):
        custs = requests.get(f"{BASE_URL}/api/customers", headers=hdr).json()
        bad = []
        for c in custs[:40]:
            d = requests.get(f"{BASE_URL}/api/customers/{c['id']}", headers=hdr).json()
            exp = round(sum(i["due"] for i in d["invoices"] if i["status"] not in NOT_LIVE), 2)
            s = requests.get(f"{BASE_URL}/api/customers/{c['id']}/summary", headers=hdr).json()
            if round(d["unpaid"], 2) != exp or round(d["unpaid"], 2) != round(s["unpaid"], 2):
                bad.append((c["name"], d["unpaid"], exp, s["unpaid"]))
        assert not bad, bad[:5]


class TestAuthRegression:
    def test_me_bad_token_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer garbage"})
        assert r.status_code == 401

    def test_rep_sees_only_own_invoices(self):
        o = requests.get(f"{BASE_URL}/api/invoices", headers=login("owner@tredi.app")).json()
        a = requests.get(f"{BASE_URL}/api/invoices", headers=login("amina@tredi.app")).json()
        print(f"owner invoices {len(o)}, amina invoices {len(a)}")
        assert 0 < len(a) < len(o)
