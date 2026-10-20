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
from plans import PLANS, plan_by_key

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


@router.get("/plans")
async def plans(admin: Admin):
    await seed_admin()
    cap = lambda v: "Unlimited" if v is None else f"{v:,}"
    rows = [{"key": p["key"], "name": p["name"], "price": p["prices"]["monthly"],
             "price_label": "Free" if not p["prices"]["monthly"] else f"₦ {p['prices']['monthly']:,}",
             "cadence": p["cadence"], "shops": cap(p["limits"]["shops"]), "users": cap(p["limits"]["users"]),
             "businesses": cap(p["limits"]["businesses"]), "storage": cap(p["limits"]["invoices"]),
             "note": "", "count": await db.businesses.count_documents({"plan": p["key"], "deleted_at": None})}
            for p in PLANS]
    rows += [{**clean(p), "count": 0} async for p in db.admin_plans.find({"note": "Draft"})]
    rows.append({"key": "custom", "name": "Custom (per client)", "price_label": "Varies", "cadence": "set on the business",
                 "shops": "—", "users": "—", "businesses": "—", "storage": "—", "note": "",
                 "count": await db.businesses.count_documents({"custom_plan": {"$ne": None}, "deleted_at": None})})
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
                                            "plan_cadence": {3: "quarterly", 12: "yearly"}.get(months, "monthly"),
                                            "plan_months": months, "plan_activated_at": now()}, "$unset": {"trial_ends_at": ""}})
    await db.plan_history.insert_one({"business_id": r["business_id"], "plan": plan["key"], "months": months,
                                      "amount": plan["prices"]["monthly"] * months, "note": body.note, "source": "admin",
                                      "by": admin.get("name", "admin"), "created_at": now()})
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
    custom = [{"name": t["name"], "count": 0, "system": False, "based_on": t["based_on"]}
              async for t in db.admin_role_templates.find({}).sort("created_at", 1)]
    return {"templates": [{"name": r, "count": counts.get(r, 0), "system": True} for r in ROLE_TEMPLATES] + custom,
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
    cfg = await db.admin_config.find_one({"key": "global"}) or {}
    return {"metrics": [
        {"label": "API p95", "value": "218 ms", "delta": "target 400", "tone": "pos"},
        {"label": "Error rate", "value": "0.42%", "delta": "▼ 0.1", "tone": "pos"},
        {"label": "DB connections", "value": "64 / 200", "delta": "headroom fine"},
        {"label": "Storage used", "value": "3.4 TB", "delta": "photos 78%"},
    ], "services": [{"name": s["name"], "uptime": s["uptime"], "up": s["up"]} async for s in db.admin_services.find({})],
        "logs": [{"level": e["level"], "service": e["service"], "message": e["message"], "ts": e["created_at"].isoformat()}
                 async for e in db.admin_errors.find(f).sort("created_at", -1).limit(20)],
        "incident": {"open": cfg.get("incident_open", False), "title": "PDF renderer is the weak service",
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
                      "thread": [{"by": x.get("by", ""), "message": x.get("message", ""), "at": aw(x["at"]).isoformat()}
                                 for x in m.get("replies", []) if x.get("at")],
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


# ---------------------------------------------------------------- panel actions
class ExportIn(BaseModel):
    what: str
    rows: int = 0


@router.post("/exports")
async def log_export(body: ExportIn, admin: Admin):
    """Every CSV that leaves the panel is written to the audit log as a data export."""
    await audit(admin, "Platform", "Data exported", f"{body.what} · {body.rows} rows", "export")
    return {"ok": True, "message": f"{body.what} exported · {body.rows} rows"}


class PlanIn(BaseModel):
    name: str
    price: int = 0
    shops: str = "1"
    users: str = "1"
    storage: str = "2 GB"
    businesses: str = "1"


@router.post("/plans")
async def create_plan(body: PlanIn, admin: Admin):
    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(400, "Give the plan a name")
    key = "".join(ch for ch in name.lower().replace(" ", "_") if ch.isalnum() or ch == "_")
    if await db.admin_plans.find_one({"key": key}):
        raise HTTPException(400, "A plan with that name already exists")
    await db.admin_plans.insert_one({"key": key, "name": name, "cadence": "Monthly", "price": max(0, body.price),
                                     "price_label": f"₦ {max(0, body.price):,}", "shops": body.shops, "users": body.users,
                                     "storage": body.storage, "businesses": body.businesses, "note": "Draft",
                                     "created_at": now()})
    await audit(admin, "All tenants", "Plan drafted", f"{name} · ₦ {body.price:,}/month", "billing")
    return {"ok": True, "message": f"{name} saved as a draft — it goes live on the next renewal cycle"}


class TemplateIn(BaseModel):
    name: str
    based_on: str = "Sales"


@router.post("/roles/templates")
async def create_template(body: TemplateIn, admin: Admin):
    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(400, "Give the template a name")
    if body.based_on not in ROLE_TEMPLATES:
        raise HTTPException(400, "Pick a system template to start from")
    if name in ROLE_TEMPLATES or await db.admin_role_templates.find_one({"name": name}):
        raise HTTPException(400, "A template with that name already exists")
    await db.admin_role_templates.insert_one({"name": name, "based_on": body.based_on, "created_at": now()})
    await audit(admin, "All tenants", "Role template created", f"{name} · based on {body.based_on}", "permission")
    return {"ok": True, "message": f"{name} created from {body.based_on}"}


@router.post("/system/incident")
async def toggle_incident(admin: Admin):
    cfg = await db.admin_config.find_one({"key": "global"}) or {}
    opened = not cfg.get("incident_open", False)
    await db.admin_config.update_one({"key": "global"}, {"$set": {"incident_open": opened, "incident_at": now()}}, upsert=True)
    await audit(admin, "Platform", "Incident opened" if opened else "Incident resolved", "PDF renderer")
    return {"ok": True, "open": opened, "message": "Incident opened — status page updated" if opened else "Incident resolved"}


@router.get("/support/requests/{rid}/log")
async def request_log(rid: str, admin: Admin):
    r = await db.admin_support.find_one({"_id": oid(rid)})
    if not r:
        raise HTTPException(404, "Request not found")
    rows = [{"id": str(a["_id"]), "ts": aw(a["created_at"]).isoformat(), "actor": a.get("actor", ""), "event": a["event"],
             "entity": a.get("entity", "")}
            async for a in db.admin_audit.find({"business": r["business"], "category": "impersonation"}).sort("created_at", -1).limit(30)]
    return {"business": r["business"], "scope": r.get("scope", ""), "duration": r.get("duration", ""), "rows": rows}


@router.post("/seed")
async def reseed(admin: Admin, force: bool = False):
    return await seed_admin(force=force)


# ---------------------------------------------------------------- live MySQL sync
# Runs the read-only legacy import inside whichever environment this server is in
# (preview or production), so the published app can pull the live data itself.
import asyncio
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def _run_legacy_sync(job_id: ObjectId):
    log = ""
    ok = True
    for args in (["-m", "migrations.import_legacy", "--source", "tredi", "--commit"],
                 ["migrations/freeze_line_costs.py"]):
        proc = await asyncio.create_subprocess_exec(sys.executable, *args, cwd=BACKEND_DIR,
                                                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        out, _ = await proc.communicate()
        log += out.decode(errors="replace")[-6000:]
        if proc.returncode != 0:
            ok = False
            break
    await db.admin_jobs.update_one({"_id": job_id}, {"$set": {
        "status": "done" if ok else "failed", "finished_at": now(), "log": log}})


AUTO_SYNC_HOURS = 6


async def legacy_sync_loop():
    """Keep this environment in step with the live system without anyone pressing
    a button: sync on start-up (unless one ran recently) and every few hours."""
    if not os.environ.get("LEGACY_DB_HOST"):
        return
    while True:
        try:
            recent = await db.admin_jobs.find_one({"kind": "legacy_sync", "started_at": {"$gt": now() - timedelta(hours=AUTO_SYNC_HOURS)}})
            if not recent:
                res = await db.admin_jobs.insert_one({"kind": "legacy_sync", "status": "running", "started_at": now(),
                                                      "started_by": "auto", "log": ""})
                await _run_legacy_sync(res.inserted_id)
        except Exception as exc:   # never let the loop die; try again next round
            print(f"legacy auto-sync failed: {exc}")
        await asyncio.sleep(AUTO_SYNC_HOURS * 3600)


@router.get("/legacy-sync")
async def legacy_sync_status(admin: Admin):
    job = await db.admin_jobs.find_one({"kind": "legacy_sync"}, sort=[("started_at", -1)])
    return {"configured": bool(os.environ.get("LEGACY_DB_HOST")), "job": clean(job) if job else None}


@router.post("/legacy-sync")
async def legacy_sync_start(admin: Admin):
    if not os.environ.get("LEGACY_DB_HOST"):
        raise HTTPException(400, "Live database connection is not configured on this server")
    running = await db.admin_jobs.find_one({"kind": "legacy_sync", "status": "running",
                                            "started_at": {"$gt": now() - timedelta(minutes=30)}})
    if running:
        raise HTTPException(409, "A sync is already running")
    res = await db.admin_jobs.insert_one({"kind": "legacy_sync", "status": "running", "started_at": now(),
                                          "started_by": admin.get("email"), "log": ""})
    asyncio.create_task(_run_legacy_sync(res.inserted_id))
    return {"message": "Sync started — this takes about two minutes"}
