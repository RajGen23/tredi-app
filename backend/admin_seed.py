"""Sample data for the Super Admin panel (SA.1–SA.18).

The panel is cross-tenant by design, so it reads its own `admin_*` collections
for now. Every document keeps the same shape the real multi-tenant tables will
expose, so wiring it to live data later is a query swap, not a rewrite.
"""
import random
from datetime import timedelta

from deps import db, hash_password, now

ADMIN_EMAIL = "superadmin@tredi.app"
ADMIN_PASSWORD = "tredi1234"

PLANS = [
    {"key": "trial", "name": "Trial", "cadence": "14 days", "price": 0, "price_label": "Free", "shops": "1", "users": "2",
     "storage": "2 GB", "businesses": "1", "note": ""},
    {"key": "basic", "name": "Basic", "cadence": "Monthly", "price": 12000, "price_label": "₦ 12,000", "shops": "2", "users": "4",
     "storage": "2 GB", "businesses": "1", "note": ""},
    {"key": "pro", "name": "Pro", "cadence": "Monthly", "price": 38000, "price_label": "₦ 38,000", "shops": "Unlimited",
     "users": "Unlimited", "storage": "5 GB", "businesses": "3", "note": "Most revenue"},
]

FEATURE_GATES = [
    {"feature": "Offline mode & cloud backup", "trial": True, "basic": True, "pro": True},
    {"feature": "Stock transfers between shops", "trial": False, "basic": True, "pro": True},
    {"feature": "Custom roles", "trial": False, "basic": False, "pro": True},
    {"feature": "Multiple businesses", "trial": False, "basic": False, "pro": True},
    {"feature": "Thermal printing & image export", "trial": True, "basic": True, "pro": True},
]

ROLE_TEMPLATES = ["Owner", "Manager", "Sales", "Stock", "Accountant"]

PERMISSION_MATRIX = [
    {"permission": "Create & edit invoices", "owner": True, "manager": True, "sales": True, "stock": False, "accountant": False},
    {"permission": "Delete invoices", "owner": True, "manager": True, "sales": False, "stock": False, "accountant": False},
    {"permission": "See profit & cost prices", "owner": True, "manager": True, "sales": False, "stock": False, "accountant": True},
    {"permission": "Adjust stock quantities", "owner": True, "manager": True, "sales": False, "stock": True, "accountant": False},
    {"permission": "Approve stock transfers", "owner": True, "manager": True, "sales": False, "stock": False, "accountant": False},
    {"permission": "Delete payments", "owner": True, "manager": False, "sales": False, "stock": False, "accountant": True},
    {"permission": "Manage users & roles", "owner": True, "manager": False, "sales": False, "stock": False, "accountant": False},
    {"permission": "Open reports", "owner": True, "manager": True, "sales": True, "stock": True, "accountant": True},
]

