"""Rail 12 — team, roles, permissions, visibility scopes, app lock, handover on leave."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Dict, List, Optional, Literal
from bson import ObjectId

from deps import (CurrentUser, LIVE_QUICK, LIVE_SALE, biz_filter, clean, db, ensure_feature, ensure_limit, hash_password, invoice_paid,
                  invoice_status, log_activity, now, oid, period_range, date_query, public_user, rep_clause, scoped)

router = APIRouter(prefix="/api")

ABILITIES = [
    ("invoices", "Create and edit invoices"),
    ("big_discount", "Give a discount above 5%"),
    ("sell_credit", "Sell on credit"),
    ("see_profit", "See profit and cost prices"),
    ("adjust_stock", "Adjust stock quantities"),
    ("approve_transfers", "Approve stock transfers"),
    ("delete_payments", "Delete payments"),
    ("reports", "Open reports"),
    ("manage_users", "Manage users"),
]
SCOPE_KEYS = [("sales", "Invoices & sales"), ("stock", "Stock"), ("customers", "Customers"), ("reports", "Reports & totals")]

BUILTIN_ROLES = {
    "owner": {"label": "Owner", "note": "Everything, including deleting payments",
              "can": {k: True for k, _ in ABILITIES}, "scopes": {k: "all" for k, _ in SCOPE_KEYS}},
    "manager": {"label": "Manager", "note": "One shop, no user management",
                "can": {k: k != "manage_users" for k, _ in ABILITIES}, "scopes": {k: "shop" for k, _ in SCOPE_KEYS}},
    "sales": {"label": "Sales", "note": "Sell and take payment only",
              "can": {"invoices": True, "sell_credit": True, "big_discount": False, "see_profit": False, "adjust_stock": False,
                      "approve_transfers": False, "delete_payments": False, "reports": False, "manage_users": False},
              "scopes": {"sales": "own", "stock": "shop", "customers": "shop", "reports": "own"}},
    "stock": {"label": "Stock", "note": "Receive, count and transfer stock",
              "can": {"invoices": False, "sell_credit": False, "big_discount": False, "see_profit": False, "adjust_stock": True,
                      "approve_transfers": True, "delete_payments": False, "reports": False, "manage_users": False},
              "scopes": {"sales": "own", "stock": "shop", "customers": "shop", "reports": "own"}},
    "accountant": {"label": "Accountant", "note": "Read everything, edit nothing but payments",
                   "can": {"invoices": False, "sell_credit": False, "big_discount": False, "see_profit": True, "adjust_stock": False,
                           "approve_transfers": False, "delete_payments": True, "reports": True, "manage_users": False},
                   "scopes": {k: "all" for k, _ in SCOPE_KEYS}},
}


class InviteIn(BaseModel):
    name: str
    email: EmailStr
    phone: str = ""
    password: str = Field(default="tredi1234", min_length=6, max_length=72)
    role: str = "sales"
    shops: List[str] = []


class PermissionsIn(BaseModel):
    role: str
    shops: List[str] = []
    can: Dict[str, bool] = {}
    scopes: Dict[str, Literal["own", "shop", "all"]] = {}


class RoleIn(BaseModel):
    label: str
    start_from: str = "sales"
    note: str = ""
    can: Dict[str, bool] = {}
    scopes: Dict[str, Literal["own", "shop", "all"]] = {}
    assign_to: List[str] = []


class LockIn(BaseModel):
    enabled: bool = True
    pin: str = Field(default="", max_length=8)
    idle_minutes: int = 2
    biometrics: bool = True


class HandoverIn(BaseModel):
    to_user_id: Optional[str] = None
    deactivate_only: bool = False


def one_restriction(u: dict) -> str:
    role = u.get("role", "sales")
    can = u.get("can") or BUILTIN_ROLES.get(role, BUILTIN_ROLES["sales"])["can"]
    shops = u.get("shops") or []
    where = "all shops" if not shops else ", ".join(shops)
    if role == "owner":
        return "You · all shops · full access"
    if not can.get("see_profit"):
        return f"{where} · cannot see profit"
    if not can.get("delete_payments"):
        return f"{where} · cannot delete invoices"
    return f"{where} · reports and payments"


async def role_catalogue(business_id: str) -> list[dict]:
    out = []
    for key, r in BUILTIN_ROLES.items():
        out.append({"key": key, "label": r["label"], "note": r["note"], "builtin": True,
                    "count": await db.users.count_documents({"business_id": business_id, "role": key, "active": {"$ne": False}})})
    async for r in db.roles.find({"business_id": business_id, "deleted_at": None}):
        out.append({"key": str(r["_id"]), "label": r["label"], "note": r.get("note", ""), "builtin": False,
                    "count": await db.users.count_documents({"business_id": business_id, "role": str(r["_id"]), "active": {"$ne": False}})})
    return out


async def resolve_role(business_id: str, role: str) -> dict:
    if role in BUILTIN_ROLES:
        return BUILTIN_ROLES[role]
    if ObjectId.is_valid(role):
        r = await db.roles.find_one({"_id": ObjectId(role), "business_id": business_id})
        if r:
            return {"label": r["label"], "note": r.get("note", ""), "can": r.get("can", {}), "scopes": r.get("scopes", {})}
    return BUILTIN_ROLES["sales"]


@router.get("/team")
async def team(user: CurrentUser):
    f = biz_filter(user)
    bid = f["business_id"]
    users = []
    async for u in db.users.find({"business_id": bid}).sort("created_at", 1):
        base = await resolve_role(bid, u.get("role", "owner"))
        users.append({"id": str(u["_id"]), "name": u.get("name", ""), "email": u["email"], "phone": u.get("phone", ""),
                      "role": u.get("role", "owner"), "role_label": base["label"], "shops": u.get("shops", []),
                      "restriction": one_restriction(u), "active": u.get("active", True), "is_you": str(u["_id"]) == str(user["_id"])})
    return {"users": users, "roles": await role_catalogue(bid), "abilities": [{"key": k, "label": l} for k, l in ABILITIES],
            "scope_keys": [{"key": k, "label": l} for k, l in SCOPE_KEYS]}


@router.post("/team", status_code=201)
async def invite(data: InviteIn, user: CurrentUser):
    f = biz_filter(user)
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Someone already uses that email")
    await ensure_limit(user, "users", await db.users.count_documents({"business_id": f["business_id"]}))
    base = await resolve_role(f["business_id"], data.role)
    res = await db.users.insert_one({"name": data.name, "email": email, "phone": data.phone, "password_hash": hash_password(data.password),
                                     "business_id": f["business_id"], "role": data.role, "shops": data.shops, "can": base["can"],
                                     "scopes": base["scopes"], "active": True, "created_at": now()})
    await log_activity(f["business_id"], user, "user", f"{data.name} invited", base["label"])
    return {"id": str(res.inserted_id), "name": data.name, "email": email, "role": data.role}


@router.get("/team/{uid}")
async def get_member(uid: str, user: CurrentUser):
    f = biz_filter(user)
    u = await db.users.find_one({"_id": oid(uid), "business_id": f["business_id"]})
    if not u:
        raise HTTPException(404, "User not found")
    base = await resolve_role(f["business_id"], u.get("role", "owner"))
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    return {"id": uid, "name": u.get("name", ""), "email": u["email"], "role": u.get("role", "owner"), "role_label": base["label"],
            "shops": u.get("shops", []), "can": {**base["can"], **(u.get("can") or {})}, "scopes": {**base["scopes"], **(u.get("scopes") or {})},
            "active": u.get("active", True), "all_shops": [s["name"] for s in (biz.get("shops") or [])],
            "abilities": [{"key": k, "label": l} for k, l in ABILITIES], "scope_keys": [{"key": k, "label": l} for k, l in SCOPE_KEYS],
            "roles": await role_catalogue(f["business_id"])}


@router.put("/team/{uid}")
async def update_member(uid: str, data: PermissionsIn, user: CurrentUser):
    f = biz_filter(user)
    base = await resolve_role(f["business_id"], data.role)
    r = await db.users.update_one({"_id": oid(uid), "business_id": f["business_id"]},
                                  {"$set": {"role": data.role, "shops": data.shops,
                                            "can": {**base["can"], **data.can}, "scopes": {**base["scopes"], **data.scopes}}})
    if not r.matched_count:
        raise HTTPException(404, "User not found")
    await log_activity(f["business_id"], user, "user", "Permissions changed", base["label"], 0, uid)
    return await get_member(uid, user)


@router.get("/roles")
async def roles(user: CurrentUser):
    f = biz_filter(user)
    return {"roles": await role_catalogue(f["business_id"]), "abilities": [{"key": k, "label": l} for k, l in ABILITIES],
            "scope_keys": [{"key": k, "label": l} for k, l in SCOPE_KEYS]}


@router.post("/roles", status_code=201)
async def create_role(data: RoleIn, user: CurrentUser):
    f = biz_filter(user)
    await ensure_feature(user, "custom_roles")
    base = await resolve_role(f["business_id"], data.start_from)
    can = {**base["can"], **data.can}
    scopes = {**base["scopes"], **data.scopes}
    res = await db.roles.insert_one({**f, "label": data.label, "note": data.note or f"Based on {base['label']}",
                                     "can": can, "scopes": scopes, "created_by": user.get("name", ""), "created_at": now()})
    rid = str(res.inserted_id)
    for uid in data.assign_to:
        if ObjectId.is_valid(uid):
            await db.users.update_one({"_id": ObjectId(uid), "business_id": f["business_id"]},
                                      {"$set": {"role": rid, "can": can, "scopes": scopes}})
    await log_activity(f["business_id"], user, "role", f"Role {data.label} created")
    return {"id": rid, "label": data.label, "can": can, "scopes": scopes, "assigned": len(data.assign_to)}


@router.get("/reps")
async def reps(user: CurrentUser, period: str = "month"):
    """The Reps page: who is on the team, how to reach them, and how they are
    selling — amount sold and how often, not just a permission list."""
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    a, b, label = period_range(period)
    rows = []
    async for u in db.users.find({"business_id": bf["business_id"]}).sort("created_at", 1):
        name = u.get("name", "")
        base = await resolve_role(bf["business_id"], u.get("role", "owner"))
        sold, count, last = 0.0, 0, None
        unpaid, owed = 0, 0.0
        async for inv in db.invoices.find(date_query({**f, **rep_clause(name), "status": LIVE_SALE}, a, b)):
            sold += inv["totals"]["total"]
            count += 1
            ts = inv["created_at"]
            last = ts if not last or ts > last else last
        async for s in db.sales.find(date_query({**f, **rep_clause(name), **LIVE_QUICK}, a, b)):
            sold += s["totals"]["total"]
            count += 1
            ts = s["created_at"]
            last = ts if not last or ts > last else last
        async for inv in db.invoices.find({**f, **rep_clause(name), "status": LIVE_SALE}):
            st = invoice_status(inv, await invoice_paid(bf["business_id"], str(inv["_id"])))
            if st["due"] > 0:
                unpaid += 1
                owed += st["due"]
        days = max(1, ((b - a).days if a else 30))
        rows.append({"id": str(u["_id"]), "name": name, "email": u.get("email", ""), "phone": u.get("phone", ""),
                     "role": u.get("role", "owner"), "role_label": base["label"], "shops": u.get("shops", []),
                     "active": u.get("active", True), "is_you": str(u["_id"]) == str(user["_id"]),
                     "sold": round(sold, 2), "count": count, "frequency": round(count / days * 7, 1),
                     "average": round(sold / count, 2) if count else 0, "unpaid": unpaid, "owed": round(owed, 2),
                     "last_sale": last.isoformat() if last else None})
    rows.sort(key=lambda r: -r["sold"])
    return {"label": label, "period": period, "rows": rows, "total": round(sum(r["sold"] for r in rows), 2),
            "best": rows[0]["name"] if rows and rows[0]["sold"] else ""}


@router.get("/reps/{uid}/transactions")
async def rep_transactions(uid: str, user: CurrentUser, period: str = "month"):
    """One rep's own transactions, each badged Paid, Part paid or Unpaid."""
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    u = await db.users.find_one({"_id": oid(uid), "business_id": bf["business_id"]})
    if not u:
        raise HTTPException(404, "User not found")
    name = u.get("name", "")
    a, b, label = period_range(period)
    rows = []
    async for inv in db.invoices.find(date_query({**f, **rep_clause(name), "status": LIVE_SALE}, a, b)).sort("created_at", -1):
        st = invoice_status(inv, await invoice_paid(bf["business_id"], str(inv["_id"])))
        cust = await db.customers.find_one({"_id": ObjectId(inv["customer_id"])}) if ObjectId.is_valid(inv.get("customer_id") or "") else None
        rows.append({"id": str(inv["_id"]), "kind": "invoice", "number": inv.get("number", ""),
                     "customer": (cust or {}).get("name", "Cash sale"), "amount": inv["totals"]["total"],
                     "due": st["due"], "status": st["status"], "shop": inv.get("shop", ""),
                     "date": inv["created_at"].isoformat(), "route": f"/invoices/{str(inv['_id'])}"})
    async for s in db.sales.find(date_query({**f, **rep_clause(name), **LIVE_QUICK}, a, b)).sort("created_at", -1):
        cust = await db.customers.find_one({"_id": ObjectId(s["customer_id"])}) if ObjectId.is_valid(s.get("customer_id") or "") else None
        rows.append({"id": str(s["_id"]), "kind": "sale", "number": s.get("number", ""),
                     "customer": (cust or {}).get("name", "Cash sale"), "amount": s["totals"]["total"],
                     "due": 0 if s.get("method") != "credit" else s["totals"]["total"],
                     "status": "pending" if s.get("method") == "credit" else "paid", "shop": s.get("shop", ""),
                     "date": s["created_at"].isoformat(), "route": f"/sales/{str(s['_id'])}"})
    expenses = []
    async for e in db.expenses.find(date_query({**f, **rep_clause(name)}, a, b)).sort("created_at", -1):
        expenses.append({"id": str(e["_id"]), "title": e.get("note") or e["category"], "category": e["category"],
                         "amount": e["amount"], "date": e["created_at"].isoformat(), "shop": e.get("shop", "")})
    rows.sort(key=lambda r: r["date"], reverse=True)
    sold = round(sum(r["amount"] for r in rows), 2)
    return {"rep": {"id": uid, "name": name, "email": u.get("email", ""), "phone": u.get("phone", ""),
                    "role": u.get("role", "owner"), "shops": u.get("shops", [])},
            "label": label, "period": period, "rows": rows, "expenses": expenses,
            "sold": sold, "count": len(rows), "average": round(sold / len(rows), 2) if rows else 0,
            "unpaid": round(sum(r["due"] for r in rows), 2),
            "expense_total": round(sum(e["amount"] for e in expenses), 2)}


