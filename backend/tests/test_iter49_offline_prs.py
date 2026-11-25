"""Iter49: PR #5 (offline errors) + PR #6 (offline outbox: client_ref idempotency, made_at backdating).
Every record created here is cleaned up by id."""
import uuid
import concurrent.futures as cf
from datetime import datetime, timedelta, timezone

import pytest
import requests

from conftest import BASE_URL

created = {"items": [], "sales": [], "invoices": []}


def _ref():
    return f"TEST-{uuid.uuid4().hex}"


@pytest.fixture(scope="module", autouse=True)
def cleanup(owner_headers):
    yield
    s = requests.Session()
    for sid in set(created["sales"]):
        s.post(f"{BASE_URL}/api/sales/{sid}/cancel", json={"reason": "TEST cleanup"}, headers=owner_headers)
    for iid in set(created["invoices"]):
        s.delete(f"{BASE_URL}/api/invoices/{iid}", params={"reason": "TEST cleanup"}, headers=owner_headers)
    for iid in set(created["items"]):
        s.delete(f"{BASE_URL}/api/items/{iid}", headers=owner_headers)


def _item(session, h, qty=10):
    r = session.post(f"{BASE_URL}/api/items", json={"name": f"TEST_off {uuid.uuid4().hex[:6]}", "kind": "product", "category": "General",
                                                    "unit": "Piece", "cost_price": 100, "selling_price": 1000, "quantity": qty}, headers=h)
    assert r.status_code in (200, 201), r.text
    created["items"].append(r.json()["id"])
    return r.json()["id"]


def _qty(session, h, iid):
    return session.get(f"{BASE_URL}/api/items/{iid}", headers=h).json()["quantity"]


def _sale(iid, q=1, **kw):
    return {"lines": [{"item_id": iid, "name": "TEST_off", "quantity": q, "unit_price": 1000}], "method": "cash", "tendered": 1000 * q, **kw}


# --- PR6 sales idempotency ---
class TestSaleClientRef:
    def test_repeat_returns_same_record_and_shape(self, session, owner_headers):
        iid = _item(session, owner_headers)
        body = _sale(iid, 2, client_ref=_ref())
        a = session.post(f"{BASE_URL}/api/sales", json=body, headers=owner_headers)
        b = session.post(f"{BASE_URL}/api/sales", json=body, headers=owner_headers)
        assert a.status_code == 201 and b.status_code == 201, (a.text, b.text)
        created["sales"].append(a.json()["id"])
        assert a.json()["id"] == b.json()["id"] and a.json()["number"] == b.json()["number"]
        # online sales now carry a client_ref too; "offline" is only set when it was sent minutes after it was made
        assert a.json().get("client_ref") == body["client_ref"]
        assert "_id" not in b.json()
        assert set(a.json().keys()) == set(b.json().keys())
        assert _qty(session, owner_headers, iid) == 8

    def test_concurrent_same_ref_creates_one(self, session, owner_headers):
        iid = _item(session, owner_headers)
        body = _sale(iid, 1, client_ref=_ref())

        def go(_):
            return requests.post(f"{BASE_URL}/api/sales", json=body, headers=owner_headers)
        with cf.ThreadPoolExecutor(6) as ex:
            rs = list(ex.map(go, range(6)))
        codes = [r.status_code for r in rs]
        assert all(c == 201 for c in codes), [r.text for r in rs]
        ids = {r.json()["id"] for r in rs}
        created["sales"].extend(ids)
        assert len(ids) == 1, ids
        assert _qty(session, owner_headers, iid) == 9

    def test_made_at_in_range_is_kept(self, session, owner_headers):
        iid = _item(session, owner_headers)
        when = (datetime.now(timezone.utc) - timedelta(days=2)).replace(microsecond=0)
        r = session.post(f"{BASE_URL}/api/sales", json=_sale(iid, client_ref=_ref(), made_at=when.isoformat().replace("+00:00", "Z")), headers=owner_headers)
        assert r.status_code == 201, r.text
        created["sales"].append(r.json()["id"])
        got = datetime.fromisoformat(str(r.json()["created_at"]).replace("Z", "+00:00"))
        got = got if got.tzinfo else got.replace(tzinfo=timezone.utc)
        assert abs((got - when).total_seconds()) < 2, (got, when)

    @pytest.mark.parametrize("made_at", ["OLD", "FUTURE", "garbage-date"])
    def test_made_at_out_of_range_or_bad_falls_back_to_now(self, session, owner_headers, made_at):
        iid = _item(session, owner_headers)
        val = {"OLD": (datetime.now(timezone.utc) - timedelta(days=40)).isoformat(),
               "FUTURE": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()}.get(made_at, made_at)
        r = session.post(f"{BASE_URL}/api/sales", json=_sale(iid, client_ref=_ref(), made_at=val), headers=owner_headers)
        assert r.status_code == 201, r.text
        created["sales"].append(r.json()["id"])
        got = datetime.fromisoformat(str(r.json()["created_at"]).replace("Z", "+00:00"))
        got = got if got.tzinfo else got.replace(tzinfo=timezone.utc)
        assert abs((datetime.now(timezone.utc) - got).total_seconds()) < 120

    def test_naive_made_at_accepted(self, session, owner_headers):
        iid = _item(session, owner_headers)
        when = (datetime.now(timezone.utc) - timedelta(hours=3)).replace(tzinfo=None, microsecond=0)
        r = session.post(f"{BASE_URL}/api/sales", json=_sale(iid, client_ref=_ref(), made_at=when.isoformat()), headers=owner_headers)
        assert r.status_code == 201, r.text
        created["sales"].append(r.json()["id"])

    def test_empty_lines_with_ref_rejected(self, session, owner_headers):
        r = session.post(f"{BASE_URL}/api/sales", json={"lines": [], "method": "cash", "client_ref": _ref()}, headers=owner_headers)
        assert r.status_code == 400

    def test_no_auth_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/sales", json={"lines": [], "method": "cash", "client_ref": _ref()})
        assert r.status_code == 401

    def test_offline_sale_listed(self, session, owner_headers):
        iid = _item(session, owner_headers)
        ref = _ref()
        r = session.post(f"{BASE_URL}/api/sales", json=_sale(iid, client_ref=ref), headers=owner_headers)
        created["sales"].append(r.json()["id"])
        lst = session.get(f"{BASE_URL}/api/sales", headers=owner_headers).json()
        assert any(x["id"] == r.json()["id"] for x in lst)
        g = session.get(f"{BASE_URL}/api/sales/{r.json()['id']}", headers=owner_headers)
        assert g.status_code == 200 and g.json()["id"] == r.json()["id"]


