"""Reproduce the product photo upload error end to end."""
import io
import os
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "") + "/api"

tok = requests.post(f"{BASE}/auth/login", json={"email": "owner@tredi.app", "password": "tredi1234"}, timeout=60)
print("login", tok.status_code)
token = tok.json().get("token") or tok.json().get("access_token")
print("token?", bool(token), list(tok.json().keys()))

# 1x1 png
png = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001"
    "0d0a2db40000000049454e44ae426082")
files = {"file": ("probe.png", io.BytesIO(png), "image/png")}
r = requests.post(f"{BASE}/upload", files=files, headers={"Authorization": f"Bearer {token}"}, timeout=180)
print("upload", r.status_code, r.text[:600])
if r.ok:
    url = r.json()["url"]
    g = requests.get(f"{os.environ.get('EXPO_PUBLIC_BACKEND_URL', '')}{url}?token={token}", timeout=60)
    print("download", g.status_code, g.headers.get("Content-Type"), len(g.content))
