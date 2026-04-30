"""
admission_pdf_view.py
─────────────────────
Two-page admission PDF generator for Top Ridge School.

Page 1  →  Admission details (student info, parent info, checklist)
Page 2  →  Acceptance form (intro, parent declaration, school declaration)

Usage (Django view):
    GET /admissions/<id>/pdf/
    Returns: application/pdf attachment
"""

from io import BytesIO
import os

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.conf import settings

from PIL import Image as PilImage, ImageOps

from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable, Image, PageBreak, KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus.flowables import Flowable

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

import requests

from apps.admissions.models import Admission


# ─────────────────────────────────────────────────────────────────────────────
# School identity constants
# ─────────────────────────────────────────────────────────────────────────────

SCHOOL_NAME  = "TOP RIDGE SCHOOL"
SCHOOL_SUB   = "Excellence in Education"
SCHOOL_MOTTO = "PERSEVERANCE  ·  TRUTH  ·  & COURAGE"

LOGO_PATH = os.path.join(settings.BASE_DIR, "static", "images", "logo.jpeg")

PW     = A4[0] - 32 * mm   # usable page width
PAGE_H = A4[1]


# ─────────────────────────────────────────────────────────────────────────────
# Colour palette  (school green + gold)
# ─────────────────────────────────────────────────────────────────────────────

SCHOOL_GREEN  = colors.HexColor("#1a6b3c")   # shield green
SCHOOL_DARK   = colors.HexColor("#0f4526")   # dark green header
SCHOOL_LIGHT  = colors.HexColor("#e8f5ee")   # very light tint
SCHOOL_MID    = colors.HexColor("#a8d5b8")   # mid green (subtext)

GOLD          = colors.HexColor("#c9a227")   # school gold accent
GOLD_LIGHT    = colors.HexColor("#fdf3d7")   # pale gold row tint
GOLD_DARK     = colors.HexColor("#8a6e14")

TEAL          = colors.HexColor("#0d9488")
LTEAL         = colors.HexColor("#ccfbf1")

GREEN_OK      = colors.HexColor("#16a34a")
LGREEN        = colors.HexColor("#dcfce7")
RED           = colors.HexColor("#dc2626")
LRED          = colors.HexColor("#fee2e2")
ORANGE        = colors.HexColor("#ea580c")
LORANGE       = colors.HexColor("#ffedd5")

WHITE         = colors.white
GRAY_50       = colors.HexColor("#f9fafb")
GRAY_100      = colors.HexColor("#f3f4f6")
GRAY_200      = colors.HexColor("#e5e7eb")
GRAY_300      = colors.HexColor("#d1d5db")
GRAY_400      = colors.HexColor("#9ca3af")
GRAY_600      = colors.HexColor("#4b5563")
GRAY_700      = colors.HexColor("#374151")
GRAY_800      = colors.HexColor("#1f2937")


# ─────────────────────────────────────────────────────────────────────────────
# Custom Flowables
# ─────────────────────────────────────────────────────────────────────────────

class ColorBar(Flowable):
    """Horizontal multi-colour stripe used under headers."""

    def __init__(self, width, height=1.5 * mm, colors_list=None):
        super().__init__()
        self.width       = width
        self.height      = height
        self.colors_list = colors_list or [SCHOOL_DARK, SCHOOL_GREEN, GOLD]

    def draw(self):
        seg_w = self.width / len(self.colors_list)
        for i, col in enumerate(self.colors_list):
            self.canv.setFillColor(col)
            self.canv.rect(i * seg_w, 0, seg_w, self.height, fill=1, stroke=0)


# ─────────────────────────────────────────────────────────────────────────────
# Image loading — with EXIF orientation fix
# ─────────────────────────────────────────────────────────────────────────────

def load_image_flowable(path_or_url: str, width, height) -> Image | None:
    """
    Load an image from a local path or remote URL, apply EXIF rotation
    correction, convert to RGB, and return a ReportLab Image flowable.
    """
    try:
        if path_or_url.startswith(("http://", "https://")):
            resp = requests.get(path_or_url, timeout=10)
            resp.raise_for_status()
            img_bytes = BytesIO(resp.content)
        elif os.path.exists(path_or_url):
            with open(path_or_url, "rb") as f:
                img_bytes = BytesIO(f.read())
        else:
            return None

        pil_img = PilImage.open(img_bytes)
        pil_img = ImageOps.exif_transpose(pil_img)          # fix phone rotation
        if pil_img.mode in ("RGBA", "P", "CMYK", "LA", "L"):
            pil_img = pil_img.convert("RGB")

        out = BytesIO()
        pil_img.save(out, format="JPEG", quality=92)
        out.seek(0)
        return Image(out, width=width, height=height)

    except Exception:
        return None


