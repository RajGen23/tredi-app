"""Rail 04 extras — quotations, invoice settings, terms-of-payment sets, reminders."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal, Optional
from bson import ObjectId
from datetime import timedelta, date

from deps import (CurrentUser, LineIn, apply_stock, biz_filter, clean, db, decorate_invoice, invoice_totals, line_totals,
                  log_activity, next_number, now, oid, scoped, subscription_of, VAT_RATE)

router = APIRouter(prefix="/api")

DEFAULT_CONDITIONS = [
    {"text": "Goods sold are not returnable after 7 days.", "on": True},
    {"text": "Cheques payable to this business.", "on": True},
    {"text": "2% monthly interest on overdue balances.", "on": False},
]


class InvoiceSettingsIn(BaseModel):
    prefix: str = "INV"
    next_number: int = 1001
    vat_rate: float = VAT_RATE
    vat_on: bool = True
    due_days: int = 7
    conditions: List[dict] = DEFAULT_CONDITIONS
    show_photos: bool = False
    photo_size: int = 30  # how big the item photo prints beside each invoice line
    tredi_mark: bool = True
    print_format: Literal["a4", "80mm", "58mm"] = "a4"
    default_bank_account_id: Optional[str] = None
    attach_terms: bool = True
    footer: str = "Thank you for your business"
    # 04.10b invoice templates — how the document looks
    template: Literal["t1", "t2", "t3", "t4", "t5", "t6", "t7"] = "t3"
    brand_color: str = "#014747"
    header_color: str = ""
    logo_url: str = ""
    logo_size: int = 90
    export_format: Literal["simple", "professional"] = "professional"


class TermsIn(BaseModel):
    name: str
    payment_structure: str = ""
    delivery_condition: str = ""
    additional_notes: str = ""
    is_default: bool = False
    shop: str = ""  # each set belongs to a shop/location, so it can be reused there


class ReminderIn(BaseModel):
    channel: Literal["whatsapp", "sms"] = "whatsapp"
    message: str = ""
    repeat_days: int = 0


# ---------------------------------------------------------------- 04.10 invoice settings
@router.get("/settings/invoice")
async def get_invoice_settings(user: CurrentUser):
    f = biz_filter(user)
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    s = (biz.get("settings") or {}).get("invoice") or {}
    counter = await db.counters.find_one({"business_id": f["business_id"], "key": "invoice"})
    defaults = InvoiceSettingsIn().model_dump()
    merged = {**defaults, **s}
    merged["next_number"] = 1001 + (counter["seq"] if counter else 0)
    merged["accounts"] = [{"id": str(a["_id"]), "name": a["name"], "detail": a.get("detail", ""), "kind": a.get("kind", "cash")} async for a in db.accounts.find(f)]
    merged["terms_sets"] = await db.terms.count_documents(f)
    # Starter saves photos on items but does not print them (plan rule): the
    # screens read this flag instead of hard-coding who is allowed.
    sub = await subscription_of(f["business_id"])
    merged["photos_allowed"] = bool(sub["features"].get("invoice_photos"))
    merged["plan"] = sub["plan"]
    merged["plan_name"] = sub["name"]
    if not merged["photos_allowed"]:
        merged["show_photos"] = False
    return merged


@router.put("/settings/invoice")
async def put_invoice_settings(data: InvoiceSettingsIn, user: CurrentUser):
    f = biz_filter(user)
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    current = (biz.get("settings") or {}).get("invoice") or {}
    # Merge, so a screen that only sends the fields it owns (numbering, or the
    # template) never resets the rest to model defaults.
    merged = {**InvoiceSettingsIn().model_dump(), **current, **data.model_dump(exclude_unset=True)}
    await db.businesses.update_one({"_id": ObjectId(f["business_id"])}, {"$set": {"settings.invoice": merged}})
    return await get_invoice_settings(user)


# ---------------------------------------------------------------- 04.15 terms of payment
@router.get("/terms")
async def list_terms(user: CurrentUser):
    f = biz_filter(user)
    rows = [clean(t) async for t in db.terms.find(f).sort("created_at", 1)]
    for t in rows:
        t["sections"] = sum(1 for k in ("payment_structure", "delivery_condition", "additional_notes") if t.get(k))
    return rows


@router.post("/terms", status_code=201)
async def create_terms(data: TermsIn, user: CurrentUser):
    f = biz_filter(user)
    if data.is_default:
        await db.terms.update_many(f, {"$set": {"is_default": False}})
    res = await db.terms.insert_one({**data.model_dump(), **f, "created_by": user.get("name", ""), "created_by_id": str(user["_id"]), "created_at": now()})
    return clean(await db.terms.find_one({"_id": res.inserted_id}))


@router.put("/terms/{tid}")
async def update_terms(tid: str, data: TermsIn, user: CurrentUser):
    f = biz_filter(user)
    if data.is_default:
        await db.terms.update_many(f, {"$set": {"is_default": False}})
    r = await db.terms.update_one({"_id": oid(tid), **f}, {"$set": data.model_dump()})
    if not r.matched_count:
        raise HTTPException(404, "Terms not found")
    return clean(await db.terms.find_one({"_id": oid(tid)}))


@router.delete("/terms/{tid}")
async def delete_terms(tid: str, user: CurrentUser):
    f = biz_filter(user)
    await db.terms.update_one({"_id": oid(tid), **f}, {"$set": {"deleted_at": now()}})
    return {"ok": True}
# Quotations were pulled out of the app at the owner's request; the saved
# documents stay in the database for whenever they come back.


@router.get("/invoices/{iid}/reminder")
async def reminder_draft(iid: str, user: CurrentUser):
    f = biz_filter(user)
    from deps import invoice_paid, invoice_status
    inv = await db.invoices.find_one({"_id": oid(iid), **f})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    st = invoice_status(inv, await invoice_paid(f["business_id"], iid))
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    cust = await db.customers.find_one({"_id": ObjectId(inv["customer_id"])}) if inv.get("customer_id") else None
    first = (cust or {}).get("name", "there").split(" ")[0]
    due = inv.get("due_date") or ""
    due_txt = date.fromisoformat(due[:10]).strftime("%d %b") if due else "on collection"
    msg = (f"Hello {first}, this is {biz.get('name', '')}. Invoice {inv['number']} for ₦ {st['due']:,.0f} was due on {due_txt}. "
           f"You can view it here: tredi.app/i/{inv['number'].split('-')[-1]}. Thank you.")
    sent = [clean(r) async for r in db.reminders.find({**f, "invoice_id": iid}).sort("created_at", -1)]
    return {"message": msg, "phone": (cust or {}).get("phone", ""), "customer": (cust or {}).get("name", ""),
            "days_overdue": st["days_overdue"], "due": st["due"], "number": inv["number"], "history": sent,
            "auto": bool(inv.get("reminder_repeat_days"))}


@router.post("/invoices/{iid}/reminder", status_code=201)
async def send_reminder(iid: str, data: ReminderIn, user: CurrentUser):
    f = biz_filter(user)
    inv = await db.invoices.find_one({"_id": oid(iid), **f})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    res = await db.reminders.insert_one({**f, "invoice_id": iid, "channel": data.channel, "message": data.message,
                                         "repeat_days": data.repeat_days, "created_by": user.get("name", ""), "created_by_id": str(user["_id"]), "created_at": now()})
    await db.invoices.update_one({"_id": inv["_id"]}, {"$set": {"reminder_repeat_days": data.repeat_days, "last_reminder_at": now()}})
    await log_activity(f["business_id"], user, "reminder", f"Reminder sent · {inv['number']}", data.channel, 0, iid)
    return clean(await db.reminders.find_one({"_id": res.inserted_id}))


# ---------------------------------------------------------------- repeat purchases
class DuplicateIn(BaseModel):
    update_prices: bool = True
    issue: bool = True


async def _repeat_lines(f: dict, inv: dict, update_prices: bool) -> list[dict]:
    """Same basket, optionally re-priced from today's stock card."""
    out = []
    for l in inv.get("lines", []):
        line = dict(l)
        item = None
        if l.get("item_id") and ObjectId.is_valid(l["item_id"]):
            item = await db.items.find_one({"_id": ObjectId(l["item_id"]), **f})
        if update_prices and item:
            line["unit_price"] = item.get("selling_price") or l["unit_price"]
            line["unit"] = item.get("unit", l.get("unit", ""))
        line["stock"] = (item or {}).get("quantity")
        line["track"] = (item or {}).get("track_stock", True)
        line["price_changed"] = bool(item) and round(line["unit_price"], 2) != round(l["unit_price"], 2)
        line["old_unit_price"] = l["unit_price"]
        out.append(line)
    return out


