"""Iteration 22 — Supplier profile screen and item-page location breakdown.

Focus: ensures GET /api/suppliers/{id} returns the full profile shape the screen
reads (owed, purchases[], payments[], items[], total_purchased), and that
GET /api/items/{id} returns stock_by_shop rows the item page renders under
"Where it is".
"""
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
    "https://ui-flow-accurate.preview.emergentagent.com"
OWNER = {"username": "owner@tredi.app", "password": "tredi1234"}


@pytest.fixture(scope="session")
def owner_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", data=OWNER, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def h(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


# --------------------------------------------------- Suppliers list + profile
class TestSuppliersListAndProfile:
    def test_list_suppliers_returns_envelope(self, h):
        r = requests.get(f"{BASE_URL}/api/suppliers", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(["suppliers", "owed", "count"]).issubset(body.keys())
        assert isinstance(body["suppliers"], list)
        assert body["count"] == len(body["suppliers"])
        # each row has what the index screen renders
        for s in body["suppliers"]:
            assert "id" in s and "name" in s
            assert "owed" in s and isinstance(s["owed"], (int, float))
            assert "purchases" in s  # count

    def test_supplier_profile_shape(self, h):
        lst = requests.get(f"{BASE_URL}/api/suppliers", headers=h, timeout=20).json()
        assert lst["suppliers"], "demo seed should include at least one supplier"
        sid = lst["suppliers"][0]["id"]

        r = requests.get(f"{BASE_URL}/api/suppliers/{sid}", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # core identity
        assert d["id"] == sid
        assert "name" in d
        # keys the screen reads
        for key in ("owed", "total_purchased", "purchases", "payments", "items"):
            assert key in d, f"missing {key} on supplier profile"
        assert isinstance(d["purchases"], list)
        assert isinstance(d["payments"], list)
        assert isinstance(d["items"], list)
        assert isinstance(d["owed"], (int, float))
        assert isinstance(d["total_purchased"], (int, float))

    def test_supplier_profile_purchase_rows_have_screen_fields(self, h):
        lst = requests.get(f"{BASE_URL}/api/suppliers", headers=h, timeout=20).json()
        sid = lst["suppliers"][0]["id"]
        d = requests.get(f"{BASE_URL}/api/suppliers/{sid}", headers=h, timeout=20).json()
        if not d["purchases"]:
            pytest.skip("supplier has no purchases in seed")
        p = d["purchases"][0]
        # the Li renders: p.number, p.lines, p.total, p.due, p.account_name
        for key in ("id", "number", "lines", "total", "due", "account_name", "created_at"):
            assert key in p, f"purchase row missing {key}"
        assert isinstance(p["lines"], list)
        # due should be total - paid
        assert p["due"] >= 0

    def test_supplier_profile_payment_rows_have_screen_fields(self, h):
        lst = requests.get(f"{BASE_URL}/api/suppliers", headers=h, timeout=20).json()
        sid = lst["suppliers"][0]["id"]
        d = requests.get(f"{BASE_URL}/api/suppliers/{sid}", headers=h, timeout=20).json()
        if not d["payments"]:
            pytest.skip("supplier has no payments in seed")
        p = d["payments"][0]
        for key in ("id", "amount", "account_name", "created_at"):
            assert key in p, f"payment row missing {key}"

    def test_supplier_profile_404(self, h):
        r = requests.get(f"{BASE_URL}/api/suppliers/68000000000000000000ffff",
                         headers=h, timeout=20)
        assert r.status_code == 404

    def test_supplier_pay_endpoint(self, h):
        """The pay sheet posts to /supplier-payments — endpoint must accept
        {supplier_id, amount, account_id, note} and reduce the outstanding."""
        lst = requests.get(f"{BASE_URL}/api/suppliers", headers=h, timeout=20).json()
        sid = next((s["id"] for s in lst["suppliers"] if s.get("owed", 0) > 0),
                   lst["suppliers"][0]["id"])
        before = requests.get(f"{BASE_URL}/api/suppliers/{sid}", headers=h, timeout=20).json()
        if before["owed"] <= 0:
            pytest.skip("no outstanding balance to pay down")
        accs = requests.get(f"{BASE_URL}/api/accounts", headers=h, timeout=20).json()
        account_id = accs["accounts"][0]["id"]
        pay_amt = round(min(before["owed"], 100), 2)
        r = requests.post(f"{BASE_URL}/api/supplier-payments", headers=h, timeout=20,
                          json={"supplier_id": sid, "amount": pay_amt,
                                "account_id": account_id, "note": "TEST iter22"})
        assert r.status_code == 201, r.text
        after = requests.get(f"{BASE_URL}/api/suppliers/{sid}", headers=h, timeout=20).json()
        assert round(before["owed"] - after["owed"], 2) == pay_amt


# --------------------------------------------------- Item location breakdown
class TestItemLocationBreakdown:
    def test_item_detail_has_stock_by_shop(self, h):
        items = requests.get(f"{BASE_URL}/api/items", headers=h, timeout=20).json()
        assert items, "demo seed should include items"
        tracked = next((it for it in items if it.get("track_stock", True)), items[0])
        iid = tracked["id"]
        r = requests.get(f"{BASE_URL}/api/items/{iid}", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # The item page renders d.stock_by_shop under "Where it is"
        assert "stock_by_shop" in d, "stock_by_shop missing on item detail"
        assert isinstance(d["stock_by_shop"], list)
        # The page also reads: quantity, cost_price, selling_price, unit, idle_days,
        # last_sold_at, last_received_at, supply_history, movements, adjustments
        for key in ("quantity", "quantity_all", "unit", "cost_price", "selling_price",
                    "sold_qty", "revenue", "profit", "margin", "returned_qty",
                    "returned_value", "idle_days", "last_sold_at", "last_received_at",
                    "supply_history", "movements", "adjustments"):
            assert key in d, f"item detail missing {key}"

    def test_stock_by_shop_rows_have_shop_and_qty(self, h):
        items = requests.get(f"{BASE_URL}/api/items", headers=h, timeout=20).json()
        tracked = next((it for it in items if it.get("track_stock", True)), items[0])
        d = requests.get(f"{BASE_URL}/api/items/{tracked['id']}", headers=h, timeout=20).json()
        assert d["stock_by_shop"], "expected at least one shop row"
        for row in d["stock_by_shop"]:
            assert set(("shop", "qty")).issubset(row.keys())
            assert isinstance(row["qty"], (int, float))

    def test_stock_by_shop_sums_to_total_quantity(self, h):
        """The per-shop breakdown must agree with the headline quantity_all so
        the 'Where it is' panel never contradicts the top of the card."""
        items = requests.get(f"{BASE_URL}/api/items", headers=h, timeout=20).json()
        tracked = [it for it in items if it.get("track_stock", True)]
        assert tracked, "no tracked items"
        it = tracked[0]
        d = requests.get(f"{BASE_URL}/api/items/{it['id']}", headers=h, timeout=20).json()
        total = round(sum(r["qty"] for r in d["stock_by_shop"]), 3)
        assert round(d["quantity_all"], 3) == total, (
            f"stock_by_shop total {total} != quantity_all {d['quantity_all']}")

    def test_item_detail_404(self, h):
        r = requests.get(f"{BASE_URL}/api/items/68000000000000000000ffff",
                         headers=h, timeout=20)
        assert r.status_code == 404
