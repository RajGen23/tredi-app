# Iteration 51: Plan & billing — web Paystack checkout with the TEST key (no real charge),
# verify of an unpaid/abandoned reference returns paid:false and the plan does not change.
# Reads only; the paystack_txns rows created here are left as "pending" (they're harmless and
# the review asked not to clean up anything else).
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def owner():
    r = requests.post(f"{API}/auth/login", data={"username": "owner@tredi.app", "password": "tredi1234"}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"owner login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# Subscription block reports Paystack on in test mode
def test_subscription_paystack_test_mode(owner):
    r = owner.get(f"{API}/subscription", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["paystack"]["enabled"] is True
    assert d["paystack"]["test"] is True
    assert d["can_manage"] is True
    assert "plan" in d and "status" in d and "usage" in d


# Checkout returns a Paystack hosted URL + reference; verify says not paid; plan unchanged
def test_checkout_then_verify_unpaid(owner):
    before = owner.get(f"{API}/subscription", timeout=30).json()
    target = "starter" if before["plan"] != "starter" else "premium"
    r = owner.post(f"{API}/subscription/checkout", json={"plan": target, "cadence": "monthly"}, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["authorization_url"].startswith("https://checkout.paystack.com/")
    assert body["reference"].startswith("TRADA_")
    v = owner.post(f"{API}/subscription/verify", json={"reference": body["reference"]}, timeout=60)
    assert v.status_code == 200, v.text
    assert v.json()["paid"] is False
    after = owner.get(f"{API}/subscription", timeout=30).json()
    assert after["plan"] == before["plan"]
    assert after.get("renews_at") == before.get("renews_at")


# Choose without card is blocked while Paystack is on
def test_choose_blocked_when_paystack_on(owner):
    r = owner.post(f"{API}/subscription/choose", json={"plan": "starter", "cadence": "monthly"}, timeout=30)
    assert r.status_code == 402


# Bad plan / unknown reference validation
def test_checkout_bad_plan_and_unknown_ref(owner):
    assert owner.post(f"{API}/subscription/checkout", json={"plan": "trial"}, timeout=30).status_code == 400
    assert owner.post(f"{API}/subscription/verify", json={"reference": "TRADA_nope"}, timeout=30).status_code == 404