@router.get("/invoices/{iid}/duplicate")
async def duplicate_preview(iid: str, user: CurrentUser, update_prices: bool = True):
    """What a repeat of this invoice would look like, before anything is written."""
    f = biz_filter(user)
    inv = await db.invoices.find_one({"_id": oid(iid), **f})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    lines = await _repeat_lines(f, inv, update_prices)
    totals = invoice_totals([line_totals(LineIn(**{k: v for k, v in l.items() if k in LineIn.model_fields})) for l in lines],
                            inv.get("invoice_discount_type", "amount"), inv.get("invoice_discount_value", 0), inv.get("vat_rate", VAT_RATE))
    cust = await db.customers.find_one({"_id": ObjectId(inv["customer_id"])}) if inv.get("customer_id") else None
    short = [{"name": l["name"], "need": l["quantity"], "have": l["stock"]} for l in lines
             if l.get("track") and l.get("stock") is not None and l["stock"] < l["quantity"]]
    return {"source_number": inv["number"], "customer_id": inv.get("customer_id"), "customer_name": (cust or {}).get("name", "Cash sale"),
            "lines": lines, "totals": totals, "vat_rate": inv.get("vat_rate", VAT_RATE),
            "invoice_discount_type": inv.get("invoice_discount_type", "amount"), "invoice_discount_value": inv.get("invoice_discount_value", 0),
            "terms_id": inv.get("terms_id"), "shop": inv.get("shop", ""), "repriced": [l["name"] for l in lines if l["price_changed"]],
            "short": short, "times_repeated": inv.get("duplicate_count", 0)}