NAMED = [
    {"name": "Tredi Ventures", "tin": "12345678-0001", "city": "Lagos", "sector": "retail", "plan": "pro", "status": "healthy",
     "owner": {"name": "Adaeze Nwosu", "phone": "+234 803 442 1180"}, "volume": 1_280_000, "storage": 1.9,
     "shops": [("Ikeja", "Retail", 2, 642_000, True), ("Surulere", "Retail", 1, 428_000, False),
               ("Yaba", "Retail", 1, 214_000, False), ("Central warehouse", "Stock only", 1, 0, False)],
     "renews_in": 5, "records": 18402, "invoices": 96, "overdue": 6, "receivables": 312_000, "last_active_min": 4},
    {"name": "Wichtech Industries ltd", "tin": "00164687-0001", "city": "Lagos", "sector": "wholesale", "plan": "pro", "status": "healthy",
     "owner": {"name": "Obinna Nwankwo", "phone": "+234 805 862 8890"}, "volume": 4_420_000, "storage": 3.7,
     "shops": [("Alaba", "Retail", 4, 2_140_000, True), ("Trade fair", "Retail", 2, 1_480_000, False),
               ("Amuwo store", "Stock only", 1, 800_000, False)],
     "renews_in": 21, "records": 41208, "invoices": 214, "overdue": 11, "receivables": 884_000, "last_active_min": 22},
    {"name": "Adaeze Pharmacy", "tin": "44012288-0001", "city": "Lagos", "sector": "pharmacy", "plan": "basic", "status": "expiring",
     "owner": {"name": "Ifeoma Eze", "phone": "+234 802 771 0044"}, "volume": 214_000, "storage": 0.4,
     "shops": [("Ogba", "Retail", 2, 214_000, True)],
     "renews_in": 3, "records": 4120, "invoices": 41, "overdue": 2, "receivables": 62_000, "last_active_min": 60},
    {"name": "Kano Motors Parts", "tin": "", "city": "Kano", "sector": "auto", "plan": "trial", "status": "no_activity",
     "owner": {"name": "Grace Mwangi", "phone": "+234 807 220 9911"}, "volume": 0, "storage": 0.1,
     "shops": [("Sabon Gari", "Retail", 2, 0, True)],
     "renews_in": 6, "records": 312, "invoices": 0, "overdue": 0, "receivables": 0, "last_active_min": 60 * 24 * 9},
    {"name": "Okeke Logistics", "tin": "77220011-0001", "city": "Abuja", "sector": "logistics", "plan": "lapsed", "status": "read_only",
     "owner": {"name": "Chuka Okeke", "phone": "+234 809 118 2277"}, "volume": 0, "storage": 0.2,
     "shops": [("Wuse", "Retail", 1, 0, True)],
     "renews_in": -22, "records": 2044, "invoices": 18, "overdue": 4, "receivables": 141_000, "last_active_min": 60 * 24 * 23},
    {"name": "Benue Cement Depot", "tin": "31220874-0001", "city": "Makurdi", "sector": "building", "plan": "pro", "status": "healthy",
     "owner": {"name": "Terver Aondo", "phone": "+234 806 553 8890"}, "volume": 2_180_000, "storage": 2.6,
     "shops": [("Makurdi", "Retail", 3, 1_420_000, True), ("Gboko", "Retail", 2, 760_000, False)],
     "renews_in": 7, "records": 12880, "invoices": 132, "overdue": 8, "receivables": 502_000, "last_active_min": 180},
]

FIRST = ["Chidi", "Amina", "Musa", "Tunde", "Grace", "Ngozi", "Bala", "Femi", "Zainab", "Emeka", "Halima", "Segun", "Uche", "Yakubu", "Blessing"]
LAST = ["Okeke", "Yusuf", "Bello", "Adeyemi", "Mwangi", "Nwosu", "Danjuma", "Balogun", "Ibrahim", "Eze", "Sani", "Ogunleye"]
TOWNS = [("Lagos", "NG"), ("Abuja", "NG"), ("Kano", "NG"), ("Ibadan", "NG"), ("Port Harcourt", "NG"), ("Onitsha", "NG"),
         ("Accra", "GH"), ("Nairobi", "KE")]
SECTORS = ["retail", "wholesale", "building", "pharmacy", "auto", "food", "electronics", "fashion"]
SUFFIX = ["Ventures", "Stores", "Enterprises", "Trading", "& Sons", "Depot", "Supermarket", "Hardware", "Pharmacy", "Motors"]


def _tenant_doc(name, tin, city, region, sector, plan, status, owner, volume, storage, shops, renews_in,
                records, invoices, overdue, receivables, last_active_min, rng):
    limit = 5.0 if plan == "pro" else 2.0
    return {
        "name": name,
        "slug": name.lower().replace(" ", "-").replace(".", "").replace("&", "and"),
        "tin": tin,
        "city": city,
        "region": region,
        "sector": sector,
        "plan": plan,
        "plan_amount": {"pro": 38000, "basic": 12000}.get(plan, 0),
        "plan_expires": now() + timedelta(days=renews_in),
        "auto_renew": plan == "pro",
        "reminders": (["7d"] if renews_in <= 7 else []) + (["3d"] if renews_in <= 3 else []),
        "status": status,
        "shops": [{"name": s[0], "type": s[1], "staff": s[2], "sales_30d": s[3], "head_office": s[4]} for s in shops],
        "volume_30d": volume,
        "sales_change_pct": rng.choice([18, 12, -4, 26, 8, 0]),
        "storage_used_gb": storage,
        "storage_limit_gb": limit,
        "last_active": now() - timedelta(minutes=last_active_min),
        "records": records,
        "invoices": invoices,
        "invoices_overdue": overdue,
        "receivables": receivables,
        "owner": owner,
        "currency": "NGN" if region == "NG" else {"GH": "GHS", "KE": "KES"}[region],
        "since": now() - timedelta(days=rng.randint(60, 900)),
        "suspended": False,
        "deletion_at": None,
        "usage": [rng.randint(8, 34) for _ in range(8)],
        "created_at": now() - timedelta(days=rng.randint(1, 500)),
    }


