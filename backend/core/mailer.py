"""SMTP mailer — sends transactional emails when SMTP_HOST is configured,
otherwise no-ops and returns False. Used by the staff-invite flow (Slice B)
and later by order notifications (Slice F).

Design choice: we send in a background thread so the request path never
blocks on SMTP round-trips. Failures are logged, not raised — the caller
should always assume "best effort" delivery and provide an in-app fallback
(e.g. returning the invite link in the API response).
"""
from __future__ import annotations
import logging
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger("baked.mailer")


def _cfg() -> Optional[dict]:
    host = os.environ.get("SMTP_HOST")
    if not host:
        return None
    # Accept both SMTP_USER (legacy) and SMTP_USERNAME (Gmail convention).
    user = os.environ.get("SMTP_USER") or os.environ.get("SMTP_USERNAME")
    return {
        "host": host,
        "port": int(os.environ.get("SMTP_PORT", "587")),
        "user": user,
        "password": os.environ.get("SMTP_PASSWORD"),
        "from_email": os.environ.get("SMTP_FROM_EMAIL", user or "no-reply@baked.ci"),
        "from_name": os.environ.get("SMTP_FROM_NAME", "BAKĒD"),
        "use_tls": (os.environ.get("SMTP_USE_TLS", "true").lower() == "true"),
    }


def is_configured() -> bool:
    return _cfg() is not None


def send_email(*, to: str, subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
    """Send an email synchronously. Returns True on success, False otherwise.

    Callers that don't want to block should wrap in `asyncio.to_thread` OR
    call `send_email_async` below.
    """
    cfg = _cfg()
    if not cfg:
        logger.info("mailer.no_op to=%s (SMTP not configured)", to)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"]      = to
    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        if cfg["port"] == 465:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=ssl.create_default_context()) as s:
                if cfg["user"]:
                    s.login(cfg["user"], cfg["password"] or "")
                s.send_message(msg)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"]) as s:
                s.ehlo()
                if cfg["use_tls"]:
                    s.starttls(context=ssl.create_default_context())
                    s.ehlo()
                if cfg["user"]:
                    s.login(cfg["user"], cfg["password"] or "")
                s.send_message(msg)
        logger.info("mailer.sent to=%s backend=smtp", to)
        return True
    except Exception as e:  # noqa: BLE001
        # Log the exception class only — never the subject (may contain OTPs
        # or other secrets) and never the SMTP password.
        logger.warning("mailer.failed to=%s err=%s", to, e.__class__.__name__)
        return False


async def send_email_async(**kwargs) -> bool:
    """Async wrapper. Runs the blocking SMTP call in a threadpool."""
    import asyncio
    return await asyncio.to_thread(send_email, **kwargs)
