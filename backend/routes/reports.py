"""Rail 02 (Summary, Cash flow, Product performance) and Rail 07 (Reports, P&L)."""
from fastapi import APIRouter, Depends
from datetime import datetime, timedelta, timezone, date
from bson import ObjectId
from typing import Optional

from deps import (CurrentUser, LIVE_PO, LIVE_QUICK, LIVE_SALE, money_guard, need, biz_filter, date_query, db, invoice_paid, invoice_status, line_cost, period_range, rep_clause,
                  scoped, shop_qty, shop_scope)

router = APIRouter(prefix="/api/reports", dependencies=[Depends(money_guard)])


async def item_costs(f: dict) -> dict:
    return {str(i["_id"]): i for i in [x async for x in db.items.find(f)]}


async def sale_docs(f: dict, a: Optional[datetime], b: datetime, rep: str = "") -> list[dict]:
    """Invoices (issued) + quick sales in the window, normalised. A cancelled
    invoice never appears here, so no figure counts it."""
    q = {**f, **rep_clause(rep)} if rep else f
    out = []
    async for inv in db.invoices.find(date_query({**q, "status": LIVE_SALE}, a, b)):
        out.append({"id": str(inv["_id"]), "number": inv.get("number", ""), "total": inv["totals"]["total"],
                    "lines": inv.get("lines", []), "created_at": inv["created_at"], "shop": inv.get("shop", ""),
                    "customer_id": inv.get("customer_id"), "rep": inv.get("rep") or inv.get("created_by", ""), "kind": "invoice"})
    async for s in db.sales.find(date_query({**q, **LIVE_QUICK}, a, b)):
        out.append({"id": str(s["_id"]), "number": s.get("number", ""), "total": s["totals"]["total"],
                    "lines": s.get("lines", []), "created_at": s["created_at"], "shop": s.get("shop", ""),
                    "customer_id": s.get("customer_id"), "rep": s.get("rep") or s.get("created_by", ""), "kind": "sale"})
    return out


async def expense_total(f: dict, a: Optional[datetime], b: datetime, rep: str = "", exclude_stock: bool = False) -> float:
    """Running costs. Stock bought for resale is deliberately kept out of the
    expense total when asked, because those goods are counted in cost of sales
    the day they are sold — counting both would understate the profit twice."""
    q = {**f, **rep_clause(rep)} if rep else dict(f)
    if exclude_stock:
        q["category"] = {"$ne": "Purchases"}
    return await sum_field(db.expenses, date_query(q, a, b))


def cogs_of(docs: list[dict], items: dict) -> float:
    total = 0.0
    for d in docs:
        for l in d.get("lines", []):
            it = items.get(l.get("item_id") or "")
            if it or l.get("cost_at_sale") is not None:
                total += line_cost(l, it)
    return round(total, 2)


async def sum_field(coll, q: dict, field: str = "amount") -> float:
    return round(sum([(d.get(field) or 0) async for d in coll.find(q)]), 2)


def pct_change(cur: float, prev: float) -> Optional[int]:
    return round((cur - prev) / prev * 100) if prev else None


