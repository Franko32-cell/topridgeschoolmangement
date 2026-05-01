from io import BytesIO
import os
from urllib.parse import quote
import re
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.conf import settings

from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from PIL import Image as PilImage, ImageOps

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

import requests

from apps.fees.models import Fee, PaymentTransaction
from apps.students.models import Student
from apps.classes.models import Class

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------

BLUE   = colors.HexColor("#1e40af")
LBLUE  = colors.HexColor("#dbeafe")
DGRAY  = colors.HexColor("#374151")
LGRAY  = colors.HexColor("#9ca3af")
WHITE  = colors.white
GREEN  = colors.HexColor("#16a34a")
LGREEN = colors.HexColor("#dcfce7")
RED    = colors.HexColor("#dc2626")
LRED   = colors.HexColor("#fef2f2")
BLACK  = colors.HexColor("#111827")
AMBER  = colors.HexColor("#d97706")
LAMBER = colors.HexColor("#fffbeb")

TERM_LABELS = {"term1": "Term 1", "term2": "Term 2", "term3": "Term 3"}

LOGO_PATH = os.path.join(settings.BASE_DIR, "static", "images", "logo1.jpg")

W_A5 = A5[0] - 24 * mm
W_A4 = A4[0] - 24 * mm


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def para(text, size=9, bold=False, color=DGRAY, align=TA_LEFT):
    return Paragraph(str(text), ParagraphStyle(
        "p",
        parent=getSampleStyleSheet()["Normal"],
        fontSize=size,
        fontName="Helvetica-Bold" if bold else "Helvetica",
        textColor=color,
        alignment=align,
        leading=size + 4,
        spaceAfter=0,
    ))


def load_logo():
    try:
        if os.path.exists(LOGO_PATH):
            return Image(LOGO_PATH, width=16 * mm, height=16 * mm)
    except Exception:
        pass
    return None


def load_student_photo(student, size=18 * mm):
    try:
        if not student.photo:
            return None
        photo_url = student.photo.url
        if not photo_url.startswith("http"):
            path = os.path.join(settings.MEDIA_ROOT, str(student.photo))
            if os.path.exists(path):
                with open(path, "rb") as f:
                    img_bytes = BytesIO(f.read())
            else:
                return None
        else:
            resp = requests.get(photo_url, timeout=5, stream=True)
            resp.raise_for_status()
            img_bytes = BytesIO()
            for chunk in resp.iter_content(chunk_size=8192):
                img_bytes.write(chunk)
            img_bytes.seek(0)

        pil_img = PilImage.open(img_bytes)
        pil_img = ImageOps.exif_transpose(pil_img)

        target_px = int(size * 3.78)
        pil_img.thumbnail((target_px, target_px), PilImage.LANCZOS)

        if pil_img.mode in ("RGBA", "P", "CMYK", "LA", "L"):
            pil_img = pil_img.convert("RGB")

        corrected = BytesIO()
        pil_img.save(corrected, format="JPEG", quality=75, optimize=True)
        corrected.seek(0)
        pil_img.close()

        return Image(corrected, width=size, height=size)

    except Exception:
        pass
    return None


def build_school_header(W, subtitle):
    """Shared blue header block used by both bill views."""
    logo      = load_logo()
    logo_cell = logo if logo else para("", 9)

    school_block = [
        para("LEADING STARS ACADEMY", 12, bold=True, color=BLUE, align=TA_CENTER),
        para("WHERE LEADERS ARE BORN",  7, color=LGRAY, align=TA_CENTER),
        Spacer(1, 1 * mm),
        para(subtitle, 10, bold=True, color=BLACK, align=TA_CENTER),
    ]

    header = Table(
        [[logo_cell, school_block, para("", 9)]],
        colWidths=[18 * mm, W - 36 * mm, 18 * mm],
    )
    header.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LBLUE),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (0,  0),  5),
        ("BOX",           (0, 0), (-1, -1), 0, BLUE),
    ]))
    return header


# ---------------------------------------------------------------------------
# Student Fee Bill  —  all terms for one student
# ---------------------------------------------------------------------------

class StudentFeeBillPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        student = get_object_or_404(Student, id=student_id)
        fees    = Fee.objects.filter(student=student).order_by("term")

        buffer = BytesIO()
        pdf    = SimpleDocTemplate(
            buffer,
            pagesize=A5,
            leftMargin=12 * mm,
            rightMargin=12 * mm,
            topMargin=12 * mm,
            bottomMargin=12 * mm,
        )
        W        = W_A5
        elements = []

        # ── Header ────────────────────────────────────────────────────────
        elements.append(build_school_header(W, "STUDENT FEE BILL"))
        elements.append(Spacer(1, 4 * mm))

        # ── Student info + photo ──────────────────────────────────────────
        class_name = student.school_class.name if student.school_class else "—"

        photo      = load_student_photo(student, size=18 * mm)
        photo_cell = photo if photo else para("", 9)

        def info_row(label, value):
            return [para(label, 8, bold=True, color=BLUE), para(value, 8, color=BLACK)]

        info = Table([
            info_row("Student",      student.full_name),
            info_row("Admission No", student.admission_number),
            info_row("Class",        class_name),
        ], colWidths=[28 * mm, W - 28 * mm - 22 * mm])
        info.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING",   (0, 0), (-1, -1), 5),
            ("LINEBELOW",     (0, 0), (-1, -2), 0.3, colors.HexColor("#e5e7eb")),
        ]))

        photo_wrapper = Table([[photo_cell]], colWidths=[20 * mm])
        photo_wrapper.setStyle(TableStyle([
            ("BOX",           (0, 0), (-1, -1), 1.2, BLUE),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("BACKGROUND",    (0, 0), (-1, -1), LBLUE),
        ]))

        student_card = Table([[info, photo_wrapper]], colWidths=[W - 22 * mm, 22 * mm])
        student_card.setStyle(TableStyle([
            ("BOX",           (0, 0), (-1, -1), 0.6, colors.HexColor("#d1d5db")),
            ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(student_card)
        elements.append(Spacer(1, 5 * mm))

        # ── Per-term fee breakdown ────────────────────────────────────────
        grand_total   = 0.0
        grand_paid    = 0.0
        grand_balance = 0.0

        for fee in fees:
            term_label = TERM_LABELS.get(fee.term, fee.term)
            balance    = float(fee.balance)
            bal_color  = GREEN if balance <= 0 else RED

            elements.append(para(term_label, 9, bold=True, color=BLUE))
            elements.append(Spacer(1, 1 * mm))

            rows = [
                [para("Item", 8, bold=True, color=BLUE), para("Amount (GHS)", 8, bold=True, color=BLUE, align=TA_RIGHT)],
                [para("School Fees", 8), para(f"{float(fee.amount):,.2f}", 8, align=TA_RIGHT)],
            ]
            if float(fee.book_user_fee) > 0:
                rows.append([para("Book User Fee", 8), para(f"{float(fee.book_user_fee):,.2f}", 8, align=TA_RIGHT)])
            if float(fee.workbook_fee) > 0:
                rows.append([para("Workbook Fee",  8), para(f"{float(fee.workbook_fee):,.2f}",  8, align=TA_RIGHT)])
            if float(fee.arrears) > 0:
                rows.append([para("Arrears", 8, color=RED), para(f"{float(fee.arrears):,.2f}", 8, color=RED, align=TA_RIGHT)])

            rows.append([para("", 2), para("", 2)])
            rows.append([
                para("Total Due", 8, bold=True, color=BLACK),
                para(f"{float(fee.total_amount):,.2f}", 8, bold=True, color=BLACK, align=TA_RIGHT),
            ])
            rows.append([
                para("Amount Paid", 8, bold=True, color=GREEN),
                para(f"{float(fee.amount_paid):,.2f}", 8, bold=True, color=GREEN, align=TA_RIGHT),
            ])
            rows.append([
                para("Balance", 8, bold=True, color=bal_color),
                para(f"{balance:,.2f}", 8, bold=True, color=bal_color, align=TA_RIGHT),
            ])

            divider = len(rows) - 4
            tbl = Table(rows, colWidths=[W - 36 * mm, 36 * mm])
            tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0),  (-1, 0),           LBLUE),
                ("ROWBACKGROUNDS",(0, 1),  (-1, divider - 1), [WHITE, colors.HexColor("#f9fafb")]),
                ("LINEABOVE",     (0, divider + 1), (-1, divider + 1), 0.6, BLUE),
                ("BACKGROUND",    (0, -1), (-1, -1),           LGREEN if balance <= 0 else LRED),
                ("TOPPADDING",    (0, 0),  (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0),  (-1, -1), 3),
                ("LEFTPADDING",   (0, 0),  (-1, -1), 6),
                ("RIGHTPADDING",  (0, 0),  (-1, -1), 6),
                ("BOX",           (0, 0),  (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("GRID",          (0, 0),  (-1, divider - 1), 0.3, colors.HexColor("#e5e7eb")),
            ]))
            elements.append(tbl)
            elements.append(Spacer(1, 4 * mm))

            grand_total   += float(fee.total_amount)
            grand_paid    += float(fee.amount_paid)
            grand_balance += balance

        # ── Grand summary ─────────────────────────────────────────────────
        elements.append(HRFlowable(width="100%", thickness=0.5, color=BLUE))
        elements.append(Spacer(1, 2 * mm))

        gb_color = GREEN if grand_balance <= 0 else RED
        summary_rows = [
            [para("SUMMARY", 9, bold=True, color=BLUE), para("GHS", 9, bold=True, color=BLUE, align=TA_RIGHT)],
            [para("Total Fees (All Terms)", 8), para(f"{grand_total:,.2f}", 8, align=TA_RIGHT)],
            [para("Total Paid",             8, color=GREEN), para(f"{grand_paid:,.2f}",    8, color=GREEN, align=TA_RIGHT)],
            [para("Total Outstanding",      8, bold=True, color=gb_color), para(f"{grand_balance:,.2f}", 8, bold=True, color=gb_color, align=TA_RIGHT)],
        ]

        summary_tbl = Table(summary_rows, colWidths=[W - 36 * mm, 36 * mm])
        summary_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  LBLUE),
            ("BACKGROUND",    (0, -1),(-1, -1), LGREEN if grand_balance <= 0 else LRED),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("BOX",           (0, 0), (-1, -1), 0.8, BLUE),
            ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
        ]))
        elements.append(summary_tbl)
        elements.append(Spacer(1, 4 * mm))

        # ── Footer ────────────────────────────────────────────────────────
        elements.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#e5e7eb")))
        elements.append(Spacer(1, 2 * mm))
        elements.append(para("This is an official fee statement. — Leading Stars Academy", 7, color=LGRAY, align=TA_CENTER))

        pdf.build(elements)
        pdf_data = buffer.getvalue()
        buffer.close()

        name_slug = student.full_name.strip().replace(" ", "_")
        if not name_slug:
            name_slug = student.admission_number
        safe_name = re.sub(r'[^A-Za-z0-9_-]+', '_', name_slug).strip("_")
        filename  = f"fee_bill_{safe_name}.pdf"

        response = HttpResponse(pdf_data, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="{filename}"; filename*=UTF-8\'\'{quote(filename)}'
        )
        return response


