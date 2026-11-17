"""Renaming and removing names in the editable lists (store locations,
categories, brands, units, expense headings)."""
import uuid


def _item(session, base_url, headers, **kw):
    r = session.post(f"{base_url}/api/items", json={"name": f"TEST {uuid.uuid4().hex[:6]}", "kind": "product", "category": "General",
                                                    "unit": "Piece", "cost_price": 100, "selling_price": 150, "quantity": 1, **kw}, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _values(session, base_url, headers, kind):
    return session.get(f"{base_url}/api/lookups/{kind}", headers=headers).json()["values"]


def test_rename_location_moves_items(session, base_url, owner_headers):
    old, new = f"TEST shelf {uuid.uuid4().hex[:5]}", f"TEST aisle {uuid.uuid4().hex[:5]}"
    session.post(f"{base_url}/api/lookups/location", json={"value": old}, headers=owner_headers)
    iid = _item(session, base_url, owner_headers, location=old)
    r = session.put(f"{base_url}/api/lookups/location", json={"old": old, "new": new}, headers=owner_headers)
    assert r.status_code == 200 and r.json()["renamed"] == 1
    assert session.get(f"{base_url}/api/items/{iid}", headers=owner_headers).json()["location"] == new
    vals = _values(session, base_url, owner_headers, "location")
    assert new in vals and old not in vals


def test_delete_location_clears_items(session, base_url, owner_headers):
    name = f"TEST yard {uuid.uuid4().hex[:5]}"
    session.post(f"{base_url}/api/lookups/location", json={"value": name}, headers=owner_headers)
    iid = _item(session, base_url, owner_headers, location=name)
    usage = session.get(f"{base_url}/api/lookups/location/usage", params={"value": name}, headers=owner_headers).json()
    assert usage["count"] == 1
    r = session.delete(f"{base_url}/api/lookups/location", params={"value": name}, headers=owner_headers)
    assert r.status_code == 200 and r.json()["cleared"] == 1
    assert session.get(f"{base_url}/api/items/{iid}", headers=owner_headers).json()["location"] == ""
    assert name not in _values(session, base_url, owner_headers, "location")


def test_category_in_use_cannot_be_deleted(session, base_url, owner_headers):
    name = f"TEST cat {uuid.uuid4().hex[:5]}"
    session.post(f"{base_url}/api/lookups/item_category", json={"value": name}, headers=owner_headers)
    _item(session, base_url, owner_headers, category=name)
    r = session.delete(f"{base_url}/api/lookups/item_category", params={"value": name}, headers=owner_headers)
    assert r.status_code == 409
