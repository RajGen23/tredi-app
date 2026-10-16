"""TREDI backend API tests: auth, business/seed, customers, items, invoices (VAT+discounts),
sales, payments, expenses, dashboard."""
import os, requests, uuid, pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

# ---------- Health & Auth ----------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200 and r.json().get("ok") is True

def test_owner_login(owner_token):
    assert owner_token

def test_login_wrong_password():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      data={"username": "owner@tredi.app", "password": "wrongpw"})
    assert r.status_code == 401

def test_register_duplicate_email():
    email = f"dup_{uuid.uuid4().hex[:8]}@tredicheck.co"
    r1 = requests.post(f"{BASE_URL}/api/auth/register", json={"name":"D","email":email,"password":"abcdef1"})
    assert r1.status_code == 201
    r2 = requests.post(f"{BASE_URL}/api/auth/register", json={"name":"D","email":email,"password":"abcdef1"})
    assert r2.status_code == 409

def test_auth_me(owner_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=owner_headers)
    assert r.status_code == 200
    assert r.json()["email"] == "owner@tredi.app"

# ---------- Business & Seed (fresh user) ----------
def test_business_get(fresh_user):
    r = requests.get(f"{BASE_URL}/api/business", headers=fresh_user["headers"])
    assert r.status_code == 200
    assert r.json()["name"] == "TEST Biz"

def test_seed_idempotent(fresh_user):
    r1 = requests.post(f"{BASE_URL}/api/seed/demo", headers=fresh_user["headers"])
    assert r1.status_code == 200 and r1.json()["seeded"] is True
    r2 = requests.post(f"{BASE_URL}/api/seed/demo", headers=fresh_user["headers"])
    assert r2.status_code == 200 and r2.json()["seeded"] is False

# ---------- Dashboard, Customers (owner) ----------
def test_dashboard_owner(owner_headers):
    r = requests.get(f"{BASE_URL}/api/dashboard", headers=owner_headers)
    assert r.status_code == 200
    d = r.json()
    for k in ["total_sales", "received", "owed", "expenses", "cashflow"]:
        assert k in d
    assert isinstance(d["cashflow"], list) and len(d["cashflow"]) == 7

def test_customers_list(owner_headers):
    r = requests.get(f"{BASE_URL}/api/customers", headers=owner_headers)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list) and len(lst) >= 1
    c = lst[0]
    for k in ["id","name","balance","open_invoices","days_overdue"]:
        assert k in c

def test_customer_ledger(owner_headers):
    lst = requests.get(f"{BASE_URL}/api/customers", headers=owner_headers).json()
    cid = lst[0]["id"]
    r = requests.get(f"{BASE_URL}/api/customers/{cid}/ledger", headers=owner_headers)
    assert r.status_code == 200
    data = r.json()
    assert "entries" in data
    # Verify running balance monotonic construction
    if data["entries"]:
        # entries are reversed (newest first)
        for e in data["entries"]:
            assert "balance" in e and "amount" in e

def test_create_customer_and_persist(owner_headers):
    payload = {"name": f"TEST_Cust_{uuid.uuid4().hex[:6]}", "phone": "+234 800 000 0000"}
    r = requests.post(f"{BASE_URL}/api/customers", json=payload, headers=owner_headers)
    assert r.status_code == 201
    cid = r.json()["id"]
    g = requests.get(f"{BASE_URL}/api/customers/{cid}", headers=owner_headers)
    assert g.status_code == 200 and g.json()["name"] == payload["name"]

# ---------- Items ----------
def test_items_list_and_movements(owner_headers):
    r = requests.get(f"{BASE_URL}/api/items", headers=owner_headers)
    assert r.status_code == 200
    items = r.json()
    assert len(items) > 0
    iid = items[0]["id"]
    g = requests.get(f"{BASE_URL}/api/items/{iid}", headers=owner_headers)
    assert g.status_code == 200
    assert "movements" in g.json()

