"""Iteration 16 — GET /api/low-stock + regression on /api/items* endpoints.

The new low-stock route was inserted right above PUT /items/{iid} in server.py, so
route-ordering regressions on /items/{id}, /items-stats and PUT /items/{id} must
also be re-verified in this file.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ui-flow-accurate.preview.emergentagent.com").rstrip("/")


# ---------- Low-stock feature ----------
class TestLowStock:
    def test_low_stock_requires_auth(self, session):
        r = session.get(f"{BASE_URL}/api/low-stock")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_low_stock_shape_and_totals(self, session, owner_headers):
        r = session.get(f"{BASE_URL}/api/low-stock", headers=owner_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        # top level
        for key in ["as_of", "days", "count", "out", "low", "reorder_cost", "items"]:
            assert key in body, f"missing {key} in response keys={list(body.keys())}"
        assert isinstance(body["items"], list)
        # tallies
        assert body["count"] == len(body["items"]), "count must equal len(items)"
        out_rows = [x for x in body["items"] if x["status"] == "out"]
        low_rows = [x for x in body["items"] if x["status"] == "low"]
        assert body["out"] == len(out_rows), f"out={body['out']} rows_out={len(out_rows)}"
        assert body["low"] == len(low_rows), f"low={body['low']} rows_low={len(low_rows)}"
        assert body["out"] + body["low"] == body["count"]
        # reorder_cost consistent
        summed = round(sum(r["reorder_cost"] for r in body["items"]), 2)
        assert abs(summed - body["reorder_cost"]) < 0.02, f"row_sum={summed} top={body['reorder_cost']}"

    def test_low_stock_ordering_out_first(self, session, owner_headers):
        body = session.get(f"{BASE_URL}/api/low-stock", headers=owner_headers).json()
        seen_low = False
        for row in body["items"]:
            if row["status"] == "low":
                seen_low = True
            elif row["status"] == "out":
                # once we've seen a "low", no more "out" rows should appear
                assert not seen_low, f"out row {row['name']} appeared after a low row"

    def test_low_stock_row_fields(self, session, owner_headers):
        body = session.get(f"{BASE_URL}/api/low-stock", headers=owner_headers).json()
        if not body["items"]:
            pytest.skip("No low-stock rows in demo data")
        row = body["items"][0]
        for k in ["id", "name", "quantity", "alert_below", "sold", "per_day",
                  "days_left", "suggest", "reorder_cost", "status", "supplier", "unit"]:
            assert k in row, f"missing {k} in row: {list(row.keys())}"
        assert row["status"] in ("out", "low")
        # suggest > 0 for something that is out or low
        assert row["suggest"] >= 1
        # reorder_cost equals suggest * cost_price
        assert abs(row["reorder_cost"] - round(row["suggest"] * row["cost_price"], 2)) < 0.02

    def test_low_stock_matches_items_list(self, session, owner_headers):
        """Every low-stock id must exist in /api/items with qty<=0 or qty<=alert_below.
        Conversely, items well above their alert level or with track_stock=false or
        service items must not appear."""
        low = session.get(f"{BASE_URL}/api/low-stock", headers=owner_headers).json()
        items_resp = session.get(f"{BASE_URL}/api/items", headers=owner_headers)
        assert items_resp.status_code == 200, items_resp.text
        items = items_resp.json()
        # /api/items may be list or {"items": [...]}
        if isinstance(items, dict) and "items" in items:
            items = items["items"]
        by_id = {str(it.get("id") or it.get("_id")): it for it in items}
        low_ids = {r["id"] for r in low["items"]}
        # 1. Every low-stock id exists in items
        for lid in low_ids:
            assert lid in by_id, f"low-stock id {lid} not in /api/items"

        # 2. A stock-tracked item well above its alert level should NOT appear
        healthy = None
        for it in items:
            if (it.get("kind") != "service" and it.get("track_stock", True)
                    and (it.get("alert_below") or 0) > 0
                    and (it.get("quantity") or 0) > (it.get("alert_below") or 0) * 2):
                healthy = it; break
        if healthy is not None:
            hid = str(healthy.get("id") or healthy.get("_id"))
            assert hid not in low_ids, f"healthy item {healthy.get('name')} wrongly appears in low-stock"

        # 3. A service or track_stock=false item must NOT appear
        untracked = [it for it in items
                     if it.get("kind") == "service" or not it.get("track_stock", True)]
        for it in untracked:
            uid = str(it.get("id") or it.get("_id"))
            assert uid not in low_ids, f"untracked/service item {it.get('name')} wrongly in low-stock"


# ---------- Regression: /items* still work after route insertion ----------
class TestItemsRegressionAfterRouteInsert:
    def test_items_list_ok(self, session, owner_headers):
        r = session.get(f"{BASE_URL}/api/items", headers=owner_headers)
        assert r.status_code == 200, r.text
        items = r.json()
        if isinstance(items, dict) and "items" in items:
            items = items["items"]
        assert isinstance(items, list) and len(items) > 0

    def test_items_stats_ok(self, session, owner_headers):
        r = session.get(f"{BASE_URL}/api/items-stats", headers=owner_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "stats" in body
        assert isinstance(body["stats"], dict)

    def test_item_detail_ok(self, session, owner_headers):
        items = session.get(f"{BASE_URL}/api/items", headers=owner_headers).json()
        if isinstance(items, dict) and "items" in items:
            items = items["items"]
        assert items, "no items to test detail against"
        iid = str(items[0].get("id") or items[0].get("_id"))
        r = session.get(f"{BASE_URL}/api/items/{iid}", headers=owner_headers)
        assert r.status_code == 200, f"detail failed for {iid}: {r.status_code} {r.text[:200]}"
        d = r.json()
        assert d.get("name") is not None
        # ensure the detail route did not get routed to /low-stock
        assert "items" not in d or not isinstance(d.get("items"), list) or "reorder_cost" not in d

    def test_item_put_still_persists(self, session, owner_headers):
        items = session.get(f"{BASE_URL}/api/items", headers=owner_headers).json()
        if isinstance(items, dict) and "items" in items:
            items = items["items"]
        # pick a tracked one so we don't mess up service data
        target = next((it for it in items if it.get("kind") != "service"), items[0])
        iid = str(target.get("id") or target.get("_id"))
        orig_alert = target.get("alert_below") or 0
        payload = {**target, "alert_below": orig_alert + 1}
        # drop server-managed fields
        for k in ("id", "_id", "created_at", "updated_at", "quantity_all",
                  "stock_by_shop", "shop_in_view", "movements", "adjustments",
                  "sold_qty", "revenue", "cost_of_sales", "profit", "margin",
                  "returned_qty", "returned_value", "supply_history", "suppliers",
                  "last_sold_at", "last_received_at", "idle_days", "archived"):
            payload.pop(k, None)
        r = session.put(f"{BASE_URL}/api/items/{iid}", json=payload, headers=owner_headers)
        assert r.status_code in (200, 201), f"PUT failed: {r.status_code} {r.text[:200]}"
        got = session.get(f"{BASE_URL}/api/items/{iid}", headers=owner_headers).json()
        assert (got.get("alert_below") or 0) == orig_alert + 1
        # restore
        payload["alert_below"] = orig_alert
        session.put(f"{BASE_URL}/api/items/{iid}", json=payload, headers=owner_headers)
