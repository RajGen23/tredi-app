"""Sign in with a Nigerian phone number and an SMS code (Twilio Verify).

Email and password keep working. A number can only be used to sign in after
its owner has confirmed it from inside the app (More → Phone sign-in), so a
mistyped number on a staff record never opens someone's books to a stranger.
"""
from datetime import timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import sms
from deps import CurrentUser, create_access_token, db, now, public_user

router = APIRouter(prefix="/api/auth/phone")
WAIT = 45        # seconds between two codes to the same number
TRIES = 5        # wrong codes before a new one must be asked for


class PhoneIn(BaseModel):
    phone: str


class CodeIn(BaseModel):
    phone: str
    code: str


def _phone(raw: str) -> str:
    phone = sms.nigerian(raw)
    if not phone:
        raise HTTPException(400, "Enter a Nigerian mobile number, like 0803 123 4567")
    return phone


def _ready():
    if not sms.configured():
        raise HTTPException(503, "Phone sign-in isn't switched on yet — use your email and password")


async def _throttle(phone: str):
    if await db.phone_codes.find_one({"phone": phone, "sent_at": {"$gt": now() - timedelta(seconds=WAIT)}}):
        raise HTTPException(429, "A code was just sent — wait a moment before asking again")
    await db.phone_codes.update_one({"phone": phone}, {"$set": {"sent_at": now(), "tries": 0}}, upsert=True)


async def _check(phone: str, code: str):
    code = code.strip()
    rec = await db.phone_codes.find_one({"phone": phone})
    if not rec or rec.get("tries", 0) >= TRIES or not code.isdigit():
        raise HTTPException(400, "Ask for a new code — that one can't be used")
    if not await sms.check_code(phone, code):
        await db.phone_codes.update_one({"_id": rec["_id"]}, {"$inc": {"tries": 1}})
        raise HTTPException(400, "That code is not right — check the text message and try again")
    await db.phone_codes.delete_one({"_id": rec["_id"]})


@router.get("/config")
async def config():
    """The app shows the phone option only when the server can send codes."""
    return {"enabled": sms.configured(), "country": "NG", "prefix": "+234"}


@router.post("/start")
async def start(data: PhoneIn):
    """Text a sign-in code. Same answer whether or not the number is on an
    account, so this can't be used to find out who has one — and no SMS is
    paid for unless it is."""
    _ready()
    phone = _phone(data.phone)
    await _throttle(phone)
    user = await db.users.find_one({"login_phone": phone})
    if user and user.get("active", True) and not await sms.send_code(phone):
        raise HTTPException(502, "We couldn't send the code right now — try again shortly")
    return {"ok": True, "phone": phone, "message": f"If {phone} is set up for sign-in, a code is on its way."}


@router.post("/verify")
async def verify(data: CodeIn):
    _ready()
    phone = _phone(data.phone)
    user = await db.users.find_one({"login_phone": phone})
    if not user:
        raise HTTPException(400, "That code is not right — check the text message and try again")
    await _check(phone, data.code)
    if not user.get("active", True):
        raise HTTPException(403, "This account is dormant. Ask the owner to reinstate it.")
    return {"access_token": create_access_token(str(user["_id"])), "token_type": "bearer", "user": public_user(user)}


@router.get("/mine")
async def mine(user: CurrentUser):
    return {"enabled": sms.configured(), "phone": user.get("login_phone") or "", "suggested": sms.nigerian(user.get("phone", ""))}


@router.post("/link/start")
async def link_start(data: PhoneIn, user: CurrentUser):
    """Signed in already: confirm a number so it can be used to sign in."""
    _ready()
    phone = _phone(data.phone)
    other = await db.users.find_one({"login_phone": phone})
    if other and other["_id"] != user["_id"]:
        raise HTTPException(409, "Another TradaBooks account already signs in with that number")
    await _throttle(phone)
    if not await sms.send_code(phone):
        raise HTTPException(502, "We couldn't send the code right now — try again shortly")
    return {"ok": True, "phone": phone, "message": f"Code sent to {phone}"}


@router.post("/link/verify")
async def link_verify(data: CodeIn, user: CurrentUser):
    _ready()
    phone = _phone(data.phone)
    other = await db.users.find_one({"login_phone": phone})
    if other and other["_id"] != user["_id"]:
        raise HTTPException(409, "Another TradaBooks account already signs in with that number")
    await _check(phone, data.code)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"login_phone": phone, "login_phone_at": now()}})
    return {"ok": True, "phone": phone, "message": f"You can now sign in with {phone}"}


@router.delete("/link")
async def unlink(user: CurrentUser):
    await db.users.update_one({"_id": user["_id"]}, {"$unset": {"login_phone": "", "login_phone_at": ""}})
    return {"ok": True, "phone": ""}