@router.get("/team/{uid}/preview")
async def preview_member(uid: str, user: CurrentUser):
    """12.5 — what this user can and cannot see, in numbers."""
    f = biz_filter(user)
    u = await db.users.find_one({"_id": oid(uid), "business_id": f["business_id"]})
    if not u:
        raise HTTPException(404, "User not found")
    base = await resolve_role(f["business_id"], u.get("role", "owner"))
    can = {**base["can"], **(u.get("can") or {})}
    scopes = {**base["scopes"], **(u.get("scopes") or {})}
    shops = u.get("shops", [])
    a, b, label = period_range("month")
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    all_shops = [s["name"] for s in (biz.get("shops") or [])]

    own_inv = hidden_inv = 0
    own_sales = hidden_sales = 0.0
    async for inv in db.invoices.find({**f, "status": LIVE_SALE}):
        mine = inv.get("created_by") == u.get("name")
        in_shop = (not shops) or (inv.get("shop") in shops)
        visible = scopes.get("sales") == "all" or (scopes.get("sales") == "shop" and in_shop) or (scopes.get("sales") == "own" and mine)
        if visible:
            own_inv += 1
            own_sales += inv["totals"]["total"]
        else:
            hidden_inv += 1
            hidden_sales += inv["totals"]["total"]
    cust_total = await db.customers.count_documents(f)
    return {"name": u.get("name", ""), "role_label": base["label"], "label": label, "shops": shops,
            "sees": [{"title": f"{own_inv} invoices", "sub": "The ones they raised" if scopes.get("sales") == "own" else "All invoices in their shops", "scope": scopes.get("sales", "own")},
                     {"title": f"{cust_total} customers", "sub": ("Everyone at " + ", ".join(shops)) if shops else "Everyone", "scope": scopes.get("customers", "shop")},
                     {"title": "Their own sales totals", "sub": f"{round(own_sales, 2)} {label}", "scope": scopes.get("reports", "own")}],
            "hidden": ([{"title": f"{hidden_inv} invoices from other staff", "sub": f"{round(hidden_sales, 2)} of company sales"}] if hidden_inv else [])
                      + ([] if can.get("see_profit") else [{"title": "Cost prices and profit", "sub": ""}])
                      + ([] if can.get("reports") else [{"title": "Purchases, expenses, suppliers", "sub": ""}])
                      + ([{"title": ", ".join([s for s in all_shops if s not in shops]), "sub": "Other shops"}] if shops and len(all_shops) > len(shops) else [])}


