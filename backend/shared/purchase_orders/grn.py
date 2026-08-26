"""GRN (Goods Received Note) generators — Phase 4.

Produces PDF (via ReportLab) and XLSX (via openpyxl) documents from a
consolidated PO snapshot or a single receipt event. Both formats share the
same header/footer/line layout so the "consolidated" and "per-receipt"
variants are cosmetically identical for the reader — only the numbers change.

Callers assemble a plain-dict `payload` (below) and hand it to
`build_grn_pdf(payload)` / `build_grn_xlsx(payload)`, both of which return
`bytes` ready to stream.

Payload shape (`GrnPayload`):
    {
      "grn_reference": "GRN-PO-CI-2026-00019-C",         # C=consolidated, or receipt seq
      "kind": "consolidated" | "receipt",
      "issued_at": "2026-02-14T10:12:33Z",
      "po": {
        "po_code": "PO-CI-2026-00019",
        "status": "received",
        "currency": "XOF",
        "subtotal": 6000.0, "tax_total": 1080.0, "grand_total": 7080.0,
      },
      "buyer":  { "name": "...", "code": "MRT-ABJ-001",
                  "address": "...", "tax_id": "...", "phone": "...", "email": "..." },
      "supplier": { "name": "...", "code": "SUP-CI-0001", "country": "CI",
                    "tax_id": "...", "registration_number": "...",
                    "email": "...", "phone": "..." },
      "receipt": None | { "id": "por_...", "received_at": "...", "notes": "...",
                          "received_by": "Owner · Partner Alpha Store",
                          "sequence": 2 },
      "lines": [
        { "product_name": "...", "supplier_sku": "...",
          "qty_ordered": 10, "qty_in_scope": 6, "qty_cumulative": 10,
          "unit_cost": 500.0, "tax_pct": 18.0, "line_total": 3540.0 },
        ...
      ],
      "footer_note": "BAKĒD Platform · MARTbakēd · Auto-generated GRN",
    }
"""
from __future__ import annotations
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, List

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)

# Register a Unicode-safe TTF (ships with ReportLab). Falls back silently
# if unavailable — the built-in Helvetica lacks the "ē" glyph so brand
# text (BAKĒD, MARTbakēd) would render as boxes without this.
_UNICODE_FONT = "Helvetica"
_UNICODE_FONT_BOLD = "Helvetica-Bold"
try:
    import os
    _fdir = os.path.join(os.path.dirname(__import__("reportlab").__file__), "fonts")
    pdfmetrics.registerFont(TTFont("Baked", os.path.join(_fdir, "Vera.ttf")))
    pdfmetrics.registerFont(TTFont("Baked-Bold", os.path.join(_fdir, "VeraBd.ttf")))
    _UNICODE_FONT = "Baked"
    _UNICODE_FONT_BOLD = "Baked-Bold"
except Exception:  # pragma: no cover
    pass


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

BRAND_GREEN = colors.HexColor("#77BC1F")
BRAND_DARK = colors.HexColor("#0A1200")
GREY_LIGHT = colors.HexColor("#F1F5F9")
GREY_BORDER = colors.HexColor("#CBD5E1")


def _fmt_amount(v: float, currency: str) -> str:
    return f"{v:,.2f} {currency}"