# --- PR6 invoice idempotency ---
class TestInvoiceClientRef:
    def _inv(self, iid, status="issued", **kw):
        return {"lines": [{"item_id": iid, "name": "TEST_off", "quantity": 2, "unit_price": 1000}], "vat_rate": 0, "status": status,
                "payment_mode": "credit", **kw}

    def test_draft_repeat_same_number_no_stock(self, session, owner_headers):
        iid = _item(session, owner_headers)
        body = self._inv(iid, "draft", client_ref=_ref())
        a = session.post(f"{BASE_URL}/api/invoices", json=body, headers=owner_headers)
        b = session.post(f"{BASE_URL}/api/invoices", json=body, headers=owner_headers)
        assert a.status_code in (200, 201), a.text
        created["invoices"].append(a.json()["id"])
        assert a.json()["id"] == b.json()["id"] and a.json()["number"] == b.json()["number"]
        assert a.json()["status"] == "draft"
        assert _qty(session, owner_headers, iid) == 10

    def test_concurrent_issued_creates_one(self, session, owner_headers):
        iid = _item(session, owner_headers)
        body = self._inv(iid, client_ref=_ref())

        def go(_):
            return requests.post(f"{BASE_URL}/api/invoices", json=body, headers=owner_headers)
        with cf.ThreadPoolExecutor(5) as ex:
            rs = list(ex.map(go, range(5)))
        assert all(r.status_code in (200, 201) for r in rs), [r.text for r in rs]
        ids = {r.json()["id"] for r in rs}
        created["invoices"].extend(ids)
        assert len(ids) == 1
        assert _qty(session, owner_headers, iid) == 8

    def test_edit_keeps_client_ref(self, session, owner_headers):
        iid = _item(session, owner_headers)
        ref = _ref()
        a = session.post(f"{BASE_URL}/api/invoices", json=self._inv(iid, "draft", client_ref=ref), headers=owner_headers).json()
        created["invoices"].append(a["id"])
        u = session.put(f"{BASE_URL}/api/invoices/{a['id']}", json=self._inv(iid, "draft"), headers=owner_headers)
        assert u.status_code == 200, u.text
        again = session.post(f"{BASE_URL}/api/invoices", json=self._inv(iid, "draft", client_ref=ref), headers=owner_headers).json()
        assert again["id"] == a["id"]

    def test_invoices_without_ref_stay_separate(self, session, owner_headers):
        iid = _item(session, owner_headers)
        a = session.post(f"{BASE_URL}/api/invoices", json=self._inv(iid, "draft"), headers=owner_headers).json()
        b = session.post(f"{BASE_URL}/api/invoices", json=self._inv(iid, "draft"), headers=owner_headers).json()
        created["invoices"] += [a["id"], b["id"]]
        assert a["id"] != b["id"]