@router.get("/team/{uid}/handover")
async def handover_preview(uid: str, user: CurrentUser):
    """12.6 — what still belongs to this rep."""
    f = biz_filter(user)
    u = await db.users.find_one({"_id": oid(uid), "business_id": f["business_id"]})
    if not u:
        raise HTTPException(404, "User not found")
    name = u.get("name", "")
    unpaid, owed = 0, 0.0
    async for inv in db.invoices.find({**f, "created_by": name, "status": LIVE_SALE}):
        st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
        if st["due"] > 0:
            unpaid += 1
            owed += st["due"]
    customers = await db.customers.count_documents({**f, "created_by": name})
    with_balance = 0
    async for c in db.customers.find({**f, "created_by": name}):
        if (c.get("opening_balance") or 0) > 0:
            with_balance += 1
    quotes = await db.invoices.count_documents({**f, "created_by": name, "status": "quote"})
    others = []
    async for o in db.users.find({"business_id": f["business_id"], "_id": {"$ne": u["_id"]}, "active": {"$ne": False}}):
        base = await resolve_role(f["business_id"], o.get("role", "owner"))
        others.append({"id": str(o["_id"]), "name": o.get("name", ""), "role_label": base["label"], "shops": o.get("shops", [])})
    return {"name": name, "open_records": unpaid + customers + quotes,
            "rows": [{"title": "Unpaid invoices", "sub": f"{round(owed, 2)} still owed", "count": unpaid},
                     {"title": "Customers they created", "sub": f"{customers} total, {with_balance} with a balance", "count": customers},
                     {"title": "Open quotations", "sub": "", "count": quotes}],
            "candidates": others}


