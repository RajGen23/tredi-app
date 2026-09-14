from fastapi import FastAPI, APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field, EmailStr, BeforeValidator
from typing import List, Optional, Annotated, Literal
from datetime import datetime, timedelta, timezone, date
from bson import ObjectId
from pathlib import Path
import jwt
import os
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = os.environ.get("JWT_ALGORITHM", "HS256")
TOKEN_MINUTES = int(os.environ.get("ACCESS_TOKEN_MINUTES", "43200"))
VAT_RATE = 7.5

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
DUMMY_HASH = pwd_context.hash("dummy-password-used-only-for-timing")

app = FastAPI(title="TREDI API")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tredi")

# ---------------------------------------------------------------- helpers
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


def now() -> datetime:
    return datetime.now(timezone.utc)


def oid(v: str) -> ObjectId:
    if not ObjectId.is_valid(v):
        raise HTTPException(404, "Not found")
    return ObjectId(v)


class BaseDocument(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    model_config = {"populate_by_name": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=True, exclude_none=True)
        d.pop("_id", None)
        return d

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls(**doc)


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


async def current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> dict:
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
    return user


def public_user(u: dict) -> dict:
    return {"id": str(u["_id"]), "name": u.get("name", ""), "email": u["email"], "business_id": str(u["business_id"]) if u.get("business_id") else None}


def biz_filter(user: dict) -> dict:
    if not user.get("business_id"):
        raise HTTPException(400, "Set up your business first")
    return {"business_id": str(user["business_id"]), "deleted_at": None}


# ---------------------------------------------------------------- schemas
class RegisterIn(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class BusinessIn(BaseModel):
    name: str
    type: str = "Retail"
    currency: str = "NGN"
    tin: str = ""
    address: str = ""
    phone: str = ""
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


class InvoiceIn(BaseModel):
    customer_id: Optional[str] = None
    lines: List[LineIn]
    invoice_discount_type: Literal["amount", "percent", "final"] = "amount"
    invoice_discount_value: float = 0
    vat_rate: float = VAT_RATE
    due_date: Optional[str] = None
    payment_mode: Literal["credit", "cash", "transfer", "card"] = "credit"
    account_id: Optional[str] = None
    status: Literal["draft", "issued"] = "issued"
    note: str = ""


class SaleIn(BaseModel):
    lines: List[LineIn]
    method: Literal["cash", "transfer", "card", "credit"] = "cash"
    tendered: float = 0
    customer_id: Optional[str] = None
    account_id: Optional[str] = None


class PaymentIn(BaseModel):
    customer_id: str
    amount: float
    account_id: Optional[str] = None
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


# ---------------------------------------------------------------- math
def line_totals(l: LineIn) -> dict:
    gross = round(l.quantity * l.unit_price, 2)
    disc = round(gross * l.discount_value / 100, 2) if l.discount_type == "percent" else round(min(l.discount_value, gross), 2)
    return {**l.model_dump(), "gross": gross, "discount": disc, "total": round(gross - disc, 2)}


def invoice_totals(lines: List[dict], dtype: str, dvalue: float, vat_rate: float) -> dict:
    gross = round(sum(x["gross"] for x in lines), 2)
    line_disc = round(sum(x["discount"] for x in lines), 2)
    after_lines = gross - line_disc
    if dtype == "percent":
        inv_disc = round(after_lines * dvalue / 100, 2)
    elif dtype == "final":
        # back-calculate so that taxable*(1+vat) == final
        taxable_target = dvalue / (1 + vat_rate / 100) if dvalue > 0 else after_lines
        inv_disc = round(max(0.0, after_lines - taxable_target), 2)
    else:
        inv_disc = round(min(dvalue, after_lines), 2)
    taxable = round(after_lines - inv_disc, 2)
    vat = round(taxable * vat_rate / 100, 2)
    return {"gross": gross, "line_discount": line_disc, "invoice_discount": inv_disc, "taxable": taxable, "vat": vat, "total": round(taxable + vat, 2)}


async def next_number(business_id: str, key: str, prefix: str, start: int) -> str:
    doc = await db.counters.find_one_and_update({"business_id": business_id, "key": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return f"{prefix}-{start + doc['seq']}"


async def apply_stock(business_id: str, item_id: Optional[str], qty_delta: float, kind: str, ref: str, user: dict, note: str = ""):
    if not item_id or not ObjectId.is_valid(item_id):
        return
    item = await db.items.find_one({"_id": ObjectId(item_id), "business_id": business_id})
    if not item or not item.get("track_stock", True):
        return
    new_qty = round(item.get("quantity", 0) + qty_delta, 3)
    await db.items.update_one({"_id": item["_id"]}, {"$set": {"quantity": new_qty, "updated_at": now()}})
    await db.movements.insert_one({"business_id": business_id, "item_id": item_id, "kind": kind, "delta": qty_delta, "balance": new_qty, "ref": ref, "note": note,
                                   "by": user.get("name", ""), "created_at": now(), "deleted_at": None})


async def customer_balance(business_id: str, customer_id: str) -> float:
    """Positive = customer owes us; negative = unused credit."""
    c = await db.customers.find_one({"_id": oid(customer_id)})
    bal = c.get("opening_balance", 0) * (1 if c.get("opening_type") == "owes_me" else -1)
    async for inv in db.invoices.find({"business_id": business_id, "customer_id": customer_id, "deleted_at": None, "status": {"$ne": "draft"}}):
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
    if status != "draft":
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
    if inv.get("customer_id"):
        c = await db.customers.find_one({"_id": ObjectId(inv["customer_id"])})
        out["customer_name"] = c["name"] if c else "Cash sale"
        out["customer_phone"] = c.get("phone", "") if c else ""
    else:
        out["customer_name"] = "Cash sale"
        out["customer_phone"] = ""
    return out


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
    doc = {**data.model_dump(), "owner_id": str(user["_id"]), "shops": [{"name": data.shop_name, "address": data.address}], "created_at": now()}
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
    await db.businesses.update_one({"_id": ObjectId(user["business_id"])}, {"$set": data.model_dump(exclude={"shop_name"})})
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
    f = biz_filter(user)
    return [clean(i) async for i in db.items.find(f).sort("name", 1)]


@api.post("/items", status_code=201)
async def create_item(data: ItemIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    doc = {**data.model_dump(), **f, "created_by": user.get("name", ""), "created_at": now(), "updated_at": now()}
    if doc["kind"] == "service":
        doc["track_stock"] = False
    res = await db.items.insert_one(doc)
    if doc["track_stock"] and doc["quantity"]:
        await db.movements.insert_one({"business_id": f["business_id"], "item_id": str(res.inserted_id), "kind": "opening", "delta": doc["quantity"], "balance": doc["quantity"],
                                       "ref": "Opening stock", "note": "", "by": user.get("name", ""), "created_at": now(), "deleted_at": None})
    return clean(await db.items.find_one({"_id": res.inserted_id}))


@api.get("/items/{iid}")
async def get_item(iid: str, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    i = await db.items.find_one({"_id": oid(iid), **f})
    if not i:
        raise HTTPException(404, "Item not found")
    d = clean(i)
    d["movements"] = [clean(m) async for m in db.movements.find({**f, "item_id": iid}).sort("created_at", -1).limit(50)]
    d["adjustments"] = [m for m in d["movements"] if m["kind"] == "adjustment"]
    return d


@api.put("/items/{iid}")
async def update_item(iid: str, data: ItemIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    await db.items.update_one({"_id": oid(iid), **f}, {"$set": {**data.model_dump(exclude={"quantity"}), "updated_at": now()}})
    return clean(await db.items.find_one({"_id": oid(iid)}))


@api.post("/items/{iid}/adjust")
async def adjust_item(iid: str, data: AdjustIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    i = await db.items.find_one({"_id": oid(iid), **f})
    if not i:
        raise HTTPException(404, "Item not found")
    cur = i.get("quantity", 0)
    delta = data.quantity - cur if data.mode == "set" else (data.quantity if data.mode == "add" else -data.quantity)
    await apply_stock(f["business_id"], iid, delta, "adjustment", data.reason, user, data.note)
    return clean(await db.items.find_one({"_id": oid(iid)}))


# ---------------------------------------------------------------- invoices
@api.get("/invoices")
async def list_invoices(user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    return [await decorate_invoice(inv) async for inv in db.invoices.find(f).sort("created_at", -1)]


@api.post("/invoices/preview")
async def preview_invoice(data: InvoiceIn, user: Annotated[dict, Depends(current_user)]):
    lines = [line_totals(l) for l in data.lines]
    return {"lines": lines, "totals": invoice_totals(lines, data.invoice_discount_type, data.invoice_discount_value, data.vat_rate)}


@api.post("/invoices", status_code=201)
async def create_invoice(data: InvoiceIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    if not data.lines:
        raise HTTPException(400, "Add at least one item")
    lines = [line_totals(l) for l in data.lines]
    totals = invoice_totals(lines, data.invoice_discount_type, data.invoice_discount_value, data.vat_rate)
    number = await next_number(f["business_id"], "invoice", "INV", 1000) if data.status == "issued" else "Draft"
    doc = {**data.model_dump(exclude={"lines"}), "lines": lines, "totals": totals, "number": number, **f, "created_by": user.get("name", ""), "created_at": now()}
    res = await db.invoices.insert_one(doc)
    inv_id = str(res.inserted_id)
    if data.status == "issued":
        for l in lines:
            await apply_stock(f["business_id"], l.get("item_id"), -l["quantity"], "sale", number, user)
        if data.payment_mode != "credit":
            await db.payments.insert_one({**f, "customer_id": data.customer_id, "amount": totals["total"], "account_id": data.account_id, "method": data.payment_mode,
                                          "allocations": [{"invoice_id": inv_id, "amount": totals["total"]}], "note": f"Paid at sale · {number}", "created_by": user.get("name", ""), "created_at": now()})
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
    return d


# ---------------------------------------------------------------- quick sales
@api.post("/sales", status_code=201)
async def create_sale(data: SaleIn, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    if not data.lines:
        raise HTTPException(400, "Add at least one item")
    lines = [line_totals(l) for l in data.lines]
    totals = invoice_totals(lines, "amount", 0, 0)
    number = await next_number(f["business_id"], "sale", "SL", 536000)
    change = round(max(0.0, data.tendered - totals["total"]), 2) if data.method == "cash" and data.tendered else 0
    doc = {**f, "number": number, "lines": lines, "totals": totals, "method": data.method, "tendered": data.tendered, "change": change, "customer_id": data.customer_id,
           "account_id": data.account_id, "created_by": user.get("name", ""), "created_at": now(), "synced": True}
    res = await db.sales.insert_one(doc)
    for l in lines:
        await apply_stock(f["business_id"], l.get("item_id"), -l["quantity"], "sale", number, user)
    if data.method != "credit":
        await db.payments.insert_one({**f, "customer_id": data.customer_id, "amount": totals["total"], "account_id": data.account_id, "method": data.method, "allocations": [],
                                      "sale_id": str(res.inserted_id), "note": f"Quick sale · {number}", "created_by": user.get("name", ""), "created_at": now()})
    return clean(await db.sales.find_one({"_id": res.inserted_id}))


@api.get("/sales")
async def list_sales(user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    return [clean(s) async for s in db.sales.find(f).sort("created_at", -1).limit(100)]


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
    doc = {**f, "customer_id": data.customer_id, "amount": data.amount, "account_id": data.account_id, "method": "payment_in", "allocations": allocations, "note": data.note or "Payment in",
           "created_by": user.get("name", ""), "created_at": datetime.fromisoformat(data.date) if data.date else now()}
    res = await db.payments.insert_one(doc)
    return clean(await db.payments.find_one({"_id": res.inserted_id}))


@api.delete("/payments/{pid}")
async def delete_payment(pid: str, reason: str, user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
    r = await db.payments.update_one({"_id": oid(pid), **f}, {"$set": {"deleted_at": now(), "deleted_reason": reason, "deleted_by": user.get("name", "")}})
    if not r.matched_count:
        raise HTTPException(404, "Payment not found")
    return {"ok": True}


# ---------------------------------------------------------------- expenses
@api.get("/expenses")
async def list_expenses(user: Annotated[dict, Depends(current_user)], period: str = "month"):
    f = biz_filter(user)
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
    accounts = {str(a["_id"]): a["name"] async for a in db.accounts.find(f)}
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
    doc = {**data.model_dump(exclude={"date"}), **f, "created_by": user.get("name", ""), "created_at": datetime.fromisoformat(data.date) if data.date else now()}
    res = await db.expenses.insert_one(doc)
    return clean(await db.expenses.find_one({"_id": res.inserted_id}))


# ---------------------------------------------------------------- dashboard
@api.get("/dashboard")
async def dashboard(user: Annotated[dict, Depends(current_user)]):
    f = biz_filter(user)
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
    received = round(sum([p["amount"] async for p in db.payments.find({**f, "created_at": {"$gte": month_start}})]), 2)
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
    async for it in db.items.find(f):
        if it.get("track_stock", True):
            stock_value += it.get("quantity", 0) * it.get("cost_price", 0)
            if it.get("quantity", 0) <= it.get("alert_below", 0):
                low += 1
    change_pct = round((total_sales - prev_sales) / prev_sales * 100) if prev_sales else None
    return {"month": today.strftime("%B %Y"), "total_sales": total_sales, "change_pct": change_pct, "received": received, "owed": round(owed, 2),
            "expenses": round(sum(e["amount"] for e in expenses), 2), "expense_count": len(expenses), "purchases": round(stock_value, 2), "low_stock": low,
            "cashflow": days, "net_week": round(sum(d["in"] - d["out"] for d in days), 2), "user_name": user.get("name", "")}


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
                                       "selling_price": sell, "wholesale_price": whole, "track_stock": True, "quantity": qty, "alert_below": alert, "expiry": None, "photo_url": None,
                                       "created_by": user.get("name", ""), "created_at": now(), "updated_at": now()})
        item_ids[n] = str(r.inserted_id)
    await db.items.insert_one({**f, "name": "Delivery within Lagos", "kind": "service", "category": "Services", "unit": "Service", "barcode": "", "supplier": "", "location": "", "cost_price": 0,
                               "selling_price": 5000, "wholesale_price": None, "track_stock": False, "quantity": 0, "alert_below": 0, "expiry": None, "photo_url": None,
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
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
