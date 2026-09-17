"""BAKĒD localised email renderer — Phase D · Workstream 3.

Renders transactional emails with a shared HTML shell (light/BAKĒD-brand
container, big CTA button, plain-text fallback) and pulls copy from
`core.i18n` keyed by `emails.<template>.<slot>`. Every notification path
should route through `send_localised_email` instead of building raw HTML,
so a customer's language preference immediately controls the email they
receive — no per-template branching in call sites.

Design:
  • ONE HTML shell for all templates. Callers only pick the `template`
    (matches an `emails.<name>.*` key group) and pass placeholder params.
  • Text-part is derived automatically from the same params — plain-text
    fallback for SMS-clients and accessibility.
  • Optional `cta` (button label + link) is rendered only when both are
    present. Templates without a CTA (order-delivered thank-you) skip it.
  • Never raises — mirrors `send_email_async` best-effort semantics.
"""
from __future__ import annotations
import logging
from typing import Optional

from core.i18n import t as _t, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES
from core.mailer import send_email_async

logger = logging.getLogger("baked.emails")


def _button(label: str, href: str, color: str = "#77BC1F") -> str:
    return (
        f'<a href="{href}" style="display:inline-block;padding:12px 22px;'
        f'background:{color};color:#000;font-weight:700;text-decoration:none;'
        f'border-radius:10px;font-size:14px;letter-spacing:.01em;">{label}</a>'
    )


def _render_shell(*, title: str, preheader: str, body_html: str, signoff: str) -> str:
    """One HTML template used for every transactional email."""
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:#f4f4f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
             style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.06);">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-size:22px;font-weight:800;letter-spacing:.02em;color:#111;">BAK<span style="color:#77BC1F">Ē</span>D</div>
        </td></tr>
        <tr><td style="padding:16px 32px 32px;color:#111;line-height:1.55;font-size:15px;">
          {body_html}
          <p style="margin:28px 0 0;font-size:13px;color:#8a8a8a;">{signoff}</p>
        </td></tr>
        <tr><td style="background:#f8f8f8;padding:14px 32px;text-align:center;font-size:11px;color:#8a8a8a;">
          © BAKĒD · <a href="https://baked.ci" style="color:#8a8a8a;text-decoration:underline;">baked.ci</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


async def send_localised_email(
    *,
    to: str,
    template: str,
    lang: Optional[str] = None,
    params: Optional[dict] = None,
    cta_label_key: Optional[str] = None,
    cta_href: Optional[str] = None,
    cta_color: str = "#77BC1F",
) -> bool:
    """Render + send a bilingual email keyed off `emails.<template>.*`.

    Params example:
        await send_localised_email(
            to="aicha@example.com",
            template="order_confirmed",
            lang="fr",
            params={"name": "Aïcha", "order_code": "ORD-42", "total": "4 800 XOF"},
            cta_label_key="cta_track",
            cta_href=f"{FRONTEND_URL}/orders/42/track",
        )
    """
    lang = (lang or DEFAULT_LANGUAGE).lower()
    if lang not in SUPPORTED_LANGUAGES:
        lang = DEFAULT_LANGUAGE
    params = params or {}
    prefix = f"emails.{template}"

    subject = _t(f"{prefix}.subject", lang, **params)
    preheader = _t(f"{prefix}.preheader", lang, **params) if _has(prefix, "preheader") else ""
    greeting = _t(f"{prefix}.greeting", lang, **params) if _has(prefix, "greeting") else ""
    intro = _t(f"{prefix}.intro", lang, **params) if _has(prefix, "intro") else _t(f"{prefix}.body", lang, **params)
    signoff = _t(f"{prefix}.signoff", lang, **params) if _has(prefix, "signoff") else _t("emails.brand.signoff", lang)
    warning = _t(f"{prefix}.warning", lang, **params) if _has(prefix, "warning") else ""
    footer = _t(f"{prefix}.footer", lang, **params) if _has(prefix, "footer") else ""

    body_parts = []
    if greeting:
        body_parts.append(f'<p style="margin:0 0 12px;">{greeting}</p>')
    if intro:
        body_parts.append(f'<p style="margin:0 0 18px;">{intro}</p>')
    if cta_label_key and cta_href:
        body_parts.append(
            f'<p style="margin:24px 0;">{_button(_t(f"{prefix}.{cta_label_key}", lang, **params), cta_href, cta_color)}</p>'
        )
    if warning:
        body_parts.append(f'<p style="margin:18px 0;font-size:13px;color:#666;">{warning}</p>')
    if footer:
        body_parts.append(f'<p style="margin:24px 0 0;font-size:13px;color:#666;">{footer}</p>')

    html = _render_shell(title=subject, preheader=preheader, body_html="\n".join(body_parts), signoff=signoff)

    # Plain-text fallback derived from the same keys.
    text_lines = [line for line in (greeting, intro, warning, footer, signoff) if line]
    if cta_href:
        text_lines.insert(-1 if len(text_lines) > 1 else len(text_lines), cta_href)
    text = "\n\n".join(text_lines)

    try:
        return await send_email_async(to=to, subject=subject, html_body=html, text_body=text)
    except Exception as e:  # noqa: BLE001
        logger.warning("localised_email.failed to=%s template=%s lang=%s err=%s", to, template, lang, e.__class__.__name__)
        return False


# ------------------------------------------------------------------------- #
# SMS helper — same idea, no HTML shell, single line.                       #
# ------------------------------------------------------------------------- #
def render_sms(template: str, lang: Optional[str] = None, **params) -> str:
    """Return the localised SMS body for the given template + params."""
    return _t(f"sms.{template}", lang, **params)


# --- internals ---------------------------------------------------------- #
def _has(prefix: str, slot: str) -> bool:
    """Cheap key-existence probe so we only render slots that exist."""
    from core.i18n import _resources
    root = _resources().get(DEFAULT_LANGUAGE, {}).get("emails", {})
    node = root
    for p in prefix.replace("emails.", "").split("."):
        node = node.get(p, {}) if isinstance(node, dict) else {}
    return isinstance(node, dict) and slot in node
