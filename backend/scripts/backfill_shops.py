"""One-time: give every record a shop.

Rows written before shops existed carry no tag. A record belongs to the shop of
whoever entered it when that person works in exactly one shop; anything else is
the main branch. Idempotent — only untagged or unknown shops are touched.
"""
import asyncio
import os
import sys
from collections import Counter

from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

COLLECTIONS = ["invoices", "sales", "expenses", "payments", "purchases", "quotes", "activity", "movements", "supplier_payments", "returns"]


async def main(apply: bool):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    counts: Counter = Counter()
    async for biz in db.businesses.find({}):
        bid = str(biz["_id"])
        shops = [s.get("name", "") for s in (biz.get("shops") or []) if s.get("name")]
        if not shops:
            continue
        main = shops[0]
        by_person = {}
        async for u in db.users.find({"business_id": bid}):
            mine = [s for s in (u.get("shops") or []) if s in shops]
            by_person[u.get("name", "")] = mine[0] if len(mine) == 1 else main
        for coll in COLLECTIONS:
            c = db[coll]
            who = "by" if coll == "activity" else "created_by"
            async for row in c.find({"business_id": bid, "$or": [{"shop": {"$in": ["", None]}}, {"shop": {"$exists": False}}, {"shop": {"$nin": shops}}]}):
                shop = by_person.get(row.get(who) or "", main)
                counts[f"{coll}:{shop}"] += 1
                if apply:
                    await c.update_one({"_id": row["_id"]}, {"$set": {"shop": shop}})
        # per-shop stock for items that have never been split
        async for it in db.items.find({"business_id": bid, "stock": {"$exists": False}}):
            counts["items"] += 1
            if apply:
                await db.items.update_one({"_id": it["_id"]}, {"$set": {"stock": [{"shop": main, "qty": round(it.get("quantity", 0) or 0, 3)}]}})
    for k, v in sorted(counts.items()):
        print(f"{k:40} {v}")
    print(("APPLIED" if apply else "DRY RUN") + f" · {sum(counts.values())} rows")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
