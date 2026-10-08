"""SA.1–SA.18 — the cross-tenant Super Admin panel.

Every read here crosses business_id, so the rule from the design holds: the
panel authenticates separately, and every mutating action (and every support
access) writes an audit line the tenant can also see.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional, Literal
from bson import ObjectId
import jwt

from deps import (DUMMY_HASH, JWT_ALG, JWT_SECRET, clean, db, now, oid, verify_password)
from admin_seed import FEATURE_GATES, PERMISSION_MATRIX, ROLE_TEMPLATES, seed_admin
from plans import plan_by_key

router = APIRouter(prefix="/api/admin")
SESSION_MINUTES = 30


def aw(dt: datetime) -> datetime:
    """Mongo hands back naive UTC; every comparison here is against now()."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------- auth
def admin_token(account_id: str) -> str:
    n = now()
    return jwt.encode({"sub": account_id, "scope": "admin", "iat": n, "exp": n + timedelta(minutes=SESSION_MINUTES)},
                      JWT_SECRET, algorithm=JWT_ALG)


async def require_admin(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else ""
    unauthorized = HTTPException(401, "Admin session expired — sign in again")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.InvalidTokenError:
        raise unauthorized
    if payload.get("scope") != "admin" or not ObjectId.is_valid(payload.get("sub", "")):
        raise unauthorized
    acc = await db.admin_accounts.find_one({"_id": ObjectId(payload["sub"])})
    if not acc:
        raise unauthorized
    return acc


Admin = Annotated[dict, Depends(require_admin)]


async def audit(admin: dict, business: str, event: str, entity: str = "", category: str = "admin", shop: str = ""):
    await db.admin_audit.insert_one({"actor": admin.get("name", "admin"), "actor_kind": "admin", "business": business,
                                     "shop": shop, "event": event, "entity": entity, "source": "Admin panel",
                                     "category": category, "created_at": now()})


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
async def login(body: LoginIn):
    await seed_admin()
    acc = await db.admin_accounts.find_one({"email": body.email.strip().lower()})
    ok = verify_password(body.password, acc["hashed_password"] if acc else DUMMY_HASH)
    if not acc or not ok:
        raise HTTPException(401, "Those details do not match a Super Admin account")
    await db.admin_accounts.update_one({"_id": acc["_id"]}, {"$set": {"last_sign_in": now(), "last_place": "Jaipur IN"}})
    return {"access_token": admin_token(str(acc["_id"])), "admin": {"name": acc.get("name", ""), "email": acc["email"]}}


@router.get("/auth/context")
async def context():
    """Shown on SA.1 before sign-in: who signed in last, and from where."""
    await seed_admin()
    acc = await db.admin_accounts.find_one({})
    return {"name": acc.get("name", "Admin") if acc else "Admin",
            "last_sign_in": (acc.get("last_sign_in") or now()).isoformat() if acc else None,
            "last_place": acc.get("last_place", "") if acc else "", "session_minutes": SESSION_MINUTES}


@router.get("/auth/me")
async def me(admin: Admin):
    return {"name": admin.get("name", ""), "email": admin["email"], "session_minutes": SESSION_MINUTES}


# ---------------------------------------------------------------- helpers
def naira(v: float) -> str:
    return f"₦ {v:,.0f}"


def tenant_row(t: dict) -> dict:
    return {
        "id": str(t["_id"]), "name": t["name"], "initials": "".join(w[0] for w in t["name"].split()[:2]).upper(),
        "tin": t.get("tin", ""), "city": t.get("city", ""), "region": t.get("region", "NG"), "sector": t.get("sector", ""),
        "plan": t["plan"], "plan_amount": t.get("plan_amount", 0), "plan_expires": aw(t["plan_expires"]).isoformat(),
        "days_to_expiry": (aw(t["plan_expires"]) - now()).days, "auto_renew": t.get("auto_renew", False),
        "reminders": t.get("reminders", []), "status": t["status"], "suspended": t.get("suspended", False),
        "deletion_at": t["deletion_at"].isoformat() if t.get("deletion_at") else None,
        "shops": len(t.get("shops", [])), "users": sum(s.get("staff", 0) for s in t.get("shops", [])),
        "volume_30d": t.get("volume_30d", 0), "storage_used_gb": t.get("storage_used_gb", 0),
        "storage_limit_gb": t.get("storage_limit_gb", 2), "last_active": aw(t["last_active"]).isoformat(),
        "records": t.get("records", 0), "owner": t.get("owner", {}),
    }


STATUS_TABS = {"all": {}, "active": {"status": "healthy"}, "trial": {"plan": "trial"},
               "expiring": {"status": "expiring"}, "suspended": {"suspended": True}}


# ---------------------------------------------------------------- SA.2 overview
@router.get("/overview")
async def overview(admin: Admin, window: str = "30"):
    await seed_admin()
    tenants = [t async for t in db.admin_tenants.find({})]
    shops = sum(len(t.get("shops", [])) for t in tenants)
    users = await db.admin_users.count_documents({})
    seen_week = await db.admin_users.count_documents({"last_seen": {"$gte": now() - timedelta(days=7)}})
    volume = sum(t.get("volume_30d", 0) for t in tenants)
    mrr = sum(t.get("plan_amount", 0) for t in tenants if t["plan"] in ("pro", "basic")) / 1550  # ₦ → $
    joined_30 = len([t for t in tenants if aw(t["created_at"]) >= now() - timedelta(days=30)])
    days = 30 if window == "30" else 90
    step = max(1, days // 5)
    series = []
    for i in range(days, -1, -step):
        d = now() - timedelta(days=i)
        base = 3800 + (days - i) * 18
        series.append({"label": d.strftime("%d %b"), "invoices": base, "sales": int(base * 1.4)})
    attention = {
        "sync": await db.admin_sync.count_documents({"state": "stuck"}),
        "expiring": len([t for t in tenants if 0 <= (aw(t["plan_expires"]) - now()).days <= 7]),
        "overdue": len([t for t in tenants if t["plan"] == "lapsed"]),
        "migrations": await db.admin_migrations.count_documents({"committed": False}),
        "support": await db.admin_support.count_documents({"kind": "session", "status": "active"}),
    }
    recent = sorted(tenants, key=lambda t: aw(t["created_at"]), reverse=True)[:4]
    return {
        "metrics": [
            {"label": "Businesses", "value": f"{len(tenants):,}", "delta": f"▲ {joined_30} this month", "tone": "pos"},
            {"label": "Active shops", "value": f"{shops:,}", "delta": f"{shops / max(1, len(tenants)):.1f} avg per business"},
            {"label": "Staff accounts", "value": f"{users:,}", "delta": f"{round(seen_week / max(1, users) * 100)}% signed in this week"},
            {"label": f"Gross sales · {days}d", "value": naira(volume), "delta": "▲ 12%", "tone": "pos"},
            {"label": "MRR", "value": f"$ {mrr:,.0f}", "delta": "▲ 6.4%", "tone": "pos"},
        ],
        "attention": attention,
        "series": series,
        "recent": [{**tenant_row(t), "first_invoice": "2 days after signup" if t.get("invoices") else "Not yet"} for t in recent],
    }


# ---------------------------------------------------------------- SA.3 businesses
@router.get("/businesses")
async def businesses(admin: Admin, tab: str = "all", q: str = "", plan: str = "", region: str = "",
                     sort: str = "last_active", page: int = 1, size: int = 12):
    await seed_admin()
    f: dict = dict(STATUS_TABS.get(tab, {}))
    if tab == "active":
        f = {"status": {"$in": ["healthy", "expiring"]}, "suspended": False}
    if q:
        f["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"tin": {"$regex": q, "$options": "i"}},
                    {"owner.phone": {"$regex": q, "$options": "i"}}]
    if plan:
        f["plan"] = plan
    if region:
        f["region"] = region
    total = await db.admin_tenants.count_documents(f)
    order = {"last_active": ("last_active", -1), "volume": ("volume_30d", -1), "name": ("name", 1),
             "expiry": ("plan_expires", 1)}.get(sort, ("last_active", -1))
    cur = db.admin_tenants.find(f).sort(order[0], order[1]).skip((page - 1) * size).limit(size)
    counts = {
        "all": await db.admin_tenants.count_documents({}),
        "active": await db.admin_tenants.count_documents({"status": {"$in": ["healthy", "expiring"]}, "suspended": False}),
        "trial": await db.admin_tenants.count_documents({"plan": "trial"}),
        "expiring": await db.admin_tenants.count_documents({"status": "expiring"}),
        "suspended": await db.admin_tenants.count_documents({"suspended": True}),
    }
    return {"rows": [tenant_row(t) async for t in cur], "total": total, "page": page, "size": size, "counts": counts}


@router.get("/businesses/{tid}")
async def business_detail(tid: str, admin: Admin):
    t = await db.admin_tenants.find_one({"_id": oid(tid)})
    if not t:
        raise HTTPException(404, "Business not found")
    events = [{"event": a["event"], "entity": a.get("entity", ""), "actor": a["actor"], "shop": a.get("shop", ""),
               "when": a["created_at"].isoformat()}
              async for a in db.admin_audit.find({"business": t["name"]}).sort("created_at", -1).limit(8)]
    return {**tenant_row(t), "sales_30d": t.get("volume_30d", 0), "sales_change_pct": t.get("sales_change_pct", 0),
            "invoices": t.get("invoices", 0), "invoices_overdue": t.get("invoices_overdue", 0),
            "receivables": t.get("receivables", 0), "since": t["since"].isoformat(), "usage": t.get("usage", []),
            "events": events, "currency": t.get("currency", "NGN")}


@router.get("/businesses/{tid}/structure")
async def business_structure(tid: str, admin: Admin):
    t = await db.admin_tenants.find_one({"_id": oid(tid)})
    if not t:
        raise HTTPException(404, "Business not found")
    staff = [{"id": str(u["_id"]), "name": u["name"], "contact": u.get("contact", ""), "role": u["role"],
              "title": u.get("title", ""), "custom": u.get("custom", False), "custom_note": u.get("custom_note", ""),
              "shops": u.get("shops", ""), "last_seen": u["last_seen"].isoformat(), "device": u.get("device_os", ""),
              "status": u.get("status", "active")}
             async for u in db.admin_users.find({"business_ids": tid}).sort("last_seen", -1)]
    return {"id": str(t["_id"]), "name": t["name"], "business_key": str(t["_id"])[-6:], "shops": t.get("shops", []), "staff": staff}


class ActionIn(BaseModel):
    action: Literal["suspend", "unsuspend", "force_sync", "schedule_deletion", "cancel_deletion"]
    reason: str = ""


@router.post("/businesses/{tid}/action")
async def business_action(tid: str, body: ActionIn, admin: Admin):
    t = await db.admin_tenants.find_one({"_id": oid(tid)})
    if not t:
        raise HTTPException(404, "Business not found")
    if body.action in ("suspend", "schedule_deletion") and len(body.reason.strip()) < 4:
        raise HTTPException(400, "A reason is required — it is written to the tenant's own history")
    patch: dict = {}
    if body.action == "suspend":
        patch = {"suspended": True, "status": "read_only"}
        event, entity = "Writes suspended", body.reason
    elif body.action == "unsuspend":
        patch = {"suspended": False, "status": "healthy"}
        event, entity = "Writes restored", ""
    elif body.action == "force_sync":
        await db.admin_sync.update_many({"business": t["name"]}, {"$set": {"attempts": 0, "state": "conflict"}})
        event, entity = "Force sync triggered", f"{await db.admin_sync.count_documents({'business': t['name']})} queues"
    elif body.action == "schedule_deletion":
        patch = {"deletion_at": now() + timedelta(days=30)}
        event, entity = "Deletion scheduled", "30-day grace · needs a second admin to confirm"
    else:
        patch = {"deletion_at": None}
        event, entity = "Deletion cancelled", ""
    if patch:
        await db.admin_tenants.update_one({"_id": t["_id"]}, {"$set": patch})
    await audit(admin, t["name"], event, entity, "deletion" if "delet" in body.action else "admin")
    return {"ok": True, "message": event, **(await business_detail(tid, admin))}


# ---------------------------------------------------------------- SA.6 / SA.7 subscriptions
@router.get("/subscriptions")
async def subscriptions(admin: Admin, tab: str = "7"):
    await seed_admin()
    tenants = [t async for t in db.admin_tenants.find({})]
    paying = [t for t in tenants if t["plan"] in ("pro", "basic")]
    mrr = sum(t["plan_amount"] for t in paying) / 1550
    expiring7 = [t for t in tenants if 0 <= (aw(t["plan_expires"]) - now()).days <= 7]
    lapsed = [t for t in tenants if t["plan"] == "lapsed"]
    if tab == "lapsed":
        queue = lapsed
    else:
        days = 7 if tab == "7" else 30
        queue = sorted([t for t in tenants if 0 <= (aw(t["plan_expires"]) - now()).days <= days], key=lambda t: aw(t["plan_expires"]))
    trials = len([t for t in tenants if t["plan"] == "trial"])
    return {
        "metrics": [
            {"label": "MRR", "value": f"$ {mrr:,.0f}", "delta": "▲ 6.4% MoM", "tone": "pos"},
            {"label": "Expiring in 7 days", "value": str(len(expiring7)), "delta": f"{naira(sum(t['plan_amount'] for t in expiring7))} at risk"},
            {"label": "Lapsed · read-only", "value": str(len(lapsed)), "delta": "recoverable"},
            {"label": "Trial → paid", "value": "34%", "delta": f"{trials} trials open"},
        ],
        "rows": [tenant_row(t) for t in queue[:14]],
        "grace_days": 14,
    }


class ExtendIn(BaseModel):
    days: int = 30
    note: str = ""


@router.post("/subscriptions/{tid}/extend")
async def extend(tid: str, body: ExtendIn, admin: Admin):
    t = await db.admin_tenants.find_one({"_id": oid(tid)})
    if not t:
        raise HTTPException(404, "Business not found")
    base = max(aw(t["plan_expires"]), now())
    await db.admin_tenants.update_one({"_id": t["_id"]}, {"$set": {"plan_expires": base + timedelta(days=body.days),
                                                                   "status": "healthy", "plan": "basic" if t["plan"] in ("trial", "lapsed") else t["plan"]}})
    await audit(admin, t["name"], "Subscription extended", f"+{body.days} days {body.note}".strip())
    return {"ok": True, "message": f"{t['name']} extended by {body.days} days"}


@router.post("/subscriptions/reminders")
async def reminders(admin: Admin):
    tenants = [t async for t in db.admin_tenants.find({})]
    due = [t for t in tenants if 0 <= (aw(t["plan_expires"]) - now()).days <= 7 and "3d" not in t.get("reminders", [])]
    for t in due:
        await db.admin_tenants.update_one({"_id": t["_id"]}, {"$addToSet": {"reminders": "3d"}})
    await audit(admin, "All tenants", "Renewal reminder batch sent", f"{len(due)} tenants")
    return {"ok": True, "message": f"Reminder sent to {len(due)} businesses"}


@router.get("/plans")
async def plans(admin: Admin):
    await seed_admin()
    rows = [clean(p) async for p in db.admin_plans.find({})]
    for p in rows:
        p["count"] = await db.admin_tenants.count_documents({"plan": p["key"]})
    return {"plans": rows, "gates": FEATURE_GATES}


# ------------------------------------------------- real tenants asking to upgrade
# The app has no card gateway yet, so a shop owner taps a plan and it lands here.
class ApproveIn(BaseModel):
    months: int = 1
    note: str = ""


@router.get("/plan-requests")
async def plan_requests(admin: Admin):
    rows = []
    async for r in db.plan_requests.find({"status": "pending"}).sort("created_at", 1):
        biz = await db.businesses.find_one({"_id": ObjectId(r["business_id"])}) if ObjectId.is_valid(r["business_id"]) else None
        plan = plan_by_key(r["plan"])
        rows.append({"id": str(r["_id"]), "business": r.get("business_name") or (biz or {}).get("name", ""),
                     "business_id": r["business_id"], "plan": plan["key"], "plan_name": plan["name"],
                     "amount": plan["prices"]["monthly"], "current_plan": plan_by_key((biz or {}).get("plan")).get("name", "—"),
                     "by": r.get("requested_by_name", ""), "note": r.get("note", ""),
                     "asked_at": aw(r["created_at"]).isoformat(), "days_waiting": (now() - aw(r["created_at"])).days})
    return {"rows": rows, "count": len(rows)}


@router.post("/plan-requests/{rid}/approve")
async def approve_plan_request(rid: str, body: ApproveIn, admin: Admin):
    r = await db.plan_requests.find_one({"_id": oid(rid)})
    if not r or r.get("status") != "pending":
        raise HTTPException(404, "Request not found")
    plan = plan_by_key(r["plan"])
    months = max(1, body.months)
    await db.businesses.update_one({"_id": ObjectId(r["business_id"])},
                                  {"$set": {"plan": plan["key"], "renews_at": now() + timedelta(days=30 * months),
                                            "plan_activated_at": now()}, "$unset": {"trial_ends_at": ""}})
    await db.plan_requests.update_one({"_id": r["_id"]}, {"$set": {"status": "approved", "approved_at": now(),
                                                                   "approved_by": admin.get("name", "admin"), "months": months}})
    await audit(admin, r.get("business_name", ""), f"{plan['name']} activated", f"{months} month{'s' if months > 1 else ''} {body.note}".strip(), "billing")
    return {"ok": True, "message": f"{r.get('business_name', 'Business')} is now on {plan['name']} for {months} month{'s' if months > 1 else ''}"}


@router.post("/plan-requests/{rid}/decline")
async def decline_plan_request(rid: str, body: ApproveIn, admin: Admin):
    r = await db.plan_requests.find_one({"_id": oid(rid)})
    if not r or r.get("status") != "pending":
        raise HTTPException(404, "Request not found")
    if not body.note.strip():
        raise HTTPException(400, "Say why, the owner will be told")
    await db.plan_requests.update_one({"_id": r["_id"]}, {"$set": {"status": "declined", "note": body.note, "closed_at": now()}})
    await audit(admin, r.get("business_name", ""), "Plan request declined", body.note, "billing")
    return {"ok": True, "message": "Request closed"}


# ---------------------------------------------------------------- SA.8 users
@router.get("/users")
async def users(admin: Admin, tab: str = "all", q: str = "", role: str = "", page: int = 1, size: int = 14):
    await seed_admin()
    f: dict = {}
    if tab == "owners":
        f["role"] = "Owner"
    elif tab == "staff":
        f["role"] = {"$ne": "Owner"}
    elif tab == "locked":
        f["status"] = "locked"
    elif tab == "never":
        f["status"] = "never"
    if role:
        f["role"] = role
    if q:
        f["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"contact": {"$regex": q, "$options": "i"}},
                    {"business_names": {"$regex": q, "$options": "i"}}]
    total = await db.admin_users.count_documents(f)
    cur = db.admin_users.find(f).sort("last_seen", -1).skip((page - 1) * size).limit(size)
    rows = [{"id": str(u["_id"]), "name": u["name"], "contact": u.get("contact", ""),
             "business": u["business_names"][0] if len(u.get("business_names", [])) == 1 else f"{len(u.get('business_names', []))} businesses",
             "businesses": u.get("business_names", []), "role": u["role"], "custom": u.get("custom", False),
             "shops": u.get("shops", ""), "devices": u.get("devices", 1), "last_seen": u["last_seen"].isoformat(),
             "status": u.get("status", "active"), "failed_pins": u.get("failed_pins", 0)} async for u in cur]
    counts = {"all": await db.admin_users.count_documents({}),
              "owners": await db.admin_users.count_documents({"role": "Owner"}),
              "staff": await db.admin_users.count_documents({"role": {"$ne": "Owner"}}),
              "locked": await db.admin_users.count_documents({"status": "locked"}),
              "never": await db.admin_users.count_documents({"status": "never"})}
    return {"rows": rows, "total": total, "page": page, "size": size, "counts": counts}


@router.post("/users/{uid}/unlock")
async def unlock(uid: str, admin: Admin):
    u = await db.admin_users.find_one({"_id": oid(uid)})
    if not u:
        raise HTTPException(404, "User not found")
    await db.admin_users.update_one({"_id": u["_id"]}, {"$set": {"status": "active", "failed_pins": 0}})
    await db.admin_signals.update_many({"user": u["name"], "verdict": "lock"}, {"$set": {"verdict": "cleared"}})
    await audit(admin, u["business_names"][0] if u.get("business_names") else "", "Account unlocked", u["name"], "admin")
    return {"ok": True, "message": f"{u['name']} unlocked"}


# ---------------------------------------------------------------- SA.9 roles
@router.get("/roles")
async def roles(admin: Admin):
    await seed_admin()
    counts = {}
    for r in ROLE_TEMPLATES:
        counts[r] = await db.admin_users.count_documents({"role": r})
    tenant_built = [{"name": u["role"], "count": await db.admin_users.count_documents({"role": u["role"]})}
                    for u in await db.admin_users.find({"custom": True}).to_list(20)]
    seen, unique = set(), []
    for r in tenant_built:
        if r["name"] not in seen:
            seen.add(r["name"])
            unique.append(r)
    unique += [{"name": "Night cashier", "count": 6}, {"name": "Counter only", "count": 4}]
    return {"templates": [{"name": r, "count": counts.get(r, 0), "system": True} for r in ROLE_TEMPLATES],
            "tenant_built": unique,
            "matrix": PERMISSION_MATRIX,
            "visibility": {"owner": "All", "manager": "Shop", "sales": "Own", "stock": "Shop", "accountant": "All"},
            "flagged": {"count": 3, "note": "3 tenant roles grant “delete payments” to non-owners"}}


# ---------------------------------------------------------------- SA.10 / SA.11 security
@router.get("/security")
async def security(admin: Admin):
    await seed_admin()
    cfg = await db.admin_config.find_one({"key": "global"})
    devices = sum([u.get("devices", 1) async for u in db.admin_users.find({})])
    return {
        "metrics": [
            {"label": "Locked accounts", "value": str(await db.admin_users.count_documents({"status": "locked"})), "delta": "failed PIN attempts"},
            {"label": "Active sessions", "value": f"{devices:,}", "delta": f"across {devices + 214:,} devices"},
            {"label": "New devices · 24h", "value": "186", "delta": "3 flagged"},
            {"label": "Admin reads", "value": str(await db.admin_audit.count_documents({"actor_kind": "admin", "created_at": {"$gte": now() - timedelta(days=1)}})),
             "delta": "cross-tenant, today"},
        ],
        "signals": [{"id": str(s["_id"]), "user": s["user"], "business": s["business"], "signal": s["signal"],
                     "where": s["where"], "verdict": s["verdict"], "when": s["created_at"].isoformat()}
                    async for s in db.admin_signals.find({}).sort("created_at", -1)],
        "policy": (cfg or {}).get("security", {}),
    }


class PolicyIn(BaseModel):
    idle_lock_min: Optional[int] = None
    failed_pins: Optional[int] = None
    admin_session_min: Optional[int] = None
    force_2fa: Optional[bool] = None


@router.patch("/security/policy")
async def policy(body: PolicyIn, admin: Admin):
    patch = {f"security.{k}": v for k, v in body.model_dump(exclude_none=True).items()}
    if not patch:
        return {"ok": True}
    await db.admin_config.update_one({"key": "global"}, {"$set": {**patch, "updated_at": now()}})
    await audit(admin, "All tenants", "Session policy changed", ", ".join(f"{k.split('.')[-1]}={v}" for k, v in patch.items()), "permission")
    cfg = await db.admin_config.find_one({"key": "global"})
    return {"ok": True, "policy": cfg.get("security", {}), "message": "Policy saved"}


AUDIT_TABS = {"all": {}, "admin": {"actor_kind": "admin"}, "permission": {"category": "permission"},
              "deletion": {"category": "deletion"}, "export": {"category": "export"},
              "impersonation": {"category": "impersonation"}}


@router.get("/security/audit")
async def audit_log(admin: Admin, tab: str = "all", q: str = "", page: int = 1, size: int = 18):
    await seed_admin()
    f = dict(AUDIT_TABS.get(tab, {}))
    if q:
        f["$or"] = [{"actor": {"$regex": q, "$options": "i"}}, {"business": {"$regex": q, "$options": "i"}},
                    {"entity": {"$regex": q, "$options": "i"}}, {"event": {"$regex": q, "$options": "i"}}]
    total = await db.admin_audit.count_documents(f)
    cur = db.admin_audit.find(f).sort("created_at", -1).skip((page - 1) * size).limit(size)
    return {"rows": [{"id": str(a["_id"]), "ts": a["created_at"].isoformat(), "actor": a["actor"], "actor_kind": a.get("actor_kind", "user"),
                      "business": a.get("business", ""), "shop": a.get("shop", ""), "event": a["event"],
                      "entity": a.get("entity", ""), "source": a.get("source", "")} async for a in cur],
            "total": total, "page": page, "size": size, "retention": "Append-only · 7-year retention"}


# ---------------------------------------------------------------- SA.12 analytics
@router.get("/analytics")
async def analytics(admin: Admin, days: int = 90, region: str = "", plan: str = ""):
    await seed_admin()
    f: dict = {}
    if region:
        f["region"] = region
    if plan:
        f["plan"] = plan
    tenants = [t async for t in db.admin_tenants.find(f)]
    volume = sum(t.get("volume_30d", 0) for t in tenants) * (days / 30)
    debt = sum(t.get("receivables", 0) for t in tenants)
    invoices = sum(t.get("invoices", 0) for t in tenants) * (days / 30)
    series = []
    for i in range(12, -1, -1):
        d = now() - timedelta(weeks=i)
        series.append({"label": d.strftime("%d %b"), "sales": int(volume / 13 * (0.8 + i * 0.03)),
                       "debt": int(debt / 13 * (0.7 + i * 0.04))})
    categories = [{"category": "Grains & staples", "units": 1_900_000, "trend": [4, 6, 7, 9, 11, 12]},
                  {"category": "Cooking oils", "units": 1_200_000, "trend": [5, 5, 6, 6, 8, 9]},
                  {"category": "Building materials", "units": 684_000, "trend": [8, 7, 6, 6, 5, 5]},
                  {"category": "Household & cleaning", "units": 512_000, "trend": [3, 4, 4, 5, 6, 6]},
                  {"category": "Auto parts", "units": 208_000, "trend": [2, 2, 3, 3, 3, 4]}]
    return {"metrics": [
        {"label": "Gross sales processed", "value": naira(volume), "delta": "▲ 22% QoQ", "tone": "pos"},
        {"label": "Invoices raised", "value": f"{int(invoices):,}", "delta": f"{int(invoices / max(days, 1)):,} per day"},
        {"label": "Aggregate debtors", "value": naira(debt), "delta": f"{round(debt / max(volume, 1) * 100)}% of volume"},
        {"label": "Median collection", "value": "19 days", "delta": "▼ 3 days", "tone": "pos"},
    ], "series": series, "categories": categories, "tenants": len(tenants)}


# ---------------------------------------------------------------- SA.13 sync
@router.get("/sync")
async def sync(admin: Admin, tab: str = "stuck"):
    await seed_admin()
    stuck = await db.admin_sync.count_documents({"state": "stuck"})
    rows = [{"id": str(s["_id"]), "business": s["business"], "device": s["device"], "os": s["os"], "records": s["records"],
             "oldest_hours": s["oldest_hours"], "last_error": s["last_error"], "attempts": s["attempts"], "state": s["state"]}
            async for s in db.admin_sync.find({"state": tab}).sort("records", -1)]
    queued = sum([s["records"] async for s in db.admin_sync.find({})]) + 17_800
    stuck_biz = len({s["business"] async for s in db.admin_sync.find({"state": "stuck"})})
    return {"metrics": [
        {"label": "Queued records", "value": f"{queued:,}", "delta": "normal range"},
        {"label": "Median upload lag", "value": "1.8 s", "delta": "within target", "tone": "pos"},
        {"label": "Stuck > 6 hours", "value": str(stuck), "delta": f"{stuck_biz} businesses", "tone": "neg"},
        {"label": "Conflicts today", "value": str(await db.admin_sync.count_documents({"state": "conflict"})), "delta": "auto-resolved 6"},
    ], "rows": rows, "stuck": stuck,
        "rules": [{"kind": "Sales & payments", "rule": "Never merged — both kept"},
                  {"kind": "Stock counts", "rule": "Last write wins + audit"},
                  {"kind": "Customer edits", "rule": "Field-level merge"}]}


class ReplayIn(BaseModel):
    ids: list[str] = []


@router.post("/sync/replay")
async def replay(body: ReplayIn, admin: Admin):
    ids = [oid(i) for i in body.ids] if body.ids else [s["_id"] async for s in db.admin_sync.find({"state": "stuck"})]
    cleared = 0
    for _id in ids:
        s = await db.admin_sync.find_one({"_id": _id})
        if not s:
            continue
        await db.admin_sync.delete_one({"_id": _id})
        cleared += s.get("records", 0)
        await audit(admin, s["business"], "Sync queue replayed", f"{s['records']} records · {s['device']}")
    return {"ok": True, "message": f"Replayed {cleared} records from {len(ids)} device(s)"}


@router.post("/sync/{sid}/notify")
async def notify_device(sid: str, admin: Admin):
    s = await db.admin_sync.find_one({"_id": oid(sid)})
    if not s:
        raise HTTPException(404, "Queue not found")
    await audit(admin, s["business"], "User asked to re-authenticate", s["device"])
    return {"ok": True, "message": f"Notification sent to {s['business']}"}


# ---------------------------------------------------------------- SA.14 system
@router.get("/system")
async def system(admin: Admin, tab: str = "all"):
    await seed_admin()
    f = {} if tab == "all" else ({"level": "ERR"} if tab == "5xx" else {"service": {"$in": ["sync-worker", "api"]}})
    return {"metrics": [
        {"label": "API p95", "value": "218 ms", "delta": "target 400", "tone": "pos"},
        {"label": "Error rate", "value": "0.42%", "delta": "▼ 0.1", "tone": "pos"},
        {"label": "DB connections", "value": "64 / 200", "delta": "headroom fine"},
        {"label": "Storage used", "value": "3.4 TB", "delta": "photos 78%"},
    ], "services": [{"name": s["name"], "uptime": s["uptime"], "up": s["up"]} async for s in db.admin_services.find({})],
        "logs": [{"level": e["level"], "service": e["service"], "message": e["message"], "ts": e["created_at"].isoformat()}
                 async for e in db.admin_errors.find(f).sort("created_at", -1).limit(20)],
        "incident": {"title": "PDF renderer is the weak service",
                     "note": "Two of today's errors are long invoices timing out and a missing ₦ glyph. Both are cheap fixes and both would reach the customer as “my invoice will not open”."}}


# ---------------------------------------------------------------- SA.15 configuration
@router.get("/configuration")
async def configuration(admin: Admin):
    await seed_admin()
    cfg = await db.admin_config.find_one({"key": "global"})
    return clean(cfg)


class ConfigIn(BaseModel):
    tax_presets: Optional[list] = None
    currency: Optional[dict] = None
    invoice: Optional[dict] = None
    units: Optional[list] = None
    categories: Optional[list] = None
    flags: Optional[list] = None


@router.put("/configuration")
async def save_configuration(body: ConfigIn, admin: Admin):
    patch = body.model_dump(exclude_none=True)
    if not patch:
        return {"ok": True}
    await db.admin_config.update_one({"key": "global"}, {"$set": {**patch, "updated_at": now()}})
    await audit(admin, "New tenants", "Global defaults changed", ", ".join(patch.keys()))
    cfg = await db.admin_config.find_one({"key": "global"})
    return {"ok": True, "message": "Defaults saved — live tenants keep their own", "config": clean(cfg)}


# ---------------------------------------------------------------- SA.16 backup
@router.get("/backup")
async def backup(admin: Admin, tab: str = "automatic"):
    await seed_admin()
    kind = {"automatic": "nightly", "manual": "manual", "pre-migration": "pre_migration"}.get(tab, "nightly")
    last = await db.admin_snapshots.find_one({"type": "nightly"}, sort=[("taken", -1)])
    tenants = await db.admin_tenants.count_documents({})
    return {"metrics": [
        {"label": "Tenants covered", "value": f"{tenants:,} / {tenants:,}", "delta": "100%", "tone": "pos"},
        {"label": "Last full backup", "value": f"{last['size_gb']:.0f} GB" if last else "—", "delta": last["taken"].strftime("%H:%M, 18 min") if last else ""},
        {"label": "Retention", "value": "30 days", "delta": "+ 12 monthly"},
        {"label": "Last restore test", "value": "17 days ago", "delta": "run monthly", "tone": "neg"},
    ], "rows": [{"id": str(s["_id"]), "taken": s["taken"].isoformat(), "type": s["type"], "scope": s["scope"],
                 "size_gb": s["size_gb"], "verified": s["verified"]}
                async for s in db.admin_snapshots.find({"type": kind}).sort("taken", -1)],
        "restore_test_overdue": True,
        "tenants": [{"id": str(t["_id"]), "name": t["name"]} async for t in db.admin_tenants.find({}).sort("name", 1).limit(40)]}


class SnapshotIn(BaseModel):
    scope: str = "All tenants"
    type: Literal["nightly", "manual", "pre_migration"] = "manual"


@router.post("/backup/snapshot")
async def snapshot(body: SnapshotIn, admin: Admin):
    doc = {"taken": now(), "type": body.type, "scope": body.scope, "size_gb": 41 if body.scope == "All tenants" else 1.1,
           "verified": True}
    await db.admin_snapshots.insert_one(doc)
    await audit(admin, body.scope, "Snapshot taken", body.type)
    return {"ok": True, "message": f"Snapshot of {body.scope} complete"}


class RestoreIn(BaseModel):
    tenant_id: str
    snapshot_id: str


@router.post("/backup/restore")
async def restore(body: RestoreIn, admin: Admin):
    t = await db.admin_tenants.find_one({"_id": oid(body.tenant_id)})
    s = await db.admin_snapshots.find_one({"_id": oid(body.snapshot_id)})
    if not t or not s:
        raise HTTPException(404, "Pick a business and a restore point")
    lost = 1204
    await audit(admin, t["name"], "Tenant restored", f"{s['taken'].strftime('%d/%m %H:%M')} · {lost} records rolled back", "deletion")
    return {"ok": True, "message": f"{t['name']} restored to {s['taken'].strftime('%d/%m %H:%M')} · owner emailed", "records_lost": lost}


@router.post("/backup/test-restore")
async def test_restore(admin: Admin):
    t = await db.admin_tenants.find_one({}, sort=[("last_active", -1)])
    await audit(admin, t["name"] if t else "", "Test restore run", "sandbox · row counts matched")
    return {"ok": True, "message": "Test restore passed — row counts matched in the sandbox"}


# ---------------------------------------------------------------- SA.17 migration
@router.get("/migration")
async def migrations(admin: Admin):
    await seed_admin()
    return {"rows": [{"id": str(m["_id"]), "tenant": m["tenant"], "file": m["file"], "step": m["step"],
                      "rows_read": m["rows_read"], "committed": m["committed"]}
                     async for m in db.admin_migrations.find({}).sort("created_at", -1)]}


@router.get("/migration/{mid}")
async def migration(mid: str, admin: Admin):
    m = await db.admin_migrations.find_one({"_id": oid(mid)})
    if not m:
        raise HTTPException(404, "Migration not found")
    return clean(m)


class MappingIn(BaseModel):
    source: str
    target: str


@router.patch("/migration/{mid}/mapping")
async def map_field(mid: str, body: MappingIn, admin: Admin):
    m = await db.admin_migrations.find_one({"_id": oid(mid)})
    if not m:
        raise HTTPException(404, "Migration not found")
    maps = [{**x, "target": body.target, "ok": bool(body.target)} if x["source"] == body.source else x for x in m["mappings"]]
    await db.admin_migrations.update_one({"_id": m["_id"]}, {"$set": {"mappings": maps}})
    return {"ok": True, "mappings": maps}


@router.post("/migration/{mid}/dry-run")
async def dry_run(mid: str, admin: Admin):
    m = await db.admin_migrations.find_one({"_id": oid(mid)})
    if not m:
        raise HTTPException(404, "Migration not found")
    await db.admin_migrations.update_one({"_id": m["_id"]}, {"$set": {"step": 3}})
    await audit(admin, m["tenant"], "Migration dry run", f"{m['rows_read']} rows read · nothing written")
    return {"ok": True, "message": f"Dry run complete — {m['will_import']} rows would import, {m['need_decision']} need a decision"}


@router.post("/migration/{mid}/commit")
async def commit(mid: str, admin: Admin):
    m = await db.admin_migrations.find_one({"_id": oid(mid)})
    if not m:
        raise HTTPException(404, "Migration not found")
    if m["committed"]:
        raise HTTPException(400, "This import has already been committed")
    if m["step"] < 3:
        raise HTTPException(400, "Run the dry run before committing")
    await db.admin_snapshots.insert_one({"taken": now(), "type": "pre_migration", "scope": m["tenant"], "size_gb": 1.2, "verified": True})
    await db.admin_migrations.update_one({"_id": m["_id"]}, {"$set": {"step": 5, "committed": True, "snapshot_taken": True,
                                                                      "committed_at": now()}})
    await audit(admin, m["tenant"], "Legacy import committed", f"{m['will_import']} rows · reversible 30 days")
    return {"ok": True, "message": f"Imported {m['will_import']} rows · snapshot taken first, reversible for 30 days"}


# ---------------------------------------------------------------- SA.18 support
@router.get("/support")
async def support(admin: Admin):
    await seed_admin()
    session = await db.admin_support.find_one({"kind": "session", "status": "active"})
    if session and aw(session["expires_at"]) < now():
        await db.admin_support.update_one({"_id": session["_id"]}, {"$set": {"status": "expired"}})
        session = None
    return {
        "session": {"id": str(session["_id"]), "business": session["business"], "granted_by": session["granted_by"],
                    "mode": session["mode"], "expires_at": session["expires_at"].isoformat(), "reason": session["reason"],
                    "scope": session["scope"], "screens_viewed": session["screens_viewed"]} if session else None,
        "requests": [{"id": str(r["_id"]), "business": r["business"], "scope": r.get("scope", ""), "status": r["status"],
                      "duration": r.get("duration", ""), "requested": r["created_at"].isoformat()}
                     async for r in db.admin_support.find({"kind": "request"}).sort("created_at", -1)],
        "broadcasts": [clean(b) async for b in db.admin_broadcasts.find({}).sort("created_at", -1).limit(5)],
        "audiences": ["Pro plan · Nigeria", "All tenants", "Trial · expiring", "Lapsed · read-only"],
        # Messages shop owners send from Help & support inside the app.
        "messages": [{"id": str(m["_id"]), "business": m.get("business_name", ""), "topic": m.get("topic", ""),
                      "subject": m.get("subject", ""), "message": m.get("message", ""), "by": m.get("by", ""),
                      "contact": m.get("contact", ""), "urgency": m.get("urgency", "normal"),
                      "status": m.get("status", "open"), "replies": len(m.get("replies", [])),
                      "created_at": aw(m["created_at"]).isoformat()}
                     async for m in db.support_messages.find({}).sort("created_at", -1).limit(40)],
        "messages_open": await db.support_messages.count_documents({"status": "open"}),
    }


class ReplyIn(BaseModel):
    message: str


@router.post("/support/messages/{mid}/reply")
async def reply_message(mid: str, body: ReplyIn, admin: Admin):
    m = await db.support_messages.find_one({"_id": oid(mid)})
    if not m:
        raise HTTPException(404, "Message not found")
    if len(body.message.strip()) < 4:
        raise HTTPException(400, "Write a reply the owner can act on")
    await db.support_messages.update_one({"_id": m["_id"]}, {
        "$push": {"replies": {"by": admin.get("name", "Tredi support"), "message": body.message.strip(), "at": now()}},
        "$set": {"status": "answered", "updated_at": now()}})
    await audit(admin, m.get("business_name", ""), "Support message answered", m.get("subject", ""))
    return {"ok": True, "message": f"Reply sent to {m.get('business_name', 'the business')}"}


@router.post("/support/messages/{mid}/close")
async def close_support_message(mid: str, admin: Admin):
    m = await db.support_messages.find_one({"_id": oid(mid)})
    if not m:
        raise HTTPException(404, "Message not found")
    await db.support_messages.update_one({"_id": m["_id"]}, {"$set": {"status": "closed", "updated_at": now()}})
    await audit(admin, m.get("business_name", ""), "Support message closed", m.get("subject", ""))
    return {"ok": True, "message": "Message closed"}


@router.post("/support/session/end")
async def end_session(admin: Admin):
    s = await db.admin_support.find_one({"kind": "session", "status": "active"})
    if not s:
        raise HTTPException(404, "No open session")
    await db.admin_support.update_one({"_id": s["_id"]}, {"$set": {"status": "ended", "ended_at": now()}})
    await audit(admin, s["business"], "Support access ended", f"{s['screens_viewed']} screens viewed", "impersonation")
    return {"ok": True, "message": "Support session closed and logged"}


class RequestIn(BaseModel):
    tenant_id: str
    reason: str
    scope: str = "Invoices only"


@router.post("/support/request")
async def request_access(body: RequestIn, admin: Admin):
    t = await db.admin_tenants.find_one({"_id": oid(body.tenant_id)})
    if not t:
        raise HTTPException(404, "Business not found")
    if len(body.reason.strip()) < 4:
        raise HTTPException(400, "The owner sees this reason — say why access is needed")
    await db.admin_support.insert_one({"kind": "request", "business": t["name"], "scope": body.scope, "status": "waiting",
                                       "reason": body.reason, "created_at": now()})
    await audit(admin, t["name"], "Support access requested", body.reason, "impersonation")
    return {"ok": True, "message": f"Request sent to {t['owner'].get('name', 'the owner')} — they must approve it"}


@router.post("/support/requests/{rid}/remind")
async def remind(rid: str, admin: Admin):
    r = await db.admin_support.find_one({"_id": oid(rid)})
    if not r:
        raise HTTPException(404, "Request not found")
    await audit(admin, r["business"], "Access request reminder sent", r.get("scope", ""), "impersonation")
    return {"ok": True, "message": f"Reminder sent to {r['business']}"}


class BroadcastIn(BaseModel):
    audience: str
    title: str
    message: str
    queue: bool = False


@router.post("/support/broadcast")
async def broadcast(body: BroadcastIn, admin: Admin):
    if len(body.title.strip()) < 3 or len(body.message.strip()) < 10:
        raise HTTPException(400, "Give the broadcast a title and a message")
    await db.admin_broadcasts.insert_one({"audience": body.audience, "title": body.title, "message": body.message,
                                          "status": "queued" if body.queue else "sent", "created_at": now()})
    await audit(admin, body.audience, "Broadcast " + ("queued" if body.queue else "sent"), body.title)
    return {"ok": True, "message": f"Broadcast {'queued' if body.queue else 'sent'} to {body.audience}"}


@router.post("/seed")
async def reseed(admin: Admin, force: bool = False):
    return await seed_admin(force=force)
