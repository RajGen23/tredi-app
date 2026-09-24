"""Iteration 17: upload-base64 endpoint + multipart /upload regression + /items/{id}/photo."""
import base64
import io
import os

import pytest
import requests


def _tiny_jpeg_bytes() -> bytes:
    """A small binary payload that emulates a jpeg. Backend just stores bytes,
    so structural validity doesn't matter for the /upload contract."""
    return b"\xff\xd8\xff\xe0" + b"tredi-test-photo" * 32 + b"\xff\xd9"


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ui-flow-accurate.preview.emergentagent.com").rstrip("/")


# ---- Backend: /api/upload-base64 -------------------------------------------------

class TestUploadBase64:
    def test_no_token_returns_401(self, session):
        r = session.post(f"{BASE_URL}/api/upload-base64", json={
            "data": base64.b64encode(_tiny_jpeg_bytes()).decode(),
            "filename": "shelf.jpg",
            "content_type": "image/jpeg",
        })
        assert r.status_code == 401, r.text

    def test_happy_path_returns_201_and_size_matches(self, session, owner_headers):
        raw = _tiny_jpeg_bytes()
        b64 = base64.b64encode(raw).decode()
        r = session.post(f"{BASE_URL}/api/upload-base64",
                         json={"data": b64, "filename": "shelf.jpg", "content_type": "image/jpeg"},
                         headers=owner_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert set(body.keys()) >= {"path", "url", "size"}
        assert body["size"] == len(raw), f"size {body['size']} != {len(raw)}"
        assert body["url"] == f"/api/files/{body['path']}"
        assert body["path"].startswith("tredi/uploads/")
        # store for other tests
        pytest._last_upload = body  # type: ignore[attr-defined]

    def test_data_uri_prefix_is_accepted(self, session, owner_headers):
        raw = _tiny_jpeg_bytes()
        data_uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
        r = session.post(f"{BASE_URL}/api/upload-base64",
                         json={"data": data_uri, "filename": "shelf.jpg", "content_type": "image/jpeg"},
                         headers=owner_headers)
        assert r.status_code == 201, r.text
        assert r.json()["size"] == len(raw)

    def test_garbage_base64_returns_400(self, session, owner_headers):
        r = session.post(f"{BASE_URL}/api/upload-base64",
                         json={"data": "@@@not-base-64@@@!!!", "filename": "x.jpg",
                               "content_type": "image/jpeg"},
                         headers=owner_headers)
        # backend may either 400 (b64decode raises) or 400 on empty decoded
        assert r.status_code == 400, r.text

    def test_over_8mb_returns_400(self, session, owner_headers):
        # 9 MB decoded payload — build a random bytes buffer and base64 it
        raw = os.urandom(9 * 1024 * 1024)
        b64 = base64.b64encode(raw).decode()
        r = session.post(f"{BASE_URL}/api/upload-base64",
                         json={"data": b64, "filename": "big.jpg", "content_type": "image/jpeg"},
                         headers=owner_headers,
                         timeout=120)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"
        assert "8 MB" in r.text or "smaller" in r.text.lower()

    def test_download_via_files_endpoint(self, session, owner_headers, owner_token):
        raw = _tiny_jpeg_bytes()
        r = session.post(f"{BASE_URL}/api/upload-base64",
                         json={"data": base64.b64encode(raw).decode(),
                               "filename": "dl.jpg", "content_type": "image/jpeg"},
                         headers=owner_headers)
        assert r.status_code == 201, r.text
        path = r.json()["path"]

        # GET /api/files/{path}?token=...
        r2 = session.get(f"{BASE_URL}/api/files/{path}",
                         params={"token": owner_token}, timeout=60)
        assert r2.status_code == 200, r2.text
        assert r2.headers.get("Content-Type", "").startswith("image/"), r2.headers
        assert len(r2.content) == len(raw)

    def test_files_without_token_returns_401(self, session, owner_headers):
        raw = _tiny_jpeg_bytes()
        r = session.post(f"{BASE_URL}/api/upload-base64",
                         json={"data": base64.b64encode(raw).decode(),
                               "filename": "z.jpg", "content_type": "image/jpeg"},
                         headers=owner_headers)
        assert r.status_code == 201
        path = r.json()["path"]
        r2 = session.get(f"{BASE_URL}/api/files/{path}")
        assert r2.status_code == 401, r2.text


# ---- Regression: multipart /api/upload + /items/{id}/photo ---------------------

class TestUploadMultipartRegression:
    def test_multipart_upload_still_201(self, session, owner_token):
        raw = _tiny_jpeg_bytes()
        r = session.post(
            f"{BASE_URL}/api/upload",
            files={"file": ("regression.jpg", io.BytesIO(raw), "image/jpeg")},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["size"] == len(raw)
        assert body["path"].startswith("tredi/uploads/")

    def test_item_photo_patch_still_works(self, session, owner_headers, owner_token):
        # Grab any owner item
        r = session.get(f"{BASE_URL}/api/items", headers=owner_headers)
        assert r.status_code == 200, r.text
        items = r.json()
        if not items:
            pytest.skip("no items to attach photo to")
        item = items[0]
        item_id = item.get("id") or item.get("_id")

        # Upload via base64 to get a url
        raw = _tiny_jpeg_bytes()
        up = session.post(f"{BASE_URL}/api/upload-base64",
                          json={"data": base64.b64encode(raw).decode(),
                                "filename": "patch.jpg", "content_type": "image/jpeg"},
                          headers=owner_headers)
        assert up.status_code == 201, up.text
        photo_url = up.json()["url"]

        original_photo = item.get("photo") or item.get("photo_url") or None

        # Try common shapes for photo patch
        patch = session.patch(f"{BASE_URL}/api/items/{item_id}/photo",
                              json={"url": photo_url, "photo": photo_url,
                                    "photo_url": photo_url},
                              headers=owner_headers)
        assert patch.status_code in (200, 204), f"{patch.status_code} {patch.text}"

        # Verify persisted via GET
        r2 = session.get(f"{BASE_URL}/api/items/{item_id}", headers=owner_headers)
        assert r2.status_code == 200, r2.text
        fetched = r2.json()
        val = fetched.get("photo") or fetched.get("photo_url") or ""
        assert photo_url in val or val == photo_url, (
            f"photo not persisted: fetched={val} expected={photo_url}"
        )

        # Restore if there was a previous photo
        if original_photo:
            session.patch(f"{BASE_URL}/api/items/{item_id}/photo",
                          json={"url": original_photo, "photo": original_photo,
                                "photo_url": original_photo},
                          headers=owner_headers)
