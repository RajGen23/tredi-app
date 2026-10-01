"""Iter 20 — Record history endpoint: single screen reached from invoice detail
header clock button and the Activity row, plus item/sale history entry points."""
import os
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{BASE}/auth/login", data={"username": "owner@tredi.app", "password": "tredi1234"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdr(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


# --- invoice history round-trip --------------------------------------------
def test_history_for_invoice(hdr):
    inv_list = requests.get(f"{BASE}/invoices", headers=hdr, timeout=30)
    assert inv_list.status_code == 200
    body = inv_list.json()
    invs = body.get("rows") if isinstance(body, dict) else body
    assert isinstance(invs, list) and len(invs) > 0
    inv_id = invs[0]["id"]

    r = requests.get(f"{BASE}/history/{inv_id}", headers=hdr, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "title" in d and "sub" in d and "rows" in d and "count" in d
    assert isinstance(d["rows"], list)
    assert d["count"] == len(d["rows"])
    # title should be the invoice number for an invoice ref
    assert d["title"].startswith("INV") or d["title"].startswith("SL") or d["title"] != "Record"
    # Each row must have the fields the UI reads
    for row in d["rows"]:
        for k in ("id", "kind", "title", "created_at"):
            assert k in row, f"missing {k} in {row}"


def test_history_for_item(hdr):
    r = requests.get(f"{BASE}/items", headers=hdr, timeout=30)
    assert r.status_code == 200
    body = r.json()
    rows = body.get("rows") if isinstance(body, dict) else body
    assert len(rows) > 0
    item_id = rows[0]["id"]
    h = requests.get(f"{BASE}/history/{item_id}", headers=hdr, timeout=30)
    assert h.status_code == 200
    d = h.json()
    assert "rows" in d and "title" in d and "sub" in d
    # item history title should be the item name (not the fallback "Record")
    assert d["title"] != "Record"


def test_history_requires_auth():
    r = requests.get(f"{BASE}/history/anything", timeout=30)
    assert r.status_code in (401, 403)


def test_history_bogus_id_safe(hdr):
    # Non-ObjectId ref: endpoint still returns 200 with empty frame
    r = requests.get(f"{BASE}/history/not-an-oid", headers=hdr, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d.get("title") == "Record"
    assert d.get("rows") == []
    assert d.get("count") == 0
