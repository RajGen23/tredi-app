"""One-off migration: attach a best-guess dummy photo to every stock item
that doesn't have one yet, across every business. Safe to re-run — it only
touches items where photo_url is missing/empty/null.

Usage: python3 scripts/backfill_dummy_photos.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from dummy_photos import pick_dummy_photo  # noqa: E402


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "tredi")]
    query = {"$or": [{"photo_url": None}, {"photo_url": ""}, {"photo_url": {"$exists": False}}]}
    updated = 0
    counts: dict[str, int] = {}
    async for it in db.items.find(query):
        url = pick_dummy_photo(it.get("name", ""), it.get("category", ""))
        await db.items.update_one({"_id": it["_id"]}, {"$set": {"photo_url": url}})
        updated += 1
        counts[url] = counts.get(url, 0) + 1
    print(f"Updated {updated} items with a dummy photo.")
    for url, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {n:4d}  {url}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
