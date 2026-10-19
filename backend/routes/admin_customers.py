"""Real customers in the Super Admin panel.

The sample tenants on Businesses show the panel's design; this router reads the
businesses that actually signed up in the app, so the tredi team can activate a
plan for a client who paid directly, tailor a plan for one client, and see when
each person was last in their books.
"""
from datetime import timedelta
from typing import Dict, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deps import aware, db, log_activity, now, oid, subscription_state
import plans as plan_rules
from plans import FEATURE_NAMES, LIMIT_NAMES, PAID_KEYS, PLANS, plan_by_key
from routes.admin import Admin, audit

router = APIRouter(prefix="/api/admin/customers")
TEAM = {"_id": "tredi-team", "name": "Tredi team"}


def iso(d) -> Optional[str]:
    d = aware(d)
    return d.isoformat() if d else None


async def summary(biz: dict) -> dict:
    bid = str(biz["_id"])
    owner = await db.users.find_one({"business_id": bid, "role": "owner"}) or \
        (await db.users.find_one({"_id": ObjectId(biz["owner_id"])}) if ObjectId.is_valid(str(biz.get("owner_id", ""))) else None) or {}
    last = None
    async for u in db.users.find({"business_id": bid, "last_seen_at": {"$ne": None}}).sort("last_seen_at", -1).limit(1):
        last = u["last_seen_at"]
    sub = subscription_state(biz)
    return {"id": bid, "name": biz.get("name", ""), "owner": owner.get("name", ""), "email": owner.get("email", ""),
            "phone": biz.get("phone", "") or owner.get("phone", ""), "city": biz.get("city", "") or biz.get("address", ""),
            "plan": sub["plan"], "plan_name": sub["name"], "status": sub["status"], "custom": sub["custom"],
            "days_left": sub["days_left"], "ends_at": sub["ends_at"], "price": sub["price"],
            "users": await db.users.count_documents({"business_id": bid}),
            "shops": len(biz.get("shops") or []) or 1,
            "last_active": iso(last or biz.get("last_active_at")), "created_at": iso(biz.get("created_at")),
            "suspended": bool(biz.get("suspended"))}


@router.get("")
async def customers(admin: Admin, q: str = "", status: str = "all", sort: str = "last_active"):
    f: dict = {"deleted_at": None}
    if q.strip():
        f["name"] = {"$regex": q.strip(), "$options": "i"}
    rows = [await summary(b) async for b in db.businesses.find(f)]
    if q.strip():
        # Search by owner email/name too.
        seen = {r["id"] for r in rows}
        async for u in db.users.find({"$or": [{"email": {"$regex": q.strip(), "$options": "i"}},
                                              {"name": {"$regex": q.strip(), "$options": "i"}}]}):
            bid = str(u.get("business_id") or "")
            if bid and bid not in seen and ObjectId.is_valid(bid):
                b = await db.businesses.find_one({"_id": ObjectId(bid), "deleted_at": None})
                if b:
                    rows.append(await summary(b))
                    seen.add(bid)
    counts = {"all": len(rows)}
    for k in ("active", "trialing", "expired"):
        counts[k] = len([r for r in rows if r["status"] == k])
    if status != "all":
        rows = [r for r in rows if r["status"] == status]
    if sort == "name":
        rows.sort(key=lambda r: r["name"].lower())
    elif sort == "expiry":
        rows.sort(key=lambda r: r["ends_at"] or "9999")
    elif sort == "newest":
        rows.sort(key=lambda r: r["created_at"] or "", reverse=True)
    else:
        rows.sort(key=lambda r: r["last_active"] or "", reverse=True)
    return {"rows": rows, "counts": counts}


@router.get("/{bid}")
async def customer(bid: str, admin: Admin):
    biz = await db.businesses.find_one({"_id": oid(bid)})
    if not biz:
        raise HTTPException(404, "Customer not found")
    out = await summary(biz)
    sub = subscription_state(biz)
    out["subscription"] = sub
    out["custom_plan"] = biz.get("custom_plan") or None
    out["team"] = [{"id": str(u["_id"]), "name": u.get("name", ""), "email": u.get("email", ""), "role": u.get("role", "owner"),
                    "shop": u.get("shop", ""), "last_seen": iso(u.get("last_seen_at")), "joined": iso(u.get("created_at"))}
                   async for u in db.users.find({"business_id": bid}).sort("last_seen_at", -1)]
    out["history"] = [{"id": str(h["_id"]), "plan": plan_by_key(h.get("plan")).get("name"), "months": h.get("months"),
                       "cadence": h.get("cadence", ""), "amount": h.get("amount", 0), "reference": h.get("reference", ""),
                       "note": h.get("note", ""), "by": h.get("by", ""), "source": h.get("source", "app"),
                       "at": iso(h.get("created_at"))}
                      async for h in db.plan_history.find({"business_id": bid}).sort("created_at", -1).limit(30)]
    out["pending_request"] = bool(await db.plan_requests.find_one({"business_id": bid, "status": "pending"}))
    out["catalogue"] = [{"key": p["key"], "name": p["name"], "prices": p["prices"], "limits": p["limits"],
                         "features": p["features"]} for p in PLANS if p["key"] in PAID_KEYS]
    out["limit_names"] = LIMIT_NAMES
    out["feature_names"] = FEATURE_NAMES
    return out


