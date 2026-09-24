"""Lists the shop controls itself — categories, units, expense headings.

Every dropdown in the app reads from here: a trader can always add the name they
actually use instead of being stuck with our defaults.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deps import CurrentUser, biz_filter, db, now

router = APIRouter(prefix="/api/lookups")

DEFAULTS = {
    "item_category": ["Grains", "Oils", "Building", "Home", "Drinks", "Services", "General"],
    "unit": ["Piece", "Bag", "Carton", "Litre", "Kg", "Metre", "Pack", "Dozen", "Service"],
    "expense_category": ["Transport & fuel", "Rent", "Salaries", "Utilities", "Repairs", "Supplies", "Purchases", "Other"],
    "location": ["Warehouse", "Shelf A", "Shelf B", "Yard", "Counter"],
}


class LookupIn(BaseModel):
    value: str


def check(kind: str):
    if kind not in DEFAULTS:
        raise HTTPException(404, "Unknown list")


async def values(business_id: str, kind: str) -> list[str]:
    custom = [r["value"] async for r in db.lookups.find({"business_id": business_id, "kind": kind, "deleted_at": None}).sort("value", 1)]
    seen, out = set(), []
    for v in DEFAULTS[kind] + custom:
        if v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out


@router.get("/{kind}")
async def get_lookup(kind: str, user: CurrentUser):
    check(kind)
    f = biz_filter(user)
    if kind == "item_category":
        # categories already in use count too, so an import never hides a name
        used = await db.items.distinct("category", f)
        extra = [u for u in used if u]
        merged = await values(f["business_id"], kind)
        for u in sorted(extra):
            if u.lower() not in {m.lower() for m in merged}:
                merged.append(u)
        return {"kind": kind, "values": merged}
    return {"kind": kind, "values": await values(f["business_id"], kind)}


@router.post("/{kind}", status_code=201)
async def add_lookup(kind: str, data: LookupIn, user: CurrentUser):
    check(kind)
    f = biz_filter(user)
    value = data.value.strip()
    if not value:
        raise HTTPException(400, "Give it a name")
    existing = await get_lookup(kind, user)
    if value.lower() in {v.lower() for v in existing["values"]}:
        return existing
    await db.lookups.insert_one({**f, "kind": kind, "value": value, "created_by": user.get("name", ""), "created_at": now()})
    return await get_lookup(kind, user)
