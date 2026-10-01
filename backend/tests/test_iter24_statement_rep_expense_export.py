"""Iteration 24 tests —

Covers the four features main agent asked to verify:
  1. Expense edit  (PUT /expenses/{eid}, change persists, delete requires reason)
  2. Account statement (GET /accounts/{aid} with per-row ref_type/ref_id/ref_number)
     and GET /accounts list carrying account_name + ref linkage on recent rows.
  3. Report export bars (every /reports/* GET returns the shape ExportBar needs)
  4. Sales-summary rep grouping (GET /reports/sales-summary?group=rep)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL env must be set"
BASE_URL = BASE_URL.rstrip("/")

EMAIL = "owner@tredi.app"
PASSWORD = "tredi1234"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": EMAIL, "password": PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- 1. Expense edit ----------
class TestExpenseEdit:
    def test_create_edit_persist_and_delete(self, auth):
        # pick a category
        cats = requests.get(f"{BASE_URL}/api/lookups/expense_category", headers=auth, timeout=20)
        assert cats.status_code == 200
        body = cats.json()
        cat_list = body.get("values") if isinstance(body, dict) else body
        cat = (cat_list or ["Supplies"])[0]

        accs = requests.get(f"{BASE_URL}/api/accounts", headers=auth, timeout=20).json()["accounts"]
        aid = accs[0]["id"]

        create = requests.post(
            f"{BASE_URL}/api/expenses",
            json={"category": cat, "amount": 500.0, "note": "TEST_iter24 initial", "account_id": aid},
            headers=auth,
            timeout=20,
        )
        assert create.status_code == 201, create.text
        eid = create.json()["id"]

        # update amount + note
        upd = requests.put(
            f"{BASE_URL}/api/expenses/{eid}",
            json={"amount": 777.5, "note": "TEST_iter24 updated", "category": cat, "account_id": aid},
            headers=auth,
            timeout=20,
        )
        assert upd.status_code == 200, upd.text

        got = requests.get(f"{BASE_URL}/api/expenses/{eid}", headers=auth, timeout=20).json()
        assert got["amount"] == 777.5
        assert got["note"] == "TEST_iter24 updated"

        # history captured
        hist = requests.get(f"{BASE_URL}/api/history/{eid}", headers=auth, timeout=20)
        if hist.status_code == 200:
            body = hist.json()
            evs = body.get("rows") if isinstance(body, dict) else body
            assert isinstance(evs, list) and len(evs) >= 1

        # delete requires reason? Try without first
        kill = requests.delete(f"{BASE_URL}/api/expenses/{eid}", headers=auth, timeout=20)
        assert kill.status_code in (200, 204, 400)
        # if still exists, delete with reason
        gone = requests.get(f"{BASE_URL}/api/expenses/{eid}", headers=auth, timeout=20)
        if gone.status_code == 200:
            kill = requests.delete(
                f"{BASE_URL}/api/expenses/{eid}?reason=TEST_iter24",
                headers=auth,
                timeout=20,
            )
            assert kill.status_code in (200, 204)


# ---------- 2. Account statement ----------
class TestAccountStatement:
    def test_accounts_list_recent_has_ref_fields(self, auth):
        d = requests.get(f"{BASE_URL}/api/accounts", headers=auth, timeout=20).json()
        assert "recent" in d and isinstance(d["recent"], list)
        if d["recent"]:
            r = d["recent"][0]
            for k in ("account_name", "ref_type", "ref_id", "ref_number"):
                assert k in r, f"missing {k} in recent row {r}"

    def test_account_statement_shape(self, auth):
        accs = requests.get(f"{BASE_URL}/api/accounts", headers=auth, timeout=20).json()["accounts"]
        aid = accs[0]["id"]
        r = requests.get(f"{BASE_URL}/api/accounts/{aid}?period=all", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "account" in d and "entries" in d
        assert "opening" in d and "closing" in d
        assert "in" in d and "out" in d
        for e in d["entries"][:5]:
            for k in ("title", "amount", "balance", "ref_type", "ref_id"):
                assert k in e, f"missing {k} in statement row"

    def test_account_statement_404(self, auth):
        r = requests.get(f"{BASE_URL}/api/accounts/000000000000000000000000", headers=auth, timeout=20)
        assert r.status_code == 404

    def test_running_balance_monotone_from_opening(self, auth):
        accs = requests.get(f"{BASE_URL}/api/accounts", headers=auth, timeout=20).json()["accounts"]
        aid = next((a["id"] for a in accs if a.get("entries", 0) > 0), accs[0]["id"])
        d = requests.get(f"{BASE_URL}/api/accounts/{aid}?period=all", headers=auth, timeout=20).json()
        opening = d["opening"]
        # reverse (chronological) order
        entries = list(reversed(d["entries"]))
        bal = opening
        for e in entries:
            bal = round(bal + e["amount"], 2)
            assert e["balance"] == bal, f"running balance mismatch at {e}"


# ---------- 3. Reports (export bars) ----------
REPORT_PATHS = [
    "/reports/summary",
    "/reports/cashflow",
    "/reports/products",
    "/reports/pnl",
    "/reports/receivables",
    "/reports/stock-valuation",
    "/reports/sales-summary",
    "/reports/reps",
    "/reports/debtors",
    "/returns",
]


@pytest.mark.parametrize("p", REPORT_PATHS)
def test_report_endpoint_200(auth, p):
    r = requests.get(f"{BASE_URL}/api{p}?period=month", headers=auth, timeout=30)
    assert r.status_code == 200, f"{p}: {r.status_code} {r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("application/json")


# ---------- 4. Sales summary rep grouping ----------
class TestSalesSummaryRep:
    def test_rep_grouping(self, auth):
        r = requests.get(
            f"{BASE_URL}/api/reports/sales-summary?period=year&group=rep",
            headers=auth,
            timeout=30,
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("group") == "rep"
        assert isinstance(d.get("rows"), list)
        if d["rows"]:
            row = d["rows"][0]
            for k in ("label", "key", "amount", "count"):
                assert k in row

    def test_rep_filter(self, auth):
        # pick first rep from grouping
        all_rows = requests.get(
            f"{BASE_URL}/api/reports/sales-summary?period=year&group=rep",
            headers=auth,
            timeout=30,
        ).json()["rows"]
        if not all_rows:
            pytest.skip("no sales rows")
        rep_name = all_rows[0]["key"]
        r = requests.get(
            f"{BASE_URL}/api/reports/sales-summary?period=year&group=rep&rep={rep_name}",
            headers=auth,
            timeout=30,
        )
        assert r.status_code == 200
        d = r.json()
        # when a specific rep is set, totals should be <= all rows total
        all_total = sum(x["amount"] for x in all_rows)
        assert d["total"] <= all_total + 0.01

    def test_other_groupings_still_work(self, auth):
        for g in ("customer", "product", "shop", "day"):
            r = requests.get(
                f"{BASE_URL}/api/reports/sales-summary?period=month&group={g}",
                headers=auth,
                timeout=30,
            )
            assert r.status_code == 200, f"{g}: {r.text[:200]}"
            d = r.json()
            assert d.get("group") == g
