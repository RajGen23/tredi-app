"""One-time migration of the live tredibooks MySQL database into this app's MongoDB.

Read-only on MySQL. Every document is upserted on its `legacy_uuid`, so the script
is safe to re-run and never deletes anything on either side.

    python -m migrations.import_legacy --source tredi            # dry run
    python -m migrations.import_legacy --source tredi --commit   # write

Passwords come across untouched: the old system stores bcrypt ($2y$), which passlib
verifies, so every trader keeps their existing password.
"""
import argparse
import asyncio
import re
import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pymysql
from dotenv import load_dotenv
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

MYSQL = {
    "host": os.environ.get("LEGACY_DB_HOST", ""),
    "port": int(os.environ.get("LEGACY_DB_PORT", "25060")),
    "user": os.environ.get("LEGACY_DB_USER", ""),
    "password": os.environ.get("LEGACY_DB_PASSWORD", ""),
    "ssl": {"ssl": {}},
    "connect_timeout": 30,
    "cursorclass": pymysql.cursors.DictCursor,
}
PAY_METHOD = {"cash": "cash", "bank_transfer": "transfer", "pos": "card", "unused_credit": "credit_note"}
UNIT = "Piece"


def num(v) -> float:
    if v is None:
        return 0.0
    return float(v) if not isinstance(v, Decimal) else float(v)


def utc(v) -> datetime:
    if not v:
        return datetime.now(timezone.utc)
    return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v


def rows(cur, sql, args=()):
    cur.execute(sql, args)
    return cur.fetchall()


