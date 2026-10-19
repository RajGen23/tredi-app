"""Shared database handle, auth and money helpers used by every router."""
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field, EmailStr, BeforeValidator
from typing import List, Optional, Annotated, Literal
from datetime import datetime, timedelta, timezone, date
from bson import ObjectId
from pathlib import Path
import jwt
import os

import plans as plan_rules

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = os.environ.get("JWT_ALGORITHM", "HS256")
TOKEN_MINUTES = int(os.environ.get("ACCESS_TOKEN_MINUTES", "43200"))
VAT_RATE = 7.5

# passlib reads bcrypt.__about__ for its version, which bcrypt 4.1+ no longer
# ships — without this shim every hash logs a traceback.
import bcrypt as _bcrypt
if not hasattr(_bcrypt, "__about__"):
    _bcrypt.__about__ = type("about", (), {"__version__": getattr(_bcrypt, "__version__", "4.1")})

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
DUMMY_HASH = pwd_context.hash("dummy-password-used-only-for-timing")

# A cancelled invoice keeps its number on the record but must never count as a
# sale again — one clause, used by every figure in the app.
LIVE_SALE = {"$nin": ["draft", "quote", "cancelled"]}
# A quick sale counts until it is voided; older rows have no field at all, which
# Mongo reads as None, so they stay live.
LIVE_QUICK = {"cancelled_at": None}
# Same idea for a purchase order that was voided.
LIVE_PO = {"cancelled_at": None}

PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


def now() -> datetime:
    return datetime.now(timezone.utc)


def oid(v: str) -> ObjectId:
    if not ObjectId.is_valid(v):
        raise HTTPException(404, "Not found")
    return ObjectId(v)


