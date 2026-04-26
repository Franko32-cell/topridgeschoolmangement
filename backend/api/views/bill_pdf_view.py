from io import BytesIO
import os
from urllib.parse import quote
import re
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.utils import timezone

from PIL import Image as PilImage, ImageOps

from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable, Image, KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

import requests

from apps.fees.models import Fee
from apps.students.models import Student


# ---------------------------------------------------------------------------
# Brand colours — Top Ridge School (green shield identity)
# ---------------------------------------------------------------------------

GREEN_DARK   = colors.HexColor("#14532d")   # deep forest green  (header bg)
GREEN_MID    = colors.HexColor("#166534")   # mid green          (section labels)
GREEN_LIGHT  = colors.HexColor("#dcfce7")   # pale green tint    (alt rows, paid badge)
GREEN_MUTED  = colors.HexColor("#86efac")   # muted green        (accent bar)
GREEN_TEXT   = colors.HexColor("#15803d")   # readable green     (positive values)

GOLD         = colors.HexColor("#b45309")   # warm gold          (subtitle / accent)
GOLD_LIGHT   = colors.HexColor("#fef9c3")   # pale gold          (highlight)

RED          = colors.HexColor("#dc2626")
RED_LIGHT    = colors.HexColor("#fee2e2")

BLUE_TEXT    = colors.HexColor("#1d4ed8")   # total-due emphasis

SLATE_900    = colors.HexColor("#0f172a")   # near-black body text
SLATE_600    = colors.HexColor("#475569")   # secondary text
SLATE_300    = colors.HexColor("#cbd5e1")   # divider lines
SLATE_100    = colors.HexColor("#f1f5f9")   # alternate row bg
SLATE_50     = colors.HexColor("#f8fafc")   # card bg

WHITE        = colors.white

TERM_LABELS  = {"term1": "Term 1", "term2": "Term 2", "term3": "Term 3"}
LOGO_PATH    = os.path.join(settings.BASE_DIR, "static", "images", "logo.jpeg")

# Usable content width (A4 minus margins)
W_STUDENT = A4[0] - 40 * mm   # student bill  (20mm each side)
W_CLASS   = A4[0] - 24 * mm   # class bill    (12mm each side)


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def load_image_flowable(path_or_url: str, width, height):
    """Load image from disk or URL, auto-rotate via EXIF, resize to target."""
    try:
        if path_or_url.startswith(("http://", "https://")):
            resp = requests.get(path_or_url, timeout=10, stream=True)
            resp.raise_for_status()
            raw = BytesIO()
            for chunk in resp.iter_content(8192):
                raw.write(chunk)
            raw.seek(0)
        elif os.path.exists(path_or_url):
            with open(path_or_url, "rb") as f:
                raw = BytesIO(f.read())
        else:
            return None

        pil = PilImage.open(raw)
        pil = ImageOps.exif_transpose(pil)

        # Resize before handing to ReportLab — saves significant memory
        tw, th = int(width * 3.78), int(height * 3.78)
        pil.thumbnail((tw, th), PilImage.LANCZOS)

        if pil.mode not in ("RGB",):
            pil = pil.convert("RGB")

        out = BytesIO()
        pil.save(out, format="JPEG", quality=80, optimize=True)
        out.seek(0)
        pil.close()

        return Image(out, width=width, height=height)
    except Exception:
        return None


def load_logo(size=22 * mm):
    return load_image_flowable(LOGO_PATH, width=size, height=size)


def load_student_photo(student, width=26 * mm, height=28 * mm):
    try:
        if not student.photo:
            return None
        url = student.photo.url
        if not url.startswith("http"):
            path = os.path.join(settings.MEDIA_ROOT, str(student.photo))
            return load_image_flowable(path, width, height)
        return load_image_flowable(url, width, height)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Paragraph factory
# ---------------------------------------------------------------------------