@router.get("/summary")
async def summary(user: CurrentUser, period: str = "month", start: Optional[str] = None, end: Optional[str] = None, rep: str = ""):
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    sc = await shop_scope(user, "stock")
    a, b, label = period_range(period, start, end)
    span = (b - a) if a else timedelta(days=30)
    pa, pb = (a - span if a else None), (a if a else b)
    items = await item_costs(bf)

    docs = await sale_docs(f, a, b, rep)
    prev_docs = await sale_docs(f, pa, pb, rep) if a else []
    sales = round(sum(d["total"] for d in docs), 2)
    prev_sales = round(sum(d["total"] for d in prev_docs), 2)
    purchases = await sum_field(db.purchases, date_query(f, a, b), "total")
    prev_purchases = await sum_field(db.purchases, date_query(f, pa, pb), "total") if a else 0.0
    expenses = await expense_total(f, a, b, rep)
    prev_expenses = await expense_total(f, pa, pb, rep) if a else 0.0
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
        inn = await sum_field(db.payments, date_query({**f, "method": {"$nin": ["credit_note", "credit"]}}, d0, d1))
        out = await expense_total(f, d0, d1)
        weeks.append({"label": f"W{i + 1}", "in": round(inn, 2), "out": round(out, 2)})

    over30 = 0.0
    async for inv in db.invoices.find({**f, "status": LIVE_SALE}):
        st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
        if st["due"] > 0 and st["days_overdue"] > 30:
            over30 += st["due"]

    by_shop: dict = {}
    for d in docs:
        k = d.get("shop") or "Main branch"
        by_shop[k] = round(by_shop.get(k, 0) + d["total"], 2)
    shops = sorted(by_shop.items(), key=lambda kv: -kv[1])
    lead = round(shops[0][1] - shops[1][1], 2) if len(shops) > 1 else (shops[0][1] if shops else 0)

    money_in = round(sum(w["in"] for w in weeks), 2)
    money_out = round(sum(w["out"] for w in weeks), 2)
    return {"label": label, "period": period, "rep": rep,
            "money_in": money_in, "money_out": money_out, "net_movement": round(money_in - money_out, 2),
            "sales": sales, "sales_change": pct_change(sales, prev_sales),
            "purchases": purchases, "purchases_change": pct_change(purchases, prev_purchases),
            "expenses": expenses, "expenses_change": pct_change(expenses, prev_expenses),
            "gross_profit": gross, "margin": round(gross / sales * 100, 1) if sales else 0,
            "weeks": weeks, "receivables_over_30": round(over30, 2),
            "shops": [{"name": k, "amount": v} for k, v in shops], "shop_lead": lead}


@router.get("/cashflow")
async def cashflow(user: CurrentUser, period: str = "month", start: Optional[str] = None, end: Optional[str] = None, rep: str = ""):
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    sc = await shop_scope(user, "stock")
    a, b, label = period_range(period, start, end)
    win_start = a or (b - timedelta(days=30))
    cash = {"method": {"$nin": ["credit_note", "credit"]}}
    money_in = await sum_field(db.payments, date_query({**f, **cash}, a, b))
    money_out = await expense_total(f, a, b, rep)

    accounts = []
    opening_total = 0.0
    async for acc in db.accounts.find(bf):
        aid = str(acc["_id"])
        inn = await sum_field(db.payments, {**bf, "account_id": aid, **cash})
        out = await sum_field(db.expenses, {**bf, "account_id": aid})
        bal = round((acc.get("opening_balance") or 0) + inn - out, 2)
        entries = await db.payments.count_documents({**bf, "account_id": aid}) + await db.expenses.count_documents({**bf, "account_id": aid})
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
        inn = await sum_field(db.payments, date_query({**f, **cash}, d0, d1))
        out = await expense_total(f, d0, d1)
        running = round(running + inn - out, 2)
        series.append({"label": d0.strftime("%d"), "value": running})
        d0 = d1
    return {"label": label, "period": period, "closing": closing, "net": round(money_in - money_out, 2),
            "in": money_in, "out": money_out, "series": series, "accounts": accounts, "opening": round(opening_total, 2)}


@router.get("/products")
async def products(user: CurrentUser, period: str = "month", start: Optional[str] = None, end: Optional[str] = None, rep: str = ""):
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    sc = await shop_scope(user, "stock")
    a, b, label = period_range(period, start, end)
    items = await item_costs(bf)
    docs = await sale_docs(f, a, b, rep)

    rows: dict = {}
    for d in docs:
        for l in d.get("lines", []):
            key = l.get("item_id") or l.get("name")
            it = items.get(l.get("item_id") or "")
            r = rows.setdefault(key, {"id": l.get("item_id"), "name": l.get("name"), "unit": (it or {}).get("unit", l.get("unit") or "unit"),
                                      "revenue": 0.0, "qty": 0.0, "cost": 0.0})
            r["revenue"] = round(r["revenue"] + (l.get("total") or 0), 2)
            r["qty"] = round(r["qty"] + (l.get("quantity") or 0), 2)
            r["cost"] = round(r["cost"] + line_cost(l, it), 2)
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
        last = await db.movements.find_one({**bf, "item_id": iid, "kind": "sale"}, sort=[("created_at", -1)])
        days_idle = (today - last["created_at"].replace(tzinfo=timezone.utc)).days if last else 999
        qty_here = shop_qty(it, sc["shops"], sc["main"])
        tied = round(qty_here * (it.get("cost_price") or 0), 2)
        if days_idle >= 7 and tied > 0:
            slow.append({"id": iid, "name": it["name"], "days": days_idle, "tied": tied, "qty": qty_here,
                         "unit": it.get("unit", "unit"), "revenue": rows.get(iid, {}).get("revenue", 0)})
    slow.sort(key=lambda r: -r["days"])

    cogs = cogs_of(docs, items)
    stock_value = round(sum(shop_qty(i, sc["shops"], sc["main"]) * (i.get("cost_price") or 0) for i in items.values() if i.get("track_stock", True)), 2)
    turnover = round(cogs / stock_value, 1) if stock_value else 0
    return {"label": label, "top": top, "profit": by_profit, "slow": slow[:8], "turnover": turnover,
            "turnover_health": "Healthy" if turnover >= 2 else "Slow", "stock_value": stock_value}