def load_logo(width=24 * mm, height=24 * mm) -> Image | None:
    return load_image_flowable(LOGO_PATH, width=width, height=height)


def load_admission_photo(admission, width=28 * mm, height=34 * mm) -> Image | None:
    try:
        if not admission.photo:
            return None
        url = admission.photo.url
        if not url.startswith("http"):
            path = os.path.join(settings.MEDIA_ROOT, str(admission.photo))
            return load_image_flowable(path, width, height)
        return load_image_flowable(url, width, height)
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Paragraph / style helpers
# ─────────────────────────────────────────────────────────────────────────────

def _style(size=9, bold=False, color=GRAY_800, align=TA_LEFT,
           leading=None, space_after=0, italic=False) -> ParagraphStyle:
    font = (
        "Helvetica-BoldOblique" if bold and italic else
        "Helvetica-Bold"        if bold            else
        "Helvetica-Oblique"     if italic          else
        "Helvetica"
    )
    return ParagraphStyle(
        "p",
        parent=getSampleStyleSheet()["Normal"],
        fontSize=size,
        fontName=font,
        textColor=color,
        alignment=align,
        leading=leading or (size + 5),
        spaceAfter=space_after,
    )


def para(text, size=9, bold=False, color=GRAY_800, align=TA_LEFT,
         leading=None, space_after=0, italic=False) -> Paragraph:
    return Paragraph(str(text), _style(size, bold, color, align, leading, space_after, italic))


def divider(color=GRAY_200, thickness=0.6) -> HRFlowable:
    return HRFlowable(width="100%", thickness=thickness, color=color,
                      spaceAfter=0, spaceBefore=0)


# ─────────────────────────────────────────────────────────────────────────────
# Page canvas decorations  (called on every page)
# ─────────────────────────────────────────────────────────────────────────────

def _on_page(canvas, doc):
    canvas.saveState()

    # Diagonal watermark
    canvas.setFont("Helvetica-Bold", 40)
    canvas.setFillColor(colors.HexColor("#e5f0ea"))
    canvas.setFillAlpha(0.30)
    canvas.translate(A4[0] / 2, A4[1] / 2)
    canvas.rotate(38)
    canvas.drawCentredString(0, 0, SCHOOL_NAME)
    canvas.setFillAlpha(1.0)

    # Top triple stripe: dark green / gold / green
    canvas.setFillColor(SCHOOL_DARK)
    canvas.rect(0, A4[1] - 3.5, A4[0], 3.5, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, A4[1] - 6.5, A4[0], 3,   fill=1, stroke=0)
    canvas.setFillColor(SCHOOL_GREEN)
    canvas.rect(0, A4[1] - 8.5, A4[0], 2,   fill=1, stroke=0)

    # Bottom bar
    canvas.setFillColor(SCHOOL_DARK)
    canvas.rect(0, 0, A4[0], 5, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 5, A4[0], 2, fill=1, stroke=0)

    # Footer text
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GRAY_400)
    canvas.drawCentredString(
        A4[0] / 2, 8,
        f"Page {doc.page}  \u2022  {SCHOOL_NAME}  \u2022  {SCHOOL_MOTTO}  \u2022  Confidential"
    )

    canvas.restoreState()


# ─────────────────────────────────────────────────────────────────────────────
# Section header — gold left-accent stripe + dark-green bar
# ─────────────────────────────────────────────────────────────────────────────

def build_section_header(title: str, icon: str = ""):
    label = f"{icon}  {title}".strip() if icon else title

    stripe = Table([[""]], colWidths=[3.5 * mm], rowHeights=[8 * mm])
    stripe.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), GOLD),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    title_cell = Table(
        [[para(label, 9, bold=True, color=WHITE)]],
        colWidths=[PW - 3.5 * mm],
    )
    title_cell.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), SCHOOL_GREEN),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
    ]))

    combined = Table([[stripe, title_cell]], colWidths=[3.5 * mm, PW - 3.5 * mm])
    combined.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return combined


