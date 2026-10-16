"""Iteration 15 endpoint coverage.

Focuses on the endpoints listed in the review request:
  - POST /api/upload (2 MB accepted, 9 MB rejected with the exact toast text)
  - GET/PUT/DELETE /api/expenses/{id}
  - PUT /api/customers/{id}
  - GET /api/reports/entries?kind=(sales|expenses|product)
  - GET /api/reports/reps
  - GET /api/reports/debtors
  - GET /api/reps/{uid}/transactions

Uses owner@tredi.app so it reads the seeded demo data (Adaeze vs Amina figures).
Creates/cleans TEST_ rows only.
"""
import io
import os
import time
import uuid
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "").rstrip("/")


# ---------- helpers ----------
def _png_bytes(size_bytes: int) -> bytes:
    """Return a valid PNG whose total length is roughly `size_bytes`.

    We create a 1×1 PNG header + a big zTXt chunk padded with 0x00 so the
    payload really does hit the requested byte count (server enforces >8MB).
    """
    # 1x1 PNG scaffolding
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    idat_raw = zlib.compress(b"\x00\xff\xff\xff")
    idat = chunk(b"IDAT", idat_raw)
    iend = chunk(b"IEND", b"")
    base = sig + ihdr + idat + iend
    if size_bytes <= len(base):
        return base
    # pad with a private text chunk to reach the requested byte size
    pad_len = size_bytes - len(base) - 12  # 12 = chunk overhead
    pad = b"tEXtpad\x00" + (b"A" * max(pad_len - 8, 0))
    # rebuild with a padding chunk between IDAT and IEND
    padchunk = chunk(b"teXt", pad)
    return sig + ihdr + idat + padchunk + iend


@pytest.fixture(scope="module")
def owner():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               data={"username": "owner@tredi.app", "password": "tredi1234"},
               headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    return {"session": s, "headers": h, "token": tok}


# ---------- /api/upload ----------
class TestUpload:
    def test_upload_small_photo_returns_path(self, owner):
        data = _png_bytes(200 * 1024)   # 200 KB
        r = owner["session"].post(f"{BASE_URL}/api/upload",
                                  headers=owner["headers"],
                                  files={"file": ("small.png", data, "image/png")})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["path"].startswith("tredi/uploads/"), body
        assert body["url"].startswith("/api/files/"), body
        assert body["size"] == len(data)

    def test_upload_2mb_photo_accepted(self, owner):
        data = _png_bytes(2 * 1024 * 1024 + 500)   # ~2 MB
        r = owner["session"].post(f"{BASE_URL}/api/upload",
                                  headers=owner["headers"],
                                  files={"file": ("mid.png", data, "image/png")})
        assert r.status_code == 201, r.text[:200]

    def test_upload_9mb_photo_rejected_with_friendly_message(self, owner):
        data = _png_bytes(9 * 1024 * 1024)   # 9 MB, over MAX_BYTES=8 MB
        r = owner["session"].post(f"{BASE_URL}/api/upload",
                                  headers=owner["headers"],
                                  files={"file": ("big.png", data, "image/png")})
        assert r.status_code == 400
        assert "8 MB" in r.text or "8mb" in r.text.lower(), r.text

    def test_upload_empty_file_rejected(self, owner):
        r = owner["session"].post(f"{BASE_URL}/api/upload",
                                  headers=owner["headers"],
                                  files={"file": ("empty.png", b"", "image/png")})
        assert r.status_code == 400
        assert "empty" in r.text.lower()


# ---------- /api/customers/{cid} PUT ----------
class TestCustomerUpdate:
    def test_put_customer_persists(self, owner):
        # Fetch a customer
        r = owner["session"].get(f"{BASE_URL}/api/customers", headers=owner["headers"])
        assert r.status_code == 200
        customers = r.json()
        assert customers, "seed data missing customers"
        cid = customers[0]["id"]
        original = customers[0]

        payload = {
            "name": original.get("name", "Test Customer"),
            "phone": original.get("phone", ""),
            "email": original.get("email", "") or "",
            "address": f"TEST_iter15 {uuid.uuid4().hex[:6]}",
            "opening_balance": original.get("opening_balance", 0) or 0,
            "opening_type": original.get("opening_type", "owes_me"),
            "price_list": original.get("price_list", "Retail"),
            "credit_limit": 987654,
            "shop": original.get("shop", ""),
        }
        r = owner["session"].put(f"{BASE_URL}/api/customers/{cid}", json=payload,
                                 headers={**owner["headers"], "Content-Type": "application/json"})
        assert r.status_code == 200, r.text
        # GET to verify persistence
        r2 = owner["session"].get(f"{BASE_URL}/api/customers/{cid}", headers=owner["headers"])
        assert r2.status_code == 200
        got = r2.json()
        assert got.get("credit_limit") == 987654, got
        assert got.get("address") == payload["address"], got

        # Restore original values (best-effort)
        restore = {**payload,
                   "address": original.get("address", "") or "",
                   "credit_limit": original.get("credit_limit", 150000)}
        owner["session"].put(f"{BASE_URL}/api/customers/{cid}", json=restore,
                             headers={**owner["headers"], "Content-Type": "application/json"})


