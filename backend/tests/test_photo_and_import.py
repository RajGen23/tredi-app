"""Iteration 10 — new feature verification:
 - PATCH /api/items/{id}/photo (set-only, 404 on unknown)
 - Import template/preview/commit for items now includes photo_url
 - Regression: customer import validations (missing name, dup, bad number) still behave
 - Regression: item import validations (missing name, dup, bad number) still behave
"""
import os
import requests
import pytest

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://ui-flow-accurate.preview.emergentagent.com",
).rstrip("/")


# ---------- shared owner login ----------
@pytest.fixture(scope="module")
def owner_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": "owner@tredi.app", "password": "tredi1234"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=15,
    )
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


# ---------- helpers ----------
def _pick_item(headers):
    r = requests.get(f"{BASE_URL}/api/items", headers=headers, timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and items, "expected seeded items on owner account"
    return items[0]


# ==============================================================
# 1) PATCH /api/items/{iid}/photo
# ==============================================================
class TestItemPhotoPatch:
    def test_set_and_persist_photo(self, owner_headers):
        item = _pick_item(owner_headers)
        original = item.get("photo_url")
        new_url = "/api/files/tredi/uploads/test_iter10_dummy.png"
        try:
            # PATCH sets only photo_url
            r = requests.patch(
                f"{BASE_URL}/api/items/{item['id']}/photo",
                json={"photo_url": new_url},
                headers=owner_headers,
                timeout=15,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["photo_url"] == new_url
            # Other fields left alone
            for k in ("name", "cost_price", "selling_price", "quantity"):
                if k in item:
                    assert body[k] == item[k], f"PATCH photo changed unrelated field {k}"

            # Verify via GET /api/items/{id}
            r2 = requests.get(f"{BASE_URL}/api/items/{item['id']}", headers=owner_headers, timeout=15)
            assert r2.status_code == 200
            assert r2.json()["photo_url"] == new_url

            # Verify via GET /api/items list
            r3 = requests.get(f"{BASE_URL}/api/items", headers=owner_headers, timeout=15)
            assert r3.status_code == 200
            match = [i for i in r3.json() if i["id"] == item["id"]]
            assert match and match[0]["photo_url"] == new_url
        finally:
            # restore original
            requests.patch(
                f"{BASE_URL}/api/items/{item['id']}/photo",
                json={"photo_url": original or ""},
                headers=owner_headers,
                timeout=15,
            )

    def test_photo_404_on_unknown_id(self, owner_headers):
        # 24-hex fake ObjectId
        r = requests.patch(
            f"{BASE_URL}/api/items/64ffffffffffffffffffffff/photo",
            json={"photo_url": "/api/files/x.png"},
            headers=owner_headers,
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_clear_photo_with_empty_string(self, owner_headers):
        item = _pick_item(owner_headers)
        original = item.get("photo_url")
        try:
            r = requests.patch(
                f"{BASE_URL}/api/items/{item['id']}/photo",
                json={"photo_url": ""},
                headers=owner_headers,
                timeout=15,
            )
            assert r.status_code == 200
            assert r.json()["photo_url"] in (None, "")
        finally:
            requests.patch(
                f"{BASE_URL}/api/items/{item['id']}/photo",
                json={"photo_url": original or ""},
                headers=owner_headers,
                timeout=15,
            )


# ==============================================================
# 2) Import template — items column list includes photo_url
# ==============================================================
class TestImportTemplate:
    def test_items_template_includes_photo_url(self):
        r = requests.get(f"{BASE_URL}/api/import/template", params={"target": "items"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "photo_url" in body["columns"], f"photo_url missing from item columns: {body['columns']}"
        # csv header row must also have it
        header_line = body["csv"].splitlines()[0]
        assert "photo_url" in header_line

    def test_customers_template_unchanged(self):
        r = requests.get(f"{BASE_URL}/api/import/template", params={"target": "customers"}, timeout=15)
        assert r.status_code == 200
        cols = r.json()["columns"]
        assert cols == ["name", "phone", "email", "address", "opening_balance"]


# ==============================================================
# 3) Import preview/commit — items with photo_url
# ==============================================================
class TestItemImportWithPhoto:
    def test_preview_accepts_photo_url_column(self, owner_headers):
        payload = {
            "filename": "iter10_items.xlsx",
            "target": "items",
            "rows": [
                {"row": 2, "values": {
                    "name": "TEST_ImportItem_iter10_A",
                    "category": "Grains", "unit": "Bag",
                    "cost_price": "1000", "selling_price": "1500", "quantity": "3",
                    "barcode": "9990001", "photo_url": "/api/files/tredi/uploads/iter10_a.png",
                }},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/import/preview", json=payload, headers=owner_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "photo_url" in body["columns"]
        assert body["ready_count"] == 1
        assert body["ready"][0]["photo_url"] == "/api/files/tredi/uploads/iter10_a.png"

    def test_commit_stores_photo_url(self, owner_headers):
        name = "TEST_ImportItem_iter10_B"
        photo = "/api/files/tredi/uploads/iter10_b.png"
        payload = {
            "filename": "iter10_items.xlsx",
            "target": "items",
            "rows": [
                {"row": 2, "values": {
                    "name": name, "category": "Grains", "unit": "Bag",
                    "cost_price": "1000", "selling_price": "1500", "quantity": "3",
                    "barcode": "", "photo_url": photo,
                }},
            ],
            "skip_rows": [],
        }
        r = requests.post(f"{BASE_URL}/api/import/commit", json=payload, headers=owner_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["imported"] == 1

        # verify persistence via GET /api/items and cleanup
        rl = requests.get(f"{BASE_URL}/api/items", headers=owner_headers, timeout=15)
        assert rl.status_code == 200
        created = [i for i in rl.json() if i["name"] == name]
        assert created, "imported item not found via GET /api/items"
        assert created[0]["photo_url"] == photo, f"photo_url not stored: {created[0].get('photo_url')}"

        # cleanup
        requests.delete(f"{BASE_URL}/api/items/{created[0]['id']}", headers=owner_headers, timeout=15)


# ==============================================================
# 4) Regression — validation still works for items and customers
# ==============================================================
class TestImportValidationRegression:
    def test_item_missing_name_blocked(self, owner_headers):
        payload = {
            "filename": "iter10.xlsx", "target": "items",
            "rows": [{"row": 2, "values": {"name": "", "cost_price": "100", "selling_price": "200", "quantity": "1"}}],
        }
        r = requests.post(f"{BASE_URL}/api/import/preview", json=payload, headers=owner_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["ready_count"] == 0
        assert body["issue_count"] >= 1
        kinds = {i["kind"] for i in body["issues"]}
        assert "blocked" in kinds

    def test_item_bad_number_flagged(self, owner_headers):
        payload = {
            "filename": "iter10.xlsx", "target": "items",
            "rows": [{"row": 2, "values": {"name": "TEST_iter10_badnum", "cost_price": "N/A", "selling_price": "200", "quantity": "1"}}],
        }
        r = requests.post(f"{BASE_URL}/api/import/preview", json=payload, headers=owner_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["ready_count"] == 0
        kinds = {i["kind"] for i in body["issues"]}
        assert "bad_number" in kinds

    def test_item_duplicate_flagged(self, owner_headers):
        # Get a real existing item name from the seed
        existing = _pick_item(owner_headers)["name"]
        payload = {
            "filename": "iter10.xlsx", "target": "items",
            "rows": [{"row": 2, "values": {"name": existing, "cost_price": "100", "selling_price": "200", "quantity": "1"}}],
        }
        r = requests.post(f"{BASE_URL}/api/import/preview", json=payload, headers=owner_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        kinds = {i["kind"] for i in body["issues"]}
        assert "duplicate" in kinds

    def test_customer_missing_name_and_bad_balance(self, owner_headers):
        payload = {
            "filename": "iter10.xlsx", "target": "customers",
            "rows": [
                {"row": 2, "values": {"name": "", "phone": "+234 111", "opening_balance": "0"}},
                {"row": 3, "values": {"name": "TEST_iter10_cust_bad", "phone": "+234 222", "opening_balance": "N/A"}},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/import/preview", json=payload, headers=owner_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        kinds = {i["kind"] for i in body["issues"]}
        assert "blocked" in kinds
        assert "bad_number" in kinds

    def test_customer_missing_phone_blocked(self, owner_headers):
        payload = {
            "filename": "iter10.xlsx", "target": "customers",
            "rows": [{"row": 2, "values": {"name": "TEST_iter10_nophone", "phone": "", "opening_balance": "0"}}],
        }
        r = requests.post(f"{BASE_URL}/api/import/preview", json=payload, headers=owner_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["ready_count"] == 0
        kinds = {i["kind"] for i in body["issues"]}
        assert "blocked" in kinds