class ActivateIn(BaseModel):
    plan: str
    months: int = 1
    amount: int = 0
    reference: str = ""
    note: str = ""
    extend: bool = True


def cadence_for(months: int) -> str:
    return {3: "quarterly", 12: "yearly"}.get(months, "monthly")


@router.post("/{bid}/activate")
async def activate(bid: str, body: ActivateIn, admin: Admin):
    """A client paid us directly: switch them on, starting now (or after the
    time they still have on the same plan)."""
    biz = await db.businesses.find_one({"_id": oid(bid)})
    if not biz:
        raise HTTPException(404, "Customer not found")
    if body.plan not in PAID_KEYS:
        raise HTTPException(400, "Pick Starter, Premium, Pro or Enterprise")
    if not 1 <= body.months <= 36:
        raise HTTPException(400, "Months must be between 1 and 36")
    plan = plan_by_key(body.plan)
    sub = subscription_state(biz)
    start = now()
    if body.extend and sub["plan"] == plan["key"] and sub["status"] == "active" and sub["ends_at"]:
        start = max(start, aware(biz.get("renews_at")) or start)
    renews = start + timedelta(days=30 * body.months)
    cadence = cadence_for(body.months)
    await db.businesses.update_one({"_id": biz["_id"]}, {
        "$set": {"plan": plan["key"], "plan_cadence": cadence, "plan_months": body.months, "renews_at": renews,
                 "plan_activated_at": now(), "plan_changed_at": now(), "plan_changed_by": f"{admin.get('name', 'admin')} (Tredi team)"},
        "$unset": {"trial_ends_at": ""}})
    await db.plan_requests.update_many({"business_id": bid, "status": "pending"},
                                       {"$set": {"status": "approved", "approved_at": now(),
                                                 "approved_by": admin.get("name", "admin"), "months": body.months}})
    await db.plan_history.insert_one({"business_id": bid, "plan": plan["key"], "cadence": cadence, "months": body.months,
                                      "amount": max(0, body.amount), "reference": body.reference.strip(),
                                      "note": body.note.strip(), "by": admin.get("name", "admin"), "source": "admin",
                                      "created_at": now()})
    words = f"{body.months} month{'s' if body.months > 1 else ''}"
    await audit(admin, biz.get("name", ""), f"{plan['name']} activated by Tredi team",
                f"{words} · {plan_rules.money(body.amount)}{' · ref ' + body.reference.strip() if body.reference.strip() else ''}", "billing")
    await log_activity(bid, TEAM, "plan", f"{plan['name']} activated by Tredi team · {words}", "Plan & billing", body.amount)
    return {"ok": True, "message": f"{biz.get('name', 'Customer')} is on {plan['name']} until {renews.strftime('%d %b %Y')}"}


class CustomIn(BaseModel):
    name: str = ""
    price: Optional[int] = None
    limits: Dict[str, Optional[int]] = {}
    features: Dict[str, bool] = {}


@router.put("/{bid}/custom-plan")
async def set_custom(bid: str, body: CustomIn, admin: Admin):
    """Tailor the limits, features and price for this one client. Anything not
    set falls back to their base plan."""
    biz = await db.businesses.find_one({"_id": oid(bid)})
    if not biz:
        raise HTTPException(404, "Customer not found")
    limits = {k: (None if v is None else max(0, int(v))) for k, v in body.limits.items() if k in LIMIT_NAMES}
    features = {k: bool(v) for k, v in body.features.items() if k in FEATURE_NAMES}
    if body.price is not None and body.price < 0:
        raise HTTPException(400, "Price cannot be negative")
    custom = {"name": body.name.strip(), "price": body.price, "limits": limits, "features": features,
              "set_by": admin.get("name", "admin"), "set_at": now()}
    await db.businesses.update_one({"_id": biz["_id"]}, {"$set": {"custom_plan": custom}})
    caps = ", ".join(f"{LIMIT_NAMES[k]} {'unlimited' if v is None else v}" for k, v in limits.items())
    await audit(admin, biz.get("name", ""), "Custom plan saved",
                f"{custom['name'] or 'Custom'}{' · ' + plan_rules.money(body.price) if body.price is not None else ''}{' · ' + caps if caps else ''}", "billing")
    await log_activity(bid, TEAM, "plan", f"Plan tailored by Tredi team{': ' + custom['name'] if custom['name'] else ''}", "Plan & billing")
    return {"ok": True, "message": f"Custom plan saved for {biz.get('name', 'this customer')}"}


