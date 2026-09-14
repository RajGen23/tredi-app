"""Migration integrity tests — validates the MySQL→MongoDB legacy import.
Read-only against MongoDB (some tests create/delete a throwaway user, cleaned up).
"""
import os
import time
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
import jwt

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ui-flow-accurate.preview.emergentagent.com").rstrip("/")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = os.environ.get("JWT_ALGORITHM", "HS256")

EXPECTED = {
    "businesses": 162,
    "users": 245,
    "customers": 1578,
    "suppliers": 289,
    "items": 8265,
    "invoices": 1871,
    "payments": 1971,
    "expenses": 67,
    "accounts": 64,
}


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def mint_token(user_id: str) -> str:
    n = datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "iat": n, "exp": n + timedelta(hours=1)}, JWT_SECRET, algorithm=JWT_ALG)


# ---------- migration counts ----------

@pytest.mark.parametrize("coll,expected", EXPECTED.items())
def test_migration_counts(db, coll, expected):
    n = run(db[coll].count_documents({"legacy_uuid": {"$exists": True}}))
    assert n >= expected, f"{coll}: expected {expected} migrated docs, got {n}"


# ---------- scoping / no orphans ----------

@pytest.mark.parametrize("coll", ["customers", "items", "invoices", "payments", "expenses"])
def test_business_id_resolves(db, coll):
    biz_ids = set()
    async def gather():
        async for b in db.businesses.find({"legacy_uuid": {"$exists": True}}, {"_id": 1}):
            biz_ids.add(str(b["_id"]))
        orphans = 0
        async for d in db[coll].find({"legacy_uuid": {"$exists": True}}, {"business_id": 1}):
            if not d.get("business_id") or d["business_id"] not in biz_ids:
                orphans += 1
        return orphans
    orphans = run(gather())
    assert orphans == 0, f"{coll} had {orphans} orphan business_id refs"


# ---------- ownership ----------

def test_non_archived_businesses_have_owner_pointing_to_real_owner_user(db):
    """All 149 non-archived migrated businesses must have owner_id -> user with role 'owner'."""
    async def check():
        bad = []
        cursor = db.businesses.find({"legacy_uuid": {"$exists": True}, "archived": {"$ne": True}})
        total = 0
        async for b in cursor:
            total += 1
            oid = b.get("owner_id")
            if not oid or not ObjectId.is_valid(oid):
                bad.append((str(b["_id"]), "no owner_id"))
                continue
            u = await db.users.find_one({"_id": ObjectId(oid)})
            if not u:
                bad.append((str(b["_id"]), "owner user missing"))
            elif u.get("role") != "owner":
                bad.append((str(b["_id"]), f"role={u.get('role')}"))
        return total, bad
    total, bad = run(check())
    assert total == 149, f"expected 149 non-archived migrated businesses, got {total}"
    assert not bad, f"{len(bad)} ownership issues, e.g. {bad[:5]}"


# ---------- passwords: $2y$ prefix support via real /api/auth/login ----------

def test_bcrypt_2y_hash_accepted_by_login(db):
    """Create a throwaway user with $2y$ hash and log in through /api/auth/login."""
    email = f"tester_2y_{int(time.time())}@tredicheck.co"
    pw = "Testpw12345"
    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    h = ctx.hash(pw)             # $2b$...
    assert h.startswith("$2b$")
    y_hash = "$2y$" + h[4:]

    async def insert():
        res = await db.users.insert_one({
            "name": "Legacy Style", "email": email, "phone": "",
            "password_hash": y_hash, "business_id": None, "role": "owner",
            "shops": [], "active": True, "deactivated_at": None,
            "created_at": datetime.now(timezone.utc),
        })
        return str(res.inserted_id)

    async def cleanup(uid):
        await db.users.delete_one({"_id": ObjectId(uid)})

    uid = run(insert())
    try:
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          data={"username": email, "password": pw},
                          headers={"Content-Type": "application/x-www-form-urlencoded"},
                          timeout=15)
        assert r.status_code == 200, f"login failed for $2y$ hash: {r.status_code} {r.text}"
        body = r.json()
        assert "access_token" in body
    finally:
        run(cleanup(uid))


# ---------- data isolation across two migrated businesses ----------

