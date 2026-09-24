"""Phase 7 — switching shop changes the figures; a rep only sees their shops."""
import os
import pytest
import httpx

BASE = os.environ.get("TEST_BASE", "http://localhost:8001/api")
OWNER = ("owner@tredi.app", "tredi1234")
REP = ("amina@tredi.app", "tredi1234")


def token(email: str, password: str) -> str:
    r = httpx.post(f"{BASE}/auth/login", data={"username": email, "password": password}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def owner():
    return token(*OWNER)


def set_shop(tok: str, shop: str):
    return httpx.post(f"{BASE}/shops/active", json={"shop": shop}, headers=h(tok), timeout=60)


def test_shops_list(owner):
    r = httpx.get(f"{BASE}/shops", headers=h(owner), timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert d["count"] >= 1
    assert d["can_see_all"] is True


def test_switching_shop_changes_the_dashboard(owner):
    shops = httpx.get(f"{BASE}/shops", headers=h(owner), timeout=60).json()["shops"]
    set_shop(owner, "")
    allv = httpx.get(f"{BASE}/dashboard", headers=h(owner), timeout=120).json()
    assert allv["shop"] == ""
    per = {}
    for sh in shops:
        set_shop(owner, sh["name"])
        d = httpx.get(f"{BASE}/dashboard", headers=h(owner), timeout=120).json()
        assert d["shop"] == sh["name"]
        per[sh["name"]] = d["total_sales"]
    set_shop(owner, "")
    # every shop on its own can never be more than the combined view
    assert round(sum(per.values()), 2) <= round(allv["total_sales"], 2) + 1


def test_invoices_are_filtered_by_shop(owner):
    shops = httpx.get(f"{BASE}/shops", headers=h(owner), timeout=60).json()["shops"]
    set_shop(owner, "")
    total = len(httpx.get(f"{BASE}/invoices", headers=h(owner), timeout=120).json())
    counted = 0
    for sh in shops:
        set_shop(owner, sh["name"])
        counted += len(httpx.get(f"{BASE}/invoices", headers=h(owner), timeout=120).json())
    set_shop(owner, "")
    assert counted <= total


def test_items_report_stock_per_shop(owner):
    set_shop(owner, "")
    items = httpx.get(f"{BASE}/items", headers=h(owner), timeout=120).json()
    assert items, "demo items expected"
    it = items[0]
    assert "stock_by_shop" in it and "quantity_all" in it
    assert it["quantity"] == it["quantity_all"]


def test_rep_cannot_jump_to_a_shop_they_do_not_have():
    try:
        tok = token(*REP)
    except httpx.HTTPStatusError:
        pytest.skip("sales rep account not seeded")
    d = httpx.get(f"{BASE}/shops", headers=h(tok), timeout=60).json()
    assert isinstance(d["shops"], list)
    if d["locked"]:
        r = set_shop(tok, "A shop that does not exist")
        assert r.status_code == 403
