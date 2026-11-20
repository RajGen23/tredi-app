"""Sales and invoices made with no signal are sent later with a reference
(client_ref). Sending the same one twice must never count it twice."""
import uuid


def _item(session, base_url, headers, qty=10):
    r = session.post(f"{base_url}/api/items", json={"name": f"TEST {uuid.uuid4().hex[:6]}", "kind": "product", "category": "General",
                                                    "unit": "Piece", "cost_price": 100, "selling_price": 1000, "quantity": qty}, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_quick_sale_sent_twice_counts_once(session, base_url, owner_headers):
    iid = _item(session, base_url, owner_headers)
    body = {"lines": [{"item_id": iid, "name": "TEST", "quantity": 2, "unit_price": 1000}], "method": "cash", "tendered": 2000,
            "client_ref": f"TEST-{uuid.uuid4().hex}"}
    a = session.post(f"{base_url}/api/sales", json=body, headers=owner_headers)
    b = session.post(f"{base_url}/api/sales", json=body, headers=owner_headers)
    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["id"] == b.json()["id"]
    assert session.get(f"{base_url}/api/items/{iid}", headers=owner_headers).json()["quantity"] == 8


def test_invoice_sent_twice_counts_once(session, base_url, owner_headers):
    iid = _item(session, base_url, owner_headers)
    body = {"lines": [{"item_id": iid, "name": "TEST", "quantity": 3, "unit_price": 1000}], "vat_rate": 0, "status": "issued",
            "payment_mode": "credit", "client_ref": f"TEST-{uuid.uuid4().hex}"}
    a = session.post(f"{base_url}/api/invoices", json=body, headers=owner_headers)
    b = session.post(f"{base_url}/api/invoices", json=body, headers=owner_headers)
    assert a.json()["id"] == b.json()["id"] and a.json()["number"] == b.json()["number"]
    assert session.get(f"{base_url}/api/items/{iid}", headers=owner_headers).json()["quantity"] == 7


def test_sales_without_reference_stay_separate(session, base_url, owner_headers):
    iid = _item(session, base_url, owner_headers)
    body = {"lines": [{"item_id": iid, "name": "TEST", "quantity": 1, "unit_price": 1000}], "method": "cash", "tendered": 1000}
    a = session.post(f"{base_url}/api/sales", json=body, headers=owner_headers)
    b = session.post(f"{base_url}/api/sales", json=body, headers=owner_headers)
    assert a.json()["id"] != b.json()["id"]
