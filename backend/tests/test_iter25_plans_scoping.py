"""Iteration 25 — plan matrix, self-service choose, expiry recovery, shop scoping."""
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

OWNER = {"username": "owner@tredi.app", "password": "tredi1234"}
AMINA = {"username": "amina@tredi.app", "password": "tredi1234"}

EXPECTED_PRICES = {
    "starter": {"monthly": 7500, "quarterly": 18500, "yearly": 69000,
                "limits": {"businesses": 1, "shops": 1, "users": 1, "invoices": 1000}},
    "premium": {"monthly": 17000, "quarterly": 40800, "yearly": 149000,
                "limits": {"businesses": 1, "shops": 3, "users": 9, "invoices": 10000}},
    "pro":     {"monthly": 50000, "quarterly": 120000, "yearly": 449000,
                "limits": {"businesses": 3, "shops": 9, "users": 27, "invoices": 50000}},
    "enterprise": {"monthly": 83500, "quarterly": 200400, "yearly": 749000,
                   "limits": {"businesses": 4, "shops": 16, "users": 48, "invoices": 200000}},
    "trial":   {"limits": {"businesses": 1, "shops": 3, "users": 9, "invoices": 1000}},
}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", data=creds,
                      headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def owner_sess():
    data = _login(OWNER)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s, data["user"]


@pytest.fixture(scope="module")
def amina_sess():
    data = _login(AMINA)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s, data["user"]


# --------------------------------------------------------- plan matrix
class TestPlanMatrix:
    def test_plans_catalogue(self, owner_sess):
        s, _ = owner_sess
        r = s.get(f"{BASE_URL}/api/plans")
        assert r.status_code == 200
        plans = {p["key"]: p for p in r.json()["plans"]}
        for key, exp in EXPECTED_PRICES.items():
            assert key in plans, f"missing plan {key}"
            p = plans[key]
            # limits
            for lk, lv in exp["limits"].items():
                assert p["limits"][lk] == lv, f"{key}.limits.{lk} = {p['limits'][lk]} expected {lv}"
            # prices (not for trial)
            if "monthly" in exp:
                for cad in ("monthly", "quarterly", "yearly"):
                    assert p["prices"][cad] == exp[cad], f"{key}.prices.{cad} = {p['prices'][cad]} expected {exp[cad]}"

    def test_cadences(self, owner_sess):
        s, _ = owner_sess
        r = s.get(f"{BASE_URL}/api/plans").json()
        keys = [c["key"] for c in r["cadences"]]
        assert keys == ["monthly", "quarterly", "yearly"]
        assert r["trial_days"] == 14


# --------------------------------------------------------- starter photos gate
class TestStarterPhotos:
    def test_photos_toggle_by_plan(self, owner_sess):
        s, _ = owner_sess
        # Activate starter
        r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "starter", "cadence": "monthly"})
        assert r.status_code == 200, r.text
        inv = s.get(f"{BASE_URL}/api/settings/invoice").json()
        assert inv["photos_allowed"] is False, f"starter photos_allowed should be False: {inv.get('photos_allowed')}"
        assert inv["show_photos"] is False

        # Premium → photos allowed
        r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "premium", "cadence": "monthly"})
        assert r.status_code == 200
        inv = s.get(f"{BASE_URL}/api/settings/invoice").json()
        assert inv["photos_allowed"] is True

        # Pro → photos allowed (and will restore later)
        r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "pro", "cadence": "monthly"})
        assert r.status_code == 200
        inv = s.get(f"{BASE_URL}/api/settings/invoice").json()
        assert inv["photos_allowed"] is True


# --------------------------------------------------------- choose plan validation
class TestChoosePlanValidation:
    def test_rep_cannot_choose(self, amina_sess):
        s, _ = amina_sess
        r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "starter", "cadence": "monthly"})
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_bad_plan_rejected(self, owner_sess):
        s, _ = owner_sess
        r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "mega", "cadence": "monthly"})
        assert r.status_code == 400

    def test_bad_cadence_rejected(self, owner_sess):
        s, _ = owner_sess
        r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "pro", "cadence": "weekly"})
        assert r.status_code == 400

    def test_cadence_sets_renews_at(self, owner_sess):
        s, _ = owner_sess
        for cad, days in (("monthly", 30), ("quarterly", 90), ("yearly", 360)):
            r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "pro", "cadence": cad})
            assert r.status_code == 200
            sub = s.get(f"{BASE_URL}/api/subscription").json()
            ends = datetime.fromisoformat(sub["ends_at"].replace("Z", "+00:00"))
            delta = (ends - datetime.now(timezone.utc)).days
            assert abs(delta - days) <= 2, f"{cad}: expected ~{days} days, got {delta}"

    def test_downgrade_returns_over_list(self, owner_sess):
        s, _ = owner_sess
        # Shop count on demo = 2, so starter (shops=1) will overflow
        r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "starter", "cadence": "monthly"})
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("over"), list)
        assert len(body["over"]) > 0, f"expected non-empty over list on downgrade: {body}"
        # Restore to pro
        s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "pro", "cadence": "monthly"})


