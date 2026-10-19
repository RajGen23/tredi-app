"""Iteration 33 — Businesses/Customers merge validation.

Scope:
- Old sample /api/admin/businesses endpoints are removed (404)
- Live Overview / Subscriptions / Users / Plans endpoints return real data
- POST /api/admin/customers/{id}/suspend validates reason >=4 chars, blocks owner POSTs with 403,
  and can be restored (toggle).
"""
import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE:
    # fall back to frontend/.env
    for line in open("/app/frontend/.env"):
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip()
            break
assert BASE, "EXPO_PUBLIC_BACKEND_URL missing"
API = BASE.rstrip("/") + "/api"
ADMIN = {"email": "superadmin@tredi.app", "password": "tredi1234"}
OWNER = {"username": "owner@tredi.app", "password": "tredi1234"}


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/admin/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def owner_h():
    r = requests.post(f"{API}/auth/login", data=OWNER, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------------------------------------------------------- merge: old sample endpoints
class TestOldSampleEndpointsRemoved:
    def test_list_businesses_sample_removed(self, admin_h):
        r = requests.get(f"{API}/admin/businesses?size=5", headers=admin_h, timeout=20)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"

    def test_business_action_sample_removed(self, admin_h):
        r = requests.post(f"{API}/admin/businesses/abc/action", headers=admin_h,
                          json={"action": "force_sync"}, timeout=20)
        assert r.status_code == 404


# ---------------------------------------------------------------- live overview
class TestOverview:
    def test_overview_shape(self, admin_h):
        r = requests.get(f"{API}/admin/overview", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["metrics"], list) and len(d["metrics"]) == 5
        labels = [m["label"] for m in d["metrics"]]
        for L in ("Businesses", "Paying", "Active this week", "People on Tredi", "Plan value"):
            assert L in labels, labels
        for k in ("expiring", "lapsed", "plan_requests", "messages", "inactive"):
            assert k in d["attention"], d["attention"]
        assert isinstance(d["series"], list) and len(d["series"]) >= 1
        assert isinstance(d["recent"], list)

    def test_overview_no_sample_names(self, admin_h):
        """'recent' must contain real businesses, not seeded sample tenants like 'Mwangi Depot 217'."""
        d = requests.get(f"{API}/admin/overview", headers=admin_h, timeout=30).json()
        for row in d["recent"]:
            assert "Depot " not in row["name"] or not row["name"].split()[-1].isdigit(), row["name"]
            assert "Sani & Sons" not in row["name"], row["name"]

    def test_overview_90_window(self, admin_h):
        r = requests.get(f"{API}/admin/overview?window=90", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["series"]) >= 1


# ---------------------------------------------------------------- live subscriptions
class TestSubscriptions:
    @pytest.mark.parametrize("tab", ["7", "30", "lapsed", "trial", "paying"])
    def test_all_tabs(self, admin_h, tab):
        r = requests.get(f"{API}/admin/subscriptions?tab={tab}", headers=admin_h, timeout=30)
        assert r.status_code == 200, (tab, r.text)
        d = r.json()
        assert isinstance(d["metrics"], list) and len(d["metrics"]) == 4
        assert isinstance(d["rows"], list)
        assert isinstance(d["catalogue"], list) and len(d["catalogue"]) >= 4
        # catalogue keys are PAID_KEYS
        for p in d["catalogue"]:
            assert p["key"] in ("starter", "premium", "pro", "enterprise"), p

    def test_lapsed_rows_are_expired(self, admin_h):
        d = requests.get(f"{API}/admin/subscriptions?tab=lapsed", headers=admin_h, timeout=30).json()
        for r in d["rows"]:
            assert r["status"] == "expired", r

    def test_trial_rows_are_trialing(self, admin_h):
        d = requests.get(f"{API}/admin/subscriptions?tab=trial", headers=admin_h, timeout=30).json()
        for r in d["rows"]:
            assert r["status"] == "trialing", r


# ---------------------------------------------------------------- users
class TestUsers:
    def test_users_shape(self, admin_h):
        r = requests.get(f"{API}/admin/users", headers=admin_h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["page"] == 1
        for k in ("all", "owners", "staff", "never", "inactive"):
            assert k in d["counts"]
        assert d["counts"]["all"] >= 1

    def test_users_search_real_owner(self, admin_h):
        d = requests.get(f"{API}/admin/users?q=owner@tredi.app", headers=admin_h, timeout=30).json()
        assert d["total"] >= 1
        emails = [u["email"] for u in d["rows"]]
        assert "owner@tredi.app" in emails
        row = next(u for u in d["rows"] if u["email"] == "owner@tredi.app")
        assert row["business"] == "Tredi Ventures"
        assert row["name"] == "Adaeze Owner"

    def test_users_tab_owners(self, admin_h):
        d = requests.get(f"{API}/admin/users?tab=owners", headers=admin_h, timeout=30).json()
        for u in d["rows"]:
            assert u["role"] == "owner", u


# ---------------------------------------------------------------- plans catalogue
class TestPlans:
    def test_plans_listing(self, admin_h):
        d = requests.get(f"{API}/admin/plans", headers=admin_h, timeout=30).json()
        names = [p["name"] for p in d["plans"]]
        for L in ("Free trial", "Starter", "Premium", "Pro", "Enterprise", "Custom (per client)"):
            assert L in names, names
        custom = next(p for p in d["plans"] if p["key"] == "custom")
        assert isinstance(custom["count"], int)


# ---------------------------------------------------------------- suspend / pause
TREDI = "6aa7ae17267e782a241b7e6e"


def _find_test_biz(admin_h):
    rows = requests.get(f"{API}/admin/customers?q=TEST", headers=admin_h, timeout=20).json()["rows"]
    for r in rows:
        if r["name"].startswith("TEST") or "TEST" in r["name"].upper():
            return r["id"]
    return None


class TestSuspend:
    def test_suspend_requires_reason(self, admin_h):
        bid = _find_test_biz(admin_h)
        assert bid, "need a TEST Biz row"
        r = requests.post(f"{API}/admin/customers/{bid}/suspend", headers=admin_h,
                          json={"reason": "QA"}, timeout=20)
        assert r.status_code == 400
        # also empty
        r = requests.post(f"{API}/admin/customers/{bid}/suspend", headers=admin_h,
                          json={"reason": ""}, timeout=20)
        assert r.status_code == 400

    def test_pause_blocks_owner_writes_then_restore(self, admin_h, owner_h):
        # Pause Tredi Ventures
        r = requests.post(f"{API}/admin/customers/{TREDI}/suspend", headers=admin_h,
                          json={"reason": "QA automated pause probe"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["suspended"] is True
        # Owner read works
        s = requests.get(f"{API}/api/subscription", headers=owner_h, timeout=15)
        # endpoint path has single /api prefix already; try correct path
        s2 = requests.get(f"{API}/subscription", headers=owner_h, timeout=15)
        assert s2.status_code == 200
        assert s2.json().get("suspended") is True
        # Owner write (create customer) should 403
        w = requests.post(f"{API}/customers", headers=owner_h,
                          json={"name": "QA_pause_probe", "phone": "555"}, timeout=15)
        assert w.status_code == 403, (w.status_code, w.text[:200])
        # Restore (toggle without reason)
        r2 = requests.post(f"{API}/admin/customers/{TREDI}/suspend", headers=admin_h,
                           json={"reason": ""}, timeout=20)
        assert r2.status_code == 200, r2.text
        assert r2.json()["suspended"] is False
        # Owner write now works (or at least not 403)
        w2 = requests.post(f"{API}/customers", headers=owner_h,
                           json={"name": "QA_pause_probe_cleanup", "phone": "555"}, timeout=15)
        assert w2.status_code != 403, w2.text
