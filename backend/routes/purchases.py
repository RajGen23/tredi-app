"""Rail 06 — Suppliers, supplier profile, record purchase, and sales returns."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal
from bson import ObjectId

from deps import (CurrentUser, LIVE_PO, LineIn, apply_stock, biz_filter, clean, db, line_totals, log_activity, next_number, now, oid, scoped, writing_shop)
from datetime import date as _date, datetime, timezone

router = APIRouter(prefix="/api")


def _on_date(value: Optional[str]) -> datetime:
    """The date the trader put on the bill, not the moment they typed it."""
    if not value:
        return now()
    try:
        d0 = _date.fromisoformat(value[:10])
    except ValueError:
        return now()
    n = now()
    return datetime.combine(d0, n.timetz() if d0 == n.date() else datetime.min.time().replace(tzinfo=timezone.utc))


class SupplierIn(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    address: str = ""
    category: str = "General"
    opening_balance: float = 0
    note: str = ""


class PurchaseLine(BaseModel):
    item_id: Optional[str] = None
    name: str
    quantity: float = 1
    unit_cost: float = 0
    unit: str = ""


class PurchaseIn(BaseModel):
    supplier_id: str
    lines: List[PurchaseLine]
    paid: float = 0
    account_id: Optional[str] = None
    method: Literal["cash", "transfer", "credit", "card"] = "credit"
    date: Optional[str] = None
    due_date: Optional[str] = None
    shop: str = ""
    note: str = ""
    update_cost: bool = True


class SupplierPaymentIn(BaseModel):
    supplier_id: str
    amount: float
    account_id: Optional[str] = None
    note: str = ""


class ReturnLine(BaseModel):
    item_id: Optional[str] = None
    name: str
    quantity: float = 1
    unit_price: float = 0


class ReturnIn(BaseModel):
    invoice_id: Optional[str] = None
    customer_id: Optional[str] = None
    lines: List[ReturnLine]
    reason: str
    restock: bool = True


async def supplier_owed(f: dict, sid: str) -> float:
    owed = 0.0
    s = await db.suppliers.find_one({"_id": oid(sid)})
    owed += (s or {}).get("opening_balance", 0)
    async for p in db.purchases.find({**f, "supplier_id": sid, **LIVE_PO}):
        owed += (p.get("total") or 0) - (p.get("paid") or 0)
    async for p in db.supplier_payments.find({**f, "supplier_id": sid}):
        # purchases.paid already carries the allocated part, so only the
        # unallocated remainder still reduces what we owe
        owed -= p["amount"] - p.get("allocated", p["amount"])
    return round(owed, 2)


@router.get("/suppliers")
async def list_suppliers(user: CurrentUser):
    f = biz_filter(user)
    out = []
    async for s in db.suppliers.find(f).sort("name", 1):
        d = clean(s)
        d["owed"] = await supplier_owed(f, d["id"])
        d["purchases"] = await db.purchases.count_documents({**f, "supplier_id": d["id"], **LIVE_PO})
        last = await db.purchases.find_one({**f, "supplier_id": d["id"]}, sort=[("created_at", -1)])
        d["last_purchase"] = last["created_at"].isoformat() if last else None
        out.append(d)
    total = round(sum(x["owed"] for x in out), 2)
    return {"suppliers": out, "owed": total, "count": len(out)}


@router.post("/suppliers", status_code=201)
async def create_supplier(data: SupplierIn, user: CurrentUser):
    f = biz_filter(user)
    res = await db.suppliers.insert_one({**data.model_dump(), **f, "created_by": user.get("name", ""), "created_at": now()})
    await log_activity(f["business_id"], user, "supplier", f"Supplier {data.name} added")
    return clean(await db.suppliers.find_one({"_id": res.inserted_id}))


@router.put("/suppliers/{sid}")
async def update_supplier(sid: str, data: SupplierIn, user: CurrentUser):
    """Correct a supplier's details — phone, address, what they supply. The
    opening balance is part of the form, so it stays editable too."""
    f = biz_filter(user)
    s = await db.suppliers.find_one({"_id": oid(sid), **f})
    if not s:
        raise HTTPException(404, "Supplier not found")
    await db.suppliers.update_one({"_id": s["_id"]}, {"$set": {
        **data.model_dump(), "updated_at": now(), "updated_by": user.get("name", "")}})
    await log_activity(f["business_id"], user, "supplier", f"Supplier {data.name} updated", "", 0, sid)
    return clean(await db.suppliers.find_one({"_id": s["_id"]}))


@router.get("/suppliers/{sid}")
async def get_supplier(sid: str, user: CurrentUser):
    f = biz_filter(user)
    s = await db.suppliers.find_one({"_id": oid(sid), **f})
    if not s:
        raise HTTPException(404, "Supplier not found")
    d = clean(s)
    d["owed"] = await supplier_owed(f, sid)
    accounts = {str(a["_id"]): a["name"] async for a in db.accounts.find(f)}
    purchases = [clean(p) async for p in db.purchases.find({**f, "supplier_id": sid}).sort("created_at", -1)]
    for p in purchases:
        p["due"] = round((p.get("total") or 0) - (p.get("paid") or 0), 2)
        p["account_name"] = accounts.get(p.get("account_id") or "", "Cash" if p.get("method") == "cash" else "On credit")
    d["purchases"] = purchases
    payments = [clean(p) async for p in db.supplier_payments.find({**f, "supplier_id": sid}).sort("created_at", -1)]
    for p in payments:
        p["account_name"] = accounts.get(p.get("account_id") or "", "Cash")
    d["payments"] = payments
    d["total_purchased"] = round(sum(p.get("total") or 0 for p in purchases), 2)
    d["items"] = [clean(i) async for i in db.items.find({**f, "supplier": s["name"]}).limit(20)]
    return d


@router.post("/purchases", status_code=201)
async def create_purchase(data: PurchaseIn, user: CurrentUser):
    f = biz_filter(user)
    if not data.lines:
        raise HTTPException(400, "Add at least one item")
    sup = await db.suppliers.find_one({"_id": oid(data.supplier_id), **f})
    if not sup:
        raise HTTPException(404, "Supplier not found")
    lines = [{**l.model_dump(), "total": round(l.quantity * l.unit_cost, 2)} for l in data.lines]
    total = round(sum(l["total"] for l in lines), 2)
    number = await next_number(f["business_id"], "purchase", "PO", 400)
    shop = await writing_shop(user, data.shop)
    created = _on_date(data.date)
    doc = {**f, "supplier_id": data.supplier_id, "supplier_name": sup["name"], "number": number, "lines": lines, "total": total,
           "paid": min(data.paid, total), "account_id": data.account_id, "method": data.method, "due_date": data.due_date,
           "shop": shop, "note": data.note, "created_by": user.get("name", ""), "created_at": created}
    res = await db.purchases.insert_one(doc)
    for l in lines:
        await apply_stock(f["business_id"], l.get("item_id"), l["quantity"], "purchase", number, user, sup["name"], shop)
        if data.update_cost and l.get("item_id") and ObjectId.is_valid(l["item_id"]) and l["unit_cost"]:
            await db.items.update_one({"_id": ObjectId(l["item_id"]), **f}, {"$set": {"cost_price": l["unit_cost"], "updated_at": now()}})
    await log_activity(f["business_id"], user, "purchase", f"Purchase {number}", sup["name"], total, str(res.inserted_id), shop)
    return clean(await db.purchases.find_one({"_id": res.inserted_id}))


@router.put("/purchases/{pid}")
async def update_purchase(pid: str, data: PurchaseIn, user: CurrentUser):
    """Correct a purchase order. The old delivery comes back off the shelf, the
    new one goes on, and what you owe the supplier is restated."""
    f = biz_filter(user)
    p = await db.purchases.find_one({"_id": oid(pid), **f})
    if not p:
        raise HTTPException(404, "Purchase not found")
    if p.get("cancelled_at"):
        raise HTTPException(400, "This order is cancelled — restore it before editing")
    if not data.lines:
        raise HTTPException(400, "Add at least one item")
    sup = await db.suppliers.find_one({"_id": oid(data.supplier_id), **f})
    if not sup:
        raise HTTPException(404, "Supplier not found")
    shop = p.get("shop", "")
    for l in p.get("lines", []):
        await apply_stock(f["business_id"], l.get("item_id"), -l["quantity"], "edit", p["number"], user, "Order edited", shop)
    lines = [{**l.model_dump(), "total": round(l.quantity * l.unit_cost, 2)} for l in data.lines]
    total = round(sum(l["total"] for l in lines), 2)
    await db.purchases.update_one({"_id": p["_id"]}, {"$set": {
        "supplier_id": data.supplier_id, "supplier_name": sup["name"], "lines": lines, "total": total,
        "paid": min(data.paid, total), "account_id": data.account_id, "method": data.method,
        "due_date": data.due_date, "note": data.note,
        "updated_at": now(), "updated_by": user.get("name", "")}})
    for l in lines:
        await apply_stock(f["business_id"], l.get("item_id"), l["quantity"], "purchase", p["number"], user, sup["name"], shop)
        if data.update_cost and l.get("item_id") and ObjectId.is_valid(l["item_id"]) and l["unit_cost"]:
            await db.items.update_one({"_id": ObjectId(l["item_id"]), **f}, {"$set": {"cost_price": l["unit_cost"], "updated_at": now()}})
    await log_activity(f["business_id"], user, "purchase", f"Purchase {p['number']} edited", sup["name"], total, pid, shop)
    return clean(await db.purchases.find_one({"_id": p["_id"]}))


@router.post("/purchases/{pid}/cancel")
async def cancel_purchase(pid: str, body: dict, user: CurrentUser):
    """Void an order: the goods come off the shelf again and what you owed the
    supplier goes away. The PO number stays in the book."""
    f = biz_filter(user)
    p = await db.purchases.find_one({"_id": oid(pid), **f})
    if not p:
        raise HTTPException(404, "Purchase not found")
    if p.get("cancelled_at"):
        raise HTTPException(400, "This order is already cancelled")
    reason = (body or {}).get("reason", "").strip()
    shop = p.get("shop", "")
    for l in p.get("lines", []):
        await apply_stock(f["business_id"], l.get("item_id"), -l["quantity"], "cancel", p["number"], user, reason or "Order cancelled", shop)
    await db.purchases.update_one({"_id": p["_id"]}, {"$set": {"cancelled_at": now(), "cancelled_by": user.get("name", ""),
                                                               "cancelled_reason": reason}})
    await log_activity(f["business_id"], user, "purchase", f"Purchase {p['number']} cancelled", reason or p.get("supplier_name", ""),
                       p.get("total", 0), pid, shop)
    return {"ok": True, "message": f"{p['number']} is cancelled. The goods came off {shop or 'stock'} and "
                                   f"{p.get('supplier_name', 'the supplier')} is no longer owed for it."}


@router.post("/purchases/{pid}/uncancel")
async def uncancel_purchase(pid: str, user: CurrentUser):
    f = biz_filter(user)
    p = await db.purchases.find_one({"_id": oid(pid), **f})
    if not p or not p.get("cancelled_at"):
        raise HTTPException(404, "No cancelled order here")
    shop = p.get("shop", "")
    for l in p.get("lines", []):
        await apply_stock(f["business_id"], l.get("item_id"), l["quantity"], "purchase", p["number"], user, "Cancellation reversed", shop)
    await db.purchases.update_one({"_id": p["_id"]}, {"$unset": {"cancelled_at": "", "cancelled_by": "", "cancelled_reason": ""}})
    await log_activity(f["business_id"], user, "purchase", f"Purchase {p['number']} restored", p.get("supplier_name", ""), p.get("total", 0), pid, shop)
    return clean(await db.purchases.find_one({"_id": p["_id"]}))


@router.get("/purchases")
async def list_purchases(user: CurrentUser):
    f = await scoped(user, "stock")
    out = []
    async for p in db.purchases.find(f).sort("created_at", -1):
        d = clean(p)
        d["due"] = round((p.get("total") or 0) - (p.get("paid") or 0), 2)
        out.append(d)
    return {"purchases": out, "total": round(sum(p.get("total") or 0 for p in out), 2), "owed": round(sum(p["due"] for p in out), 2)}


@router.get("/purchases/{pid}")
async def get_purchase(pid: str, user: CurrentUser):
    """A purchase order opened up: what came in, at what cost, paid from where."""
    f = biz_filter(user)
    p = await db.purchases.find_one({"_id": oid(pid), **f})
    if not p:
        raise HTTPException(404, "Purchase not found")
    d = clean(p)
    d["due"] = round((p.get("total") or 0) - (p.get("paid") or 0), 2)
    acc = await db.accounts.find_one({"_id": ObjectId(p["account_id"])}) if p.get("account_id") and ObjectId.is_valid(p.get("account_id") or "") else None
    d["account_name"] = acc["name"] if acc else ("Cash till" if p.get("method") == "cash" else "On credit")
    sup = await db.suppliers.find_one({"_id": ObjectId(p["supplier_id"])}) if ObjectId.is_valid(p.get("supplier_id") or "") else None
    d["supplier"] = {"id": str(sup["_id"]), "name": sup.get("name", ""), "phone": sup.get("phone", ""), "email": sup.get("email", "")} if sup else None
    d["payments"] = []
    async for sp in db.supplier_payments.find({**f, "supplier_id": p.get("supplier_id")}).sort("created_at", -1):
        pacc = await db.accounts.find_one({"_id": ObjectId(sp["account_id"])}) if sp.get("account_id") and ObjectId.is_valid(sp.get("account_id") or "") else None
        d["payments"].append({"id": str(sp["_id"]), "amount": sp["amount"], "account_name": pacc["name"] if pacc else "Cash",
                              "note": sp.get("note", ""), "date": sp["created_at"].isoformat()})
    for l in d.get("lines", []):
        if l.get("item_id") and ObjectId.is_valid(l["item_id"]):
            it = await db.items.find_one({"_id": ObjectId(l["item_id"])})
            l["photo_url"] = (it or {}).get("photo_url", "")
            l["on_hand"] = (it or {}).get("quantity", 0)
    return d


@router.post("/supplier-payments", status_code=201)
async def pay_supplier(data: SupplierPaymentIn, user: CurrentUser):
    f = biz_filter(user)
    if data.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    sup = await db.suppliers.find_one({"_id": oid(data.supplier_id), **f})
    if not sup:
        raise HTTPException(404, "Supplier not found")
    remaining = data.amount
    async for p in db.purchases.find({**f, "supplier_id": data.supplier_id, **LIVE_PO}).sort("created_at", 1):
        due = (p.get("total") or 0) - (p.get("paid") or 0)
        if due <= 0 or remaining <= 0:
            continue
        take = min(due, remaining)
        await db.purchases.update_one({"_id": p["_id"]}, {"$inc": {"paid": take}})
        remaining -= take
    res = await db.supplier_payments.insert_one({**f, "supplier_id": data.supplier_id, "supplier_name": sup["name"], "amount": data.amount,
                                                 "allocated": round(data.amount - remaining, 2),
                                                 "account_id": data.account_id, "note": data.note or "Payment out",
                                                 "created_by": user.get("name", ""), "created_at": now()})
    await db.expenses.insert_one({**f, "amount": data.amount, "category": "Purchases", "account_id": data.account_id,
                                  "note": f"Paid {sup['name']}", "shop": "", "receipt_url": None, "supplier_payment_id": str(res.inserted_id),
                                  "created_by": user.get("name", ""), "created_at": now()})
    await log_activity(f["business_id"], user, "payment_out", f"Paid {sup['name']}", data.note, data.amount, str(res.inserted_id))
    return clean(await db.supplier_payments.find_one({"_id": res.inserted_id}))


@router.get("/returns")
async def list_returns(user: CurrentUser):
    f = await scoped(user, "sales")
    return [clean(r) async for r in db.returns.find(f).sort("created_at", -1)]


@router.post("/returns", status_code=201)
async def create_return(data: ReturnIn, user: CurrentUser):
    f = biz_filter(user)
    if not data.lines:
        raise HTTPException(400, "Add at least one item")
    lines = [line_totals(LineIn(item_id=l.item_id, name=l.name, quantity=l.quantity, unit_price=l.unit_price)) for l in data.lines]
    total = round(sum(l["total"] for l in lines), 2)
    number = await next_number(f["business_id"], "return", "RT", 100)
    res = await db.returns.insert_one({**f, "number": number, "invoice_id": data.invoice_id, "customer_id": data.customer_id, "lines": lines,
                                       "total": total, "reason": data.reason, "restock": data.restock,
                                       "created_by": user.get("name", ""), "created_at": now()})
    if data.restock:
        for l in lines:
            await apply_stock(f["business_id"], l.get("item_id"), l["quantity"], "return", number, user, data.reason)
    if data.customer_id:
        await db.payments.insert_one({**f, "customer_id": data.customer_id, "amount": total, "account_id": None, "method": "credit_note",
                                      "allocations": [{"invoice_id": data.invoice_id, "amount": total}] if data.invoice_id else [],
                                      "note": f"Credit note · {number}", "created_by": user.get("name", ""), "created_at": now()})
    await log_activity(f["business_id"], user, "return", f"Return {number}", data.reason, total, str(res.inserted_id))
    return clean(await db.returns.find_one({"_id": res.inserted_id}))
