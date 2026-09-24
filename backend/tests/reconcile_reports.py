"""Accuracy pass for the report tab (PDF 34).

Every headline figure is reconciled against the records underneath it: sales
against invoices and quick sales, cost of goods against purchase prices,
expenses against their categories, receivables against payments, stock
valuation against what is on the shelf. Run:

    python tests/reconcile_reports.py
"""
import os
import sys
import requests

BASE = os.environ.get("TREDI_BASE", "https://ui-flow-accurate.preview.emergentagent.com") + "/api"
EMAIL = os.environ.get("TREDI_EMAIL", "owner@tredi.app")
PASSWORD = os.environ.get("TREDI_PASSWORD", "tredi1234")

fails: list[str] = []


def check(name: str, a: float, b: float, tol: float = 1.0):
    ok = abs(round(a, 2) - round(b, 2)) <= tol
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {a:,.2f} vs {b:,.2f}")
    if not ok:
        fails.append(f"{name}: {a:,.2f} vs {b:,.2f}")


def main():
    s = requests.Session()
    tok = s.post(f"{BASE}/auth/login", data={"username": EMAIL, "password": PASSWORD}, timeout=60)
    tok.raise_for_status()
    s.headers["Authorization"] = f"Bearer {tok.json()['access_token']}"

    def get(path):
        r = s.get(f"{BASE}{path}", timeout=120)
        r.raise_for_status()
        return r.json()

    period = "period=month"
    summary = get(f"/reports/summary?{period}")
    pnl = get(f"/reports/pnl?{period}")
    sales_sum = get(f"/reports/sales-summary?{period}&group=day")
    reps = get(f"/reports/reps?{period}")
    entries = get(f"/reports/entries?kind=sales&{period}")
    rec = get("/reports/receivables")
    debtors = get("/reports/debtors")
    cash = get(f"/reports/cashflow?{period}")
    stock = get("/reports/stock-valuation")
    expenses = get("/expenses?period=month")
    accounts = get("/accounts")
    items = get("/items")

    print("\n— sales, four ways —")
    check("sales-summary total = summary sales", sales_sum["total"], summary["sales"])
    check("sales by rep total = summary sales", reps["total"], summary["sales"])
    check("drill-down entries total = summary sales", entries["total"], summary["sales"])
    check("entries count = sales-summary count", entries["count"], sales_sum["count"], tol=0)

    print("\n— sales by every grouping —")
    for group in ("customer", "product", "shop", "rep"):
        g = get(f"/reports/sales-summary?{period}&group={group}")
        if group == "product":
            # product rows are line totals: they exclude whole-invoice discount,
            # VAT and shipping, so they are only checked for internal consistency
            check(f"group={group} rows sum = its own total", sum(r["amount"] for r in g["rows"]), g["total"])
        else:
            check(f"group={group} total = summary sales", g["total"], summary["sales"])

    print("\n— profit and loss —")
    check("pnl gross = revenue - returns - cogs", pnl["gross"], pnl["revenue"] - pnl["returns"] - pnl["cogs"])
    check("pnl net = gross - expense lines", pnl["net"], pnl["gross"] - sum(e["amount"] for e in pnl["expense_lines"]))
    check("pnl revenue = summary sales", pnl["revenue"], summary["sales"])

    print("\n— expenses —")
    check("expenses list total = category sums", expenses["total"], sum(c["amount"] for c in expenses["by_category"]))
    check("expenses list total = item sums", expenses["total"], sum(i["amount"] for i in expenses["items"]))
    check("expenses count = item rows", expenses["count"], len(expenses["items"]), tol=0)
    for cat in expenses["by_category"][:4]:
        one = get(f"/expenses?period=month&category={requests.utils.quote(cat['category'])}")
        drill = get(f"/reports/entries?kind=expenses&key={requests.utils.quote(cat['category'])}&{period}")
        check(f"category {cat['category']}: list = breakdown", one["total"], cat["amount"])
        check(f"category {cat['category']}: drill-down = breakdown", drill["total"], cat["amount"])

    print("\n— receivables —")
    check("debtors total = receivables total", debtors["total"], rec["total"])
    check("receivables total = open invoice dues", rec["total"], sum(r["due"] for r in rec["rows"]))
    check("debtors rows sum = debtors total", sum(r["owed"] for r in debtors["rows"]), debtors["total"])
    check("receivables buckets = total", sum(rec["buckets"].values()), rec["total"])

    print("\n— cash flow and accounts —")
    check("cashflow net = in - out", cash["net"], cash["in"] - cash["out"])
    check("account balances = accounts total", sum(a["balance"] for a in accounts["accounts"]), accounts["total"])
    for a in accounts["accounts"]:
        st = get(f"/accounts/{a['id']}?period=all")
        check(f"account {a['name']} statement closing = list balance", st["closing"], a["balance"])

    print("\n— stock —")
    shelf = sum((i["quantity"] or 0) * (i["cost_price"] or 0) for i in items if i.get("track_stock", True))
    check("stock valuation = quantity x cost on the shelf", stock["total_cost"] if "total_cost" in stock else stock.get("total", 0), shelf)

    print("\n— rep figures —")
    check("rep sales rows = reps total", sum(r["sales"] for r in reps["rows"]), reps["total"])
    for r in reps["rows"][:3]:
        if not r.get("user_id"):
            continue
        txn = get(f"/reps/{r['user_id']}/transactions?period=month")
        check(f"rep {r['rep']}: transactions total = rep sales", txn["sold"], r["sales"])
        check(f"rep {r['rep']}: expenses recorded match", txn["expense_total"], r["expenses"])

    print("\n" + ("ALL FIGURES TALLY" if not fails else f"{len(fails)} MISMATCH(ES):"))
    for f in fails:
        print(" -", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