class Migration:
    def __init__(self, db, cur, source: str, commit: bool):
        self.db, self.cur, self.source, self.commit = db, cur, source, commit
        self.counts: dict[str, int] = {}
        self.business: dict[str, str] = {}   # legacy business uuid -> mongo business_id
        self.shop_business: dict[str, str] = {}
        self.shop_name: dict[str, str] = {}
        self.customer: dict[str, str] = {}
        self.item: dict[str, str] = {}
        self.account: dict[str, str] = {}
        self.category: dict[str, str] = {}

    def tally(self, key: str, n: int = 1):
        self.counts[key] = self.counts.get(key, 0) + n

    async def upsert(self, coll, legacy_uuid: str, doc: dict, kind: str, insert_only: dict | None = None) -> str:
        """Insert or update on legacy_uuid. `insert_only` fields (plan, etc.) are
        written once and then owned by the new app, so a refresh never undoes them."""
        insert_only = insert_only or {}
        existing = await coll.find_one({"legacy_uuid": legacy_uuid}, {"_id": 1})
        if existing:
            if self.commit:
                await coll.update_one({"_id": existing["_id"]}, {"$set": doc})
            self.tally(f"{kind}:updated")
            return str(existing["_id"])
        if not self.commit:
            self.tally(f"{kind}:new")
            return f"dry-{legacy_uuid}"
        res = await coll.insert_one({**doc, **insert_only, "legacy_uuid": legacy_uuid})
        self.tally(f"{kind}:new")
        return str(res.inserted_id)

    # ------------------------------------------------------------------ steps
    def live_plans(self) -> dict:
        """Active paid subscription per trader on the live system."""
        names = {"Starter": "starter", "Trader Premium": "premium", "Pro Plan": "pro", "Enterprise": "enterprise"}
        cycle = {"monthly": "monthly", "quarterly": "quarterly", "yearly": "yearly"}
        out = {}
        for r in rows(self.cur, f"select trader_uuid, type, status, billing_cycle, expires_at from {self.source}.subscriptions "
                                f"where status = 'active' order by expires_at"):
            if r["type"] in names and r.get("expires_at"):
                out[r["trader_uuid"]] = {"plan": names[r["type"]], "renews_at": utc(r["expires_at"]),
                                         "plan_cadence": cycle.get(r.get("billing_cycle") or "", "monthly"), "plan_source": "live_subscription"}
        return out

    async def businesses(self):
        paid = self.live_plans()
        grandfather = {"plan": "pro", "renews_at": datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=365),
                       "plan_source": "grandfathered"}
        shops = rows(self.cur, f"select * from {self.source}.shops order by id")
        by_business: dict[str, list] = {}
        for sh in shops:
            by_business.setdefault(sh["business_uuid"], []).append(sh)

        for b in rows(self.cur, f"select * from {self.source}.businesses order by deleted_at is null desc, id"):
            mine = by_business.get(b["uuid"], [])
            doc = {
                "name": b["name"] or "Unnamed business",
                "type": b.get("business_type") or b.get("category") or "Retail",
                "currency": (b.get("currency") or "NGN").upper(),
                "tin": b.get("tax_identification_number") or "",
                "address": b.get("hq_location") or "",
                "phone": b.get("phone_number_one") or "",
                "email": b.get("email") or "",
                "logo_url": b.get("logo_url"),
                "track_stock": True,
                "shops": [{"name": sh["name"] or "Main branch", "address": sh.get("address") or "",
                           "phone": sh.get("phone") or "", "sells": True, "is_main": i == 0}
                          for i, sh in enumerate(mine)] or [{"name": "Main branch", "address": b.get("hq_location") or "", "phone": "", "sells": True, "is_main": True}],
                "legacy_trader_uuid": b.get("trader_uuid"),
                # archived businesses are copied but stay hidden from the app
                "deleted_at": utc(b["deleted_at"]) if b.get("deleted_at") else None,
                "archived": bool(b.get("deleted_at")),
                "created_at": utc(b.get("created_at")),
            }
            # The plan is set once; after that the app / Super Admin own it.
            bid = await self.upsert(self.db.businesses, b["uuid"], doc, "businesses",
                                    insert_only=paid.get(b.get("trader_uuid")) or grandfather)
            self.business[b["uuid"]] = bid
            for sh in mine:
                self.shop_business[sh["uuid"]] = bid
                self.shop_name[sh["uuid"]] = sh["name"] or "Main branch"

    async def users(self):
        # businesses.trader_uuid -> traders.uuid -> traders.user_uuid
        trader_user = {t["uuid"]: t["user_uuid"] for t in rows(self.cur, f"select uuid, user_uuid from {self.source}.traders")}
        owns: dict[str, list[str]] = {}
        for r in rows(self.cur, f"select uuid, trader_uuid from {self.source}.businesses order by deleted_at is null desc, id"):
            uid = trader_user.get(r.get("trader_uuid"))
            if uid and r["uuid"] in self.business:
                owns.setdefault(uid, []).append(self.business[r["uuid"]])
        trader_business = {uid: bids[0] for uid, bids in owns.items()}
        rep_shops: dict[str, list[str]] = {}
        for r in rows(self.cur, f"select rep_uuid, shop_uuid from {self.source}.shop_reps"):
            rep_shops.setdefault(r["rep_uuid"], []).append(r["shop_uuid"])
        rep_user = {r["uuid"]: r["user_uuid"] for r in rows(self.cur, f"select uuid, user_uuid from {self.source}.reps")}
        user_shops: dict[str, list[str]] = {}
        for rep_uuid, shop_uuids in rep_shops.items():
            uid = rep_user.get(rep_uuid)
            if uid:
                user_shops[uid] = shop_uuids

        for u in rows(self.cur, f"select * from {self.source}.users where email is not null and email <> '' order by deleted_at is null desc, id"):
            email = u["email"].strip().lower()
            clash = await self.db.users.find_one({"email": email, "legacy_uuid": {"$ne": u["uuid"]}}, {"_id": 1})
            if clash:
                self.tally("users:email_taken")
                continue
            shop_uuids = user_shops.get(u["uuid"], [])
            bid = trader_business.get(u["uuid"]) or next((self.shop_business[s] for s in shop_uuids if s in self.shop_business), None)
            doc = {
                "name": " ".join(x for x in [u.get("first_name"), u.get("last_name")] if x).strip() or email.split("@")[0],
                "email": email,
                "phone": u.get("phone_number") or "",
                "password_hash": u.get("password") or "",   # bcrypt $2y$ — verifies as-is
                "business_id": bid,
                "role": "owner" if u["role_id"] == 2 else "sales",
                "shops": [self.shop_name[s] for s in shop_uuids if s in self.shop_name],
                "active": not (u.get("suspended_at") or u.get("deleted_at")),
                "deactivated_at": utc(u["deleted_at"]) if u.get("deleted_at") else None,
                "created_at": utc(u.get("created_at")),
            }
            if not doc["password_hash"]:
                self.tally("users:no_password")
            # a password set in this app ($2b$) beats the legacy one ($2y$) on a re-sync
            mine = await self.db.users.find_one({"legacy_uuid": u["uuid"]}, {"password_hash": 1})
            if mine and mine.get("password_hash") and not mine["password_hash"].startswith("$2y$"):
                doc.pop("password_hash")
                self.tally("users:kept_new_password")
            uid = await self.upsert(self.db.users, u["uuid"], doc, "users")
            seen = u.get("last_active_at") or u.get("last_login_at")
            if seen and self.commit and ObjectId.is_valid(uid):
                # keep whichever is newer: activity on the live system or in this app
                await self.db.users.update_one({"_id": ObjectId(uid)}, {"$max": {"last_seen_at": utc(seen)}})
                if bid:
                    await self.db.businesses.update_one({"_id": ObjectId(bid)}, {"$max": {"last_active_at": utc(seen)}})
            if bid:
                self.tally("users:with_business")
            # every business this trader owns points back at them
            for owned in owns.get(u["uuid"], []):
                self.tally("businesses:owner_set")
                if self.commit:
                    await self.db.businesses.update_one({"_id": ObjectId(owned)}, {"$set": {"owner_id": uid}})

    async def accounts(self):
        for a in rows(self.cur, f"select * from {self.source}.bank_details order by id"):
            bid = self.shop_business.get(a["shop_uuid"])
            if not bid:
                continue
            doc = {"business_id": bid, "deleted_at": None, "name": a.get("bank_name") or "Bank",
                   "kind": "bank", "detail": f"{a.get('account_name') or ''} · {a.get('account_number') or ''}".strip(" ·"),
                   "opening_balance": 0, "created_at": utc(a.get("created_at"))}
            self.account[a["uuid"]] = await self.upsert(self.db.accounts, a["uuid"], doc, "accounts")

    async def customers(self):
        for cst in rows(self.cur, f"select * from {self.source}.customers order by id"):
            bid = self.business.get(cst["business_uuid"])
            if not bid:
                self.tally("customers:no_business")
                continue
            credit = num(cst.get("unused_credit_balance"))
            doc = {"business_id": bid, "deleted_at": utc(cst["deleted_at"]) if cst.get("deleted_at") else None, "name": cst["name"] or "Unnamed customer",
                   "phone": cst.get("phone") or "", "email": cst.get("email") or "", "address": cst.get("address") or "",
                   "opening_balance": credit, "opening_type": "i_owe" if credit else "owes_me",
                   "price_list": "Retail", "credit_limit": None, "created_by": "Migrated",
                   "legacy_number": cst.get("customer_number"), "created_at": utc(cst.get("created_at"))}
            self.customer[cst["uuid"]] = await self.upsert(self.db.customers, cst["uuid"], doc, "customers")

    async def suppliers(self):
        for sp in rows(self.cur, f"select * from {self.source}.suppliers order by id"):
            bid = self.business.get(sp["business_uuid"])
            if not bid:
                continue
            doc = {"business_id": bid, "deleted_at": utc(sp["deleted_at"]) if sp.get("deleted_at") else None, "name": sp["name"] or "Unnamed supplier",
                   "phone": sp.get("phone_number") or "", "email": sp.get("email") or "", "address": sp.get("address") or "",
                   "category": "General", "opening_balance": 0, "note": "", "created_by": "Migrated",
                   "created_at": utc(sp.get("created_at"))}
            await self.upsert(self.db.suppliers, sp["uuid"], doc, "suppliers")

    async def items(self):
        cats = {c["uuid"]: c["name"] for c in rows(self.cur, f"select uuid, name from {self.source}.product_categories")}
        stock: dict[str, dict] = {}
        for sp in rows(self.cur, f"select product_uuid, sum(stock_quantity) qty, min(low_stock_threshold) alert from {self.source}.shop_products where deleted_at is null group by product_uuid"):
            stock[sp["product_uuid"]] = sp
        for p in rows(self.cur, f"select * from {self.source}.products order by id"):
            bid = self.business.get(p["business_uuid"])
            if not bid:
                self.tally("items:no_business")
                continue
            st = stock.get(p["uuid"], {})
            doc = {"business_id": bid, "deleted_at": utc(p["deleted_at"]) if p.get("deleted_at") else None, "name": p["name"] or "Unnamed item", "kind": "product",
                   "category": cats.get(p.get("category_uuid")) or "General", "unit": UNIT,
                   "barcode": p.get("barcode") or "", "sku": p.get("sku") or "", "supplier": "", "location": "",
                   "cost_price": num(p.get("cost_price")), "selling_price": num(p.get("selling_price")),
                   "wholesale_price": None, "track_stock": not p.get("is_consumable"),
                   "quantity": num(st.get("qty")), "alert_below": num(st.get("alert")),
                   "expiry": None, "photo_url": p.get("image_url"), "note": p.get("description") or "",
                   "created_by": "Migrated", "created_at": utc(p.get("created_at")), "updated_at": utc(p.get("updated_at"))}
            self.item[p["uuid"]] = await self.upsert(self.db.items, p["uuid"], doc, "items")

    async def invoices(self):
        lines_by_invoice: dict[str, list] = {}
        for li in rows(self.cur, f"select * from {self.source}.invoice_items where deleted_at is null order by id"):
            lines_by_invoice.setdefault(li["invoice_uuid"], []).append(li)
        pays_by_invoice: dict[str, list] = {}
        for pay in rows(self.cur, f"select * from {self.source}.invoice_payments order by id"):
            pays_by_invoice.setdefault(pay["invoice_uuid"], []).append(pay)

        for inv in rows(self.cur, f"select * from {self.source}.invoices order by created_at"):
            bid = self.shop_business.get(inv["shop_uuid"])
            if not bid:
                self.tally("invoices:no_business")
                continue
            lines = []
            for li in lines_by_invoice.get(inv["uuid"], []):
                qty, price = num(li.get("quantity")), num(li.get("unit_price"))
                gross = round(qty * price, 2)
                disc = round(gross * num(li.get("discount_percent")) / 100, 2)
                lines.append({"item_id": self.item.get(li.get("product_uuid")), "name": li.get("name") or "Item",
                              "quantity": qty, "unit_price": price, "discount_type": "percent",
                              "discount_value": num(li.get("discount_percent")), "note": li.get("description") or "",
                              "quick_add": False, "unit": UNIT, "gross": gross, "discount": disc,
                              "total": round(gross - disc, 2),
                              # cost frozen at the time of sale, straight from the live line
                              **({"cost_at_sale": num(li["cost_price"])} if li.get("cost_price") is not None else {})})
            gross = round(sum(x["gross"] for x in lines), 2)
            line_disc = round(sum(x["discount"] for x in lines), 2)
            after = gross - line_disc
            inv_disc = round(after * num(inv.get("discount_percentage")) / 100, 2)
            taxable = round(after - inv_disc, 2)
            vat_rate = num(inv.get("tax_percentage"))
            vat = round(taxable * vat_rate / 100, 2)
            total = round(taxable + vat + num(inv.get("shipping_fee")), 2)
            if not lines and num(inv.get("total_amount")):
                total = num(inv["total_amount"])   # keep the figure even when the lines are gone
                taxable = total
            status = "draft" if inv.get("status") == "draft" else "issued"
            iid = await self.upsert(self.db.invoices, inv["uuid"], {
                "business_id": bid, "deleted_at": utc(inv["deleted_at"]) if inv.get("deleted_at") else None,
                "customer_id": self.customer.get(inv.get("customer_uuid")),
                # legacy numbers embed the business/shop uuids — keep the readable head
                "number": re.split(r"-(?:BS|SH|RS)", inv.get("invoice_number") or "LEGACY")[0].strip("-") or "LEGACY",
                "legacy_number": inv.get("invoice_number"),
                "lines": lines,
                "totals": {"gross": gross, "line_discount": line_disc, "invoice_discount": inv_disc,
                           "taxable": taxable, "vat": vat, "total": total},
                "invoice_discount_type": "percent", "invoice_discount_value": num(inv.get("discount_percentage")),
                "vat_rate": vat_rate, "shipping_fee": num(inv.get("shipping_fee")),
                "due_date": inv["due_date"].date().isoformat() if inv.get("due_date") else None,
                "payment_mode": "credit", "account_id": self.account.get(inv.get("bank_detail_uuid")),
                "status": status, "note": inv.get("note") or "", "terms_id": None,
                "shop": self.shop_name.get(inv["shop_uuid"], ""), "created_by": "Migrated",
                "created_at": utc(inv.get("invoice_date") or inv.get("created_at")),
            }, "invoices")

            for pay in pays_by_invoice.get(inv["uuid"], []):
                refund = pay.get("payment_type") != "credit"
                signed = round(num(pay.get("amount")) * (-1 if refund else 1), 2)
                if signed == 0:
                    self.tally("payments:zero_skipped")
                    continue
                await self.upsert(self.db.payments, pay["uuid"], {
                    "business_id": bid, "deleted_at": utc(pay["deleted_at"]) if pay.get("deleted_at") else None,
                    "customer_id": self.customer.get(inv.get("customer_uuid")),
                    "amount": signed, "account_id": self.account.get(inv.get("bank_detail_uuid")),
                    "method": "refund" if refund else PAY_METHOD.get(pay.get("payment_method"), "cash"),
                    "allocations": [{"invoice_id": iid, "amount": signed}],
                    "note": pay.get("notes") or ("Migrated · refund" if refund else f"Migrated · {pay.get('payment_method') or 'payment'}"),
                    "created_by": "Migrated", "created_at": utc(pay.get("paid_at") or pay.get("created_at")),
                }, "payments")

    async def expenses(self):
        cats = {c["uuid"]: c["name"] for c in rows(self.cur, f"select uuid, name from {self.source}.expense_categories")}
        for e in rows(self.cur, f"select * from {self.source}.expenses order by id"):
            bid = self.shop_business.get(e["shop_uuid"])
            if not bid:
                continue
            await self.upsert(self.db.expenses, e["uuid"], {
                "business_id": bid, "deleted_at": utc(e["deleted_at"]) if e.get("deleted_at") else None, "amount": num(e.get("amount")),
                "category": cats.get(e.get("category_uuid")) or "Other", "account_id": None,
                "note": e.get("note") or "", "shop": self.shop_name.get(e["shop_uuid"], ""),
                "receipt_url": e.get("receipt_url"), "created_by": "Migrated",
                "created_at": utc(e.get("incurred_at") or e.get("created_at")),
            }, "expenses")

    async def run(self):
        await self.businesses()
        await self.users()
        await self.accounts()
        await self.customers()
        await self.suppliers()
        await self.items()
        await self.invoices()
        await self.expenses()
        if self.commit:
            for col, n in (await freeze_line_costs(self.db)).items():
                self.tally(f"{col}:cost_stamped", n)


