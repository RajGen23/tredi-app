"""One-off: freeze the cost price on every line already sold.

Profit used to be worked out from whatever an item costs *today*, so raising a
price rewrote last month's books. New lines are stamped at the till
(`deps.stamp_costs`); this stamps everything that was written before that.

    python3 migrations/freeze_line_costs.py
"""
import asyncio
import os

from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


async def main() -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "tredi")]
    costs = {str(i["_id"]): float(i.get("cost_price") or 0) async for i in db.items.find({}, {"cost_price": 1})}

    for col in ("invoices", "sales"):
        touched = 0
        async for doc in db[col].find({"lines.cost_at_sale": {"$exists": False}}, {"lines": 1}):
            lines = doc.get("lines") or []
            changed = False
            for l in lines:
                if l.get("cost_at_sale") is None:
                    l["cost_at_sale"] = costs.get(str(l.get("item_id")), 0)
                    changed = True
            if changed:
                await db[col].update_one({"_id": ObjectId(doc["_id"])}, {"$set": {"lines": lines}})
                touched += 1
        print(f"{col}: stamped {touched} documents")


if __name__ == "__main__":
    asyncio.run(main())