@router.post("/team/{uid}/handover")
async def handover(uid: str, data: HandoverIn, user: CurrentUser):
    f = biz_filter(user)
    u = await db.users.find_one({"_id": oid(uid), "business_id": f["business_id"]})
    if not u:
        raise HTTPException(404, "User not found")
    if str(u["_id"]) == str(user["_id"]):
        raise HTTPException(400, "You cannot remove yourself")
    await db.users.update_one({"_id": u["_id"]}, {"$set": {"active": False, "deactivated_at": now()}})
    moved = 0
    if not data.deactivate_only and data.to_user_id:
        to = await db.users.find_one({"_id": oid(data.to_user_id), "business_id": f["business_id"]})
        if not to:
            raise HTTPException(404, "Pick who takes over")
        for coll in (db.invoices, db.customers, db.quotes):
            r = await coll.update_many({**f, "created_by": u.get("name", "")}, {"$set": {"owner_name": to.get("name", "")}})
            moved += r.modified_count
        await log_activity(f["business_id"], user, "user", f"{u.get('name')} handed over to {to.get('name')}", f"{moved} records", 0, uid,
                           reason="Rep left")
    else:
        await log_activity(f["business_id"], user, "user", f"{u.get('name')} deactivated", "", 0, uid)
    return {"ok": True, "moved": moved}


