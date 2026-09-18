"""Rail 11 — offline sync queue, backup settings, import from Excel/CSV."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Literal, Optional

from deps import (CurrentUser, LineIn, biz_filter, clean, db, invoice_totals, line_totals, log_activity, next_number, now)

router = APIRouter(prefix="/api")


class QueuedOp(BaseModel):
    local_id: str
    kind: Literal["sale", "customer", "expense", "adjustment", "payment"]
    payload: Dict[str, Any]
    created_at: Optional[str] = None


class SyncIn(BaseModel):
    ops: List[QueuedOp]


class BackupIn(BaseModel):
    auto: bool = True
    mobile_data: bool = False
    include_photos: bool = True


class ImportRow(BaseModel):
    row: int
    values: Dict[str, Any]


class ImportIn(BaseModel):
    target: Literal["customers", "items"]
    filename: str = ""
    rows: List[ImportRow]


class ImportCommitIn(ImportIn):
    skip_rows: List[int] = []
    merge_duplicates: bool = False


# ---------------------------------------------------------------- 11.1 / 11.2 sync
@router.post("/sync")
async def sync(data: SyncIn, user: CurrentUser):
    f = biz_filter(user)
    applied, failed = [], []
    for op in data.ops:
        try:
            p = op.payload
            if op.kind == "customer":
                await db.customers.insert_one({**f, "name": p["name"], "phone": p.get("phone", ""), "email": p.get("email", ""),
                                               "address": p.get("address", ""), "opening_balance": p.get("opening_balance", 0),
                                               "opening_type": p.get("opening_type", "owes_me"), "price_list": p.get("price_list", "Retail"),
                                               "credit_limit": p.get("credit_limit"), "created_by": user.get("name", ""), "created_at": now()})
            elif op.kind == "sale":
                lines = [line_totals(LineIn(**l)) for l in p.get("lines", [])]
                totals = invoice_totals(lines, "amount", 0, 0)
                number = await next_number(f["business_id"], "sale", "SL", 536000)
                await db.sales.insert_one({**f, "number": number, "lines": lines, "totals": totals, "method": p.get("method", "cash"),
                                           "tendered": p.get("tendered", 0), "change": p.get("change", 0), "customer_id": p.get("customer_id"),
                                           "account_id": p.get("account_id"), "shop": p.get("shop", ""), "created_by": user.get("name", ""),
                                           "created_at": now(), "synced": True, "offline": True})
            elif op.kind == "expense":
                await db.expenses.insert_one({**f, "amount": p["amount"], "category": p.get("category", "Other"), "account_id": p.get("account_id"),
                                              "note": p.get("note", ""), "shop": p.get("shop", ""), "receipt_url": p.get("receipt_url"),
                                              "created_by": user.get("name", ""), "created_at": now()})
            elif op.kind == "payment":
                await db.payments.insert_one({**f, "customer_id": p.get("customer_id"), "amount": p["amount"], "account_id": p.get("account_id"),
                                              "method": "payment_in", "allocations": p.get("allocations", []), "note": p.get("note", "Payment in"),
                                              "created_by": user.get("name", ""), "created_at": now()})
            elif op.kind == "adjustment":
                from deps import apply_stock
                await apply_stock(f["business_id"], p.get("item_id"), p.get("delta", 0), "adjustment", p.get("reason", "Offline adjustment"), user, p.get("note", ""))
            applied.append(op.local_id)
        except Exception as exc:  # a bad row must never block the rest of the queue
            failed.append({"local_id": op.local_id, "error": str(exc)})
    await db.backups.update_one({"business_id": f["business_id"], "user_id": str(user["_id"])},
                                {"$set": {"last_sync": now(), "last_count": len(applied)}}, upsert=True)
    return {"applied": applied, "failed": failed, "count": len(applied)}


@router.get("/sync/status")
async def sync_status(user: CurrentUser):
    f = biz_filter(user)
    s = await db.backups.find_one({"business_id": f["business_id"], "user_id": str(user["_id"])}) or {}
    counts = {}
    for name, coll in (("sales", db.sales), ("customers", db.customers), ("expenses", db.expenses), ("items", db.items), ("invoices", db.invoices)):
        counts[name] = await coll.count_documents(f)
    size_mb = round(sum(counts.values()) * 0.0006 + 0.4, 1)
    return {"last_sync": s.get("last_sync").isoformat() if s.get("last_sync") else None, "last_count": s.get("last_count", 0),
            "auto": s.get("auto", True), "mobile_data": s.get("mobile_data", False), "include_photos": s.get("include_photos", True),
            "counts": counts, "size_mb": size_mb}


@router.put("/sync/settings")
async def backup_settings(data: BackupIn, user: CurrentUser):
    f = biz_filter(user)
    await db.backups.update_one({"business_id": f["business_id"], "user_id": str(user["_id"])}, {"$set": data.model_dump()}, upsert=True)
    return await sync_status(user)


@router.post("/sync/backup")
async def backup_now(user: CurrentUser):
    f = biz_filter(user)
    await db.backups.update_one({"business_id": f["business_id"], "user_id": str(user["_id"])},
                                {"$set": {"last_sync": now(), "last_count": 0}}, upsert=True)
    await log_activity(f["business_id"], user, "backup", "Backup taken")
    return await sync_status(user)


# ---------------------------------------------------------------- 11.3 import
CUSTOMER_COLS = ["name", "phone", "email", "address", "opening_balance"]
ITEM_COLS = ["name", "category", "unit", "cost_price", "selling_price", "quantity", "barcode", "photo_url"]


def _num(v: Any) -> Optional[float]:
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


async def validate_rows(f: dict, data: ImportIn) -> dict:
    issues: list[dict] = []
    ready: list[dict] = []
    seen_phones: dict = {}
    existing_phones = {c.get("phone", ""): c["name"] async for c in db.customers.find(f)} if data.target == "customers" else {}
    existing_names = {i["name"].lower() async for i in db.items.find(f)} if data.target == "items" else set()

    for r in data.rows:
        v = {k: (str(x).strip() if x is not None else "") for k, x in r.values.items()}
        name = v.get("name", "")
        if not name:
            issues.append({"rows": [r.row], "title": f"Row {r.row} · missing name", "detail": "Every row needs a name.", "action": "Blocked", "kind": "blocked"})
            continue
        if data.target == "customers":
            phone = v.get("phone", "")
            if not phone:
                issues.append({"rows": [r.row], "title": f"Row {r.row} · missing phone", "detail": f"“{name}” has no phone number. Add one or skip the row.", "action": "Blocked", "kind": "blocked"})
                continue
            if phone in existing_phones or phone in seen_phones:
                issues.append({"rows": [r.row], "title": f"Row {r.row} · duplicate", "detail": "Matches an existing customer by phone number.", "action": "Merge?", "kind": "duplicate"})
                continue
            seen_phones[phone] = name
            bal = _num(v.get("opening_balance") or 0)
            if bal is None:
                issues.append({"rows": [r.row], "title": f"Row {r.row} · bad balance", "detail": "Opening balance is not a number — e.g. “N/A”.", "action": "Fix", "kind": "bad_number"})
                continue
            ready.append({"row": r.row, "name": name, "phone": phone, "email": v.get("email", ""), "address": v.get("address", ""), "opening_balance": bal})
        else:
            if name.lower() in existing_names:
                issues.append({"rows": [r.row], "title": f"Row {r.row} · duplicate", "detail": f"“{name}” already exists in stock.", "action": "Merge?", "kind": "duplicate"})
                continue
            cost, sell, qty = _num(v.get("cost_price") or 0), _num(v.get("selling_price") or 0), _num(v.get("quantity") or 0)
            if None in (cost, sell, qty):
                issues.append({"rows": [r.row], "title": f"Row {r.row} · bad number", "detail": "Cost, price or quantity is not a number.", "action": "Fix", "kind": "bad_number"})
                continue
            ready.append({"row": r.row, "name": name, "category": v.get("category") or "General", "unit": v.get("unit") or "Piece",
                          "cost_price": cost, "selling_price": sell, "quantity": qty, "barcode": v.get("barcode", ""),
                          "photo_url": v.get("photo_url", "")})
    # group identical issue kinds the way the design shows them
    grouped: dict = {}
    for i in issues:
        key = (i["kind"], i["detail"])
        g = grouped.setdefault(key, {**i, "rows": []})
        g["rows"].extend(i["rows"])
    out = []
    for g in grouped.values():
        rows = sorted(g["rows"])
        label = "Row " + str(rows[0]) if len(rows) == 1 else "Rows " + ", ".join(str(x) for x in rows)
        suffix = g["title"].split("·", 1)[1].strip() if "·" in g["title"] else g["title"]
        out.append({**g, "rows": rows, "title": f"{label} · {suffix}"})
    return {"ready": ready, "issues": out, "ready_count": len(ready), "issue_count": sum(len(g["rows"]) for g in out),
            "columns": CUSTOMER_COLS if data.target == "customers" else ITEM_COLS}


@router.post("/import/preview")
async def import_preview(data: ImportIn, user: CurrentUser):
    f = biz_filter(user)
    res = await validate_rows(f, data)
    return {"filename": data.filename, "target": data.target, "total": len(data.rows), **res}


@router.post("/import/commit")
async def import_commit(data: ImportCommitIn, user: CurrentUser):
    f = biz_filter(user)
    res = await validate_rows(f, data)
    rows = [r for r in res["ready"] if r["row"] not in data.skip_rows]
    if not rows:
        raise HTTPException(400, "Nothing left to import")
    if data.target == "customers":
        await db.customers.insert_many([{**f, "name": r["name"], "phone": r["phone"], "email": r["email"], "address": r["address"],
                                         "opening_balance": r["opening_balance"], "opening_type": "owes_me", "price_list": "Retail",
                                         "credit_limit": None, "created_by": user.get("name", ""), "created_at": now()} for r in rows])
    else:
        await db.items.insert_many([{**f, "name": r["name"], "kind": "product", "category": r["category"], "unit": r["unit"], "barcode": r["barcode"],
                                     "supplier": "", "location": "", "cost_price": r["cost_price"], "selling_price": r["selling_price"],
                                     "wholesale_price": None, "track_stock": True, "quantity": r["quantity"], "alert_below": 0, "expiry": None,
                                     "photo_url": r.get("photo_url") or None, "created_by": user.get("name", ""), "created_at": now(), "updated_at": now()} for r in rows])
    await log_activity(f["business_id"], user, "import", f"Imported {len(rows)} {data.target}", data.filename)
    return {"imported": len(rows), "target": data.target}


@router.get("/import/template")
async def import_template(target: str = "customers"):
    cols = CUSTOMER_COLS if target == "customers" else ITEM_COLS
    sample = ({"name": "Grace Mwangi", "phone": "+234 815 220 7741", "email": "", "address": "Surulere", "opening_balance": "0"}
              if target == "customers" else
              {"name": "Adeba Rice 50kg", "category": "Grains", "unit": "Bag", "cost_price": "52400", "selling_price": "62000", "quantity": "8", "barcode": "", "photo_url": ""})
    csv = ",".join(cols) + "\n" + ",".join(str(sample[c]) for c in cols) + "\n"
    return {"columns": cols, "csv": csv, "filename": f"tredi_{target}_template.csv"}