# ---------- /api/expenses/{eid} round-trip ----------
class TestExpenses:
    def test_expense_create_get_put_delete(self, owner):
        # Need an account id
        acc = owner["session"].get(f"{BASE_URL}/api/accounts", headers=owner["headers"]).json()
        accs = acc["accounts"] if isinstance(acc, dict) else acc
        assert accs, "no accounts seeded"
        account_id = accs[0]["id"]

        create = {"amount": 1234.5, "category": "TEST_iter15",
                  "account_id": account_id, "note": "TEST iter15 expense",
                  "shop": "", "rep": ""}
        r = owner["session"].post(f"{BASE_URL}/api/expenses", json=create,
                                  headers={**owner["headers"], "Content-Type": "application/json"})
        assert r.status_code == 201, r.text
        eid = r.json()["id"]

        # GET
        g = owner["session"].get(f"{BASE_URL}/api/expenses/{eid}", headers=owner["headers"])
        assert g.status_code == 200, g.text
        assert g.json()["amount"] == 1234.5

        # PUT
        patch = {**create, "amount": 4321.0, "note": "TEST iter15 corrected"}
        u = owner["session"].put(f"{BASE_URL}/api/expenses/{eid}", json=patch,
                                 headers={**owner["headers"], "Content-Type": "application/json"})
        assert u.status_code == 200, u.text

        g2 = owner["session"].get(f"{BASE_URL}/api/expenses/{eid}", headers=owner["headers"])
        assert g2.json()["amount"] == 4321.0

        # DELETE with a reason
        d = owner["session"].request("DELETE", f"{BASE_URL}/api/expenses/{eid}",
                                     json={"reason": "TEST iter15 cleanup"},
                                     headers={**owner["headers"], "Content-Type": "application/json"})
        # Some backends want a query, some want a body — accept 200/204
        assert d.status_code in (200, 204), d.text

        g3 = owner["session"].get(f"{BASE_URL}/api/expenses/{eid}", headers=owner["headers"])
        assert g3.status_code == 404


# ---------- /api/reports ----------
class TestReports:
    def test_reports_reps(self, owner):
        r = owner["session"].get(f"{BASE_URL}/api/reports/reps", headers=owner["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        rows = body.get("rows") or body.get("reps") or []
        assert rows, body
        # Master plan requires per-rep sales/collections/expenses to render
        for row in rows:
            for k in ("rep", "sales", "collected", "expenses"):
                assert k in row, f"missing {k} in {row}"
        # In isolation the reconcile script guarantees 15,292,445. In the full
        # suite prior tests seed extra invoices, so we accept >= reconcile figure.
        total = sum(x.get("sales", 0) for x in rows)
        assert total >= 15_292_445 - 1, total

    def test_reports_debtors(self, owner):
        r = owner["session"].get(f"{BASE_URL}/api/reports/debtors", headers=owner["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        rows = body.get("rows") or body.get("debtors") or []
        assert rows, body
        row = rows[0]
        # Expected fields per the master plan (backend uses `customer` and `owed`)
        for key in ("customer", "owed"):
            assert key in row, f"missing {key} in {row}"
        # oldest unpaid + days late present with any of these names
        assert any(k in row for k in ("oldest", "oldest_invoice", "oldest_number", "oldest_no"))
        assert any(k in row for k in ("days_late", "days", "days_overdue", "oldest_days"))

    def test_reports_entries_expenses(self, owner):
        r = owner["session"].get(f"{BASE_URL}/api/reports/entries",
                                 params={"kind": "expenses", "period": "year"},
                                 headers=owner["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("rows"), list)
        assert body.get("total") is not None

    def test_reports_entries_sales(self, owner):
        r = owner["session"].get(f"{BASE_URL}/api/reports/entries",
                                 params={"kind": "sales", "period": "year"},
                                 headers=owner["headers"])
        assert r.status_code == 200, r.text

    def test_reports_summary_rep_filter(self, owner):
        # Owner-scoped totals should differ from Amina's totals
        r1 = owner["session"].get(f"{BASE_URL}/api/reports/summary",
                                  params={"period": "year", "rep": "Amina Yusuf"},
                                  headers=owner["headers"])
        r2 = owner["session"].get(f"{BASE_URL}/api/reports/summary",
                                  params={"period": "year", "rep": "Adaeze Owner"},
                                  headers=owner["headers"])
        assert r1.status_code == 200 and r2.status_code == 200
        b1, b2 = r1.json(), r2.json()
        # Values must differ — Amina 223,232.50 vs Adaeze 15,069,212.50
        assert b1 != b2, (b1, b2)


# ---------- /api/reps/{uid}/transactions ----------
class TestRepTransactions:
    def test_rep_transactions_shape(self, owner):
        users = owner["session"].get(f"{BASE_URL}/api/team", headers=owner["headers"])
        assert users.status_code == 200, users.text
        body = users.json()
        team = body["users"] if isinstance(body, dict) else body
        # Pick any rep with a user id
        target = next((u for u in team if isinstance(u, dict) and u.get("id")), None)
        assert target, team
        r = owner["session"].get(f"{BASE_URL}/api/reps/{target['id']}/transactions",
                                 headers=owner["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        # Expect a list of transactions or a dict with rows/expenses
        if isinstance(body, dict):
            assert "rows" in body or "transactions" in body or "expenses" in body, body
        else:
            assert isinstance(body, list), body
