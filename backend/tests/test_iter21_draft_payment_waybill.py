"""Iteration 21 — Draft lifecycle, payment page, waybill prefill.

Covers:
- Draft invoice create (status=draft), no stock movement, no number
- /invoices/{id}/issue-preview rows + totals
- /invoices/{id}/issue (draft → issued) assigns number, deducts stock
- DELETE /invoices/{id} on draft => mode=deleted
- DELETE /invoices/{id} on issued without reason => 400; with reason => cancelled + stock back
- /invoices/{id}/uncancel restores an invoice
- POST /payments records payment against an invoice and reduces due
- POST /waybills with invoice_id prefills lines (via GET /invoices/{id} source)
"""

import os
import pytest
import requests
from uuid import uuid4

# Shared state across the ordered class — xdist can split classes but keeps tests
# inside a single class on the same worker (loadscope). We use a dict to pass ids.
STATE: dict = {}

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ui-flow-accurate.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


# ---------------------------------------------------------------- fixtures

@pytest.fixture(scope="module")
def owner_headers():
    r = requests.post(f"{API}/auth/login",
                      data={"username": "owner@tredi.app", "password": "tredi1234"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seed(owner_headers):
    """Grab one customer and one tracked item to work with."""
    cs = requests.get(f"{API}/customers", headers=owner_headers).json()
    its = requests.get(f"{API}/items", headers=owner_headers).json()
    tracked = next((i for i in its if i.get("track_stock")), its[0])
    return {"customer_id": cs[0]["id"], "customer_name": cs[0]["name"],
            "item": tracked}


def _draft_body(seed, qty=1):
    it = seed["item"]
    return {
        "customer_id": seed["customer_id"],
        "lines": [{
            "item_id": it["id"], "name": it["name"], "quantity": qty,
            "unit_price": it.get("selling_price") or 100,
            "discount_type": "amount", "discount_value": 0, "note": "",
            "quick_add": False, "unit": it.get("unit") or "",
        }],
        "invoice_discount_type": "amount", "invoice_discount_value": 0,
        "vat_rate": 7.5, "issue_date": "2026-01-15", "due_date": "2026-02-28",
        "payment_mode": "credit", "status": "draft", "rep": "Tester",
    }


# ---------------------------------------------------------------- draft lifecycle

class TestDraftLifecycle:
    def test_create_draft_no_number_no_stock(self, owner_headers, seed):
        before_stock = requests.get(f"{API}/items/{seed['item']['id']}", headers=owner_headers).json().get("quantity")
        r = requests.post(f"{API}/invoices", json=_draft_body(seed), headers=owner_headers)
        assert r.status_code == 201, r.text
        inv = r.json()
        assert inv["status"] == "draft"
        # Draft invoices should not have an "INV-" sequential number assigned yet
        assert not inv.get("number") or str(inv["number"]).startswith("Draft") or "DRAFT" in str(inv["number"]).upper() or inv["number"] == ""
        after = requests.get(f"{API}/items/{seed['item']['id']}", headers=owner_headers).json().get("quantity")
        assert after == before_stock, f"Draft must not move stock: before={before_stock} after={after}"
        STATE['draft_id'] = inv["id"]

    def test_issue_preview_lists_rows_and_shop(self, owner_headers, seed):
        r = requests.get(f"{API}/invoices/{STATE['draft_id']}/issue-preview", headers=owner_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        assert "rows" in p and len(p["rows"]) == 1
        row = p["rows"][0]
        assert row["name"] == seed["item"]["name"]
        assert row["quantity"] == 1
        if row["tracked"]:
            assert row["before"] is not None and row["after"] == row["before"] - 1
        assert p["total"] > 0
        assert "shop" in p

    def test_issue_assigns_number_and_deducts_stock(self, owner_headers, seed):
        before = requests.get(f"{API}/items/{seed['item']['id']}", headers=owner_headers).json().get("quantity")
        r = requests.post(f"{API}/invoices/{STATE['draft_id']}/issue", headers=owner_headers)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["status"] in ("issued", "overdue", "unpaid", "paid")
        assert inv.get("number", "").startswith("INV")
        after = requests.get(f"{API}/items/{seed['item']['id']}", headers=owner_headers).json().get("quantity")
        if seed["item"].get("track_stock"):
            assert after == (before or 0) - 1, f"Stock not deducted: {before} → {after}"
        STATE['issued_id'] = inv["id"]
        STATE['issued_number'] = inv["number"]
        STATE['issued_total'] = inv["totals"]["total"]

    def test_issue_cannot_run_twice(self, owner_headers):
        r = requests.post(f"{API}/invoices/{STATE['issued_id']}/issue", headers=owner_headers)
        assert r.status_code == 400

    def test_delete_issued_without_reason_fails(self, owner_headers):
        r = requests.delete(f"{API}/invoices/{STATE['issued_id']}", headers=owner_headers)
        assert r.status_code == 400

    def test_delete_issued_with_reason_cancels_and_returns_stock(self, owner_headers, seed):
        before = requests.get(f"{API}/items/{seed['item']['id']}", headers=owner_headers).json().get("quantity")
        r = requests.delete(f"{API}/invoices/{STATE['issued_id']}?reason=TEST%20cancel", headers=owner_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["mode"] == "cancelled"
        after = requests.get(f"{API}/items/{seed['item']['id']}", headers=owner_headers).json().get("quantity")
        if seed["item"].get("track_stock"):
            assert after == (before or 0) + 1, f"Stock not restored: {before} → {after}"
        g = requests.get(f"{API}/invoices/{STATE['issued_id']}", headers=owner_headers).json()
        assert g["status"] == "cancelled"
        assert g.get("cancelled_reason") == "TEST cancel"
        assert g.get("number") == STATE['issued_number'], "Cancelled invoice must keep its number"

    def test_uncancel_restores(self, owner_headers, seed):
        before = requests.get(f"{API}/items/{seed['item']['id']}", headers=owner_headers).json().get("quantity")
        r = requests.post(f"{API}/invoices/{STATE['issued_id']}/uncancel", headers=owner_headers)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["status"] in ("issued", "overdue", "unpaid", "paid")
        after = requests.get(f"{API}/items/{seed['item']['id']}", headers=owner_headers).json().get("quantity")
        if seed["item"].get("track_stock"):
            assert after == (before or 0) - 1

    def test_delete_draft_is_deleted_outright(self, owner_headers, seed):
        r = requests.post(f"{API}/invoices", json=_draft_body(seed), headers=owner_headers)
        did = r.json()["id"]
        r2 = requests.delete(f"{API}/invoices/{did}", headers=owner_headers)
        assert r2.status_code == 200, r2.text
        assert r2.json()["mode"] == "deleted"


# ---------------------------------------------------------------- payment page

class TestPayment:
    def test_record_payment_against_invoice_reduces_due(self, owner_headers, seed):
        # We re-use the restored issued invoice from the draft lifecycle test
        iid = STATE['issued_id']
        before = requests.get(f"{API}/invoices/{iid}", headers=owner_headers).json()
        due_before = before["due"]
        assert due_before > 0
        amount = round(due_before / 2, 2)
        payload = {
            "customer_id": seed["customer_id"], "amount": amount, "method": "cash",
            "date": "2025-01-16", "account_id": None,
            "allocations": [{"invoice_id": iid, "amount": amount}],
            "note": "TEST partial payment",
        }
        r = requests.post(f"{API}/payments", json=payload, headers=owner_headers)
        assert r.status_code == 201, r.text
        after = requests.get(f"{API}/invoices/{iid}", headers=owner_headers).json()
        assert round(after["due"], 2) == round(due_before - amount, 2), f"due {due_before} → {after['due']} (paid {amount})"
        assert after["paid"] >= amount - 0.01


# ---------------------------------------------------------------- waybill prefill

class TestWaybillPrefill:
    def test_create_waybill_from_invoice_copies_lines(self, owner_headers, seed):
        # Fetch the issued invoice as the frontend does (invoice_id in query, GET /invoices/{id})
        iid = STATE['issued_id']
        inv = requests.get(f"{API}/invoices/{iid}", headers=owner_headers).json()
        assert inv["status"] in ("issued", "overdue", "unpaid", "paid")
        body = {
            "invoice_id": inv["id"], "invoice_number": inv["number"],
            "customer_name": inv["customer_name"],
            "deliver_to": "TEST 22 Ojuelegba Rd",
            "driver": "TEST driver", "vehicle": "TEST-1234", "show_prices": False,
            "lines": [{"name": l["name"], "unit": l.get("unit") or "Piece",
                       "quantity": l["quantity"], "unit_price": l.get("unit_price") or 0}
                      for l in inv["lines"]],
            "status": "issued",
        }
        r = requests.post(f"{API}/waybills", json=body, headers=owner_headers)
        assert r.status_code == 201, r.text
        wb = r.json()
        assert wb.get("invoice_id") == inv["id"]
        # invoice_number is attached on GET /waybills/{wid}, not on POST return
        wb_fetched = requests.get(f"{API}/waybills/{wb['id']}", headers=owner_headers).json()
        assert wb_fetched.get("invoice_number") == inv["number"]
        assert len(wb.get("lines") or []) == len(inv["lines"])
        for src, dst in zip(inv["lines"], wb["lines"]):
            assert dst["name"] == src["name"]
            assert dst["quantity"] == src["quantity"]
        assert wb.get("number"), "Waybill should get its own number"
        # Reverse link should resolve from invoice side
        inv2 = requests.get(f"{API}/invoices/{iid}", headers=owner_headers).json()
        if "waybill" in inv2 and inv2["waybill"]:
            assert inv2["waybill"]["number"] == wb["number"]