def _fmt_dt(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d %b %Y · %H:%M UTC")
    except Exception:
        return iso


def build_grn_reference(po_code: str, kind: str, seq: int | None = None) -> str:
    """Deterministic reference — 'C' for consolidated, sequence number otherwise."""
    tag = "C" if kind == "consolidated" else f"R{seq or 1:02d}"
    return f"GRN-{po_code}-{tag}"


# ---------------------------------------------------------------------------
# PDF (ReportLab)
# ---------------------------------------------------------------------------

def build_grn_pdf(payload: Dict[str, Any]) -> bytes:
    """Render a GRN as a single-page A4 PDF and return the byte string."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
        title=payload["grn_reference"], author="BAKĒD Platform",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Title"], fontName=_UNICODE_FONT_BOLD, fontSize=20, textColor=BRAND_DARK, leading=24, spaceAfter=2)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName=_UNICODE_FONT_BOLD, fontSize=10, textColor=BRAND_GREEN, leading=12, spaceAfter=2)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName=_UNICODE_FONT, fontSize=9, leading=12, textColor=colors.black)
    small = ParagraphStyle("Small", parent=body, fontSize=8, textColor=colors.grey)

    story: List[Any] = []

    # ---- Header band ----
    kind_label = "Consolidated GRN" if payload["kind"] == "consolidated" else f"Receipt GRN · #{payload.get('receipt', {}).get('sequence', 1)}"
    header = Table(
        [[
            Paragraph("<b>BAKĒD</b> · MARTbakēd", ParagraphStyle("Brand", parent=body, textColor=BRAND_GREEN, fontSize=12, fontName=_UNICODE_FONT_BOLD)),
            Paragraph(f"<para align='right'><b>{kind_label}</b><br/><font color='#64748B' size='8'>{payload['grn_reference']}</font></para>", body),
        ]],
        colWidths=[95 * mm, 87 * mm],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(header)
    story.append(Spacer(1, 8))

    story.append(Paragraph("Goods Received Note", h1))
    story.append(Paragraph(f"Purchase order <b>{payload['po']['po_code']}</b> · Issued {_fmt_dt(payload['issued_at'])}", body))
    story.append(Spacer(1, 10))

    # ---- Party blocks (Buyer / Supplier) side by side ----
    buyer = payload["buyer"]
    sup = payload["supplier"]

    def _party_block(title: str, party: Dict[str, Any]) -> Paragraph:
        rows = [f"<b>{party.get('name', '')}</b>"]
        if party.get("code"):
            rows.append(f"<font color='#64748B' size='8'>{party['code']}</font>")
        if party.get("address"):
            rows.append(party["address"])
        if party.get("country"):
            rows.append(f"Country · {party['country']}")
        if party.get("tax_id"):
            rows.append(f"Tax ID · {party['tax_id']}")
        if party.get("registration_number"):
            rows.append(f"Reg. № · {party['registration_number']}")
        if party.get("email"):
            rows.append(party["email"])
        if party.get("phone"):
            rows.append(party["phone"])
        inner = "<br/>".join(rows)
        return Paragraph(f"<font color='#77BC1F' size='8'><b>{title}</b></font><br/>{inner}", body)

    parties = Table(
        [[_party_block("BILL TO / BUYER", buyer), _party_block("SUPPLIER", sup)]],
        colWidths=[91 * mm, 91 * mm],
    )
    parties.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), GREY_LIGHT),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 0.5, GREY_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, GREY_BORDER),
    ]))
    story.append(parties)
    story.append(Spacer(1, 10))

    # ---- Receipt event block (only when kind=receipt) ----
    if payload.get("receipt"):
        r = payload["receipt"]
        r_rows = [
            ["Received on", _fmt_dt(r.get("received_at"))],
            ["Received by", r.get("received_by", "—")],
            ["Notes", r.get("notes") or "—"],
        ]
        r_tbl = Table(r_rows, colWidths=[36 * mm, 146 * mm])
        r_tbl.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _UNICODE_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748B")),
            ("BOX", (0, 0), (-1, -1), 0.5, GREY_BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, GREY_BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(r_tbl)
        story.append(Spacer(1, 8))

    # ---- Lines table ----
    scope_label = "Received now" if payload["kind"] == "receipt" else "Received total"
    lines_hdr = ["Product", "Supplier SKU", "Ordered", scope_label, "Cumulative", "Unit cost", "Line total"]
    lines_rows: List[List[Any]] = [lines_hdr]
    currency = payload["po"]["currency"]
    for ln in payload["lines"]:
        lines_rows.append([
            Paragraph(f"<b>{ln['product_name']}</b>", body),
            ln.get("supplier_sku") or "—",
            f"{ln['qty_ordered']:,}",
            f"{ln.get('qty_in_scope', 0):,}",
            f"{ln.get('qty_cumulative', 0):,}",
            _fmt_amount(ln["unit_cost"], currency),
            _fmt_amount(ln["line_total"], currency),
        ])
    lines_tbl = Table(lines_rows, colWidths=[52 * mm, 26 * mm, 16 * mm, 22 * mm, 22 * mm, 22 * mm, 22 * mm], repeatRows=1)
    lines_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), _UNICODE_FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 1), (-1, -1), _UNICODE_FONT),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GREY_LIGHT]),
        ("BOX", (0, 0), (-1, -1), 0.5, GREY_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, GREY_BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(lines_tbl)
    story.append(Spacer(1, 8))

    # ---- Totals block (right-aligned) ----
    po = payload["po"]
    totals = Table(
        [
            ["Subtotal", _fmt_amount(po["subtotal"], currency)],
            [f"Tax ({po.get('tax_label', 'tax')})", _fmt_amount(po["tax_total"], currency)],
            ["Grand total", _fmt_amount(po["grand_total"], currency)],
        ],
        colWidths=[40 * mm, 40 * mm],
        hAlign="RIGHT",
    )
    totals.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _UNICODE_FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748B")),
        ("FONTNAME", (0, 2), (-1, 2), _UNICODE_FONT_BOLD),
        ("TEXTCOLOR", (0, 2), (-1, 2), BRAND_DARK),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#EBF6D9")),
        ("LINEABOVE", (0, 2), (-1, 2), 0.5, GREY_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals)
    story.append(Spacer(1, 12))

    # ---- Signatures + footer ----
    sig = Table(
        [
            [Paragraph("<b>Received by</b>", small), Paragraph("<b>Supplier signature</b>", small)],
            [Paragraph("<br/><br/>___________________________<br/><font size='7' color='#64748B'>Name / Employee code</font>", body),
             Paragraph("<br/><br/>___________________________<br/><font size='7' color='#64748B'>Name / stamp</font>", body)],
        ],
        colWidths=[91 * mm, 91 * mm],
    )
    sig.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(sig)
    story.append(Spacer(1, 12))
    story.append(Paragraph(payload.get("footer_note", "BAKĒD Platform · Auto-generated GRN"), small))

    doc.build(story)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Excel (openpyxl)
# ---------------------------------------------------------------------------

def build_grn_xlsx(payload: Dict[str, Any]) -> bytes:
    """Render the same GRN into a single-sheet Excel workbook."""
    wb = Workbook()
    ws = wb.active
    ws.title = "GRN"

    bold = Font(name="Calibri", size=11, bold=True)
    small = Font(name="Calibri", size=9, color="64748B")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    fill_dark = PatternFill("solid", fgColor="0A1200")
    fill_grey = PatternFill("solid", fgColor="F1F5F9")
    fill_accent = PatternFill("solid", fgColor="77BC1F")
    thin = Side(border_style="thin", color="CBD5E1")
    border = Border(top=thin, bottom=thin, left=thin, right=thin)

    # Widths
    widths = [26, 20, 12, 14, 14, 16, 18]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    row = 1
    ws.cell(row=row, column=1, value="BAKĒD · MARTbakēd").font = Font(bold=True, size=14, color="77BC1F")
    kind_label = "Consolidated GRN" if payload["kind"] == "consolidated" else f"Receipt GRN #{payload.get('receipt', {}).get('sequence', 1)}"
    ws.cell(row=row, column=6, value=kind_label).font = bold
    ws.cell(row=row, column=7, value=payload["grn_reference"]).font = small
    row += 2

    ws.cell(row=row, column=1, value="Goods Received Note").font = Font(size=16, bold=True)
    row += 1
    ws.cell(row=row, column=1, value=f"Purchase order: {payload['po']['po_code']}   ·   Issued: {_fmt_dt(payload['issued_at'])}").font = small
    row += 2

    # Party blocks
    def _emit_party(col_offset: int, title: str, party: Dict[str, Any]) -> None:
        r = row
        c = ws.cell(row=r, column=col_offset, value=title)
        c.font = Font(bold=True, size=9, color="77BC1F")
        c.fill = fill_grey
        r += 1
        for line in [
            party.get("name"),
            party.get("code"),
            party.get("address"),
            f"Country · {party['country']}" if party.get("country") else None,
            f"Tax ID · {party['tax_id']}" if party.get("tax_id") else None,
            f"Reg. № · {party['registration_number']}" if party.get("registration_number") else None,
            party.get("email"), party.get("phone"),
        ]:
            if not line:
                continue
            cell = ws.cell(row=r, column=col_offset, value=line)
            cell.fill = fill_grey
            if r == row + 1:
                cell.font = bold
            r += 1

    _emit_party(1, "BILL TO / BUYER", payload["buyer"])
    _emit_party(5, "SUPPLIER", payload["supplier"])
    row += 8

    # Receipt block
    if payload.get("receipt"):
        r = payload["receipt"]
        for label, val in [("Received on", _fmt_dt(r.get("received_at"))),
                           ("Received by", r.get("received_by", "—")),
                           ("Notes", r.get("notes") or "—")]:
            ws.cell(row=row, column=1, value=label).font = small
            ws.cell(row=row, column=2, value=val)
            ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=7)
            row += 1
        row += 1

    # Lines header
    scope_label = "Received now" if payload["kind"] == "receipt" else "Received total"
    headers = ["Product", "Supplier SKU", "Ordered", scope_label, "Cumulative", "Unit cost", "Line total"]
    for i, h in enumerate(headers, 1):
        cell = ws.cell(row=row, column=i, value=h)
        cell.font = header_font
        cell.fill = fill_dark
        cell.alignment = Alignment(horizontal="right" if i > 1 else "left", vertical="center")
        cell.border = border
    row += 1

    currency = payload["po"]["currency"]
    for ln in payload["lines"]:
        vals = [
            ln["product_name"], ln.get("supplier_sku") or "—",
            ln["qty_ordered"], ln.get("qty_in_scope", 0), ln.get("qty_cumulative", 0),
            round(float(ln["unit_cost"]), 2), round(float(ln["line_total"]), 2),
        ]
        for i, v in enumerate(vals, 1):
            cell = ws.cell(row=row, column=i, value=v)
            cell.border = border
            if i > 2:
                cell.alignment = Alignment(horizontal="right")
            if i in (6, 7):
                cell.number_format = f'#,##0.00 "{currency}"'
        row += 1
    row += 1

    # Totals
    for label, val, is_total in [
        ("Subtotal", payload["po"]["subtotal"], False),
        (f"Tax ({payload['po'].get('tax_label', 'tax')})", payload["po"]["tax_total"], False),
        ("Grand total", payload["po"]["grand_total"], True),
    ]:
        ws.cell(row=row, column=6, value=label).font = bold if is_total else Font(color="64748B")
        cell = ws.cell(row=row, column=7, value=round(float(val), 2))
        cell.number_format = f'#,##0.00 "{currency}"'
        cell.font = bold if is_total else Font()
        if is_total:
            cell.fill = fill_accent
            ws.cell(row=row, column=6).fill = fill_accent
        row += 1
    row += 2

    # Signatures
    ws.cell(row=row, column=1, value="Received by (partner)").font = small
    ws.cell(row=row, column=4, value="Supplier signature").font = small
    row += 3
    ws.cell(row=row, column=1, value=payload.get("footer_note", "BAKĒD Platform · Auto-generated GRN")).font = small

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Payload assembly (shared across all three routers)
# ---------------------------------------------------------------------------

def assemble_payload(
    *, po: Any, lines: List[Any], receipts: List[Any], receipt_lines_by_receipt: Dict[str, List[Any]],
    buyer: Dict[str, Any], supplier: Dict[str, Any],
    target_receipt: Any | None,
) -> Dict[str, Any]:
    """Build the GRN payload dict from raw SQLAlchemy rows.

    - If `target_receipt` is None → consolidated (all cumulative receipts).
    - Otherwise → single-receipt GRN with `qty_in_scope` = that receipt's qty
      and `qty_cumulative` = total across all receipts up to & including it.
    """
    # Order receipts chronologically for deterministic sequence numbers
    ordered = sorted(receipts, key=lambda r: r.received_at)
    seq_by_id = {r.id: idx + 1 for idx, r in enumerate(ordered)}

    # Cumulative qty per PO line across all receipts
    total_by_line: Dict[str, int] = {ln.id: 0 for ln in lines}
    for r in ordered:
        for rl in receipt_lines_by_receipt.get(r.id, []):
            total_by_line[rl.po_line_id] = total_by_line.get(rl.po_line_id, 0) + rl.qty_received

    # For per-receipt: cumulative up to *this* receipt (inclusive)
    inclusive_by_line: Dict[str, int] = {}
    if target_receipt is not None:
        inclusive: Dict[str, int] = {ln.id: 0 for ln in lines}
        for r in ordered:
            for rl in receipt_lines_by_receipt.get(r.id, []):
                inclusive[rl.po_line_id] = inclusive.get(rl.po_line_id, 0) + rl.qty_received
            if r.id == target_receipt.id:
                inclusive_by_line = dict(inclusive)
                break

    kind = "receipt" if target_receipt is not None else "consolidated"
    seq = seq_by_id.get(target_receipt.id) if target_receipt else None

    # Line qty in scope
    scope_by_line: Dict[str, int] = {}
    if target_receipt:
        for rl in receipt_lines_by_receipt.get(target_receipt.id, []):
            scope_by_line[rl.po_line_id] = rl.qty_received

    line_payloads = []
    for ln in lines:
        line_payloads.append({
            "product_name": ln.product_name,
            "supplier_sku": getattr(ln, "supplier_sku", None),
            "qty_ordered": ln.qty_ordered,
            "qty_in_scope": scope_by_line.get(ln.id, 0) if target_receipt else total_by_line.get(ln.id, 0),
            "qty_cumulative": inclusive_by_line.get(ln.id, total_by_line.get(ln.id, 0)),
            "unit_cost": float(ln.unit_cost),
            "tax_pct": float(ln.tax_pct),
            "line_total": float(ln.line_total),
        })

    return {
        "grn_reference": build_grn_reference(po.po_code, kind, seq),
        "kind": kind,
        "issued_at": datetime.utcnow().isoformat() + "Z",
        "po": {
            "po_code": po.po_code, "status": po.status, "currency": po.currency,
            "subtotal": float(po.subtotal), "tax_total": float(po.tax_total),
            "grand_total": float(po.grand_total),
        },
        "buyer": buyer,
        "supplier": supplier,
        "receipt": None if not target_receipt else {
            "id": target_receipt.id,
            "received_at": target_receipt.received_at.isoformat(),
            "notes": target_receipt.notes,
            "sequence": seq,
        },
        "lines": line_payloads,
        "footer_note": "BAKĒD Platform · MARTbakēd · Auto-generated GRN · Not a tax invoice",
    }
