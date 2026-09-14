"""Rail 02 (Summary, Cash flow, Product performance) and Rail 07 (Reports, P&L)."""
from fastapi import APIRouter
from datetime import datetime, timedelta, timezone, date
from bson import ObjectId
from typing import Optional

from deps import CurrentUser, biz_filter, date_query, db, invoice_paid, invoice_status, period_range

router = APIRouter(prefix="/api/reports")


async def item_costs(f: dict) -> dict:
    return {str(i["_id"]): i for i in [x async for x in db.items.find(f)]}


async def sale_docs(f: dict, a: Optional[datetime], b: datetime) -> list[dict]:
    """Invoices (issued) + quick sales in the window, normalised."""
    out = []
    async for inv in db.invoices.find(date_query({**f, "status": {"$nin": ["draft", "quote"]}}, a, b)):
        out.append({"total": inv["totals"]["total"], "lines": inv.get("lines", []), "created_at": inv["created_at"],
                    "shop": inv.get("shop", ""), "customer_id": inv.get("customer_id"), "kind": "invoice"})
    async for s in db.sales.find(date_query(f, a, b)):
        out.append({"total": s["totals"]["total"], "lines": s.get("lines", []), "created_at": s["created_at"],
                    "shop": s.get("shop", ""), "customer_id": s.get("customer_id"), "kind": "sale"})
    return out


def cogs_of(docs: list[dict], items: dict) -> float:
    total = 0.0
    for d in docs:
        for l in d.get("lines", []):
            it = items.get(l.get("item_id") or "")
            if it:
                total += (l.get("quantity") or 0) * (it.get("cost_price") or 0)
    return round(total, 2)


async def sum_field(coll, q: dict, field: str = "amount") -> float:
    return round(sum([(d.get(field) or 0) async for d in coll.find(q)]), 2)


def pct_change(cur: float, prev: float) -> Optional[int]:
    return round((cur - prev) / prev * 100) if prev else None