# ─────────────────────────────────────────────────────────────────────────────
# Page 1 — Header
# ─────────────────────────────────────────────────────────────────────────────

def build_page1_header(admission):
    logo_img  = load_logo(24 * mm, 24 * mm)
    logo_cell = logo_img or para("★", 18, bold=True, color=WHITE, align=TA_CENTER)

    admission_no = admission.admission_number or "PENDING"
    date_str = (admission.application_date.strftime("%d %B %Y")
                if admission.application_date else "")

    left = Table([[logo_cell]], colWidths=[28 * mm])
    left.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
    ]))

    centre_content = [
        para(SCHOOL_NAME,  14, bold=True, color=WHITE,      align=TA_CENTER),
        para(SCHOOL_SUB,    7, color=SCHOOL_MID, align=TA_CENTER, italic=True),
        Spacer(1, 1.5 * mm),
        divider(GOLD, 0.8),
        Spacer(1, 1.5 * mm),
        para("ADMISSION FORM", 12, bold=True, color=GOLD,   align=TA_CENTER),
        para(SCHOOL_MOTTO, 6.5, color=SCHOOL_MID, align=TA_CENTER, italic=True),
    ]
    centre = Table([[centre_content]], colWidths=[118 * mm])
    centre.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    right_content = [
        para("Ref. No.",     7, color=SCHOOL_MID,                      align=TA_RIGHT),
        para(admission_no,   9, bold=True, color=WHITE,                 align=TA_RIGHT),
        Spacer(1, 3 * mm),
        para("Date Applied", 7, color=SCHOOL_MID,                      align=TA_RIGHT),
        para(date_str,       8, color=colors.HexColor("#d1fae5"),       align=TA_RIGHT),
    ]
    right = Table([[right_content]], colWidths=[36 * mm])
    right.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))

    outer = Table([[left, centre, right]], colWidths=[28 * mm, 118 * mm, 36 * mm])
    outer.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), SCHOOL_DARK),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return outer


# ─────────────────────────────────────────────────────────────────────────────
# Status badge
# ─────────────────────────────────────────────────────────────────────────────

def build_status_badge(admission):
    status_map = {
        "approved": ("✓   ADMISSION APPROVED",  GREEN_OK, LGREEN,  GREEN_OK),
        "rejected": ("✗   ADMISSION REJECTED",  RED,      LRED,    RED),
        "pending":  ("●   APPLICATION PENDING", ORANGE,   LORANGE, ORANGE),
    }
    text, fg, bg, border = status_map.get(
        admission.status, ("●   APPLICATION PENDING", ORANGE, LORANGE, ORANGE)
    )

    inner = Table(
        [[para(text, 10, bold=True, color=fg, align=TA_CENTER)]],
        colWidths=[PW - 4 * mm],
    )
    inner.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), bg),
        ("BOX",           (0, 0), (-1, -1), 1.5, border),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBEFORE",    (0, 0), (0, -1),  5, border),
    ]))
    outer = Table([[inner]], colWidths=[PW])
    outer.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 2 * mm),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 2 * mm),
    ]))
    return outer


# ─────────────────────────────────────────────────────────────────────────────
# Photo card
# ─────────────────────────────────────────────────────────────────────────────

def build_photo_card(admission):
    photo = load_admission_photo(admission)

    if photo:
        photo_cell = photo
    else:
        initials = (
            (admission.first_name or " ")[0].upper() +
            (admission.last_name  or " ")[0].upper()
        )
        photo_cell = para(initials, 20, bold=True, color=SCHOOL_GREEN, align=TA_CENTER)

    inner = Table([[photo_cell]], colWidths=[30 * mm], rowHeights=[36 * mm])
    inner.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND",    (0, 0), (-1, -1), SCHOOL_LIGHT),
        ("BOX",           (0, 0), (-1, -1), 2.0, SCHOOL_GREEN),
    ]))

    label = Table(
        [[para("STUDENT PHOTO", 6, bold=True, color=GRAY_400, align=TA_CENTER)]],
        colWidths=[30 * mm],
    )
    label.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("BACKGROUND",    (0, 0), (-1, -1), GRAY_100),
        ("BOX",           (0, 0), (-1, -1), 0.5, GRAY_200),
    ]))

    wrapper = Table([[inner], [label]], colWidths=[30 * mm])
    wrapper.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))
    return wrapper


