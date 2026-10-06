"""Iteration 26 — Quick sale edit / cancel / restore.

Covers:
  - POST /api/sales creates a sale, decrements stock, inserts ONE payment row.
  - PUT  /api/sales/{sid} re-lays stock (delta vs. new qty, not total) and keeps
    exactly ONE payment row.
  - POST /api/sales/{sid}/cancel  — stock back, payment row gone, totals drop
    off dashboard / reports.
  - POST /api/sales/{sid}/uncancel — stock off again, payment re-inserted.
  - Edit on cancelled sale is refused (400).
  - PUT with no lines is refused (400/422).
  - Uncancel on a live sale returns 404.
"""
import os

import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ui-flow-accurate.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

OWNER_EMAIL = "owner@tredi.app"
OWNER_PASSWORD = "tredi1234"


# ------------------------------------------------------------- fixtures
@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": OWNER_EMAIL, "password": OWNER_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_h(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture(scope="module")
def pick_item(owner_h):
    """Return an item that has stock, selling_price and a known qty."""
    r = requests.get(f"{BASE_URL}/api/items", headers=owner_h)
    assert r.status_code == 200
    items = [i for i in r.json() if (i.get("quantity") or 0) >= 10 and (i.get("selling_price") or 0) > 0]
    assert items, "No item with enough stock to run the edit test"
    return items[0]


@pytest.fixture(scope="module")
def cash_account(owner_h):
    r = requests.get(f"{BASE_URL}/api/accounts", headers=owner_h)
    assert r.status_code == 200
    accs = r.json()["accounts"] if isinstance(r.json(), dict) and "accounts" in r.json() else r.json()
    cash = next((a for a in accs if a.get("kind") == "cash"), None)
    assert cash, "Need a cash account on the owner tenant"
    return cash


def _item_qty(owner_h, iid):
    r = requests.get(f"{BASE_URL}/api/items/{iid}", headers=owner_h)
    assert r.status_code == 200
    return r.json().get("quantity") or 0


def _payment_rows(db, sid):
    return list(db.payments.find({"sale_id": sid}))


