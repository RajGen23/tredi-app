"""Backend tests for the Super Admin panel (SA.1–SA.18)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ui-flow-accurate.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "superadmin@tredi.app"
ADMIN_PASSWORD = "tredi1234"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    assert "admin" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# -------------------------------------------------------- Auth
class TestAdminAuth:
    def test_login_success(self):
        r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_context_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/auth/context")
        assert r.status_code == 200
        assert "session_minutes" in r.json()

    def test_me_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/auth/me")
        assert r.status_code == 401

    def test_endpoints_require_auth(self):
        for path in ["overview", "businesses", "subscriptions", "plans", "users", "roles",
                     "security", "security/audit", "analytics", "sync", "system",
                     "configuration", "backup", "migration", "support"]:
            r = requests.get(f"{BASE_URL}/api/admin/{path}")
            assert r.status_code == 401, f"/{path} did not require auth: {r.status_code}"


# -------------------------------------------------------- SA.2 Overview
class TestOverview:
    def test_overview(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/overview", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "metrics" in d and len(d["metrics"]) >= 4
        assert "attention" in d
        assert "series" in d and len(d["series"]) > 0
        assert "recent" in d


# -------------------------------------------------------- SA.3 Businesses
class TestBusinesses:
    def test_list_default(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/businesses", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "rows" in d and "counts" in d and "total" in d
        assert d["counts"]["all"] > 0

    def test_list_filters(self, h):
        for tab in ["all", "active", "trial", "expiring", "suspended"]:
            r = requests.get(f"{BASE_URL}/api/admin/businesses?tab={tab}", headers=h)
            assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/admin/businesses?q=Tredi&plan=pro&sort=name&page=1", headers=h)
        assert r.status_code == 200

    def test_business_detail_and_structure(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/businesses?q=Tredi Ventures", headers=h)
        rows = r.json()["rows"]
        assert len(rows) > 0
        bid = rows[0]["id"]
        r2 = requests.get(f"{BASE_URL}/api/admin/businesses/{bid}", headers=h)
        assert r2.status_code == 200
        assert r2.json()["name"] == "Tredi Ventures"

        r3 = requests.get(f"{BASE_URL}/api/admin/businesses/{bid}/structure", headers=h)
        assert r3.status_code == 200
        assert "shops" in r3.json() and "staff" in r3.json()

    def _biz_id(self, h, name="Tredi Ventures"):
        r = requests.get(f"{BASE_URL}/api/admin/businesses?q={name}", headers=h)
        return r.json()["rows"][0]["id"]

    def test_suspend_requires_reason(self, h):
        bid = self._biz_id(h)
        r = requests.post(f"{BASE_URL}/api/admin/businesses/{bid}/action",
                          json={"action": "suspend", "reason": ""}, headers=h)
        assert r.status_code == 400

    def test_suspend_unsuspend_audit(self, h):
        bid = self._biz_id(h)
        r = requests.post(f"{BASE_URL}/api/admin/businesses/{bid}/action",
                          json={"action": "suspend", "reason": "Investigating anomaly"}, headers=h)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert d.get("suspended") is True

        # Confirm audit row
        ra = requests.get(f"{BASE_URL}/api/admin/security/audit?tab=admin&q=Writes suspended", headers=h)
        assert ra.status_code == 200
        assert any("Writes suspended" == row["event"] for row in ra.json()["rows"])

        # Unsuspend
        r = requests.post(f"{BASE_URL}/api/admin/businesses/{bid}/action",
                          json={"action": "unsuspend"}, headers=h)
        assert r.status_code == 200
        assert r.json().get("suspended") is False

    def test_force_sync(self, h):
        bid = self._biz_id(h)
        r = requests.post(f"{BASE_URL}/api/admin/businesses/{bid}/action",
                          json={"action": "force_sync"}, headers=h)
        assert r.status_code == 200

    def test_schedule_deletion_reason_required(self, h):
        bid = self._biz_id(h)
        r = requests.post(f"{BASE_URL}/api/admin/businesses/{bid}/action",
                          json={"action": "schedule_deletion", "reason": ""}, headers=h)
        assert r.status_code == 400

    def test_schedule_and_cancel_deletion(self, h):
        bid = self._biz_id(h)
        r = requests.post(f"{BASE_URL}/api/admin/businesses/{bid}/action",
                          json={"action": "schedule_deletion", "reason": "Owner request"}, headers=h)
        assert r.status_code == 200
        assert r.json().get("deletion_at") is not None

        r2 = requests.post(f"{BASE_URL}/api/admin/businesses/{bid}/action",
                           json={"action": "cancel_deletion"}, headers=h)
        assert r2.status_code == 200
        assert r2.json().get("deletion_at") is None


# -------------------------------------------------------- SA.6/SA.7 Subscriptions
class TestSubscriptions:
    def test_tabs(self, h):
        for tab in ["7", "30", "lapsed"]:
            r = requests.get(f"{BASE_URL}/api/admin/subscriptions?tab={tab}", headers=h)
            assert r.status_code == 200
            assert "metrics" in r.json() and "rows" in r.json()

    def test_extend_moves_expiry(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/subscriptions?tab=7", headers=h)
        rows = r.json()["rows"]
        if not rows:
            pytest.skip("No expiring subscriptions")
        tid = rows[0]["id"]
        expiry_before = rows[0]["plan_expires"]
        r2 = requests.post(f"{BASE_URL}/api/admin/subscriptions/{tid}/extend",
                           json={"days": 30, "note": "test"}, headers=h)
        assert r2.status_code == 200
        # Verify persistence
        r3 = requests.get(f"{BASE_URL}/api/admin/businesses/{tid}", headers=h)
        assert r3.json()["plan_expires"] > expiry_before

    def test_reminders_batch(self, h):
        r = requests.post(f"{BASE_URL}/api/admin/subscriptions/reminders", json={}, headers=h)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_plans(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/plans", headers=h)
        assert r.status_code == 200
        assert "plans" in r.json() and "gates" in r.json()
        assert len(r.json()["plans"]) >= 3


# -------------------------------------------------------- SA.8 Users
class TestUsers:
    def test_tabs(self, h):
        for tab in ["all", "owners", "staff", "locked", "never"]:
            r = requests.get(f"{BASE_URL}/api/admin/users?tab={tab}", headers=h)
            assert r.status_code == 200

    def test_unlock_musa(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/users?tab=locked&q=Musa", headers=h)
        assert r.status_code == 200
        rows = r.json()["rows"]
        musa = next((u for u in rows if "Musa" in u["name"]), None)
        assert musa is not None, "Musa Bello (locked) not found"
        assert musa["status"] == "locked"
        r2 = requests.post(f"{BASE_URL}/api/admin/users/{musa['id']}/unlock", headers=h)
        assert r2.status_code == 200
        # Verify
        r3 = requests.get(f"{BASE_URL}/api/admin/users?q=Musa", headers=h)
        u = next((u for u in r3.json()["rows"] if "Musa" in u["name"]), None)
        assert u["status"] == "active"


# -------------------------------------------------------- SA.9 Roles + SA.10/11 Security
class TestRolesSecurity:
    def test_roles(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/roles", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "templates" in d and "matrix" in d

    def test_security(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/security", headers=h)
        assert r.status_code == 200
        assert "metrics" in r.json() and "signals" in r.json() and "policy" in r.json()

    def test_policy_patch_persists(self, h):
        r = requests.patch(f"{BASE_URL}/api/admin/security/policy",
                           json={"idle_lock_min": 5, "failed_pins": 6}, headers=h)
        assert r.status_code == 200
        assert r.json()["policy"]["idle_lock_min"] == 5
        assert r.json()["policy"]["failed_pins"] == 6

    def test_audit_tabs(self, h):
        for tab in ["all", "admin", "permission", "deletion", "export", "impersonation"]:
            r = requests.get(f"{BASE_URL}/api/admin/security/audit?tab={tab}", headers=h)
            assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/admin/security/audit?q=Snapshot", headers=h)
        assert r.status_code == 200


# -------------------------------------------------------- SA.12 Analytics + SA.13 Sync
class TestAnalyticsSync:
    def test_analytics(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/analytics?days=90", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "metrics" in d and "series" in d and "categories" in d

    def test_sync_tabs(self, h):
        for tab in ["stuck", "conflict", "rejected"]:
            r = requests.get(f"{BASE_URL}/api/admin/sync?tab={tab}", headers=h)
            assert r.status_code == 200

    def test_sync_notify(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/sync?tab=stuck", headers=h)
        rows = r.json()["rows"]
        if not rows:
            pytest.skip("No stuck queues")
        sid = rows[0]["id"]
        r2 = requests.post(f"{BASE_URL}/api/admin/sync/{sid}/notify", headers=h)
        assert r2.status_code == 200

    def test_sync_replay_with_ids(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/sync?tab=stuck", headers=h)
        rows = r.json()["rows"]
        if not rows:
            pytest.skip("no stuck")
        sid = rows[0]["id"]
        r2 = requests.post(f"{BASE_URL}/api/admin/sync/replay",
                           json={"ids": [sid]}, headers=h)
        assert r2.status_code == 200

    def test_sync_replay_empty_ids(self, h):
        r = requests.post(f"{BASE_URL}/api/admin/sync/replay", json={"ids": []}, headers=h)
        assert r.status_code == 200


# -------------------------------------------------------- SA.14/15 System + Configuration
class TestSystemConfig:
    def test_system(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/system", headers=h)
        assert r.status_code == 200
        assert "metrics" in r.json() and "services" in r.json() and "logs" in r.json()

    def test_configuration_persists(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/configuration", headers=h)
        assert r.status_code == 200
        cfg = r.json()
        new_terms = 21 if cfg["invoice"]["due_terms_days"] != 21 else 14
        invoice = {**cfg["invoice"], "due_terms_days": new_terms}
        r2 = requests.put(f"{BASE_URL}/api/admin/configuration",
                          json={"invoice": invoice}, headers=h)
        assert r2.status_code == 200
        r3 = requests.get(f"{BASE_URL}/api/admin/configuration", headers=h)
        assert r3.json()["invoice"]["due_terms_days"] == new_terms


# -------------------------------------------------------- SA.16 Backup
class TestBackup:
    def test_tabs(self, h):
        for tab in ["automatic", "manual", "pre-migration"]:
            r = requests.get(f"{BASE_URL}/api/admin/backup?tab={tab}", headers=h)
            assert r.status_code == 200

    def test_snapshot(self, h):
        r = requests.post(f"{BASE_URL}/api/admin/backup/snapshot",
                          json={"scope": "All tenants", "type": "manual"}, headers=h)
        assert r.status_code == 200

    def test_test_restore(self, h):
        r = requests.post(f"{BASE_URL}/api/admin/backup/test-restore", headers=h)
        assert r.status_code == 200

    def test_restore(self, h):
        rb = requests.get(f"{BASE_URL}/api/admin/backup?tab=automatic", headers=h)
        d = rb.json()
        snaps = d["rows"]
        tenants = d["tenants"]
        if not snaps or not tenants:
            pytest.skip("no snap/tenants")
        r = requests.post(f"{BASE_URL}/api/admin/backup/restore",
                          json={"tenant_id": tenants[0]["id"], "snapshot_id": snaps[0]["id"]}, headers=h)
        assert r.status_code == 200


# -------------------------------------------------------- SA.17 Migration
class TestMigration:
    def test_list(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/migration", headers=h)
        assert r.status_code == 200
        assert len(r.json()["rows"]) > 0

    def test_commit_requires_dry_run(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/migration", headers=h)
        # find a migration whose step < 3
        low = next((m for m in r.json()["rows"] if m["step"] < 3 and not m["committed"]), None)
        if not low:
            pytest.skip("No pre-dry-run migration")
        r2 = requests.post(f"{BASE_URL}/api/admin/migration/{low['id']}/commit", headers=h)
        assert r2.status_code == 400

    def test_mapping_dryrun_commit(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/migration", headers=h)
        # pick the wichtech one at step 3
        m = next((m for m in r.json()["rows"] if not m["committed"] and m["step"] >= 3), None)
        if not m:
            m = next((m for m in r.json()["rows"] if not m["committed"]), None)
        mid = m["id"]

        # Get detail
        rd = requests.get(f"{BASE_URL}/api/admin/migration/{mid}", headers=h)
        assert rd.status_code == 200

        # Patch mapping
        rp = requests.patch(f"{BASE_URL}/api/admin/migration/{mid}/mapping",
                            json={"source": "rep_code", "target": "sales_rep"}, headers=h)
        assert rp.status_code == 200

        # Dry-run
        rr = requests.post(f"{BASE_URL}/api/admin/migration/{mid}/dry-run", headers=h)
        assert rr.status_code == 200

        # Commit — should create pre_migration snapshot
        pre_count = 0
        rbc = requests.get(f"{BASE_URL}/api/admin/backup?tab=pre-migration", headers=h)
        pre_count = len(rbc.json()["rows"])

        rc = requests.post(f"{BASE_URL}/api/admin/migration/{mid}/commit", headers=h)
        assert rc.status_code == 200

        rbc2 = requests.get(f"{BASE_URL}/api/admin/backup?tab=pre-migration", headers=h)
        assert len(rbc2.json()["rows"]) > pre_count


# -------------------------------------------------------- SA.18 Support
class TestSupport:
    def test_get_support(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/support", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "requests" in d and "broadcasts" in d and "audiences" in d

    def test_request_reason_required(self, h):
        rb = requests.get(f"{BASE_URL}/api/admin/businesses?q=Tredi", headers=h)
        tid = rb.json()["rows"][0]["id"]
        r = requests.post(f"{BASE_URL}/api/admin/support/request",
                          json={"tenant_id": tid, "reason": "hi", "scope": "Invoices only"}, headers=h)
        assert r.status_code == 400

    def test_request_ok(self, h):
        rb = requests.get(f"{BASE_URL}/api/admin/businesses?q=Tredi", headers=h)
        tid = rb.json()["rows"][0]["id"]
        r = requests.post(f"{BASE_URL}/api/admin/support/request",
                          json={"tenant_id": tid, "reason": "Owner cannot open invoice PDF", "scope": "Invoices only"}, headers=h)
        assert r.status_code == 200

    def test_remind_request(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/support", headers=h)
        reqs = [x for x in r.json()["requests"] if x["status"] == "waiting"]
        if not reqs:
            pytest.skip("no waiting request")
        r2 = requests.post(f"{BASE_URL}/api/admin/support/requests/{reqs[0]['id']}/remind", headers=h)
        assert r2.status_code == 200

    def test_broadcast_validation(self, h):
        r = requests.post(f"{BASE_URL}/api/admin/support/broadcast",
                          json={"audience": "All tenants", "title": "", "message": ""}, headers=h)
        assert r.status_code == 400

    def test_broadcast_ok(self, h):
        title = f"TEST {int(time.time())}"
        r = requests.post(f"{BASE_URL}/api/admin/support/broadcast",
                          json={"audience": "All tenants", "title": title,
                                "message": "This is a test broadcast body."}, headers=h)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/admin/support", headers=h)
        titles = [b["title"] for b in r2.json()["broadcasts"]]
        assert title in titles

    def test_end_session(self, h):
        r = requests.get(f"{BASE_URL}/api/admin/support", headers=h)
        if r.json().get("session"):
            r2 = requests.post(f"{BASE_URL}/api/admin/support/session/end", headers=h)
            assert r2.status_code == 200


# -------------------------------------------------------- Regression: mobile owner login
class TestMobileRegression:
    def test_owner_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          data={"username": "owner@tredi.app", "password": "tredi1234"},
                          headers={"Content-Type": "application/x-www-form-urlencoded"})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_dashboard(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          data={"username": "owner@tredi.app", "password": "tredi1234"},
                          headers={"Content-Type": "application/x-www-form-urlencoded"})
        token = r.json()["access_token"]
        r2 = requests.get(f"{BASE_URL}/api/dashboard",
                          headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