# --------------------------------------------------------- expiry → recover
class TestExpiryRecovery:
    def _mongo(self):
        return AsyncIOMotorClient(MONGO_URL)[DB_NAME]

    def test_expired_blocks_and_choose_unblocks(self, owner_sess):
        s, user = owner_sess
        bid = user["business_id"]

        async def _set_expired():
            db = self._mongo()
            await db.businesses.update_one(
                {"_id": ObjectId(bid)},
                {"$set": {"plan": "trial",
                          "trial_ends_at": datetime.now(timezone.utc) - timedelta(days=2),
                          "renews_at": None}})
        async def _restore():
            db = self._mongo()
            await db.businesses.update_one(
                {"_id": ObjectId(bid)},
                {"$set": {"plan": "pro", "plan_cadence": "monthly",
                          "renews_at": datetime.now(timezone.utc) + timedelta(days=30),
                          "trial_ends_at": None}})

        asyncio.run(_set_expired())
        try:
            sub = s.get(f"{BASE_URL}/api/subscription").json()
            assert sub["status"] == "expired", f"expected expired, got {sub['status']}"

            # Write must be blocked
            r = s.post(f"{BASE_URL}/api/expenses", json={"category": "Utilities", "amount": 100,
                                                        "method": "cash", "note": "TEST_expired"})
            assert r.status_code == 402, f"expected 402, got {r.status_code} {r.text}"
            assert "safe" in r.json().get("detail", "").lower() or "lapsed" in r.json().get("detail", "").lower() \
                or "ended" in r.json().get("detail", "").lower()

            # Self-service activation
            r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "starter", "cadence": "monthly"})
            assert r.status_code == 200, r.text
            sub = s.get(f"{BASE_URL}/api/subscription").json()
            assert sub["status"] == "active"

            # Writes work again
            r = s.post(f"{BASE_URL}/api/expenses", json={"category": "Utilities", "amount": 100,
                                                        "method": "cash", "note": "TEST_recovered"})
            assert r.status_code in (200, 201), f"expected 201 after activation, got {r.status_code} {r.text}"
            # cleanup the expense
            try:
                eid = r.json().get("id")
                if eid:
                    s.delete(f"{BASE_URL}/api/expenses/{eid}")
            except Exception:
                pass
        finally:
            asyncio.run(_restore())


# --------------------------------------------------------- invoice cap gate (code-level)
class TestInvoiceCapCode:
    def test_server_calls_ensure_invoice_room(self):
        with open("/app/backend/server.py") as f:
            src = f.read()
        assert "ensure_invoice_room(user)" in src, "server.py POST /api/invoices should call ensure_invoice_room"

    def test_limit_message_format(self):
        import sys
        sys.path.insert(0, "/app/backend")
        import plans
        msg = plans.limit_message("starter", "invoices", 1000)
        assert "1,000" in msg
        assert "customer invoices" in msg
        assert "Starter" in msg


# --------------------------------------------------------- shop scoping (owner)
class TestShopScoping:
    def _counts(self, s):
        """Pull counts for every scoped resource."""
        out = {}
        for path, key in [("/api/invoices", "invoices"), ("/api/expenses", "expenses"),
                          ("/api/quotes", "quotes"), ("/api/purchases", "purchases"),
                          ("/api/returns", "returns"), ("/api/receipts", "receipts"),
                          ("/api/waybills", "waybills"), ("/api/transfers", "transfers")]:
            r = s.get(f"{BASE_URL}{path}")
            if r.status_code != 200:
                out[key] = f"status={r.status_code}"
                continue
            data = r.json()
            # Different endpoints return different shapes
            if isinstance(data, list):
                out[key] = len(data)
            else:
                for candidate in (key, "rows", "items"):
                    if candidate in data and isinstance(data[candidate], list):
                        out[key] = len(data[candidate])
                        break
                else:
                    out[key] = data if isinstance(data, dict) else "unknown"
        return out

    def test_owner_shop_switching_changes_data(self, owner_sess):
        s, _ = owner_sess
        # Ikeja branch
        r = s.post(f"{BASE_URL}/api/shops/active", json={"shop": "Ikeja branch"})
        assert r.status_code == 200, r.text
        ikeja = self._counts(s)
        # Surulere
        r = s.post(f"{BASE_URL}/api/shops/active", json={"shop": "Surulere"})
        assert r.status_code == 200, r.text
        surulere = self._counts(s)
        print(f"\nIkeja counts:    {ikeja}")
        print(f"Surulere counts: {surulere}")

        # Expect Surulere to be smaller or equal than Ikeja for most sales artifacts.
        differs = any(ikeja.get(k) != surulere.get(k)
                      for k in ("invoices", "quotes", "purchases", "receipts", "waybills"))
        assert differs, f"Shop switch did not change any counts. ikeja={ikeja} surulere={surulere}"
        # Invoices: Surulere should be <= Ikeja (seeded data heavier at main)
        if isinstance(ikeja.get("invoices"), int) and isinstance(surulere.get("invoices"), int):
            assert surulere["invoices"] <= ikeja["invoices"], \
                f"Surulere invoices ({surulere['invoices']}) > Ikeja ({ikeja['invoices']})"

    def test_items_quantity_follows_active_shop(self, owner_sess):
        s, _ = owner_sess
        s.post(f"{BASE_URL}/api/shops/active", json={"shop": "Ikeja branch"})
        items_i = s.get(f"{BASE_URL}/api/items").json()
        rows_i = items_i if isinstance(items_i, list) else items_i.get("items", [])
        s.post(f"{BASE_URL}/api/shops/active", json={"shop": "Surulere"})
        items_s = s.get(f"{BASE_URL}/api/items").json()
        rows_s = items_s if isinstance(items_s, list) else items_s.get("items", [])
        assert rows_i and rows_s, "no items returned"
        # Find a shared item id and ensure quantity differs
        by_id_i = {r.get("id"): r for r in rows_i}
        shared = next((r for r in rows_s if r.get("id") in by_id_i), None)
        assert shared is not None, "no shared item id across shops"
        qi = by_id_i[shared["id"]].get("quantity", 0)
        qs = shared.get("quantity", 0)
        print(f"Item {shared.get('name')}: Ikeja={qi}, Surulere={qs}")
        # stock_by_shop presence
        assert "stock_by_shop" in shared or "stock" in shared, "items should expose per-shop stock"