# ---------------------------------------------------------------------------
# Class Fee Bill  —  all students in a class with their fee status
# ---------------------------------------------------------------------------

class ClassFeeBillPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        class_id = request.query_params.get("class_id")
        term     = request.query_params.get("term")        # optional filter

        school_class = get_object_or_404(Class, id=class_id)
        students     = Student.objects.filter(school_class=school_class).order_by("full_name")

        buffer = BytesIO()
        pdf    = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=12 * mm,
            rightMargin=12 * mm,
            topMargin=12 * mm,
            bottomMargin=12 * mm,
        )
        W        = W_A4
        elements = []

        # ── Header ────────────────────────────────────────────────────────
        term_label = TERM_LABELS.get(term, "All Terms") if term else "All Terms"
        elements.append(build_school_header(W, "CLASS FEE STATUS REPORT"))
        elements.append(Spacer(1, 4 * mm))

        # ── Report meta ───────────────────────────────────────────────────
        meta = Table([[
            para(f"Class: {school_class.name}", 9, bold=True, color=BLUE),
            para(f"Term: {term_label}", 9, color=DGRAY, align=TA_RIGHT),
        ]], colWidths=[W / 2, W / 2])
        meta.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(meta)
        elements.append(Spacer(1, 3 * mm))

        # ── Student fee status table ──────────────────────────────────────
        col_no     = 10 * mm
        col_name   = 55 * mm
        col_adm    = 30 * mm
        col_total  = 28 * mm
        col_paid   = 28 * mm
        col_bal    = 28 * mm
        col_status = 22 * mm

        header_row = [
            para("#",          8, bold=True, color=BLUE, align=TA_CENTER),
            para("Student",    8, bold=True, color=BLUE),
            para("Adm. No",    8, bold=True, color=BLUE),
            para("Total (GHS)",8, bold=True, color=BLUE, align=TA_RIGHT),
            para("Paid (GHS)", 8, bold=True, color=BLUE, align=TA_RIGHT),
            para("Bal. (GHS)", 8, bold=True, color=BLUE, align=TA_RIGHT),
            para("Status",     8, bold=True, color=BLUE, align=TA_CENTER),
        ]

        rows       = [header_row]
        grand_total   = 0.0
        grand_paid    = 0.0
        grand_balance = 0.0

        for idx, student in enumerate(students, start=1):
            fee_qs = Fee.objects.filter(student=student)
            if term:
                fee_qs = fee_qs.filter(term=term)

            total   = sum(float(f.total_amount) for f in fee_qs)
            paid    = sum(float(f.amount_paid)  for f in fee_qs)
            balance = total - paid

            grand_total   += total
            grand_paid    += paid
            grand_balance += balance

            if balance <= 0:
                status_text  = "PAID"
                status_color = GREEN
            elif paid > 0:
                status_text  = "PARTIAL"
                status_color = AMBER
            else:
                status_text  = "UNPAID"
                status_color = RED

            rows.append([
                para(str(idx),                      8, align=TA_CENTER),
                para(student.full_name,              8),
                para(student.admission_number,       8),
                para(f"{total:,.2f}",                8, align=TA_RIGHT),
                para(f"{paid:,.2f}",                 8, color=GREEN, align=TA_RIGHT),
                para(f"{balance:,.2f}",              8, color=status_color, align=TA_RIGHT),
                para(status_text, 7, bold=True, color=status_color, align=TA_CENTER),
            ])

        # ── Totals row ────────────────────────────────────────────────────
        gb_color = GREEN if grand_balance <= 0 else RED
        rows.append([
            para("", 8),
            para("TOTALS", 8, bold=True, color=BLACK),
            para("", 8),
            para(f"{grand_total:,.2f}",   8, bold=True, color=BLACK, align=TA_RIGHT),
            para(f"{grand_paid:,.2f}",    8, bold=True, color=GREEN, align=TA_RIGHT),
            para(f"{grand_balance:,.2f}", 8, bold=True, color=gb_color, align=TA_RIGHT),
            para("", 8),
        ])

        tbl = Table(rows, colWidths=[col_no, col_name, col_adm, col_total, col_paid, col_bal, col_status])

        row_styles = [
            ("BACKGROUND",    (0, 0),  (-1, 0),  LBLUE),
            ("BACKGROUND",    (0, -1), (-1, -1), colors.HexColor("#f0fdf4") if grand_balance <= 0 else LRED),
            ("LINEABOVE",     (0, -1), (-1, -1), 0.8, BLUE),
            ("ROWBACKGROUNDS",(0, 1),  (-1, -2), [WHITE, colors.HexColor("#f9fafb")]),
            ("TOPPADDING",    (0, 0),  (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0),  (-1, -1), 4),
            ("LEFTPADDING",   (0, 0),  (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0),  (-1, -1), 4),
            ("BOX",           (0, 0),  (-1, -1), 0.6, colors.HexColor("#d1d5db")),
            ("GRID",          (0, 0),  (-1, -2), 0.3, colors.HexColor("#e5e7eb")),
            ("VALIGN",        (0, 0),  (-1, -1), "MIDDLE"),
        ]
        tbl.setStyle(TableStyle(row_styles))
        elements.append(tbl)
        elements.append(Spacer(1, 5 * mm))

        # ── Footer ────────────────────────────────────────────────────────
        elements.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#e5e7eb")))
        elements.append(Spacer(1, 2 * mm))
        elements.append(para(
            f"Total students: {len(students)}  •  Generated by Leading Stars Academy",
            7, color=LGRAY, align=TA_CENTER,
        ))

        pdf.build(elements)
        pdf_data = buffer.getvalue()
        buffer.close()

        safe_class = re.sub(r'[^A-Za-z0-9_-]+', '_', school_class.name).strip("_")
        filename   = f"class_fee_bill_{safe_class}_{term or 'all'}.pdf"

        response = HttpResponse(pdf_data, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="{filename}"; filename*=UTF-8\'\'{quote(filename)}'
        )
        return response