# ─────────────────────────────────────────────────────────────────────────────
# Generic info table (label / value rows)
# ─────────────────────────────────────────────────────────────────────────────

def _info_table(rows, cw1=42 * mm, cw2=46 * mm, accent=SCHOOL_GREEN):
    tbl_rows = [
        [para(lbl, 8, bold=True, color=accent), para(val, 8, color=GRAY_800)]
        for lbl, val in rows
    ]
    t = Table(tbl_rows, colWidths=[cw1, cw2])
    t.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.4, GRAY_200),
        *[("BACKGROUND", (0, i), (-1, i),
           WHITE if i % 2 == 0 else GRAY_50)
          for i in range(len(rows))],
    ]))
    return t


# ─────────────────────────────────────────────────────────────────────────────
# Student section
# ─────────────────────────────────────────────────────────────────────────────

def build_student_section(admission):
    class_name = admission.applied_class.name if admission.applied_class else "—"
    dob = (admission.date_of_birth.strftime("%d %B %Y")
           if admission.date_of_birth else "—")

    left_rows = [
        ("Full Name",       f"{admission.first_name} {admission.last_name}".strip() or "—"),
        ("Gender",          admission.gender          or "—"),
        ("Date of Birth",   dob),
        ("Nationality",     admission.nationality     or "—"),
    ]
    right_rows = [
        ("Religion",        admission.religion        or "—"),
        ("Applied Class",   class_name),
        ("Previous School", admission.previous_school or "—"),
        ("Health Notes",    admission.health_notes    or "None"),
    ]

    combined = Table(
        [[_info_table(left_rows),  _info_table(right_rows), build_photo_card(admission)]],
        colWidths=[88 * mm, 88 * mm, 36 * mm],
    )
    combined.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("BOX",           (0, 0), (-1, -1), 0.8, GRAY_200),
        ("LINEAFTER",     (0, 0), (1, 0),   0.4, GRAY_200),
        ("BACKGROUND",    (2, 0), (2, 0),   GRAY_50),
        ("ALIGN",         (2, 0), (2, 0),   "CENTER"),
        ("VALIGN",        (2, 0), (2, 0),   "MIDDLE"),
        ("TOPPADDING",    (2, 0), (2, 0),   8),
        ("BOTTOMPADDING", (2, 0), (2, 0),   8),
        ("LINEBEFORE",    (0, 0), (0, -1),  3.5, SCHOOL_GREEN),
    ]))
    return combined


# ─────────────────────────────────────────────────────────────────────────────
# Parent / guardian section
# ─────────────────────────────────────────────────────────────────────────────

def build_parent_section(admission):
    rows = [
        ("Parent / Guardian Name", admission.parent_name   or "—"),
        ("Phone",                  admission.phone         or "—"),
        ("Email",                  admission.email         or "—"),
        ("Home Address",           admission.address       or "—"),
    ]

    tbl_rows = [
        [para(lbl, 8, bold=True, color=TEAL), para(val, 8, color=GRAY_800)]
        for lbl, val in rows
    ]
    tbl = Table(tbl_rows, colWidths=[52 * mm, PW - 52 * mm])
    tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.4, GRAY_200),
        ("BOX",           (0, 0), (-1, -1), 0.8, GRAY_200),
        ("LINEBEFORE",    (0, 0), (0, -1),  3.5, TEAL),
        *[("BACKGROUND", (0, i), (-1, i),
           WHITE if i % 2 == 0 else GRAY_50)
          for i in range(len(rows))],
    ]))
    return tbl


# ─────────────────────────────────────────────────────────────────────────────
# Admission checklist  (NEW)
# ─────────────────────────────────────────────────────────────────────────────