@router.delete("/{bid}/custom-plan")
async def clear_custom(bid: str, admin: Admin):
    biz = await db.businesses.find_one({"_id": oid(bid)})
    if not biz:
        raise HTTPException(404, "Customer not found")
    await db.businesses.update_one({"_id": biz["_id"]}, {"$unset": {"custom_plan": ""}})
    await audit(admin, biz.get("name", ""), "Custom plan removed", "back to the standard plan", "billing")
    return {"ok": True, "message": "Back on the standard plan"}


@router.post("/{bid}/end-plan")
async def end_plan(bid: str, admin: Admin):
    """Stop a plan today (e.g. a direct payment bounced). Books stay readable."""
    biz = await db.businesses.find_one({"_id": oid(bid)})
    if not biz:
        raise HTTPException(404, "Customer not found")
    await db.businesses.update_one({"_id": biz["_id"]}, {"$set": {"renews_at": now() - timedelta(seconds=1), "trial_ends_at": now() - timedelta(seconds=1)}})
    await audit(admin, biz.get("name", ""), "Plan ended by Tredi team", "", "billing")
    return {"ok": True, "message": "Plan ended — the customer is read-only until they renew"}



class SuspendIn(BaseModel):
    reason: str = ""


@router.post("/{bid}/suspend")
async def toggle_suspend(bid: str, body: SuspendIn, admin: Admin):
    """Pause saving for a business (books stay readable), or restore it."""
    biz = await db.businesses.find_one({"_id": oid(bid)})
    if not biz:
        raise HTTPException(404, "Customer not found")
    on = not biz.get("suspended", False)
    if on and len(body.reason.strip()) < 4:
        raise HTTPException(400, "Say why — it is written to the audit log")
    await db.businesses.update_one({"_id": biz["_id"]}, {"$set": {"suspended": on, "suspended_reason": body.reason.strip() if on else ""}})
    await audit(admin, biz.get("name", ""), "Writes suspended" if on else "Writes restored", body.reason.strip())
    return {"ok": True, "suspended": on, "message": f"{biz.get('name', 'Business')} {'paused — read-only' if on else 'can save again'}"}


# ---------------------------------------------------------------- live Overview / Subscriptions / Users
live = APIRouter(prefix="/api/admin")


async def all_summaries() -> list:
    return [await summary(b) async for b in db.businesses.find({"deleted_at": None})]


def monthly_value(r: dict) -> int:
    return r["price"] if r["status"] == "active" and r["plan"] != "trial" else 0