async def freeze_line_costs(db) -> dict:
    """Stamp today's cost on any sold line that has no frozen cost yet, so profit
    on old sales stops moving when an item's cost changes."""
    costs = {str(i["_id"]): float(i.get("cost_price") or 0) async for i in db.items.find({}, {"cost_price": 1})}
    out = {}
    for col in ("invoices", "sales"):
        touched = 0
        async for doc in db[col].find({"lines.cost_at_sale": {"$exists": False}}, {"lines": 1}):
            lines = doc.get("lines") or []
            for l in lines:
                if l.get("cost_at_sale") is None:
                    l["cost_at_sale"] = costs.get(str(l.get("item_id")), 0)
            await db[col].update_one({"_id": doc["_id"]}, {"$set": {"lines": lines}})
            touched += 1
        out[col] = touched
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="tredi", choices=["tredi", "tredi_staging"])
    ap.add_argument("--commit", action="store_true", help="write to MongoDB (otherwise a dry run)")
    args = ap.parse_args()

    if not MYSQL["host"]:
        sys.exit("Set LEGACY_DB_HOST / LEGACY_DB_USER / LEGACY_DB_PASSWORD in backend/.env first")

    mysql = pymysql.connect(**MYSQL)
    mysql.cursor().execute("SET SESSION TRANSACTION READ ONLY")   # the live database is only ever read
    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    for coll in (db.businesses, db.users, db.customers, db.suppliers, db.items, db.invoices, db.payments, db.expenses, db.accounts):
        await coll.create_index("legacy_uuid", sparse=True)

    m = Migration(db, mysql.cursor(), args.source, args.commit)
    try:
        await m.run()
    finally:
        mysql.close()

    print(f"\n{'WROTE' if args.commit else 'DRY RUN'} · source {args.source}")
    for k in sorted(m.counts):
        print(f"  {k:28s} {m.counts[k]}")
    if not args.commit:
        print("\nNothing was written. Re-run with --commit to apply.")
    mongo.close()


if __name__ == "__main__":
    asyncio.run(main())
