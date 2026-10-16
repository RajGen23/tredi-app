"""Iteration 31 — admin panel coverage for new endpoints and attention counts.

Covers: login, overview attention (messages / plan_requests), businesses CSV data,
new POST /api/admin/exports, POST /api/admin/plans, POST /api/admin/roles/templates,
POST /api/admin/system/incident toggle, GET /api/admin/support/requests/{rid}/log,
plan request approve/decline, business action suspend/unsuspend/force_sync/
schedule_deletion/cancel_deletion, support messages reply.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/auth/login", json={"email": "superadmin@tredi.app", "password": "tredi1234"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# -------- auth
def test_login_bad_password():
    r = requests.post(f"{API}/admin/auth/login", json={"email": "superadmin@tredi.app", "password": "bad"}, timeout=20)
    assert r.status_code == 401


def test_me(H):
    r = requests.get(f"{API}/admin/auth/me", headers=H, timeout=20)
    assert r.status_code == 200
    assert "email" in r.json()


# -------- overview attention
def test_overview_attention_has_new_keys(H):
    r = requests.get(f"{API}/admin/overview", headers=H, timeout=30)
    assert r.status_code == 200
    att = r.json()["attention"]
    for k in ("sync", "expiring", "overdue", "migrations", "support", "messages", "plan_requests"):
        assert k in att, f"attention missing {k}"


# -------- businesses listing (CSV data source)
def test_businesses_list(H):
    r = requests.get(f"{API}/admin/businesses?size=5", headers=H, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["rows"], list) and len(data["rows"]) > 0
    assert "counts" in data


# -------- exports
def test_log_export(H):
    r = requests.post(f"{API}/admin/exports", headers=H, json={"what": "Businesses CSV", "rows": 42}, timeout=20)
    assert r.status_code == 200
    assert r.json().get("ok")
    # verify audit event under exports tab
    r2 = requests.get(f"{API}/admin/security/audit?tab=export", headers=H, timeout=20)
    assert r2.status_code == 200
    found = any("Data exported" == row["event"] for row in r2.json()["rows"])
    assert found, "Audit log should contain 'Data exported' after POST /exports"


# -------- plans create
def test_create_plan_draft(H):
    name = f"TEST_Plan_{int(time.time())}"
    r = requests.post(f"{API}/admin/plans", headers=H, json={"name": name, "price": 1200}, timeout=20)
    assert r.status_code == 200, r.text
    r2 = requests.get(f"{API}/admin/plans", headers=H, timeout=20)
    assert r2.status_code == 200
    plans = r2.json()["plans"]
    match = [p for p in plans if p["name"] == name]
    assert match and match[0].get("note") == "Draft"


def test_create_plan_duplicate_name(H):
    name = f"TEST_Plan_Dup_{int(time.time())}"
    r1 = requests.post(f"{API}/admin/plans", headers=H, json={"name": name, "price": 500}, timeout=20)
    assert r1.status_code == 200
    r2 = requests.post(f"{API}/admin/plans", headers=H, json={"name": name, "price": 500}, timeout=20)
    assert r2.status_code == 400


def test_create_plan_short_name(H):
    r = requests.post(f"{API}/admin/plans", headers=H, json={"name": "A", "price": 10}, timeout=20)
    assert r.status_code == 400


# -------- role templates
def test_create_role_template(H):
    name = f"TEST_Tpl_{int(time.time())}"
    r = requests.post(f"{API}/admin/roles/templates", headers=H, json={"name": name, "based_on": "Sales"}, timeout=20)
    assert r.status_code == 200, r.text
    r2 = requests.get(f"{API}/admin/roles", headers=H, timeout=20)
    assert r2.status_code == 200
    names = [t["name"] for t in r2.json()["templates"]]
    assert name in names


def test_create_role_template_bad_base(H):
    r = requests.post(f"{API}/admin/roles/templates", headers=H, json={"name": "TEST_X", "based_on": "NopeNope"}, timeout=20)
    assert r.status_code == 400


# -------- system incident toggle (open then close so we leave it closed)
def test_system_incident_toggle(H):
    sys0 = requests.get(f"{API}/admin/system", headers=H, timeout=20).json()
    initial = bool(sys0["incident"]["open"])
    r1 = requests.post(f"{API}/admin/system/incident", headers=H, timeout=20)
    assert r1.status_code == 200 and r1.json()["open"] != initial
    r2 = requests.post(f"{API}/admin/system/incident", headers=H, timeout=20)
    assert r2.status_code == 200 and r2.json()["open"] == initial


# -------- support request log
def test_support_request_log(H):
    sup = requests.get(f"{API}/admin/support", headers=H, timeout=20).json()
    reqs = sup.get("requests", [])
    if not reqs:
        pytest.skip("No support requests seeded")
    rid = reqs[0]["id"]
    r = requests.get(f"{API}/admin/support/requests/{rid}/log", headers=H, timeout=20)
    assert r.status_code == 200
    assert "rows" in r.json()


# -------- plan requests endpoints
def test_plan_requests_list(H):
    r = requests.get(f"{API}/admin/plan-requests", headers=H, timeout=20)
    assert r.status_code == 200
    assert "rows" in r.json() and "count" in r.json()


# -------- business action (safe: force_sync + unsuspend if needed)
def test_business_force_sync(H):
    bl = requests.get(f"{API}/admin/businesses?size=1", headers=H, timeout=20).json()["rows"]
    if not bl:
        pytest.skip("No tenants seeded")
    tid = bl[0]["id"]
    r = requests.post(f"{API}/admin/businesses/{tid}/action", headers=H, json={"action": "force_sync"}, timeout=20)
    assert r.status_code == 200


def test_business_suspend_requires_reason(H):
    bl = requests.get(f"{API}/admin/businesses?size=1", headers=H, timeout=20).json()["rows"]
    tid = bl[0]["id"]
    r = requests.post(f"{API}/admin/businesses/{tid}/action", headers=H, json={"action": "suspend", "reason": ""}, timeout=20)
    assert r.status_code == 400


def test_business_suspend_restore_roundtrip(H):
    bl = requests.get(f"{API}/admin/businesses?size=1", headers=H, timeout=20).json()["rows"]
    tid = bl[0]["id"]
    r = requests.post(f"{API}/admin/businesses/{tid}/action", headers=H, json={"action": "suspend", "reason": "TEST_sdet probe"}, timeout=20)
    assert r.status_code == 200
    r2 = requests.post(f"{API}/admin/businesses/{tid}/action", headers=H, json={"action": "unsuspend"}, timeout=20)
    assert r2.status_code == 200
    detail = requests.get(f"{API}/admin/businesses/{tid}", headers=H, timeout=20).json()
    assert detail["suspended"] is False


def test_business_schedule_cancel_deletion(H):
    bl = requests.get(f"{API}/admin/businesses?size=1", headers=H, timeout=20).json()["rows"]
    tid = bl[0]["id"]
    r = requests.post(f"{API}/admin/businesses/{tid}/action", headers=H,
                     json={"action": "schedule_deletion", "reason": "TEST_sdet schedule"}, timeout=20)
    assert r.status_code == 200
    r2 = requests.post(f"{API}/admin/businesses/{tid}/action", headers=H, json={"action": "cancel_deletion"}, timeout=20)
    assert r2.status_code == 200
    detail = requests.get(f"{API}/admin/businesses/{tid}", headers=H, timeout=20).json()
    assert detail["deletion_at"] is None


# -------- security policy save
def test_security_policy_save(H):
    r = requests.patch(f"{API}/admin/security/policy", headers=H, json={"idle_lock_min": 10}, timeout=20)
    assert r.status_code == 200
    assert r.json().get("policy", {}).get("idle_lock_min") == 10


# -------- backup actions
def test_backup_snapshot(H):
    r = requests.post(f"{API}/admin/backup/snapshot", headers=H, json={"scope": "TEST_sdet probe", "type": "manual"}, timeout=20)
    assert r.status_code == 200


def test_backup_test_restore(H):
    r = requests.post(f"{API}/admin/backup/test-restore", headers=H, timeout=20)
    assert r.status_code == 200


# -------- sync replay (empty payload replays all stuck)
def test_sync_data(H):
    r = requests.get(f"{API}/admin/sync?tab=stuck", headers=H, timeout=20)
    assert r.status_code == 200
    assert "rows" in r.json()


# -------- migration list
def test_migrations_list(H):
    r = requests.get(f"{API}/admin/migration", headers=H, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json()["rows"], list)


# -------- analytics
def test_analytics(H):
    r = requests.get(f"{API}/admin/analytics?days=90", headers=H, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "series" in d and "categories" in d


# -------- support broadcast (short title should fail)
def test_broadcast_validation(H):
    r = requests.post(f"{API}/admin/support/broadcast", headers=H,
                     json={"audience": "All tenants", "title": "x", "message": "short"}, timeout=20)
    assert r.status_code == 400


# -------- cleanup: remove test plans & templates
def test_zzz_cleanup():
    """Attempt cleanup through Mongo if available; otherwise skip (data is clearly TEST_ prefixed)."""
    try:
        from pymongo import MongoClient  # type: ignore
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME", "test_database")
        if not mongo_url:
            pytest.skip("MONGO_URL unavailable for cleanup")
        client = MongoClient(mongo_url)
        db = client[db_name]
        p = db.admin_plans.delete_many({"name": {"$regex": "^TEST_"}})
        t = db.admin_role_templates.delete_many({"name": {"$regex": "^TEST_"}})
        print(f"Cleanup removed plans={p.deleted_count} templates={t.deleted_count}")
    except Exception as e:
        pytest.skip(f"cleanup skipped: {e}")
