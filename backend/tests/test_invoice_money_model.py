"""Iter 8 — money model & professional export.

Covers: line discounts, shipping fee (not VAT'd), credit applied capping,
banks + terms in decorated invoice, terms.shop, invoice settings merge (t7),
business profile merge (phones/emails/tin/address survive)."""
import pytest
import uuid


# ---------- helpers ----------
def _mk_customer_with_credit(session, base_url, headers):
    """Create a customer with opening credit balance (i_owe = negative balance)."""
    r = session.post(f"{base_url}/api/customers",
                     json={"name": f"TEST Credit {uuid.uuid4().hex[:6]}",
                           "phone": "08000000001",
                           "opening_balance": 50000,
                           "opening_type": "i_owe"},
                     headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ---------- preview: line discount + shipping ----------
class TestPreviewMoneyModel:
    def test_preview_line_discount_amount_and_percent_plus_shipping(self, session, base_url, owner_headers):
        payload = {
            "lines": [
                {"name": "TEST A", "quantity": 2, "unit_price": 10000,
                 "discount_type": "amount", "discount_value": 500},   # gross 20000, disc 500
                {"name": "TEST B", "quantity": 1, "unit_price": 5000,
                 "discount_type": "percent", "discount_value": 10},   # gross 5000, disc 500
            ],
            "invoice_discount_type": "amount",
            "invoice_discount_value": 0,
            "vat_rate": 7.5,
            "shipping_fee": 2000,
        }
        r = session.post(f"{base_url}/api/invoices/preview", json=payload, headers=owner_headers)
        assert r.status_code == 200, r.text
        t = r.json()["totals"]
        # gross = 25000, line_discount = 1000, invoice_discount=0, taxable = 24000
        assert t["gross"] == 25000
        assert t["line_discount"] == 1000
        assert t["invoice_discount"] == 0
        assert t["discount_total"] == 1000
        assert t["taxable"] == 24000
        # VAT must be computed on taxable only, NOT including shipping
        assert t["vat"] == round(24000 * 7.5 / 100, 2) == 1800
        assert t["shipping"] == 2000
        # total = taxable + vat + shipping
        assert t["total"] == 24000 + 1800 + 2000  # 27800

    def test_preview_shipping_never_in_vat(self, session, base_url, owner_headers):
        # Force a big shipping to confirm VAT doesn't change with it
        p = {"lines": [{"name": "TEST X", "quantity": 1, "unit_price": 10000}],
             "vat_rate": 7.5, "shipping_fee": 0}
        r1 = session.post(f"{base_url}/api/invoices/preview", json=p, headers=owner_headers).json()
        p["shipping_fee"] = 99999
        r2 = session.post(f"{base_url}/api/invoices/preview", json=p, headers=owner_headers).json()
        assert r1["totals"]["vat"] == r2["totals"]["vat"]
        assert r2["totals"]["total"] - r1["totals"]["total"] == 99999


# ---------- create invoice: persists shipping, banks, terms, shows in GET ----------
class TestCreateInvoicePersistence:
    def test_create_invoice_persists_shipping_banks_terms_photos(self, session, base_url, owner_headers):
        # find or create a bank account and a terms set
        accs = session.get(f"{base_url}/api/accounts", headers=owner_headers).json()["accounts"]
        bank = next((a for a in accs if a["kind"] in ("bank", "cash")), accs[0])
        bank_id = bank["id"]

        tr = session.post(f"{base_url}/api/terms",
                          json={"name": f"TEST Terms {uuid.uuid4().hex[:5]}",
                                "payment_structure": "50% up front",
                                "delivery_condition": "2 weeks",
                                "additional_notes": "TEST", "shop": "Ikeja branch"},
                          headers=owner_headers)
        assert tr.status_code in (200, 201), tr.text
        term_id = tr.json()["id"]

        payload = {
            "customer_id": None,
            "lines": [{"name": "TEST Item", "quantity": 1, "unit_price": 20000,
                       "discount_type": "amount", "discount_value": 0}],
            "invoice_discount_type": "amount",
            "invoice_discount_value": 0,
            "vat_rate": 7.5,
            "payment_mode": "credit",
            "status": "issued",
            "shipping_fee": 5000,
            "bank_account_ids": [bank_id],
            "terms_id": term_id,
            "show_photos": True,
        }
        r = session.post(f"{base_url}/api/invoices", json=payload, headers=owner_headers)
        assert r.status_code == 201, r.text
        inv = r.json()
        iid = inv["id"]

        # GET must return everything decorated
        g = session.get(f"{base_url}/api/invoices/{iid}", headers=owner_headers)
        assert g.status_code == 200
        d = g.json()
        assert d["totals"]["shipping"] == 5000
        assert d["totals"]["discount_total"] == 0
        assert d["totals"]["vat"] == 1500  # 20000 * 7.5%
        assert d["totals"]["total"] == 20000 + 1500 + 5000
        assert d["show_photos"] is True

        # bank_accounts array resolved (name/bank/number)
        assert isinstance(d["bank_accounts"], list) and len(d["bank_accounts"]) == 1
        ba = d["bank_accounts"][0]
        assert ba["id"] == bank_id
        assert "name" in ba and "bank" in ba and "number" in ba

        # terms resolved
        assert d["terms"] is not None
        assert d["terms"]["name"].startswith("TEST Terms")
        assert d["terms"]["payment_structure"] == "50% up front"
        assert d["terms"]["delivery_condition"] == "2 weeks"
        assert d["terms"]["additional_notes"] == "TEST"
        assert d["terms"]["shop"] == "Ikeja branch"

        # payments field exists (empty for credit invoice with no credit_applied)
        assert isinstance(d["payments"], list)
        # customer_address field is present (empty when no customer)
        assert "customer_address" in d


# ---------- credit applied ----------
class TestCreditApplied:
    def test_credit_applied_creates_payment_and_reduces_due(self, session, base_url, owner_headers):
        cust = _mk_customer_with_credit(session, base_url, owner_headers)
        cid = cust["id"]
        # verify negative balance (unused credit)
        c = session.get(f"{base_url}/api/customers/{cid}", headers=owner_headers).json()
        assert c["balance"] < 0

        payload = {
            "customer_id": cid,
            "lines": [{"name": "TEST", "quantity": 1, "unit_price": 30000,
                       "discount_type": "amount", "discount_value": 0}],
            "vat_rate": 0,
            "payment_mode": "credit",
            "status": "issued",
            "credit_applied": 20000,
        }
        r = session.post(f"{base_url}/api/invoices", json=payload, headers=owner_headers)
        assert r.status_code == 201, r.text
        inv = r.json()
        iid = inv["id"]
        d = session.get(f"{base_url}/api/invoices/{iid}", headers=owner_headers).json()
        assert d["totals"]["total"] == 30000
        assert d["paid"] == 20000
        assert d["due"] == 10000
        # There should be a payment allocation of 20000 against this invoice
        assert any(p["amount"] == 20000 for p in d["payments"])

    def test_credit_applied_capped_at_total(self, session, base_url, owner_headers):
        cust = _mk_customer_with_credit(session, base_url, owner_headers)
        cid = cust["id"]
        payload = {
            "customer_id": cid,
            "lines": [{"name": "TEST", "quantity": 1, "unit_price": 15000}],
            "vat_rate": 0,
            "payment_mode": "credit",
            "status": "issued",
            "credit_applied": 99999,  # more than total
        }
        r = session.post(f"{base_url}/api/invoices", json=payload, headers=owner_headers)
        assert r.status_code == 201
        inv = r.json()
        d = session.get(f"{base_url}/api/invoices/{inv['id']}", headers=owner_headers).json()
        assert d["totals"]["total"] == 15000
        assert d["paid"] == 15000  # capped
        assert d["due"] == 0
        assert d["status"] == "paid"

    def test_credit_on_draft_applies_when_issued(self, session, base_url, owner_headers):
        """Credit chosen on a draft (or while editing it) used to be dropped on
        Confirm & issue — the invoice came out with nothing paid."""
        cid = _mk_customer_with_credit(session, base_url, owner_headers)["id"]
        payload = {"customer_id": cid, "lines": [{"name": "TEST", "quantity": 1, "unit_price": 30000}],
                   "vat_rate": 0, "payment_mode": "credit", "status": "draft", "credit_applied": 20000}
        iid = session.post(f"{base_url}/api/invoices", json=payload, headers=owner_headers).json()["id"]
        d = session.get(f"{base_url}/api/invoices/{iid}", headers=owner_headers).json()
        assert d["status"] == "draft" and d["credit_pending"] == 20000 and d["due"] == 10000
        r = session.put(f"{base_url}/api/invoices/{iid}", json=payload, headers=owner_headers)
        assert r.status_code == 200 and r.json()["credit_applied"] == 20000
        assert session.post(f"{base_url}/api/invoices/{iid}/issue", headers=owner_headers).status_code == 200
        d = session.get(f"{base_url}/api/invoices/{iid}", headers=owner_headers).json()
        assert d["paid"] == 20000 and d["due"] == 10000

    def test_applied_credit_not_counted_twice_on_balance(self, session, base_url, owner_headers):
        """50,000 credit, 30,000 invoice using 20,000 of it: the customer is left
        with 20,000 net credit, not 40,000."""
        cid = _mk_customer_with_credit(session, base_url, owner_headers)["id"]
        payload = {"customer_id": cid, "lines": [{"name": "TEST", "quantity": 1, "unit_price": 30000}],
                   "vat_rate": 0, "payment_mode": "credit", "status": "issued", "credit_applied": 20000}
        assert session.post(f"{base_url}/api/invoices", json=payload, headers=owner_headers).status_code == 201
        c = session.get(f"{base_url}/api/customers/{cid}", headers=owner_headers).json()
        assert c["balance"] == -20000


# ---------- terms with shop field round trip ----------
class TestTermsShopRoundtrip:
    def test_terms_shop_field_round_trips(self, session, base_url, owner_headers):
        r = session.post(f"{base_url}/api/terms",
                         json={"name": f"TEST Shop Terms {uuid.uuid4().hex[:5]}",
                               "payment_structure": "Net 30",
                               "shop": "Surulere"},
                         headers=owner_headers)
        assert r.status_code in (200, 201)
        tid = r.json()["id"]
        assert r.json()["shop"] == "Surulere"

        # PUT changes shop
        upd = session.put(f"{base_url}/api/terms/{tid}",
                          json={"name": r.json()["name"], "payment_structure": "Net 30",
                                "shop": "Ikeja branch"},
                          headers=owner_headers)
        assert upd.status_code == 200
        assert upd.json()["shop"] == "Ikeja branch"

        # LIST reflects it
        lst = session.get(f"{base_url}/api/terms", headers=owner_headers).json()
        found = next((t for t in lst if t["id"] == tid), None)
        assert found and found["shop"] == "Ikeja branch"


# ---------- invoice settings: template t7, export_format persistence, merge ----------
class TestInvoiceSettingsT7AndMerge:
    def test_settings_lists_all_new_fields(self, session, base_url, owner_headers):
        s = session.get(f"{base_url}/api/settings/invoice", headers=owner_headers).json()
        for k in ("template", "brand_color", "header_color", "logo_url", "logo_size", "export_format"):
            assert k in s, f"missing settings key {k}"

    def test_put_template_t7_and_export_format_simple_persist_and_merge(self, session, base_url, owner_headers):
        # Snapshot before, so we can restore
        before = session.get(f"{base_url}/api/settings/invoice", headers=owner_headers).json()
        prev = {k: before.get(k) for k in ("template", "brand_color", "header_color",
                                            "logo_url", "logo_size", "export_format",
                                            "prefix", "vat_rate", "vat_on", "due_days",
                                            "conditions", "show_photos", "tredi_mark",
                                            "print_format", "default_bank_account_id",
                                            "attach_terms", "footer")}
        # Set t7 + simple via a full payload
        full = {**prev, "template": "t7", "export_format": "simple", "brand_color": "#123456"}
        r = session.put(f"{base_url}/api/settings/invoice", json=full, headers=owner_headers)
        assert r.status_code == 200, r.text
        assert r.json()["template"] == "t7"
        assert r.json()["export_format"] == "simple"
        assert r.json()["brand_color"] == "#123456"

        # Now partial PUT — only send prefix — template/export_format must survive (server merges)
        partial = {"prefix": "INV", "vat_rate": prev["vat_rate"], "vat_on": prev["vat_on"],
                   "due_days": prev["due_days"], "conditions": prev["conditions"],
                   "show_photos": prev["show_photos"], "tredi_mark": prev["tredi_mark"],
                   "print_format": prev["print_format"], "attach_terms": prev["attach_terms"],
                   "footer": prev["footer"]}
        r2 = session.put(f"{base_url}/api/settings/invoice", json=partial, headers=owner_headers)
        assert r2.status_code == 200
        d = r2.json()
        assert d["template"] == "t7", f"template wiped: {d.get('template')}"
        assert d["export_format"] == "simple"
        assert d["brand_color"] == "#123456"

        # restore
        session.put(f"{base_url}/api/settings/invoice", json=prev, headers=owner_headers)

    def test_put_invalid_template_rejected(self, session, base_url, owner_headers):
        cur = session.get(f"{base_url}/api/settings/invoice", headers=owner_headers).json()
        bad = {**cur, "template": "t99"}
        r = session.put(f"{base_url}/api/settings/invoice", json=bad, headers=owner_headers)
        assert r.status_code == 422


# ---------- business profile merge ----------
class TestBusinessMerge:
    def test_business_get_returns_all_new_fields(self, session, base_url, owner_headers):
        # Seed the fields first so old business docs don't fail this
        session.put(f"{base_url}/api/business",
                    json={"name": "Tredi Ventures", "country": "NG",
                          "phones": [], "emails": []},
                    headers=owner_headers)
        b = session.get(f"{base_url}/api/business", headers=owner_headers).json()
        for k in ("country", "email", "phones", "emails", "tin", "address"):
            assert k in b, f"business missing {k}"
        assert isinstance(b["phones"], list)
        assert isinstance(b["emails"], list)

    def test_put_business_merge_preserves_tin_and_address(self, session, base_url, owner_headers):
        # Set full profile first
        cur = session.get(f"{base_url}/api/business", headers=owner_headers).json()
        full = {
            "name": cur.get("name") or "Tredi Ventures",
            "type": cur.get("type") or "Retail",
            "currency": cur.get("currency") or "NGN",
            "country": "NG",
            "tin": "1234567-0001",
            "address": "12 Test Road, Ikeja",
            "phone": "08000000000",
            "email": "hello@tredi.app",
            "phones": ["08011111111"],
            "emails": ["accounts@tredi.app"],
        }
        r = session.put(f"{base_url}/api/business", json=full, headers=owner_headers)
        assert r.status_code == 200, r.text

        # Now partial: send only name + phones — tin/address/email must survive
        partial = {"name": full["name"], "phones": ["08022222222"]}
        r2 = session.put(f"{base_url}/api/business", json=partial, headers=owner_headers)
        assert r2.status_code == 200, r2.text
        after = session.get(f"{base_url}/api/business", headers=owner_headers).json()
        assert after["tin"] == "1234567-0001", "tin was wiped by partial PUT"
        assert after["address"] == "12 Test Road, Ikeja", "address was wiped"
        assert after["email"] == "hello@tredi.app", "email was wiped"
        assert after["phones"] == ["08022222222"]
        # emails list should survive (not sent)
        assert after["emails"] == ["accounts@tredi.app"], "emails list was wiped"
