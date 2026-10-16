"""04.10b Invoice templates — backend tests.

Covers:
- GET /api/settings/invoice returns new template fields with defaults
- PUT /api/settings/invoice persists new fields and rejects invalid template
- POST /api/upload accepts a small PNG and returns {path, url}
- GET /api/files/{path}?token=<jwt> returns the image bytes for the owning business
"""
import io
import os
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


def _tiny_png_bytes() -> bytes:
    """Build a valid 1x1 red PNG entirely in-memory (no PIL dependency)."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00" + bytes([255, 0, 0])
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


# ---------------------------------------------------------------- Invoice settings model
class TestInvoiceSettingsTemplate:

    def test_get_returns_new_template_fields(self, owner_token, owner_headers):
        r = requests.get(f"{BASE_URL}/api/settings/invoice", headers=owner_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "template" in data
        assert "brand_color" in data
        assert "logo_url" in data
        assert "logo_size" in data
        # Defaults (may already be persisted from a previous run — assert types/valid values)
        assert data["template"] in {"t1", "t2", "t3", "t4", "t5", "t6", "t7"}
        assert isinstance(data["brand_color"], str) and data["brand_color"].startswith("#")
        assert isinstance(data["logo_url"], str)
        assert isinstance(data["logo_size"], int)

    def test_put_persists_template_fields(self, owner_headers):
        # Capture originals so we can restore
        orig = requests.get(f"{BASE_URL}/api/settings/invoice", headers=owner_headers).json()

        payload = {
            **{k: orig[k] for k in ("prefix", "vat_rate", "vat_on", "due_days", "conditions",
                                    "show_photos", "tredi_mark", "print_format",
                                    "default_bank_account_id", "attach_terms", "footer") if k in orig},
            "next_number": orig.get("next_number", 1001),
            "template": "t5",
            "brand_color": "#2C6ECB",
            "logo_url": "",
            "logo_size": 120,
        }
        r = requests.put(f"{BASE_URL}/api/settings/invoice",
                         headers=owner_headers, json=payload)
        assert r.status_code == 200, r.text
        # verify persistence via GET
        g = requests.get(f"{BASE_URL}/api/settings/invoice", headers=owner_headers).json()
        assert g["template"] == "t5"
        assert g["brand_color"] == "#2C6ECB"
        assert g["logo_size"] == 120

        # RESTORE to defaults (test hygiene)
        restore = {
            **payload,
            "template": "t3",
            "brand_color": "#014747",
            "logo_size": 90,
        }
        rr = requests.put(f"{BASE_URL}/api/settings/invoice",
                          headers=owner_headers, json=restore)
        assert rr.status_code == 200

    def test_put_rejects_invalid_template(self, owner_headers):
        orig = requests.get(f"{BASE_URL}/api/settings/invoice", headers=owner_headers).json()
        payload = {
            "prefix": orig.get("prefix", "INV"),
            "next_number": orig.get("next_number", 1001),
            "vat_rate": orig.get("vat_rate", 7.5),
            "template": "t9",  # invalid
        }
        r = requests.put(f"{BASE_URL}/api/settings/invoice",
                         headers=owner_headers, json=payload)
        assert r.status_code == 422, f"Expected 422 for invalid template, got {r.status_code}: {r.text}"

    def test_invoice_settings_save_does_not_wipe_template(self, owner_headers):
        """The /settings/invoice screen posts a payload WITHOUT template/brand_color;
        Pydantic defaults would then overwrite template=t3, brand_color=#014747 (default).
        Verify: set template=t5, then send a 'plain' invoice-settings PUT and re-read."""
        # 1) set template t5 via full PUT
        orig = requests.get(f"{BASE_URL}/api/settings/invoice", headers=owner_headers).json()
        base = {k: orig[k] for k in ("prefix", "vat_rate", "vat_on", "due_days", "conditions",
                                     "show_photos", "tredi_mark", "print_format",
                                     "default_bank_account_id", "attach_terms", "footer") if k in orig}
        base["next_number"] = orig.get("next_number", 1001)
        set_tpl = {**base, "template": "t5", "brand_color": "#7A4BD0", "logo_url": "", "logo_size": 60}
        r1 = requests.put(f"{BASE_URL}/api/settings/invoice", headers=owner_headers, json=set_tpl)
        assert r1.status_code == 200

        # 2) mimic the invoice.tsx save that omits template fields (what the app used to send)
        plain = {**base}
        r2 = requests.put(f"{BASE_URL}/api/settings/invoice", headers=owner_headers, json=plain)
        assert r2.status_code == 200

        # 3) confirm template/brand/logo_size are still what we set
        g = requests.get(f"{BASE_URL}/api/settings/invoice", headers=owner_headers).json()

        # RESTORE first, so the assertion failure below still cleans up
        restore = {**base, "template": "t3", "brand_color": "#014747", "logo_url": "", "logo_size": 90}
        requests.put(f"{BASE_URL}/api/settings/invoice", headers=owner_headers, json=restore)

        assert g["template"] == "t5", f"invoice-settings PUT wiped template (got {g['template']})"
        assert g["brand_color"] == "#7A4BD0", f"invoice-settings PUT wiped brand_color (got {g['brand_color']})"
        assert g["logo_size"] == 60, f"invoice-settings PUT wiped logo_size (got {g['logo_size']})"


# ---------------------------------------------------------------- Upload & files
class TestUploadAndFiles:

    def test_upload_png_and_fetch_bytes(self, owner_token):
        png = _tiny_png_bytes()
        files = {"file": ("logo.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE_URL}/api/upload",
                          headers={"Authorization": f"Bearer {owner_token}"},
                          files=files, timeout=60)
        assert r.status_code == 201, f"upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert "path" in body and body["path"].startswith("tredi/uploads/")
        assert "url" in body and body["url"].startswith("/api/files/")

        # fetch back with token in query string (mimics <img src=…?token=>)
        get_url = f"{BASE_URL}{body['url']}?token={owner_token}"
        g = requests.get(get_url, timeout=60)
        assert g.status_code == 200, f"file GET failed: {g.status_code}"
        # Response should be the PNG bytes we uploaded
        assert g.content[:8] == b"\x89PNG\r\n\x1a\n", "Downloaded content is not a PNG"
        assert g.headers.get("content-type", "").startswith("image/"), g.headers.get("content-type")

    def test_upload_requires_auth(self):
        png = _tiny_png_bytes()
        files = {"file": ("logo.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE_URL}/api/upload", files=files, timeout=60)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_files_requires_token(self):
        # ask a plausibly-existing path with no token — must 401
        r = requests.get(f"{BASE_URL}/api/files/tredi/uploads/xxxx/xxxx.png", timeout=30)
        assert r.status_code == 401