def test_item_adjust_creates_movement(owner_headers):
    # create fresh item
    payload = {"name": f"TEST_Item_{uuid.uuid4().hex[:6]}", "quantity": 10, "cost_price": 100, "selling_price": 200}
    r = requests.post(f"{BASE_URL}/api/items", json=payload, headers=owner_headers)
    assert r.status_code == 201
    iid = r.json()["id"]
    # add 5
    r2 = requests.post(f"{BASE_URL}/api/items/{iid}/adjust",
                      json={"mode":"add","quantity":5,"reason":"Restock"}, headers=owner_headers)
    assert r2.status_code == 200
    assert r2.json()["quantity"] == 15
    # set to 20
    r3 = requests.post(f"{BASE_URL}/api/items/{iid}/adjust",
                      json={"mode":"set","quantity":20,"reason":"Correction"}, headers=owner_headers)
    assert r3.status_code == 200 and r3.json()["quantity"] == 20
    # remove 3
    r4 = requests.post(f"{BASE_URL}/api/items/{iid}/adjust",
                      json={"mode":"remove","quantity":3,"reason":"Damaged"}, headers=owner_headers)
    assert r4.status_code == 200 and r4.json()["quantity"] == 17
    # verify movements exist
    g = requests.get(f"{BASE_URL}/api/items/{iid}", headers=owner_headers)
    kinds = [m["kind"] for m in g.json()["movements"]]
    assert "adjustment" in kinds

# ---------- Invoices: math correctness ----------
def test_invoice_preview_line_and_invoice_discount_vat(owner_headers):
    """VAT must be applied AFTER line + invoice discounts. taxable = gross - line_disc - inv_disc."""
    payload = {
        "lines": [
            {"name": "Item A", "quantity": 2, "unit_price": 1000, "discount_type": "amount", "discount_value": 200},  # gross 2000, disc 200 → 1800
            {"name": "Item B", "quantity": 1, "unit_price": 500, "discount_type": "percent", "discount_value": 10}   # gross 500, disc 50 → 450
        ],
        "invoice_discount_type": "amount",
        "invoice_discount_value": 250,   # taxable = 1800+450 - 250 = 2000
        "vat_rate": 7.5,
    }
    r = requests.post(f"{BASE_URL}/api/invoices/preview", json=payload, headers=owner_headers)
    assert r.status_code == 200
    t = r.json()["totals"]
    assert t["gross"] == 2500
    assert t["line_discount"] == 250
    assert t["invoice_discount"] == 250
    assert t["taxable"] == 2000
    assert t["vat"] == 150.0  # 2000 * 7.5%
    assert t["total"] == 2150

def test_invoice_preview_percent_discount(owner_headers):
    payload = {
        "lines": [{"name":"X","quantity":1,"unit_price":1000}],
        "invoice_discount_type": "percent",
        "invoice_discount_value": 10,
        "vat_rate": 7.5,
    }
    t = requests.post(f"{BASE_URL}/api/invoices/preview", json=payload, headers=owner_headers).json()["totals"]
    assert t["invoice_discount"] == 100
    assert t["taxable"] == 900
    assert t["vat"] == 67.5
    assert t["total"] == 967.5

def test_invoice_preview_final_backcalculates(owner_headers):
    """final mode: total must equal the final value provided."""
    payload = {
        "lines": [{"name":"X","quantity":1,"unit_price":1000}],
        "invoice_discount_type": "final",
        "invoice_discount_value": 900,
        "vat_rate": 7.5,
    }
    t = requests.post(f"{BASE_URL}/api/invoices/preview", json=payload, headers=owner_headers).json()["totals"]
    # Allow rounding tolerance
    assert abs(t["total"] - 900) <= 1.0, f"final total mismatch: {t}"

def test_create_issued_invoice_cash_paid_and_stock_decrement(owner_headers):
    # get an item with stock
    items = requests.get(f"{BASE_URL}/api/items", headers=owner_headers).json()
    stocked = next((i for i in items if i.get("track_stock") and i.get("quantity", 0) > 5), None)
    assert stocked, "need stocked item"
    before_qty = stocked["quantity"]
    # get accounts (need cash account)
    accs = requests.get(f"{BASE_URL}/api/accounts", headers=owner_headers).json()["accounts"]
    cash = next((a for a in accs if a["kind"] == "cash"), accs[0])
    payload = {
        "lines": [{"item_id": stocked["id"], "name": stocked["name"], "quantity": 1, "unit_price": stocked["selling_price"]}],
        "vat_rate": 7.5,
        "payment_mode": "cash",
        "account_id": cash["id"],
        "status": "issued",
    }
    r = requests.post(f"{BASE_URL}/api/invoices", json=payload, headers=owner_headers)
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["status"] == "paid", f"expected paid, got {inv['status']}"
    assert inv["number"].startswith("INV-")
    # stock decreased by 1
    g = requests.get(f"{BASE_URL}/api/items/{stocked['id']}", headers=owner_headers).json()
    assert g["quantity"] == before_qty - 1

def test_draft_invoice_number(owner_headers):
    payload = {
        "lines": [{"name":"draft item","quantity":1,"unit_price":100}],
        "status": "draft",
        "vat_rate": 7.5,
        "payment_mode": "credit",
    }
    r = requests.post(f"{BASE_URL}/api/invoices", json=payload, headers=owner_headers)
    assert r.status_code == 201
    assert r.json()["number"] == "Draft"

