"""Iteration 18 — photo download endpoint must accept Authorization header.
Previously `authorization` was declared as a plain FastAPI param (query) and
requests with `Authorization: Bearer ...` came back 401 → uploaded photos
appeared as failed uploads. Also verifies multipart /api/upload still works."""
import base64
import io
import os
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


def _tiny_png_bytes() -> bytes:
    """Minimal 1x1 red PNG (no external deps)."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00\xff\x00\x00"  # filter byte + RGB pixel
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      data={"username": "owner@tredi.app", "password": "tredi1234"},
                      headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200, f"login: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def uploaded_photo(owner_headers):
    """POST /api/upload-base64 → returns {path, url, size}."""
    png = _tiny_png_bytes()
    b64 = base64.b64encode(png).decode()
    r = requests.post(f"{BASE_URL}/api/upload-base64",
                      json={"data": b64, "filename": "qa.png", "content_type": "image/png"},
                      headers=owner_headers)
    assert r.status_code == 201, f"upload-base64: {r.status_code} {r.text}"
    body = r.json()
    assert "path" in body and "url" in body and "size" in body
    assert body["size"] == len(png)
    assert body["url"].startswith("/api/files/")
    return {"png": png, **body}


# ---------- POST /api/upload-base64 ----------
class TestBase64Upload:
    def test_upload_base64_returns_201(self, uploaded_photo):
        assert uploaded_photo["size"] > 0

    def test_upload_base64_requires_auth(self):
        png = _tiny_png_bytes()
        b64 = base64.b64encode(png).decode()
        r = requests.post(f"{BASE_URL}/api/upload-base64",
                          json={"data": b64, "filename": "x.png", "content_type": "image/png"})
        assert r.status_code == 401


# ---------- GET /api/files/{path} — the fix under test ----------
class TestFilesAuthorizationHeader:
    def test_get_with_bearer_header_returns_200(self, uploaded_photo, owner_token):
        """The fix: Authorization header must now be accepted."""
        r = requests.get(f"{BASE_URL}{uploaded_photo['url']}",
                         headers={"Authorization": f"Bearer {owner_token}"})
        assert r.status_code == 200, f"header auth failed: {r.status_code} {r.text[:200]}"
        assert r.headers.get("Content-Type", "").startswith("image/")
        assert r.content == uploaded_photo["png"]

    def test_get_with_query_token_returns_200(self, uploaded_photo, owner_token):
        """Web <img> path — token in query string still works."""
        r = requests.get(f"{BASE_URL}{uploaded_photo['url']}?token={owner_token}")
        assert r.status_code == 200
        assert r.headers.get("Content-Type", "").startswith("image/")
        assert r.content == uploaded_photo["png"]

    def test_get_without_auth_returns_401(self, uploaded_photo):
        r = requests.get(f"{BASE_URL}{uploaded_photo['url']}")
        assert r.status_code == 401

    def test_get_with_bad_token_returns_401(self, uploaded_photo):
        r = requests.get(f"{BASE_URL}{uploaded_photo['url']}",
                         headers={"Authorization": "Bearer not-a-real-jwt"})
        assert r.status_code == 401


# ---------- POST /api/upload (multipart, regression) ----------
class TestMultipartUpload:
    def test_multipart_upload_returns_201(self, owner_token):
        png = _tiny_png_bytes()
        r = requests.post(f"{BASE_URL}/api/upload",
                          headers={"Authorization": f"Bearer {owner_token}"},
                          files={"file": ("qa.png", io.BytesIO(png), "image/png")})
        assert r.status_code == 201, f"multipart upload: {r.status_code} {r.text}"
        body = r.json()
        assert body["url"].startswith("/api/files/")
        # And it downloads too
        d = requests.get(f"{BASE_URL}{body['url']}",
                         headers={"Authorization": f"Bearer {owner_token}"})
        assert d.status_code == 200


# ---------- POST /api/suppliers (used by the frontend inline-new-supplier flow) ----------
class TestSuppliersEndpointForInlineFlow:
    def test_create_supplier_and_appears_in_list(self, owner_headers):
        name = "TEST Supplier QA iter18"
        r = requests.post(f"{BASE_URL}/api/suppliers",
                          json={"name": name, "phone": "+2348030000000"},
                          headers=owner_headers)
        assert r.status_code in (200, 201), f"create supplier: {r.status_code} {r.text}"
        created = r.json()
        assert created.get("name") == name
        # Appears in GET /api/suppliers
        g = requests.get(f"{BASE_URL}/api/suppliers", headers=owner_headers)
        assert g.status_code == 200
        names = [s["name"] for s in (g.json().get("suppliers") or [])]
        assert name in names