def P(text, size=9, bold=False, color=SLATE_900, align=TA_LEFT, leading=None):
    return Paragraph(str(text), ParagraphStyle(
        "p",
        parent=getSampleStyleSheet()["Normal"],
        fontSize=size,
        fontName="Helvetica-Bold" if bold else "Helvetica",
        textColor=color,
        alignment=align,
        leading=leading or (size + 4),
        spaceAfter=0,
        spaceBefore=0,
    ))


# ---------------------------------------------------------------------------
# Header  —  Top Ridge School branding
# ---------------------------------------------------------------------------

def build_header(term: str, year, content_width=W_STUDENT):
    logo_cell = load_logo(size=22 * mm) or P("", 9)
    year_str  = str(year) if year else str(timezone.now().year)
    term_str  = TERM_LABELS.get(term, term)

    # Centre column: school name + doc type
    centre = [
        P("TOP RIDGE SCHOOL",      13, bold=True,  color=WHITE,                          align=TA_CENTER),
        P("PERSEVERANCE · TRUTH · COURAGE",
                                    7,              color=colors.HexColor("#bbf7d0"),    align=TA_CENTER),
        Spacer(1, 3 * mm),
        P("FEE STATEMENT",         11, bold=True,  color=GOLD,                           align=TA_CENTER),
        P(f"{term_str}  ·  Academic Year {year_str}",
                                    8,              color=colors.HexColor("#d1fae5"),    align=TA_CENTER),
    ]

    # Right column: OFFICIAL stamp
    right = [
        P("OFFICIAL",  7, bold=True, color=colors.HexColor("#6ee7b7"), align=TA_CENTER),
        P("DOCUMENT",  7, bold=True, color=colors.HexColor("#6ee7b7"), align=TA_CENTER),
    ]

    col_l = 26 * mm
    col_r = 26 * mm
    col_c = content_width - col_l - col_r

    header = Table(
        [[logo_cell, centre, right]],
        colWidths=[col_l, col_c, col_r],
    )
    header.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), GREEN_DARK),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (0, 0), (0,  0),  "CENTER"),
        ("ALIGN",         (2, 0), (2,  0),  "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (0,  0),   8),
        ("RIGHTPADDING",  (2, 0), (2,  0),   8),
    ]))

    # Gold accent stripe under header
    stripe = Table([[""]], colWidths=[content_width])
    stripe.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), GOLD),
        ("TOPPADDING",    (0, 0), (-1, -1), 1.8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))

    # Muted green stripe
    stripe2 = Table([[""]], colWidths=[content_width])
    stripe2.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), GREEN_MUTED),
        ("TOPPADDING",    (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))

    return [header, stripe, stripe2]


# ---------------------------------------------------------------------------
# Student info card
# ---------------------------------------------------------------------------

def build_student_card(student, term: str, year, content_width=W_STUDENT):
    class_name = student.school_class.name if student.school_class else "—"
    year_str   = str(year) if year else str(timezone.now().year)

    def lbl(t): return P(t, 7, bold=True, color=SLATE_600)
    def val(t): return P(str(t), 9, color=SLATE_900)

    info_rows = [
        [lbl("STUDENT NAME"),  val(student.full_name)],
        [lbl("ADMISSION NO"),  val(student.admission_number)],
        [lbl("CLASS"),         val(class_name)],
        [lbl("TERM"),          val(TERM_LABELS.get(term, term))],
        [lbl("ACADEMIC YEAR"), val(year_str)],
    ]

    info_tbl = Table(info_rows, colWidths=[32 * mm, 90 * mm])
    info_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.3, SLATE_300),
    ]))

    photo     = load_student_photo(student)
    photo_box = photo if photo else P("No Photo", 7, color=SLATE_600, align=TA_CENTER)

    photo_wrapper = Table([[photo_box]], colWidths=[30 * mm])
    photo_wrapper.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 2.5, GREEN_MID),
        ("BACKGROUND",    (0, 0), (-1, -1), GREEN_LIGHT),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    right_w = 34 * mm
    left_w  = content_width - right_w

    outer = Table([[info_tbl, photo_wrapper]], colWidths=[left_w, right_w])
    outer.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.8, SLATE_300),
        ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LINEAFTER",     (0, 0), (0, -1),  3, GREEN_MID),   # left accent bar
    ]))
    return outer


