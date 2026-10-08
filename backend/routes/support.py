"""Help & support — the message a shop owner sends us from inside the app.

Writes stay open even on a lapsed plan (see WRITE_ALWAYS_OK): a business that
cannot pay is exactly the business that needs to reach support.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from bson import ObjectId

from deps import CurrentUser, biz_filter, clean, db, now, oid

router = APIRouter(prefix="/api/support")

TOPICS = ["Invoices & PDFs", "Payments & plan", "Stock & items", "Users & access", "Something is broken", "Other"]

CONTACT = {
    "email": "sales@tredihq.com",
    "phone": "+2347063921091",
    "whatsapp": "+2347063921091",
    "hours": "Monday to Saturday · 8am – 7pm WAT",
    "reply_within": "We reply within one working day",
    "legal_email": "support@tredibooks.com",
    "terms_url": "https://tredibooks.com/terms",
    "privacy_url": "https://tredibooks.com/privacy-policy",
    "deletion_url": "https://tredibooks.com/account-deletion",
}

FAQS = [
    {"q": "How do I send an invoice to a customer?",
     "a": "Open the invoice, tap Share, then pick WhatsApp, email or Save PDF. The PDF carries your logo, brand colour and the template you picked under Invoice templates."},
    {"q": "Why does my old invoice look different now?",
     "a": "Templates apply to every invoice, old and new. Change it under More → Invoice templates and each document re-prints in the new layout."},
    {"q": "A staff member cannot see a shop",
     "a": "Go to More → Users & permissions, open the person and tick the shops they work in. A rep only ever sees the shops posted to their name."},
    {"q": "My trial ended — did I lose my records?",
     "a": "Never. Reading stays open for good; only saving stops. Pick a plan under More → Plan & billing and saving comes straight back."},
    {"q": "Can I change an item's price without changing last month's profit?",
     "a": "Yes. Every sale freezes the cost and price at the moment it was recorded, so past profit never moves when you re-price an item today."},
    {"q": "How do I stop using a shop, account or user without losing history?",
     "a": "Make it dormant instead of deleting it. The record keeps all its past figures but can no longer be picked for new entries."},
    {"q": "Can I bring my old records in from Excel?",
     "a": "Yes — More → Import from Excel. Download the template, fill it in, and upload customers or stock in one go."},
]


class MessageIn(BaseModel):
    topic: str = "Other"
    subject: str
    message: str
    contact: str = ""
    urgency: Literal["normal", "urgent"] = "normal"


def row(m: dict) -> dict:
    out = clean(m)
    out["replies"] = [{"by": r.get("by", "Tredi support"), "message": r.get("message", ""),
                       "at": r["at"].isoformat() if hasattr(r.get("at"), "isoformat") else ""}
                      for r in m.get("replies", [])]
    return out


@router.get("")
async def help_centre(user: CurrentUser):
    f = biz_filter(user)
    msgs = [row(m) async for m in db.support_messages.find({"business_id": f["business_id"]}).sort("created_at", -1).limit(30)]
    return {"contact": CONTACT, "topics": TOPICS, "faqs": FAQS, "messages": msgs,
            "open": len([m for m in msgs if m.get("status") == "open"])}


@router.post("/messages", status_code=201)
async def send_message(data: MessageIn, user: CurrentUser):
    f = biz_filter(user)
    if len(data.subject.strip()) < 3:
        raise HTTPException(400, "Give it a short title so we know what it is about")
    if len(data.message.strip()) < 10:
        raise HTTPException(400, "Tell us a little more — what were you doing when it happened?")
    biz = await db.businesses.find_one({"_id": ObjectId(f["business_id"])})
    doc = {"business_id": f["business_id"], "business_name": (biz or {}).get("name", ""),
           "topic": data.topic if data.topic in TOPICS else "Other", "subject": data.subject.strip(),
           "message": data.message.strip(), "contact": data.contact.strip() or user.get("email", ""),
           "urgency": data.urgency, "status": "open", "by": user.get("name", ""), "by_id": str(user["_id"]),
           "shop": user.get("shop", ""), "replies": [], "created_at": now(), "updated_at": now()}
    res = await db.support_messages.insert_one(doc)
    return {"ok": True, "message": "Sent — we reply within one working day", "item": row({**doc, "_id": res.inserted_id})}


@router.post("/messages/{mid}/close")
async def close_message(mid: str, user: CurrentUser):
    f = biz_filter(user)
    m = await db.support_messages.find_one({"_id": oid(mid), "business_id": f["business_id"]})
    if not m:
        raise HTTPException(404, "Message not found")
    await db.support_messages.update_one({"_id": m["_id"]}, {"$set": {"status": "closed", "updated_at": now()}})
    return {"ok": True, "message": "Marked as sorted"}