@router.get("/pnl")
async def pnl(user: CurrentUser, period: str = "month", start: Optional[str] = None, end: Optional[str] = None, rep: str = ""):
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    sc = await shop_scope(user, "stock")
    a, b, label = period_range(period, start, end)
    items = await item_costs(bf)
    docs = await sale_docs(f, a, b, rep)
    revenue = round(sum(d["total"] for d in docs), 2)
    returns = await sum_field(db.returns, date_query(f, a, b), "total")
    cogs = cogs_of(docs, items)
    gross = round(revenue - returns - cogs, 2)

    by_cat: dict = {}
    stock_bought = 0.0
    async for e in db.expenses.find(date_query({**f, **(rep_clause(rep) if rep else {})}, a, b)):
        if e["category"] == "Purchases":
            # goods for resale: they land in cost of sales when they sell
            stock_bought = round(stock_bought + e["amount"], 2)
            continue
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
        md = await sale_docs(f, m0, m1, rep)
        rev = sum(d["total"] for d in md)
        exp = await expense_total(f, m0, m1, rep, exclude_stock=True)
        bars.append({"label": m.strftime("%b"), "value": round(rev - cogs_of(md, items) - exp, 2)})

    return {"label": label, "rep": rep, "revenue": revenue, "returns": returns, "cogs": cogs, "gross": gross,
            "expense_lines": lines, "expenses": total_expenses, "net": net, "stock_bought": stock_bought,
            "margin": round(net / revenue * 100, 1) if revenue else 0, "bars": bars}


@router.get("/receivables")
async def receivables(user: CurrentUser):
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    sc = await shop_scope(user, "stock")
    buckets = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "60_plus": 0.0}
    rows = []
    async for inv in db.invoices.find({**f, "status": LIVE_SALE}):
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
    async for p in db.purchases.find({**bf, **LIVE_PO}):
        payables += round((p.get("total") or 0) - (p.get("paid") or 0), 2)
    # Every open invoice is returned: the buckets and the list have to add up to
    # the same figure, or the report is lying about what is owed.
    return {"buckets": buckets, "total": round(sum(buckets.values()), 2), "rows": rows,
            "count": len(rows), "payables": round(payables, 2)}


@router.get("/stock-valuation", dependencies=[Depends(need("see_stock_value"))])
async def stock_valuation(user: CurrentUser):
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    sc = await shop_scope(user, "stock")
    rows, total, retail, low, out = [], 0.0, 0.0, 0, 0
    async for i in db.items.find(bf).sort("name", 1):
        if not i.get("track_stock", True):
            continue
        qty = shop_qty(i, sc["shops"], sc["main"])
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
async def sales_summary(user: CurrentUser, period: str = "month", group: str = "day", start: Optional[str] = None, end: Optional[str] = None, rep: str = ""):
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    sc = await shop_scope(user, "stock")
    a, b, label = period_range(period, start, end)
    docs = await sale_docs(f, a, b, rep)
    groups: dict = {}
    for d in docs:
        if group == "rep":
            key = d.get("rep") or "Not recorded"
            ref = key
        elif group == "customer":
            cid = d.get("customer_id")
            cust = await db.customers.find_one({"_id": ObjectId(cid)}) if cid else None
            key = cust["name"] if cust else "Cash sale"
            ref = cid or ""
        elif group == "shop":
            key = d.get("shop") or "Main branch"
            ref = key
        elif group == "product":
            for l in d.get("lines", []):
                k = l.get("name")
                g = groups.setdefault(k, {"label": k, "key": l.get("item_id") or k, "amount": 0.0, "count": 0})
                g["amount"] = round(g["amount"] + (l.get("total") or 0), 2)
                g["count"] += 1
            continue
        else:
            key = d["created_at"].strftime("%d %b")
            ref = d["created_at"].date().isoformat()
        g = groups.setdefault(key, {"label": key, "key": ref, "amount": 0.0, "count": 0})
        g["amount"] = round(g["amount"] + d["total"], 2)
        g["count"] += 1
    rows = sorted(groups.values(), key=lambda r: -r["amount"])
    return {"label": label, "group": group, "rep": rep, "rows": rows,
            "total": round(sum(r["amount"] for r in rows), 2), "count": len(docs)}