# ---------------------------------------------------------------------------
# Section label bar
# ---------------------------------------------------------------------------

def section_label(text: str, content_width=W_STUDENT):
    tbl = Table([[P(f"  {text}", 8, bold=True, color=WHITE)]], colWidths=[content_width])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), GREEN_MID),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))
    return tbl


# ---------------------------------------------------------------------------
# Fee breakdown table  (single student)
# ---------------------------------------------------------------------------

def build_fee_table(fee, content_width=W_STUDENT):
    col_l = content_width - 52 * mm
    col_r = 52 * mm

    def money(v): return f"GHS {float(v):,.2f}"

    rows       = []
    alt_rows   = []   # indices that get alternate bg

    def add_row(label, value, highlight=False, val_color=None):
        fs        = 10 if highlight else 9
        lbl_color = GREEN_MID if highlight else SLATE_600
        vc        = val_color or (BLUE_TEXT if highlight else SLATE_900)
        rows.append([
            P(label,        fs, bold=highlight, color=lbl_color),
            P(money(value), fs, bold=highlight, color=vc, align=TA_RIGHT),
        ])

    add_row("School Fees", fee.amount)
    alt_rows.append(len(rows) - 1)

    if fee.book_user_fee and float(fee.book_user_fee) > 0:
        add_row("Book User Fee", fee.book_user_fee)
        alt_rows.append(len(rows) - 1)

    if fee.workbook_fee and float(fee.workbook_fee) > 0:
        add_row("Workbook Fee", fee.workbook_fee)
        alt_rows.append(len(rows) - 1)

    if fee.arrears and float(fee.arrears) > 0:
        add_row("Arrears Carried Forward", fee.arrears, val_color=RED)
        alt_rows.append(len(rows) - 1)

    # Spacer divider row
    rows.append([P("", 3), P("", 3)])
    divider_idx = len(rows) - 1

    add_row("TOTAL DUE",   fee.total_amount, highlight=True)
    add_row("Amount Paid", fee.paid,          val_color=GREEN_TEXT)

    balance   = float(fee.balance)
    bal_color = GREEN_TEXT if balance <= 0 else RED
    rows.append([
        P("OUTSTANDING BALANCE", 10, bold=True, color=SLATE_900),
        P(money(balance),        10, bold=True, color=bal_color, align=TA_RIGHT),
    ])

    tbl   = Table(rows, colWidths=[col_l, col_r])
    style = [
        ("TOPPADDING",    (0, 0),  (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0),  (-1, -1), 7),
        ("LEFTPADDING",   (0, 0),  (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0),  (-1, -1), 12),
        ("BOX",           (0, 0),  (-1, -1), 0.8, SLATE_300),
        ("LINEBELOW",     (0, 0),  (-1, divider_idx - 1), 0.3, SLATE_300),
        # Total row highlight
        ("BACKGROUND",    (0, divider_idx + 1), (-1, divider_idx + 1), GREEN_LIGHT),
        ("LINEABOVE",     (0, divider_idx + 1), (-1, divider_idx + 1), 1.5, GREEN_MID),
        # Balance row
        ("BACKGROUND",    (0, -1), (-1, -1), RED_LIGHT if balance > 0 else GREEN_LIGHT),
        ("LINEABOVE",     (0, -1), (-1, -1), 1,   bal_color),
        ("LINEBELOW",     (0, -1), (-1, -1), 1,   bal_color),
    ]
    for i in alt_rows:
        style.append(("BACKGROUND", (0, i), (-1, i), SLATE_100))

    tbl.setStyle(TableStyle(style))
    return tbl


# ---------------------------------------------------------------------------
# Status badge
# ---------------------------------------------------------------------------

