"""Phase 8 — the plan a business is on decides what it can add.

A brand-new business is on the 14-day free trial: one shop, two people, one
business, no transfers, no custom roles. Everything above that answers 402 with
a sentence the owner can act on.
"""
import os
import time
import pytest
import httpx

BASE = os.environ.get("TEST_BASE", "http://localhost:8001/api")
PWD = "tredi1234"


def h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def trial():
    """A fresh owner with a fresh business, so the trial ceilings are real."""
    stamp = str(int(time.time() * 1000))
    email = f"plan{stamp}@example.com"
    r = httpx.post(f"{BASE}/auth/register", json={"name": "Plan Tester", "email": email, "password": PWD}, timeout=60)
    r.raise_for_status()
    tok = r.json()["access_token"]
    b = httpx.post(f"{BASE}/business", json={"name": f"Plan Shop {stamp}", "shop_name": "Main branch"}, headers=h(tok), timeout=60)
    b.raise_for_status()
    return {"token": tok, "email": email, "business": b.json()}


def test_new_business_starts_on_the_free_trial(trial):
    d = httpx.get(f"{BASE}/subscription", headers=h(trial["token"]), timeout=60).json()
    assert d["plan"] == "trial"
    assert d["status"] == "trialing"
    assert 12 <= d["days_left"] <= 14
    assert d["limits"] == {"shops": 1, "users": 2, "businesses": 1}
    assert d["usage"]["shops"] == 1
    assert d["pending"] is None


def test_plan_catalogue_has_three_plans_and_a_matrix(trial):
    d = httpx.get(f"{BASE}/plans", headers=h(trial["token"]), timeout=60).json()
    assert [p["key"] for p in d["plans"]] == ["trial", "starter", "pro"]
    assert d["current"] == "trial"
    assert any(m["key"] == "invoice_photos" for m in d["matrix"])
    starter = next(p for p in d["plans"] if p["key"] == "starter")
    # the shop can save photos on items, but Starter does not print them
    assert starter["features"]["invoice_photos"] is False
    assert next(p for p in d["plans"] if p["key"] == "pro")["features"]["invoice_photos"] is True


def test_second_shop_is_blocked_on_trial(trial):
    r = httpx.post(f"{BASE}/shops", json={"name": "Second branch"}, headers=h(trial["token"]), timeout=60)
    assert r.status_code == 402
    assert "Free trial covers 1 shops" in r.json()["detail"]
    assert "Starter" in r.json()["detail"]


def test_third_team_member_is_blocked_on_trial(trial):
    ok = httpx.post(f"{BASE}/team", json={"name": "Rep One", "email": f"rep1-{trial['email']}", "role": "sales"},
                    headers=h(trial["token"]), timeout=60)
    assert ok.status_code == 201, ok.text
    blocked = httpx.post(f"{BASE}/team", json={"name": "Rep Two", "email": f"rep2-{trial['email']}", "role": "sales"},
                         headers=h(trial["token"]), timeout=60)
    assert blocked.status_code == 402
    assert "team members" in blocked.json()["detail"]


def test_transfers_and_custom_roles_need_a_paid_plan(trial):
    t = httpx.post(f"{BASE}/transfers", json={"from_shop": "Main branch", "to_shop": "Second", "lines": []},
                   headers=h(trial["token"]), timeout=60)
    assert t.status_code == 402
    assert "Stock transfers" in t.json()["detail"]
    r = httpx.post(f"{BASE}/roles", json={"label": "Night manager", "start_from": "manager"},
                   headers=h(trial["token"]), timeout=60)
    assert r.status_code == 402
    assert "Custom roles" in r.json()["detail"]


def test_second_business_needs_pro(trial):
    r = httpx.post(f"{BASE}/businesses", json={"name": "Another shop", "shop_name": "Main"},
                   headers=h(trial["token"]), timeout=60)
    assert r.status_code == 402
    assert "more than one business".lower() in r.json()["detail"].lower()


def test_invoice_settings_report_whether_photos_may_print(trial):
    d = httpx.get(f"{BASE}/settings/invoice", headers=h(trial["token"]), timeout=60).json()
    assert d["photos_allowed"] is True  # the trial shows everything
    assert d["plan"] == "trial"