# ---------------------------------------------------------------- 07.x by rep
@router.get("/reps")
async def sales_by_rep(user: CurrentUser, period: str = "month", start: Optional[str] = None, end: Optional[str] = None):
    """Who sold what, how often, and what it was worth — the figures behind the
    Reps page and the "filter by rep" the owner asked for."""
    f = await scoped(user, "reports")
    bf = biz_filter(user)
    a, b, label = period_range(period, start, end)
    docs = await sale_docs(f, a, b)
    items = await item_costs(bf)

    rows: dict = {}

    def row(name: str) -> dict:
        return rows.setdefault(name or "Not recorded", {
            "rep": name or "Not recorded", "sales": 0.0, "count": 0, "invoices": 0, "quick_sales": 0,
            "profit": 0.0, "expenses": 0.0, "collected": 0.0, "last_sale": None, "customers": set()})

    for d in docs:
        r = row(d.get("rep", ""))
        r["sales"] = round(r["sales"] + d["total"], 2)
        r["count"] += 1
        r["invoices"] += 1 if d["kind"] == "invoice" else 0
        r["quick_sales"] += 1 if d["kind"] == "sale" else 0
        r["profit"] = round(r["profit"] + d["total"] - cogs_of([d], items), 2)
        if d.get("customer_id"):
            r["customers"].add(d["customer_id"])
        ts = d["created_at"].isoformat()
        if not r["last_sale"] or ts > r["last_sale"]:
            r["last_sale"] = ts

    async for e in db.expenses.find(date_query(f, a, b)):
        r = row(e.get("rep") or e.get("created_by", ""))
        r["expenses"] = round(r["expenses"] + e["amount"], 2)

    # Money each rep actually brought in — a sale is not collected until it is paid.
    async for p in db.payments.find(date_query({**f, "method": {"$nin": ["credit_note", "credit"]}}, a, b)):
        r = row(p.get("rep") or p.get("created_by", ""))
        r["collected"] = round(r["collected"] + (p.get("amount") or 0), 2)

    # everyone on the team shows up, even the ones who sold nothing this period
    async for u in db.users.find({"business_id": bf["business_id"]}):
        r = row(u.get("name", ""))
        r["email"] = u.get("email", "")
        r["phone"] = u.get("phone", "")
        r["role"] = u.get("role", "owner")
        r["user_id"] = str(u["_id"])
        r["shops"] = u.get("shops", [])

    days = max(1, ((b - a).days if a else 30))
    out = []
    for r in rows.values():
        r["customers"] = len(r["customers"])
        r["frequency"] = round(r["count"] / days * 7, 1)          # sales a week
        r["average_sale"] = round(r["sales"] / r["count"], 2) if r["count"] else 0
        out.append(r)
    out.sort(key=lambda r: -r["sales"])
    total = round(sum(r["sales"] for r in out), 2)
    return {"label": label, "period": period, "rows": out, "total": total,
            "best": out[0]["rep"] if out and out[0]["sales"] else "", "days": days}