@router.get("/summary")
async def summary(user: CurrentUser, period: str = "month", start: Optional[str] = None, end: Optional[str] = None):
    f = biz_filter(user)
    a, b, label = period_range(period, start, end)
    span = (b - a) if a else timedelta(days=30)
    pa, pb = (a - span if a else None), (a if a else b)
    items = await item_costs(f)

    docs = await sale_docs(f, a, b)
    prev_docs = await sale_docs(f, pa, pb) if a else []
    sales = round(sum(d["total"] for d in docs), 2)
    prev_sales = round(sum(d["total"] for d in prev_docs), 2)
    purchases = await sum_field(db.purchases, date_query(f, a, b), "total")
    prev_purchases = await sum_field(db.purchases, date_query(f, pa, pb), "total") if a else 0.0
    expenses = await sum_field(db.expenses, date_query(f, a, b))
    prev_expenses = await sum_field(db.expenses, date_query(f, pa, pb)) if a else 0.0
    cogs = cogs_of(docs, items)
    gross = round(sales - cogs, 2)

    # money in vs out, split into four buckets across the window
    weeks = []
    total_days = max(1, (b - (a or (b - timedelta(days=28)))).days)
    win_start = a or (b - timedelta(days=28))
    step = max(1, total_days // 4)
    for i in range(4):
        d0 = win_start + timedelta(days=i * step)
        d1 = b if i == 3 else win_start + timedelta(days=(i + 1) * step)
        inn = await sum_field(db.payments, date_query(f, d0, d1))
        out = await sum_field(db.expenses, date_query(f, d0, d1)) + await sum_field(db.purchases, date_query(f, d0, d1), "total")
        weeks.append({"label": f"W{i + 1}", "in": round(inn, 2), "out": round(out, 2)})

    over30 = 0.0
    async for inv in db.invoices.find({**f, "status": {"$nin": ["draft", "quote"]}}):
        st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
        if st["due"] > 0 and st["days_overdue"] > 30:
            over30 += st["due"]

    by_shop: dict = {}
    for d in docs:
        k = d.get("shop") or "Main branch"
        by_shop[k] = round(by_shop.get(k, 0) + d["total"], 2)
    shops = sorted(by_shop.items(), key=lambda kv: -kv[1])
    lead = round(shops[0][1] - shops[1][1], 2) if len(shops) > 1 else (shops[0][1] if shops else 0)

    return {"label": label, "period": period,
            "sales": sales, "sales_change": pct_change(sales, prev_sales),
            "purchases": purchases, "purchases_change": pct_change(purchases, prev_purchases),
            "expenses": expenses, "expenses_change": pct_change(expenses, prev_expenses),
            "gross_profit": gross, "margin": round(gross / sales * 100, 1) if sales else 0,
            "weeks": weeks, "receivables_over_30": round(over30, 2),
            "shops": [{"name": k, "amount": v} for k, v in shops], "shop_lead": lead}


@router.get("/cashflow")
async def cashflow(user: CurrentUser, period: str = "month", start: Optional[str] = None, end: Optional[str] = None):
    f = biz_filter(user)
    a, b, label = period_range(period, start, end)
    win_start = a or (b - timedelta(days=30))
    money_in = await sum_field(db.payments, date_query(f, a, b))
    money_out = round(await sum_field(db.expenses, date_query(f, a, b)) + await sum_field(db.purchases, date_query(f, a, b), "total"), 2)

    accounts = []
    opening_total = 0.0
    async for acc in db.accounts.find(f):
        aid = str(acc["_id"])
        inn = await sum_field(db.payments, {**f, "account_id": aid})
        out = await sum_field(db.expenses, {**f, "account_id": aid}) + await sum_field(db.purchases, {**f, "account_id": aid}, "total")
        bal = round((acc.get("opening_balance") or 0) + inn - out, 2)
        entries = await db.payments.count_documents({**f, "account_id": aid}) + await db.expenses.count_documents({**f, "account_id": aid})
        accounts.append({"id": aid, "name": acc["name"], "kind": acc.get("kind", "cash"), "detail": acc.get("detail", ""), "balance": bal, "entries": entries})
        opening_total += acc.get("opening_balance") or 0
    closing = round(sum(x["balance"] for x in accounts), 2)

    days = max(1, (b - win_start).days)
    step = max(1, days // 8)
    running = round(closing - (money_in - money_out), 2)
    series = []
    d0 = win_start
    while d0 < b:
        d1 = min(b, d0 + timedelta(days=step))
        inn = await sum_field(db.payments, date_query(f, d0, d1))
        out = await sum_field(db.expenses, date_query(f, d0, d1)) + await sum_field(db.purchases, date_query(f, d0, d1), "total")
        running = round(running + inn - out, 2)
        series.append({"label": d0.strftime("%d"), "value": running})
        d0 = d1
    return {"label": label, "period": period, "closing": closing, "net": round(money_in - money_out, 2),
            "in": money_in, "out": money_out, "series": series, "accounts": accounts, "opening": round(opening_total, 2)}


@router.get("/products")
async def products(user: CurrentUser, period: str = "month", start: Optional[str] = None, end: Optional[str] = None):
    f = biz_filter(user)
    a, b, label = period_range(period, start, end)
    items = await item_costs(f)
    docs = await sale_docs(f, a, b)

    rows: dict = {}
    for d in docs:
        for l in d.get("lines", []):
            key = l.get("item_id") or l.get("name")
            it = items.get(l.get("item_id") or "")
            r = rows.setdefault(key, {"id": l.get("item_id"), "name": l.get("name"), "unit": (it or {}).get("unit", l.get("unit") or "unit"),
                                      "revenue": 0.0, "qty": 0.0, "cost": 0.0})
            r["revenue"] = round(r["revenue"] + (l.get("total") or 0), 2)
            r["qty"] = round(r["qty"] + (l.get("quantity") or 0), 2)
            r["cost"] = round(r["cost"] + (l.get("quantity") or 0) * ((it or {}).get("cost_price") or 0), 2)
    for r in rows.values():
        r["profit"] = round(r["revenue"] - r["cost"], 2)
        r["margin"] = round(r["profit"] / r["revenue"] * 100, 1) if r["revenue"] else 0

    top = sorted(rows.values(), key=lambda r: -r["revenue"])[:8]
    by_profit = sorted([r for r in rows.values() if r["revenue"] > 0], key=lambda r: -r["margin"])[:8]

    slow = []
    today = datetime.now(timezone.utc)
    for iid, it in items.items():
        if not it.get("track_stock", True):
            continue
        last = await db.movements.find_one({**f, "item_id": iid, "kind": "sale"}, sort=[("created_at", -1)])
        days_idle = (today - last["created_at"].replace(tzinfo=timezone.utc)).days if last else 999
        tied = round((it.get("quantity") or 0) * (it.get("cost_price") or 0), 2)
        if days_idle >= 7 and tied > 0:
            slow.append({"id": iid, "name": it["name"], "days": days_idle, "tied": tied, "qty": it.get("quantity", 0),
                         "unit": it.get("unit", "unit"), "revenue": rows.get(iid, {}).get("revenue", 0)})
    slow.sort(key=lambda r: -r["days"])

    cogs = cogs_of(docs, items)
    stock_value = round(sum((i.get("quantity") or 0) * (i.get("cost_price") or 0) for i in items.values() if i.get("track_stock", True)), 2)
    turnover = round(cogs / stock_value, 1) if stock_value else 0
    return {"label": label, "top": top, "profit": by_profit, "slow": slow[:8], "turnover": turnover,
            "turnover_health": "Healthy" if turnover >= 2 else "Slow", "stock_value": stock_value}


@router.get("/pnl")
async def pnl(user: CurrentUser, period: str = "month", start: Optional[str] = None, end: Optional[str] = None):
    f = biz_filter(user)
    a, b, label = period_range(period, start, end)
    items = await item_costs(f)
    docs = await sale_docs(f, a, b)
    revenue = round(sum(d["total"] for d in docs), 2)
    returns = await sum_field(db.returns, date_query(f, a, b), "total")
    cogs = cogs_of(docs, items)
    gross = round(revenue - returns - cogs, 2)

    by_cat: dict = {}
    async for e in db.expenses.find(date_query(f, a, b)):
        by_cat[e["category"]] = round(by_cat.get(e["category"], 0) + e["amount"], 2)
    cats = sorted(by_cat.items(), key=lambda kv: -kv[1])
    head, rest = cats[:3], cats[3:]
    lines = [{"label": k, "amount": v} for k, v in head]
    if rest:
        lines.append({"label": "Other expenses", "amount": round(sum(v for _, v in rest), 2)})
    total_expenses = round(sum(by_cat.values()), 2)
    net = round(gross - total_expenses, 2)

    # last 6 calendar months of net profit for the bar strip
    bars = []
    today = date.today()
    cursor = today.replace(day=1)
    months = []
    for _ in range(6):
        months.append(cursor)
        cursor = (cursor - timedelta(days=1)).replace(day=1)
    for m in reversed(months):
        m0 = datetime.combine(m, datetime.min.time(), tzinfo=timezone.utc)
        nxt = (m.replace(day=28) + timedelta(days=4)).replace(day=1)
        m1 = datetime.combine(nxt, datetime.min.time(), tzinfo=timezone.utc)
        md = await sale_docs(f, m0, m1)
        rev = sum(d["total"] for d in md)
        exp = await sum_field(db.expenses, date_query(f, m0, m1))
        bars.append({"label": m.strftime("%b"), "value": round(rev - cogs_of(md, items) - exp, 2)})

    return {"label": label, "revenue": revenue, "returns": returns, "cogs": cogs, "gross": gross,
            "expense_lines": lines, "expenses": total_expenses, "net": net,
            "margin": round(net / revenue * 100, 1) if revenue else 0, "bars": bars}


@router.get("/receivables")
async def receivables(user: CurrentUser):
    f = biz_filter(user)
    buckets = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "60_plus": 0.0}
    rows = []
    async for inv in db.invoices.find({**f, "status": {"$nin": ["draft", "quote"]}}):
        st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
        if st["due"] <= 0:
            continue
        d = st["days_overdue"]
        key = "current" if d <= 0 else "1_30" if d <= 30 else "31_60" if d <= 60 else "60_plus"
        buckets[key] = round(buckets[key] + st["due"], 2)
        cust = await db.customers.find_one({"_id": ObjectId(inv["customer_id"])}) if inv.get("customer_id") else None
        rows.append({"id": str(inv["_id"]), "number": inv["number"], "customer": cust["name"] if cust else "Cash sale",
                     "due": st["due"], "days_overdue": d})
    rows.sort(key=lambda r: -r["days_overdue"])
    payables = 0.0
    async for p in db.purchases.find(f):
        payables += round((p.get("total") or 0) - (p.get("paid") or 0), 2)
    return {"buckets": buckets, "total": round(sum(buckets.values()), 2), "rows": rows[:40], "payables": round(payables, 2)}


@router.get("/stock-valuation")
async def stock_valuation(user: CurrentUser):
    f = biz_filter(user)
    rows, total, retail, low, out = [], 0.0, 0.0, 0, 0
    async for i in db.items.find(f).sort("name", 1):
        if not i.get("track_stock", True):
            continue
        qty = i.get("quantity") or 0
        val = round(qty * (i.get("cost_price") or 0), 2)
        total += val
        retail += qty * (i.get("selling_price") or 0)
        if qty <= 0:
            out += 1
        elif qty <= (i.get("alert_below") or 0):
            low += 1
        rows.append({"id": str(i["_id"]), "name": i["name"], "qty": qty, "unit": i.get("unit", "unit"),
                     "cost": i.get("cost_price") or 0, "value": val, "category": i.get("category", "General")})
    return {"rows": rows, "total": round(total, 2), "retail": round(retail, 2), "low": low, "out": out, "count": len(rows)}


@router.get("/sales-summary")
async def sales_summary(user: CurrentUser, period: str = "month", group: str = "day", start: Optional[str] = None, end: Optional[str] = None):
    f = biz_filter(user)
    a, b, label = period_range(period, start, end)
    docs = await sale_docs(f, a, b)
    groups: dict = {}
    for d in docs:
        if group == "customer":
            cid = d.get("customer_id")
            cust = await db.customers.find_one({"_id": ObjectId(cid)}) if cid else None
            key = cust["name"] if cust else "Cash sale"
        elif group == "shop":
            key = d.get("shop") or "Main branch"
        elif group == "product":
            for l in d.get("lines", []):
                k = l.get("name")
                g = groups.setdefault(k, {"label": k, "amount": 0.0, "count": 0})
                g["amount"] = round(g["amount"] + (l.get("total") or 0), 2)
                g["count"] += 1
            continue
        else:
            key = d["created_at"].strftime("%d %b")
        g = groups.setdefault(key, {"label": key, "amount": 0.0, "count": 0})
        g["amount"] = round(g["amount"] + d["total"], 2)
        g["count"] += 1
    rows = sorted(groups.values(), key=lambda r: -r["amount"])
    return {"label": label, "group": group, "rows": rows, "total": round(sum(r["amount"] for r in rows), 2), "count": len(docs)}
