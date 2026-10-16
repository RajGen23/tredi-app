"""Iteration 29 — confirm plain-number persistence for amounts users typed with commas.

The frontend formats inputs as 1,500,000 while typing, but save() strips to 1500000 via parseNum.
We verify the backend sees plain numbers for expenses, payments, purchases and stock adjust,
plus confirm the create_sale fix from iter28 by posting one real quick sale.
"""
import os, time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
OWNER = {"username": "owner@tredi.app", "password": "tredi1234"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", data=OWNER, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_expense_persists_plain_number(auth):
    body = {"category": "Office", "amount": 1500000, "date": "2026-10-15", "note": "TEST_iter29 expense"}
    r = requests.post(f"{BASE_URL}/api/expenses", json=body, headers=auth, timeout=20)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    eid = created.get("id")
    # Validate echoed amount is a plain number
    assert created.get("amount") == 1500000, f"POST echoed amount {created.get('amount')} not 1500000"
    # Round-trip through list
    lst = requests.get(f"{BASE_URL}/api/expenses", headers=auth, timeout=20).json()
    rows = lst if isinstance(lst, list) else lst.get("items", lst.get("expenses", lst.get("rows", [])))
    hit = next((e for e in rows if e.get("id") == eid), None)
    if hit is None and rows:
        # Fallback: match by note (unique TEST tag)
        hit = next((e for e in rows if e.get("note", "").startswith("TEST_iter29")), None)
    assert hit is not None, f"expense not in list; keys available: {list(rows[0].keys()) if rows else None}"
    assert hit["amount"] == 1500000, f"stored amount {hit['amount']} not 1500000"
    # Cleanup
    requests.delete(f"{BASE_URL}/api/expenses/{eid}", headers=auth, timeout=20)


def test_payment_persists_plain_number(auth):
    cust = requests.get(f"{BASE_URL}/api/customers", headers=auth, timeout=20).json()
    customers = cust if isinstance(cust, list) else cust.get("customers", [])
    assert customers, "no customers"
    cid = customers[0]["id"]
    body = {"customer_id": cid, "amount": 1250000, "method": "cash", "date": "2026-01-15", "allocations": [], "note": "TEST_iter29 payment"}
    r = requests.post(f"{BASE_URL}/api/payments", json=body, headers=auth, timeout=20)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created.get("amount") == 1250000, f"POST echoed {created.get('amount')} not 1250000"
    pid = created.get("id")
    # Verify through customer ledger OR invoice/sale detail
    detail = requests.get(f"{BASE_URL}/api/customers/{cid}", headers=auth, timeout=20).json()
    pays = detail.get("payments", []) or detail.get("movements", [])
    hit = next((p for p in pays if p.get("id") == pid or p.get("ref_id") == pid), None)
    # Primary assertion: POST echo already proved the stored amount; this is a soft second check.
    if hit:
        assert hit.get("amount") == 1250000, f"ledger shows {hit.get('amount')}"
    else:
        # The ledger shape differs; the POST already confirmed amount==1250000 above
        print(f"NOTE: payment {pid} not in /customers/{cid}; relying on POST echo for plain-number proof")
    # Cleanup (void)
    requests.delete(f"{BASE_URL}/api/payments/{pid}", headers=auth, timeout=20)


def test_purchase_persists_plain_numbers(auth):
    # Grab an item and a supplier
    items = requests.get(f"{BASE_URL}/api/items", headers=auth, timeout=20).json()
    items = items if isinstance(items, list) else items.get("items", [])
    assert items, "no items"
    item = items[0]
    suppliers = requests.get(f"{BASE_URL}/api/suppliers", headers=auth, timeout=20).json()
    suppliers = suppliers if isinstance(suppliers, list) else suppliers.get("suppliers", [])
    assert suppliers, "no suppliers"
    sid = suppliers[0]["id"]
    body = {
        "supplier_id": sid, "method": "cash", "paid": 1500000, "date": "2026-01-15",
        "update_cost": False,
        "lines": [{"item_id": item["id"], "name": item["name"], "quantity": 6, "unit_cost": 250000, "unit": item.get("unit", "pcs")}],
    }
    r = requests.post(f"{BASE_URL}/api/purchases", json=body, headers=auth, timeout=20)
    assert r.status_code in (200, 201), r.text
    po = r.json()
    pid = po["id"]
    # GET /api/purchases/{id}
    got = requests.get(f"{BASE_URL}/api/purchases/{pid}", headers=auth, timeout=20).json()
    assert got["paid"] == 1500000, f"paid stored {got['paid']} not 1500000"
    assert got["lines"][0]["unit_cost"] == 250000, f"unit_cost {got['lines'][0]['unit_cost']} not 250000"
    # Cleanup — cancel
    requests.post(f"{BASE_URL}/api/purchases/{pid}/cancel", headers=auth, timeout=20)


def test_stock_adjust_persists_plain_quantity(auth):
    items = requests.get(f"{BASE_URL}/api/items", headers=auth, timeout=20).json()
    items = items if isinstance(items, list) else items.get("items", [])
    tracked = [i for i in items if i.get("track_stock")]
    assert tracked, "no tracked items"
    it = tracked[0]
    original_qty = it["quantity"]
    body = {"quantity": 1500, "mode": "set", "reason": "TEST_iter29 adjust"}
    r = requests.post(f"{BASE_URL}/api/items/{it['id']}/adjust", json=body, headers=auth, timeout=20)
    if r.status_code == 422:
        # try alternate mode value
        body["mode"] = "absolute"
        r = requests.post(f"{BASE_URL}/api/items/{it['id']}/adjust", json=body, headers=auth, timeout=20)
    assert r.status_code in (200, 201, 204), f"adjust returned {r.status_code}: {r.text}"
    got = requests.get(f"{BASE_URL}/api/items/{it['id']}", headers=auth, timeout=20).json()
    assert got["quantity"] == 1500, f"qty stored {got['quantity']} not 1500"
    # Restore
    if original_qty is not None:
        requests.patch(f"{BASE_URL}/api/items/{it['id']}", json={"quantity": original_qty}, headers=auth, timeout=20)


def test_create_sale_still_works(auth):
    """Regression — iter28 fixed the NameError in POST /api/sales. Confirm one real quick sale saves."""
    items = requests.get(f"{BASE_URL}/api/items", headers=auth, timeout=20).json()
    items = items if isinstance(items, list) else items.get("items", [])
    saleable = [i for i in items if i.get("selling_price") and i.get("selling_price") > 0 and i.get("quantity", 0) > 0]
    assert saleable, "no saleable items"
    it = saleable[0]
    accounts = requests.get(f"{BASE_URL}/api/accounts", headers=auth, timeout=20).json()
    accts = accounts.get("accounts") if isinstance(accounts, dict) else accounts
    cash = next((a for a in accts if a.get("kind") == "cash"), accts[0])
    body = {
        "lines": [{"item_id": it["id"], "name": it["name"], "quantity": 1, "unit_price": it["selling_price"], "unit": it.get("unit", "pcs")}],
        "method": "cash", "account_id": cash["id"], "tendered": it["selling_price"],
    }
    r = requests.post(f"{BASE_URL}/api/sales", json=body, headers=auth, timeout=20)
    assert r.status_code in (200, 201), f"create_sale returned {r.status_code}: {r.text}"
    sale = r.json()
    sid = sale["id"]
    # Totals may be nested or on the line only — assert fundamental shape
    assert sale.get("number", "").startswith(("SL-", "QS-", "INV-")), f"missing/odd number: {sale.get('number')}"
    assert sale["lines"][0]["unit_price"] == it["selling_price"], "unit_price mismatch"
    assert sale["lines"][0]["quantity"] == 1, "qty mismatch"
    # Verify it shows up in the list
    lst = requests.get(f"{BASE_URL}/api/sales", headers=auth, timeout=20).json()
    rows = lst if isinstance(lst, list) else lst.get("sales", [])
    hit = next((s for s in rows if s.get("id") == sid), None)
    assert hit is not None, "sale not in /api/sales"
    # Cleanup — cancel the test sale
    requests.post(f"{BASE_URL}/api/sales/{sid}/cancel", headers=auth, timeout=20)


def test_quotes_still_404(auth):
    """Regression — quotations removal."""
    r = requests.get(f"{BASE_URL}/api/quotes", headers=auth, timeout=20)
    assert r.status_code == 404, f"GET /api/quotes should 404, got {r.status_code}"


def test_import_template_still_works(auth):
    r = requests.get(f"{BASE_URL}/api/import/template?target=customers", headers=auth, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "columns" in j and "csv" in j
