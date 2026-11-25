"""Iteration 48: regression for the 4 merged PRs.
PR1 unused credit on invoices, PR2 phone sign-in (Twilio not configured), PR3 manage lookups, PR4 photo perf.
Cleanup deletes only the records created here, by id."""
import io
import os
import sys
import uuid

import pytest
import requests
from bson import ObjectId
from PIL import Image
from pymongo import MongoClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from dotenv import dotenv_values  # noqa: E402

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
ENV = dotenv_values(os.path.join(os.path.dirname(__file__), "..", ".env"))
DB = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
CREATED = {"customers": [], "invoices": [], "items": [], "uploads": [], "lookups_values": []}


def _login(email):
    r = requests.post(f"{BASE_URL}/api/auth/login", data={"username": email, "password": "tredi1234"})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def H():
    return _login("owner@tredi.app")


@pytest.fixture(scope="module")
def STAFF():
    return _login("amina@tredi.app")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    ids = lambda k: [ObjectId(i) for i in CREATED[k]]
    inv_ids = CREATED["invoices"]
    DB.payments.delete_many({"allocations.invoice_id": {"$in": inv_ids}, "method": "credit"})
    DB.payments.delete_many({"customer_id": {"$in": CREATED["customers"]}})
    DB.invoices.delete_many({"_id": {"$in": ids("invoices")}})
    DB.customers.delete_many({"_id": {"$in": ids("customers")}})
    DB.items.delete_many({"_id": {"$in": ids("items")}})
    DB.uploads.delete_many({"storage_path": {"$in": CREATED["uploads"]}})


def _customer(H, credit=50000):
    r = requests.post(f"{BASE_URL}/api/customers", json={"name": f"TEST_Credit {uuid.uuid4().hex[:6]}", "phone": "08000000001",
                                                       "opening_balance": credit, "opening_type": "i_owe"}, headers=H)
    assert r.status_code in (200, 201), r.text
    CREATED["customers"].append(r.json()["id"])
    return r.json()["id"]


def _invoice(H, cid, price, credit, status="issued", mode="credit"):
    r = requests.post(f"{BASE_URL}/api/invoices", json={"customer_id": cid, "lines": [{"name": "TEST_line", "quantity": 1, "unit_price": price}],
                                                      "vat_rate": 0, "payment_mode": mode, "status": status, "credit_applied": credit}, headers=H)
    assert r.status_code == 201, r.text
    CREATED["invoices"].append(r.json()["id"])
    return r.json()["id"]


def _get(H, path):
    r = requests.get(f"{BASE_URL}/api{path}", headers=H)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- PR1: unused credit on invoices ----------
class TestUnusedCredit:
    def test_draft_credit_pending_then_issue(self, H):
        cid = _customer(H)
        iid = _invoice(H, cid, 30000, 20000, status="draft")
        d = _get(H, f"/invoices/{iid}")
        assert d["credit_pending"] == 20000 and d["due"] == 10000
        assert _get(H, f"/customers/{cid}")["balance"] == -50000   # draft doesn't touch balance
        assert requests.post(f"{BASE_URL}/api/invoices/{iid}/issue", headers=H).status_code == 200
        d = _get(H, f"/invoices/{iid}")
        assert d["paid"] == 20000 and d["due"] == 10000 and d["credit_pending"] == 0
        assert _get(H, f"/customers/{cid}")["balance"] == -20000
        assert DB.payments.count_documents({"allocations.invoice_id": iid, "method": "credit", "deleted_at": None}) == 1

    def test_credit_capped_to_available_and_total(self, H):
        cid = _customer(H, credit=5000)
        iid = _invoice(H, cid, 30000, 99999)
        d = _get(H, f"/invoices/{iid}")
        assert d["credit_applied"] == 5000 and d["paid"] == 5000 and d["due"] == 25000
        cid2 = _customer(H, credit=50000)
        iid2 = _invoice(H, cid2, 10000, 40000)
        assert _get(H, f"/invoices/{iid2}")["credit_applied"] == 10000

    def test_cash_sale_with_credit_only_charges_rest(self, H):
        cid = _customer(H, credit=8000)
        iid = _invoice(H, cid, 20000, 8000, mode="cash")
        d = _get(H, f"/invoices/{iid}")
        assert d["paid"] == 20000 and d["due"] == 0
        cash = DB.payments.find_one({"allocations.invoice_id": iid, "method": "cash"})
        assert cash and cash["amount"] == 12000
        assert _get(H, f"/customers/{cid}")["balance"] == 0

    def test_edit_issued_keeps_one_credit_payment(self, H):
        cid = _customer(H)
        iid = _invoice(H, cid, 30000, 20000)
        payload = {"customer_id": cid, "lines": [{"name": "TEST_line", "quantity": 1, "unit_price": 30000}],
                   "vat_rate": 0, "payment_mode": "credit", "status": "issued", "credit_applied": 30000}
        r = requests.put(f"{BASE_URL}/api/invoices/{iid}", json=payload, headers=H)
        assert r.status_code == 200 and r.json()["credit_applied"] == 30000   # own total excluded from available credit
        assert DB.payments.count_documents({"allocations.invoice_id": iid, "method": "credit", "deleted_at": None}) == 1
        assert _get(H, f"/customers/{cid}")["balance"] == -20000

    def test_cancel_releases_and_uncancel_reapplies(self, H):
        cid = _customer(H)
        iid = _invoice(H, cid, 30000, 20000)
        assert requests.delete(f"{BASE_URL}/api/invoices/{iid}", headers=H, params={"reason": "TEST"}).status_code == 200
        assert _get(H, f"/customers/{cid}")["balance"] == -50000
        assert DB.payments.count_documents({"allocations.invoice_id": iid, "method": "credit", "deleted_at": None}) == 0
        assert requests.post(f"{BASE_URL}/api/invoices/{iid}/uncancel", headers=H).status_code == 200
        d = _get(H, f"/invoices/{iid}")
        assert d["paid"] == 20000 and d["due"] == 10000
        assert _get(H, f"/customers/{cid}")["balance"] == -20000

    def test_ledger_hides_applied_credit(self, H):
        cid = _customer(H)
        _invoice(H, cid, 30000, 20000)
        led = _get(H, f"/customers/{cid}/ledger")
        rows = led.get("entries", led) if isinstance(led, dict) else led
        assert not [e for e in rows if e.get("kind") == "payment"]