@router.get("/debtors")
async def debtors(user: CurrentUser):
    """Who owes money, how much and for how long — the named report the old app
    had, so nobody has to read the ageing buckets to chase a customer."""
    f = await scoped(user, "reports")
    rows: dict = {}
    async for inv in db.invoices.find({**f, "status": LIVE_SALE}):
        st = invoice_status(inv, await invoice_paid(f["business_id"], str(inv["_id"])))
        if st["due"] <= 0:
            continue
        cid = inv.get("customer_id") or "cash"
        r = rows.setdefault(cid, {"id": cid if cid != "cash" else "", "customer": "Cash sale", "phone": "",
                                  "owed": 0.0, "invoices": 0, "oldest_days": 0, "oldest_number": "", "limit": None})
        r["owed"] = round(r["owed"] + st["due"], 2)
        r["invoices"] += 1
        if st["days_overdue"] > r["oldest_days"]:
            r["oldest_days"] = st["days_overdue"]
            r["oldest_number"] = inv.get("number", "")
    for cid, r in rows.items():
        if cid != "cash" and ObjectId.is_valid(cid):
            c = await db.customers.find_one({"_id": ObjectId(cid)})
            if c:
                r["customer"] = c.get("name", "")
                r["phone"] = c.get("phone", "")
                r["limit"] = c.get("credit_limit")
                r["over_limit"] = bool(c.get("credit_limit") and r["owed"] > c["credit_limit"])
    out = sorted(rows.values(), key=lambda r: -r["owed"])
    return {"rows": out, "total": round(sum(r["owed"] for r in out), 2), "count": len(out),
            "overdue": round(sum(r["owed"] for r in out if r["oldest_days"] > 0), 2)}


# ---------------------------------------------------------------- drill-down
@router.get("/entries")
async def report_entries(user: CurrentUser, kind: str = "sales", key: str = "", period: str = "month",
                         start: Optional[str] = None, end: Optional[str] = None, rep: str = ""):
    """The records behind a figure. Every number in a report is a tap away from
    the entries that made it, which is what the owner asked for on page 33."""
    f = await scoped(user, "reports")
    a, b, label = period_range(period, start, end)
    rows = []
    title = "Entries"

    if kind == "expenses":
        q = {**f, **(rep_clause(rep) if rep else {})}
        if key:
            q["category"] = key
        accounts = {str(x["_id"]): x["name"] async for x in db.accounts.find(biz_filter(user))}
        async for e in db.expenses.find(date_query(q, a, b)).sort("created_at", -1):
            rows.append({"id": str(e["_id"]), "title": e.get("note") or e["category"], "sub": e["category"],
                         "extra": accounts.get(e.get("account_id") or "", "Cash"), "amount": e["amount"],
                         "date": e["created_at"].isoformat(), "route": f"/expenses/{str(e['_id'])}",
                         "rep": e.get("rep") or e.get("created_by", ""), "shop": e.get("shop", "")})
        title = key or "Expenses"
    else:
        docs = await sale_docs(f, a, b, rep)
        if kind == "product":
            for d in docs:
                for l in d.get("lines", []):
                    if key and l.get("item_id") != key and l.get("name") != key:
                        continue
                    rows.append({"id": d["id"], "title": f"{l.get('quantity')} × {l.get('name')}", "sub": d["number"],
                                 "extra": d.get("shop", ""), "amount": l.get("total") or 0, "date": d["created_at"].isoformat(),
                                 "route": f"/invoices/{d['id']}" if d["kind"] == "invoice" else f"/sales/{d['id']}",
                                 "rep": d.get("rep", ""), "shop": d.get("shop", "")})
            title = key and rows[0]["title"].split("× ")[-1] if rows else "Product"
        else:
            names: dict = {}
            for d in docs:
                if kind == "customer":
                    cid = d.get("customer_id") or ""
                    if key and cid != key:
                        continue
                elif kind == "shop" and key and (d.get("shop") or "Main branch") != key:
                    continue
                elif kind == "rep" and key and (d.get("rep") or "Not recorded") != key:
                    continue
                cid = d.get("customer_id") or ""
                if cid and cid not in names:
                    c = await db.customers.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
                    names[cid] = (c or {}).get("name", "Cash sale")
                rows.append({"id": d["id"], "title": names.get(cid, "Cash sale"), "sub": d["number"],
                             "extra": d.get("shop", ""), "amount": d["total"], "date": d["created_at"].isoformat(),
                             "route": f"/invoices/{d['id']}" if d["kind"] == "invoice" else f"/sales/{d['id']}",
                             "rep": d.get("rep", ""), "shop": d.get("shop", "")})
            title = {"sales": "Sales", "customer": "Customer", "shop": key or "Shop", "rep": key or "Rep"}.get(kind, "Entries")
    rows.sort(key=lambda r: r["date"], reverse=True)
    return {"kind": kind, "key": key, "label": label, "title": title, "rows": rows[:200],
            "total": round(sum(r["amount"] for r in rows), 2), "count": len(rows)}
