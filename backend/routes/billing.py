"""Plan & billing for the shop owner — what they are on, what they are using,
and switching plan.

There is no card gateway yet, so the owner activates a plan themselves and it
takes effect immediately; the choice is recorded so the tredi team can invoice
it. The limits are real: every create endpoint asks `ensure_limit` /
`ensure_feature` first.
"""
from datetime import timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bson import ObjectId

from deps import CurrentUser, biz_filter, db, log_activity, now, subscription_of
import plans as plan_rules
from plans import CADENCES, CADENCE_MONTHS, MATRIX, PAID_KEYS, PLANS, plan_by_key, public_plan

router = APIRouter(prefix="/api")


class PlanChoiceIn(BaseModel):
    plan: str
    cadence: str = "monthly"
    note: str = ""


async def usage(business_id: str) -> dict:
    biz = await db.businesses.find_one({"_id": ObjectId(business_id)}) or {}
    return {
        "shops": len(biz.get("shops") or []) or 1,
        "users": await db.users.count_documents({"business_id": business_id}),
        "businesses": await db.businesses.count_documents({"owner_id": biz.get("owner_id", ""), "deleted_at": None,
                                                           "archived": {"$ne": True}}) or 1,
        "invoices": await db.invoices.count_documents({"business_id": business_id, "deleted_at": None}),
    }


@router.get("/subscription")
async def my_subscription(user: CurrentUser):
    f = biz_filter(user)
    sub = await subscription_of(f["business_id"])
    used = await usage(f["business_id"])
    return {**sub, "usage": used, "cadences": CADENCES,
            "can_manage": user.get("role", "owner") == "owner"}


@router.get("/plans")
async def plan_catalogue(user: CurrentUser):
    f = biz_filter(user)
    sub = await subscription_of(f["business_id"])
    return {"plans": [public_plan(p) for p in PLANS], "matrix": MATRIX, "cadences": CADENCES,
            "current": sub["plan"], "cadence": sub["cadence_key"], "status": sub["status"],
            "trial_days": plan_rules.TRIAL_DAYS}


@router.post("/subscription/choose")
async def choose_plan(data: PlanChoiceIn, user: CurrentUser):
    """Switch the business onto a plan right away.

    Self-service on purpose: a shop whose trial ended must be able to get back
    to work without waiting for anyone. Downgrades are allowed even when the
    shop is over the new ceiling — it just cannot add more until it fits.
    """
    f = biz_filter(user)
    if user.get("role", "owner") != "owner":
        raise HTTPException(403, "Only the owner can change the plan")
    if data.plan not in PAID_KEYS:
        raise HTTPException(400, "Pick Starter, Premium, Pro or Enterprise")
    if data.cadence not in CADENCE_MONTHS:
        raise HTTPException(400, "Pick monthly, quarterly or yearly")
    plan = plan_by_key(data.plan)
    months = CADENCE_MONTHS[data.cadence]
    renews = now() + timedelta(days=30 * months)
    price = plan_rules.price_of(plan, data.cadence)
    await db.businesses.update_one({"_id": ObjectId(f["business_id"])}, {"$set": {
        "plan": plan["key"], "plan_cadence": data.cadence, "renews_at": renews,
        "plan_changed_at": now(), "plan_changed_by": user.get("name", "")}})
    await db.plan_requests.delete_many({"business_id": f["business_id"], "status": "pending"})
    await db.plan_history.insert_one({"business_id": f["business_id"], "plan": plan["key"],
                                      "cadence": data.cadence, "amount": price, "note": data.note,
                                      "by": user.get("name", ""), "created_at": now()})
    await log_activity(f["business_id"], user, "plan",
                       f"{plan['name']} activated · {data.cadence}", "Plan & billing", price)

    used = await usage(f["business_id"])
    over = [plan_rules.LIMIT_NAMES[k] for k, cap in plan["limits"].items()
            if cap is not None and used.get(k, 0) > cap]
    sub = await subscription_of(f["business_id"])
    return {"ok": True, **sub, "usage": used,
            "message": f"{plan['name']} is on — {plan_rules.money(price)} {plan_rules.CADENCE_WORDS[data.cadence]}."
                       + (f" You are above the new ceiling for {', '.join(over)}; nothing was deleted, you just cannot add more until it fits." if over else ""),
            "over": over}
