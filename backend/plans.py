"""What each subscription plan allows — one list the whole product reads.

The tenant app (Plan & billing), the limit checks on every create endpoint and
the Super Admin panel all resolve their answers from here, so a plan can never
mean two different things in two places.

`None` in a limit means unlimited.
"""
from typing import Optional

TRIAL_DAYS = 14

PLANS = [
    {
        "key": "trial",
        "name": "Free trial",
        "price": 0,
        "price_label": "Free",
        "cadence": f"{TRIAL_DAYS} days",
        "tagline": "Run your shop on tredi for two weeks before you pay a naira.",
        "limits": {"shops": 1, "users": 2, "businesses": 1},
        "features": {"transfers": False, "custom_roles": False, "invoice_photos": True, "multi_business": False},
        "perks": ["One shop", "You plus one staff member", "Unlimited items, invoices and reports",
                  "Product photos print on your invoices"],
    },
    {
        "key": "starter",
        "name": "Starter",
        "price": 12000,
        "price_label": "₦ 12,000",
        "cadence": "per month",
        "tagline": "One shop and a small team, with a warehouse on the side.",
        "limits": {"shops": 2, "users": 4, "businesses": 1},
        "features": {"transfers": True, "custom_roles": False, "invoice_photos": False, "multi_business": False},
        "perks": ["Two shops or a shop plus a warehouse", "Up to 4 people", "Stock transfers between shops",
                  "Photos saved on items — printing them on invoices needs Pro"],
    },
    {
        "key": "pro",
        "name": "Pro",
        "price": 38000,
        "price_label": "₦ 38,000",
        "cadence": "per month",
        "tagline": "Every branch, every report, no ceiling.",
        "limits": {"shops": None, "users": None, "businesses": 3},
        "features": {"transfers": True, "custom_roles": True, "invoice_photos": True, "multi_business": True},
        "perks": ["Unlimited shops and warehouses", "Unlimited team members", "Custom roles and permissions",
                  "Product photos print on your invoices", "Up to 3 separate businesses"],
    },
]

# Older records (and the Super Admin sample tenants) use different words for the
# same thing.
ALIASES = {"basic": "starter", "free": "trial", "lapsed": "trial", "": "trial"}

LIMIT_NAMES = {"shops": "shops", "users": "team members", "businesses": "businesses"}

FEATURE_NAMES = {
    "transfers": "Stock transfers between shops",
    "custom_roles": "Custom roles and permissions",
    "invoice_photos": "Product photos on invoices",
    "multi_business": "More than one business",
}

# The comparison table on Plan & billing, in the order a trader reads it.
MATRIX = [
    {"label": "Shops and warehouses", "kind": "limit", "key": "shops"},
    {"label": "Team members", "kind": "limit", "key": "users"},
    {"label": "Separate businesses", "kind": "limit", "key": "businesses"},
    {"label": FEATURE_NAMES["transfers"], "kind": "feature", "key": "transfers"},
    {"label": FEATURE_NAMES["custom_roles"], "kind": "feature", "key": "custom_roles"},
    {"label": FEATURE_NAMES["invoice_photos"], "kind": "feature", "key": "invoice_photos"},
    {"label": "Invoices, items and reports", "kind": "always", "key": "unlimited"},
    {"label": "Offline mode and cloud backup", "kind": "always", "key": "offline"},
    {"label": "Receipt printing and sharing", "kind": "always", "key": "print"},
]

PAID_KEYS = ["starter", "pro"]


def plan_key(raw: Optional[str]) -> str:
    k = (raw or "").strip().lower()
    k = ALIASES.get(k, k)
    return k if any(p["key"] == k for p in PLANS) else "trial"


def plan_by_key(raw: Optional[str]) -> dict:
    k = plan_key(raw)
    return next(p for p in PLANS if p["key"] == k)


def _rank(key: str) -> int:
    return next(i for i, p in enumerate(PLANS) if p["key"] == key)


def next_plan_for_limit(current: str, kind: str) -> Optional[dict]:
    """The cheapest plan above the current one that raises this ceiling."""
    cap = plan_by_key(current)["limits"].get(kind)
    for p in PLANS[_rank(plan_key(current)) + 1:]:
        nxt = p["limits"].get(kind)
        if nxt is None or (cap is not None and nxt > cap):
            return p
    return None


def next_plan_for_feature(current: str, feature: str) -> Optional[dict]:
    for p in PLANS[_rank(plan_key(current)) + 1:]:
        if p["features"].get(feature):
            return p
    return next((p for p in PLANS if p["features"].get(feature)), None)


def limit_message(current: str, kind: str, cap: int) -> str:
    plan = plan_by_key(current)
    word = LIMIT_NAMES.get(kind, kind)
    nxt = next_plan_for_limit(plan["key"], kind)
    tail = ""
    if nxt:
        room = nxt["limits"].get(kind)
        tail = f" {nxt['name']} gives you {'unlimited' if room is None else room} — open More → Plan & billing to upgrade."
    return f"{plan['name']} covers {cap} {word}. You already have {cap}.{tail}"


def feature_message(current: str, feature: str) -> str:
    plan = plan_by_key(current)
    what = FEATURE_NAMES.get(feature, feature)
    nxt = next_plan_for_feature(plan["key"], feature)
    tail = f" It comes with {nxt['name']} — open More → Plan & billing to upgrade." if nxt else ""
    return f"{what} is not part of {plan['name']}.{tail}"


def expired_message(plan: dict, trialing: bool) -> str:
    if trialing:
        return ("Your 14-day free trial has ended. Every record is safe and still readable — "
                "pick a plan in More → Plan & billing to start saving again.")
    return (f"Your {plan['name']} subscription has lapsed. Your books are safe and still readable — "
            "renew in More → Plan & billing to start saving again.")