async def seed_admin(force: bool = False) -> dict:
    rng = random.Random(7)
    if force:
        for c in ["admin_tenants", "admin_users", "admin_audit", "admin_sync", "admin_snapshots", "admin_migrations",
                  "admin_support", "admin_broadcasts", "admin_plans", "admin_config", "admin_errors", "admin_services",
                  "admin_signals", "admin_accounts"]:
            await db[c].delete_many({})

    # ---------------------------------------------------------------- admin account
    if not await db.admin_accounts.find_one({"email": ADMIN_EMAIL}):
        await db.admin_accounts.insert_one({"email": ADMIN_EMAIL, "name": "Gaurav", "hashed_password": hash_password(ADMIN_PASSWORD),
                                            "last_sign_in": now() - timedelta(hours=19), "last_place": "Jaipur IN", "created_at": now()})

    if await db.admin_tenants.count_documents({}) == 0:
        docs = []
        for n in NAMED:
            docs.append(_tenant_doc(n["name"], n["tin"], n["city"], "NG", n["sector"], n["plan"], n["status"], n["owner"],
                                    n["volume"], n["storage"], n["shops"], n["renews_in"], n["records"], n["invoices"],
                                    n["overdue"], n["receivables"], n["last_active_min"], rng))
        for i in range(234):
            city, region = rng.choice(TOWNS)
            plan = rng.choices(["pro", "basic", "trial", "lapsed"], weights=[38, 44, 12, 6])[0]
            renews_in = rng.randint(-40, 90) if plan != "lapsed" else -rng.randint(3, 60)
            status = "healthy"
            if plan == "lapsed":
                status = "read_only"
            elif renews_in <= 7:
                status = "expiring"
            elif plan == "trial":
                status = rng.choice(["healthy", "no_activity"])
            shops_n = 1 if plan in ("basic", "trial", "lapsed") else rng.randint(2, 5)
            shops = [(f"Branch {j + 1}" if j else city, "Stock only" if j == shops_n - 1 and shops_n > 2 else "Retail",
                      rng.randint(1, 3), rng.randint(80_000, 900_000), j == 0) for j in range(shops_n)]
            volume = 0 if status in ("read_only", "no_activity") else sum(s[3] for s in shops)
            name = f"{rng.choice(LAST)} {rng.choice(SUFFIX)}"
            docs.append(_tenant_doc(f"{name} {i + 1}", f"{rng.randint(10000000, 99999999)}-0001", city, region,
                                    rng.choice(SECTORS), plan, status, {"name": f"{rng.choice(FIRST)} {rng.choice(LAST)}",
                                                                        "phone": f"+234 80{rng.randint(1, 9)} {rng.randint(100, 999)} {rng.randint(1000, 9999)}"},
                                    volume, round(rng.uniform(0.1, 4.6), 1), shops, renews_in, rng.randint(200, 30000),
                                    rng.randint(0, 240), rng.randint(0, 12), rng.randint(0, 900_000),
                                    rng.choice([3, 22, 60, 400, 60 * 24 * rng.randint(1, 25)]), rng))
        await db.admin_tenants.insert_many(docs)

    tenants = [t async for t in db.admin_tenants.find({})]
    by_name = {t["name"]: t for t in tenants}

    # ---------------------------------------------------------------- users
    if await db.admin_users.count_documents({}) == 0:
        tv, wi = by_name["Tredi Ventures"], by_name["Wichtech Industries ltd"]
        users = [
            {"name": "Adaeze Nwosu", "contact": "+234 803 442 1180", "business_ids": [str(tv["_id"])], "business_names": ["Tredi Ventures"],
             "role": "Owner", "title": "Owner", "custom": False, "shops": "All 4", "devices": 2, "device_os": "Android 14",
             "last_seen": now() - timedelta(minutes=4), "status": "active", "failed_pins": 0},
            {"name": "Chidi Okeke", "contact": "+234 802 118 4410", "business_ids": [str(tv["_id"])], "business_names": ["Tredi Ventures"],
             "role": "Stock", "title": "Stock", "custom": False, "shops": "Ikeja +1", "devices": 1, "device_os": "Android 12",
             "last_seen": now() - timedelta(hours=2), "status": "active", "failed_pins": 0},
            {"name": "Amina Yusuf", "contact": "+234 706 118 9002", "business_ids": [str(tv["_id"])], "business_names": ["Tredi Ventures"],
             "role": "Senior sales", "title": "Senior sales", "custom": True, "shops": "Surulere", "devices": 1, "device_os": "iOS 17",
             "last_seen": now() - timedelta(minutes=18), "status": "active", "failed_pins": 0,
             "custom_note": "Can discount above 5% and sell on credit, cannot see cost prices."},
            {"name": "Tunde Bello", "contact": "tunde@ledger.ng", "business_ids": [str(tv["_id"]), str(wi["_id"]), str(by_name["Benue Cement Depot"]["_id"])],
             "business_names": ["Tredi Ventures", "Wichtech Industries ltd", "Benue Cement Depot"], "role": "Accountant",
             "title": "Accountant", "custom": False, "shops": "All", "devices": 1, "device_os": "Web",
             "last_seen": now() - timedelta(days=1), "status": "active", "failed_pins": 0},
            {"name": "Obinna Nwankwo", "contact": "+234 805 862 8890", "business_ids": [str(wi["_id"])], "business_names": ["Wichtech Industries ltd"],
             "role": "Owner", "title": "Owner", "custom": False, "shops": "All 3", "devices": 3, "device_os": "Android 14",
             "last_seen": now() - timedelta(minutes=22), "status": "active", "failed_pins": 0},
            {"name": "Musa Bello", "contact": "+234 815 220 7741", "business_ids": [str(wi["_id"])], "business_names": ["Wichtech Industries ltd"],
             "role": "Sales", "title": "Sales", "custom": False, "shops": "Alaba", "devices": 1, "device_os": "Android 13",
             "last_seen": now() - timedelta(days=2), "status": "locked", "failed_pins": 5},
        ]
        for t in tenants:
            if t["name"] in ("Tredi Ventures", "Wichtech Industries ltd"):
                continue
            users.append({"name": t["owner"]["name"], "contact": t["owner"]["phone"], "business_ids": [str(t["_id"])],
                          "business_names": [t["name"]], "role": "Owner", "title": "Owner", "custom": False,
                          "shops": f"All {len(t['shops'])}", "devices": rng.randint(1, 3), "device_os": rng.choice(["Android 12", "Android 14", "iOS 17"]),
                          "last_seen": t["last_active"], "status": "active" if t["status"] != "no_activity" else "never",
                          "failed_pins": 0})
            for shop in t["shops"][:2]:
                users.append({"name": f"{rng.choice(FIRST)} {rng.choice(LAST)}", "contact": f"+234 81{rng.randint(1, 9)} {rng.randint(100, 999)} {rng.randint(1000, 9999)}",
                              "business_ids": [str(t["_id"])], "business_names": [t["name"]],
                              "role": rng.choice(["Sales", "Stock", "Manager", "Accountant"]), "title": "", "custom": False,
                              "shops": shop["name"], "devices": 1, "device_os": rng.choice(["Android 11", "Android 13", "iOS 16", "Web"]),
                              "last_seen": now() - timedelta(minutes=rng.randint(5, 60 * 24 * 12)),
                              "status": rng.choices(["active", "locked", "never"], weights=[92, 2, 6])[0], "failed_pins": 0})
        for u in users:
            u["created_at"] = now() - timedelta(days=rng.randint(2, 400))
        await db.admin_users.insert_many(users)

    # ---------------------------------------------------------------- audit log
    if await db.admin_audit.count_documents({}) == 0:
        rows = [
            {"actor": "Gaurav", "actor_kind": "admin", "business": "Wichtech Industries ltd", "shop": "", "event": "Support access granted",
             "entity": "session 7f21", "source": "Admin panel", "category": "impersonation", "minutes_ago": 12},
            {"actor": "Amina Yusuf", "actor_kind": "user", "business": "Tredi Ventures", "shop": "Surulere", "event": "Discount applied",
             "entity": "INV-1051 · ₦6,400", "source": "Android", "category": "event", "minutes_ago": 49},
            {"actor": "Chidi Okeke", "actor_kind": "user", "business": "Tredi Ventures", "shop": "Ikeja", "event": "Stock adjusted −2",
             "entity": "Sugar 50kg · damaged", "source": "Android", "category": "event", "minutes_ago": 93},
            {"actor": "Adaeze Nwosu", "actor_kind": "user", "business": "Tredi Ventures", "shop": "Head office", "event": "Payment deleted",
             "entity": "₦60,000 · entered twice", "source": "Android", "category": "deletion", "minutes_ago": 290},
            {"actor": "Adaeze Nwosu", "actor_kind": "user", "business": "Tredi Ventures", "shop": "", "event": "Role changed",
             "entity": "Chidi → Stock", "source": "Android", "category": "permission", "minutes_ago": 340},
            {"actor": "System", "actor_kind": "system", "business": "All tenants", "shop": "", "event": "Nightly snapshot completed",
             "entity": "1,284 tenants · 41 GB", "source": "Scheduler", "category": "event", "minutes_ago": 1020},
            {"actor": "Obinna Nwankwo", "actor_kind": "user", "business": "Wichtech Industries ltd", "shop": "", "event": "Data exported",
             "entity": "Customers CSV · 1,904 rows", "source": "Web", "category": "export", "minutes_ago": 1240},
            {"actor": "Gaurav", "actor_kind": "admin", "business": "Kano Motors Parts", "shop": "", "event": "Cross-tenant read",
             "entity": "sync queue", "source": "Admin panel", "category": "admin", "minutes_ago": 1500},
            {"actor": "Tunde Bello", "actor_kind": "user", "business": "Benue Cement Depot", "shop": "Gboko", "event": "Report exported",
             "entity": "P&L PDF · Aug 2026", "source": "Web", "category": "export", "minutes_ago": 1900},
            {"actor": "System", "actor_kind": "system", "business": "All tenants", "shop": "", "event": "Renewal reminders sent",
             "entity": "38 tenants", "source": "Scheduler", "category": "event", "minutes_ago": 2400},
        ]
        await db.admin_audit.insert_many([{**r, "created_at": now() - timedelta(minutes=r.pop("minutes_ago"))} for r in rows])

    # ---------------------------------------------------------------- sync monitor
    if await db.admin_sync.count_documents({}) == 0:
        await db.admin_sync.insert_many([
            {"business": "Kano Motors Parts", "device": "device a41f", "os": "Android 11", "records": 312, "oldest_hours": 72,
             "last_error": "413 payload too large — 42 photos", "attempts": 96, "state": "stuck", "created_at": now()},
            {"business": "Benue Cement Depot", "device": "device 77c2", "os": "Android 13", "records": 88, "oldest_hours": 14,
             "last_error": "409 conflict on stock_movement", "attempts": 31, "state": "stuck", "created_at": now()},
            {"business": "Adaeze Pharmacy", "device": "device 90ab", "os": "iOS 17", "records": 9, "oldest_hours": 8,
             "last_error": "401 token expired — needs re-auth", "attempts": 12, "state": "stuck", "created_at": now()},
            {"business": "Wichtech Industries ltd", "device": "device 2b4c", "os": "Android 14", "records": 4, "oldest_hours": 1,
             "last_error": "409 conflict on stock_movement · auto-resolved", "attempts": 2, "state": "conflict", "created_at": now()},
            {"business": "Tredi Ventures", "device": "device 55de", "os": "iOS 17", "records": 2, "oldest_hours": 2,
             "last_error": "409 conflict on customer edit · field merge", "attempts": 1, "state": "conflict", "created_at": now()},
            {"business": "Okeke Logistics", "device": "device 8a10", "os": "Android 10", "records": 6, "oldest_hours": 40,
             "last_error": "422 invalid payload — legacy build", "attempts": 18, "state": "rejected", "created_at": now()},
        ])

    # ---------------------------------------------------------------- snapshots
    if await db.admin_snapshots.count_documents({}) == 0:
        rows = [
            {"type": "nightly", "scope": "All tenants", "size_gb": 41, "hours_ago": 12},
            {"type": "pre_migration", "scope": "Wichtech Industries ltd", "size_gb": 1.2, "hours_ago": 21},
            {"type": "nightly", "scope": "All tenants", "size_gb": 40, "hours_ago": 36},
            {"type": "nightly", "scope": "All tenants", "size_gb": 40, "hours_ago": 60},
            {"type": "manual", "scope": "Tredi Ventures", "size_gb": 0.9, "hours_ago": 74},
        ]
        await db.admin_snapshots.insert_many([{**r, "verified": True, "taken": now() - timedelta(hours=r.pop("hours_ago"))} for r in rows])

    # ---------------------------------------------------------------- migration console
    if await db.admin_migrations.count_documents({}) == 0:
        wi = by_name["Wichtech Industries ltd"]
        await db.admin_migrations.insert_many([
            {"tenant_id": str(wi["_id"]), "tenant": wi["name"], "file": "tredibooks_customers.csv", "target": "customers",
             "step": 3, "rows_read": 1904, "will_import": 1842, "need_decision": 62, "committed": False, "snapshot_taken": False,
             "mappings": [{"source": "cust_name", "target": "name", "ok": True}, {"source": "msisdn", "target": "phone", "ok": True},
                          {"source": "bal_owed", "target": "opening_balance", "ok": True}, {"source": "addr_line", "target": "address", "ok": True},
                          {"source": "rep_code", "target": "", "ok": False}, {"source": "created_dt", "target": "created_at", "ok": True}],
             "conflicts": [{"issue": "Duplicate phone number", "rows": 38, "action": "Merge into existing"},
                           {"issue": "Balance not numeric (“N/A”)", "rows": 14, "action": "Import as 0"},
                           {"issue": "Missing phone", "rows": 7, "action": "Skip row"},
                           {"issue": "Encoding — mojibake in name", "rows": 3, "action": "Repair UTF-8"}],
             "created_at": now() - timedelta(hours=2)},
            {"tenant_id": str(by_name["Kano Motors Parts"]["_id"]), "tenant": "Kano Motors Parts", "file": "kano_stock.csv",
             "target": "items", "step": 1, "rows_read": 412, "will_import": 0, "need_decision": 0, "committed": False,
             "snapshot_taken": False, "mappings": [], "conflicts": [], "created_at": now() - timedelta(hours=20)},
        ])

    # ---------------------------------------------------------------- support
    if await db.admin_support.count_documents({}) == 0:
        await db.admin_support.insert_many([
            {"kind": "session", "business": "Wichtech Industries ltd", "granted_by": "Obinna Nwankwo (owner)", "mode": "read-only",
             "expires_at": now() + timedelta(minutes=22), "reason": "“Invoice PDF will not open”", "scope": "Invoices only · no customer contacts",
             "screens_viewed": 4, "status": "active", "created_at": now() - timedelta(minutes=8)},
            {"kind": "request", "business": "Kano Motors Parts", "scope": "Sync queue", "status": "waiting",
             "created_at": now() - timedelta(hours=5)},
            {"kind": "request", "business": "Adaeze Pharmacy", "scope": "Stock records", "status": "declined",
             "created_at": now() - timedelta(days=1)},
            {"kind": "request", "business": "Benue Cement Depot", "scope": "Full account", "status": "completed",
             "duration": "18 min", "created_at": now() - timedelta(days=2)},
        ])

    # ---------------------------------------------------------------- plans, config, health
    if await db.admin_plans.count_documents({}) == 0:
        counts = {"trial": await db.admin_tenants.count_documents({"plan": "trial"}),
                  "basic": await db.admin_tenants.count_documents({"plan": "basic"}),
                  "pro": await db.admin_tenants.count_documents({"plan": "pro"})}
        await db.admin_plans.insert_many([{**p, "count": counts.get(p["key"], 0)} for p in PLANS])

    if not await db.admin_config.find_one({"key": "global"}):
        await db.admin_config.insert_one({
            "key": "global",
            "tax_presets": [{"name": "VAT — Nigeria", "rate": 7.5, "region": "NG", "default": True},
                            {"name": "VAT — Ghana", "rate": 15, "region": "GH", "default": False},
                            {"name": "Zero-rated", "rate": 0, "region": "All", "default": False}],
            "currency": {"default": "NGN", "symbol_position": "before", "decimals": 2, "thousands": "1,000.00",
                         "enabled": ["GHS", "KES", "TZS", "USD"]},
            "invoice": {"number_format": "INV-####", "due_terms_days": 14, "show_item_photos": True, "tredi_footer": True,
                        "paper": "A4 · 80mm · 58mm"},
            "units": ["Bag", "Carton", "Piece", "Litre", "Kg", "Metre", "Pack", "Service"],
            "categories": ["Grains", "Oils", "Building", "Household", "Auto", "Drinks"],
            "flags": [{"name": "Thermal printing", "pct": 100, "on": True}, {"name": "Web quick sale", "pct": 25, "on": True},
                      {"name": "Photo compression at capture", "pct": 40, "on": True}],
            "security": {"idle_lock_min": 2, "failed_pins": 5, "admin_session_min": 30, "force_2fa": True, "owner_sees_admin_reads": True},
            "updated_at": now(),
        })

    if await db.admin_services.count_documents({}) == 0:
        await db.admin_services.insert_many([
            {"name": "API gateway", "uptime": 99.98, "up": True}, {"name": "Sync worker", "uptime": 99.91, "up": True},
            {"name": "PDF renderer", "uptime": 98.40, "up": True}, {"name": "Object storage", "uptime": 100.0, "up": True},
            {"name": "Snapshot scheduler", "uptime": 100.0, "up": True},
        ])

    if await db.admin_errors.count_documents({}) == 0:
        rows = [
            {"level": "ERR", "service": "pdf-renderer", "message": "timeout after 30s · invoice 84 lines · tenant 00164687", "m": 12},
            {"level": "WRN", "service": "sync-worker", "message": "409 conflict stock_movement · retry 31", "m": 15},
            {"level": "ERR", "service": "api", "message": "413 payload too large · device a41f · 42 images", "m": 41},
            {"level": "WRN", "service": "api", "message": "slow query customers_ledger 1.9s · tenant 8f21c4", "m": 55},
            {"level": "WRN", "service": "auth", "message": "5 failed PIN · user musa.b · locked", "m": 93},
            {"level": "ERR", "service": "pdf-renderer", "message": "font fallback missing · Naira glyph", "m": 130},
            {"level": "INF", "service": "scheduler", "message": "snapshot batch 1/4 complete", "m": 172},
        ]
        await db.admin_errors.insert_many([{**r, "created_at": now() - timedelta(minutes=r.pop("m"))} for r in rows])

    if await db.admin_signals.count_documents({}) == 0:
        await db.admin_signals.insert_many([
            {"user": "Musa Bello", "business": "Wichtech Industries ltd", "signal": "5 failed PINs, then lock",
             "where": "Alaba · Android", "verdict": "lock", "created_at": now() - timedelta(days=2)},
            {"user": "Grace Mwangi", "business": "Kano Motors Parts", "signal": "New device, 480 km from usual",
             "where": "Abuja · iOS", "verdict": "review", "created_at": now() - timedelta(hours=6)},
            {"user": "Tunde Bello", "business": "3 businesses", "signal": "Signed into 3 tenants in 10 min",
             "where": "Lagos · Web", "verdict": "expected", "created_at": now() - timedelta(days=1)},
        ])

    return {"tenants": await db.admin_tenants.count_documents({}), "users": await db.admin_users.count_documents({})}