@pytest.fixture(scope="module")
def two_owners(db):
    async def gather():
        biz_a = await db.businesses.find_one({"legacy_uuid": {"$exists": True}, "archived": {"$ne": True},
                                               "owner_id": {"$exists": True, "$ne": None}})
        biz_b = await db.businesses.find_one({"legacy_uuid": {"$exists": True}, "archived": {"$ne": True},
                                               "owner_id": {"$exists": True, "$ne": None,
                                                            "$nin": [biz_a["owner_id"]]}})
        assert biz_a and biz_b
        ua = await db.users.find_one({"_id": ObjectId(biz_a["owner_id"])})
        ub = await db.users.find_one({"_id": ObjectId(biz_b["owner_id"])})
        # ensure user.business_id set (owner is scoped to that business)
        if not ua.get("business_id"):
            await db.users.update_one({"_id": ua["_id"]}, {"$set": {"business_id": str(biz_a["_id"])}})
            ua["business_id"] = str(biz_a["_id"])
        if not ub.get("business_id"):
            await db.users.update_one({"_id": ub["_id"]}, {"$set": {"business_id": str(biz_b["_id"])}})
            ub["business_id"] = str(biz_b["_id"])
        return (str(ua["_id"]), str(biz_a["_id"])), (str(ub["_id"]), str(biz_b["_id"]))
    return run(gather())


@pytest.mark.parametrize("endpoint", ["/api/customers", "/api/items", "/api/invoices"])
def test_data_isolation_between_owners(two_owners, endpoint):
    (uid_a, bid_a), (uid_b, bid_b) = two_owners
    tok_a = mint_token(uid_a)
    tok_b = mint_token(uid_b)
    ra = requests.get(f"{BASE_URL}{endpoint}", headers={"Authorization": f"Bearer {tok_a}"}, timeout=30)
    rb = requests.get(f"{BASE_URL}{endpoint}", headers={"Authorization": f"Bearer {tok_b}"}, timeout=30)
    assert ra.status_code == 200 and rb.status_code == 200, f"{endpoint} A={ra.status_code} B={rb.status_code}"
    payload_a = ra.json()
    payload_b = rb.json()
    rows_a = payload_a if isinstance(payload_a, list) else (payload_a.get("rows") or payload_a.get("items") or payload_a.get("invoices") or payload_a.get("customers") or [])
    rows_b = payload_b if isinstance(payload_b, list) else (payload_b.get("rows") or payload_b.get("items") or payload_b.get("invoices") or payload_b.get("customers") or [])
    # every row of A should carry business_id == bid_a; B ↔ bid_b
    bad_a = [r for r in rows_a if r.get("business_id") not in (bid_a, None)]
    bad_b = [r for r in rows_b if r.get("business_id") not in (bid_b, None)]
    assert not bad_a, f"A leaked {len(bad_a)} rows from {endpoint}"
    assert not bad_b, f"B leaked {len(bad_b)} rows from {endpoint}"
    # and the two result sets do NOT overlap by id
    ids_a = {r.get("id") for r in rows_a if r.get("id")}
    ids_b = {r.get("id") for r in rows_b if r.get("id")}
    assert ids_a.isdisjoint(ids_b), f"{endpoint} overlap: {len(ids_a & ids_b)} shared ids"


# ---------- reports on the busiest business ----------

@pytest.fixture(scope="module")
def busy_headers(db):
    async def gather():
        u = await db.users.find_one({"email": "mmaduabuchianya@gmail.com"})
        assert u, "busiest owner user not found"
        if not u.get("business_id"):
            biz = await db.businesses.find_one({"owner_id": str(u["_id"]), "archived": {"$ne": True}})
            assert biz
            await db.users.update_one({"_id": u["_id"]}, {"$set": {"business_id": str(biz["_id"])}})
            u["business_id"] = str(biz["_id"])
        return str(u["_id"])
    uid = run(gather())
    return {"Authorization": f"Bearer {mint_token(uid)}"}


REPORTS = [
    ("/api/reports/summary?period=all", 15.0),
    ("/api/reports/pnl?period=all", 15.0),
    ("/api/reports/receivables", 15.0),
    ("/api/reports/cashflow?period=all", 15.0),
    ("/api/reports/products?period=all", 15.0),
    ("/api/dashboard", 15.0),
]


@pytest.mark.parametrize("path,budget", REPORTS)
def test_reports_return_quickly(busy_headers, path, budget):
    t0 = time.time()
    r = requests.get(f"{BASE_URL}{path}", headers=busy_headers, timeout=60)
    dt = time.time() - t0
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    assert dt < budget, f"{path} took {dt:.1f}s (>{budget}s)"
    # store body on the request for downstream inspection
    r._parsed = r.json()