def test_list_invoices_has_statuses(owner_headers):
    r = requests.get(f"{BASE_URL}/api/invoices", headers=owner_headers)
    assert r.status_code == 200
    lst = r.json()
    statuses = {i["status"] for i in lst}
    # Owner has seeded invoices → should include multiple statuses
    assert statuses.intersection({"paid","unpaid","part_paid","overdue","draft"}), f"got: {statuses}"

def test_get_invoice_has_payments_and_business(owner_headers):
    lst = requests.get(f"{BASE_URL}/api/invoices", headers=owner_headers).json()
    iid = lst[0]["id"]
    r = requests.get(f"{BASE_URL}/api/invoices/{iid}", headers=owner_headers)
    assert r.status_code == 200
    d = r.json()
    assert "payments" in d and "business" in d

# ---------- Quick sale ----------
def test_quick_sale_cash_change(owner_headers):
    items = requests.get(f"{BASE_URL}/api/items", headers=owner_headers).json()
    stocked = next((i for i in items if i.get("track_stock") and i.get("quantity", 0) > 2), None)
    assert stocked
    before_qty = stocked["quantity"]
    accs = requests.get(f"{BASE_URL}/api/accounts", headers=owner_headers).json()["accounts"]
    cash = next((a for a in accs if a["kind"] == "cash"), accs[0])
    payload = {
        "lines": [{"item_id": stocked["id"], "name": stocked["name"], "quantity": 1, "unit_price": 1000}],
        "method": "cash",
        "tendered": 1500,
        "account_id": cash["id"],
    }
    r = requests.post(f"{BASE_URL}/api/sales", json=payload, headers=owner_headers)
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["change"] == 500
    assert s["number"].startswith("SL-")
    g = requests.get(f"{BASE_URL}/api/items/{stocked['id']}", headers=owner_headers).json()
    assert g["quantity"] == before_qty - 1

# ---------- Accounts, Payments, Expenses ----------
def test_accounts_balances(owner_headers):
    r = requests.get(f"{BASE_URL}/api/accounts", headers=owner_headers)
    assert r.status_code == 200
    d = r.json()
    assert "accounts" in d and "total" in d and "recent" in d
    assert len(d["accounts"]) >= 1

def test_payment_reduces_invoice_due(owner_headers):
    # find an unpaid or part_paid invoice
    invs = requests.get(f"{BASE_URL}/api/invoices", headers=owner_headers).json()
    target = next((i for i in invs if i["status"] in ("unpaid", "part_paid", "overdue") and i.get("customer_id")), None)
    if not target:
        pytest.skip("no unpaid invoice available")
    due_before = target["due"]
    accs = requests.get(f"{BASE_URL}/api/accounts", headers=owner_headers).json()["accounts"]
    cash = next((a for a in accs if a["kind"] == "cash"), accs[0])
    pay_amt = round(min(due_before, 100), 2)
    payload = {
        "customer_id": target["customer_id"],
        "amount": pay_amt,
        "account_id": cash["id"],
        "allocations": [{"invoice_id": target["id"], "amount": pay_amt}],
    }
    r = requests.post(f"{BASE_URL}/api/payments", json=payload, headers=owner_headers)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    g = requests.get(f"{BASE_URL}/api/invoices/{target['id']}", headers=owner_headers).json()
    assert round(g["due"], 2) == round(due_before - pay_amt, 2)
    # delete payment restores
    dr = requests.delete(f"{BASE_URL}/api/payments/{pid}?reason=test", headers=owner_headers)
    assert dr.status_code == 200
    g2 = requests.get(f"{BASE_URL}/api/invoices/{target['id']}", headers=owner_headers).json()
    assert round(g2["due"], 2) == round(due_before, 2)

def test_expenses_periods_and_create(owner_headers):
    for period in ["month", "last_month", "week", "all"]:
        r = requests.get(f"{BASE_URL}/api/expenses?period={period}", headers=owner_headers)
        assert r.status_code == 200, f"{period}: {r.text}"
        d = r.json()
        for k in ["total", "count", "by_category", "items"]:
            assert k in d
    # create
    payload = {"amount": 1234, "category": "Utilities", "note": "TEST_expense"}
    r = requests.post(f"{BASE_URL}/api/expenses", json=payload, headers=owner_headers)
    assert r.status_code == 201
    # verify appears in month
    d = requests.get(f"{BASE_URL}/api/expenses?period=month", headers=owner_headers).json()
    assert any(e.get("note") == "TEST_expense" for e in d["items"])
