"""Sign-in codes by SMS through Twilio Verify. Twilio makes, sends and checks
the code, so no code is ever stored here. Needs three settings in the backend
env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID."""
import logging
import os
import re

import httpx

log = logging.getLogger("sms")
BASE = "https://verify.twilio.com/v2/Services"


def configured() -> bool:
    return all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"))


def nigerian(raw: str) -> str:
    """A Nigerian mobile number as +234XXXXXXXXXX, however it was typed
    (0803 866 1386, 803 866 1386, 234803..., +234 803...). Empty if it isn't one."""
    d = re.sub(r"\D", "", raw or "")
    if d.startswith("234"):
        d = d[3:]
    d = d.lstrip("0")
    return f"+234{d}" if re.fullmatch(r"[789][01]\d{8}", d) else ""


async def _post(path: str, data: dict) -> dict | None:
    url = f"{BASE}/{os.environ['TWILIO_VERIFY_SERVICE_SID']}/{path}"
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(url, data=data, auth=(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"]))
    except httpx.HTTPError as exc:
        log.error("twilio %s failed: %s", path, exc)
        return None
    if r.status_code >= 400:
        log.error("twilio %s answered %s: %s", path, r.status_code, r.text[:300])
        return None
    return r.json()


async def send_code(phone: str) -> bool:
    return bool(configured() and await _post("Verifications", {"To": phone, "Channel": "sms"}))


async def check_code(phone: str, code: str) -> bool:
    if not configured():
        return False
    res = await _post("VerificationCheck", {"To": phone, "Code": code})
    return bool(res and res.get("status") == "approved")
