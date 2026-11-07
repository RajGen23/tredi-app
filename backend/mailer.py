"""Outgoing email through Resend. Sending never blocks or breaks the request
that triggered it: failures are logged and reported back as `False`."""
import asyncio
import html
import logging
import os

import resend

log = logging.getLogger("mailer")


def configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") and os.environ.get("MAIL_FROM"))


async def send(to: str, subject: str, body_html: str, text: str = "", reply_to: str = "") -> bool:
    if not configured() or not to:
        log.warning("email not sent (mail not configured or no recipient): %s", subject)
        return False
    resend.api_key = os.environ["RESEND_API_KEY"]
    params = {"from": os.environ["MAIL_FROM"], "to": [to], "subject": subject, "html": body_html, "text": text or subject}
    if reply_to:
        params["reply_to"] = reply_to
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as exc:   # provider/validation errors must not fail the action itself
        log.error("email to %s failed: %s", to, exc)
        return False


def layout(title: str, lines: list[str], footer: str = "Sent by TradaBooks") -> str:
    """One simple, readable email body; every value passed in is escaped by the caller via `e()`."""
    body = "".join(f"<p style='margin:0 0 12px'>{l}</p>" for l in lines)
    return (f"<div style='font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#06241F'>"
            f"<div style='background:#00C98D;color:#04312A;padding:16px 20px;border-radius:10px 10px 0 0;font-weight:700;font-size:18px'>{title}</div>"
            f"<div style='border:1px solid #E5EEEB;border-top:0;padding:20px;border-radius:0 0 10px 10px;font-size:14px;line-height:21px'>{body}"
            f"<p style='color:#93A9A4;font-size:12px;margin-top:20px'>{footer}</p></div></div>")


def e(v) -> str:
    return html.escape(str(v or ""))