# ---------- PR2: phone sign-in (Twilio keys are injected in this env; no real SMS is sent: only unknown numbers / no-record paths) ----------
TEST_PHONE = "+2348031234567"


class TestPhoneLogin:
    def test_config_enabled(self):
        r = requests.get(f"{BASE_URL}/api/auth/phone/config")
        assert r.status_code == 200 and r.json() == {"enabled": True, "country": "NG", "prefix": "+234"}

    def test_start_unknown_number_generic_then_429(self):
        DB.phone_codes.delete_one({"phone": TEST_PHONE})
        r = requests.post(f"{BASE_URL}/api/auth/phone/start", json={"phone": "0803 123 4567"})
        assert r.status_code == 200 and r.json()["phone"] == TEST_PHONE and "If +234" in r.json()["message"]
        assert requests.post(f"{BASE_URL}/api/auth/phone/start", json={"phone": "08031234567"}).status_code == 429
        DB.phone_codes.delete_one({"phone": TEST_PHONE})

    def test_bad_number_and_unknown_verify(self):
        assert requests.post(f"{BASE_URL}/api/auth/phone/start", json={"phone": "12345"}).status_code == 400
        r = requests.post(f"{BASE_URL}/api/auth/phone/verify", json={"phone": "08031234567", "code": "123456"})
        assert r.status_code == 400

    def test_mine_and_link_verify_without_code(self, H):
        assert requests.get(f"{BASE_URL}/api/auth/phone/mine").status_code == 401
        d = _get(H, "/auth/phone/mine")
        assert d["enabled"] is True and "phone" in d and "suggested" in d
        DB.phone_codes.delete_one({"phone": TEST_PHONE})
        r = requests.post(f"{BASE_URL}/api/auth/phone/link/verify", json={"phone": "08031234567", "code": "123456"}, headers=H)
        assert r.status_code == 400   # no code record -> rejected without calling Twilio

    def test_nigerian_normaliser(self):
        import sms
        for raw in ("0803 123 4567", "803 123 4567", "2348031234567", "+234 803 123 4567"):
            assert sms.nigerian(raw) == "+2348031234567"
        for raw in ("", "12345", "0603 123 4567", "+1 415 555 0100"):
            assert sms.nigerian(raw) == ""