def build_checklist_section():
    """
    Printable document checklist that school staff tick off manually.
    Gold accent to visually distinguish from other sections.
    """
    items = [
        "Certified copies of birth certificate submitted",
        "Two recent passport photographs attached",
        "Previous school report card enclosed",
        "Medical / immunisation records provided",
        "Parent / Guardian ID copy attached",
        "School fees deposit paid (receipt enclosed)",
    ]
    rows = [
        [para("□", 10, bold=True, color=SCHOOL_GREEN), para(item, 8, color=GRAY_800)]
        for item in items
    ]
    tbl = Table(rows, colWidths=[8 * mm, PW - 8 * mm])
    tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (0, -1),  10),
        ("LEFTPADDING",   (1, 0), (1, -1),  4),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.4, GRAY_200),
        ("BOX",           (0, 0), (-1, -1), 0.8, GRAY_200),
        ("LINEBEFORE",    (0, 0), (0, -1),  3.5, GOLD),
        *[("BACKGROUND", (0, i), (-1, i),
           WHITE if i % 2 == 0 else GOLD_LIGHT)
          for i in range(len(items))],
    ]))
    return tbl


# ─────────────────────────────────────────────────────────────────────────────
# Footer note
# ─────────────────────────────────────────────────────────────────────────────

def build_footer_note():
    tbl = Table([[
        para(
            f"This is an official admission record of {SCHOOL_NAME}.  "
            "Please retain a copy for your records.  "
            "For enquiries, contact the school office.",
            7, color=GRAY_400, align=TA_CENTER, italic=True,
        )
    ]], colWidths=[PW])
    tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return tbl


# ─────────────────────────────────────────────────────────────────────────────
# Page 2 — Acceptance form header
# ─────────────────────────────────────────────────────────────────────────────

def build_acceptance_header():
    logo_img  = load_logo(24 * mm, 24 * mm)
    logo_cell = logo_img or para("★", 18, bold=True, color=WHITE, align=TA_CENTER)

    centre_content = [
        para(SCHOOL_NAME,       14, bold=True, color=WHITE,      align=TA_CENTER),
        para(SCHOOL_SUB,         7, color=SCHOOL_MID, align=TA_CENTER, italic=True),
        Spacer(1, 1.5 * mm),
        divider(GOLD, 0.8),
        Spacer(1, 1.5 * mm),
        para("ACCEPTANCE FORM", 12, bold=True, color=GOLD,       align=TA_CENTER),
        para(
            "To be signed and returned to the school office within 14 days",
            7.5, color=SCHOOL_MID, align=TA_CENTER, italic=True,
        ),
    ]

    tbl = Table(
        [[logo_cell, centre_content, para("", 9)]],
        colWidths=[28 * mm, 138 * mm, 16 * mm],
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), SCHOOL_DARK),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (0, 0),   8),
    ]))
    return tbl


# ─────────────────────────────────────────────────────────────────────────────
# Acceptance intro paragraph
# ─────────────────────────────────────────────────────────────────────────────

def build_intro_text(admission):
    class_name = admission.applied_class.name if admission.applied_class else "the applied class"
    name = f"{admission.first_name} {admission.last_name}".strip() or "the above-named student"

    intro = (
        f"I/We, the undersigned parent/guardian of <b>{name}</b>, hereby accept the offer of "
        f"admission to <b>{class_name}</b> at <b>{SCHOOL_NAME}</b> and agree to abide "
        "by all school rules, regulations, and fee payment obligations as outlined in the "
        "school&#x2019;s handbook."
    )
    style = ParagraphStyle(
        "intro",
        parent=getSampleStyleSheet()["Normal"],
        fontSize=9.5, fontName="Helvetica",
        textColor=GRAY_800, leading=16,
    )

    bar = Table([[""]], colWidths=[4 * mm])
    bar.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), SCHOOL_GREEN),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    text_cell = Table([[Paragraph(intro, style)]], colWidths=[PW - 4 * mm])
    text_cell.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), SCHOOL_LIGHT),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
    ]))

    combined = Table([[bar, text_cell]], colWidths=[4 * mm, PW - 4 * mm])
    combined.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("VALIGN",        (0, 0), (-1, -1), "STRETCH"),
        ("BOX",           (0, 0), (-1, -1), 0.8, SCHOOL_GREEN),
    ]))
    return combined


# ─────────────────────────────────────────────────────────────────────────────
# Signature helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sig_field(label: str, width, tall=False):
    """Returns (line_table, label_table) for a single signature field."""
    h = 28 * mm if tall else 20 * mm
    line = Table([[""]], colWidths=[width], rowHeights=[h])
    line.setStyle(TableStyle([
        ("LINEBELOW",     (0, 0), (-1, -1), 1.2, GRAY_700),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))
    lbl = Table(
        [[para(label, 7, color=GRAY_400, italic=True)]],
        colWidths=[width],
    )
    lbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 2),
    ]))
    return line, lbl


