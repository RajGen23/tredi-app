"""Iteration 50: made_at rules for quick sales sent from the outbox.
- made_at honoured only when client_ref present
- staff (amina, role sales) limited to 3 days back, owner up to 30 days
- 'offline' flag only true when made_at is > 2 minutes old
- lost-reply retry (same ref) returns the same sale, stock moves once
"""
import os, uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
created = {"sales": [], "items": []}


def _login(email):
    r = requests.post(f"{BASE_URL}/api/auth/login", data={"username": email, "password": "tredi1234"},
                      headers={"Content-Type": "application/x-www-form-urlencoded"})
    if r.status_code != 200:
        pytest.skip(f"login {email} failed {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner():
    return _login("owner@tredi.app")


@pytest.fixture(scope="module")
def staff():
    return _login("amina@tredi.app")


@pytest.fixture(scope="module", autouse=True)
def cleanup(owner):
    yield
    for sid in set(created["sales"]):
        requests.post(f"{BASE_URL}/api/sales/{sid}/cancel", json={"reason": "TEST cleanup"}, headers=owner)
    for iid in set(created["items"]):
        requests.delete(f"{BASE_URL}/api/items/{iid}", headers=owner)


@pytest.fixture(scope="module")
def item(owner):
    r = requests.post(f"{BASE_URL}/api/items", json={"name": f"TEST_it50 {uuid.uuid4().hex[:6]}", "kind": "product", "category": "General",
                                                     "unit": "Piece", "cost_price": 100, "selling_price": 1000, "quantity": 50}, headers=owner)
    assert r.status_code in (200, 201), r.text
    created["items"].append(r.json()["id"])
    return r.json()["id"]


def _iso(delta):
    return (datetime.now(timezone.utc) - delta).isoformat()


def _parse(v):
    d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _sell(h, iid, **kw):
    body = {"lines": [{"item_id": iid, "name": "TEST_it50", "quantity": 1, "unit_price": 1000}], "method": "cash", "tendered": 1000, **kw}
    r = requests.post(f"{BASE_URL}/api/sales", json=body, headers=h)
    assert r.status_code == 201, r.text
    created["sales"].append(r.json()["id"])
    return r.json()


def _near_now(v, mins=3):
    return abs(datetime.now(timezone.utc) - _parse(v)) < timedelta(minutes=mins)


# made_at ignored without a client_ref
def test_made_at_ignored_without_ref(owner, item):
    s = _sell(owner, item, made_at=_iso(timedelta(days=2)))
    assert _near_now(s["created_at"])
    assert not s.get("offline")


# fresh online sale with ref: offline False
def test_fresh_ref_not_offline(owner, item):
    s = _sell(owner, item, client_ref=f"TEST-{uuid.uuid4().hex}", made_at=_iso(timedelta(seconds=5)))
    assert s.get("client_ref") and s.get("offline") is False


# made_at > 2 min old: offline True
def test_old_ref_offline_true(owner, item):
    s = _sell(owner, item, client_ref=f"TEST-{uuid.uuid4().hex}", made_at=_iso(timedelta(minutes=10)))
    assert s.get("offline") is True


# owner: 20 days honoured, 40 days -> now
def test_owner_window(owner, item):
    a = _sell(owner, item, client_ref=f"TEST-{uuid.uuid4().hex}", made_at=_iso(timedelta(days=20)))
    assert abs(_parse(a["created_at"]) - _parse(_iso(timedelta(days=20)))) < timedelta(minutes=2)
    b = _sell(owner, item, client_ref=f"TEST-{uuid.uuid4().hex}", made_at=_iso(timedelta(days=40)))
    assert _near_now(b["created_at"])


# staff: 2 days honoured, 5 days -> now
def test_staff_window(staff, item):
    a = _sell(staff, item, client_ref=f"TEST-{uuid.uuid4().hex}", made_at=_iso(timedelta(days=2)))
    assert abs(_parse(a["created_at"]) - _parse(_iso(timedelta(days=2)))) < timedelta(minutes=2)
    assert a.get("offline") is True
    b = _sell(staff, item, client_ref=f"TEST-{uuid.uuid4().hex}", made_at=_iso(timedelta(days=5)))
    assert _near_now(b["created_at"])


# lost reply: same ref twice -> same sale, stock moved once
def test_lost_reply_retry_same_sale(owner, item):
    before = requests.get(f"{BASE_URL}/api/items/{item}", headers=owner).json()["quantity"]
    ref, at = f"TEST-{uuid.uuid4().hex}", _iso(timedelta(seconds=1))
    a = _sell(owner, item, client_ref=ref, made_at=at)
    b = _sell(owner, item, client_ref=ref, made_at=at)
    assert a["id"] == b["id"] and a["number"] == b["number"]
    after = requests.get(f"{BASE_URL}/api/items/{item}", headers=owner).json()["quantity"]
    assert before - after == 1
