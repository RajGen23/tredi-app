"""Rail 10 — shops, all-shops view, business switching; plus 05.7/05.8 stock transfers and 00.5 addresses."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal
from datetime import timedelta
from bson import ObjectId

from plans import TRIAL_DAYS

from deps import (CurrentUser, LIVE_QUICK, LIVE_SALE, apply_stock, biz_filter, clean, db, ensure_feature, ensure_limit, log_activity, next_number,
                  now, oid, period_range, date_query, shop_qty, shop_scope, stock_map)

router = APIRouter(prefix="/api")


class ShopIn(BaseModel):
    name: str
    address: str = ""
    phone: str = ""
    sells: bool = True  # False = warehouse (stock only)
    is_main: bool = False


class BusinessCreateIn(BaseModel):
    name: str
    type: str = "Retail"
    currency: str = "NGN"
    tin: str = ""
    address: str = ""
    phone: str = ""
    track_stock: bool = True
    shop_name: str = "Main branch"
    copy_settings_from: Optional[str] = None


class AddressIn(BaseModel):
    label: str
    address: str = ""
    phone: str = ""
    kind: Literal["shop", "billing", "delivery", "contact"] = "shop"
    is_default: bool = False


class TransferLine(BaseModel):
    item_id: str
    name: str
    quantity: float
    unit: str = ""


class TransferIn(BaseModel):
    from_shop: str
    to_shop: str
    lines: List[TransferLine]
    note: str = ""
    needs_approval: bool = True


class ReceiveLine(BaseModel):
    item_id: str
    received: float
    reason: str = ""


class ReceiveIn(BaseModel):
    lines: List[ReceiveLine]


async def shop_sales(f: dict, shop: str, a, b, is_main: bool = False) -> float:
    """Rows saved before shops existed carry no tag — they belong to the main branch."""
    names: list = [shop, shop] if not is_main else [shop, "", None]
    clause = {"shop": {"$in": list(dict.fromkeys(names))}}
    total = 0.0
    async for inv in db.invoices.find(date_query({**f, "status": LIVE_SALE, **clause}, a, b)):
        total += inv["totals"]["total"]
    async for s in db.sales.find(date_query({**f, **clause, **LIVE_QUICK}, a, b)):
        total += s["totals"]["total"]
    return round(total, 2)


def shop_list(biz: dict) -> list[dict]:
    shops = biz.get("shops") or [{"name": "Main branch", "address": biz.get("address", "")}]
    for i, s in enumerate(shops):
        s.setdefault("sells", True)
        s.setdefault("phone", "")
        s.setdefault("is_main", i == 0)
    return shops


@router.get("/shops")
async def list_shops(user: CurrentUser, period: str = "month"):
    f = biz_filter(user)
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    a, b, label = period_range(period)
    sc = await shop_scope(user, "sales")
    shops = [s for s in shop_list(biz) if s["name"] in sc["visible"]]
    out = []
    for i, sh in enumerate(shops):
        sales = await shop_sales(f, sh["name"], a, b, is_main=sh["name"] == sc["main"])
        out.append({**sh, "sales": sales})
    total = round(sum(x["sales"] for x in out), 2)
    return {"shops": out, "total": total, "label": label, "active": user.get("shop") or "", "count": len(out),
            "locked": sc["locked"], "can_see_all": not sc["locked"]}


@router.post("/shops", status_code=201)
async def add_shop(data: ShopIn, user: CurrentUser):
    f = biz_filter(user)
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    shops = shop_list(biz)
    if any(s["name"].lower() == data.name.lower() for s in shops):
        raise HTTPException(409, "A shop with that name already exists")
    await ensure_limit(user, "shops", len(shops))
    shops.append(data.model_dump())
    await db.businesses.update_one({"_id": biz["_id"]}, {"$set": {"shops": shops}})
    await log_activity(f["business_id"], user, "shop", f"Shop {data.name} added")
    return {"shops": shops}


@router.put("/shops/{name}")
async def update_shop(name: str, data: ShopIn, user: CurrentUser):
    f = biz_filter(user)
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    shops = shop_list(biz)
    idx = next((i for i, s in enumerate(shops) if s["name"] == name), None)
    if idx is None:
        raise HTTPException(404, "Shop not found")
    shops[idx] = data.model_dump()
    await db.businesses.update_one({"_id": biz["_id"]}, {"$set": {"shops": shops}})
    return {"shops": shops}


@router.post("/shops/active")
async def set_active_shop(body: dict, user: CurrentUser):
    biz_filter(user)
    shop = body.get("shop", "")
    sc = await shop_scope(user, "sales")
    if shop and shop not in sc["visible"]:
        raise HTTPException(403, "You are not assigned to that shop")
    if not shop and sc["locked"]:
        raise HTTPException(403, "You can only work in the shops you are assigned to")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"shop": shop}})
    return {"shop": shop}


@router.get("/shops/overview")
async def shops_overview(user: CurrentUser, period: str = "month"):
    f = biz_filter(user)
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    a, b, label = period_range(period)
    sc = await shop_scope(user, "sales")
    shops = [s for s in shop_list(biz) if s["name"] in sc["visible"]]
    rows = []
    for sh in shops:
        rows.append({"name": sh["name"], "sells": sh.get("sells", True),
                     "sales": await shop_sales(f, sh["name"], a, b, is_main=sh["name"] == sc["main"])})
    total = round(sum(r["sales"] for r in rows), 2)
    stock_value, stock_count = 0.0, 0
    async for i in db.items.find(f):
        if i.get("track_stock", True):
            stock_value += (i.get("quantity") or 0) * (i.get("cost_price") or 0)
            stock_count += 1
    expenses = round(sum([e["amount"] async for e in db.expenses.find(date_query(f, a, b))]), 2)
    pending = await db.transfers.count_documents({**f, "state": "pending"})
    best = max(rows, key=lambda r: r["sales"], default=None)
    worst = min([r for r in rows if r["sells"]], key=lambda r: r["sales"], default=None)
    alert = None
    if best and worst and best["name"] != worst["name"] and best["sales"] > 0:
        gap = round((1 - worst["sales"] / best["sales"]) * 100)
        if gap >= 20:
            alert = {"shop": worst["name"], "gap": gap, "text": f"{worst['name']} is {gap}% below {best['name']}"}
    return {"label": label, "total": total, "profit": round(total - expenses, 2), "rows": rows,
            "stock_value": round(stock_value, 2), "stock_count": stock_count, "transfers_pending": pending, "alert": alert,
            "business_name": biz.get("name", ""), "shop_count": len(rows)}


# ---------------------------------------------------------------- businesses
@router.get("/businesses")
async def list_businesses(user: CurrentUser):
    a, b, _ = period_range("month")
    out = []
    async for biz in db.businesses.find({"owner_id": str(user["_id"]), "deleted_at": None, "archived": {"$ne": True}}).sort("created_at", 1):
        bid = str(biz["_id"])
        f = {"business_id": bid, "deleted_at": None}
        sales = 0.0
        async for inv in db.invoices.find(date_query({**f, "status": LIVE_SALE}, a, b)):
            sales += inv["totals"]["total"]
        async for s in db.sales.find(date_query({**f, **LIVE_QUICK}, a, b)):
            sales += s["totals"]["total"]
        out.append({**clean(biz), "shops": shop_list(biz), "sales": round(sales, 2),
                    "users": await db.users.count_documents({"business_id": bid}),
                    "plan": biz.get("plan", "Free"), "active": bid == str(user.get("business_id") or "")})
    return {"businesses": out, "active_id": str(user.get("business_id") or "")}


@router.post("/businesses", status_code=201)
async def add_business(data: BusinessCreateIn, user: CurrentUser):
    await ensure_feature(user, "multi_business")
    await ensure_limit(user, "businesses",
                       await db.businesses.count_documents({"owner_id": str(user["_id"]), "deleted_at": None, "archived": {"$ne": True}}))
    doc = {**data.model_dump(exclude={"shop_name", "copy_settings_from"}), "owner_id": str(user["_id"]),
           "shops": [{"name": data.shop_name, "address": data.address, "phone": data.phone, "sells": True, "is_main": True}],
           "plan": "trial", "trial_ends_at": now() + timedelta(days=TRIAL_DAYS), "created_at": now()}
    if data.copy_settings_from and ObjectId.is_valid(data.copy_settings_from):
        src = await db.businesses.find_one({"_id": ObjectId(data.copy_settings_from), "owner_id": str(user["_id"])})
        if src:
            doc["settings"] = src.get("settings", {})
    res = await db.businesses.insert_one(doc)
    bid = str(res.inserted_id)
    await db.accounts.insert_one({"business_id": bid, "deleted_at": None, "name": "Cash till", "kind": "cash",
                                  "detail": "Cash on hand", "opening_balance": 0, "created_at": now()})
    return clean(await db.businesses.find_one({"_id": res.inserted_id}))


@router.post("/businesses/{bid}/switch")
async def switch_business(bid: str, user: CurrentUser):
    biz = await db.businesses.find_one({"_id": oid(bid), "owner_id": str(user["_id"])})
    if not biz:
        raise HTTPException(404, "Business not found")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"business_id": bid, "shop": ""}})
    return clean(biz)


# ---------------------------------------------------------------- 00.5 addresses & numbers
@router.get("/business/addresses")
async def list_addresses(user: CurrentUser):
    f = biz_filter(user)
    return [clean(a) async for a in db.addresses.find(f).sort("created_at", 1)]


@router.post("/business/addresses", status_code=201)
async def add_address(data: AddressIn, user: CurrentUser):
    f = biz_filter(user)
    if data.is_default:
        await db.addresses.update_many({**f, "kind": data.kind}, {"$set": {"is_default": False}})
    res = await db.addresses.insert_one({**data.model_dump(), **f, "created_at": now()})
    return clean(await db.addresses.find_one({"_id": res.inserted_id}))


@router.delete("/business/addresses/{aid}")
async def delete_address(aid: str, user: CurrentUser):
    f = biz_filter(user)
    await db.addresses.update_one({"_id": oid(aid), **f}, {"$set": {"deleted_at": now()}})
    return {"ok": True}


# ---------------------------------------------------------------- 05.7 / 05.8 transfers
@router.get("/transfers")
async def list_transfers(user: CurrentUser):
    f = biz_filter(user)
    # A transfer belongs to two shops, so the one in view sees it from either end.
    sc = await shop_scope(user, "stock")
    if sc["shops"] is not None:
        f = {**f, "$or": [{"from_shop": {"$in": sc["shops"]}}, {"to_shop": {"$in": sc["shops"]}}]}
    out = [clean(t) async for t in db.transfers.find(f).sort("created_at", -1)]
    counts = {"pending": 0, "transit": 0, "received": 0, "discrepancy": 0}
    for t in out:
        counts[t["state"]] = counts.get(t["state"], 0) + 1
    return {"transfers": out, "counts": counts}


@router.post("/transfers", status_code=201)
async def create_transfer(data: TransferIn, user: CurrentUser):
    f = biz_filter(user)
    await ensure_feature(user, "transfers")
    if not data.lines:
        raise HTTPException(400, "Add at least one item")
    if data.from_shop == data.to_shop:
        raise HTTPException(400, "Pick two different shops")
    value = 0.0
    lines = []
    for l in data.lines:
        it = await db.items.find_one({"_id": oid(l.item_id), **f})
        cost = (it or {}).get("cost_price") or 0
        value += l.quantity * cost
        lines.append({**l.model_dump(), "unit": l.unit or (it or {}).get("unit", "unit"), "cost": cost, "received": None, "reason": ""})
    number = await next_number(f["business_id"], "transfer", "TRF", 100)
    state = "pending" if data.needs_approval else "transit"
    res = await db.transfers.insert_one({**f, "number": number, "from_shop": data.from_shop, "to_shop": data.to_shop, "lines": lines,
                                         "value": round(value, 2), "units": round(sum(l.quantity for l in data.lines), 2), "state": state,
                                         "note": data.note, "sent_by": user.get("name", ""), "received_by": "", "received_at": None,
                                         "created_by": user.get("name", ""), "created_at": now()})
    await log_activity(f["business_id"], user, "transfer", f"Transfer {number}", f"{data.from_shop} → {data.to_shop}", round(value, 2), str(res.inserted_id))
    return clean(await db.transfers.find_one({"_id": res.inserted_id}))


@router.get("/transfers/{tid}")
async def get_transfer(tid: str, user: CurrentUser):
    f = biz_filter(user)
    t = await db.transfers.find_one({"_id": oid(tid), **f})
    if not t:
        raise HTTPException(404, "Transfer not found")
    return clean(t)


@router.post("/transfers/{tid}/approve")
async def approve_transfer(tid: str, user: CurrentUser):
    f = biz_filter(user)
    t = await db.transfers.find_one({"_id": oid(tid), **f})
    if not t or t["state"] != "pending":
        raise HTTPException(400, "Transfer is not awaiting approval")
    for l in t["lines"]:
        await apply_stock(f["business_id"], l["item_id"], -l["quantity"], "transfer_out", t["number"], user, f"To {t['to_shop']}", t["from_shop"])
    await db.transfers.update_one({"_id": t["_id"]}, {"$set": {"state": "transit", "approved_by": user.get("name", ""), "approved_at": now()}})
    await log_activity(f["business_id"], user, "transfer", f"{t['number']} approved", f"{t['from_shop']} → {t['to_shop']}", t["value"], tid)
    return clean(await db.transfers.find_one({"_id": t["_id"]}))


@router.post("/transfers/{tid}/reject")
async def reject_transfer(tid: str, body: dict, user: CurrentUser):
    f = biz_filter(user)
    reason = (body or {}).get("reason", "")
    if not reason:
        raise HTTPException(400, "Give a reason")
    r = await db.transfers.update_one({"_id": oid(tid), **f, "state": "pending"},
                                      {"$set": {"state": "rejected", "reason": reason, "rejected_by": user.get("name", "")}})
    if not r.matched_count:
        raise HTTPException(400, "Transfer is not awaiting approval")
    return {"ok": True}


@router.post("/transfers/{tid}/receive")
async def receive_transfer(tid: str, data: ReceiveIn, user: CurrentUser):
    f = biz_filter(user)
    t = await db.transfers.find_one({"_id": oid(tid), **f})
    if not t or t["state"] not in ("transit", "pending"):
        raise HTTPException(400, "Transfer cannot be received")
    got = {l.item_id: l for l in data.lines}
    short = False
    lines = []
    for l in t["lines"]:
        r = got.get(l["item_id"])
        received = l["quantity"] if r is None else r.received
        if received < l["quantity"] and not (r and r.reason):
            raise HTTPException(400, f"A shortfall on {l['name']} needs a reason")
        if received != l["quantity"]:
            short = True
        lines.append({**l, "received": received, "reason": (r.reason if r else "")})
        await apply_stock(f["business_id"], l["item_id"], received, "transfer_in", t["number"], user, f"From {t['from_shop']}", t["to_shop"])
    state = "discrepancy" if short else "received"
    await db.transfers.update_one({"_id": t["_id"]}, {"$set": {"lines": lines, "state": state, "received_by": user.get("name", ""), "received_at": now()}})
    await log_activity(f["business_id"], user, "transfer", f"{t['number']} received", f"{t['from_shop']} → {t['to_shop']}", t["value"], tid,
                       reason="Short on receipt" if short else "")
    return clean(await db.transfers.find_one({"_id": t["_id"]}))
