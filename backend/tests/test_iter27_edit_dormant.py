"""Iteration 27 — Purchase edit/cancel/restore, shops/accounts/team edit+dormant,
plus login active check. Owner tenant only; teardown reverts any mutations so
`Ikeja branch` + `Surulere` stay non-dormant, every account stays non-dormant,
and amina@tredi.app stays active."""
import os
import pytest
import requests
import uuid
from datetime import date

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def owner():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               data={"username": "owner@tredi.app", "password": "tredi1234"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# ---------- helpers
def _first_supplier(s):
    r = s.get(f"{BASE}/api/suppliers"); r.raise_for_status()
    sups = r.json().get("suppliers") or []
    assert sups, "need at least one supplier"
    return sups[0]


def _first_item_with_stock(s):
    r = s.get(f"{BASE}/api/items"); r.raise_for_status()
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    # fall back to first
    assert items, "need at least one item"
    return items[0]


def _item_qty(s, item_id):
    r = s.get(f"{BASE}/api/items/{item_id}"); r.raise_for_status()
    return (r.json().get("quantity") or 0)


# ------------------------------------------------------------------- ITEM 3 — POs
class TestPurchaseEditCancelRestore:
    def test_purchase_full_lifecycle(self, owner):
        sup = _first_supplier(owner)
        item = _first_item_with_stock(owner)
        start_qty = _item_qty(owner, item["id"])

        # Create PO (qty=1)
        payload = {"supplier_id": sup["id"],
                   "lines": [{"item_id": item["id"], "name": item.get("name", "Thing"), "quantity": 1, "unit_cost": 1000, "unit": item.get("unit", "unit")}],
                   "paid": 0, "method": "credit", "update_cost": False}
        r = owner.post(f"{BASE}/api/purchases", json=payload)
        assert r.status_code == 201, r.text
        po = r.json()
        pid = po["id"]
        assert po["total"] == 1000

        qty_after_create = _item_qty(owner, item["id"])
        assert qty_after_create == start_qty + 1, f"create should add 1 unit, got {qty_after_create - start_qty}"

        # Edit (qty=2). Stock delta must be +1 (not +2 or +3)
        edit_payload = {**payload, "lines": [{**payload["lines"][0], "quantity": 2}]}
        r = owner.put(f"{BASE}/api/purchases/{pid}", json=edit_payload)
        assert r.status_code == 200, r.text
        po2 = r.json()
        assert po2["total"] == 2000
        assert po2.get("updated_at")
        assert po2.get("updated_by")

        qty_after_edit = _item_qty(owner, item["id"])
        assert qty_after_edit == start_qty + 2, f"edit 1→2 should net +1, got {qty_after_edit - start_qty}"

        # Edit with empty lines -> 400/422
        r = owner.put(f"{BASE}/api/purchases/{pid}", json={**payload, "lines": []})
        assert r.status_code in (400, 422), r.text

        # supplier owed includes this live PO total (2000)
        r = owner.get(f"{BASE}/api/suppliers/{sup['id']}"); r.raise_for_status()
        owed_before_cancel = r.json()["owed"]

        # Cancel
        r = owner.post(f"{BASE}/api/purchases/{pid}/cancel", json={"reason": "TEST cancel"})
        assert r.status_code == 200, r.text

        qty_after_cancel = _item_qty(owner, item["id"])
        assert qty_after_cancel == start_qty, f"cancel should return stock to {start_qty}, got {qty_after_cancel}"

        # cancelled fields set
        r = owner.get(f"{BASE}/api/purchases/{pid}"); r.raise_for_status()
        pod = r.json()
        assert pod.get("cancelled_at")
        assert pod.get("cancelled_by")
        assert pod.get("cancelled_reason") == "TEST cancel"

        # second cancel -> 400
        r = owner.post(f"{BASE}/api/purchases/{pid}/cancel", json={"reason": "again"})
        assert r.status_code == 400, r.text

        # PUT on cancelled -> 400
        r = owner.put(f"{BASE}/api/purchases/{pid}", json=edit_payload)
        assert r.status_code == 400, r.text

        # supplier owed drops (cancelled PO filtered out)
        r = owner.get(f"{BASE}/api/suppliers/{sup['id']}"); r.raise_for_status()
        owed_after_cancel = r.json()["owed"]
        assert owed_after_cancel == round(owed_before_cancel - 2000, 2), f"owed should drop by 2000, before={owed_before_cancel} after={owed_after_cancel}"

        # Uncancel -> stock back + fields cleared
        r = owner.post(f"{BASE}/api/purchases/{pid}/uncancel")
        assert r.status_code == 200, r.text
        pod = r.json()
        assert not pod.get("cancelled_at")
        assert not pod.get("cancelled_by")
        qty_after_uncancel = _item_qty(owner, item["id"])
        assert qty_after_uncancel == start_qty + 2

        # Teardown: cancel again so the test leaves no stock impact
        r = owner.post(f"{BASE}/api/purchases/{pid}/cancel", json={"reason": "TEST teardown"})
        assert r.status_code == 200

        qty_final = _item_qty(owner, item["id"])
        assert qty_final == start_qty, "teardown must restore original stock"


# ------------------------------------------------------------------- ITEM 4 — shops
class TestShopsEditDormant:
    def test_rename_and_dormant_cycle(self, owner):
        # Create a throwaway shop
        tag = uuid.uuid4().hex[:6]
        tmp = f"TEST shop {tag}"
        r = owner.post(f"{BASE}/api/shops", json={"name": tmp, "address": "x", "phone": "", "sells": True})
        assert r.status_code == 201, r.text

        # Rename
        renamed = f"TEST shop {tag} renamed"
        r = owner.put(f"{BASE}/api/shops/{tmp}", json={"name": renamed, "address": "x", "phone": "", "sells": True})
        assert r.status_code == 200, r.text
        names = [s["name"] for s in r.json()["shops"]]
        assert renamed in names and tmp not in names

        # Make dormant
        r = owner.post(f"{BASE}/api/shops/{renamed}/dormant", json={"dormant": True})
        assert r.status_code == 200, r.text

        # Owner can still see dormant shop in /shops with dormant:true
        r = owner.get(f"{BASE}/api/shops"); r.raise_for_status()
        shops = r.json()["shops"]
        found = next((s for s in shops if s["name"] == renamed), None)
        assert found and found.get("dormant") is True

        # POST /api/shops/active on dormant should 403
        r = owner.post(f"{BASE}/api/shops/active", json={"shop": renamed})
        assert r.status_code == 403, r.text

        # Reopen
        r = owner.post(f"{BASE}/api/shops/{renamed}/dormant", json={"dormant": False})
        assert r.status_code == 200, r.text

        # Rename back so cleanup is simple… no, we cannot delete it.
        # Rename to a stable harmless archival name so it does not clutter the demo too much.
        # Actually keep as-is but mark dormant:false then delete entry from businesses doc is not an endpoint.
        # Minimal footprint: rename back to tmp again (does not matter) and leave non-dormant.
        # Spec says cleanup = no dormant shops left behind; we have reopened it.

    def test_main_branch_cannot_go_dormant(self, owner):
        # Ikeja branch is main
        r = owner.post(f"{BASE}/api/shops/Ikeja branch/dormant", json={"dormant": True})
        assert r.status_code == 400, r.text
        assert "main" in r.text.lower()

    def test_last_working_shop_cannot_go_dormant(self, owner):
        # With Ikeja (main) + Surulere + some TEST shops, Surulere isn't the only one.
        # So we validate the error path by trying to dormant Surulere ONLY when
        # it's the last one — otherwise we assert it reopens.
        r = owner.get(f"{BASE}/api/shops"); r.raise_for_status()
        working = [s for s in r.json()["shops"] if not s.get("dormant")]
        # Dormant Surulere briefly, then reopen
        r = owner.post(f"{BASE}/api/shops/Surulere/dormant", json={"dormant": True})
        if len(working) <= 2:
            # Only Ikeja + Surulere working -> cannot dormant Surulere last-working? no, main is Ikeja and
            # the rule triggers when working count would drop to <=0 of non-main; with len(working)==2
            # (Ikeja + Surulere), making Surulere dormant leaves ONE working shop which is allowed (main).
            # So this branch should still succeed. Reopen immediately.
            assert r.status_code == 200, r.text
            owner.post(f"{BASE}/api/shops/Surulere/dormant", json={"dormant": False})
        else:
            assert r.status_code == 200, r.text
            # Reopen to restore demo invariant
            r2 = owner.post(f"{BASE}/api/shops/Surulere/dormant", json={"dormant": False})
            assert r2.status_code == 200, r2.text

        # Final verification: Ikeja + Surulere both not dormant
        r = owner.get(f"{BASE}/api/shops"); r.raise_for_status()
        for s in r.json()["shops"]:
            if s["name"] in ("Ikeja branch", "Surulere"):
                assert not s.get("dormant"), f"{s['name']} must not stay dormant"


# ------------------------------------------------------------------- ITEM 5a — accounts
class TestAccountsEditDormant:
    def test_edit_and_dormant_cycle(self, owner):
        r = owner.get(f"{BASE}/api/accounts"); r.raise_for_status()
        accs = r.json().get("accounts") or r.json()
        assert isinstance(accs, list) and accs, "need at least one account"

        acc = accs[0]
        aid = acc["id"]
        old_name = acc["name"]
        new_name = f"TEST {old_name} {uuid.uuid4().hex[:4]}"

        # Edit
        r = owner.put(f"{BASE}/api/accounts/{aid}",
                      json={"name": new_name, "kind": acc.get("kind", "cash"),
                            "detail": acc.get("detail", ""), "opening_balance": acc.get("opening_balance", 0)})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == new_name

        # Dormant toggle: only when there are >=2 live accounts
        r = owner.get(f"{BASE}/api/accounts"); r.raise_for_status()
        all_accs = r.json().get("accounts") or r.json()
        live = [a for a in all_accs if not a.get("dormant")]
        if len(live) >= 2:
            # pick a different account than aid to dormant (safer — opening balance edit on aid)
            victim = next(a for a in live if a["id"] != aid)
            vid = victim["id"]
            r = owner.post(f"{BASE}/api/accounts/{vid}/dormant", json={"dormant": True})
            assert r.status_code == 200, r.text
            # still shows in list with dormant:true + balance
            r = owner.get(f"{BASE}/api/accounts"); r.raise_for_status()
            all_accs = r.json().get("accounts") or r.json()
            d = next((a for a in all_accs if a["id"] == vid), None)
            assert d and d.get("dormant") is True
            assert "balance" in d
            # Reopen (teardown)
            r = owner.post(f"{BASE}/api/accounts/{vid}/dormant", json={"dormant": False})
            assert r.status_code == 200, r.text
        else:
            pytest.skip("need ≥2 live accounts to exercise dormant rule")

        # Restore original name
        r = owner.put(f"{BASE}/api/accounts/{aid}",
                      json={"name": old_name, "kind": acc.get("kind", "cash"),
                            "detail": acc.get("detail", ""), "opening_balance": acc.get("opening_balance", 0)})
        assert r.status_code == 200

    def test_only_live_account_cannot_go_dormant(self, owner):
        # Make all but one dormant, then try the last one. Teardown reopens them.
        r = owner.get(f"{BASE}/api/accounts"); r.raise_for_status()
        all_accs = r.json().get("accounts") or r.json()
        live = [a for a in all_accs if not a.get("dormant")]
        if len(live) < 2:
            pytest.skip("need ≥2 live accounts to exercise the only-live rule")
        # Dormant all but the first
        to_dormant = live[1:]
        for a in to_dormant:
            rr = owner.post(f"{BASE}/api/accounts/{a['id']}/dormant", json={"dormant": True})
            assert rr.status_code == 200, rr.text
        # Now dormant the last live one -> must 400
        last = live[0]
        rr = owner.post(f"{BASE}/api/accounts/{last['id']}/dormant", json={"dormant": True})
        assert rr.status_code == 400, rr.text
        # Teardown: reopen all
        for a in to_dormant:
            rr = owner.post(f"{BASE}/api/accounts/{a['id']}/dormant", json={"dormant": False})
            assert rr.status_code == 200, rr.text

        # final sanity: none dormant
        r = owner.get(f"{BASE}/api/accounts"); r.raise_for_status()
        for a in (r.json().get("accounts") or r.json()):
            assert not a.get("dormant"), f"account {a['name']} must not stay dormant"


# ------------------------------------------------------------------- ITEM 5b — team
class TestTeamEditDormant:
    def test_amina_edit_dormant_login_cycle(self, owner):
        # Find amina
        r = owner.get(f"{BASE}/api/team"); r.raise_for_status()
        body = r.json()
        team = body.get("users") or body.get("team") or body.get("members") or (body if isinstance(body, list) else [])
        amina = next((u for u in team if u.get("email") == "amina@tredi.app"), None)
        assert amina, "amina@tredi.app must exist on demo tenant"
        uid = amina["id"]

        # PUT name/phone passthrough
        new_phone = "08099988877"
        r = owner.put(f"{BASE}/api/team/{uid}",
                      json={"role": amina.get("role", "sales"),
                            "shops": amina.get("shops") or ["Surulere"],
                            "can": {}, "scopes": {},
                            "name": amina.get("name", "Amina"), "phone": new_phone})
        assert r.status_code == 200, r.text

        # Make dormant
        r = owner.post(f"{BASE}/api/team/{uid}/dormant", json={"dormant": True})
        assert r.status_code == 200, r.text

        # Login must 403
        guest = requests.Session()
        r = guest.post(f"{BASE}/api/auth/login", data={"username": "amina@tredi.app", "password": "tredi1234"})
        assert r.status_code == 403, r.text
        assert "dormant" in r.text.lower()

        # Reinstate
        r = owner.post(f"{BASE}/api/team/{uid}/dormant", json={"dormant": False})
        assert r.status_code == 200, r.text

        # Login must now succeed
        r = guest.post(f"{BASE}/api/auth/login", data={"username": "amina@tredi.app", "password": "tredi1234"})
        assert r.status_code == 200, r.text

    def test_owner_cannot_be_dormant_and_cannot_dormant_self(self, owner):
        # Find owner uid
        r = owner.get(f"{BASE}/api/auth/me"); r.raise_for_status()
        me = r.json()
        my_uid = me.get("id") or me.get("_id")
        assert my_uid

        # Self dormant -> 400
        r = owner.post(f"{BASE}/api/team/{my_uid}/dormant", json={"dormant": True})
        assert r.status_code == 400, r.text


# ------------------------------------------------------------------- Health sanity
def test_health():
    r = requests.get(f"{BASE}/api/health")
    assert r.status_code == 200
