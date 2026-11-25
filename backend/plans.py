"""What each subscription plan allows — one list the whole product reads.

The tenant app (Plan & billing), the limit checks on every create endpoint and
the Super Admin panel all resolve their answers from here, so a plan can never
mean two different things in two places.

`None` in a limit means unlimited. Prices are naira, per cadence:
quarterly saves 20%, yearly roughly 22.5–25%.
"""
from contextvars import ContextVar
from typing import Optional

# True while serving the Play Store / App Store app (X-App-Platform: android|ios),
# so plan messages there never point at a purchase the app can't make.
store_client: ContextVar[bool] = ContextVar("store_client", default=False)

TRIAL_DAYS = 14

CADENCES = [
    {"key": "monthly", "label": "Monthly", "months": 1, "note": ""},
    {"key": "quarterly", "label": "3 months", "months": 3, "note": "20% off"},
    {"key": "yearly", "label": "12 months", "months": 12, "note": "up to 25% off"},
]
CADENCE_MONTHS = {c["key"]: c["months"] for c in CADENCES}
CADENCE_WORDS = {"monthly": "per month", "quarterly": "every 3 months", "yearly": "per year"}

# Everything a paid plan above Starter unlocks.
_FULL = {"transfers": True, "custom_roles": True, "invoice_photos": True,
         "custom_pdf": True, "reminders": True, "csv_export": True, "multi_shop_analytics": True}

PLANS = [
    {
        "key": "trial",
        "name": "Free trial",
        "prices": {"monthly": 0, "quarterly": 0, "yearly": 0},
        "cadence": f"{TRIAL_DAYS} days",
        "tagline": "Premium access for two weeks before you pay a naira.",
        "limits": {"businesses": 1, "shops": 3, "users": 9, "invoices": 1000},
        "features": {**_FULL, "multi_business": False},
        "perks": ["Everything in Premium for 14 days", "Up to 3 locations and 9 people",
                  "Product photos print on your invoices", "Nothing is charged, no card needed"],
    },
    {
        "key": "starter",
        "name": "Starter",
        "prices": {"monthly": 7500, "quarterly": 18500, "yearly": 69000},
        "cadence": "per month",
        "tagline": "One shop, one person, the whole book in your pocket.",
        "limits": {"businesses": 1, "shops": 1, "users": 1, "invoices": 1000},
        "features": {"transfers": False, "custom_roles": False, "invoice_photos": False,
                     "custom_pdf": False, "reminders": False, "csv_export": False,
                     "multi_shop_analytics": False, "multi_business": False},
        "perks": ["Basic inventory", "Sales tracking", "Debt tracking", "Offline mode",
                  "Inventory image upload", "1,000 customer invoices",
                  "Photos save on items — printing them on invoices needs Premium"],
    },
    {
        "key": "premium",
        "name": "Premium",
        "prices": {"monthly": 17000, "quarterly": 40800, "yearly": 149000},
        "cadence": "per month",
        "tagline": "Three locations, nine hands, photos on every invoice.",
        "limits": {"businesses": 1, "shops": 3, "users": 9, "invoices": 10000},
        "features": {**_FULL, "multi_business": False},
        "perks": ["All Starter features", "Image display on invoices", "Custom PDF invoices",
                  "Customer sales reminders", "CSV exports", "Multi-shop analytics",
                  "10,000 customer invoices"],
    },
    {
        "key": "pro",
        "name": "Pro",
        "prices": {"monthly": 50000, "quarterly": 120000, "yearly": 449000},
        "cadence": "per month",
        "tagline": "Three businesses, nine locations, twenty-seven people.",
        "limits": {"businesses": 3, "shops": 9, "users": 27, "invoices": 50000},
        "features": {**_FULL, "multi_business": True},
        "perks": ["All Starter features", "Image display on invoices", "Custom PDF invoices",
                  "Customer sales reminders", "CSV exports", "Multi-shop analytics",
                  "50,000 customer invoices"],
    },
    {
        "key": "enterprise",
        "name": "Enterprise",
        "prices": {"monthly": 83500, "quarterly": 200400, "yearly": 749000},
        "cadence": "per month",
        "tagline": "Four businesses, sixteen locations, forty-eight people.",
        "limits": {"businesses": 4, "shops": 16, "users": 48, "invoices": 200000},
        "features": {**_FULL, "multi_business": True},
        "perks": ["All Starter features", "Image display on invoices", "Custom PDF invoices",
                  "Customer sales reminders", "CSV exports", "Multi-shop analytics",
                  "200,000 customer invoices"],
    },
]

