from __future__ import annotations

from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def build_investment_memo_pdf(memo: dict[str, Any]) -> bytes:
    buffer = BytesIO()
    title = str(memo.get("title") or "Investment memo")
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=title,
        author="Acquisition Desk",
    )
    styles = memo_pdf_styles()
    story: list[Any] = [
        Paragraph("Investment memo", styles["Title"]),
        Paragraph(escape(title), styles["Subtitle"]),
        Paragraph(f"Deal ID: {escape(str(memo.get('deal_id') or 'n/a'))}", styles["Meta"]),
        Spacer(1, 8),
    ]

    for section in memo.get("sections") or []:
        section_title = str(section.get("title") or "Abschnitt")
        story.append(Paragraph(escape(section_title), styles["SectionTitle"]))
        items = section.get("items") or ["Keine Inhalte im aktuellen Memo."]
        for item in items:
            story.append(Paragraph(escape(str(item)), styles["Bullet"], bulletText="-"))
        story.append(Spacer(1, 7))

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return buffer.getvalue()


def memo_pdf_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "Title": ParagraphStyle(
            "MemoTitle",
            parent=base["Title"],
            alignment=TA_LEFT,
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#17221e"),
            spaceAfter=8,
        ),
        "Subtitle": ParagraphStyle(
            "MemoSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#46554f"),
            spaceAfter=4,
        ),
        "Meta": ParagraphStyle(
            "MemoMeta",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#6d7772"),
            spaceAfter=10,
        ),
        "SectionTitle": ParagraphStyle(
            "MemoSectionTitle",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#1e332b"),
            spaceBefore=8,
            spaceAfter=5,
        ),
        "Bullet": ParagraphStyle(
            "MemoBullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=12.5,
            leftIndent=12,
            bulletIndent=0,
            textColor=colors.HexColor("#24312c"),
            spaceAfter=3.5,
        ),
    }


def draw_footer(canvas: Canvas, doc: SimpleDocTemplate) -> None:
    canvas.saveState()
    width, _height = A4
    canvas.setStrokeColor(colors.HexColor("#d7dfda"))
    canvas.line(doc.leftMargin, 14 * mm, width - doc.rightMargin, 14 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#6d7772"))
    canvas.drawString(doc.leftMargin, 9 * mm, "Acquisition Desk - Investment memo")
    canvas.drawRightString(width - doc.rightMargin, 9 * mm, f"Seite {canvas.getPageNumber()}")
    canvas.restoreState()
