"""Plan & billing for the shop owner — what they are on, what they are using,
and switching plan.

Paid plans are bought by card through Paystack (hosted checkout, auto-renewing
subscription). Without a Paystack key the owner can still switch plan directly.
The limits are real: every create endpoint asks `ensure_limit` /
`ensure_feature` first.
"""
from datetime import timedelta, timezone
from urllib.parse import urlparse
import hashlib
import hmac
import json
import logging
import os
import secrets as pysecrets

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from bson import ObjectId

from deps import CurrentUser, biz_filter, db, log_activity, now, subscription_of
import plans as plan_rules
from plans import CADENCES, CADENCE_MONTHS, MATRIX, PAID_KEYS, PLANS, plan_by_key, public_plan

router = APIRouter(prefix="/api")
log = logging.getLogger("billing")


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
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])}) or {}
    return {**sub, "usage": used, "cadences": CADENCES,
            "can_manage": user.get("role", "owner") == "owner",
            "paystack": {"enabled": paystack_on(), "test": paystack_mode() == "test",
                         "auto_renew": bool(biz.get("paystack_auto_renew") and biz.get("paystack_subscription_code")),
                         "card": biz.get("paystack_card") or None}}


@router.get("/plans")
async def plan_catalogue(user: CurrentUser):
    f = biz_filter(user)
    sub = await subscription_of(f["business_id"])
    return {"plans": [public_plan(p) for p in PLANS], "matrix": MATRIX, "cadences": CADENCES,
            "current": sub["plan"], "cadence": sub["cadence_key"], "status": sub["status"],
            "trial_days": plan_rules.TRIAL_DAYS}


async def activate_plan(business_id: str, plan_key: str, cadence: str, user: dict, note: str = "",
                        extend: bool = False) -> dict:
    """Put the business on a plan. `extend` adds the period on top of what is
    left (a renewal); otherwise the period starts today."""
    plan = plan_by_key(plan_key)
    months = CADENCE_MONTHS[cadence]
    start = now()
    if extend:
        biz = await db.businesses.find_one({"_id": ObjectId(business_id)}) or {}
        cur = biz.get("renews_at")
        if cur:
            cur = cur if cur.tzinfo else cur.replace(tzinfo=timezone.utc)
            start = max(start, cur)
    renews = start + timedelta(days=30 * months)
    price = plan_rules.price_of(plan, cadence)
    await db.businesses.update_one({"_id": ObjectId(business_id)}, {"$set": {
        "plan": plan["key"], "plan_cadence": cadence, "renews_at": renews,
        "plan_changed_at": now(), "plan_changed_by": user.get("name", ""), "plan_months": months}})
    await db.plan_requests.delete_many({"business_id": business_id, "status": "pending"})
    await db.plan_history.insert_one({"business_id": business_id, "plan": plan["key"],
                                      "cadence": cadence, "amount": price, "note": note,
                                      "by": user.get("name", ""), "created_at": now()})
    await log_activity(business_id, user, "plan",
                       f"{plan['name']} {'renewed' if extend else 'activated'} · {cadence}", note or "Plan & billing", price)
    used = await usage(business_id)
    over = [plan_rules.LIMIT_NAMES[k] for k, cap in plan["limits"].items()
            if cap is not None and used.get(k, 0) > cap]
    sub = await subscription_of(business_id)
    return {"ok": True, **sub, "usage": used,
            "message": f"{plan['name']} is on — {plan_rules.money(price)} {plan_rules.CADENCE_WORDS[cadence]}."
                       + (f" You are above the new ceiling for {', '.join(over)}; nothing was deleted, you just cannot add more until it fits." if over else ""),
            "over": over}


def _check_choice(plan: str, cadence: str, user: dict):
    if user.get("role", "owner") != "owner":
        raise HTTPException(403, "Only the owner can change the plan")
    if plan not in PAID_KEYS:
        raise HTTPException(400, "Pick Starter, Premium, Pro or Enterprise")
    if cadence not in CADENCE_MONTHS:
        raise HTTPException(400, "Pick monthly, quarterly or yearly")