def clean(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


def hash_password(p: str) -> str:
    return pwd_context.hash(p)


def verify_password(p: str, h: str) -> bool:
    return pwd_context.verify(p, h)


def create_access_token(user_id: str) -> str:
    n = now()
    return jwt.encode({"sub": user_id, "iat": n, "exp": n + timedelta(minutes=TOKEN_MINUTES)}, JWT_SECRET, algorithm=JWT_ALG)


async def current_user(request: Request, token: Annotated[str, Depends(oauth2_scheme)]) -> dict:
    unauthorized = HTTPException(401, "Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        uid = payload.get("sub")
        if not uid or not ObjectId.is_valid(uid):
            raise unauthorized
    except (jwt.InvalidTokenError, TypeError, ValueError):
        raise unauthorized
    user = await db.users.find_one({"_id": ObjectId(uid)})
    if not user:
        raise unauthorized
    await touch_last_seen(user)
    await guard_writes(request, user)
    return user


async def touch_last_seen(user: dict):
    """When was this person last in their books — written at most every 2 minutes
    so the Super Admin can see who is active without a write on every request."""
    seen = aware(user.get("last_seen_at"))
    if seen and now() - seen < timedelta(minutes=2):
        return
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_seen_at": now()}})
    if user.get("business_id") and ObjectId.is_valid(str(user["business_id"])):
        await db.businesses.update_one({"_id": ObjectId(str(user["business_id"]))}, {"$set": {"last_active_at": now()}})


CurrentUser = Annotated[dict, Depends(current_user)]


# ---------------------------------------------------------------- subscription
# A lapsed subscription never hides anybody's books: reading stays open, only
# saving stops. These paths keep working so the owner can always get back in.
WRITE_ALWAYS_OK = ("/api/auth", "/api/admin", "/api/plans", "/api/subscription",
                   "/api/shops/active", "/api/businesses/", "/api/settings/lock", "/api/support")


def aware(d):
    """Mongo hands back naive datetimes; every comparison here is in UTC."""
    if isinstance(d, datetime) and d.tzinfo is None:
        return d.replace(tzinfo=timezone.utc)
    return d


def subscription_state(biz: dict) -> dict:
    plan = plan_rules.plan_by_key(biz.get("plan"))
    trialing = plan["key"] == "trial"
    started = aware(biz.get("created_at")) or now()
    if trialing:
        ends = aware(biz.get("trial_ends_at")) or (started + timedelta(days=plan_rules.TRIAL_DAYS))
    else:
        ends = aware(biz.get("renews_at"))
    days_left = None if ends is None else (ends - now()).days
    expired = ends is not None and ends <= now()
    cadence = biz.get("plan_cadence") or "monthly"
    price = plan_rules.price_of(plan, cadence)
    # A plan the tredi team tailored for this one client sits on top of the base plan.
    custom = biz.get("custom_plan") or {}
    limits = {**plan["limits"], **(custom.get("limits") or {})}
    features = {**plan["features"], **(custom.get("features") or {})}
    if custom.get("price") is not None:
        price = int(custom["price"])
    name = custom.get("name") or plan["name"]
    months = biz.get("plan_months")
    words = f"every {months} months" if months and months not in (1, 3, 12) else plan_rules.CADENCE_WORDS[cadence]
    if months and months not in (1, 3, 12) and custom.get("price") is None:
        price = plan["prices"]["monthly"] * months
    return {"plan": plan["key"], "name": name, "price": price,
            "price_label": plan_rules.money(price),
            "cadence": words if not trialing else plan["cadence"],
            "cadence_key": cadence, "tagline": plan["tagline"], "perks": plan["perks"],
            "limits": limits, "features": features, "trialing": trialing, "custom": bool(custom),
            "status": "expired" if expired else ("trialing" if trialing else "active"),
            "days_left": days_left, "ends_at": ends.isoformat() if ends else None}


async def subscription_of(business_id: str) -> dict:
    biz = await db.businesses.find_one({"_id": ObjectId(business_id)}) if ObjectId.is_valid(business_id) else None
    return subscription_state(biz or {})


async def guard_writes(request: Request, user: dict):
    if request.method in ("GET", "HEAD", "OPTIONS") or not user.get("business_id"):
        return
    if request.url.path.startswith(WRITE_ALWAYS_OK):
        return
    sub = await subscription_of(str(user["business_id"]))
    if sub["status"] == "expired":
        raise HTTPException(402, plan_rules.expired_message(plan_rules.plan_by_key(sub["plan"]), sub["trialing"]))


async def ensure_limit(user: dict, kind: str, current: int):
    """Block the create that would take a business past its plan's ceiling."""
    sub = await subscription_of(str(user["business_id"]))
    cap = sub["limits"].get(kind)
    if cap is not None and current >= cap:
        raise HTTPException(402, plan_rules.limit_message(sub["plan"], kind, cap))


async def ensure_feature(user: dict, feature: str):
    sub = await subscription_of(str(user["business_id"]))
    if not sub["features"].get(feature):
        raise HTTPException(402, plan_rules.feature_message(sub["plan"], feature))


async def ensure_invoice_room(user: dict):
    """Each plan covers a number of customer invoices; this is that gate."""
    bid = str(user["business_id"])
    await ensure_limit(user, "invoices", await db.invoices.count_documents({"business_id": bid, "deleted_at": None}))


def public_user(u: dict) -> dict:
    return {"id": str(u["_id"]), "name": u.get("name", ""), "email": u["email"],
            "business_id": str(u["business_id"]) if u.get("business_id") else None,
            "role": u.get("role", "owner"), "scope": u.get("scope", "all"), "shop": u.get("shop", "")}


def biz_filter(user: dict) -> dict:
    if not user.get("business_id"):
        raise HTTPException(400, "Set up your business first")
    return {"business_id": str(user["business_id"]), "deleted_at": None}


# ---------------------------------------------------------------- shop scoping
# Every figure in the app belongs to a shop. The owner can look at one shop or
# at all of them; a rep only ever sees the shops they were given. Records saved
# before shops existed carry no tag, so they count as the main branch.
async def business_shops(business_id: str, working_only: bool = False) -> List[str]:
    biz = await db.businesses.find_one({"_id": ObjectId(business_id)})
    rows = ((biz or {}).get("shops") or [])
    names = [s.get("name", "") for s in rows if s.get("name") and not (working_only and s.get("dormant"))]
    return names or ["Main branch"]


async def shop_scope(user: dict, area: str = "sales") -> dict:
    """Resolve what this user is allowed to see, and what they picked.

    `shops` is None when every shop is in view, otherwise the list to filter on.
    """
    f = biz_filter(user)
    all_shops = await business_shops(f["business_id"])
    main = all_shops[0]
    role = user.get("role", "owner")
    sc = "all" if role == "owner" else ((user.get("scopes") or {}).get(area) or "shop")
    assigned = [s for s in (user.get("shops") or []) if s in all_shops]
    # A rep with no explicit posting is still not a roaming owner: they are tied
    # to the shop they are standing in (the main branch if that is all there is).
    if not assigned and sc != "all":
        here = user.get("shop") or ""
        assigned = [here if here in all_shops else main]
    locked = sc != "all" and bool(assigned)
    allowed = assigned if locked else None
    active = user.get("shop") or ""
    if active and (allowed is None or active in allowed):
        sel = [active]
    else:
        sel = list(allowed) if allowed else None
    return {"business_id": f["business_id"], "shops": sel, "main": main, "all": all_shops,
            "own": sc == "own", "locked": locked, "active": active,
            # A dormant shop keeps its history but is no longer somewhere you can
            # stand and write.
            "visible": allowed if allowed else await business_shops(f["business_id"], working_only=True)}


def scope_clause(sc: dict, user: Optional[dict] = None, own_field: str = "created_by") -> dict:
    ands = []
    if sc["shops"] is not None:
        alts: List[dict] = [{"shop": {"$in": sc["shops"]}}]
        if sc["main"] in sc["shops"]:
            alts += [{"shop": {"$in": ["", None]}}, {"shop": {"$exists": False}}]
        ands.append({"$or": alts})
    if sc["own"] and user is not None:
        ands.append({own_field: user.get("name", "")})
    return {"$and": ands} if ands else {}


async def scoped(user: dict, area: str = "sales", own_field: str = "created_by") -> dict:
    """biz_filter plus the shop (and own-records) clause for this user."""
    sc = await shop_scope(user, area)
    return {**biz_filter(user), **scope_clause(sc, user, own_field)}


async def writing_shop(user: dict, given: str = "") -> str:
    """Which shop a new record belongs to."""
    if given:
        return given
    if user.get("shop"):
        return str(user["shop"])
    assigned = user.get("shops") or []
    if len(assigned) == 1:
        return str(assigned[0])
    return (await business_shops(str(user["business_id"])))[0]


def writing_rep(user: dict, given: str = "") -> str:
    """Whose sale (or expense) this is. Defaults to whoever is typing, which is
    what makes 'sales by rep' and the rep page possible."""
    return (given or user.get("name") or "").strip()


def rep_clause(rep: str = "") -> dict:
    """Filter a figure down to one rep: the person who recorded it."""
    if not rep:
        return {}
    return {"$or": [{"rep": rep}, {"rep": {"$in": ["", None]}, "created_by": rep}, {"rep": {"$exists": False}, "created_by": rep}]}


def stock_map(item: dict, main: str) -> dict:
    """Quantity per shop. Items saved before shops existed sit at the main branch."""
    rows = item.get("stock")
    if isinstance(rows, list):
        return {r.get("shop", ""): (r.get("qty") or 0) for r in rows if r.get("shop")}
    if isinstance(rows, dict):
        return {k: (v or 0) for k, v in rows.items() if k}
    return {main: item.get("quantity", 0) or 0}


def stock_rows(m: dict) -> List[dict]:
    return [{"shop": k, "qty": round(v, 3)} for k, v in m.items()]


def shop_qty(item: dict, shops: Optional[List[str]], main: str) -> float:
    if shops is None:
        return round(item.get("quantity", 0) or 0, 3)
    m = stock_map(item, main)
    return round(sum(m.get(s, 0) for s in shops), 3)


# ---------------------------------------------------------------- money math
class LineIn(BaseModel):
    item_id: Optional[str] = None
    name: str
    quantity: float = 1
    unit_price: float
    discount_type: Literal["amount", "percent"] = "amount"
    discount_value: float = 0
    note: str = ""
    quick_add: bool = False
    unit: str = ""
    photo_url: str = ""
    # Stamped by the server when the line is first sold; see stamp_costs.
    cost_at_sale: Optional[float] = None


def line_totals(l: LineIn) -> dict:
    gross = round(l.quantity * l.unit_price, 2)
    disc = round(gross * l.discount_value / 100, 2) if l.discount_type == "percent" else round(min(l.discount_value, gross), 2)
    return {**l.model_dump(), "gross": gross, "discount": disc, "total": round(gross - disc, 2)}


async def stamp_costs(business_id: str, lines: List[dict]) -> List[dict]:
    """Write today's cost price onto each line as it is sold.

    Without this, a sale's profit is worked out from whatever the item costs
    *now*, so raising a price would quietly rewrite last month's books. The
    stamped `cost_at_sale` is what every profit figure reads.
    """
    for l in lines:
        if l.get("cost_at_sale") is not None:
            continue
        iid = l.get("item_id")
        it = await db.items.find_one({"_id": ObjectId(iid), "business_id": business_id}) if iid and ObjectId.is_valid(str(iid)) else None
        l["cost_at_sale"] = round(float((it or {}).get("cost_price") or 0), 2)
    return lines


def line_cost(line: dict, item: Optional[dict] = None) -> float:
    """What this line cost us. Old rows have no stamp, so they fall back to the
    item's current cost — the best guess available for history already written."""
    stamped = line.get("cost_at_sale")
    if stamped is None:
        stamped = (item or {}).get("cost_price") or 0
    return round((line.get("quantity") or 0) * float(stamped or 0), 2)


def invoice_totals(lines: List[dict], dtype: str, dvalue: float, vat_rate: float, shipping: float = 0) -> dict:
    gross = round(sum(x["gross"] for x in lines), 2)
    line_disc = round(sum(x["discount"] for x in lines), 2)
    after_lines = gross - line_disc
    if dtype == "percent":
        inv_disc = round(after_lines * dvalue / 100, 2)
    elif dtype == "final":
        taxable_target = dvalue / (1 + vat_rate / 100) if dvalue > 0 else after_lines
        inv_disc = round(max(0.0, after_lines - taxable_target), 2)
    else:
        inv_disc = round(min(dvalue, after_lines), 2)
    taxable = round(after_lines - inv_disc, 2)
    vat = round(taxable * vat_rate / 100, 2)
    # Delivery is a service the customer pays for, not goods sold: it sits after
    # VAT and is never part of the taxable amount.
    ship = round(max(0.0, shipping), 2)
    return {"gross": gross, "line_discount": line_disc, "invoice_discount": inv_disc, "discount_total": round(line_disc + inv_disc, 2),
            "taxable": taxable, "vat": vat, "shipping": ship, "total": round(taxable + vat + ship, 2)}


async def next_number(business_id: str, key: str, prefix: str, start: int) -> str:
    doc = await db.counters.find_one_and_update({"business_id": business_id, "key": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return f"{prefix}-{start + doc['seq']}"


async def apply_stock(business_id: str, item_id: Optional[str], qty_delta: float, kind: str, ref: str, user: dict, note: str = "", shop: str = ""):
    if not item_id or not ObjectId.is_valid(item_id):
        return
    item = await db.items.find_one({"_id": ObjectId(item_id), "business_id": business_id})
    if not item or not item.get("track_stock", True):
        return
    all_shops = await business_shops(business_id)
    main = all_shops[0]
    where = shop or user.get("shop") or main
    m = stock_map(item, main)
    m[where] = round((m.get(where) or 0) + qty_delta, 3)
    new_qty = round(sum(m.values()), 3)
    await db.items.update_one({"_id": item["_id"]}, {"$set": {"quantity": new_qty, "stock": stock_rows(m), "updated_at": now()}})
    await db.movements.insert_one({"business_id": business_id, "item_id": item_id, "kind": kind, "delta": qty_delta, "balance": new_qty, "ref": ref, "note": note,
                                   "shop": where, "by": user.get("name", ""), "created_at": now(), "deleted_at": None})


async def customer_balance(business_id: str, customer_id: str) -> float:
    """Positive = customer owes us; negative = unused credit."""
    c = await db.customers.find_one({"_id": oid(customer_id)})
    bal = c.get("opening_balance", 0) * (1 if c.get("opening_type") == "owes_me" else -1)
    async for inv in db.invoices.find({"business_id": business_id, "customer_id": customer_id, "deleted_at": None, "status": LIVE_SALE}):
        bal += inv["totals"]["total"]
    async for p in db.payments.find({"business_id": business_id, "customer_id": customer_id, "deleted_at": None}):
        bal -= p["amount"]
    return round(bal, 2)


async def invoice_paid(business_id: str, invoice_id: str) -> float:
    total = 0.0
    async for p in db.payments.find({"business_id": business_id, "deleted_at": None, "allocations.invoice_id": invoice_id}):
        total += sum(a["amount"] for a in p.get("allocations", []) if a["invoice_id"] == invoice_id)
    return round(total, 2)


def invoice_status(inv: dict, paid: float) -> dict:
    due = round(inv["totals"]["total"] - paid, 2)
    status = inv.get("status", "issued")
    days_overdue = 0
    if status not in ("draft", "quote", "cancelled"):
        if due <= 0:
            status = "paid"
        else:
            status = "part_paid" if paid > 0 else "unpaid"
            if inv.get("due_date"):
                try:
                    dd = date.fromisoformat(inv["due_date"][:10])
                    days_overdue = (date.today() - dd).days
                    if days_overdue > 0:
                        status = "overdue"
                    else:
                        days_overdue = 0
                except ValueError:
                    pass
    return {"paid": paid, "due": max(due, 0), "status": status, "days_overdue": days_overdue}


async def decorate_invoice(inv: dict) -> dict:
    out = clean(inv)
    paid = await invoice_paid(inv["business_id"], out["id"])
    out.update(invoice_status(inv, paid))
    out["totals"].setdefault("shipping", 0)
    out["totals"].setdefault("discount_total", round(out["totals"].get("line_discount", 0) + out["totals"].get("invoice_discount", 0), 2))
    # Which bank accounts print on this document, and the terms set behind it.
    ids = [i for i in (inv.get("bank_account_ids") or []) if ObjectId.is_valid(i)]
    out["bank_accounts"] = [{"id": str(a["_id"]), "name": a.get("name", ""), "bank": a.get("bank", ""),
                             "number": a.get("number", ""), "holder": a.get("holder", "")}
                            async for a in db.accounts.find({"_id": {"$in": [ObjectId(i) for i in ids]}})] if ids else []
    terms = await db.terms.find_one({"_id": ObjectId(inv["terms_id"])}) if ObjectId.is_valid(inv.get("terms_id") or "") else None
    out["terms"] = {"name": terms.get("name", ""), "payment_structure": terms.get("payment_structure", ""),
                    "delivery_condition": terms.get("delivery_condition", ""), "additional_notes": terms.get("additional_notes", ""),
                    "shop": terms.get("shop", "")} if terms else None
    # Item photos: taken from the line snapshot, or from the item if the line was
    # raised before photos existed.
    missing = [ObjectId(l["item_id"]) for l in out.get("lines", [])
               if not l.get("photo_url") and ObjectId.is_valid(l.get("item_id") or "")]
    if missing:
        photos = {str(i["_id"]): i.get("photo_url", "") async for i in db.items.find({"_id": {"$in": missing}})}
        for l in out["lines"]:
            if not l.get("photo_url"):
                l["photo_url"] = photos.get(l.get("item_id") or "", "")
    out["payments"] = [{"method": p.get("method", "cash"), "amount": sum(a["amount"] for a in p.get("allocations", []) if a["invoice_id"] == out["id"]),
                        "date": p["created_at"].isoformat() if hasattr(p.get("created_at"), "isoformat") else ""}
                       async for p in db.payments.find({"business_id": inv["business_id"], "deleted_at": None, "allocations.invoice_id": out["id"]}).sort("created_at", 1)]
    if inv.get("customer_id"):
        c = await db.customers.find_one({"_id": ObjectId(inv["customer_id"])})
        out["customer_name"] = c["name"] if c else "Cash sale"
        out["customer_phone"] = c.get("phone", "") if c else ""
        out["customer_address"] = c.get("address", "") if c else ""
    else:
        out["customer_name"] = "Cash sale"
        out["customer_phone"] = ""
        out["customer_address"] = ""
    return out


# ---------------------------------------------------------------- periods
def period_range(period: str, start: Optional[str] = None, end: Optional[str] = None) -> tuple[Optional[datetime], datetime, str]:
    """Return (from, to, label). `to` is exclusive."""
    today = date.today()
    def dt(d: date) -> datetime:
        return datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc)
    if period == "custom" and start and end:
        a, b = date.fromisoformat(start[:10]), date.fromisoformat(end[:10])
        return dt(a), dt(b) + timedelta(days=1), f"{a.strftime('%d %b')} – {b.strftime('%d %b %Y')}"
    if period == "today":
        return dt(today), dt(today) + timedelta(days=1), today.strftime("Today · %d %b")
    if period == "yesterday":
        y = today - timedelta(days=1)
        return dt(y), dt(today), y.strftime("Yesterday · %d %b")
    if period == "week":
        a = today - timedelta(days=today.weekday())
        return dt(a), dt(today) + timedelta(days=1), f"This week · {a.strftime('%d')}–{today.strftime('%d %b')}"
    if period == "last_month":
        first = today.replace(day=1)
        a = (first - timedelta(days=1)).replace(day=1)
        return dt(a), dt(first), a.strftime("Last month · %B %Y")
    if period == "year":
        a = today.replace(month=1, day=1)
        return dt(a), dt(today) + timedelta(days=1), today.strftime("This year · %Y")
    if period == "all":
        return None, dt(today) + timedelta(days=1), "All time"
    first = today.replace(day=1)
    return dt(first), dt(today) + timedelta(days=1), f"This month · {first.strftime('%d')}–{today.strftime('%d %b')}"


def date_query(f: dict, a: Optional[datetime], b: datetime, field: str = "created_at") -> dict:
    q = dict(f)
    q[field] = {"$lt": b} if a is None else {"$gte": a, "$lt": b}
    return q


async def log_activity(business_id: str, user: dict, kind: str, title: str, sub: str = "", amount: float = 0.0,
                       ref_id: str = "", shop: str = "", reason: str = ""):
    """Audit trail behind Activity (01.5) and Record history (01.6)."""
    await db.activity.insert_one({"business_id": business_id, "kind": kind, "title": title, "sub": sub, "amount": amount,
                                  "ref_id": ref_id, "shop": shop, "reason": reason, "by": user.get("name", ""),
                                  "by_id": str(user["_id"]), "created_at": now(), "deleted_at": None})