# -------------------------------------------------------------- tests
class TestSaleLifecycle:
    """A full create → edit → cancel → uncancel round trip."""

    sale_id = None
    sale_number = None
    sale_total = None
    item_id = None
    item_qty_before = None

    def test_01_create_sale_qty_2(self, owner_h, pick_item, cash_account, db):
        TestSaleLifecycle.item_id = pick_item["id"]
        TestSaleLifecycle.item_qty_before = _item_qty(owner_h, pick_item["id"])

        body = {
            "lines": [{
                "item_id": pick_item["id"], "name": pick_item["name"],
                "quantity": 2, "unit_price": pick_item["selling_price"],
                "unit": pick_item.get("unit", ""),
            }],
            "method": "cash", "tendered": pick_item["selling_price"] * 2,
            "account_id": cash_account["id"],
        }
        r = requests.post(f"{BASE_URL}/api/sales", json=body, headers=owner_h)
        assert r.status_code == 201, r.text
        d = r.json()
        TestSaleLifecycle.sale_id = d["id"]
        TestSaleLifecycle.sale_number = d["number"]
        TestSaleLifecycle.sale_total = d["totals"]["total"]
        assert d["totals"]["total"] == pytest.approx(pick_item["selling_price"] * 2)

        # Stock dropped by 2
        after = _item_qty(owner_h, pick_item["id"])
        assert after == TestSaleLifecycle.item_qty_before - 2

        # Exactly ONE payment row for this sale
        pays = _payment_rows(db, d["id"])
        assert len(pays) == 1
        assert pays[0]["amount"] == pytest.approx(d["totals"]["total"])

    def test_02_edit_to_qty_3(self, owner_h, pick_item, cash_account, db):
        sid = TestSaleLifecycle.sale_id
        body = {
            "lines": [{
                "item_id": pick_item["id"], "name": pick_item["name"],
                "quantity": 3, "unit_price": pick_item["selling_price"],
                "unit": pick_item.get("unit", ""),
            }],
            "method": "cash", "tendered": pick_item["selling_price"] * 3,
            "account_id": cash_account["id"],
        }
        r = requests.put(f"{BASE_URL}/api/sales/{sid}", json=body, headers=owner_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["totals"]["total"] == pytest.approx(pick_item["selling_price"] * 3)
        assert d["lines"][0]["quantity"] == 3
        assert d.get("updated_at"), "updated_at missing on edited sale"
        assert d.get("updated_by"), "updated_by missing on edited sale"

        # Stock delta: ONE more unit off (not 3 more)
        after = _item_qty(owner_h, pick_item["id"])
        assert after == TestSaleLifecycle.item_qty_before - 3, (
            f"Expected qty {TestSaleLifecycle.item_qty_before - 3} after edit, got {after}"
        )

        # Exactly ONE payment row with the new amount
        pays = _payment_rows(db, sid)
        assert len(pays) == 1, f"Expected 1 payment row, got {len(pays)}"
        assert pays[0]["amount"] == pytest.approx(d["totals"]["total"])

        TestSaleLifecycle.sale_total = d["totals"]["total"]

    def test_03_put_empty_lines_rejected(self, owner_h):
        sid = TestSaleLifecycle.sale_id
        body = {"lines": [], "method": "cash", "tendered": 0}
        r = requests.put(f"{BASE_URL}/api/sales/{sid}", json=body, headers=owner_h)
        assert r.status_code in (400, 422), r.text

    def test_04_cancel_sale(self, owner_h, db):
        sid = TestSaleLifecycle.sale_id
        # Snapshot totals before cancel
        ds0 = requests.get(f"{BASE_URL}/api/dashboard", headers=owner_h).json()
        total_sales_before = ds0.get("total_sales", 0)

        rs0 = requests.get(f"{BASE_URL}/api/reports/sales-summary?period=year", headers=owner_h).json()
        rs_total_before = rs0.get("total", 0)

        r = requests.post(f"{BASE_URL}/api/sales/{sid}/cancel", json={"reason": "TEST_iter26 cancel"}, headers=owner_h)
        assert r.status_code == 200, r.text
        assert "message" in r.json()

        # Sale carries cancelled_at
        s = requests.get(f"{BASE_URL}/api/sales/{sid}", headers=owner_h).json()
        assert s.get("cancelled_at")
        assert s.get("cancelled_by")
        assert s.get("cancelled_reason") == "TEST_iter26 cancel"

        # Stock back to pre-sale figure
        after = _item_qty(owner_h, TestSaleLifecycle.item_id)
        assert after == TestSaleLifecycle.item_qty_before, (
            f"Expected qty back to {TestSaleLifecycle.item_qty_before}, got {after}"
        )

        # Payment row gone
        pays = _payment_rows(db, sid)
        assert pays == []

        # Dashboard total dropped by sale total
        ds1 = requests.get(f"{BASE_URL}/api/dashboard", headers=owner_h).json()
        total_sales_after = ds1.get("total_sales", 0)
        assert total_sales_after == pytest.approx(total_sales_before - TestSaleLifecycle.sale_total, abs=0.01), (
            f"Dashboard total_sales did not drop: before={total_sales_before}, after={total_sales_after}, delta expected={TestSaleLifecycle.sale_total}"
        )

        # Reports sales-summary total dropped
        rs1 = requests.get(f"{BASE_URL}/api/reports/sales-summary?period=year", headers=owner_h).json()
        rs_total_after = rs1.get("total", 0)
        assert rs_total_after == pytest.approx(rs_total_before - TestSaleLifecycle.sale_total, abs=0.01)

    def test_05_second_cancel_returns_400(self, owner_h):
        sid = TestSaleLifecycle.sale_id
        r = requests.post(f"{BASE_URL}/api/sales/{sid}/cancel", json={"reason": "x"}, headers=owner_h)
        assert r.status_code == 400, r.text

    def test_06_edit_cancelled_rejected(self, owner_h, pick_item):
        sid = TestSaleLifecycle.sale_id
        body = {
            "lines": [{"item_id": pick_item["id"], "name": pick_item["name"], "quantity": 1,
                       "unit_price": pick_item["selling_price"], "unit": pick_item.get("unit", "")}],
            "method": "cash", "tendered": pick_item["selling_price"],
        }
        r = requests.put(f"{BASE_URL}/api/sales/{sid}", json=body, headers=owner_h)
        assert r.status_code == 400, r.text

    def test_07_uncancel_restores(self, owner_h, db):
        sid = TestSaleLifecycle.sale_id
        r = requests.post(f"{BASE_URL}/api/sales/{sid}/uncancel", headers=owner_h)
        assert r.status_code == 200, r.text

        s = requests.get(f"{BASE_URL}/api/sales/{sid}", headers=owner_h).json()
        assert not s.get("cancelled_at")
        assert not s.get("cancelled_by")
        assert not s.get("cancelled_reason")

        # Stock back off (qty 3 was the last state)
        after = _item_qty(owner_h, TestSaleLifecycle.item_id)
        assert after == TestSaleLifecycle.item_qty_before - 3, (
            f"Expected qty back off to {TestSaleLifecycle.item_qty_before - 3}, got {after}"
        )

        # Payment row re-inserted
        pays = _payment_rows(db, sid)
        assert len(pays) == 1
        assert pays[0]["amount"] == pytest.approx(TestSaleLifecycle.sale_total)

    def test_08_uncancel_live_sale_404(self, owner_h):
        """Uncancel on a non-cancelled sale returns 404."""
        sid = TestSaleLifecycle.sale_id  # just restored → live now
        r = requests.post(f"{BASE_URL}/api/sales/{sid}/uncancel", headers=owner_h)
        assert r.status_code == 404, r.text

    def test_99_teardown_cancel(self, owner_h, db):
        """Leave the sale cancelled so demo tenant totals are not inflated."""
        sid = TestSaleLifecycle.sale_id
        r = requests.post(f"{BASE_URL}/api/sales/{sid}/cancel",
                          json={"reason": "TEST_iter26 teardown"}, headers=owner_h)
        assert r.status_code == 200, r.text
        # Final check — stock back, payment gone
        after = _item_qty(owner_h, TestSaleLifecycle.item_id)
        assert after == TestSaleLifecycle.item_qty_before
        assert _payment_rows(db, sid) == []