@router.post("/subscription/choose")
async def choose_plan(data: PlanChoiceIn, user: CurrentUser):
    """Switch the business onto a plan without a card — only while Paystack is
    not set up. Once it is, a paid plan starts through /subscription/checkout."""
    f = biz_filter(user)
    _check_choice(data.plan, data.cadence, user)
    if paystack_on():
        raise HTTPException(402, "Pay with your card to start this plan — tap the plan again to open Paystack")
    return await activate_plan(f["business_id"], data.plan, data.cadence, user, data.note)


# ---------------------------------------------------------------- Paystack
# The owner pays on Paystack's hosted page. The first charge also starts a
# Paystack subscription on the same card, which renews itself; every renewal
# arrives as a webhook and extends the plan. Nothing turns a plan on until
# Paystack confirms the money (verify call or signed webhook).
PAYSTACK = "https://api.paystack.co"
INTERVAL = {"monthly": "monthly", "quarterly": "quarterly", "yearly": "annually"}
SYSTEM = {"_id": "paystack", "name": "Paystack"}
APP_SCHEMES = ("frontend:", "exp:", "exps:")


def paystack_key() -> str:
    return os.environ.get("PAYSTACK_SECRET_KEY", "")


def paystack_on() -> bool:
    return bool(paystack_key())


def paystack_mode() -> str:
    return "live" if paystack_key().startswith("sk_live") else "test"


async def pst(method: str, path: str, **kw) -> dict:
    async with httpx.AsyncClient(base_url=PAYSTACK, timeout=25) as c:
        r = await c.request(method, path, headers={"Authorization": f"Bearer {paystack_key()}"}, **kw)
    try:
        body = r.json()
    except ValueError:
        body = {}
    if not r.is_success or not body.get("status"):
        log.warning("Paystack %s %s failed: %s %s", method, path, r.status_code, body.get("message"))
        raise HTTPException(502, f"Paystack: {body.get('message') or 'request failed'}")
    return body.get("data") or {}


async def plan_code(plan: dict, cadence: str) -> str:
    """One Paystack plan per TradaBooks plan × cadence × price, made on first use."""
    amount = plan_rules.price_of(plan, cadence) * 100
    key = {"mode": paystack_mode(), "plan": plan["key"], "cadence": cadence, "amount": amount}
    hit = await db.paystack_plans.find_one(key)
    if hit:
        return hit["plan_code"]
    made = await pst("POST", "/plan", json={"name": f"TradaBooks {plan['name']} ({cadence})", "interval": INTERVAL[cadence],
                                            "amount": amount, "currency": "NGN", "send_invoices": True, "send_sms": False})
    await db.paystack_plans.update_one(key, {"$set": {**key, "plan_code": made["plan_code"], "created_at": now()}}, upsert=True)
    return made["plan_code"]


def _safe_return(url: str, request: Request) -> str:
    if not url:
        return ""
    if url.startswith(APP_SCHEMES):
        return url
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    p = urlparse(url)
    return url if p.scheme == "https" and p.netloc == host else ""


class CheckoutIn(BaseModel):
    plan: str
    cadence: str = "monthly"
    return_url: str = ""


@router.post("/subscription/checkout")
async def paystack_checkout(data: CheckoutIn, request: Request, user: CurrentUser):
    f = biz_filter(user)
    _check_choice(data.plan, data.cadence, user)
    if not paystack_on():
        raise HTTPException(400, "Card payments aren't set up yet")
    plan = plan_by_key(data.plan)
    amount = plan_rules.price_of(plan, data.cadence) * 100
    code = await plan_code(plan, data.cadence)
    reference = "TRADA_" + pysecrets.token_hex(10)
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    init = await pst("POST", "/transaction/initialize", json={
        "email": user["email"], "amount": amount, "currency": "NGN", "plan": code, "reference": reference,
        "callback_url": f"{proto}://{host}/api/paystack/callback",
        "metadata": {"business_id": f["business_id"], "plan": plan["key"], "cadence": data.cadence}})
    await db.paystack_txns.insert_one({"reference": reference, "business_id": f["business_id"], "plan": plan["key"],
                                       "cadence": data.cadence, "amount": amount, "plan_code": code, "kind": "first",
                                       "status": "pending", "return_url": _safe_return(data.return_url, request),
                                       "user_id": str(user["_id"]), "by": user.get("name", ""), "mode": paystack_mode(),
                                       "created_at": now()})
    return {"authorization_url": init["authorization_url"], "reference": reference}


