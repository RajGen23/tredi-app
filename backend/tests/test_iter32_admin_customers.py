"""Iteration 32 — Super Admin Customers panel.

Covers:
 - admin login
 - GET /api/admin/customers list + counts, sort, status filter, search
 - GET /api/admin/customers/{id} shape (subscription, team last_seen, catalogue, history, limit_names, feature_names)
 - POST /api/admin/customers/{id}/activate happy path, invalid plan, invalid months, history row & plan_history source
 - PUT /api/admin/customers/{id}/custom-plan sets limits/features and owner GET /api/subscription reflects it; enforcement (users limit) returns 402; DELETE reverts
 - POST /api/admin/customers/{id}/end-plan then re-activate to restore
 - last_seen update (owner GET /api/subscription updates users.last_seen_at and businesses.last_active_at)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

ADMIN = {"email": "superadmin@tredi.app", "password": "tredi1234"}
OWNER = {"username": "owner@tredi.app", "password": "tredi1234"}


# ---------------- fixtures
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def owner_token():
    # OAuth2 form login
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      data={"username": OWNER["username"], "password": OWNER["password"]},
                      headers={"Content-Type": "application/x-www-form-urlencoded"},
                      timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def hdr(t):
    return {"Authorization": f"Bearer {t}"}


# A fresh TEST_ business to use for destructive flows so we don't touch Tredi Ventures.
@pytest.fixture(scope="module")
def victim_bid(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/customers?status=all&sort=newest",
                     headers=hdr(admin_token), timeout=30)
    assert r.status_code == 200
    rows = r.json()["rows"]
    # Prefer a TEST Biz row for destructive flows
    picks = [r for r in rows if r["name"].startswith("TEST Biz") or r["name"].startswith("TEST_")]
    assert picks, "No TEST Biz row found to run destructive tests on"
    return picks[0]["id"]


# ---------------- list
class TestList:
    def test_list_rows_counts(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/customers?status=all&sort=last_active",
                         headers=hdr(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data and "counts" in data
        assert data["counts"]["all"] == len(data["rows"])
        for k in ("active", "trialing", "expired"):
            assert k in data["counts"]
        if data["rows"]:
            row = data["rows"][0]
            for key in ("id", "name", "plan", "plan_name", "status", "custom", "ends_at",
                        "last_active", "created_at", "users", "shops"):
                assert key in row

    @pytest.mark.parametrize("sort", ["last_active", "expiry", "newest", "name"])
    def test_sorts(self, admin_token, sort):
        r = requests.get(f"{BASE_URL}/api/admin/customers?status=all&sort={sort}",
                         headers=hdr(admin_token), timeout=30)
        assert r.status_code == 200

    def test_search_by_owner_email(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/customers?q=owner@tredi.app",
                         headers=hdr(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert any(x["email"] == "owner@tredi.app" for x in rows)

    def test_status_filter(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/customers?status=active",
                         headers=hdr(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert all(x["status"] == "active" for x in rows)


# ---------------- detail
class TestDetail:
    def test_detail_shape(self, admin_token, victim_bid):
        r = requests.get(f"{BASE_URL}/api/admin/customers/{victim_bid}",
                         headers=hdr(admin_token), timeout=30)
        assert r.status_code == 200
        c = r.json()
        assert "subscription" in c and "team" in c and "history" in c
        assert "catalogue" in c and len(c["catalogue"]) >= 3
        assert isinstance(c["limit_names"], dict) and isinstance(c["feature_names"], dict)
        # Team rows carry last_seen
        for t in c["team"]:
            assert "last_seen" in t and "role" in t

    def test_detail_404(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/customers/000000000000000000000000",
                         headers=hdr(admin_token), timeout=30)
        assert r.status_code == 404


# ---------------- activate / end / custom (destructive, on TEST biz)
class TestActivateFlow:
    def test_invalid_plan(self, admin_token, victim_bid):
        r = requests.post(f"{BASE_URL}/api/admin/customers/{victim_bid}/activate",
                          headers=hdr(admin_token),
                          json={"plan": "bogus", "months": 1, "amount": 1000, "reference": "QA-bad"},
                          timeout=30)
        assert r.status_code == 400

    def test_invalid_months(self, admin_token, victim_bid):
        r = requests.post(f"{BASE_URL}/api/admin/customers/{victim_bid}/activate",
                          headers=hdr(admin_token),
                          json={"plan": "pro", "months": 99, "amount": 1000, "reference": "QA-bad2"},
                          timeout=30)
        assert r.status_code == 400

    def test_activate_pro_and_persist(self, admin_token, victim_bid):
        r = requests.post(f"{BASE_URL}/api/admin/customers/{victim_bid}/activate",
                          headers=hdr(admin_token),
                          json={"plan": "pro", "months": 3, "amount": 15000,
                                "reference": "QA-activate", "note": "QA", "extend": True},
                          timeout=30)
        assert r.status_code == 200, r.text
        assert "message" in r.json()
        # Verify via detail
        d = requests.get(f"{BASE_URL}/api/admin/customers/{victim_bid}",
                         headers=hdr(admin_token), timeout=30).json()
        assert d["subscription"]["plan"] == "pro"
        assert d["subscription"]["status"] == "active"
        # History row with source=admin
        hist = d["history"]
        assert hist and hist[0]["source"] == "admin"
        assert hist[0]["reference"] == "QA-activate"

    def test_end_plan_sets_expired(self, admin_token, victim_bid):
        r = requests.post(f"{BASE_URL}/api/admin/customers/{victim_bid}/end-plan",
                          headers=hdr(admin_token), json={}, timeout=30)
        assert r.status_code == 200
        d = requests.get(f"{BASE_URL}/api/admin/customers/{victim_bid}",
                         headers=hdr(admin_token), timeout=30).json()
        assert d["subscription"]["status"] == "expired"

    def test_restore_after_end(self, admin_token, victim_bid):
        """Reactivate so subsequent tests have an active customer again."""
        r = requests.post(f"{BASE_URL}/api/admin/customers/{victim_bid}/activate",
                          headers=hdr(admin_token),
                          json={"plan": "pro", "months": 3, "amount": 15000,
                                "reference": "QA-restore", "note": "QA", "extend": False},
                          timeout=30)
        assert r.status_code == 200
        d = requests.get(f"{BASE_URL}/api/admin/customers/{victim_bid}",
                         headers=hdr(admin_token), timeout=30).json()
        assert d["subscription"]["status"] == "active"


# ---------------- custom plan on Tredi Ventures owner (we can verify via owner /api/subscription)
TREDI_BID = "6aa7ae17267e782a241b7e6e"


class TestCustomPlanOwner:
    def test_set_custom_and_owner_sees_it(self, admin_token, owner_token):
        # Ensure Tredi is on Pro active first
        r = requests.post(f"{BASE_URL}/api/admin/customers/{TREDI_BID}/activate",
                          headers=hdr(admin_token),
                          json={"plan": "pro", "months": 12, "amount": 50000,
                                "reference": "QA-pretest", "note": "QA", "extend": False},
                          timeout=30)
        assert r.status_code == 200, r.text

        # Count current users so we can set a limit lower than that
        detail = requests.get(f"{BASE_URL}/api/admin/customers/{TREDI_BID}",
                              headers=hdr(admin_token), timeout=30).json()
        current_users = detail["users"]
        tight = max(1, current_users - 1)

        # Save custom plan: name/price + tight user limit
        r = requests.put(f"{BASE_URL}/api/admin/customers/{TREDI_BID}/custom-plan",
                         headers=hdr(admin_token),
                         json={"name": "QA Custom", "price": 12345,
                               "limits": {"users": tight}, "features": {}},
                         timeout=30)
        assert r.status_code == 200, r.text

        # Owner GET /api/subscription reflects custom
        s = requests.get(f"{BASE_URL}/api/subscription", headers=hdr(owner_token), timeout=30).json()
        assert s["custom"] is True
        assert s["name"] == "QA Custom"
        assert s["price"] == 12345
        assert s["limits"]["users"] == tight
        assert s["status"] == "active"

    def test_enforcement_blocks_user_create(self, owner_token):
        # Try to create a new team member via POST /api/team → should 402 due to limits.users
        r = requests.post(f"{BASE_URL}/api/team",
                          headers={**hdr(owner_token), "Content-Type": "application/json"},
                          json={"email": "TEST_qa_limit@tredi.app", "name": "TEST QA Limit",
                                "role": "sales", "phone": "", "password": "tredi1234", "shops": []},
                          timeout=30)
        # Accept 402 (plan limit) — this is the enforcement being verified
        assert r.status_code == 402, f"expected 402 enforcement, got {r.status_code}: {r.text}"

    def test_delete_custom_reverts(self, admin_token, owner_token):
        r = requests.delete(f"{BASE_URL}/api/admin/customers/{TREDI_BID}/custom-plan",
                            headers=hdr(admin_token), timeout=30)
        assert r.status_code == 200
        s = requests.get(f"{BASE_URL}/api/subscription", headers=hdr(owner_token), timeout=30).json()
        assert s["custom"] is False
        assert s["name"] != "QA Custom"


# ---------------- end-plan on Tredi then re-activate (ensures guard_writes 402)
class TestEndRestore:
    def test_end_plan_blocks_write(self, admin_token, owner_token):
        r = requests.post(f"{BASE_URL}/api/admin/customers/{TREDI_BID}/end-plan",
                          headers=hdr(admin_token), json={}, timeout=30)
        assert r.status_code == 200
        # Owner subscription expired
        s = requests.get(f"{BASE_URL}/api/subscription", headers=hdr(owner_token), timeout=30).json()
        assert s["status"] == "expired"
        # A write to a protected endpoint should 402
        w = requests.post(f"{BASE_URL}/api/customers",
                          headers={**hdr(owner_token), "Content-Type": "application/json"},
                          json={"name": "TEST_QA_blocked"}, timeout=30)
        assert w.status_code == 402, f"expected 402 when expired, got {w.status_code}"

    def test_reactivate_restores_tredi(self, admin_token, owner_token):
        r = requests.post(f"{BASE_URL}/api/admin/customers/{TREDI_BID}/activate",
                          headers=hdr(admin_token),
                          json={"plan": "pro", "months": 12, "amount": 50000,
                                "reference": "QA-restore-tredi", "note": "QA", "extend": False},
                          timeout=30)
        assert r.status_code == 200
        s = requests.get(f"{BASE_URL}/api/subscription", headers=hdr(owner_token), timeout=30).json()
        assert s["status"] == "active"
        assert s["plan"] == "pro"


# ---------------- last_active signal
class TestLastActive:
    def test_owner_request_updates_last_active(self, admin_token, owner_token):
        # Owner hits an endpoint — touch_last_seen writes within 2 min throttle
        requests.get(f"{BASE_URL}/api/subscription", headers=hdr(owner_token), timeout=30)
        time.sleep(1.0)
        detail = requests.get(f"{BASE_URL}/api/admin/customers/{TREDI_BID}",
                              headers=hdr(admin_token), timeout=30).json()
        assert detail["last_active"] is not None
        # Team row for owner carries last_seen
        owners = [t for t in detail["team"] if t["email"] == OWNER["username"]]
        assert owners and owners[0]["last_seen"] is not None
