"""Iteration 28 — four user items:
   1) Cost freeze: changing an item's cost_price must not move historical profit/COGS.
   2) Quotations removed: /api/quotes endpoints 404; shortcuts does not include a quote key.
   3) Currency: amounts save as plain numbers (handled on the client; backend verified via round-trip of the GET).
   4) Import template: GET /api/import/template returns columns+csv+filename for customers & items;
      the template csv is round-tripped through /api/import/preview and the sample row is READY.
   Clean-up: restores item cost to original and cancels/deletes any test rows we create.
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/")
OWNER = {"username": "owner@tredi.app", "password": "tredi1234"}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", data=OWNER,
               headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------------------------------------------------------- ITEM 1 cost freeze
class TestCostFreeze:
    def test_cost_change_does_not_move_history(self, api):
        # Pick an item that actually has sales history
        items = api.get(f"{BASE_URL}/api/items").json()
        assert len(items) > 5
        # Pick an item with a decent cost_price (not 0)
        target = None
        for it in items:
            if (it.get("cost_price") or 0) >= 1000:
                target = it
                break
        assert target, "No priced item available"
        iid = target["id"]
        original_cost = float(target["cost_price"])

        # Snapshot the three figures that must NOT move
        before_item = api.get(f"{BASE_URL}/api/items/{iid}").json()
        before_profit = before_item.get("profit") or 0
        before_pnl = api.get(f"{BASE_URL}/api/reports/pnl?period=year").json()
        before_cogs = before_pnl.get("cogs") or 0
        before_gp = before_pnl.get("gross_profit") or 0

        before_products = api.get(f"{BASE_URL}/api/reports/products?period=year").json()
        # find this item's row
        rows = before_products if isinstance(before_products, list) else before_products.get("rows", [])
        before_row = next((r for r in rows if r.get("id") == iid or r.get("item_id") == iid or r.get("name") == target["name"]), None)
        before_row_profit = (before_row or {}).get("profit", 0) if before_row else 0
        before_row_cost = (before_row or {}).get("cost", 0) if before_row else 0

        new_cost = round(original_cost * 1.3 + 1000, 2)
        try:
            # change the item cost
            payload = {**target, "cost_price": new_cost}
            # strip fields the server computes
            for drop in ("id", "profit", "stock_value", "created_at", "updated_at", "quantity"):
                payload.pop(drop, None)
            r = api.put(f"{BASE_URL}/api/items/{iid}", json=payload)
            assert r.status_code in (200, 201), r.text

            after_item = api.get(f"{BASE_URL}/api/items/{iid}").json()
            after_profit = after_item.get("profit") or 0
            after_pnl = api.get(f"{BASE_URL}/api/reports/pnl?period=year").json()
            after_cogs = after_pnl.get("cogs") or 0
            after_gp = after_pnl.get("gross_profit") or 0
            after_products = api.get(f"{BASE_URL}/api/reports/products?period=year").json()
            rows_a = after_products if isinstance(after_products, list) else after_products.get("rows", [])
            after_row = next((r for r in rows_a if r.get("id") == iid or r.get("item_id") == iid or r.get("name") == target["name"]), None)
            after_row_profit = (after_row or {}).get("profit", 0) if after_row else 0

            # History must be frozen (allow 1 NGN rounding slack)
            assert abs(after_cogs - before_cogs) <= 1, f"COGS moved from {before_cogs} to {after_cogs}"
            assert abs(after_gp - before_gp) <= 1, f"Gross profit moved from {before_gp} to {after_gp}"
            assert abs(after_profit - before_profit) <= 1, f"Item profit moved from {before_profit} to {after_profit}"
            if before_row and after_row:
                assert abs(after_row_profit - before_row_profit) <= 1, f"Product row profit moved {before_row_profit} -> {after_row_profit}"
        finally:
            # restore
            payload = {**target, "cost_price": original_cost}
            for drop in ("id", "profit", "stock_value", "created_at", "updated_at", "quantity"):
                payload.pop(drop, None)
            api.put(f"{BASE_URL}/api/items/{iid}", json=payload)

    def test_new_sale_stamps_new_cost(self, api):
        # Pick an item in stock
        items = api.get(f"{BASE_URL}/api/items").json()
        target = next((it for it in items if (it.get("quantity") or 0) >= 2 and (it.get("cost_price") or 0) >= 1000 and (it.get("selling_price") or 0) >= 1000), None)
        if not target:
            pytest.skip("No item in stock")
        iid = target["id"]
        orig_cost = float(target["cost_price"])
        new_cost = round(orig_cost + 500, 2)
        sale_id = None
        try:
            # Bump cost
            p = {**target, "cost_price": new_cost}
            for drop in ("id", "profit", "stock_value", "created_at", "updated_at", "quantity"):
                p.pop(drop, None)
            r = api.put(f"{BASE_URL}/api/items/{iid}", json=p)
            assert r.status_code in (200, 201)

            # Create a quick sale of 1 unit
            payload = {"lines": [{"item_id": iid, "name": target["name"], "quantity": 1, "unit_price": target["selling_price"]}],
                       "method": "cash", "tendered": float(target["selling_price"]), "change": 0}
            r = api.post(f"{BASE_URL}/api/sales", json=payload)
            assert r.status_code in (200, 201), r.text
            sale = r.json()
            sale_id = sale["id"]
            got = api.get(f"{BASE_URL}/api/sales/{sale_id}").json()
            # cost_at_sale on the single line must be the new cost
            stamped = (got.get("lines") or [{}])[0].get("cost_at_sale")
            assert stamped is not None, f"cost_at_sale missing: {got}"
            assert abs(float(stamped) - new_cost) <= 1, f"stamped {stamped} != new_cost {new_cost}"
        finally:
            if sale_id:
                api.post(f"{BASE_URL}/api/sales/{sale_id}/cancel", json={"reason": "test cleanup"})
            # restore
            p = {**target, "cost_price": orig_cost}
            for drop in ("id", "profit", "stock_value", "created_at", "updated_at", "quantity"):
                p.pop(drop, None)
            api.put(f"{BASE_URL}/api/items/{iid}", json=p)


# ---------------------------------------------------------------- ITEM 2 quotes gone
class TestQuotesGone:
    def test_list_quotes_404(self, api):
        r = api.get(f"{BASE_URL}/api/quotes")
        assert r.status_code == 404, f"GET /api/quotes should be 404, got {r.status_code}"

    def test_create_quote_404(self, api):
        r = api.post(f"{BASE_URL}/api/quotes", json={"customer_id": None, "lines": []})
        assert r.status_code == 404, f"POST /api/quotes should be 404, got {r.status_code}"

    def test_get_quote_404(self, api):
        r = api.get(f"{BASE_URL}/api/quotes/000000000000000000000000")
        assert r.status_code == 404

    def test_convert_quote_404(self, api):
        r = api.post(f"{BASE_URL}/api/quotes/000000000000000000000000/convert", json={})
        assert r.status_code == 404

    def test_shortcuts_has_no_quote_key(self, api):
        r = api.get(f"{BASE_URL}/api/shortcuts")
        assert r.status_code == 200, r.text
        text = r.text.lower()
        assert '"quote"' not in text, f"shortcuts still mentions quote: {text[:400]}"

    def test_invoices_still_work(self, api):
        r = api.get(f"{BASE_URL}/api/invoices?limit=1")
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------- ITEM 3 currency plain numbers end-to-end
class TestCurrencyPlainNumbers:
    def test_expense_saves_plain_number(self, api):
        amount = 1500000
        exp_id = None
        try:
            r = api.post(f"{BASE_URL}/api/expenses", json={"amount": amount, "category": "TEST", "note": "TEST_iter28 currency"})
            assert r.status_code in (200, 201), r.text
            created = r.json()
            exp_id = created.get("id")
            # The create response already carries the saved amount — that is the
            # most direct round-trip and avoids relying on list pagination.
            assert abs(float(created["amount"]) - amount) < 0.01, f"amount came back as {created['amount']}"
            # Also try the list for belt-and-braces (don't fail if truncated)
            got_list = api.get(f"{BASE_URL}/api/expenses").json()
            rows = got_list if isinstance(got_list, list) else got_list.get("rows", [])
            row = next((x for x in rows if x.get("id") == exp_id), None)
            if row:
                assert abs(float(row["amount"]) - amount) < 0.01, f"list amount came back as {row['amount']}"
        finally:
            if exp_id:
                api.delete(f"{BASE_URL}/api/expenses/{exp_id}")

    def test_item_saves_plain_cost_and_price(self, api):
        payload = {"name": "TEST_iter28 money item", "kind": "product", "category": "TEST",
                   "unit": "Piece", "cost_price": 1500000, "selling_price": 1750000,
                   "quantity": 0, "track_stock": True}
        item_id = None
        try:
            r = api.post(f"{BASE_URL}/api/items", json=payload)
            assert r.status_code in (200, 201), r.text
            item_id = r.json()["id"]
            g = api.get(f"{BASE_URL}/api/items/{item_id}").json()
            assert abs(float(g["cost_price"]) - 1500000) < 0.01, f"cost came back {g['cost_price']}"
            assert abs(float(g["selling_price"]) - 1750000) < 0.01, f"selling came back {g['selling_price']}"
        finally:
            if item_id:
                api.delete(f"{BASE_URL}/api/items/{item_id}")

    def test_vat_rate_still_accepts_decimal(self, api):
        # Non-money decimal: VAT rate 7.5
        current = api.get(f"{BASE_URL}/api/settings/invoice").json()
        original_vat = current.get("vat_rate", 7.5)
        try:
            r = api.put(f"{BASE_URL}/api/settings/invoice", json={**current, "vat_rate": 7.5})
            assert r.status_code in (200, 201), r.text
            back = api.get(f"{BASE_URL}/api/settings/invoice").json()
            assert abs(float(back["vat_rate"]) - 7.5) < 0.001
        finally:
            # restore just in case
            api.put(f"{BASE_URL}/api/settings/invoice", json={**current, "vat_rate": original_vat})


# ---------------------------------------------------------------- ITEM 4 import template
class TestImportTemplate:
    def test_customers_template_shape(self, api):
        r = api.get(f"{BASE_URL}/api/import/template?target=customers")
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(["columns", "csv", "filename"]).issubset(d.keys())
        assert d["columns"] == ["name", "phone", "email", "address", "opening_balance"]
        assert d["filename"].endswith(".csv")
        assert "name,phone,email,address,opening_balance" in d["csv"]

    def test_items_template_shape(self, api):
        r = api.get(f"{BASE_URL}/api/import/template?target=items")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["columns"] == ["name", "category", "unit", "cost_price", "selling_price", "quantity", "barcode", "photo_url"]
        assert d["filename"].endswith(".csv")

    def test_items_template_round_trip_through_preview(self, api):
        tpl = api.get(f"{BASE_URL}/api/import/template?target=items").json()
        # Parse the template CSV ourselves (same as the UI would)
        lines = [l for l in tpl["csv"].split("\n") if l.strip()]
        header = [h.strip() for h in lines[0].split(",")]
        data_row = [c.strip() for c in lines[1].split(",")]
        values = dict(zip(header, data_row))
        # Make the name unique so we don't collide with existing stock
        values["name"] = "TEST_iter28 template row"
        payload = {"target": "items", "filename": tpl["filename"],
                   "rows": [{"row": 1, "values": values}]}
        r = api.post(f"{BASE_URL}/api/import/preview", json=payload)
        assert r.status_code == 200, r.text
        rep = r.json()
        assert rep["ready_count"] == 1, f"Template row should be ready, got {rep}"
        assert rep["issue_count"] == 0, f"No issues expected, got {rep}"

    def test_customers_template_round_trip_through_preview(self, api):
        tpl = api.get(f"{BASE_URL}/api/import/template?target=customers").json()
        lines = [l for l in tpl["csv"].split("\n") if l.strip()]
        header = [h.strip() for h in lines[0].split(",")]
        data_row = [c.strip() for c in lines[1].split(",")]
        values = dict(zip(header, data_row))
        values["name"] = "TEST_iter28 template customer"
        values["phone"] = "+234 900 000 0028"  # unique to avoid colliding with the seeded Grace Mwangi row
        payload = {"target": "customers", "filename": tpl["filename"],
                   "rows": [{"row": 1, "values": values}]}
        r = api.post(f"{BASE_URL}/api/import/preview", json=payload)
        assert r.status_code == 200, r.text
        rep = r.json()
        assert rep["ready_count"] == 1, f"Customer template row should be ready, got {rep}"


# ---------------------------------------------------------------- Regression — PDF formats & plan
class TestRegression:
    def test_invoice_pdf_detail_still_returns(self, api):
        inv_list = api.get(f"{BASE_URL}/api/invoices?limit=1").json()
        inv = (inv_list if isinstance(inv_list, list) else inv_list.get("rows", []))[0]
        r = api.get(f"{BASE_URL}/api/invoices/{inv['id']}")
        assert r.status_code == 200

    def test_plan_page_loads(self, api):
        r = api.get(f"{BASE_URL}/api/subscription")
        assert r.status_code == 200
        assert r.json().get("plan")