async def _link_subscription(biz_id: str, customer: dict, code: str):
    """Find the Paystack subscription the first charge started, so we can cancel it later."""
    try:
        rows = await pst("GET", "/subscription", params={"customer": customer.get("id"), "perPage": 20})
    except HTTPException:
        return
    for s in rows if isinstance(rows, list) else []:
        if (s.get("plan") or {}).get("plan_code") == code and s.get("status") in ("active", "non-renewing"):
            await db.businesses.update_one({"_id": ObjectId(biz_id)}, {"$set": {
                "paystack_subscription_code": s.get("subscription_code"), "paystack_email_token": s.get("email_token"),
                "paystack_auto_renew": s.get("status") == "active"}})
            return


async def _apply_first(reference: str, data: dict) -> dict:
    """Turn the plan on for a confirmed first payment — once, whoever gets here first."""
    txn = await db.paystack_txns.find_one({"reference": reference})
    if not txn:
        raise HTTPException(404, "Payment not found")
    if data.get("status") != "success" or data.get("currency") != "NGN" or int(data.get("amount") or 0) != txn["amount"]:
        # "abandoned" just means the page is still open or was closed — the owner may still pay, so nothing is final here
        await db.paystack_txns.update_one({"_id": txn["_id"], "status": {"$ne": "paid"}}, {"$set": {"last_status": data.get("status")}})
        return {"paid": False, "status": data.get("status") or "pending"}
    claimed = await db.paystack_txns.find_one_and_update({"_id": txn["_id"], "status": {"$ne": "paid"}},
                                                         {"$set": {"status": "paid", "paid_at": now()}})
    if not claimed:
        return {"paid": True, "status": "success", "already": True}
    biz_id = txn["business_id"]
    biz = await db.businesses.find_one({"_id": ObjectId(biz_id)}) or {}
    old_sub, old_token = biz.get("paystack_subscription_code"), biz.get("paystack_email_token")
    cust, auth = data.get("customer") or {}, data.get("authorization") or {}
    await db.businesses.update_one({"_id": ObjectId(biz_id)}, {"$set": {
        "paystack_customer_code": cust.get("customer_code"), "paystack_plan_code": txn["plan_code"],
        "paystack_card": {"brand": auth.get("brand", ""), "last4": auth.get("last4", "")},
        "paystack_auto_renew": True}, "$unset": {"paystack_subscription_code": "", "paystack_email_token": ""}})
    who = await db.users.find_one({"_id": ObjectId(txn["user_id"])}) if ObjectId.is_valid(txn.get("user_id", "")) else None
    out = await activate_plan(biz_id, txn["plan"], txn["cadence"], who or SYSTEM, f"Paid by card · {reference}")
    # a plan change: stop the old card subscription so the owner is never billed twice
    if old_sub and old_token:
        try:
            await pst("POST", "/subscription/disable", json={"code": old_sub, "token": old_token})
        except HTTPException:
            pass
    await _link_subscription(biz_id, cust, txn["plan_code"])
    return {"paid": True, "status": "success", **out}


class VerifyIn(BaseModel):
    reference: str


@router.post("/subscription/verify")
async def paystack_verify(data: VerifyIn, user: CurrentUser):
    f = biz_filter(user)
    txn = await db.paystack_txns.find_one({"reference": data.reference, "business_id": f["business_id"]})
    if not txn:
        raise HTTPException(404, "Payment not found")
    if txn["status"] == "paid":
        return {"paid": True, "status": "success", "already": True, **(await subscription_of(f["business_id"]))}
    got = await pst("GET", f"/transaction/verify/{data.reference}")
    return await _apply_first(data.reference, got)


