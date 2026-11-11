"""Rail 13 — bills & receipts, waybills, business card."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal, Optional
from bson import ObjectId

from deps import CurrentUser, doc_business, biz_filter, clean, db, log_activity, next_number, now, oid, scoped, writing_shop

router = APIRouter(prefix="/api")


class ReceiptIn(BaseModel):
    photo_url: str
    title: str = ""
    amount: float = 0
    kind: Literal["purchase", "expense", "other"] = "other"
    link_type: Optional[Literal["purchase", "expense"]] = None
    link_id: Optional[str] = None


class WaybillLine(BaseModel):
    name: str
    unit: str = "Piece"
    quantity: float = 1
    unit_price: float = 0


class WaybillIn(BaseModel):
    invoice_id: Optional[str] = None
    customer_name: str = ""
    deliver_to: str = ""
    driver: str = ""
    vehicle: str = ""
    lines: List[WaybillLine] = []
    show_prices: bool = False
    status: Literal["draft", "issued"] = "draft"


class CardIn(BaseModel):
    tagline: str = ""
    hours: str = ""
    show_tin: bool = False
    include_bank: bool = False
    bank_account_id: Optional[str] = None
    style: Literal["green", "deep", "mint"] = "green"


# ---------------------------------------------------------------- 13.1 bills & receipts
@router.get("/receipts")
async def list_receipts(user: CurrentUser, kind: str = "all"):
    f = await scoped(user, "stock")
    q = dict(f)
    if kind == "unlinked":
        q["link_id"] = None
    elif kind in ("purchase", "expense"):
        q["kind"] = kind
    rows = [clean(r) async for r in db.receipts.find(q).sort("created_at", -1)]
    unlinked = await db.receipts.count_documents({**f, "link_id": None})
    return {"receipts": rows, "unlinked": unlinked, "total": await db.receipts.count_documents(f)}


@router.post("/receipts", status_code=201)
async def add_receipt(data: ReceiptIn, user: CurrentUser):
    f = biz_filter(user)
    res = await db.receipts.insert_one({**data.model_dump(), **f, "shop": await writing_shop(user),
                                        "created_by": user.get("name", ""), "created_by_id": str(user["_id"]), "created_at": now()})
    return clean(await db.receipts.find_one({"_id": res.inserted_id}))


@router.post("/receipts/{rid}/link")
async def link_receipt(rid: str, body: dict, user: CurrentUser):
    f = biz_filter(user)
    link_type, link_id = body.get("link_type"), body.get("link_id")
    if link_type not in ("purchase", "expense") or not link_id:
        raise HTTPException(400, "Pick a purchase or expense to attach it to")
    r = await db.receipts.update_one({"_id": oid(rid), **f}, {"$set": {"link_type": link_type, "link_id": link_id, "kind": link_type}})
    if not r.matched_count:
        raise HTTPException(404, "Receipt not found")
    coll = db.purchases if link_type == "purchase" else db.expenses
    rec = await db.receipts.find_one({"_id": oid(rid)})
    await coll.update_one({"_id": ObjectId(link_id), **f}, {"$set": {"receipt_url": rec["photo_url"]}})
    return clean(rec)


@router.get("/receipts/attachables")
async def attachables(user: CurrentUser):
    f = biz_filter(user)
    out = []
    async for e in db.expenses.find({**f, "receipt_url": None}).sort("created_at", -1).limit(30):
        out.append({"id": str(e["_id"]), "type": "expense", "title": e.get("note") or e["category"], "amount": e["amount"], "date": e["created_at"].isoformat()})
    async for p in db.purchases.find({**f, "receipt_url": None}).sort("created_at", -1).limit(30):
        out.append({"id": str(p["_id"]), "type": "purchase", "title": f"{p['number']} · {p.get('supplier_name', '')}", "amount": p.get("total", 0), "date": p["created_at"].isoformat()})
    out.sort(key=lambda r: r["date"], reverse=True)
    return out


# ---------------------------------------------------------------- 13.2 waybill
@router.get("/waybills")
async def list_waybills(user: CurrentUser):
    f = await scoped(user, "sales")
    return [clean(w) async for w in db.waybills.find(f).sort("created_at", -1)]


@router.post("/waybills", status_code=201)
async def create_waybill(data: WaybillIn, user: CurrentUser):
    f = biz_filter(user)
    lines = [l.model_dump() for l in data.lines]
    if data.invoice_id and not lines:
        inv = await db.invoices.find_one({"_id": oid(data.invoice_id), **f})
        if inv:
            lines = [{"name": l["name"], "unit": l.get("unit") or "Piece", "quantity": l["quantity"],
                      "unit_price": l.get("unit_price") or 0} for l in inv.get("lines", [])]
    number = await next_number(f["business_id"], "waybill", "WB", 230)
    doc = {**data.model_dump(exclude={"lines"}), "lines": lines, "number": number, "packages": round(sum(l["quantity"] for l in lines), 2),
           **f, "shop": await writing_shop(user), "created_by": user.get("name", ""), "created_by_id": str(user["_id"]), "created_at": now()}
    res = await db.waybills.insert_one(doc)
    await log_activity(f["business_id"], user, "waybill", f"Waybill {number}", data.customer_name, 0, str(res.inserted_id))
    return clean(await db.waybills.find_one({"_id": res.inserted_id}))


@router.get("/waybills/{wid}")
async def get_waybill(wid: str, user: CurrentUser):
    f = biz_filter(user)
    w = await db.waybills.find_one({"_id": oid(wid), **f})
    if not w:
        raise HTTPException(404, "Waybill not found")
    d = clean(w)
    d["business"] = await doc_business(f["business_id"])
    if w.get("invoice_id"):
        inv = await db.invoices.find_one({"_id": ObjectId(w["invoice_id"])})
        d["invoice_number"] = inv["number"] if inv else ""
        d["invoice_total"] = inv["totals"]["total"] if inv else 0
    return d


# ---------------------------------------------------------------- 13.4 business card
@router.get("/business/card")
async def get_card(user: CurrentUser):
    f = biz_filter(user)
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    card = biz.get("card") or {}
    bank = None
    if card.get("bank_account_id") and ObjectId.is_valid(card["bank_account_id"]):
        acc = await db.accounts.find_one({"_id": ObjectId(card["bank_account_id"])})
        bank = {"name": acc["name"], "detail": acc.get("detail", "")} if acc else None
    accounts = [{"id": str(a["_id"]), "name": a["name"], "detail": a.get("detail", "")} async for a in db.accounts.find({**f, "kind": "bank"})]
    return {"name": biz.get("name", ""), "tagline": card.get("tagline", ""), "phone": biz.get("phone", ""), "address": biz.get("address", ""),
            "tin": biz.get("tin", ""), "hours": card.get("hours", "Mon–Sat, 8:00 – 18:30"), "show_tin": card.get("show_tin", False),
            "include_bank": card.get("include_bank", False), "style": card.get("style", "green"), "bank": bank, "bank_accounts": accounts}


@router.put("/business/card")
async def put_card(data: CardIn, user: CurrentUser):
    f = biz_filter(user)
    await db.businesses.update_one({"_id": ObjectId(f["business_id"])}, {"$set": {"card": data.model_dump()}})
    return await get_card(user)
