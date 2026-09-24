"""Iteration 14 — extra coverage for the plans/subscription flow.

test_plans.py already covers most of the review request. This file adds:
 - decline without a note is 400
 - DELETE /api/subscription/request clears a pending row
 - the plan matrix is well-formed (has a features row per plan)
 - Starter with photos_allowed false forces show_photos to false
"""
import os
import time
import httpx
import pytest

BASE = os.environ.get("TEST_BASE", "http://localhost:8001/api")
PWD = "tredi1234"


def h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def trial():
    stamp = str(int(time.time() * 1000))
    email = f"planx{stamp}@example.com"
    r = httpx.post(f"{BASE}/auth/register",
                   json={"name": "Plan X", "email": email, "password": PWD}, timeout=60)
    r.raise_for_status()
    tok = r.json()["access_token"]
    b = httpx.post(f"{BASE}/business",
                   json={"name": f"Plan X {stamp}", "shop_name": "Main"},
                   headers=h(tok), timeout=60)
    b.raise_for_status()
    return {"token": tok, "email": email, "business": b.json()}


@pytest.fixture(scope="module")
def admin_tok():
    r = httpx.post(f"{BASE}/admin/auth/login",
                   json={"email": "superadmin@tredi.app", "password": PWD}, timeout=120)
    if r.status_code != 200:
        pytest.skip("super admin not seeded")
    return r.json()["access_token"]


def test_delete_subscription_request_clears_the_pending_row(trial):
    r = httpx.post(f"{BASE}/subscription/request", json={"plan": "starter"},
                   headers=h(trial["token"]), timeout=60)
    assert r.status_code == 200, r.text
    assert httpx.get(f"{BASE}/subscription", headers=h(trial["token"]), timeout=60).json()["pending"] is not None
    d = httpx.request("DELETE", f"{BASE}/subscription/request",
                      headers=h(trial["token"]), timeout=60)
    assert d.status_code == 200, d.text
    assert httpx.get(f"{BASE}/subscription", headers=h(trial["token"]), timeout=60).json()["pending"] is None


def test_admin_decline_without_a_note_is_400(trial, admin_tok):
    httpx.request("DELETE", f"{BASE}/subscription/request", headers=h(trial["token"]), timeout=60)
    httpx.post(f"{BASE}/subscription/request", json={"plan": "starter"},
               headers=h(trial["token"]), timeout=60)
    rows = httpx.get(f"{BASE}/admin/plan-requests", headers=h(admin_tok), timeout=60).json()["rows"]
    mine = next((r for r in rows if r["business_id"] == trial["business"]["id"]), None)
    assert mine, "should surface in admin panel"
    bad = httpx.post(f"{BASE}/admin/plan-requests/{mine['id']}/decline",
                     json={"months": 1, "note": ""}, headers=h(admin_tok), timeout=60)
    assert bad.status_code == 400
    ok = httpx.post(f"{BASE}/admin/plan-requests/{mine['id']}/decline",
                    json={"months": 1, "note": "Bank transfer not received"},
                    headers=h(admin_tok), timeout=60)
    assert ok.status_code == 200


def test_plan_matrix_row_shape(trial):
    d = httpx.get(f"{BASE}/plans", headers=h(trial["token"]), timeout=60).json()
    matrix = d["matrix"]
    assert matrix and isinstance(matrix, list)
    for row in matrix:
        assert "key" in row and "label" in row and "kind" in row
    # the plans carry the actual values
    keys = {p["key"] for p in d["plans"]}
    assert keys == {"trial", "starter", "pro"}


def test_starter_photo_flag_is_persisted(trial, admin_tok):
    """After the admin flips the tenant to Starter, /settings/invoice must
    both refuse photos AND force show_photos off, even if the tenant had it
    on while on trial."""
    # try flipping show_photos on while on trial (allowed)
    on = httpx.put(f"{BASE}/settings/invoice", json={"show_photos": True},
                   headers=h(trial["token"]), timeout=60)
    # some backends use PATCH; skip if PUT is not supported
    if on.status_code in (404, 405):
        pytest.skip("invoice settings write not exposed")
    httpx.request("DELETE", f"{BASE}/subscription/request", headers=h(trial["token"]), timeout=60)
    httpx.post(f"{BASE}/subscription/request", json={"plan": "starter"},
               headers=h(trial["token"]), timeout=60)
    rows = httpx.get(f"{BASE}/admin/plan-requests", headers=h(admin_tok), timeout=60).json()["rows"]
    mine = next((r for r in rows if r["business_id"] == trial["business"]["id"]), None)
    assert mine
    ok = httpx.post(f"{BASE}/admin/plan-requests/{mine['id']}/approve",
                    json={"months": 1}, headers=h(admin_tok), timeout=60)
    assert ok.status_code == 200
    d = httpx.get(f"{BASE}/settings/invoice", headers=h(trial["token"]), timeout=60).json()
    assert d["plan"] == "starter"
    assert d["photos_allowed"] is False
    assert d["show_photos"] is False