@router.get("/paystack/callback")
async def paystack_callback(request: Request, reference: str = "", trxref: str = ""):
    ref = reference or trxref
    txn = await db.paystack_txns.find_one({"reference": ref}) if ref else None
    if txn and txn["status"] != "paid":
        try:
            await _apply_first(ref, await pst("GET", f"/transaction/verify/{ref}"))
        except HTTPException:
            pass
    back = (txn or {}).get("return_url")
    if back:
        return RedirectResponse(f"{back}{'&' if '?' in back else '?'}paystack={ref}", status_code=302)
    return HTMLResponse("<html><body style='font-family:sans-serif;text-align:center;padding:48px'>"
                        "<h2>Payment received</h2><p>You can close this page and go back to TradaBooks.</p></body></html>")


@router.post("/paystack/webhook")
async def paystack_webhook(request: Request):
    raw = await request.body()
    sig = request.headers.get("x-paystack-signature", "")
    good = hmac.new(paystack_key().encode(), raw, hashlib.sha512).hexdigest()
    if not paystack_on() or not hmac.compare_digest(good, sig):
        raise HTTPException(401, "Bad signature")
    try:
        event = json.loads(raw or b"{}")
    except ValueError:
        raise HTTPException(400, "Bad payload")
    kind, d = event.get("event", ""), event.get("data") or {}
    cust_code = (d.get("customer") or {}).get("customer_code")
    biz = await db.businesses.find_one({"paystack_customer_code": cust_code}) if cust_code else None

    if kind == "charge.success":
        ref = d.get("reference", "")
        if await db.paystack_txns.find_one({"reference": ref, "kind": "first"}):
            await _apply_first(ref, d)
        elif biz and biz.get("paystack_plan_code") and (d.get("plan") or {}).get("plan_code") == biz.get("paystack_plan_code") \
                and int(d.get("amount") or 0) >= plan_rules.price_of(plan_by_key(biz.get("plan")), biz.get("plan_cadence", "monthly")) * 100:
            # a renewal Paystack charged on its own — extend once per reference
            res = await db.paystack_txns.update_one({"reference": ref}, {"$setOnInsert": {
                "reference": ref, "business_id": str(biz["_id"]), "kind": "renewal", "status": "paid",
                "amount": int(d.get("amount") or 0), "plan": biz.get("plan"), "cadence": biz.get("plan_cadence", "monthly"),
                "mode": paystack_mode(), "created_at": now()}}, upsert=True)
            if res.upserted_id:
                await activate_plan(str(biz["_id"]), biz.get("plan"), biz.get("plan_cadence", "monthly"), SYSTEM,
                                    f"Renewed by card · {ref}", extend=True)
    elif kind == "subscription.create" and biz and (d.get("plan") or {}).get("plan_code") == biz.get("paystack_plan_code"):
        await db.businesses.update_one({"_id": biz["_id"]}, {"$set": {
            "paystack_subscription_code": d.get("subscription_code"), "paystack_email_token": d.get("email_token"),
            "paystack_auto_renew": True}})
    elif kind in ("subscription.not_renew", "subscription.disable") and biz \
            and d.get("subscription_code") == biz.get("paystack_subscription_code"):
        await db.businesses.update_one({"_id": biz["_id"]}, {"$set": {"paystack_auto_renew": False}})
    elif kind == "invoice.payment_failed" and biz:
        await log_activity(str(biz["_id"]), SYSTEM, "plan", "Card renewal failed",
                           "Paystack could not charge the card — renew in Plan & billing", 0)
    return {"ok": True}


@router.post("/subscription/cancel")
async def paystack_cancel(user: CurrentUser):
    """Stop auto-renew. The plan stays on until the end of the period already paid."""
    f = biz_filter(user)
    if user.get("role", "owner") != "owner":
        raise HTTPException(403, "Only the owner can change the plan")
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])}) or {}
    code, token = biz.get("paystack_subscription_code"), biz.get("paystack_email_token")
    if not code:
        raise HTTPException(409, "There is no card renewal to stop")
    if not token:
        token = (await pst("GET", f"/subscription/{code}")).get("email_token")
    await pst("POST", "/subscription/disable", json={"code": code, "token": token})
    await db.businesses.update_one({"_id": biz["_id"]}, {"$set": {"paystack_auto_renew": False}})
    await log_activity(f["business_id"], user, "plan", "Card auto-renew stopped", "Plan & billing", 0)
    return {"ok": True, "message": "Auto-renew is off. Your plan stays on until the end of the period you paid for."}