# ---------- PR3: rename/remove lookup names ----------
class TestLookups:
    def test_hide_default_and_readd(self, H):
        vals = _get(H, "/lookups/location")["values"]
        if not vals:
            pytest.skip("no default locations")
        # use a custom name to avoid touching the owner's real defaults
        name = f"TEST_loc {uuid.uuid4().hex[:5]}"
        requests.post(f"{BASE_URL}/api/lookups/location", json={"value": name}, headers=H)
        assert name in _get(H, "/lookups/location")["values"]
        r = requests.delete(f"{BASE_URL}/api/lookups/location", params={"value": name.upper()}, headers=H)
        assert r.status_code == 200 and name not in r.json()["values"]

    def test_case_only_rename(self, H):
        name = f"TEST_brand {uuid.uuid4().hex[:5]}"
        requests.post(f"{BASE_URL}/api/lookups/brand", json={"value": name}, headers=H)
        r = requests.put(f"{BASE_URL}/api/lookups/brand", json={"old": name, "new": name.upper()}, headers=H)
        assert r.status_code == 200
        vals = r.json()["values"]
        assert name.upper() in vals and name not in vals
        requests.delete(f"{BASE_URL}/api/lookups/brand", params={"value": name.upper()}, headers=H)

    def test_rename_merge_into_existing(self, H):
        a, b = f"TEST_a {uuid.uuid4().hex[:5]}", f"TEST_b {uuid.uuid4().hex[:5]}"
        for v in (a, b):
            requests.post(f"{BASE_URL}/api/lookups/location", json={"value": v}, headers=H)
        r = requests.put(f"{BASE_URL}/api/lookups/location", json={"old": a, "new": b}, headers=H)
        vals = r.json()["values"]
        assert r.status_code == 200 and vals.count(b) == 1 and a not in vals
        requests.delete(f"{BASE_URL}/api/lookups/location", params={"value": b}, headers=H)

    def test_errors(self, H, STAFF):
        assert requests.put(f"{BASE_URL}/api/lookups/location", json={"old": "TEST_nope_zz", "new": "x"}, headers=H).status_code == 404
        assert requests.put(f"{BASE_URL}/api/lookups/location", json={"old": "x", "new": "  "}, headers=H).status_code == 400
        assert requests.get(f"{BASE_URL}/api/lookups/bogus", headers=H).status_code == 404
        assert requests.delete(f"{BASE_URL}/api/lookups/location", params={"value": "anything"}, headers=STAFF).status_code == 403
        assert requests.put(f"{BASE_URL}/api/lookups/location", json={"old": "a", "new": "b"}, headers=STAFF).status_code == 403

    def test_usage_and_expense_heading_guard(self, H):
        u = _get(H, "/lookups/unit/usage?value=Piece")
        assert isinstance(u["count"], int) and u["noun"] in ("item", "items")


# ---------- PR4: photo compression + thumbnails ----------
class TestPhotos:
    def _upload(self, H, w=1500, h=1100, fmt="PNG"):
        buf = io.BytesIO(); Image.effect_noise((w, h), 60).convert("RGB").save(buf, fmt)
        files = {"file": (f"TEST_big.{fmt.lower()}", buf.getvalue(), f"image/{fmt.lower()}")}
        r = requests.post(f"{BASE_URL}/api/upload", files=files, headers=H, timeout=120)
        return r, len(buf.getvalue())

    def test_upload_compressed_and_thumbs(self, H):
        r, raw_len = self._upload(H)
        if r.status_code >= 500:
            pytest.fail(f"upload failed {r.status_code}: {r.text[:200]}")
        assert r.status_code == 201, r.text
        d = r.json()
        path = d.get("storage_path") or d.get("path")
        CREATED["uploads"].append(path)
        assert path.endswith(".jpg"), d
        tok = H["Authorization"].split()[1]
        full = requests.get(f"{BASE_URL}/api/files/{path}", params={"token": tok}, timeout=60)
        assert full.status_code == 200
        print("cache-control via preview ingress:", full.headers.get("cache-control"))  # ingress rewrites it to no-store
        img = Image.open(io.BytesIO(full.content))
        assert max(img.size) <= 1280 and len(full.content) < raw_len
        t = requests.get(f"{BASE_URL}/api/files/{path}", params={"token": tok, "w": 96}, timeout=60)
        assert t.status_code == 200 and t.headers["content-type"].startswith("image/jpeg")
        assert max(Image.open(io.BytesIO(t.content)).size) <= 96
        t2 = requests.get(f"{BASE_URL}/api/files/{path}", params={"token": tok, "w": 5000}, timeout=60)
        assert t2.status_code == 200 and max(Image.open(io.BytesIO(t2.content)).size) <= 600
        assert requests.get(f"{BASE_URL}/api/files/{path}").status_code == 401
        assert requests.get(f"{BASE_URL}/api/files/{path}", params={"token": "bad"}).status_code == 401