def test_requesting_a_plan_records_it_once(trial):
    r = httpx.post(f"{BASE}/subscription/request", json={"plan": "starter"}, headers=h(trial["token"]), timeout=60)
    assert r.status_code == 200
    assert "Starter" in r.json()["message"]
    again = httpx.post(f"{BASE}/subscription/request", json={"plan": "pro"}, headers=h(trial["token"]), timeout=60)
    assert again.status_code == 200
    d = httpx.get(f"{BASE}/subscription", headers=h(trial["token"]), timeout=60).json()
    assert d["pending"]["plan"] == "pro"  # the newest ask replaces the old one
    bad = httpx.post(f"{BASE}/subscription/request", json={"plan": "trial"}, headers=h(trial["token"]), timeout=60)
    assert bad.status_code == 400
    httpx.request("DELETE", f"{BASE}/subscription/request", headers=h(trial["token"]), timeout=60)
    assert httpx.get(f"{BASE}/subscription", headers=h(trial["token"]), timeout=60).json()["pending"] is None


def test_admin_can_activate_a_requested_plan(trial):
    httpx.post(f"{BASE}/subscription/request", json={"plan": "starter"}, headers=h(trial["token"]), timeout=60)
    login = httpx.post(f"{BASE}/admin/auth/login", json={"email": "superadmin@tredi.app", "password": "tredi1234"}, timeout=120)
    if login.status_code != 200:
        pytest.skip("super admin not seeded")
    atok = login.json()["access_token"]
    rows = httpx.get(f"{BASE}/admin/plan-requests", headers=h(atok), timeout=60).json()["rows"]
    mine = next((r for r in rows if r["business_id"] == trial["business"]["id"]), None)
    assert mine, "the request should reach the panel"
    ok = httpx.post(f"{BASE}/admin/plan-requests/{mine['id']}/approve", json={"months": 2}, headers=h(atok), timeout=60)
    assert ok.status_code == 200
    d = httpx.get(f"{BASE}/subscription", headers=h(trial["token"]), timeout=60).json()
    assert d["plan"] == "starter"
    assert d["status"] == "active"
    assert d["limits"]["shops"] == 2
    # now the second shop goes in, and photos stop printing
    assert httpx.post(f"{BASE}/shops", json={"name": "Second branch"}, headers=h(trial["token"]), timeout=60).status_code == 201
    settings = httpx.get(f"{BASE}/settings/invoice", headers=h(trial["token"]), timeout=60).json()
    assert settings["photos_allowed"] is False
    assert settings["show_photos"] is False


def test_an_expired_subscription_is_read_only_but_never_hidden(trial):
    """Writes stop, reads keep working, and the message says what to do."""
    from datetime import datetime, timedelta, timezone
    from bson import ObjectId
    from pymongo import MongoClient

    mongo = os.environ.get("MONGO_URL")
    if not mongo:
        from dotenv import dotenv_values
        mongo = dotenv_values("/app/backend/.env").get("MONGO_URL")
        dbname = dotenv_values("/app/backend/.env").get("DB_NAME")
    else:
        dbname = os.environ.get("DB_NAME")
    if not mongo or not dbname:
        pytest.skip("no database handle for this test")
    col = MongoClient(mongo)[dbname].businesses
    bid = ObjectId(trial["business"]["id"])

    def set_renews(days: int):
        col.update_one({"_id": bid}, {"$set": {"renews_at": datetime.now(timezone.utc) + timedelta(days=days)}})

    set_renews(-1)
    try:
        blocked = httpx.post(f"{BASE}/customers", json={"name": "Walk-in"}, headers=h(trial["token"]), timeout=60)
        assert blocked.status_code == 402
        assert "readable" in blocked.json()["detail"]
        assert httpx.get(f"{BASE}/customers", headers=h(trial["token"]), timeout=60).status_code == 200
        assert httpx.get(f"{BASE}/dashboard", headers=h(trial["token"]), timeout=120).status_code == 200
        # asking for a plan must never be blocked by the block itself
        assert httpx.post(f"{BASE}/subscription/request", json={"plan": "pro"}, headers=h(trial["token"]), timeout=60).status_code == 200
    finally:
        set_renews(30)
    assert httpx.post(f"{BASE}/customers", json={"name": "Walk-in"}, headers=h(trial["token"]), timeout=60).status_code == 201


def test_the_demo_business_was_grandfathered_and_can_still_write():
    tok = httpx.post(f"{BASE}/auth/login", data={"username": "owner@tredi.app", "password": PWD}, timeout=60).json()["access_token"]
    d = httpx.get(f"{BASE}/subscription", headers=h(tok), timeout=60).json()
    assert d["status"] == "active"
    assert d["plan"] == "pro"
