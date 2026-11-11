# Iteration 46: retest of the 7 staff-permission leaks from iter45 (see_profit, adjust_stock,
# see_suppliers, see_customer_totals on items / customers / summary / ledger / low-stock / team view)
# plus owner regression. Amina (sales, defaults off) is never mutated here.
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, pw="tredi1234"):
    r = requests.post(f"{API}/auth/login", data={"username": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}, r.json()["user"]


@pytest.fixture(scope="module")
def fx():
    oh, _ = _login("owner@tredi.app")
    ah, amina = _login("amina@tredi.app")
    items = requests.get(f"{API}/items", headers=oh).json()
    custs = requests.get(f"{API}/customers", headers=oh).json()
    # pick an item that has supply history and a customer with invoices (owner view)
    item = None
    for it in items[:40]:
        d = requests.get(f"{API}/items/{it['id']}", headers=oh).json()
        if d.get("supply_history") and d.get("revenue"):
            item = d
            break
    item = item or requests.get(f"{API}/items/{items[0]['id']}", headers=oh).json()
    cust = next((c for c in custs if c.get("open_invoices")), custs[0])
    return {"oh": oh, "ah": ah, "amina": amina, "item": item, "cust": cust}


# --- amina: items
class TestAminaItems:
    def test_me_perms_off(self, fx):
        p = requests.get(f"{API}/auth/me", headers=fx["ah"]).json()["perms"]
        assert p["see_profit"] is False and p["adjust_stock"] is False and p["see_suppliers"] is False

    def test_item_detail_hidden(self, fx):
        r = requests.get(f"{API}/items/{fx['item']['id']}", headers=fx["ah"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["profit"] is None and d["cost_of_sales"] is None and d["margin"] is None, d
        assert "cost_price" not in d
        assert d["supply_history"] == [] and d["suppliers"] == []
        assert "revenue" in d  # non-money stats still served

    def test_items_list_no_cost(self, fx):
        rows = requests.get(f"{API}/items", headers=fx["ah"]).json()
        assert rows and all("cost_price" not in r for r in rows)

    def test_adjust_forbidden(self, fx):
        r = requests.post(f"{API}/items/{fx['item']['id']}/adjust", headers=fx["ah"], json={"delta": 1, "reason": "TEST_", "note": "TEST_"})
        assert r.status_code == 403, r.text

    def test_low_stock_hidden(self, fx):
        r = requests.get(f"{API}/low-stock", headers=fx["ah"])
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["reorder_cost"] is None
        for row in j["items"]:
            assert "cost_price" not in row and row["reorder_cost"] is None


# --- amina: customers
class TestAminaCustomers:
    def test_customer_detail_null(self, fx):
        r = requests.get(f"{API}/customers/{fx['cust']['id']}", headers=fx["ah"])
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("balance", "total_purchases", "total_received", "unpaid", "returns_total"):
            assert d[k] is None, (k, d[k])
        assert "opening_balance" not in d

    def test_customer_summary_null(self, fx):
        r = requests.get(f"{API}/customers/{fx['cust']['id']}/summary", headers=fx["ah"])
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["balance"] is None and d["unpaid"] is None and d["purchased"] is None, d

    def test_ledger_forbidden(self, fx):
        r = requests.get(f"{API}/customers/{fx['cust']['id']}/ledger", headers=fx["ah"])
        assert r.status_code == 403

    def test_credit_check_balance(self, fx):
        # informational: does credit-check still leak the balance to staff?
        r = requests.post(f"{API}/customers/{fx['cust']['id']}/credit-check", headers=fx["ah"], json={"amount": 100})
        assert r.status_code == 200
        assert r.json().get("balance") is None, f"credit-check leaks balance: {r.json()}"


# --- owner: team view matches amina's /auth/me
class TestTeamView:
    def test_team_member_matches_me(self, fx):
        me = requests.get(f"{API}/auth/me", headers=fx["ah"]).json()["perms"]
        r = requests.get(f"{API}/team/{fx['amina']['id']}", headers=fx["oh"])
        assert r.status_code == 200
        can = r.json()["can"]
        for k, v in me.items():
            assert bool(can.get(k)) == v, (k, can.get(k), v)


# --- owner regression
class TestOwner:
    def test_owner_item(self, fx):
        d = requests.get(f"{API}/items/{fx['item']['id']}", headers=fx["oh"]).json()
        assert isinstance(d["profit"], (int, float)) and isinstance(d["margin"], (int, float))
        assert "cost_price" in d

    def test_owner_items_cost(self, fx):
        rows = requests.get(f"{API}/items", headers=fx["oh"]).json()
        assert any("cost_price" in r for r in rows)

    def test_owner_customer(self, fx):
        cid = fx["cust"]["id"]
        d = requests.get(f"{API}/customers/{cid}", headers=fx["oh"]).json()
        assert isinstance(d["balance"], (int, float)) and isinstance(d["unpaid"], (int, float))
        s = requests.get(f"{API}/customers/{cid}/summary", headers=fx["oh"]).json()
        assert isinstance(s["balance"], (int, float)) and isinstance(s["purchased"], (int, float))
        l = requests.get(f"{API}/customers/{cid}/ledger", headers=fx["oh"])
        assert l.status_code == 200 and "entries" in l.json()

    def test_owner_low_stock(self, fx):
        j = requests.get(f"{API}/low-stock", headers=fx["oh"]).json()
        assert isinstance(j["reorder_cost"], (int, float))

    def test_owner_dashboard_owed(self, fx):
        r = requests.get(f"{API}/dashboard", headers=fx["oh"])
        if r.status_code != 200:
            pytest.skip("dashboard path differs")
        assert r.json().get("owed") is not None

    def test_amina_dashboard_owed_null(self, fx):
        r = requests.get(f"{API}/dashboard", headers=fx["ah"])
        if r.status_code != 200:
            pytest.skip("dashboard path differs")
        assert r.json().get("owed") is None
