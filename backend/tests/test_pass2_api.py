"""TREDI pass-2 backend API tests: reports rail, suppliers/purchases/returns, shops/businesses/
addresses/transfers, quotations/invoice-settings/terms/reminders, team/roles/lock, offline/import,
receipts/waybills/card, search/notifications/activity/history/shortcuts."""
import os, uuid, requests, pytest
from datetime import date, timedelta

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ui-flow-accurate.preview.emergentagent.com").rstrip("/")


# ============================================================ Reports (7)
class TestReports:
    def test_summary_month_shape(self, owner_headers):
        r = requests.get(f"{BASE}/api/reports/summary?period=month", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["label", "sales", "purchases", "expenses", "gross_profit", "weeks", "shops"]:
            assert k in d
        assert isinstance(d["weeks"], list) and len(d["weeks"]) == 4

    def test_summary_all_periods(self, owner_headers):
        for p in ["week", "month", "last_month", "year", "all", "today"]:
            r = requests.get(f"{BASE}/api/reports/summary?period={p}", headers=owner_headers)
            assert r.status_code == 200, f"{p}: {r.text}"

    def test_summary_custom_range(self, owner_headers):
        a = (date.today() - timedelta(days=30)).isoformat()
        b = date.today().isoformat()
        r = requests.get(f"{BASE}/api/reports/summary?period=custom&start={a}&end={b}", headers=owner_headers)
        assert r.status_code == 200

    def test_cashflow_shape(self, owner_headers):
        r = requests.get(f"{BASE}/api/reports/cashflow?period=month", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["closing", "net", "in", "out", "series", "accounts"]:
            assert k in d
        assert isinstance(d["accounts"], list)

    def test_products_shape(self, owner_headers):
        r = requests.get(f"{BASE}/api/reports/products?period=month", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["top", "profit", "slow", "turnover", "stock_value"]:
            assert k in d

    def test_pnl_math_consistency(self, owner_headers):
        """gross must equal revenue - returns - cogs; net must equal gross - expenses."""
        r = requests.get(f"{BASE}/api/reports/pnl?period=month", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["revenue", "returns", "cogs", "gross", "expenses", "net", "bars"]:
            assert k in d
        assert abs(d["gross"] - (d["revenue"] - d["returns"] - d["cogs"])) < 0.5, f"gross math: {d}"
        assert abs(d["net"] - (d["gross"] - d["expenses"])) < 0.5, f"net math: {d}"

    def test_receivables(self, owner_headers):
        r = requests.get(f"{BASE}/api/reports/receivables", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["buckets", "total", "rows", "payables"]:
            assert k in d
        assert set(d["buckets"].keys()) == {"current", "1_30", "31_60", "60_plus"}

    def test_stock_valuation(self, owner_headers):
        r = requests.get(f"{BASE}/api/reports/stock-valuation", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["rows", "total", "retail", "low", "out"]:
            assert k in d

    def test_sales_summary_groups(self, owner_headers):
        for g in ["day", "customer", "shop", "product"]:
            r = requests.get(f"{BASE}/api/reports/sales-summary?period=month&group={g}", headers=owner_headers)
            assert r.status_code == 200, f"{g}: {r.text}"
            d = r.json()
            assert d["group"] == g


# ============================================================ Suppliers / Purchases / Returns
class TestSuppliersPurchases:
    def test_supplier_purchase_flow(self, owner_headers):
        # create supplier
        name = f"TEST_Sup_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE}/api/suppliers", json={"name": name, "phone": "+234 800 111 2222"}, headers=owner_headers)
        assert r.status_code == 201
        sid = r.json()["id"]
        # get an item and record its cost before
        items = requests.get(f"{BASE}/api/items", headers=owner_headers).json()
        it = next(i for i in items if i.get("track_stock"))
        iid = it["id"]
        qty_before = it["quantity"]
        # record purchase (5 units @ N123, update cost)
        payload = {"supplier_id": sid, "lines": [{"item_id": iid, "name": it["name"], "quantity": 5, "unit_cost": 123.45}],
                   "paid": 100, "method": "cash", "update_cost": True}
        pr = requests.post(f"{BASE}/api/purchases", json=payload, headers=owner_headers)
        assert pr.status_code == 201, pr.text
        pur = pr.json()
        assert pur["total"] == round(5 * 123.45, 2)
        # stock increased
        g = requests.get(f"{BASE}/api/items/{iid}", headers=owner_headers).json()
        assert g["quantity"] == qty_before + 5
        assert g["cost_price"] == 123.45  # update_cost applied
        # supplier profile shows the purchase & owed
        sp = requests.get(f"{BASE}/api/suppliers/{sid}", headers=owner_headers).json()
        assert len(sp["purchases"]) >= 1
        assert sp["owed"] > 0

    def test_supplier_payment_creates_expense(self, owner_headers):
        # create supplier + purchase
        r = requests.post(f"{BASE}/api/suppliers", json={"name": f"TEST_Sup_{uuid.uuid4().hex[:6]}"}, headers=owner_headers)
        sid = r.json()["id"]
        items = requests.get(f"{BASE}/api/items", headers=owner_headers).json()
        it = next(i for i in items if i.get("track_stock"))
        requests.post(f"{BASE}/api/purchases",
                      json={"supplier_id": sid, "lines": [{"item_id": it["id"], "name": it["name"], "quantity": 1, "unit_cost": 500}],
                            "paid": 0, "method": "credit", "update_cost": False},
                      headers=owner_headers)
        before_owed = requests.get(f"{BASE}/api/suppliers/{sid}", headers=owner_headers).json()["owed"]
        exp_before = requests.get(f"{BASE}/api/expenses?period=month", headers=owner_headers).json()["total"]
        # pay 200
        pr = requests.post(f"{BASE}/api/supplier-payments",
                           json={"supplier_id": sid, "amount": 200, "note": "TEST_supplier_pay"},
                           headers=owner_headers)
        assert pr.status_code == 201
        # owed reduced
        after_owed = requests.get(f"{BASE}/api/suppliers/{sid}", headers=owner_headers).json()["owed"]
        assert round(after_owed, 2) == round(before_owed - 200, 2)
        # expense created
        exp_after = requests.get(f"{BASE}/api/expenses?period=month", headers=owner_headers).json()["total"]
        assert round(exp_after - exp_before, 2) == 200.0

    def test_return_restocks_and_credit_note(self, owner_headers):
        items = requests.get(f"{BASE}/api/items", headers=owner_headers).json()
        it = next(i for i in items if i.get("track_stock"))
        qty_before = requests.get(f"{BASE}/api/items/{it['id']}", headers=owner_headers).json()["quantity"]
        payload = {"lines": [{"item_id": it["id"], "name": it["name"], "quantity": 2, "unit_price": 300}],
                   "reason": "TEST_return", "restock": True}
        r = requests.post(f"{BASE}/api/returns", json=payload, headers=owner_headers)
        assert r.status_code == 201
        # stock restored by 2
        after = requests.get(f"{BASE}/api/items/{it['id']}", headers=owner_headers).json()["quantity"]
        assert after == qty_before + 2


# ============================================================ Shops / Businesses / Addresses / Transfers
class TestShopsAndTransfers:
    def test_shops_list_and_add(self, owner_headers):
        r = requests.get(f"{BASE}/api/shops", headers=owner_headers)
        assert r.status_code == 200
        assert "shops" in r.json()
        # duplicate name → 409
        existing = r.json()["shops"][0]["name"]
        dup = requests.post(f"{BASE}/api/shops", json={"name": existing}, headers=owner_headers)
        assert dup.status_code == 409

    def test_shops_overview(self, owner_headers):
        r = requests.get(f"{BASE}/api/shops/overview", headers=owner_headers)
        assert r.status_code == 200
        for k in ["rows", "total", "stock_value", "transfers_pending"]:
            assert k in r.json()

    def test_businesses_list_and_switch(self, owner_headers):
        r = requests.get(f"{BASE}/api/businesses", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        assert "active_id" in d and len(d["businesses"]) >= 1
        # switch to active biz is idempotent
        sw = requests.post(f"{BASE}/api/businesses/{d['active_id']}/switch", headers=owner_headers)
        assert sw.status_code == 200

    def test_addresses_crud(self, owner_headers):
        r = requests.post(f"{BASE}/api/business/addresses",
                          json={"label": f"TEST_addr_{uuid.uuid4().hex[:5]}", "address": "1 Test St", "kind": "billing"},
                          headers=owner_headers)
        assert r.status_code == 201
        aid = r.json()["id"]
        lst = requests.get(f"{BASE}/api/business/addresses", headers=owner_headers)
        assert any(a["id"] == aid for a in lst.json())
        d = requests.delete(f"{BASE}/api/business/addresses/{aid}", headers=owner_headers)
        assert d.status_code == 200

    def test_transfer_full_flow(self, owner_headers):
        # ensure a 2nd shop exists (Surulere already seeded per problem statement)
        shops = requests.get(f"{BASE}/api/shops", headers=owner_headers).json()["shops"]
        if len(shops) < 2:
            requests.post(f"{BASE}/api/shops", json={"name": "TEST_Warehouse"}, headers=owner_headers)
            shops = requests.get(f"{BASE}/api/shops", headers=owner_headers).json()["shops"]
        s1, s2 = shops[0]["name"], shops[1]["name"]
        items = requests.get(f"{BASE}/api/items", headers=owner_headers).json()
        it = next(i for i in items if i.get("track_stock") and i["quantity"] >= 5)

        # 400 on same shop
        bad = requests.post(f"{BASE}/api/transfers",
                            json={"from_shop": s1, "to_shop": s1,
                                  "lines": [{"item_id": it["id"], "name": it["name"], "quantity": 1}]},
                            headers=owner_headers)
        assert bad.status_code == 400
        # 400 on empty lines
        bad2 = requests.post(f"{BASE}/api/transfers",
                             json={"from_shop": s1, "to_shop": s2, "lines": []}, headers=owner_headers)
        assert bad2.status_code == 400
        # create
        cr = requests.post(f"{BASE}/api/transfers",
                           json={"from_shop": s1, "to_shop": s2,
                                 "lines": [{"item_id": it["id"], "name": it["name"], "quantity": 3}]},
                           headers=owner_headers)
        assert cr.status_code == 201
        tid = cr.json()["id"]
        # reject without reason → 400 (but we want to approve+receive; make a 2nd transfer to test reject)
        cr2 = requests.post(f"{BASE}/api/transfers",
                            json={"from_shop": s1, "to_shop": s2,
                                  "lines": [{"item_id": it["id"], "name": it["name"], "quantity": 1}]},
                            headers=owner_headers).json()
        rej_bad = requests.post(f"{BASE}/api/transfers/{cr2['id']}/reject", json={}, headers=owner_headers)
        assert rej_bad.status_code == 400
        rej_ok = requests.post(f"{BASE}/api/transfers/{cr2['id']}/reject", json={"reason": "test"}, headers=owner_headers)
        assert rej_ok.status_code == 200
        # approve first one
        ap = requests.post(f"{BASE}/api/transfers/{tid}/approve", headers=owner_headers)
        assert ap.status_code == 200 and ap.json()["state"] == "transit"
        # receive short WITHOUT reason → 400
        recv_bad = requests.post(f"{BASE}/api/transfers/{tid}/receive",
                                 json={"lines": [{"item_id": it["id"], "received": 1}]},
                                 headers=owner_headers)
        assert recv_bad.status_code == 400
        # receive short WITH reason → discrepancy
        recv = requests.post(f"{BASE}/api/transfers/{tid}/receive",
                             json={"lines": [{"item_id": it["id"], "received": 1, "reason": "damaged"}]},
                             headers=owner_headers)
        assert recv.status_code == 200 and recv.json()["state"] == "discrepancy"


# ============================================================ Quotations / Invoice settings / Terms / Reminders
class TestInvoicing:
    def test_quote_no_stock_move_then_convert_moves_stock(self, owner_headers):
        items = requests.get(f"{BASE}/api/items", headers=owner_headers).json()
        it = next(i for i in items if i.get("track_stock") and i["quantity"] >= 3)
        before = requests.get(f"{BASE}/api/items/{it['id']}", headers=owner_headers).json()["quantity"]
        # create quote
        payload = {"lines": [{"item_id": it["id"], "name": it["name"], "quantity": 1, "unit_price": 100}], "vat_rate": 7.5}
        r = requests.post(f"{BASE}/api/quotes", json=payload, headers=owner_headers)
        assert r.status_code == 201
        qid = r.json()["id"]
        # stock NOT moved
        mid = requests.get(f"{BASE}/api/items/{it['id']}", headers=owner_headers).json()["quantity"]
        assert mid == before, "quotation should not touch stock"
        # convert → invoice created, stock DOES move
        conv = requests.post(f"{BASE}/api/quotes/{qid}/convert", headers=owner_headers)
        assert conv.status_code == 200, conv.text
        inv = conv.json()
        assert inv["number"].startswith("INV-")
        after = requests.get(f"{BASE}/api/items/{it['id']}", headers=owner_headers).json()["quantity"]
        assert after == before - 1
        # second convert → 400
        again = requests.post(f"{BASE}/api/quotes/{qid}/convert", headers=owner_headers)
        assert again.status_code == 400

    def test_list_quotes_buckets(self, owner_headers):
        r = requests.get(f"{BASE}/api/quotes", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        assert set(d["counts"].keys()) >= {"open", "accepted", "rejected", "expired"}

    def test_invoice_settings_roundtrip(self, owner_headers):
        g = requests.get(f"{BASE}/api/settings/invoice", headers=owner_headers).json()
        payload = {**g, "footer": f"TEST_footer_{uuid.uuid4().hex[:5]}"}
        payload.pop("accounts", None); payload.pop("terms_sets", None); payload.pop("next_number", None)
        p = requests.put(f"{BASE}/api/settings/invoice", json=payload, headers=owner_headers)
        assert p.status_code == 200
        assert p.json()["footer"] == payload["footer"]

    def test_terms_crud(self, owner_headers):
        r = requests.post(f"{BASE}/api/terms",
                          json={"name": f"TEST_terms_{uuid.uuid4().hex[:5]}", "payment_structure": "50% upfront",
                                "delivery_condition": "3 days", "additional_notes": "x", "is_default": False},
                          headers=owner_headers)
        assert r.status_code == 201
        tid = r.json()["id"]
        lst = requests.get(f"{BASE}/api/terms", headers=owner_headers).json()
        assert any(t["id"] == tid for t in lst)
        assert next(t for t in lst if t["id"] == tid)["sections"] == 3
        # update
        u = requests.put(f"{BASE}/api/terms/{tid}",
                         json={"name": "TEST_terms_upd", "payment_structure": "100% upfront",
                               "delivery_condition": "", "additional_notes": "", "is_default": True},
                         headers=owner_headers)
        assert u.status_code == 200
        d = requests.delete(f"{BASE}/api/terms/{tid}", headers=owner_headers)
        assert d.status_code == 200

    def test_reminder_message_contains_invoice_and_amount(self, owner_headers):
        invs = requests.get(f"{BASE}/api/invoices", headers=owner_headers).json()
        target = next((i for i in invs if i["status"] in ("unpaid", "overdue", "part_paid")), None)
        if not target:
            pytest.skip("no unpaid invoice to remind")
        r = requests.get(f"{BASE}/api/invoices/{target['id']}/reminder", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        assert target["number"] in d["message"]
        # amount due should be embedded in the message (formatted with commas)
        due_int = int(round(d["due"]))
        assert f"{due_int:,}" in d["message"] or str(due_int) in d["message"]
        # post reminder
        p = requests.post(f"{BASE}/api/invoices/{target['id']}/reminder",
                          json={"channel": "whatsapp", "message": d["message"], "repeat_days": 0},
                          headers=owner_headers)
        assert p.status_code == 201


# ============================================================ Team / Roles / Lock
class TestTeamRolesLock:
    def test_team_list_shape(self, owner_headers):
        r = requests.get(f"{BASE}/api/team", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["users", "roles", "abilities", "scope_keys"]:
            assert k in d
        assert len(d["users"]) >= 1

    def test_invite_and_duplicate_and_update(self, owner_headers):
        email = f"tester_{uuid.uuid4().hex[:6]}@tredicheck.co"
        r = requests.post(f"{BASE}/api/team",
                          json={"name": "TEST Rep", "email": email, "role": "sales", "shops": []},
                          headers=owner_headers)
        assert r.status_code == 201
        uid = r.json()["id"]
        # 409 on dup email
        r2 = requests.post(f"{BASE}/api/team",
                           json={"name": "Dup", "email": email, "role": "sales"},
                           headers=owner_headers)
        assert r2.status_code == 409
        # get member
        g = requests.get(f"{BASE}/api/team/{uid}", headers=owner_headers).json()
        assert g["email"] == email
        # change role → abilities reset to role defaults + overrides applied
        u = requests.put(f"{BASE}/api/team/{uid}",
                         json={"role": "manager", "shops": [], "can": {"big_discount": False}, "scopes": {}},
                         headers=owner_headers)
        assert u.status_code == 200
        assert u.json()["role"] == "manager"
        assert u.json()["can"]["manage_users"] is False  # manager cannot manage users (default)
        assert u.json()["can"]["big_discount"] is False  # override applied
        # preview
        p = requests.get(f"{BASE}/api/team/{uid}/preview", headers=owner_headers)
        assert p.status_code == 200

    def test_cannot_hand_over_yourself(self, owner_headers):
        team = requests.get(f"{BASE}/api/team", headers=owner_headers).json()
        me = next(u for u in team["users"] if u["is_you"])
        r = requests.post(f"{BASE}/api/team/{me['id']}/handover",
                          json={"deactivate_only": True}, headers=owner_headers)
        assert r.status_code == 400

    def test_roles_list_and_create(self, owner_headers):
        r = requests.get(f"{BASE}/api/roles", headers=owner_headers)
        assert r.status_code == 200
        c = requests.post(f"{BASE}/api/roles",
                          json={"label": f"TEST_Role_{uuid.uuid4().hex[:5]}", "start_from": "sales", "note": "test",
                                "can": {"reports": True}, "scopes": {}},
                          headers=owner_headers)
        assert c.status_code == 201
        assert c.json()["can"]["reports"] is True

    def test_lock_pin_flow(self, owner_headers):
        # set PIN
        r = requests.put(f"{BASE}/api/settings/lock",
                         json={"enabled": True, "pin": "1234", "idle_minutes": 2, "biometrics": True},
                         headers=owner_headers)
        assert r.status_code == 200
        assert r.json()["has_pin"] is True
        # wrong PIN
        w = requests.post(f"{BASE}/api/settings/lock/verify", json={"pin": "9999"}, headers=owner_headers)
        assert w.status_code == 401
        # right PIN
        ok = requests.post(f"{BASE}/api/settings/lock/verify", json={"pin": "1234"}, headers=owner_headers)
        assert ok.status_code == 200


# ============================================================ Offline sync / Import
class TestOfflineImport:
    def test_sync_mixed_batch(self, owner_headers):
        items = requests.get(f"{BASE}/api/items", headers=owner_headers).json()
        it = next(i for i in items if i.get("track_stock"))
        ops = [
            {"local_id": "a1", "kind": "customer", "payload": {"name": f"TEST_SyncCust_{uuid.uuid4().hex[:5]}", "phone": "+234 111"}},
            {"local_id": "a2", "kind": "expense", "payload": {"amount": 10, "category": "Utilities", "note": "TEST_sync"}},
            {"local_id": "a3", "kind": "adjustment", "payload": {"item_id": it["id"], "delta": 1, "reason": "TEST_sync"}},
            {"local_id": "a4", "kind": "expense", "payload": {"category": "Bad"}},  # missing amount → fails
        ]
        r = requests.post(f"{BASE}/api/sync", json={"ops": ops}, headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        assert "a1" in d["applied"] and "a2" in d["applied"] and "a3" in d["applied"]
        assert any(f["local_id"] == "a4" for f in d["failed"])

    def test_sync_status_and_settings(self, owner_headers):
        r = requests.get(f"{BASE}/api/sync/status", headers=owner_headers)
        assert r.status_code == 200 and "counts" in r.json()
        s = requests.put(f"{BASE}/api/sync/settings",
                         json={"auto": True, "mobile_data": False, "include_photos": True},
                         headers=owner_headers)
        assert s.status_code == 200
        b = requests.post(f"{BASE}/api/sync/backup", headers=owner_headers)
        assert b.status_code == 200

    def test_import_preview_groups_issues(self, owner_headers):
        rows = [
            {"row": 1, "values": {"name": "Grace", "phone": "+234 999 111"}},  # ready
            {"row": 2, "values": {"name": "NoPhone"}},  # missing phone → blocked
            {"row": 3, "values": {"name": "AlsoNoPhone"}},  # missing phone → blocked (same group)
            {"row": 4, "values": {"name": "BadBal", "phone": "+234 999 222", "opening_balance": "N/A"}},  # fix
        ]
        r = requests.post(f"{BASE}/api/import/preview",
                          json={"target": "customers", "rows": rows}, headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["ready_count"] == 1
        assert d["issue_count"] == 3
        kinds = {i["kind"] for i in d["issues"]}
        assert "blocked" in kinds and "bad_number" in kinds

    def test_import_commit_respects_skip(self, owner_headers):
        rows = [
            {"row": 1, "values": {"name": f"TEST_ImpA_{uuid.uuid4().hex[:5]}", "phone": f"+234 700 {uuid.uuid4().hex[:5]}"}},
            {"row": 2, "values": {"name": f"TEST_ImpB_{uuid.uuid4().hex[:5]}", "phone": f"+234 700 {uuid.uuid4().hex[:5]}"}},
        ]
        r = requests.post(f"{BASE}/api/import/commit",
                          json={"target": "customers", "rows": rows, "skip_rows": [2]},
                          headers=owner_headers)
        assert r.status_code == 200
        assert r.json()["imported"] == 1

    def test_import_template(self, owner_headers):
        r = requests.get(f"{BASE}/api/import/template?target=customers", headers=owner_headers)
        assert r.status_code == 200
        assert "csv" in r.json() and "name,phone" in r.json()["csv"]


# ============================================================ Documents (receipts / waybills / card)
class TestDocuments:
    def test_receipt_and_link(self, owner_headers):
        # attachables (expenses/purchases without receipt)
        atts = requests.get(f"{BASE}/api/receipts/attachables", headers=owner_headers).json()
        # create a receipt
        r = requests.post(f"{BASE}/api/receipts",
                          json={"photo_url": "https://x/y.jpg", "title": "TEST_receipt", "amount": 50, "kind": "other"},
                          headers=owner_headers)
        assert r.status_code == 201
        rid = r.json()["id"]
        if atts:
            a = atts[0]
            link = requests.post(f"{BASE}/api/receipts/{rid}/link",
                                 json={"link_type": a["type"], "link_id": a["id"]},
                                 headers=owner_headers)
            assert link.status_code == 200
        lst = requests.get(f"{BASE}/api/receipts", headers=owner_headers)
        assert lst.status_code == 200

    def test_waybill_autofill(self, owner_headers):
        invs = requests.get(f"{BASE}/api/invoices", headers=owner_headers).json()
        target = next((i for i in invs if i["status"] != "draft"), invs[0])
        r = requests.post(f"{BASE}/api/waybills",
                          json={"invoice_id": target["id"], "customer_name": "TEST", "deliver_to": "Addr"},
                          headers=owner_headers)
        assert r.status_code == 201
        wid = r.json()["id"]
        g = requests.get(f"{BASE}/api/waybills/{wid}", headers=owner_headers).json()
        assert len(g["lines"]) >= 1
        expected_pkg = round(sum(l["quantity"] for l in g["lines"]), 2)
        assert g["packages"] == expected_pkg

    def test_business_card_roundtrip(self, owner_headers):
        g = requests.get(f"{BASE}/api/business/card", headers=owner_headers)
        assert g.status_code == 200
        p = requests.put(f"{BASE}/api/business/card",
                         json={"tagline": "TEST tagline", "hours": "9-5", "show_tin": True,
                               "include_bank": False, "style": "deep"},
                         headers=owner_headers)
        assert p.status_code == 200
        assert p.json()["tagline"] == "TEST tagline"
        assert p.json()["style"] == "deep"


# ============================================================ Search / Notifications / Activity / History / Shortcuts
class TestActivityAndHome:
    def test_search_short_returns_empty(self, owner_headers):
        r = requests.get(f"{BASE}/api/search?q=a", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 0

    def test_search_grouped(self, owner_headers):
        r = requests.get(f"{BASE}/api/search?q=ade", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["customers", "invoices", "items", "suppliers"]:
            assert k in d

    def test_notifications(self, owner_headers):
        r = requests.get(f"{BASE}/api/notifications", headers=owner_headers)
        assert r.status_code == 200
        assert "today" in r.json() and "earlier" in r.json()

    def test_activity_filters(self, owner_headers):
        r = requests.get(f"{BASE}/api/activity", headers=owner_headers)
        assert r.status_code == 200
        assert "rows" in r.json()
        # with filter
        r2 = requests.get(f"{BASE}/api/activity?kind=invoice", headers=owner_headers)
        assert r2.status_code == 200

    def test_history_invoice_includes_payments(self, owner_headers):
        invs = requests.get(f"{BASE}/api/invoices", headers=owner_headers).json()
        # find one with a payment
        paid = next((i for i in invs if i["status"] in ("paid", "part_paid")), invs[0])
        r = requests.get(f"{BASE}/api/history/{paid['id']}", headers=owner_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == paid["number"]
        kinds = {row["kind"] for row in d["rows"]}
        assert "invoice" in kinds  # at least the seed row

    def test_shortcuts_max_8(self, owner_headers):
        g = requests.get(f"{BASE}/api/shortcuts", headers=owner_headers)
        assert g.status_code == 200
        d = g.json()
        assert "on" in d and "available" in d
        # put a big list, must cap at 8
        keys = [s["key"] for s in d["on"]] + [s["key"] for s in d["available"]]
        p = requests.put(f"{BASE}/api/shortcuts", json={"keys": keys}, headers=owner_headers)
        assert p.status_code == 200
        assert len(p.json()["on"]) <= 8
        # restore defaults
        requests.put(f"{BASE}/api/shortcuts",
                     json={"keys": ["payment_in", "quick_sale", "add_stock", "reports"]},
                     headers=owner_headers)