def build_status_badge(fee, content_width=W_STUDENT):
    balance   = float(fee.balance)
    paid      = balance <= 0
    text      = "FULLY PAID  —  Thank you for settling your fees!" if paid \
                else f"OUTSTANDING BALANCE:  GHS {balance:,.2f}  —  Please settle promptly."
    bg        = GREEN_LIGHT if paid else RED_LIGHT
    fg        = GREEN_TEXT  if paid else RED
    prefix    = "✓  " if paid else "!  "

    badge = Table(
        [[P(prefix + text, 10, bold=True, color=fg, align=TA_CENTER)]],
        colWidths=[content_width],
    )
    badge.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), bg),
        ("BOX",           (0, 0), (-1, -1), 1.5, fg),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return badge


# ---------------------------------------------------------------------------
# Transaction history table  (for receipt)
# ---------------------------------------------------------------------------

def build_transaction_table(transactions, content_width=W_STUDENT):
    if not transactions:
        return None

    col_w = [content_width - 80 * mm, 30 * mm, 50 * mm]

    header = [
        P("Date",            8, bold=True, color=WHITE),
        P("Amount (GHS)",    8, bold=True, color=WHITE, align=TA_CENTER),
        P("Note",            8, bold=True, color=WHITE),
    ]
    rows   = [header]

    for i, txn in enumerate(transactions):
        date_str  = txn.created_at.strftime("%d %b %Y")
        amount    = f"{float(txn.amount):,.2f}"
        note      = txn.note or "—"
        bg        = SLATE_100 if i % 2 == 0 else WHITE
        rows.append([
            P(date_str, 8, color=SLATE_600),
            P(amount,   8, color=GREEN_TEXT, align=TA_CENTER),
            P(note,     8, color=SLATE_600),
        ])

    tbl = Table(rows, colWidths=col_w)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  GREEN_MID),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("GRID",          (0, 0), (-1, -1), 0.3, SLATE_300),
        ("BOX",           (0, 0), (-1, -1), 0.8, SLATE_300),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [SLATE_100, WHITE]),
    ]))
    return tbl


# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------

def build_footer():
    return [
        HRFlowable(width="100%", thickness=0.5, color=SLATE_300),
        Spacer(1, 2.5 * mm),
        P(
            "Please ensure all fees are settled promptly. "
            "Contact the school bursar for payment queries.",
            8, color=SLATE_600, align=TA_CENTER,
        ),
        Spacer(1, 1 * mm),
        P(
            "Top Ridge School  ·  Perseverance  ·  Truth  ·  Courage",
            7, color=colors.HexColor("#86efac"), align=TA_CENTER,
        ),
    ]


# ---------------------------------------------------------------------------
# Receipt for a single PaymentTransaction
# ---------------------------------------------------------------------------

class PaymentReceiptPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, transaction_id):
        from apps.fees.models import PaymentTransaction
        txn = get_object_or_404(PaymentTransaction, id=transaction_id)
        fee = txn.fee
        student = fee.student
        term    = fee.term
        year    = getattr(fee, "year", None) or timezone.now().year

        buffer = BytesIO()
        pdf    = SimpleDocTemplate(
            buffer, pagesize=A4,
            leftMargin=20*mm, rightMargin=20*mm,
            topMargin=15*mm, bottomMargin=15*mm,
        )

        elements = []
        for item in build_header(term, year):
            elements.append(item)
        elements.append(Spacer(1, 5*mm))

        # Receipt ID banner
        receipt_banner = Table(
            [[P(f"PAYMENT RECEIPT  ·  REF #{txn.id}", 10, bold=True, color=WHITE, align=TA_CENTER)]],
            colWidths=[W_STUDENT],
        )
        receipt_banner.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), GREEN_DARK),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(receipt_banner)
        elements.append(Spacer(1, 4*mm))

        elements.append(build_student_card(student, term, year))
        elements.append(Spacer(1, 5*mm))
        elements.append(section_label("PAYMENT DETAILS"))
        elements.append(Spacer(1, 1*mm))

        # Payment detail rows
        date_str   = txn.created_at.strftime("%d %B %Y, %I:%M %p")
        recorded   = (
            txn.recorded_by.get_full_name() or txn.recorded_by.username
            if txn.recorded_by else "System"
        )

        def detail_row(label, value, val_color=SLATE_900, highlight=False):
            bg = GREEN_LIGHT if highlight else WHITE
            return [
                P(label, 9, bold=True, color=SLATE_600),
                P(value, 10 if highlight else 9, bold=highlight, color=val_color, align=TA_RIGHT),
            ], bg

        rows       = []
        row_styles = []

        pairs = [
            ("Date of Payment",    date_str,                     SLATE_900, False),
            ("Amount Paid",        f"GHS {float(txn.amount):,.2f}", GREEN_TEXT, True),
            ("Payment Note",       txn.note or "—",              SLATE_600, False),
            ("Recorded By",        recorded,                     SLATE_900, False),
            ("Remaining Balance",  f"GHS {float(fee.balance):,.2f}",
             GREEN_TEXT if float(fee.balance) <= 0 else RED, False),
        ]
        for i, (lbl, val, vc, hi) in enumerate(pairs):
            row, bg = detail_row(lbl, val, vc, hi)
            rows.append(row)
            if bg != WHITE or i % 2 == 0:
                row_styles.append(("BACKGROUND", (0, i), (-1, i), bg if hi else SLATE_100 if i % 2 == 0 else WHITE))

        tbl = Table(rows, colWidths=[W_STUDENT - 52*mm, 52*mm])
        style = [
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
            ("LINEBELOW",     (0, 0), (-1, -2), 0.3, SLATE_300),
            ("BOX",           (0, 0), (-1, -1), 0.8, SLATE_300),
        ] + row_styles
        tbl.setStyle(TableStyle(style))
        elements.append(tbl)

        elements.append(Spacer(1, 5*mm))
        elements.append(build_status_badge(fee))
        elements.append(Spacer(1, 6*mm))
        for item in build_footer():
            elements.append(item)

        pdf.build(elements)
        pdf_data = buffer.getvalue()
        buffer.close()

        adm      = student.admission_number
        filename = f"receipt_{adm}_txn{txn.id}.pdf"
        response = HttpResponse(pdf_data, content_type="application/pdf")
        response["Content-Disposition"] = (
            f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"
        )
        return response


# ---------------------------------------------------------------------------
# Single-student fee bill
# ---------------------------------------------------------------------------

class StudentFeeBillPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        term = request.query_params.get("term")
        if not term:
            from rest_framework.response import Response
            return Response({"error": "term is required"}, status=400)

        student = get_object_or_404(Student, id=student_id)
        fee     = Fee.objects.filter(student=student, term=term).first()

        if not fee:
            from rest_framework.response import Response
            return Response(
                {"error": "No fee record found for this student and term."},
                status=404,
            )

        year = getattr(fee, "year", None) or timezone.now().year

        buffer = BytesIO()
        pdf    = SimpleDocTemplate(
            buffer, pagesize=A4,
            leftMargin=20*mm, rightMargin=20*mm,
            topMargin=15*mm, bottomMargin=15*mm,
        )

        elements = []
        for item in build_header(term, year):
            elements.append(item)

        elements.append(Spacer(1, 5*mm))
        elements.append(build_student_card(student, term, year))
        elements.append(Spacer(1, 5*mm))

        elements.append(KeepTogether([
            section_label("FEE BREAKDOWN"),
            Spacer(1, 1*mm),
            build_fee_table(fee),
        ]))

        elements.append(Spacer(1, 5*mm))
        elements.append(build_status_badge(fee))

        # Payment history (if any)
        transactions = list(
            fee.transactions.select_related("recorded_by").order_by("created_at")
        )
        if transactions:
            elements.append(Spacer(1, 5*mm))
            elements.append(KeepTogether([
                section_label("PAYMENT HISTORY"),
                Spacer(1, 1*mm),
                build_transaction_table(transactions),
            ]))

        elements.append(Spacer(1, 6*mm))
        for item in build_footer():
            elements.append(item)

        pdf.build(elements)
        pdf_data = buffer.getvalue()
        buffer.close()

        name_slug = re.sub(r'[^A-Za-z0-9_-]+', '_', student.full_name.strip()).strip("_")
        filename  = f"bill_{name_slug}_{term}.pdf"

        response = HttpResponse(pdf_data, content_type="application/pdf")
        response["Content-Disposition"] = (
            f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"
        )
        return response