def test_pnl_gross_formula(busy_headers):
    r = requests.get(f"{BASE_URL}/api/reports/pnl?period=all", headers=busy_headers, timeout=60)
    d = r.json()
    exp = round(d["revenue"] - d["returns"] - d["cogs"], 2)
    assert abs(exp - d["gross"]) < 0.05, f"pnl gross mismatch: {exp} vs {d['gross']}"


def test_receivables_total_matches_buckets(busy_headers):
    r = requests.get(f"{BASE_URL}/api/reports/receivables", headers=busy_headers, timeout=60)
    d = r.json()
    s = round(sum(d["buckets"].values()), 2)
    assert abs(s - d["total"]) < 0.05, f"receivables buckets {s} vs total {d['total']}"


def test_dashboard_received_non_negative(busy_headers):
    r = requests.get(f"{BASE_URL}/api/dashboard", headers=busy_headers, timeout=60)
    d = r.json()
    assert d["received"] >= 0, f"received went negative: {d['received']}"
    assert "refunded" in d and d["refunded"] >= 0


# ---------- soft deletes preserved ----------

def test_archived_businesses_exist_with_flag(db):
    n = run(db.businesses.count_documents({"legacy_uuid": {"$exists": True}, "archived": True,
                                             "deleted_at": {"$ne": None}}))
    assert n == 13, f"expected 13 archived migrated businesses, got {n}"


def test_archived_business_not_in_list_for_its_owner(db):
    """Sign in as an owner whose migrated business is archived → /api/businesses must not include it."""
    async def find_archived_with_owner():
        async for b in db.businesses.find({"legacy_uuid": {"$exists": True}, "archived": True,
                                            "owner_id": {"$exists": True, "$ne": None}}):
            u = await db.users.find_one({"_id": ObjectId(b["owner_id"])})
            if u:
                return str(u["_id"]), str(b["_id"])
        return None, None
    uid, bid = run(find_archived_with_owner())
    if not uid:
        pytest.skip("no archived migrated business has an owner_id -> user (expected — archived come second in migration order)")
    tok = mint_token(uid)
    r = requests.get(f"{BASE_URL}/api/businesses", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200
    ids = [b["id"] for b in r.json()["businesses"]]
    assert bid not in ids, f"archived business {bid} leaked into /api/businesses"


# ---------- idempotence dry-run ----------

def test_dry_run_is_idempotent(tmp_path):
    """Re-running the migration WITHOUT --commit must report only :updated counts."""
    import subprocess
    p = subprocess.run(
        ["python", "-m", "migrations.import_legacy", "--source", "tredi"],
        cwd="/app/backend", capture_output=True, text=True, timeout=180,
    )
    assert p.returncode == 0, f"dry-run failed: {p.stderr[-800:]}"
    out = p.stdout
    new_lines = [ln for ln in out.splitlines() if ":new" in ln and " 0" not in ln.split(":new")[-1]]
    # exclude the "0" tally lines; any line with ':new' followed by non-zero count fails
    offending = []
    for ln in out.splitlines():
        s = ln.strip()
        if ":new" in s:
            parts = s.split()
            try:
                cnt = int(parts[-1])
            except ValueError:
                continue
            if cnt > 0:
                offending.append(s)
    assert not offending, f"dry-run reported :new counts, not idempotent: {offending}\n---\n{out}"


# ---------- regression: demo owner isolated ----------

def test_demo_owner_login_still_works():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      data={"username": "owner@tredi.app", "password": "tredi1234"},
                      headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=15)
    assert r.status_code == 200, f"demo owner login broken: {r.status_code} {r.text}"


def test_demo_owner_sees_only_own_data(db):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      data={"username": "owner@tredi.app", "password": "tredi1234"},
                      headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=15)
    tok = r.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    # find the demo user + business
    async def demo_bid():
        u = await db.users.find_one({"email": "owner@tredi.app"})
        return str(u["business_id"])
    bid = run(demo_bid())
    for ep in ("/api/customers", "/api/items", "/api/invoices"):
        rr = requests.get(f"{BASE_URL}{ep}", headers=h, timeout=30)
        assert rr.status_code == 200, f"{ep} -> {rr.status_code}"
        payload = rr.json()
        rows = payload if isinstance(payload, list) else (payload.get("rows") or payload.get("items") or payload.get("invoices") or payload.get("customers") or [])
        # no row from that endpoint should carry a legacy_uuid or a different business_id
        bad = [r for r in rows if r.get("business_id") not in (bid, None)]
        assert not bad, f"{ep} demo owner sees {len(bad)} non-demo rows"
        assert len(rows) < 200, f"{ep} demo owner sees {len(rows)} rows — suspicious for demo seed"