# Older records (and the Super Admin sample tenants) use different words for the
# same thing.
ALIASES = {"basic": "starter", "free": "trial", "lapsed": "trial", "": "trial", "plus": "premium"}

LIMIT_NAMES = {"shops": "locations", "users": "staff or reps", "businesses": "businesses",
               "invoices": "customer invoices"}

FEATURE_NAMES = {
    "transfers": "Stock transfers between locations",
    "custom_roles": "Custom roles and permissions",
    "invoice_photos": "Image display on invoices",
    "custom_pdf": "Custom PDF invoices",
    "reminders": "Customer sales reminders",
    "csv_export": "CSV exports",
    "multi_shop_analytics": "Multi-shop analytics",
    "multi_business": "More than one business",
}

# The comparison table on Plan & billing, in the order a trader reads it.
MATRIX = [
    {"label": "Businesses", "kind": "limit", "key": "businesses"},
    {"label": "Locations", "kind": "limit", "key": "shops"},
    {"label": "Staff or reps", "kind": "limit", "key": "users"},
    {"label": "Customer invoices", "kind": "limit", "key": "invoices"},
    {"label": FEATURE_NAMES["invoice_photos"], "kind": "feature", "key": "invoice_photos"},
    {"label": FEATURE_NAMES["custom_pdf"], "kind": "feature", "key": "custom_pdf"},
    {"label": FEATURE_NAMES["reminders"], "kind": "feature", "key": "reminders"},
    {"label": FEATURE_NAMES["csv_export"], "kind": "feature", "key": "csv_export"},
    {"label": FEATURE_NAMES["multi_shop_analytics"], "kind": "feature", "key": "multi_shop_analytics"},
    {"label": FEATURE_NAMES["transfers"], "kind": "feature", "key": "transfers"},
    {"label": "Basic inventory, sales and debt tracking", "kind": "always", "key": "core"},
    {"label": "Offline mode and cloud backup", "kind": "always", "key": "offline"},
    {"label": "Inventory image upload", "kind": "always", "key": "item_photos"},
]

PAID_KEYS = ["starter", "premium", "pro", "enterprise"]


def money(amount: int) -> str:
    return f"₦ {amount:,.0f}" if amount else "Free"


def price_of(plan: dict, cadence: str) -> int:
    return plan["prices"].get(cadence, plan["prices"]["monthly"])


def plan_key(raw: Optional[str]) -> str:
    k = (raw or "").strip().lower()
    k = ALIASES.get(k, k)
    return k if any(p["key"] == k for p in PLANS) else "trial"


def plan_by_key(raw: Optional[str]) -> dict:
    k = plan_key(raw)
    return next(p for p in PLANS if p["key"] == k)


def public_plan(plan: dict) -> dict:
    """What the app shows on a plan card."""
    return {**plan, "price": plan["prices"]["monthly"], "price_label": money(plan["prices"]["monthly"]),
            "price_labels": {k: money(v) for k, v in plan["prices"].items()}}


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
    if nxt and not store_client.get():
        room = nxt["limits"].get(kind)
        tail = f" {nxt['name']} gives you {'unlimited' if room is None else f'{room:,}'} — open More → Plan & billing to upgrade."
    return f"{plan['name']} covers {cap:,} {word}. You are already at {cap:,}.{tail}"


def feature_message(current: str, feature: str) -> str:
    plan = plan_by_key(current)
    what = FEATURE_NAMES.get(feature, feature)
    nxt = next_plan_for_feature(plan["key"], feature)
    tail = f" It comes with {nxt['name']} — open More → Plan & billing to upgrade." if nxt and not store_client.get() else ""
    return f"{what} is not part of {plan['name']}.{tail}"


def expired_message(plan: dict, trialing: bool) -> str:
    if store_client.get():
        # phone store builds: no pointing at a purchase the app can't make
        return ("Your free trial has ended. " if trialing else f"Your {plan['name']} plan is not active. ") + \
               "Every record is safe and still readable; saving new records is paused while no plan is active."
    if trialing:
        return (f"Your {TRIAL_DAYS}-day free trial has ended. Every record is safe and still readable — "
                "pick a plan in More → Plan & billing to start saving again.")
    return (f"Your {plan['name']} subscription has lapsed. Your books are safe and still readable — "
            "renew in More → Plan & billing to start saving again.")