# ---------------------------------------------------------------------------
# Class-wide fee bill
# ---------------------------------------------------------------------------

class ClassFeeBillPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        term         = request.query_params.get("term")
        school_class = request.query_params.get("school_class")

        if not term or not school_class:
            from rest_framework.response import Response
            return Response({"error": "term and school_class are required"}, status=400)

        fees = (
            Fee.objects
            .filter(student__school_class_id=school_class, term=term)
            .select_related("student", "student__school_class")
            .order_by("student__admission_number")
        )
        if not fees.exists():
            from rest_framework.response import Response
            return Response({"error": "No fee records found."}, status=404)

        first_fee  = fees.first()
        year       = getattr(first_fee, "year", None) or timezone.now().year
        class_name = (
            first_fee.student.school_class.name
            if first_fee.student.school_class else "—"
        )

        buffer = BytesIO()
        pdf    = SimpleDocTemplate(
            buffer, pagesize=A4,
            leftMargin=12*mm, rightMargin=12*mm,
            topMargin=12*mm, bottomMargin=12*mm,
        )

        elements = []
        for item in build_header(term, year, content_width=W_CLASS):
            elements.append(item)
        elements.append(Spacer(1, 4*mm))

        # Sub-header: class + year
        sub = Table([[
            P(f"  CLASS:  {class_name}", 10, bold=True, color=GREEN_MID),
            P(f"ACADEMIC YEAR:  {year}  ", 10, bold=True, color=SLATE_600, align=TA_RIGHT),
        ]], colWidths=[W_CLASS / 2, W_CLASS / 2])
        sub.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), SLATE_100),
            ("BOX",           (0, 0), (-1, -1), 0.5, SLATE_300),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LINEAFTER",     (0, 0), (0, -1),  0.5, SLATE_300),
        ]))
        elements.append(sub)
        elements.append(Spacer(1, 3*mm))

        # Column widths for the main roster table
        CW = [46*mm, 20*mm, 20*mm, 20*mm, 17*mm, 24*mm, 22*mm, 18*mm]

        def hdr(t, align=TA_CENTER):
            return P(t, 7, bold=True, color=WHITE, align=align)

        header_row = [
            hdr("  STUDENT", TA_LEFT),
            hdr("FEES"), hdr("BOOKS"), hdr("WORKBOOK"),
            hdr("ARREARS"), hdr("TOTAL"), hdr("PAID"), hdr("BALANCE"),
        ]

        rows = [header_row]
        total_expected = total_paid = total_balance = 0.0

        for i, fee in enumerate(fees):
            bal       = float(fee.balance)
            bal_color = GREEN_TEXT if bal <= 0 else RED
            rows.append([
                P(f"  {fee.student.full_name}",        8, color=SLATE_900),
                P(f"{float(fee.amount):,.0f}",          8, color=SLATE_600, align=TA_CENTER),
                P(f"{float(fee.book_user_fee):,.0f}",   8, color=SLATE_600, align=TA_CENTER),
                P(f"{float(fee.workbook_fee):,.0f}",    8, color=SLATE_600, align=TA_CENTER),
                P(f"{float(fee.arrears):,.0f}",         8, color=RED       if float(fee.arrears) > 0 else SLATE_600, align=TA_CENTER),
                P(f"{float(fee.total_amount):,.0f}",    8, bold=True, color=BLUE_TEXT,  align=TA_CENTER),
                P(f"{float(fee.paid):,.0f}",            8, color=GREEN_TEXT,            align=TA_CENTER),
                P(f"{bal:,.0f}",                        8, bold=True, color=bal_color,  align=TA_CENTER),
            ])
            total_expected += float(fee.total_amount)
            total_paid     += float(fee.paid)
            total_balance  += bal

        # Totals row
        bal_txt_color = colors.HexColor("#86efac") if total_balance <= 0 else colors.HexColor("#fca5a5")
        rows.append([
            P("  TOTALS", 8, bold=True, color=WHITE),
            P("", 8), P("", 8), P("", 8), P("", 8),
            P(f"{total_expected:,.0f}", 8, bold=True, color=WHITE,        align=TA_CENTER),
            P(f"{total_paid:,.0f}",     8, bold=True, color=WHITE,        align=TA_CENTER),
            P(f"{total_balance:,.0f}",  8, bold=True, color=bal_txt_color, align=TA_CENTER),
        ])

        tbl = Table(rows, colWidths=CW)
        tbl.setStyle(TableStyle([
            ("BACKGROUND",     (0, 0),  (-1, 0),  GREEN_DARK),
            ("TOPPADDING",     (0, 0),  (-1, 0),  8),
            ("BOTTOMPADDING",  (0, 0),  (-1, 0),  8),
            ("BACKGROUND",     (0, -1), (-1, -1), GREEN_MID),
            ("LINEABOVE",      (0, -1), (-1, -1), 1.5, GREEN_MUTED),
            ("ROWBACKGROUNDS", (0, 1),  (-1, -2), [WHITE, SLATE_100]),
            ("GRID",           (0, 0),  (-1, -1), 0.3, SLATE_300),
            ("BOX",            (0, 0),  (-1, -1), 1,   SLATE_300),
            ("TOPPADDING",     (0, 1),  (-1, -1), 5),
            ("BOTTOMPADDING",  (0, 1),  (-1, -1), 5),
            ("LEFTPADDING",    (0, 0),  (-1, -1), 4),
            ("VALIGN",         (0, 0),  (-1, -1), "MIDDLE"),
            # Highlight total column
            ("BACKGROUND",     (5, 1),  (5, -2),  colors.HexColor("#f0fdf4")),
        ]))
        elements.append(tbl)
        elements.append(Spacer(1, 4*mm))

        # Summary bar
        out_color = RED       if total_balance > 0 else GREEN_TEXT
        out_bg    = RED_LIGHT if total_balance > 0 else GREEN_LIGHT
        paid_pct  = (total_paid / total_expected * 100) if total_expected > 0 else 0

        summary = Table([[
            P(f"  Students: {len(fees)}", 9, bold=True, color=SLATE_900),
            P(f"Expected: GHS {total_expected:,.2f}",  9, bold=True, color=BLUE_TEXT,  align=TA_CENTER),
            P(f"Collected: GHS {total_paid:,.2f}",     9, bold=True, color=GREEN_TEXT, align=TA_CENTER),
            P(f"Collection rate: {paid_pct:.1f}%",     9, bold=True, color=GREEN_TEXT if paid_pct >= 80 else GOLD, align=TA_CENTER),
            P(f"Outstanding: GHS {total_balance:,.2f}  ", 9, bold=True, color=out_color, align=TA_RIGHT),
        ]], colWidths=[30*mm, 46*mm, 46*mm, 42*mm, 43*mm])
        summary.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), SLATE_100),
            ("BACKGROUND",    (4, 0), (4,  0),  out_bg),
            ("BOX",           (0, 0), (-1, -1), 0.8, SLATE_300),
            ("LINEAFTER",     (0, 0), (3,  0),  0.3, SLATE_300),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(summary)
        elements.append(Spacer(1, 5*mm))
        for item in build_footer():
            elements.append(item)

        pdf.build(elements)
        pdf_data = buffer.getvalue()
        buffer.close()

        safe_class = re.sub(r'[^A-Za-z0-9_-]+', '_', class_name.strip()).strip("_")
        filename   = f"class_bill_{safe_class}_{term}.pdf"

        response = HttpResponse(pdf_data, content_type="application/pdf")
        response["Content-Disposition"] = (
            f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"
        )
        return response