def _two_col_row(items, gap=6 * mm):
    """Place two (line, lbl) pairs side by side."""
    (l1, b1), (l2, b2) = items
    w = (PW - gap) / 2
    _pad = TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ])
    row = Table([[l1, Spacer(gap, 1), l2]], colWidths=[w, gap, w])
    lbl = Table([[b1, Spacer(gap, 1), b2]], colWidths=[w, gap, w])
    row.setStyle(_pad)
    lbl.setStyle(_pad)
    return row, lbl


# ─────────────────────────────────────────────────────────────────────────────
# Signature section (parent + school declarations)
# ─────────────────────────────────────────────────────────────────────────────

def build_signature_section():
    elements = []
    GAP = 6 * mm

    # ── Parent declaration ────────────────────────────────────────────────────
    elements.append(build_section_header("PARENT / GUARDIAN DECLARATION"))
    elements.append(Spacer(1, GAP))

    r1, l1 = _two_col_row([
        _sig_field("Full Name of Parent / Guardian", (PW - GAP) / 2),
        _sig_field("Relationship to Student",         (PW - GAP) / 2),
    ])
    elements += [r1, l1, Spacer(1, GAP)]

    r2, l2 = _two_col_row([
        _sig_field("Phone Number",  (PW - GAP) / 2),
        _sig_field("Email Address", (PW - GAP) / 2),
    ])
    elements += [r2, l2, Spacer(1, GAP)]

    sg_line, sg_lbl = _sig_field("Signature of Parent / Guardian", PW * 0.62, tall=True)
    dt_line, dt_lbl = _sig_field("Date (DD / MM / YYYY)",          PW * 0.34, tall=True)

    _pad = TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ])
    r3 = Table([[sg_line, Spacer(4*mm, 1), dt_line]], colWidths=[PW*.62, 4*mm, PW*.34])
    l3 = Table([[sg_lbl,  Spacer(4*mm, 1), dt_lbl]],  colWidths=[PW*.62, 4*mm, PW*.34])
    r3.setStyle(_pad);  l3.setStyle(_pad)
    elements += [r3, l3]

    elements.append(Spacer(1, 10 * mm))
    elements.append(divider(GRAY_200, 0.8))
    elements.append(Spacer(1, 8 * mm))

    # ── School declaration ────────────────────────────────────────────────────
    elements.append(build_section_header("FOR OFFICIAL USE  —  SCHOOL DECLARATION"))
    elements.append(Spacer(1, GAP))

    declaration = (
        f"This is to certify that the above-named student has been duly admitted to "
        f"{SCHOOL_NAME} and is entitled to all the rights and privileges of a student "
        "of this institution, subject to compliance with all school regulations."
    )
    decl_style = ParagraphStyle(
        "decl",
        parent=getSampleStyleSheet()["Normal"],
        fontSize=9, fontName="Helvetica",
        textColor=GRAY_800, leading=15,
    )
    decl_box = Table([[Paragraph(declaration, decl_style)]], colWidths=[PW])
    decl_box.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.8, GRAY_200),
        ("BACKGROUND",    (0, 0), (-1, -1), GRAY_50),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("LINEBEFORE",    (0, 0), (0, -1),  3.5, SCHOOL_GREEN),
    ]))
    elements.append(decl_box)
    elements.append(Spacer(1, GAP))

    pr_line, pr_lbl = _sig_field("Signature of Principal / Head Teacher", PW * 0.38, tall=True)
    st_line, st_lbl = _sig_field("Official School Stamp",                 PW * 0.30, tall=True)
    pd_line, pd_lbl = _sig_field("Date",                                  PW * 0.26, tall=True)

    cw = [PW*.38, 2*mm, PW*.30, 2*mm, PW*.26]
    pr_row = Table([[pr_line, Spacer(2*mm,1), st_line, Spacer(2*mm,1), pd_line]], colWidths=cw)
    pr_lbl = Table([[pr_lbl,  Spacer(2*mm,1), st_lbl,  Spacer(2*mm,1), pd_lbl]],  colWidths=cw)
    pr_row.setStyle(_pad);  pr_lbl.setStyle(_pad)
    elements += [pr_row, pr_lbl]
    elements.append(Spacer(1, 8 * mm))

    stamp = Table(
        [[para("OFFICIAL\nSTAMP", 8, color=GRAY_400, bold=True, align=TA_CENTER)]],
        colWidths=[48 * mm], rowHeights=[32 * mm],
    )
    stamp.setStyle(TableStyle([
        ("BOX",        (0, 0), (-1, -1), 1.2, GRAY_300),
        ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, -1), GRAY_50),
    ]))
    stamp_row = Table([[para("", 1), stamp]], colWidths=[PW - 52*mm, 52*mm])
    stamp_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
    elements.append(stamp_row)

    return elements


