from fastapi import FastAPI, APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Annotated, Literal
from datetime import datetime, timedelta, timezone, date
from bson import ObjectId
import logging

from deps import (VAT_RATE, DUMMY_HASH, LineIn, apply_stock, biz_filter, clean, client, create_access_token, current_user, customer_balance,
                  db, decorate_invoice, hash_password, invoice_paid, invoice_status, invoice_totals, line_totals, log_activity, next_number, now, oid,
                  public_user, scoped, shop_qty, shop_scope, stock_map, stock_rows, verify_password, writing_shop)
from routes import activity, admin, billing, documents, invoicing, lookups, offline, purchases, reports, shops, storage, users_roles
from plans import TRIAL_DAYS
from dummy_photos import pick_dummy_photo

app = FastAPI(title="TREDI API")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tredi")


# ---------------------------------------------------------------- schemas
class RegisterIn(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class BusinessIn(BaseModel):
    name: str
    type: str = "Retail"
    currency: str = "NGN"
    country: str = "NG"
    tin: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    phones: List[str] = []   # extra numbers that print on the invoice
    emails: List[str] = []   # extra addresses, e.g. accounts@
    track_stock: bool = True
    shop_name: str = "Main branch"


class CustomerIn(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    address: str = ""
    opening_balance: float = 0
    opening_type: Literal["owes_me", "i_owe"] = "owes_me"
    price_list: str = "Retail"
    credit_limit: Optional[float] = None


class PhotoIn(BaseModel):
    photo_url: str = ""


class ItemIn(BaseModel):
    name: str
    kind: Literal["product", "service"] = "product"
    category: str = "General"
    unit: str = "Piece"
    barcode: str = ""
    supplier: str = ""
    location: str = ""
    cost_price: float = 0
    selling_price: float = 0
    wholesale_price: Optional[float] = None
    track_stock: bool = True
    quantity: float = 0
    alert_below: float = 0
    expiry: Optional[str] = None
    photo_url: Optional[str] = None


class AdjustIn(BaseModel):
    mode: Literal["set", "add", "remove"]
    quantity: float
    reason: str
    note: str = ""


class InvoiceIn(BaseModel):
    customer_id: Optional[str] = None
    lines: List[LineIn]
    invoice_discount_type: Literal["amount", "percent", "final"] = "amount"
    invoice_discount_value: float = 0
    vat_rate: float = VAT_RATE
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    payment_mode: Literal["credit", "cash", "transfer", "card"] = "credit"
    account_id: Optional[str] = None
    status: Literal["draft", "issued"] = "issued"
    note: str = ""
    shop: str = ""
    terms_id: Optional[str] = None
    # 04.5 review-screen options
    shipping_fee: float = 0
    bank_account_ids: List[str] = []
    credit_applied: float = 0
    show_photos: Optional[bool] = None


class SaleIn(BaseModel):
    lines: List[LineIn]
    method: Literal["cash", "transfer", "card", "credit"] = "cash"
    tendered: float = 0
    customer_id: Optional[str] = None
    account_id: Optional[str] = None
    shop: str = ""


class PaymentIn(BaseModel):
    customer_id: str
    amount: float
    account_id: Optional[str] = None
    method: Literal["cash", "transfer", "card", "cheque", "other"] = "cash"
    date: Optional[str] = None
    allocations: List[dict] = []  # [{invoice_id, amount}]
    note: str = ""


class ExpenseIn(BaseModel):
    amount: float
    category: str
    account_id: Optional[str] = None
    date: Optional[str] = None
    note: str = ""
    shop: str = ""
    receipt_url: Optional[str] = None


class AccountIn(BaseModel):
    name: str
    kind: Literal["cash", "bank", "mobile"] = "cash"
    detail: str = ""
    opening_balance: float = 0


# ---------------------------------------------------------------- auth
@api.get("/health")
async def health():
    return {"ok": True}


@api.post("/auth/register", status_code=201)
async def register(data: RegisterIn):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email already registered")
    res = await db.users.insert_one({"name": data.name, "email": email, "password_hash": hash_password(data.password), "business_id": None, "created_at": now()})
    return {"access_token": create_access_token(str(res.inserted_id)), "token_type": "bearer", "user": public_user(await db.users.find_one({"_id": res.inserted_id}))}


@api.post("/auth/login")
async def login(form: Annotated[OAuth2PasswordRequestForm, Depends()]):
    user = await db.users.find_one({"email": form.username.lower()})
    if not user:
        verify_password(form.password, DUMMY_HASH)
        raise HTTPException(401, "Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    if not verify_password(form.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    return {"access_token": create_access_token(str(user["_id"])), "token_type": "bearer", "user": public_user(user)}


@api.get("/auth/me")
async def me(user: Annotated[dict, Depends(current_user)]):
    return public_user(user)


# ---------------------------------------------------------------- business
@api.post("/business")
async def create_business(data: BusinessIn, user: Annotated[dict, Depends(current_user)]):
    doc = {**data.model_dump(), "owner_id": str(user["_id"]), "shops": [{"name": data.shop_name, "address": data.address}],
           "plan": "trial", "trial_ends_at": now() + timedelta(days=TRIAL_DAYS), "created_at": now()}
    res = await db.businesses.insert_one(doc)
    bid = str(res.inserted_id)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"business_id": bid}})
    await db.accounts.insert_one({"business_id": bid, "name": "Cash till", "kind": "cash", "detail": "Cash on hand", "opening_balance": 0, "created_at": now(), "deleted_at": None})
    return clean(await db.businesses.find_one({"_id": res.inserted_id}))