@router.post("/invoices/{iid}/duplicate", status_code=201)
async def duplicate_invoice(iid: str, data: DuplicateIn, user: CurrentUser):
    """Raise the same basket again. Payments, reminders and history do not come along."""
    f = biz_filter(user)
    src = await db.invoices.find_one({"_id": oid(iid), **f})
    if not src:
        raise HTTPException(404, "Invoice not found")
    lines = [line_totals(LineIn(**{k: v for k, v in l.items() if k in LineIn.model_fields}))
             for l in await _repeat_lines(f, src, data.update_prices)]
    totals = invoice_totals(lines, src.get("invoice_discount_type", "amount"), src.get("invoice_discount_value", 0), src.get("vat_rate", VAT_RATE))
    settings = await get_invoice_settings(user)
    status = "issued" if data.issue else "draft"
    number = await next_number(f["business_id"], "invoice", settings["prefix"], 1000) if data.issue else "Draft"
    doc = {**f, "customer_id": src.get("customer_id"), "lines": lines, "totals": totals, "number": number,
           "invoice_discount_type": src.get("invoice_discount_type", "amount"), "invoice_discount_value": src.get("invoice_discount_value", 0),
           "vat_rate": src.get("vat_rate", VAT_RATE), "due_date": (date.today() + timedelta(days=settings["due_days"])).isoformat(),
           "payment_mode": "credit", "account_id": None, "status": status, "note": src.get("note", ""), "terms_id": src.get("terms_id"),
           "shop": src.get("shop", ""), "duplicated_from": iid, "duplicated_from_number": src["number"],
           "created_by": user.get("name", ""), "created_by_id": str(user["_id"]), "created_at": now()}
    res = await db.invoices.insert_one(doc)
    new_id = str(res.inserted_id)
    if data.issue:
        for l in lines:
            await apply_stock(f["business_id"], l.get("item_id"), -l["quantity"], "sale", number, user, f"Repeat of {src['number']}", src.get("shop", ""))
        await log_activity(f["business_id"], user, "invoice", f"{number} repeated from {src['number']}", "Repeat purchase", totals["total"], new_id, src.get("shop", ""))
    await db.invoices.update_one({"_id": src["_id"]}, {"$inc": {"duplicate_count": 1}})
    return await decorate_invoice(await db.invoices.find_one({"_id": res.inserted_id}))