# ---------------------------------------------------------------- 12.3 app lock
@router.get("/settings/lock")
async def get_lock(user: CurrentUser):
    s = await db.locks.find_one({"user_id": str(user["_id"])})
    return {"enabled": bool(s and s.get("enabled")), "idle_minutes": (s or {}).get("idle_minutes", 2),
            "biometrics": (s or {}).get("biometrics", True), "has_pin": bool(s and s.get("pin_hash"))}


@router.put("/settings/lock")
async def set_lock(data: LockIn, user: CurrentUser):
    doc = {"user_id": str(user["_id"]), "enabled": data.enabled, "idle_minutes": data.idle_minutes, "biometrics": data.biometrics}
    if data.pin:
        if not data.pin.isdigit() or len(data.pin) < 4:
            raise HTTPException(400, "Use at least 4 digits")
        doc["pin_hash"] = hash_password(data.pin)
    await db.locks.update_one({"user_id": str(user["_id"])}, {"$set": doc}, upsert=True)
    return await get_lock(user)


@router.post("/settings/lock/verify")
async def verify_lock(body: dict, user: CurrentUser):
    from deps import verify_password
    s = await db.locks.find_one({"user_id": str(user["_id"])})
    if not s or not s.get("pin_hash"):
        raise HTTPException(400, "No PIN set")
    if not verify_password(str(body.get("pin", "")), s["pin_hash"]):
        raise HTTPException(401, "Wrong PIN")
    return {"ok": True}
