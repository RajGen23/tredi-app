"""Lists the shop controls itself — categories, units, expense headings.

Every dropdown in the app reads from here: a trader can always add the name they
actually use instead of being stuck with our defaults — and rename or remove any
of them, ours included. A renamed value is renamed on every record using it.
"""
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deps import CurrentUser, biz_filter, db, now

router = APIRouter(prefix="/api/lookups")

DEFAULTS = {
    "item_category": ["Grains", "Oils", "Building", "Home", "Drinks", "Services", "General"],
    "brand": ["No brand"],
    "unit": ["Piece", "Bag", "Carton", "Litre", "Kg", "Metre", "Pack", "Dozen", "Service"],
    "expense_category": ["Transport & fuel", "Rent", "Salaries", "Utilities", "Repairs", "Supplies", "Purchases", "Other"],
    "location": ["Warehouse", "Shelf A", "Shelf B", "Yard", "Counter"],
}


# Where each list is used: (collection, field), and whether removing a value
# may simply clear it on those records. A location or brand is optional; an
# item without a category or unit, or an expense without a heading, is not.
USED_IN = {
    "item_category": ("items", "category", False),
    "brand": ("items", "brand", True),
    "unit": ("items", "unit", False),
    "location": ("items", "location", True),
    "expense_category": ("expenses", "category", False),
}
NOUN = {"items": ("item", "items"), "expenses": ("expense", "expenses")}


class LookupIn(BaseModel):
    value: str


class RenameIn(BaseModel):
    old: str
    new: str


def check(kind: str):
    if kind not in DEFAULTS:
        raise HTTPException(404, "Unknown list")


async def values(business_id: str, kind: str) -> list[str]:
    q = {"business_id": business_id, "kind": kind, "deleted_at": None}
    # a default the trader removed is remembered as hidden, so it stays gone
    hidden = {r["value"].lower() async for r in db.lookups.find({**q, "hidden": True})}
    custom = [r["value"] async for r in db.lookups.find({**q, "hidden": {"$ne": True}}).sort("value", 1)]
    # a saved spelling of one of ours ("shelf b") replaces ours, in our place
    spelt = {v.lower(): v for v in custom}
    seen, out = set(hidden), []
    for v in [spelt.get(d.lower(), d) for d in DEFAULTS[kind]] + custom:
        if v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out


@router.get("/{kind}")
async def get_lookup(kind: str, user: CurrentUser):
    check(kind)
    f = biz_filter(user)
    if kind in ("item_category", "brand"):
        # categories already in use count too, so an import never hides a name
        used = await db.items.distinct("category" if kind == "item_category" else "brand", f)
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
    await db.lookups.delete_many({**f, "kind": kind, "hidden": True, "value": {"$regex": f"^{re.escape(value)}$", "$options": "i"}})
    await db.lookups.insert_one({**f, "kind": kind, "value": value, "created_by": user.get("name", ""), "created_by_id": str(user["_id"]), "created_at": now()})
    return await get_lookup(kind, user)


def _manager(user: dict):
    if user.get("role", "owner") not in ("owner", "manager"):
        raise HTTPException(403, "Only the owner or a manager can rename or remove names in this list")


def _same(value: str) -> dict:
    return {"$regex": f"^{re.escape(value)}$", "$options": "i"}


async def _drop(f: dict, kind: str, value: str, user: dict):
    """Take a name off the list: a saved one is deleted, one of ours is hidden."""
    q = {**f, "kind": kind, "value": _same(value)}
    await db.lookups.update_many({**q, "hidden": {"$ne": True}, "deleted_at": None}, {"$set": {"deleted_at": now(), "deleted_by": user.get("name", "")}})
    if value.lower() in {d.lower() for d in DEFAULTS[kind]} and not await db.lookups.find_one({**q, "hidden": True, "deleted_at": None}):
        await db.lookups.insert_one({**f, "kind": kind, "value": value, "hidden": True, "deleted_at": None,
                                     "created_by": user.get("name", ""), "created_by_id": str(user["_id"]), "created_at": now()})


async def _found(kind: str, value: str, user: CurrentUser) -> str:
    """The name as the list spells it; 404 when it isn't on the list."""
    hit = next((v for v in (await get_lookup(kind, user))["values"] if v.lower() == value.strip().lower()), None)
    if not hit:
        raise HTTPException(404, f"“{value.strip()}” isn't on this list any more")
    return hit


@router.get("/{kind}/usage")
async def lookup_usage(kind: str, value: str, user: CurrentUser):
    """How many records use a name — shown before it is removed."""
    check(kind)
    coll, field, _ = USED_IN[kind]
    n = await db[coll].count_documents({**biz_filter(user), field: _same(value.strip())})
    return {"value": value, "count": n, "noun": NOUN[coll][0 if n == 1 else 1]}


@router.put("/{kind}")
async def rename_lookup(kind: str, data: RenameIn, user: CurrentUser):
    """Rename a name, and every item or expense that uses it. Renaming onto a
    name already on the list merges the two."""
    check(kind)
    _manager(user)
    f = biz_filter(user)
    new = data.new.strip()
    if not new:
        raise HTTPException(400, "Give it a name")
    old = await _found(kind, data.old, user)
    coll, field, _ = USED_IN[kind]
    res = await db[coll].update_many({**f, field: _same(old)}, {"$set": {field: new}})
    if old != new:
        if old.lower() != new.lower():
            await _drop(f, kind, old, user)
            await add_lookup(kind, LookupIn(value=new), user)
        else:   # only the spelling changes: the new spelling replaces the old one
            await db.lookups.update_many({**f, "kind": kind, "value": old, "hidden": {"$ne": True}, "deleted_at": None}, {"$set": {"deleted_at": now()}})
            await db.lookups.insert_one({**f, "kind": kind, "value": new, "created_by": user.get("name", ""), "created_by_id": str(user["_id"]), "created_at": now()})
    noun = NOUN[coll][0 if res.modified_count == 1 else 1]
    return {**(await get_lookup(kind, user)), "renamed": res.modified_count,
            "message": f"Renamed to “{new}”" + (f" on {res.modified_count} {noun}" if res.modified_count else "")}


@router.delete("/{kind}")
async def delete_lookup(kind: str, value: str, user: CurrentUser):
    """Remove a name. Optional fields (location, brand) are cleared on the items
    that used it; required ones must be renamed or moved first."""
    check(kind)
    _manager(user)
    f = biz_filter(user)
    old = await _found(kind, value, user)
    coll, field, clearable = USED_IN[kind]
    q = {**f, field: _same(old)}
    n = await db[coll].count_documents(q)
    if n and not clearable:
        raise HTTPException(409, f"{n} {NOUN[coll][0 if n == 1 else 1]} still use “{old}”. Rename it instead, or move them to another one first.")
    if n:
        await db[coll].update_many(q, {"$set": {field: ""}})
    await _drop(f, kind, old, user)
    return {**(await get_lookup(kind, user)), "cleared": n,
            "message": f"Removed “{old}”" + (f" — {n} {NOUN[coll][0 if n == 1 else 1]} no longer {'has' if n == 1 else 'have'} one" if n else "")}
