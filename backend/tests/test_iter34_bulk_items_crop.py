"""Iteration 34 — bulk item creation, auto-opening PO, PO new-item line, upfront expense sync.

Covers backend-only behaviour for:
  * POST /api/items/bulk -> creates N items + one 'opening' PO; 400 if no names
  * POST /api/items with quantity>0 -> creates an 'opening' PO (visible in GET /api/purchases)
  * POST /api/purchases with new-name line (item_id=null) -> creates stock item at given selling price
  * POST /api/purchases paid>0 + transfer + account_id -> lowers account balance, PO payments shows 'Paid on this order'
"""
import os
from pathlib import Path
import pytest
import requests

# Load /app/frontend/.env to pick up EXPO_PUBLIC_BACKEND_URL at test-collect time
_env = Path("/app/frontend/.env")
if _env.exists():
    for line in _env.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            os.environ.setdefault("EXPO_PUBLIC_BACKEND_URL", line.split("=", 1)[1].strip().strip('"'))
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL must be set"

CRED = {"username": "owner@tredi.app", "password": "tredi1234"}
PREFIX = "ZZ_iter34"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", data=CRED)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def account(hdr):
    """Pick first non-dormant account for transfer tests."""
    r = requests.get(f"{BASE_URL}/api/accounts", headers=hdr)
    assert r.status_code == 200, r.text
    accs = [a for a in r.json()["accounts"] if not a.get("dormant")]
    assert accs, "need at least one open account"
    return accs[0]