@api.get("/business")
async def get_business(user: Annotated[dict, Depends(current_user)]):
    if not user.get("business_id"):
        return None
    b = await db.businesses.find_one({"_id": ObjectId(user["business_id"])})
    return clean(b) if b else None


@api.put("/business")
async def update_business(data: BusinessIn, user: Annotated[dict, Depends(current_user)]):
    # Merge: a screen that only edits the profile must not reset the rest.
    patch = data.model_dump(exclude={"shop_name"}, exclude_unset=True) or data.model_dump(exclude={"shop_name"})
    await db.businesses.update_one({"_id": ObjectId(user["business_id"])}, {"$set": patch})
    return clean(await db.businesses.find_one({"_id": ObjectId(user["business_id"])}))


# ---------------------------------------------------------------- customers
@api.get("/customers")
async def list_customers(user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    out = []
    async for c in db.customers.find(f).sort("name", 1):
        d = clean(c)
        d["balance"] = await customer_balance(f["business_id"], d["id"])
        inv_count = 0
        overdue = 0
        async for inv in db.invoices.find({**f, "customer_id": d["id"], "status": {"$ne": "draft"}}):
            st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
            if st["due"] > 0:
                inv_count += 1
                overdue = max(overdue, st["days_overdue"])
        d["open_invoices"] = inv_count
        d["days_overdue"] = overdue
        out.append(d)
    return out


@api.post("/customers", status_code=201)
async def create_customer(data: CustomerIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    doc = {**data.model_dump(), **f, "created_by": user.get("name", ""), "created_at": now()}
    res = await db.customers.insert_one(doc)
    d = clean(await db.customers.find_one({"_id": res.inserted_id}))
    d["balance"] = await customer_balance(f["business_id"], d["id"])
    return d


@api.get("/customers/{cid}")
async def get_customer(cid: str, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    c = await db.customers.find_one({"_id": oid(cid), **f})
    if not c:
        raise HTTPException(404, "Customer not found")
    d = clean(c)
    d["balance"] = await customer_balance(f["business_id"], cid)
    invoices = []
    async for inv in db.invoices.find({**f, "customer_id": cid}).sort("created_at", -1):
        invoices.append(await decorate_invoice(inv))
    d["invoices"] = invoices
    d["total_purchases"] = round(sum(i["totals"]["total"] for i in invoices if i["status"] != "draft"), 2)
    d["total_received"] = round(sum([p["amount"] async for p in db.payments.find({**f, "customer_id": cid})]), 2)
    d["overdue_count"] = sum(1 for i in invoices if i["status"] == "overdue")
    d["max_days_overdue"] = max([i["days_overdue"] for i in invoices] or [0])
    return d


@api.get("/customers/{cid}/ledger")
async def customer_ledger(cid: str, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    c = await db.customers.find_one({"_id": oid(cid), **f})
    if not c:
        raise HTTPException(404, "Customer not found")
    entries = []
    opening = c.get("opening_balance", 0) * (1 if c.get("opening_type") == "owes_me" else -1)
    async for inv in db.invoices.find({**f, "customer_id": cid, "status": {"$ne": "draft"}}):
        entries.append({"date": inv["created_at"], "title": inv["number"], "sub": f"Sale · {len(inv['lines'])} items", "amount": inv["totals"]["total"], "kind": "sale", "ref_id": str(inv["_id"])})
    async for p in db.payments.find({**f, "customer_id": cid}):
        acc = await db.accounts.find_one({"_id": ObjectId(p["account_id"])}) if p.get("account_id") and ObjectId.is_valid(p["account_id"]) else None
        entries.append({"date": p["created_at"], "title": "Payment received", "sub": acc["name"] if acc else "Payment", "amount": -p["amount"], "kind": "payment", "ref_id": str(p["_id"])})
    entries.sort(key=lambda e: e["date"])
    bal = opening
    for e in entries:
        bal = round(bal + e["amount"], 2)
        e["balance"] = bal
        e["date"] = e["date"].isoformat()
    entries.reverse()
    return {"customer": clean(c), "opening": opening, "closing": bal, "entries": entries}


# ---------------------------------------------------------------- items
@api.get("/items")
async def list_items(user: Annotated[dict, Depends(current_user)]):
    """The catalogue is shared; the quantity shown is the stock in view."""
    f = biz_filter(user)
    sc = await shop_scope(user, "stock")
    out = []
    async for i in db.items.find(f).sort("name", 1):
        d = clean(i)
        d["quantity_all"] = round(i.get("quantity", 0) or 0, 3)
        d["quantity"] = shop_qty(i, sc["shops"], sc["main"])
        d["stock_by_shop"] = stock_rows(stock_map(i, sc["main"]))
        out.append(d)
    return out


@api.post("/items", status_code=201)
async def create_item(data: ItemIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    shop = await writing_shop(user)
    doc = {**data.model_dump(), **f, "shop": shop, "created_by": user.get("name", ""), "created_at": now(), "updated_at": now()}
    if doc["kind"] == "service":
        doc["track_stock"] = False
    if not doc.get("photo_url"):
        doc["photo_url"] = pick_dummy_photo(doc["name"], doc["category"])
    doc["stock"] = stock_rows({shop: doc["quantity"]}) if doc["track_stock"] else []
    res = await db.items.insert_one(doc)
    if doc["track_stock"] and doc["quantity"]:
        await db.movements.insert_one({"business_id": f["business_id"], "item_id": str(res.inserted_id), "kind": "opening", "delta": doc["quantity"], "balance": doc["quantity"],
                                       "ref": "Opening stock", "note": "", "shop": shop, "by": user.get("name", ""), "created_at": now(), "deleted_at": None})
    return clean(await db.items.find_one({"_id": res.inserted_id}))


@api.get("/items/{iid}")
async def get_item(iid: str, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    i = await db.items.find_one({"_id": oid(iid), **f})
    if not i:
        raise HTTPException(404, "Item not found")
    sc = await shop_scope(user, "stock")
    d = clean(i)
    m = stock_map(i, sc["main"])
    d["quantity_all"] = round(i.get("quantity", 0) or 0, 3)
    d["quantity"] = shop_qty(i, sc["shops"], sc["main"])
    d["stock_by_shop"] = [{"shop": s, "qty": round(m.get(s, 0), 3)} for s in sc["visible"]]
    d["shop_in_view"] = sc["shops"][0] if sc["shops"] and len(sc["shops"]) == 1 else ""
    d["movements"] = [clean(mv) async for mv in db.movements.find({**f, "item_id": iid}).sort("created_at", -1).limit(50)]
    d["adjustments"] = [mv for mv in d["movements"] if mv["kind"] == "adjustment"]
    return d


@api.put("/items/{iid}")
async def update_item(iid: str, data: ItemIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    await db.items.update_one({"_id": oid(iid), **f}, {"$set": {**data.model_dump(exclude={"quantity"}), "updated_at": now()}})
    return clean(await db.items.find_one({"_id": oid(iid)}))


@api.patch("/items/{iid}/photo")
async def set_item_photo(iid: str, data: PhotoIn, user: Annotated[dict, Depends(current_user)]):
    """Photo only — the bulk photo screen should not have to send a whole item."""
    f = biz_filter(user)
    res = await db.items.update_one({"_id": oid(iid), **f}, {"$set": {"photo_url": data.photo_url or None, "updated_at": now()}})
    if not res.matched_count:
        raise HTTPException(404, "Item not found")
    return clean(await db.items.find_one({"_id": oid(iid)}))


@api.post("/items/{iid}/adjust")
async def adjust_item(iid: str, data: AdjustIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    i = await db.items.find_one({"_id": oid(iid), **f})
    if not i:
        raise HTTPException(404, "Item not found")
    cur = i.get("quantity", 0)
    sc = await shop_scope(user, "stock")
    where = await writing_shop(user)
    if sc["shops"]:
        cur = shop_qty(i, sc["shops"], sc["main"])
        where = sc["shops"][0]
    delta = data.quantity - cur if data.mode == "set" else (data.quantity if data.mode == "add" else -data.quantity)
    await apply_stock(f["business_id"], iid, delta, "adjustment", data.reason, user, data.note, where)
    await log_activity(f["business_id"], user, "stock", f"Stock adjusted — {i['name']} {delta:+g}", data.note, 0, iid, where, data.reason)
    return clean(await db.items.find_one({"_id": oid(iid)}))


# ---------------------------------------------------------------- invoices
def _issued_at(value: Optional[str]) -> datetime:
    """The date the trader put on the invoice, not the moment they typed it."""
    if not value:
        return now()
    try:
        d = date.fromisoformat(value[:10])
    except ValueError:
        return now()
    n = now()
    return datetime.combine(d, n.timetz() if d == n.date() else datetime.min.time().replace(tzinfo=timezone.utc))


@api.get("/invoices")
async def list_invoices(user: Annotated[dict, Depends(current_user)]):
    f = await scoped(user, "sales")
    return [await decorate_invoice(inv) async for inv in db.invoices.find(f).sort("created_at", -1)]


@api.post("/invoices/preview")
async def preview_invoice(data: InvoiceIn, user: Annotated[dict, Depends(current_user)]):
    lines = [line_totals(l) for l in data.lines]
    return {"lines": lines, "totals": invoice_totals(lines, data.invoice_discount_type, data.invoice_discount_value, data.vat_rate, data.shipping_fee)}


@api.post("/invoices", status_code=201)
async def create_invoice(data: InvoiceIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    if not data.lines:
        raise HTTPException(400, "Add at least one item")
    lines = [line_totals(l) for l in data.lines]
    totals = invoice_totals(lines, data.invoice_discount_type, data.invoice_discount_value, data.vat_rate, data.shipping_fee)
    number = await next_number(f["business_id"], "invoice", "INV", 1000) if data.status == "issued" else "Draft"
    shop = await writing_shop(user, data.shop)
    doc = {**data.model_dump(exclude={"lines", "shop", "issue_date"}), "shop": shop, "lines": lines, "totals": totals, "number": number, **f,
           "created_by": user.get("name", ""), "created_at": _issued_at(data.issue_date)}
    res = await db.invoices.insert_one(doc)
    inv_id = str(res.inserted_id)
    if data.status == "issued":
        for l in lines:
            await apply_stock(f["business_id"], l.get("item_id"), -l["quantity"], "sale", number, user, "", shop)
        if data.payment_mode != "credit":
            await db.payments.insert_one({**f, "customer_id": data.customer_id, "amount": totals["total"], "account_id": data.account_id, "method": data.payment_mode, "shop": shop,
                                          "allocations": [{"invoice_id": inv_id, "amount": totals["total"]}], "note": f"Paid at sale · {number}", "created_by": user.get("name", ""), "created_at": now()})
        # Unused credit the customer already paid in: applied as a payment so the
        # balance due drops and the ledger still balances.
        credit = round(min(data.credit_applied, totals["total"]), 2)
        if credit > 0 and data.customer_id:
            await db.payments.insert_one({**f, "customer_id": data.customer_id, "amount": credit, "account_id": None, "method": "credit", "shop": shop,
                                          "allocations": [{"invoice_id": inv_id, "amount": credit}], "note": f"Unused credit applied · {number}",
                                          "created_by": user.get("name", ""), "created_at": now(), "deleted_at": None})
    if data.status == "issued":
        await log_activity(f["business_id"], user, "invoice", f"{number} created", "", totals["total"], inv_id, shop)
        if totals["invoice_discount"]:
            await log_activity(f["business_id"], user, "discount", f"Discount added to {number}", "", -totals["invoice_discount"], inv_id, shop)
    return await decorate_invoice(await db.invoices.find_one({"_id": res.inserted_id}))


@api.get("/invoices/{iid}")
async def get_invoice(iid: str, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    inv = await db.invoices.find_one({"_id": oid(iid), **f})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    d = await decorate_invoice(inv)
    d["payments"] = [clean(p) async for p in db.payments.find({**f, "allocations.invoice_id": iid}).sort("created_at", -1)]
    d["business"] = clean(await db.businesses.find_one({"_id": ObjectId(f["business_id"])}))
    wb = await db.waybills.find_one({**f, "invoice_id": iid}, sort=[("created_at", -1)])
    d["waybill"] = {"id": str(wb["_id"]), "number": wb.get("number", "")} if wb else None
    return d


@api.put("/invoices/{iid}")
async def update_invoice(iid: str, data: InvoiceIn, user: Annotated[dict, Depends(current_user)]):
    """Correct an invoice. Stock follows the change line by line, so a typo does
    not leave the shelf wrong."""
    f = biz_filter(user)
    inv = await db.invoices.find_one({"_id": oid(iid), **f})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if not data.lines:
        raise HTTPException(400, "An invoice needs at least one item")
    lines = [line_totals(l) for l in data.lines]
    totals = invoice_totals(lines, data.invoice_discount_type, data.invoice_discount_value, data.vat_rate, data.shipping_fee)
    shop = inv.get("shop") or await writing_shop(user, data.shop)
    was_issued = inv.get("status") == "issued"
    if was_issued:
        before: dict = {}
        for l in inv.get("lines", []):
            if l.get("item_id"):
                before[l["item_id"]] = before.get(l["item_id"], 0) + l["quantity"]
        after: dict = {}
        for l in lines:
            if l.get("item_id"):
                after[l["item_id"]] = after.get(l["item_id"], 0) + l["quantity"]
        for item_id in set(before) | set(after):
            delta = before.get(item_id, 0) - after.get(item_id, 0)   # more sold = stock down
            if delta:
                await apply_stock(f["business_id"], item_id, delta, "sale", inv["number"], user, "Invoice edited", shop)
    patch = {**data.model_dump(exclude={"lines", "shop", "status", "issue_date"}), "lines": lines, "totals": totals, "shop": shop,
             "updated_at": now(), "updated_by": user.get("name", "")}
    if data.issue_date:
        patch["created_at"] = _issued_at(data.issue_date)
    await db.invoices.update_one({"_id": inv["_id"]}, {"$set": patch})
    await log_activity(f["business_id"], user, "invoice", f"{inv['number']} edited", "", totals["total"], iid, shop)
    return await decorate_invoice(await db.invoices.find_one({"_id": inv["_id"]}))


@api.post("/invoices/{iid}/issue")
async def issue_invoice(iid: str, user: Annotated[dict, Depends(current_user)]):
    """Confirm a draft as a sales order. The same document gets a number and the
    stock leaves the shelf — no second copy is created."""
    f = biz_filter(user)
    inv = await db.invoices.find_one({"_id": oid(iid), **f})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.get("status") != "draft":
        raise HTTPException(400, "This invoice is already a sales order")
    settings = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    inv_settings = ((settings or {}).get("settings") or {}).get("invoice") or {}
    prefix = inv_settings.get("prefix") or "INV"
    due_days = int(inv_settings.get("due_days") or 7)
    number = await next_number(f["business_id"], "invoice", prefix, 1000)
    shop = inv.get("shop") or await writing_shop(user)
    await db.invoices.update_one({"_id": inv["_id"]}, {"$set": {
        "status": "issued", "number": number, "issued_at": now(), "issued_by": user.get("name", ""),
        "due_date": inv.get("due_date") or (date.today() + timedelta(days=due_days)).isoformat(),
        "was_draft": True,
    }})
    for l in inv.get("lines", []):
        await apply_stock(f["business_id"], l.get("item_id"), -l["quantity"], "sale", number, user, "Draft confirmed", shop)
    if inv.get("payment_mode") and inv["payment_mode"] != "credit":
        await db.payments.insert_one({**f, "customer_id": inv.get("customer_id"), "amount": inv["totals"]["total"], "account_id": inv.get("account_id"),
                                      "method": inv["payment_mode"], "shop": shop, "allocations": [{"invoice_id": iid, "amount": inv["totals"]["total"]}],
                                      "note": f"Paid at sale · {number}", "created_by": user.get("name", ""), "created_at": now()})
    await log_activity(f["business_id"], user, "invoice", f"{number} confirmed as a sales order", "Stock deducted", inv["totals"]["total"], iid, shop)
    return await decorate_invoice(await db.invoices.find_one({"_id": inv["_id"]}))


@api.delete("/invoices/{iid}")
async def delete_invoice(iid: str, user: Annotated[dict, Depends(current_user)], reason: str = ""):
    """Cancel a draft or an invoice. Anything already taken off the shelf goes
    back, and the reason is kept on the record."""
    f = biz_filter(user)
    inv = await db.invoices.find_one({"_id": oid(iid), **f})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    paid = await invoice_paid(f["business_id"], iid)
    if paid > 0:
        raise HTTPException(400, "Payments are recorded against this invoice — delete those first")
    if inv.get("status") == "issued":
        if not reason:
            raise HTTPException(400, "Give a reason for cancelling an issued invoice")
        for l in inv.get("lines", []):
            await apply_stock(f["business_id"], l.get("item_id"), l["quantity"], "sale_reversed", inv["number"], user, reason, inv.get("shop", ""))
    await db.invoices.update_one({"_id": inv["_id"]}, {"$set": {"deleted_at": now(), "deleted_reason": reason, "deleted_by": user.get("name", "")}})
    await log_activity(f["business_id"], user, "invoice", f"{inv['number']} deleted", "", 0, iid, inv.get("shop", ""), reason)
    return {"ok": True, "number": inv["number"]}


# ---------------------------------------------------------------- quick sales
@api.post("/sales", status_code=201)
async def create_sale(data: SaleIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    if not data.lines:
        raise HTTPException(400, "Add at least one item")
    lines = [line_totals(l) for l in data.lines]
    totals = invoice_totals(lines, "amount", 0, 0)
    number = await next_number(f["business_id"], "sale", "SL", 536000)
    shop = await writing_shop(user, data.shop)
    change = round(max(0.0, data.tendered - totals["total"]), 2) if data.method == "cash" and data.tendered else 0
    doc = {**f, "number": number, "lines": lines, "totals": totals, "method": data.method, "tendered": data.tendered, "change": change, "customer_id": data.customer_id,
           "account_id": data.account_id, "shop": shop, "created_by": user.get("name", ""), "created_at": now(), "synced": True}
    res = await db.sales.insert_one(doc)
    await log_activity(f["business_id"], user, "sale", f"{number} · quick sale", data.method, totals["total"], str(res.inserted_id), shop)
    for l in lines:
        await apply_stock(f["business_id"], l.get("item_id"), -l["quantity"], "sale", number, user, "", shop)
    if data.method != "credit":
        await db.payments.insert_one({**f, "customer_id": data.customer_id, "amount": totals["total"], "account_id": data.account_id, "method": data.method, "allocations": [],
                                      "sale_id": str(res.inserted_id), "shop": shop, "note": f"Quick sale · {number}", "created_by": user.get("name", ""), "created_at": now()})
    return clean(await db.sales.find_one({"_id": res.inserted_id}))


@api.get("/sales")
async def list_sales(user: Annotated[dict, Depends(current_user)]):
    f = await scoped(user, "sales")
    out = []
    async for s in db.sales.find(f).sort("created_at", -1).limit(100):
        d = clean(s)
        cust = await db.customers.find_one({"_id": ObjectId(s["customer_id"])}) if s.get("customer_id") and ObjectId.is_valid(s.get("customer_id") or "") else None
        d["customer_name"] = cust["name"] if cust else "Cash sale"
        out.append(d)
    return out


@api.get("/sales/{sid}")
async def get_sale(sid: str, user: Annotated[dict, Depends(current_user)]):
    """One quick sale, with everything a receipt needs."""
    f = biz_filter(user)
    s = await db.sales.find_one({"_id": oid(sid), **f})
    if not s:
        raise HTTPException(404, "Sale not found")
    d = clean(s)
    acc = await db.accounts.find_one({"_id": ObjectId(s["account_id"])}) if s.get("account_id") and ObjectId.is_valid(s.get("account_id") or "") else None
    d["account_name"] = acc["name"] if acc else ("Cash till" if s.get("method") == "cash" else "")
    cust = await db.customers.find_one({"_id": ObjectId(s["customer_id"])}) if s.get("customer_id") and ObjectId.is_valid(s.get("customer_id") or "") else None
    d["customer_name"] = cust["name"] if cust else "Cash sale"
    d["customer_phone"] = (cust or {}).get("phone", "")
    d["business"] = clean(await db.businesses.find_one({"_id": ObjectId(f["business_id"])}))
    missing = [ObjectId(l["item_id"]) for l in d.get("lines", []) if not l.get("photo_url") and ObjectId.is_valid(l.get("item_id") or "")]
    if missing:
        photos = {str(i["_id"]): i.get("photo_url", "") async for i in db.items.find({"_id": {"$in": missing}})}
        for l in d["lines"]:
            if not l.get("photo_url"):
                l["photo_url"] = photos.get(l.get("item_id") or "", "")
    return d


# ---------------------------------------------------------------- payments & accounts
@api.get("/accounts")
async def list_accounts(user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    accs = [clean(a) async for a in db.accounts.find(f)]
    total_in = total_out = 0.0
    for a in accs:
        inn = sum([p["amount"] async for p in db.payments.find({**f, "account_id": a["id"]})])
        out = sum([e["amount"] async for e in db.expenses.find({**f, "account_id": a["id"]})])
        a["balance"] = round(a.get("opening_balance", 0) + inn - out, 2)
        a["entries"] = await db.payments.count_documents({**f, "account_id": a["id"]}) + await db.expenses.count_documents({**f, "account_id": a["id"]})
        total_in += inn
        total_out += out
    recent = []
    async for p in db.payments.find(f).sort("created_at", -1).limit(6):
        c = await db.customers.find_one({"_id": ObjectId(p["customer_id"])}) if p.get("customer_id") and ObjectId.is_valid(p["customer_id"]) else None
        recent.append({"id": str(p["_id"]), "title": c["name"] if c else "Cash sale", "sub": p.get("note", "Payment"), "amount": p["amount"], "date": p["created_at"].isoformat()})
    async for e in db.expenses.find(f).sort("created_at", -1).limit(6):
        recent.append({"id": str(e["_id"]), "title": e.get("note") or e["category"], "sub": f"Expense · {e['category']}", "amount": -e["amount"], "date": e["created_at"].isoformat()})
    recent.sort(key=lambda r: r["date"], reverse=True)
    return {"accounts": accs, "total": round(sum(a["balance"] for a in accs), 2), "in": round(total_in, 2), "out": round(total_out, 2), "recent": recent[:8]}


@api.post("/accounts", status_code=201)
async def create_account(data: AccountIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    res = await db.accounts.insert_one({**data.model_dump(), **f, "created_at": now()})
    return clean(await db.accounts.find_one({"_id": res.inserted_id}))


@api.post("/payments", status_code=201)
async def create_payment(data: PaymentIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    if data.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    allocations = data.allocations
    if not allocations:
        # auto-allocate oldest first
        remaining = data.amount
        async for inv in db.invoices.find({**f, "customer_id": data.customer_id, "status": {"$ne": "draft"}}).sort("created_at", 1):
            st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
            if st["due"] <= 0 or remaining <= 0:
                continue
            take = min(st["due"], remaining)
            allocations.append({"invoice_id": str(inv["_id"]), "amount": round(take, 2)})
            remaining -= take
    doc = {**f, "customer_id": data.customer_id, "amount": data.amount, "account_id": data.account_id, "method": "payment_in",
           "pay_method": data.method, "allocations": allocations, "note": data.note or "Payment in",
           "shop": await writing_shop(user), "created_by": user.get("name", ""), "created_at": _issued_at(data.date)}
    res = await db.payments.insert_one(doc)
    cust = await db.customers.find_one({"_id": oid(data.customer_id)})
    await log_activity(f["business_id"], user, "payment", f"Payment received — {(cust or {}).get('name', '')}", data.note, data.amount, str(res.inserted_id), doc["shop"])
    return clean(await db.payments.find_one({"_id": res.inserted_id}))


@api.delete("/payments/{pid}")
async def delete_payment(pid: str, reason: str, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    r = await db.payments.update_one({"_id": oid(pid), **f}, {"$set": {"deleted_at": now(), "deleted_reason": reason, "deleted_by": user.get("name", "")}})
    if not r.matched_count:
        raise HTTPException(404, "Payment not found")
    await log_activity(f["business_id"], user, "payment", "Payment deleted", "", 0, pid, user.get("shop", ""), reason)
    return {"ok": True}


# ---------------------------------------------------------------- expenses
@api.get("/expenses")
async def list_expenses(user: Annotated[dict, Depends(current_user)], period: str = "month"):
    f = await scoped(user, "reports")
    today = date.today()
    if period == "week":
        start = datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time(), tzinfo=timezone.utc)
        end = None
    elif period == "last_month":
        first = today.replace(day=1)
        end = datetime.combine(first, datetime.min.time(), tzinfo=timezone.utc)
        start = datetime.combine((first - timedelta(days=1)).replace(day=1), datetime.min.time(), tzinfo=timezone.utc)
    elif period == "all":
        start = end = None
    else:
        start = datetime.combine(today.replace(day=1), datetime.min.time(), tzinfo=timezone.utc)
        end = None
    q = dict(f)
    if start:
        q["created_at"] = {"$gte": start}
        if end:
            q["created_at"]["$lt"] = end
    items = []
    by_cat: dict = {}
    accounts = {str(a["_id"]): a["name"] async for a in db.accounts.find(biz_filter(user))}
    async for e in db.expenses.find(q).sort("created_at", -1):
        d = clean(e)
        d["account_name"] = accounts.get(e.get("account_id") or "", "Cash")
        items.append(d)
        by_cat[e["category"]] = round(by_cat.get(e["category"], 0) + e["amount"], 2)
    cats = sorted(by_cat.items(), key=lambda kv: -kv[1])
    return {"total": round(sum(by_cat.values()), 2), "count": len(items), "by_category": [{"category": k, "amount": v} for k, v in cats], "items": items}


@api.post("/expenses", status_code=201)
async def create_expense(data: ExpenseIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    doc = {**data.model_dump(exclude={"date", "shop"}), "shop": await writing_shop(user, data.shop), **f,
           "created_by": user.get("name", ""), "created_at": datetime.fromisoformat(data.date) if data.date else now()}
    res = await db.expenses.insert_one(doc)
    return clean(await db.expenses.find_one({"_id": res.inserted_id}))


# ---------------------------------------------------------------- dashboard
@api.get("/dashboard")
async def dashboard(user: Annotated[dict, Depends(current_user)]):
    f = await scoped(user, "reports")
    sc = await shop_scope(user, "stock")
    today = date.today()
    month_start = datetime.combine(today.replace(day=1), datetime.min.time(), tzinfo=timezone.utc)
    prev_start = datetime.combine((today.replace(day=1) - timedelta(days=1)).replace(day=1), datetime.min.time(), tzinfo=timezone.utc)

    async def sales_between(a, b):
        tot = 0.0
        async for inv in db.invoices.find({**f, "status": {"$ne": "draft"}, "created_at": {"$gte": a, "$lt": b}}):
            tot += inv["totals"]["total"]
        async for s in db.sales.find({**f, "created_at": {"$gte": a, "$lt": b}}):
            tot += s["totals"]["total"]
        return round(tot, 2)

    far = now() + timedelta(days=1)
    total_sales = await sales_between(month_start, far)
    prev_sales = await sales_between(prev_start, month_start)
    month_payments = [p["amount"] async for p in db.payments.find({**f, "created_at": {"$gte": month_start}})]
    # refunds are stored as negative payments — keep them out of "received" so the
    # headline stays money actually taken in
    received = round(sum(a for a in month_payments if a > 0), 2)
    refunded = round(-sum(a for a in month_payments if a < 0), 2)
    owed = 0.0
    async for inv in db.invoices.find({**f, "status": {"$ne": "draft"}}):
        owed += invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))["due"]
    expenses = [e async for e in db.expenses.find({**f, "created_at": {"$gte": month_start}})]
    # 7-day cash flow
    days = []
    for i in range(6, -1, -1):
        d0 = datetime.combine(today - timedelta(days=i), datetime.min.time(), tzinfo=timezone.utc)
        d1 = d0 + timedelta(days=1)
        inn = sum([p["amount"] async for p in db.payments.find({**f, "created_at": {"$gte": d0, "$lt": d1}})])
        out = sum([e["amount"] async for e in db.expenses.find({**f, "created_at": {"$gte": d0, "$lt": d1}})])
        days.append({"day": d0.strftime("%a"), "in": round(inn, 2), "out": round(out, 2)})
    stock_value = 0.0
    low = 0
    async for it in db.items.find(biz_filter(user)):
        if it.get("track_stock", True):
            qty = shop_qty(it, sc["shops"], sc["main"])
            stock_value += qty * it.get("cost_price", 0)
            if qty <= it.get("alert_below", 0):
                low += 1
    change_pct = round((total_sales - prev_sales) / prev_sales * 100) if prev_sales else None
    return {"month": today.strftime("%B %Y"), "total_sales": total_sales, "change_pct": change_pct, "received": received, "refunded": refunded, "owed": round(owed, 2),
            "expenses": round(sum(e["amount"] for e in expenses), 2), "expense_count": len(expenses), "purchases": round(stock_value, 2), "low_stock": low,
            "cashflow": days, "net_week": round(sum(d["in"] - d["out"] for d in days), 2), "user_name": user.get("name", ""),
            "shop": sc["shops"][0] if sc["shops"] and len(sc["shops"]) == 1 else "", "shops_in_view": sc["shops"] or sc["all"]}


# ---------------------------------------------------------------- demo seed
@api.post("/seed/demo")
async def seed_demo(user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    if await db.customers.count_documents(f):
        return {"seeded": False}
    bid = f["business_id"]
    acc_cash = await db.accounts.find_one({**f, "kind": "cash"})
    gtb = await db.accounts.insert_one({**f, "name": "GTB — 0221", "kind": "bank", "detail": "Business current", "opening_balance": 250000, "created_at": now()})
    await db.accounts.insert_one({**f, "name": "Mobile money", "kind": "mobile", "detail": "Opay merchant", "opening_balance": 52000, "created_at": now()})
    items_src = [("Adeba Rice 50kg", "Grains", "Bag", 52400, 62000, 58000, 8, 10, "Warehouse", "6009123400018"), ("Cooking Oil 5L", "Oils", "Piece", 8200, 9800, 9100, 142, 20, "Shelf A", ""),
                 ("Sugar 50kg", "Grains", "Bag", 39500, 44000, 41500, 3, 5, "Warehouse", ""), ("Cement 50kg", "Building", "Bag", 7600, 8200, 7900, 0, 10, "Yard", ""),
                 ("Detergent 1kg", "Home", "Piece", 1400, 1850, 1650, 64, 12, "Shelf B", ""), ("Semovita 10kg", "Grains", "Bag", 6300, 7400, 7000, 28, 6, "Shelf A", "")]
    item_ids = {}
    for n, cat, unit, cost, sell, whole, qty, alert, loc, bc in items_src:
        r = await db.items.insert_one({**f, "name": n, "kind": "product", "category": cat, "unit": unit, "barcode": bc, "supplier": "Ade Foods Ltd", "location": loc, "cost_price": cost,
                                       "selling_price": sell, "wholesale_price": whole, "track_stock": True, "quantity": qty, "alert_below": alert, "expiry": None, "photo_url": pick_dummy_photo(n, cat),
                                       "created_by": user.get("name", ""), "created_at": now(), "updated_at": now()})
        item_ids[n] = str(r.inserted_id)
    await db.items.insert_one({**f, "name": "Delivery within Lagos", "kind": "service", "category": "Services", "unit": "Service", "barcode": "", "supplier": "", "location": "", "cost_price": 0,
                               "selling_price": 5000, "wholesale_price": None, "track_stock": False, "quantity": 0, "alert_below": 0, "expiry": None, "photo_url": pick_dummy_photo("Delivery within Lagos", "Services"),
                               "created_by": user.get("name", ""), "created_at": now(), "updated_at": now()})
    custs = [("Blessing Adeyemi", "+234 803 442 1180", "Retail"), ("Kunle Stores", "+234 706 118 9002", "Wholesale"), ("Adeola Stores", "+234 812 555 0192", "Wholesale"),
             ("Grace Mwangi", "+234 815 220 7741", "Retail"), ("Ibrahim Okonkwo", "+234 909 331 4410", "Retail")]
    cids = {}
    for n, ph, pl in custs:
        r = await db.customers.insert_one({**f, "name": n, "phone": ph, "email": "", "address": "", "opening_balance": 0, "opening_type": "owes_me", "price_list": pl, "credit_limit": 150000,
                                           "created_by": user.get("name", ""), "created_at": now()})
        cids[n] = str(r.inserted_id)

    async def mk_inv(cust, lines, days_ago, due_in, pay=None, disc=(0, "amount")):
        ls = [line_totals(LineIn(item_id=item_ids.get(nm), name=nm, quantity=q, unit_price=p)) for nm, q, p in lines]
        tot = invoice_totals(ls, disc[1], disc[0], 0)
        number = await next_number(bid, "invoice", "INV", 1000)
        created = now() - timedelta(days=days_ago)
        r = await db.invoices.insert_one({**f, "customer_id": cids[cust], "lines": ls, "totals": tot, "number": number, "invoice_discount_type": disc[1], "invoice_discount_value": disc[0], "vat_rate": 0,
                                          "due_date": (created + timedelta(days=due_in)).date().isoformat(), "payment_mode": "credit", "account_id": None, "status": "issued", "note": "",
                                          "created_by": user.get("name", ""), "created_at": created})
        if pay:
            await db.payments.insert_one({**f, "customer_id": cids[cust], "amount": pay, "account_id": str(gtb.inserted_id), "method": "transfer", "allocations": [{"invoice_id": str(r.inserted_id), "amount": pay}],
                                          "note": f"Bank transfer · {number}", "created_by": user.get("name", ""), "created_at": created + timedelta(days=2)})

    await mk_inv("Adeola Stores", [("Adeba Rice 50kg", 1, 62000), ("Cooking Oil 5L", 2, 9800), ("Detergent 1kg", 8, 1800)], 20, 7, pay=96000)
    await mk_inv("Ibrahim Okonkwo", [("Sugar 50kg", 1, 44000), ("Cooking Oil 5L", 2, 9800)], 14, 8, pay=40000)
    await mk_inv("Blessing Adeyemi", [("Adeba Rice 50kg", 1, 62000), ("Cooking Oil 5L", 2, 9800), ("Delivery within Lagos", 1, 2400)], 10, -4)
    await mk_inv("Kunle Stores", [("Adeba Rice 50kg", 2, 58000), ("Cooking Oil 5L", 1, 9100), ("Sugar 50kg", 1, 41500)], 3, 7)
    await mk_inv("Grace Mwangi", [("Semovita 10kg", 2, 7400), ("Detergent 1kg", 2, 1850)], 6, 10, pay=18200)
    for amt, cat, note, days in [(18000, "Transport & fuel", "Generator diesel", 1), (45000, "Rent", "Shop rent — this month", 5), (6000, "Salaries", "Loader wages", 2), (13000, "Utilities", "PHCN bill", 9)]:
        await db.expenses.insert_one({**f, "amount": amt, "category": cat, "account_id": str(acc_cash["_id"]) if acc_cash else None, "note": note, "shop": "Ikeja", "receipt_url": None,
                                      "created_by": user.get("name", ""), "created_at": now() - timedelta(days=days)})
    for amt, days in [(81600, 0), (19600, 1), (62000, 3)]:
        number = await next_number(bid, "sale", "SL", 536000)
        await db.sales.insert_one({**f, "number": number, "lines": [], "totals": {"gross": amt, "line_discount": 0, "invoice_discount": 0, "taxable": amt, "vat": 0, "total": amt}, "method": "cash",
                                   "tendered": amt, "change": 0, "customer_id": None, "account_id": str(acc_cash["_id"]) if acc_cash else None, "created_by": user.get("name", ""),
                                   "created_at": now() - timedelta(days=days), "synced": True})
        await db.payments.insert_one({**f, "customer_id": None, "amount": amt, "account_id": str(acc_cash["_id"]) if acc_cash else None, "method": "cash", "allocations": [], "note": f"Quick sale · {number}",
                                      "created_by": user.get("name", ""), "created_at": now() - timedelta(days=days)})
    return {"seeded": True}


app.include_router(api)
app.include_router(reports.router)
app.include_router(purchases.router)
app.include_router(shops.router)
app.include_router(users_roles.router)
app.include_router(offline.router)
app.include_router(documents.router)
app.include_router(invoicing.router)
app.include_router(activity.router)
app.include_router(lookups.router)
app.include_router(storage.router)
app.include_router(billing.router)
app.include_router(admin.router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    try:
        storage.init_storage()
    except Exception as exc:
        logger.warning("Object storage not ready: %s", exc)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