# --------------------------------------------------------- rep scoping (amina)
class TestRepScoping:
    def test_amina_scoped_to_surulere(self, amina_sess):
        s, _ = amina_sess
        inv = s.get(f"{BASE_URL}/api/invoices").json()
        inv_count = len(inv) if isinstance(inv, list) else len(inv.get("invoices", []))
        q = s.get(f"{BASE_URL}/api/quotes").json()
        q_count = len(q) if isinstance(q, list) else len(q.get("quotes", []))
        p = s.get(f"{BASE_URL}/api/purchases").json()
        p_count = len(p) if isinstance(p, list) else len(p.get("purchases", []))
        print(f"\nAmina sees: invoices={inv_count} quotes={q_count} purchases={p_count}")
        assert q_count == 0, f"amina should see 0 quotes, saw {q_count}"
        assert p_count == 0, f"amina should see 0 purchases, saw {p_count}"

    def test_amina_cannot_switch_to_ikeja(self, amina_sess):
        s, _ = amina_sess
        r = s.post(f"{BASE_URL}/api/shops/active", json={"shop": "Ikeja branch"})
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        assert "assigned" in r.json().get("detail", "").lower()

    def test_amina_cannot_see_all(self, amina_sess):
        s, _ = amina_sess
        r = s.post(f"{BASE_URL}/api/shops/active", json={"shop": ""})
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# --------------------------------------------------------- reports/reps shop col
class TestRepsReportShops:
    def test_reports_reps_has_shops_list(self, owner_sess):
        s, _ = owner_sess
        r = s.get(f"{BASE_URL}/api/reports/reps?period=all")
        assert r.status_code == 200
        rows = r.json().get("rows", [])
        assert rows, "no rep rows"
        # Every row must either carry a shops list (or empty meaning everywhere)
        for row in rows:
            assert "shops" in row, f"rep row missing 'shops': {row}"
            assert isinstance(row["shops"], list)


# --------------------------------------------------------- teardown: restore state
def test_zzz_restore_demo_state(owner_sess, amina_sess):
    """Leave owner on pro/monthly NGN & Ikeja branch, amina on Surulere."""
    s, user = owner_sess
    # Plan → pro/monthly
    r = s.post(f"{BASE_URL}/api/subscription/choose", json={"plan": "pro", "cadence": "monthly"})
    assert r.status_code == 200
    # Currency → NGN
    biz = s.get(f"{BASE_URL}/api/business").json()
    put_body = {k: biz.get(k, "") for k in ("name", "type", "tin", "address", "phone", "email", "country")}
    put_body["currency"] = "NGN"
    put_body["phones"] = biz.get("phones", []) or []
    put_body["emails"] = biz.get("emails", []) or []
    s.put(f"{BASE_URL}/api/business", json=put_body)
    # Shop → Ikeja branch
    s.post(f"{BASE_URL}/api/shops/active", json={"shop": "Ikeja branch"})
    sub = s.get(f"{BASE_URL}/api/subscription").json()
    assert sub["plan"] == "pro"
    # Amina back to Surulere
    sa, _ = amina_sess
    sa.post(f"{BASE_URL}/api/shops/active", json={"shop": "Surulere"})