# -------- bulk items --------
class TestBulkItems:
    def test_bulk_rejects_empty(self, hdr):
        r = requests.post(f"{BASE_URL}/api/items/bulk", headers=hdr,
                          json={"supplier": "", "items": [{"name": "   ", "quantity": 0, "cost_price": 0, "selling_price": 0}]})
        assert r.status_code == 400, r.text

    def test_bulk_creates_items_and_single_opening_po(self, hdr):
        payload = {
            "supplier": f"{PREFIX}_supplier",
            "category": "General",
            "unit": "Piece",
            "items": [
                {"name": f"{PREFIX}_apple", "quantity": 5, "cost_price": 100, "selling_price": 150},
                {"name": f"{PREFIX}_mango", "quantity": 3, "cost_price": 200, "selling_price": 300},
                {"name": "   ", "quantity": 1, "cost_price": 1, "selling_price": 1},  # ignored
                {"name": f"{PREFIX}_noqty", "quantity": 0, "cost_price": 50, "selling_price": 70},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/items/bulk", headers=hdr, json=payload)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["count"] == 3, body
        names = {i["name"] for i in body["items"]}
        assert {f"{PREFIX}_apple", f"{PREFIX}_mango", f"{PREFIX}_noqty"} == names

        # verify via GET
        r2 = requests.get(f"{BASE_URL}/api/items", headers=hdr)
        gnames = {i["name"] for i in r2.json()}
        assert f"{PREFIX}_apple" in gnames
        assert f"{PREFIX}_noqty" in gnames

        # verify a single opening PO for the two items with qty>0 exists under this supplier
        p = requests.get(f"{BASE_URL}/api/purchases", headers=hdr)
        assert p.status_code == 200, p.text
        matching = [po for po in p.json()["purchases"]
                    if po.get("method") == "opening"
                    and po.get("supplier_name") == f"{PREFIX}_supplier"]
        assert matching, "expected one 'opening' PO with the given supplier"
        # The latest one should contain exactly our 2 qty>0 items
        po = matching[0]
        line_names = {l["name"] for l in po["lines"]}
        assert f"{PREFIX}_apple" in line_names
        assert f"{PREFIX}_mango" in line_names
        assert f"{PREFIX}_noqty" not in line_names
        assert round(po["total"], 2) == round(5 * 100 + 3 * 200, 2)
        assert round(po["paid"], 2) == round(po["total"], 2)
        assert round((po.get("total") or 0) - (po.get("paid") or 0), 2) == 0

        # GET /api/purchases/{id} -> account_name 'Opening stock' only when no supplier given.
        d = requests.get(f"{BASE_URL}/api/purchases/{po['id']}", headers=hdr).json()
        # with explicit supplier, supplier_name should match that supplier
        assert d["supplier_name"] == f"{PREFIX}_supplier"
        assert d["method"] == "opening"


# -------- single item opening PO --------
class TestSingleItemOpening:
    def test_item_qty_creates_opening_po(self, hdr):
        r = requests.post(f"{BASE_URL}/api/items", headers=hdr, json={
            "name": f"{PREFIX}_single_q", "quantity": 2, "cost_price": 50, "selling_price": 80,
        })
        assert r.status_code == 201, r.text
        p = requests.get(f"{BASE_URL}/api/purchases", headers=hdr).json()
        pos = [po for po in p["purchases"]
               if po.get("method") == "opening"
               and any(l["name"] == f"{PREFIX}_single_q" for l in po.get("lines", []))]
        assert pos, "quantity>0 single item should produce an 'opening' PO"
        po_id = pos[0]["id"]
        d = requests.get(f"{BASE_URL}/api/purchases/{po_id}", headers=hdr).json()
        # No supplier provided -> fallback supplier name 'Opening stock'
        assert d["supplier_name"] == "Opening stock"
        assert d["account_name"] == "Opening stock"

    def test_item_zero_qty_no_po(self, hdr):
        r = requests.post(f"{BASE_URL}/api/items", headers=hdr, json={
            "name": f"{PREFIX}_single_zero", "quantity": 0, "cost_price": 10, "selling_price": 15,
        })
        assert r.status_code == 201, r.text
        p = requests.get(f"{BASE_URL}/api/purchases", headers=hdr).json()
        bad = [po for po in p["purchases"]
               if any(l["name"] == f"{PREFIX}_single_zero" for l in po.get("lines", []))]
        assert not bad, "qty=0 must not produce a PO"


# -------- PO with new item + account impact --------
class TestPurchaseNewLineAndAccount:
    def test_purchase_creates_stock_item_and_lowers_account(self, hdr, account):
        # ensure supplier
        slist = requests.get(f"{BASE_URL}/api/suppliers", headers=hdr).json().get("suppliers", [])
        sup = next((s for s in slist if s["name"] == f"{PREFIX}_supplier"), None)
        if not sup:
            r = requests.post(f"{BASE_URL}/api/suppliers", headers=hdr, json={"name": f"{PREFIX}_supplier"})
            assert r.status_code == 201, r.text
            sup = r.json()
        supplier_id = sup["id"]

        bal_before = round(account["balance"], 2)
        line_name = f"{PREFIX}_po_new_item"
        paid = 500.0
        r = requests.post(f"{BASE_URL}/api/purchases", headers=hdr, json={
            "supplier_id": supplier_id,
            "lines": [{"item_id": None, "name": line_name, "quantity": 4, "unit_cost": 125, "selling_price": 199}],
            "paid": paid,
            "method": "transfer",
            "account_id": account["id"],
            "update_cost": True,
        })
        assert r.status_code == 201, r.text
        po = r.json()
        pid = po["id"]

        # verify stock item exists with selling_price=199 and qty 4
        items = requests.get(f"{BASE_URL}/api/items", headers=hdr).json()
        new_item = next((i for i in items if i["name"] == line_name), None)
        assert new_item is not None, "purchase with null item_id must create a stock item"
        assert float(new_item.get("selling_price") or 0) == 199.0
        assert float(new_item.get("quantity_all") or 0) >= 4.0

        # verify account balance dropped by paid
        accs = requests.get(f"{BASE_URL}/api/accounts", headers=hdr).json()["accounts"]
        updated = next(a for a in accs if a["id"] == account["id"])
        assert round(bal_before - updated["balance"], 2) == round(paid, 2), (bal_before, updated["balance"], paid)

        # PO payments should include an 'Paid on this order' entry
        d = requests.get(f"{BASE_URL}/api/purchases/{pid}", headers=hdr).json()
        notes = [p.get("note") for p in d.get("payments", [])]
        assert any(n == "Paid on this order" for n in notes), notes

        # PUT re-states expense if we lower paid to 200
        put = requests.put(f"{BASE_URL}/api/purchases/{pid}", headers=hdr, json={
            "supplier_id": supplier_id,
            "lines": [{"item_id": new_item["id"], "name": line_name, "quantity": 4, "unit_cost": 125}],
            "paid": 200,
            "method": "transfer",
            "account_id": account["id"],
            "update_cost": False,
        })
        assert put.status_code == 200, put.text
        accs2 = requests.get(f"{BASE_URL}/api/accounts", headers=hdr).json()["accounts"]
        updated2 = next(a for a in accs2 if a["id"] == account["id"])
        # Net impact now 200 instead of 500 -> account should rebound by 300
        assert round(bal_before - updated2["balance"], 2) == 200.0, (bal_before, updated2["balance"])
