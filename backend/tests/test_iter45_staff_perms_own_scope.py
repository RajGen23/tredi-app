# Iteration 45: per-staff area switches (see_suppliers, see_customer_totals, see_stock_value, see_expenses,
# see_accounts, edit_stock), own-scope invoice visibility (by created_by_id, survives shop change),
# legacy creator link (David Dapdil 17 invoices) and owner regression.
import os
import sys
import uuid
import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TAG = uuid.uuid4().hex[:6]
ENV = dotenv_values("/app/backend/.env")
DB = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
AREAS = ["see_suppliers", "see_customer_totals", "see_stock_value", "see_expenses", "see_accounts", "edit_stock"]


def _login(email, pw="tredi1234"):
    r = requests.post(f"{API}/auth/login", data={"username": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}, r.json()["user"]


def _all_invoices(h):
    out, page = [], 1
    while True:
        r = requests.get(f"{API}/invoices", headers=h, params={"page": page, "limit": 200})
        assert r.status_code == 200, r.text
        j = r.json()
        rows = j if isinstance(j, list) else (j.get("invoices") or j.get("items") or j.get("rows") or [])
        out += rows
        if isinstance(j, list) or not j.get("has_more") or not rows:
            break
        page += 1
    return out, j


@pytest.fixture(scope="module")
def fx():
    oh, _ = _login("owner@tredi.app")
    ah, amina = _login("amina@tredi.app")
    raw = DB.users.find_one({"_id": ObjectId(amina["id"])})
    snap = {k: raw.get(k) for k in ("can", "shops", "scopes", "shop", "role")}
    created = {"invoices": [], "customers": []}
    yield {"oh": oh, "ah": ah, "amina": amina, "created": created}
    # exact revert of amina's permission/shop fields
    DB.users.update_one({"_id": raw["_id"]}, {"$set": snap})
    ids = [ObjectId(i) for i in created["invoices"]]
    DB.activity.delete_many({"ref_id": {"$in": created["invoices"] + created["customers"]}})
    DB.invoices.delete_many({"_id": {"$in": ids}})
    DB.customers.delete_many({"_id": {"$in": [ObjectId(c) for c in created["customers"]]}})


# --- staff defaults: all switches off
class TestStaffDefaults:
    def test_me_perms_all_false(self, fx):
        me = requests.get(f"{API}/auth/me", headers=fx["ah"]).json()
        assert set(AREAS) <= set(me["perms"].keys())
        assert all(me["perms"][k] is False for k in AREAS), me["perms"]

    @pytest.mark.parametrize("path", ["/suppliers", "/purchases", "/expenses", "/reports/stock-valuation"])
    def test_forbidden_lists(self, fx, path):
        r = requests.get(f"{API}{path}", headers=fx["ah"])
        assert r.status_code == 403, f"{path} {r.status_code} {r.text[:200]}"

    def test_accounts_restricted(self, fx):
        r = requests.get(f"{API}/accounts", headers=fx["ah"])
        assert r.status_code == 200
        j = r.json()
        assert j.get("restricted") is True
        for a in j["accounts"]:
            assert a.get("balance") is None, a
        owner_accs = requests.get(f"{API}/accounts", headers=fx["oh"]).json()["accounts"]
        r2 = requests.get(f"{API}/accounts/{owner_accs[0]['id']}", headers=fx["ah"])
        assert r2.status_code == 403

    def test_customers_balance_null(self, fx):
        r = requests.get(f"{API}/customers", headers=fx["ah"])
        assert r.status_code == 200
        j = r.json()
        rows = j if isinstance(j, list) else (j.get("customers") or j.get("items") or [])
        assert rows, "amina sees no customers"
        assert all(c.get("balance") is None for c in rows), [c.get("balance") for c in rows][:5]

    def test_dashboard_nulls(self, fx):
        d = requests.get(f"{API}/dashboard", headers=fx["ah"]).json()
        assert d["purchases"] is None and d["expenses"] is None and d["owed"] is None, {k: d.get(k) for k in ("purchases", "expenses", "owed")}

    def test_items_write_forbidden(self, fx):
        items = requests.get(f"{API}/items", headers=fx["oh"]).json()
        items = items if isinstance(items, list) else (items.get("items") or [])
        r1 = requests.post(f"{API}/items", json={"name": f"TEST_x {TAG}", "unit_price": 10}, headers=fx["ah"])
        r2 = requests.put(f"{API}/items/{items[0]['id']}", json={"name": items[0]["name"]}, headers=fx["ah"])
        r3 = requests.post(f"{API}/items/bulk", json={"items": [{"name": f"TEST_y {TAG}", "unit_price": 1}]}, headers=fx["ah"])
        assert (r1.status_code, r2.status_code, r3.status_code) == (403, 403, 403), (r1.text, r2.text, r3.text)


# --- owner toggles one switch on, then off
class TestToggle:
    def test_abilities_listed(self, fx):
        m = requests.get(f"{API}/team/{fx['amina']['id']}", headers=fx["oh"]).json()
        labels = {a["label"] for a in m["abilities"]}
        for l in ["Add and edit stock items", "See total stock value", "See suppliers & purchases",
                  "See customer balances & totals", "See and record expenses", "See bank & cash account balances"]:
            assert l in labels, l
        assert all(m["can"].get(k) is False for k in AREAS)

    def test_turn_on_suppliers(self, fx):
        m = requests.get(f"{API}/team/{fx['amina']['id']}", headers=fx["oh"]).json()
        can = {**m["can"], "see_suppliers": True}
        r = requests.put(f"{API}/team/{fx['amina']['id']}", json={"role": m["role"], "shops": m["shops"], "can": can, "scopes": m["scopes"]}, headers=fx["oh"])
        assert r.status_code == 200, r.text
        me = requests.get(f"{API}/auth/me", headers=fx["ah"]).json()
        assert me["perms"]["see_suppliers"] is True and me["perms"]["see_expenses"] is False
        assert requests.get(f"{API}/suppliers", headers=fx["ah"]).status_code == 200
        assert requests.get(f"{API}/purchases", headers=fx["ah"]).status_code == 200
        assert requests.get(f"{API}/expenses", headers=fx["ah"]).status_code == 403
        # revert
        can["see_suppliers"] = False
        requests.put(f"{API}/team/{fx['amina']['id']}", json={"role": m["role"], "shops": m["shops"], "can": can, "scopes": m["scopes"]}, headers=fx["oh"])
        assert requests.get(f"{API}/suppliers", headers=fx["ah"]).status_code == 403


# --- own scope invoices
class TestOwnScope:
    def test_own_invoice_survives_shop_move(self, fx):
        c = requests.post(f"{API}/customers", json={"name": f"TEST_Own {TAG}", "phone": "2348031111111"}, headers=fx["ah"])
        assert c.status_code in (200, 201), c.text
        fx["created"]["customers"].append(c.json()["id"])
        inv = requests.post(f"{API}/invoices", json={"customer_id": c.json()["id"], "lines": [{"name": f"TEST_L {TAG}", "quantity": 1, "unit_price": 500}],
                                                     "vat_rate": 0, "payment_mode": "credit"}, headers=fx["ah"])
        assert inv.status_code == 201, inv.text
        iid = inv.json()["id"]
        fx["created"]["invoices"].append(iid)
        doc = DB.invoices.find_one({"_id": ObjectId(iid)})
        assert doc.get("created_by_id") == fx["amina"]["id"]
        rows, _ = _all_invoices(fx["ah"])
        ids = {r["id"] for r in rows}
        assert iid in ids
        # nobody else's invoices
        bad = [r for r in rows if r["id"] != iid and DB.invoices.find_one({"_id": ObjectId(r["id"])}, {"created_by_id": 1, "created_by": 1, "rep": 1}) and
               not (lambda d: d.get("created_by_id") == fx["amina"]["id"] or d.get("created_by") == "Amina Yusuf" or d.get("rep") == "Amina Yusuf")(
                   DB.invoices.find_one({"_id": ObjectId(r["id"])}))]
        assert not bad, f"foreign invoices visible: {len(bad)}"
        # move amina to the other shop
        m = requests.get(f"{API}/team/{fx['amina']['id']}", headers=fx["oh"]).json()
        other = [s for s in m["all_shops"] if s not in m["shops"]]
        assert other
        r = requests.put(f"{API}/team/{fx['amina']['id']}", json={"role": m["role"], "shops": [other[0]], "can": m["can"], "scopes": m["scopes"]}, headers=fx["oh"])
        assert r.status_code == 200
        rows2, _ = _all_invoices(fx["ah"])
        assert iid in {r["id"] for r in rows2}, "own invoice disappeared after shop move"
        detail = requests.get(f"{API}/invoices/{iid}", headers=fx["ah"])
        assert detail.status_code == 200, detail.text
        requests.put(f"{API}/team/{fx['amina']['id']}", json={"role": m["role"], "shops": m["shops"], "can": m["can"], "scopes": m["scopes"]}, headers=fx["oh"])

    def test_owner_sees_amina_invoice(self, fx):
        rows, _ = _all_invoices(fx["oh"])
        owner_total = len(rows)
        arows, _ = _all_invoices(fx["ah"])
        assert owner_total > len(arows)


# --- legacy creator link
class TestLegacy:
    def test_david_17(self):
        from deps import create_access_token
        u = DB.users.find_one({"email": "daviddapdil4@gmail.com"})
        h = {"Authorization": f"Bearer {create_access_token(str(u['_id']))}"}
        rows, raw = _all_invoices(h)
        total = raw.get("total") if isinstance(raw, dict) else None
        assert len(rows) == 17 or total == 17, (len(rows), total)


# --- owner regression
class TestOwner:
    def test_owner_everything(self, fx):
        oh = fx["oh"]
        me = requests.get(f"{API}/auth/me", headers=oh).json()
        assert all(me["perms"][k] for k in AREAS)
        for p in ["/suppliers", "/purchases", "/expenses"]:
            assert requests.get(f"{API}{p}", headers=oh).status_code == 200, p
        accs = requests.get(f"{API}/accounts", headers=oh).json()
        assert not accs.get("restricted") and any(a.get("balance") is not None for a in accs["accounts"])
        assert requests.get(f"{API}/accounts/{accs['accounts'][0]['id']}", headers=oh).status_code == 200
        cs = requests.get(f"{API}/customers", headers=oh).json()
        cs = cs if isinstance(cs, list) else (cs.get("customers") or cs.get("items") or [])
        assert any(c.get("balance") is not None for c in cs)
        d = requests.get(f"{API}/dashboard", headers=oh).json()
        assert d["purchases"] is not None and d["expenses"] is not None and d["owed"] is not None
        r = requests.post(f"{API}/items", json={"name": f"TEST_Item {TAG}", "unit_price": 100, "cost_price": 50}, headers=oh)
        assert r.status_code == 201, r.text
        iid = r.json()["id"]
        DB.items.delete_one({"_id": ObjectId(iid)})
        DB.activity.delete_many({"ref_id": iid})