@live.get("/overview")
async def overview(admin: Admin, window: str = "30"):
    rows = await all_summaries()
    days = 90 if window == "90" else 30
    since = now() - timedelta(days=days)
    week = (now() - timedelta(days=7)).isoformat()
    paying = [r for r in rows if r["status"] == "active" and r["plan"] != "trial"]
    attention = {
        "expiring": len([r for r in rows if r["status"] != "expired" and r["days_left"] is not None and 0 <= r["days_left"] <= 7]),
        "lapsed": len([r for r in rows if r["status"] == "expired"]),
        "inactive": len([r for r in rows if not r["last_active"] or r["last_active"] < (now() - timedelta(days=14)).isoformat()]),
        "plan_requests": await db.plan_requests.count_documents({"status": "pending"}),
        "messages": await db.support_messages.count_documents({"status": "open"}),
    }
    step = max(1, days // 6)
    series = []
    for i in range(days, 0, -step):
        a, b = now() - timedelta(days=i), now() - timedelta(days=max(0, i - step))
        series.append({"label": a.strftime("%d %b"),
                       "signups": await db.businesses.count_documents({"deleted_at": None, "created_at": {"$gte": a, "$lt": b}}),
                       "invoices": await db.invoices.count_documents({"deleted_at": None, "created_at": {"$gte": a, "$lt": b}})})
    joined = len([r for r in rows if r["created_at"] and r["created_at"] >= since.isoformat()])
    recent = sorted(rows, key=lambda r: r["created_at"] or "", reverse=True)[:6]
    return {
        "metrics": [
            {"label": "Businesses", "value": f"{len(rows):,}", "delta": f"▲ {joined} in {days} days", "tone": "pos"},
            {"label": "Paying", "value": f"{len(paying):,}", "delta": f"{len([r for r in rows if r['status'] == 'trialing'])} on trial"},
            {"label": "Active this week", "value": f"{len([r for r in rows if (r['last_active'] or '') >= week]):,}",
             "delta": f"of {len(rows):,} businesses"},
            {"label": "People on Tredi", "value": f"{await db.users.count_documents({}):,}", "delta": "owners and staff"},
            {"label": "Plan value", "value": plan_rules.money(sum(monthly_value(r) for r in rows)), "delta": "current paid plans"},
        ],
        "attention": attention, "series": series, "recent": recent,
    }


@live.get("/subscriptions")
async def subscriptions(admin: Admin, tab: str = "7"):
    rows = await all_summaries()
    soon = lambda r, n: r["status"] != "expired" and r["days_left"] is not None and 0 <= r["days_left"] <= n
    if tab == "lapsed":
        queue = [r for r in rows if r["status"] == "expired"]
    elif tab == "trial":
        queue = [r for r in rows if r["status"] == "trialing"]
    elif tab == "paying":
        queue = [r for r in rows if r["status"] == "active" and r["plan"] != "trial"]
    else:
        queue = [r for r in rows if soon(r, 7 if tab == "7" else 30)]
    queue.sort(key=lambda r: r["ends_at"] or "9999")
    exp7 = [r for r in rows if soon(r, 7)]
    return {
        "metrics": [
            {"label": "Paying businesses", "value": str(len([r for r in rows if monthly_value(r)])), "delta": plan_rules.money(sum(monthly_value(r) for r in rows)) + " in plans"},
            {"label": "Ending in 7 days", "value": str(len(exp7)), "delta": plan_rules.money(sum(r["price"] for r in exp7)) + " to renew"},
            {"label": "Lapsed · read-only", "value": str(len([r for r in rows if r["status"] == "expired"])), "delta": "renew to unlock"},
            {"label": "On trial", "value": str(len([r for r in rows if r["status"] == "trialing"])), "delta": f"{plan_rules.TRIAL_DAYS}-day trial"},
        ],
        "rows": queue, "catalogue": [{"key": p["key"], "name": p["name"], "prices": p["prices"]} for p in PLANS if p["key"] in PAID_KEYS],
    }


@live.get("/users")
async def users(admin: Admin, tab: str = "all", q: str = "", role: str = "", page: int = 1, size: int = 20):
    f: dict = {}
    if tab == "owners":
        f["role"] = "owner"
    elif tab == "staff":
        f["role"] = {"$ne": "owner"}
    elif tab == "never":
        f["last_seen_at"] = None
    elif tab == "inactive":
        f["last_seen_at"] = {"$lt": now() - timedelta(days=14)}
    if role:
        f["role"] = role
    if q.strip():
        rx = {"$regex": q.strip(), "$options": "i"}
        bids = [str(b["_id"]) async for b in db.businesses.find({"name": rx}, {"_id": 1})]
        f["$or"] = [{"name": rx}, {"email": rx}, {"phone": rx}, {"business_id": {"$in": bids}}]
    total = await db.users.count_documents(f)
    names: dict = {}
    rows = []
    async for u in db.users.find(f).sort([("last_seen_at", -1), ("created_at", -1)]).skip((page - 1) * size).limit(size):
        bid = str(u.get("business_id") or "")
        if bid and bid not in names:
            b = await db.businesses.find_one({"_id": ObjectId(bid)}, {"name": 1}) if ObjectId.is_valid(bid) else None
            names[bid] = (b or {}).get("name", "")
        rows.append({"id": str(u["_id"]), "name": u.get("name", ""), "email": u.get("email", ""), "phone": u.get("phone", ""),
                     "business": names.get(bid, ""), "business_id": bid, "role": u.get("role", "owner"),
                     "shop": u.get("shop", ""), "last_seen": iso(u.get("last_seen_at")), "joined": iso(u.get("created_at"))})
    counts = {"all": await db.users.count_documents({}), "owners": await db.users.count_documents({"role": "owner"}),
              "staff": await db.users.count_documents({"role": {"$ne": "owner"}}),
              "never": await db.users.count_documents({"last_seen_at": None}),
              "inactive": await db.users.count_documents({"last_seen_at": {"$lt": now() - timedelta(days=14)}})}
    return {"rows": rows, "total": total, "page": page, "size": size, "counts": counts}
