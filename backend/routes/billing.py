"""Plan & billing for the shop owner — what they are on, what they are using,
and a request to move up.

There is no card gateway yet, so choosing a paid plan raises a request the
tredi team activates from the Super Admin panel. The limits themselves are
real: every create endpoint asks `ensure_limit` / `ensure_feature` first.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bson import ObjectId

from deps import CurrentUser, biz_filter, db, log_activity, now, subscription_of
from plans import MATRIX, PAID_KEYS, PLANS, plan_by_key

router = APIRouter(prefix="/api")


class PlanRequestIn(BaseModel):
    plan: str
    note: str = ""


async def usage(business_id: str) -> dict:
    biz = await db.businesses.find_one({"_id": ObjectId(business_id)}) or {}
    return {
        "shops": len(biz.get("shops") or []) or 1,
        "users": await db.users.count_documents({"business_id": business_id}),
        "businesses": await db.businesses.count_documents({"owner_id": biz.get("owner_id", ""), "deleted_at": None,
                                                           "archived": {"$ne": True}}) or 1,
    }


async def pending_request(business_id: str) -> dict | None:
    r = await db.plan_requests.find_one({"business_id": business_id, "status": "pending"})
    return {"plan": r["plan"], "plan_name": plan_by_key(r["plan"])["name"],
            "requested_at": r["created_at"].isoformat(), "by": r.get("requested_by_name", "")} if r else None


@router.get("/subscription")
async def my_subscription(user: CurrentUser):
    f = biz_filter(user)
    sub = await subscription_of(f["business_id"])
    used = await usage(f["business_id"])
    return {**sub, "usage": used, "pending": await pending_request(f["business_id"]),
            "can_manage": user.get("role", "owner") == "owner"}


@router.get("/plans")
async def plan_catalogue(user: CurrentUser):
    f = biz_filter(user)
    sub = await subscription_of(f["business_id"])
    return {"plans": PLANS, "matrix": MATRIX, "current": sub["plan"], "status": sub["status"]}


@router.post("/subscription/request")
async def request_plan(data: PlanRequestIn, user: CurrentUser):
    f = biz_filter(user)
    if user.get("role", "owner") != "owner":
        raise HTTPException(403, "Only the owner can change the plan")
    if data.plan not in PAID_KEYS:
        raise HTTPException(400, "Pick Starter or Pro")
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])}) or {}
    plan = plan_by_key(data.plan)
    await db.plan_requests.update_one(
        {"business_id": f["business_id"], "status": "pending"},
        {"$set": {"business_id": f["business_id"], "business_name": biz.get("name", ""), "plan": plan["key"],
                  "amount": plan["price"], "note": data.note, "status": "pending",
                  "requested_by": str(user["_id"]), "requested_by_name": user.get("name", ""),
                  "created_at": now()}},
        upsert=True)
    await log_activity(f["business_id"], user, "plan", f"{plan['name']} requested", "Plan & billing", plan["price"])
    return {"ok": True, "plan": plan["key"],
            "message": f"{plan['name']} requested. We will activate it and confirm by email — keep working in the meantime."}


@router.delete("/subscription/request")
async def cancel_request(user: CurrentUser):
    f = biz_filter(user)
    await db.plan_requests.delete_many({"business_id": f["business_id"], "status": "pending"})
    return {"ok": True}
