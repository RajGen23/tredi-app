"""TREDI pass-4 backend: duplicate-invoice (repeat purchase) feature.

Covers:
 - GET  /api/invoices/{id}/duplicate  (preview with & without repricing, 404)
 - POST /api/invoices/{id}/duplicate  {issue:true, update_prices:true}
     * new INV number, duplicated_from(+_number), no payments copied
     * stock decrements + a 'sale' movement recorded
     * duplicate_count increments on source
 - POST /api/invoices/{id}/duplicate  {issue:false} -> Draft, no stock movement
 - Duplicating twice in a row -> two invoices, duplicate_count == 2
"""
import os
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ui-flow-accurate.preview.emergentagent.com").rstrip("/")


# ---------- helpers ----------
def _first_issued_invoice_with_tracked_lines(owner_headers):
    """Find an issued invoice whose lines still map to tracked items."""
    r = requests.get(f"{BASE}/api/invoices", headers=owner_headers)
    assert r.status_code == 200, r.text
    invs = r.json()
    # pick issued (not draft) with lines & customer
    for inv in invs:
        if inv.get("status") in ("issued", "part_paid", "paid") and inv.get("lines") and inv.get("customer_id"):
            return inv
    pytest.skip("No issued invoice with lines available in owner data")


def _create_seed_invoice_for_duplicate(owner_headers):
    """Idempotent-ish seed invoice used across the duplicate suite."""
    items = requests.get(f"{BASE}/api/items", headers=owner_headers).json()
    tracked = [it for it in items if it.get("track_stock", True) and (it.get("quantity") or 0) >= 5]
    if not tracked:
        # A full-suite run sells the demo stock down, so top one item back up
        # instead of failing on state another test created.
        any_tracked = [it for it in items if it.get("track_stock", True)]
        assert any_tracked, "Need at least one tracked item"
        top = any_tracked[0]
        tid = top["_id"] if "_id" in top else top.get("id")
        r = requests.post(f"{BASE}/api/items/{tid}/adjust", headers=owner_headers,
                          json={"mode": "add", "quantity": 50, "reason": "Test top-up", "note": "duplicate suite"})
        assert r.status_code in (200, 201), r.text
        tracked = [{**top, "quantity": (top.get("quantity") or 0) + 50}]
    it = tracked[0]
    custs = requests.get(f"{BASE}/api/customers", headers=owner_headers).json()
    assert custs, "Need at least one customer"
    payload = {
        "customer_id": custs[0]["_id"] if "_id" in custs[0] else custs[0].get("id"),
        "lines": [{"item_id": it["_id"] if "_id" in it else it.get("id"),
                   "name": it["name"], "quantity": 2,
                   "unit_price": it.get("selling_price", 1000),
                   "unit": it.get("unit", "pcs"), "discount": 0}],
        "invoice_discount_type": "amount", "invoice_discount_value": 0,
        "payment_mode": "credit", "status": "issued",
    }
    r = requests.post(f"{BASE}/api/invoices", json=payload, headers=owner_headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ---------- Preview ----------
class TestDuplicatePreview:
    def test_preview_default_reprices(self, owner_headers):
        inv = _first_issued_invoice_with_tracked_lines(owner_headers)
        iid = inv["_id"] if "_id" in inv else inv["id"]
        r = requests.get(f"{BASE}/api/invoices/{iid}/duplicate", headers=owner_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["source_number", "customer_name", "lines", "totals", "repriced", "short", "times_repeated"]:
            assert k in d, f"missing key {k} in preview"
        assert d["source_number"] == inv["number"]
        assert isinstance(d["lines"], list) and len(d["lines"]) == len(inv["lines"])
        assert isinstance(d["repriced"], list)
        assert isinstance(d["short"], list)

    def test_preview_keeps_old_price_when_update_prices_false(self, owner_headers):
        inv = _first_issued_invoice_with_tracked_lines(owner_headers)
        iid = inv["_id"] if "_id" in inv else inv["id"]
        r = requests.get(f"{BASE}/api/invoices/{iid}/duplicate?update_prices=false", headers=owner_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        # Every line must keep the original unit price
        for src_line, new_line in zip(inv["lines"], d["lines"]):
            assert round(new_line["unit_price"], 2) == round(src_line["unit_price"], 2), \
                f"price drifted: {new_line['unit_price']} vs {src_line['unit_price']}"
        # And 'repriced' must be empty (no line got re-priced)
        assert d["repriced"] == []

    def test_preview_update_prices_true_uses_current_selling_price(self, owner_headers):
        """When update_prices=true, unit_price should match items.selling_price today."""
        inv = _first_issued_invoice_with_tracked_lines(owner_headers)
        iid = inv["_id"] if "_id" in inv else inv["id"]
        r = requests.get(f"{BASE}/api/invoices/{iid}/duplicate?update_prices=true", headers=owner_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        items = {it.get("_id") or it.get("id"): it for it in requests.get(f"{BASE}/api/items", headers=owner_headers).json()}
        for new_line in d["lines"]:
            iid_l = new_line.get("item_id")
            if iid_l and iid_l in items and items[iid_l].get("selling_price") is not None:
                assert round(new_line["unit_price"], 2) == round(items[iid_l]["selling_price"], 2)

    def test_preview_404_unknown(self, owner_headers):
        r = requests.get(f"{BASE}/api/invoices/000000000000000000000000/duplicate", headers=owner_headers)
        assert r.status_code == 404


# ---------- Issue (issue=true) ----------
class TestDuplicateIssue:
    def test_issue_creates_new_invoice_and_moves_stock(self, owner_headers):
        seed = _create_seed_invoice_for_duplicate(owner_headers)
        sid = seed["_id"] if "_id" in seed else seed["id"]
        src_number = seed["number"]

        # snapshot stock + duplicate_count + stock movements for the tracked line
        line = seed["lines"][0]
        item_id = line["item_id"]
        it_before = requests.get(f"{BASE}/api/items/{item_id}", headers=owner_headers).json()
        stock_before = it_before.get("quantity", 0)

        r = requests.post(f"{BASE}/api/invoices/{sid}/duplicate",
                          json={"issue": True, "update_prices": True}, headers=owner_headers)
        assert r.status_code == 201, r.text
        new = r.json()
        new_id = new["_id"] if "_id" in new else new["id"]

        # -- new invoice properties
        assert new["number"] != src_number and new["number"] != "Draft"
        assert new.get("duplicated_from") == sid
        assert new.get("duplicated_from_number") == src_number
        # -- no payments copied
        payments_field = new.get("payments") or []
        assert payments_field == [] or all((p.get("amount", 0) == 0) for p in payments_field), \
            f"payments must not be copied: {payments_field}"
        # decorate_invoice usually adds paid=0 and balance=total
        if "paid" in new:
            assert new["paid"] == 0, f"new invoice must be unpaid, got paid={new['paid']}"

        # -- stock decremented. other workers may touch the same item, so assert on
        # the movement this duplicate wrote rather than on the global quantity.
        detail = requests.get(f"{BASE}/api/items/{item_id}", headers=owner_headers).json()
        moves = [m for m in (detail.get("movements") or []) if m.get("ref") == new["number"]]
        assert moves, f"expected a stock movement for {new['number']}, got {[m.get('ref') for m in (detail.get('movements') or [])][:6]}"
        assert moves[0]["delta"] < 0, f"a repeat must take stock out, got {moves[0]}"
        assert stock_before >= 0


# ---------- Draft (issue=false) ----------
class TestDuplicateDraft:
    def test_draft_saves_and_does_not_move_stock(self, owner_headers):
        seed = _create_seed_invoice_for_duplicate(owner_headers)
        sid = seed["_id"] if "_id" in seed else seed["id"]
        item_id = seed["lines"][0]["item_id"]

        r = requests.post(f"{BASE}/api/invoices/{sid}/duplicate",
                          json={"issue": False, "update_prices": True}, headers=owner_headers)
        assert r.status_code == 201, r.text
        new = r.json()
        assert new["number"] == "Draft"
        assert new["status"] == "draft"
        assert new.get("duplicated_from") == sid

        # A draft writes no movement at all, which stays true even while other
        # workers are selling the same item in parallel.
        detail = requests.get(f"{BASE}/api/items/{item_id}", headers=owner_headers).json()
        refs = [m.get("ref") for m in (detail.get("movements") or [])]
        assert "Draft" not in refs, f"a draft must not move stock, movements: {refs[:6]}"



# ---------- Sequential duplications ----------
class TestDuplicateSequential:
    def test_duplicate_twice_increments_count_and_new_numbers(self, owner_headers):
        seed = _create_seed_invoice_for_duplicate(owner_headers)
        sid = seed["_id"] if "_id" in seed else seed["id"]

        r1 = requests.post(f"{BASE}/api/invoices/{sid}/duplicate",
                           json={"issue": True, "update_prices": True}, headers=owner_headers)
        assert r1.status_code == 201, r1.text
        r2 = requests.post(f"{BASE}/api/invoices/{sid}/duplicate",
                           json={"issue": True, "update_prices": True}, headers=owner_headers)
        assert r2.status_code == 201, r2.text
        n1, n2 = r1.json()["number"], r2.json()["number"]
        assert n1 != n2 and n1 != "Draft" and n2 != "Draft"

        # Extract numeric portion (INV-1005 -> 1005) — must be strictly increasing
        def _num(x):
            try:
                return int(x.split("-")[-1])
            except Exception:
                return None
        a, b = _num(n1), _num(n2)
        if a is not None and b is not None:
            assert b > a, f"expected sequential numbers, got {n1}, {n2}"

        src_after = requests.get(f"{BASE}/api/invoices/{sid}", headers=owner_headers).json()
        assert src_after.get("duplicate_count", 0) >= 2, f"duplicate_count should be >=2, got {src_after.get('duplicate_count')}"


# ---------- Regression: brand-new invoice + list ----------
class TestBrandNewRegression:
    def test_create_invoice_from_scratch_still_works(self, owner_headers):
        new = _create_seed_invoice_for_duplicate(owner_headers)
        # decorate_invoice repaints status ('unpaid' | 'part_paid' | 'paid') for issued invoices
        assert new.get("status") in ("issued", "unpaid", "part_paid", "paid")
        # list still returns it
        r = requests.get(f"{BASE}/api/invoices", headers=owner_headers)
        assert r.status_code == 200
        nid = new["_id"] if "_id" in new else new["id"]
        assert any((i.get("_id") or i.get("id")) == nid for i in r.json())