# ─────────────────────────────────────────────────────────────────────────────
# Acceptance footer bullets
# ─────────────────────────────────────────────────────────────────────────────

def build_acceptance_footer():
    lines = [
        ("⚠", "This form must be signed and returned to the school office within 14 days of the offer."),
        ("⚠", "Failure to return this form may result in the admission offer being withdrawn."),
        ("✓", "Please retain the yellow copy for your own records."),
        ("✓", "Contact the school registrar for any queries regarding this admission."),
    ]
    rows = [
        [para(icon, 9, bold=True, color=GOLD), para(text, 7.5, color=GRAY_600)]
        for icon, text in lines
    ]
    tbl = Table(rows, colWidths=[8 * mm, PW - 8 * mm])
    tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (0, -1),  8),
        ("LEFTPADDING",   (1, 0), (1, -1),  4),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.3, GRAY_200),
        ("BOX",           (0, 0), (-1, -1), 0.8, GRAY_200),
        ("BACKGROUND",    (0, 0), (-1, -1), GRAY_50),
        ("LINEBEFORE",    (0, 0), (0, -1),  3.5, GOLD),
    ]))
    return tbl


# ─────────────────────────────────────────────────────────────────────────────
# Django REST Framework view
# ─────────────────────────────────────────────────────────────────────────────

class AdmissionFormPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, admission_id):
        admission = get_object_or_404(
            Admission.objects.select_related("applied_class"),
            id=admission_id,
        )

        if admission.status != "approved":
            return Response(
                {"error": "Admission form is only available for approved applications."},
                status=400,
            )

        buffer = BytesIO()
        pdf = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=16 * mm,
            rightMargin=16 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
        )

        elements = []

        # ── PAGE 1: Admission details ────────────────────────────────────────
        elements.append(build_page1_header(admission))
        elements.append(ColorBar(PW))
        elements.append(Spacer(1, 5 * mm))
        elements.append(build_status_badge(admission))
        elements.append(Spacer(1, 6 * mm))

        elements.append(build_section_header("STUDENT INFORMATION"))
        elements.append(Spacer(1, 1.5 * mm))
        elements.append(build_student_section(admission))
        elements.append(Spacer(1, 6 * mm))

        elements.append(build_section_header("PARENT / GUARDIAN INFORMATION"))
        elements.append(Spacer(1, 1.5 * mm))
        elements.append(build_parent_section(admission))
        elements.append(Spacer(1, 6 * mm))

        elements.append(build_section_header("ADMISSION CHECKLIST"))
        elements.append(Spacer(1, 1.5 * mm))
        elements.append(build_checklist_section())
        elements.append(Spacer(1, 8 * mm))

        elements.append(divider(GRAY_200))
        elements.append(Spacer(1, 3 * mm))
        elements.append(build_footer_note())

        # ── PAGE 2: Acceptance form ──────────────────────────────────────────
        elements.append(PageBreak())
        elements.append(build_acceptance_header())
        elements.append(ColorBar(PW))
        elements.append(Spacer(1, 7 * mm))
        elements.append(build_intro_text(admission))
        elements.append(Spacer(1, 9 * mm))
        elements += build_signature_section()
        elements.append(Spacer(1, 7 * mm))
        elements.append(divider(GRAY_200))
        elements.append(Spacer(1, 4 * mm))
        elements.append(build_acceptance_footer())

        pdf.build(elements, onFirstPage=_on_page, onLaterPages=_on_page)
        buffer.seek(0)

        name_slug = (
            f"{admission.first_name}_{admission.last_name}"
            .strip("_").replace(" ", "_")
        )
        response = HttpResponse(buffer, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="admission_form_{name_slug}.pdf"'
        )
        return response
