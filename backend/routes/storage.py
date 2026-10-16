"""Brand Junction managed object storage — receipt and bill photos."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Header, Query, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional
import base64
import logging
import os
import uuid
import jwt
import requests
from bson import ObjectId

from deps import CurrentUser, JWT_ALG, JWT_SECRET, biz_filter, db, now

router = APIRouter(prefix="/api")
logger = logging.getLogger("tredi.storage")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "tredi"
MAX_BYTES = 8 * 1024 * 1024

storage_key: Optional[str] = None


def init_storage(force: bool = False) -> str:
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 503:
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(force=True), "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 402:
        raise HTTPException(402, "Storage credits are used up — add balance to keep uploading photos")
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(force=True)}, timeout=60)
    if resp.status_code >= 400:
        raise HTTPException(404, "That photo is no longer available")
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


@router.post("/upload", status_code=201)
async def upload(user: CurrentUser, file: UploadFile = File(...)):
    data = await file.read()
    return await _store(user, data, file.filename or "photo.jpg", file.content_type or "image/jpeg")


@router.post("/upload-binary", status_code=201)
async def upload_binary(request: Request, user: CurrentUser, x_filename: Optional[str] = Header(None)):
    """The phone streams the file bytes as the raw request body via the native
    upload task (OkHttp / NSURLSession): Content-Length is known, nothing is
    base64-inflated and no multi-megabyte string crosses the JS bridge."""
    data = await request.body()
    ctype = (request.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
    return await _store(user, data, x_filename or "photo.jpg", ctype or "image/jpeg")


class Base64In(BaseModel):
    data: str
    filename: str = "photo.jpg"
    content_type: str = "image/jpeg"


@router.post("/upload-base64", status_code=201)
async def upload_base64(payload: Base64In, user: CurrentUser):
    """The phone posts the bytes itself. React Native streams a multipart file
    with chunked encoding and no content length, which a mobile network proxy
    can drop halfway; a base64 body has a known length and always arrives."""
    raw = payload.data.split(",", 1)[-1] if payload.data.startswith("data:") else payload.data
    try:
        data = base64.b64decode(raw + "=" * (-len(raw) % 4))
    except Exception:
        raise HTTPException(400, "That photo could not be read — try again")
    return await _store(user, data, payload.filename, payload.content_type)


async def _store(user: dict, data: bytes, filename: str, content_type: str) -> dict:
    f = biz_filter(user)
    if not data:
        raise HTTPException(400, "That file is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "Photos must be under 8 MB — try again with a smaller one")
    ext = (filename or "photo.jpg").rsplit(".", 1)[-1].lower()[:5] or "jpg"
    path = f"{APP_NAME}/uploads/{str(user['_id'])}/{uuid.uuid4().hex}.{ext}"
    await run_in_threadpool(put_object, path, data, content_type or "image/jpeg")
    await db.uploads.insert_one({**f, "storage_path": path, "filename": filename or "photo.jpg",
                                 "content_type": content_type or "image/jpeg", "size": len(data),
                                 "owner_id": str(user["_id"]), "created_at": now()})
    return {"path": path, "url": f"/api/files/{path}", "size": len(data)}


@router.get("/files/{path:path}")
async def download(path: str, token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    """Reads are authenticated; an <img> tag can only pass a token in the query
    string, native <Image> can also send the Authorization header."""
    raw = token or (authorization or "").replace("Bearer ", "")
    if not raw:
        raise HTTPException(401, "Not allowed")
    try:
        uid = jwt.decode(raw, JWT_SECRET, algorithms=[JWT_ALG]).get("sub")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Not allowed")
    rec = await db.uploads.find_one({"storage_path": path})
    if not rec:
        raise HTTPException(404, "Not found")
    me = await db.users.find_one({"_id": ObjectId(uid)}) if uid and ObjectId.is_valid(uid) else None
    if not me or str(me.get("business_id") or "") != rec["business_id"]:
        raise HTTPException(403, "Not your business")
    content, ctype = await run_in_threadpool(get_object, path)
    return Response(content=content, media_type=ctype, headers={"Cache-Control": "private, max-age=86400"})
