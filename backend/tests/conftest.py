import os, pytest, requests, uuid

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ui-flow-accurate.preview.emergentagent.com").rstrip("/")

@pytest.fixture(scope="session")
def base_url():
    return BASE_URL

@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    return s

@pytest.fixture(scope="session")
def owner_token(session):
    # Login using OAuth2 form
    r = session.post(f"{BASE_URL}/api/auth/login",
                     data={"username": "owner@tredi.app", "password": "tredi1234"},
                     headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]

@pytest.fixture(scope="session")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}

@pytest.fixture(scope="session")
def fresh_user(session):
    """Fresh registered user with business + demo seed for isolation."""
    email = f"tester_{uuid.uuid4().hex[:10]}@tredicheck.co"
    pw = "Testpw12345"
    r = session.post(f"{BASE_URL}/api/auth/register",
                     json={"name": "Test User", "email": email, "password": pw})
    assert r.status_code == 201, f"register failed: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    rb = session.post(f"{BASE_URL}/api/business", json={"name": "TEST Biz", "type": "Retail"}, headers=h)
    assert rb.status_code == 200, f"business failed: {rb.status_code} {rb.text}"
    return {"email": email, "password": pw, "token": token, "headers": h}
