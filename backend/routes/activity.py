"""Rail 01 extras — search, notifications, activity feed, record history, Home shortcuts."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from bson import ObjectId
from datetime import timedelta, date, timezone
import re

from deps import (CurrentUser, biz_filter, clean, db, invoice_paid, invoice_status, now, oid, period_range)

router = APIRouter(prefix="/api")

DEFAULT_SHORTCUTS = ["payment_in", "quick_sale", "add_stock", "reports"]
SHORTCUT_CATALOGUE = [
    {"key": "quick_sale", "label": "Quick sale", "icon": "flash-outline", "route": "/quick-sale"},
    {"key": "invoice", "label": "Invoice", "icon": "receipt-outline", "route": "/invoices/new"},
    {"key": "payment_in", "label": "Payment in", "icon": "arrow-down-outline", "route": "/payments/new"},
    {"key": "customer", "label": "Customer", "icon": "person-add-outline", "route": "/customers/new"},
    {"key": "add_stock", "label": "Add stock", "icon": "cube-outline", "route": "/stock/new"},
    {"key": "expense", "label": "Expense", "icon": "remove-outline", "route": "/expenses/new"},
    {"key": "reports", "label": "Reports", "icon": "bar-chart-outline", "route": "/reports"},
    {"key": "transfer", "label": "Stock transfer", "icon": "swap-horizontal-outline", "route": "/transfers/new"},
    {"key": "quote", "label": "New quotation", "icon": "document-text-outline", "route": "/quotes/new"},
    {"key": "suppliers", "label": "Suppliers", "icon": "business-outline", "route": "/suppliers"},
]


class ShortcutsIn(BaseModel):
    keys: List[str]


# ---------------------------------------------------------------- 01.3 search
@router.get("/search")
async def search(user: CurrentUser, q: str = "", kind: str = "all"):
    f = biz_filter(user)
    term = q.strip()
    if len(term) < 2:
        return {"customers": [], "invoices": [], "items": [], "suppliers": [], "total": 0}
    rx = re.compile(re.escape(term), re.I)
    customers, invoices, items, suppliers = [], [], [], []

    if kind in ("all", "customers"):
        async for c in db.customers.find({**f, "$or": [{"name": rx}, {"phone": rx}]}).limit(8):
            cid = str(c["_id"])
            unpaid, owed = 0, 0.0
            async for inv in db.invoices.find({**f, "customer_id": cid, "status": {"$nin": ["draft", "quote"]}}):
                st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
                if st["due"] > 0:
                    unpaid += 1
                    owed += st["due"]
            customers.append({"id": cid, "name": c["name"], "sub": f"{unpaid} unpaid invoice{'' if unpaid == 1 else 's'}" if unpaid else c.get("price_list", "Retail") + " price list",
                              "amount": round(owed, 2)})
    if kind in ("all", "invoices"):
        async for inv in db.invoices.find({**f, "number": rx}).limit(8):
            st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
            cust = await db.customers.find_one({"_id": ObjectId(inv["customer_id"])}) if inv.get("customer_id") else None
            invoices.append({"id": str(inv["_id"]), "number": inv["number"], "sub": f"{(cust or {}).get('name', 'Cash sale')} · {inv['created_at'].strftime('%d %b')}",
                             "status": st["status"], "days_overdue": st["days_overdue"], "amount": inv["totals"]["total"]})
    if kind in ("all", "items"):
        async for it in db.items.find({**f, "$or": [{"name": rx}, {"barcode": rx}]}).limit(8):
            qty = it.get("quantity") or 0
            low = it.get("track_stock", True) and qty <= (it.get("alert_below") or 0)
            items.append({"id": str(it["_id"]), "name": it["name"], "sub": f"{qty:g} in stock · {it.get('location') or it.get('category', 'General')}",
                          "low": low, "out": qty <= 0 and it.get("track_stock", True)})
    if kind in ("all", "suppliers"):
        async for s in db.suppliers.find({**f, "$or": [{"name": rx}, {"phone": rx}]}).limit(6):
            suppliers.append({"id": str(s["_id"]), "name": s["name"], "sub": s.get("phone", "") or s.get("category", "General")})
    return {"customers": customers, "invoices": invoices, "items": items, "suppliers": suppliers,
            "total": len(customers) + len(invoices) + len(items) + len(suppliers)}


# ---------------------------------------------------------------- 01.4 notifications
@router.get("/notifications")
async def notifications(user: CurrentUser):
    f = biz_filter(user)
    today_rows, earlier_rows = [], []
    overdue_count, overdue_amount = 0, 0.0
    async for inv in db.invoices.find({**f, "status": {"$nin": ["draft", "quote"]}}):
        st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
        if st["days_overdue"] > 0 and st["due"] > 0:
            overdue_count += 1
            overdue_amount += st["due"]
    if overdue_count:
        today_rows.append({"id": "overdue", "icon": "time-outline", "tone": "warn", "title": f"{overdue_count} invoice{'' if overdue_count == 1 else 's'} went overdue",
                           "sub": f"{round(overdue_amount, 2)} now past due date", "when": "2h", "route": "/(tabs)/sales", "action": "Chase"})
    async for it in db.items.find(f):
        if it.get("track_stock", True) and (it.get("quantity") or 0) <= (it.get("alert_below") or 0) and (it.get("alert_below") or 0) > 0:
            today_rows.append({"id": str(it["_id"]), "icon": "cube-outline", "tone": "warn", "title": f"{it['name']} is low",
                               "sub": f"{it.get('quantity', 0):g} left · threshold is {it.get('alert_below', 0):g}", "when": "4h",
                               "route": f"/stock/{str(it['_id'])}", "action": "Restock"})
    async for t in db.transfers.find({**f, "state": "pending"}):
        today_rows.append({"id": str(t["_id"]), "icon": "swap-horizontal-outline", "tone": "info", "title": f"Transfer {t['number']} waiting",
                           "sub": f"{t['from_shop']} → {t['to_shop']} · needs your approval", "when": "5h",
                           "route": f"/transfers/{str(t['_id'])}", "action": "Approve"})
    cutoff = now() - timedelta(days=1)
    async for p in db.payments.find({**f, "method": {"$ne": "cash"}}).sort("created_at", -1).limit(6):
        c = await db.customers.find_one({"_id": ObjectId(p["customer_id"])}) if p.get("customer_id") and ObjectId.is_valid(p.get("customer_id") or "") else None
        row = {"id": str(p["_id"]), "icon": "checkmark-circle-outline", "tone": "good", "title": "Payment received",
               "sub": f"{(c or {}).get('name', 'Cash sale')} · {p.get('note', '')}", "when": p["created_at"].strftime("%d %b"), "amount": p["amount"]}
        created = p["created_at"].replace(tzinfo=timezone.utc) if p["created_at"].tzinfo is None else p["created_at"]
        (today_rows if created >= cutoff else earlier_rows).append(row)
    earlier_rows.append({"id": "nudge", "icon": "create-outline", "tone": "mut", "title": "Log today's sales", "sub": "Daily reminder · 7:00 PM", "when": "1d"})
    return {"today": today_rows, "earlier": earlier_rows, "count": len(today_rows)}


# ---------------------------------------------------------------- 01.5 activity
@router.get("/activity")
async def activity(user: CurrentUser, shop: str = "", who: str = "", kind: str = "", period: str = "all"):
    f = biz_filter(user)
    a, b, label = period_range(period)
    q = dict(f)
    if shop:
        q["shop"] = shop
    if who:
        q["by"] = who
    if kind:
        q["kind"] = kind
    if a:
        q["created_at"] = {"$gte": a, "$lt": b}
    rows = [clean(r) async for r in db.activity.find(q).sort("created_at", -1).limit(120)]
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    people = [u.get("name", "") async for u in db.users.find({"business_id": f["business_id"]})]
    kinds = sorted({r["kind"] for r in rows})
    return {"rows": rows, "shops": [s["name"] for s in (biz.get("shops") or [])], "people": people, "kinds": kinds, "label": label}


# ---------------------------------------------------------------- 01.6 record history
@router.get("/history/{ref_id}")
async def history(ref_id: str, user: CurrentUser):
    f = biz_filter(user)
    rows = [clean(r) async for r in db.activity.find({**f, "ref_id": ref_id}).sort("created_at", -1)]
    title, sub = "Record", ""
    inv = await db.invoices.find_one({"_id": oid(ref_id), **f}) if ObjectId.is_valid(ref_id) else None
    if inv:
        cust = await db.customers.find_one({"_id": ObjectId(inv["customer_id"])}) if inv.get("customer_id") else None
        title = inv["number"]
        sub = (cust or {}).get("name", "Cash sale")
        if not any(r["kind"] == "invoice" and "created" in r["title"] for r in rows):
            rows.append({"id": f"seed-{ref_id}", "kind": "invoice", "title": "Invoice created", "sub": "",
                         "by": inv.get("created_by", ""), "shop": inv.get("shop", ""), "amount": inv["totals"]["total"],
                         "created_at": inv["created_at"].isoformat(), "reason": ""})
        async for p in db.payments.find({**f, "allocations.invoice_id": ref_id}):
            amount = sum(x["amount"] for x in p.get("allocations", []) if x["invoice_id"] == ref_id)
            rows.append({"id": str(p["_id"]), "kind": "payment", "title": f"Payment recorded — {amount:,.0f}", "sub": p.get("note", ""),
                         "by": p.get("created_by", ""), "shop": "", "amount": amount, "created_at": p["created_at"].isoformat(), "reason": ""})
        async for r in db.reminders.find({**f, "invoice_id": ref_id}):
            rows.append({"id": str(r["_id"]), "kind": "reminder", "title": f"Sent on {r['channel'].title()}", "sub": "",
                         "by": r.get("created_by", ""), "shop": "", "amount": 0, "created_at": r["created_at"].isoformat(), "reason": ""})
    else:
        item = await db.items.find_one({"_id": oid(ref_id), **f}) if ObjectId.is_valid(ref_id) else None
        if item:
            title, sub = item["name"], item.get("category", "")
            async for m in db.movements.find({**f, "item_id": ref_id}).sort("created_at", -1).limit(60):
                rows.append({"id": str(m["_id"]), "kind": "stock", "title": f"{m['kind'].replace('_', ' ').title()} — {m['delta']:+g}",
                             "sub": m.get("ref", ""), "by": m.get("by", ""), "shop": m.get("shop", ""), "amount": 0,
                             "created_at": m["created_at"].isoformat(), "reason": m.get("note", "")})
    rows.sort(key=lambda r: r["created_at"], reverse=True)
    return {"title": title, "sub": sub, "rows": rows, "count": len(rows)}


# ---------------------------------------------------------------- 01.2 shortcuts
@router.get("/shortcuts")
async def get_shortcuts(user: CurrentUser):
    biz_filter(user)
    keys = user.get("shortcuts") or DEFAULT_SHORTCUTS
    by_key = {s["key"]: s for s in SHORTCUT_CATALOGUE}
    on = [by_key[k] for k in keys if k in by_key]
    available = [s for s in SHORTCUT_CATALOGUE if s["key"] not in keys]
    return {"on": on, "available": available}


@router.put("/shortcuts")
async def put_shortcuts(data: ShortcutsIn, user: CurrentUser):
    biz_filter(user)
    valid = [k for k in data.keys if k in {s["key"] for s in SHORTCUT_CATALOGUE}][:8]
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"shortcuts": valid}})
    return await get_shortcuts(user)
