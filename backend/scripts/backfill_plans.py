"""Put every business that already exists on a plan, so nobody who was using
tredi before billing existed suddenly finds the app read-only.

Everything already in the database is grandfathered onto Pro for a year.
Businesses created from now on start a 14-day free trial (see POST /api/business).

    python scripts/backfill_plans.py          # dry run
    python scripts/backfill_plans.py --commit
"""
import asyncio
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from deps import db, now  # noqa: E402


async def main(commit: bool):
    renews = now() + timedelta(days=365)
    q = {"$or": [{"plan": {"$exists": False}}, {"plan": {"$in": ["", "Free", "free", "trial", "basic", "lapsed"]}}]}
    total = await db.businesses.count_documents({})
    touched = await db.businesses.count_documents(q)
    print(f"{total} businesses, {touched} without a live paid plan")
    if not commit:
        async for b in db.businesses.find(q).limit(10):
            print(f"  would set pro: {b.get('name', '?')} (plan={b.get('plan')!r})")
        print("dry run — pass --commit to write")
        return
    res = await db.businesses.update_many(q, {"$set": {"plan": "pro", "renews_at": renews, "plan_source": "grandfathered"},
                                              "$unset": {"trial_ends_at": ""}})
    print(f"updated {res.modified_count} businesses onto Pro until {renews.date()}")


if __name__ == "__main__":
    asyncio.run(main("--commit" in sys.argv))
