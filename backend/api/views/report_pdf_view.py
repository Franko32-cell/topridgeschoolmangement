"""
api/views/report_pdf_view.py
GET /api/report/student/<id>/pdf/?term=term1&year=2026
Generates a PDF report card that matches the Top Ridge School printed format.
"""

from io import BytesIO
import os
from urllib.parse import quote
import re

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.utils import timezone

from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable, Image, KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from PIL import Image as PilImage, ImageOps

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

import requests as http_requests

from apps.students.models import Student
from apps.results.models import Result, Report


# ---------------------------------------------------------------------------
# Brand colours
# ---------------------------------------------------------------------------
GREEN    = colors.HexColor("#16a34a")
DGREEN   = colors.HexColor("#15803d")
LGREEN   = colors.HexColor("#dcfce7")
DGRAY    = colors.HexColor("#374151")
LGRAY    = colors.HexColor("#9ca3af")
WHITE    = colors.white
RED      = colors.HexColor("#dc2626")
BLACK    = colors.HexColor("#111827")
OFFWHITE = colors.HexColor("#f9fafb")
BORDER   = colors.HexColor("#d1d5db")
ROW_ALT  = colors.HexColor("#f0fdf4")
GOLD     = colors.HexColor("#ca8a04")

TERM_LABELS = {"term1": "Term 1", "term2": "Term 2", "term3": "Term 3"}

# ✅ UPDATED: point to the new uploaded logo
LOGO_PATH = os.path.join(settings.BASE_DIR, "static", "images", "logo1.jpg")

# A4 with 15mm margins
PAGE_W = A4[0] - 30 * mm


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
        leading=size + 3,
        spaceAfter=0,
    ))


def get_grade_b79(score):
    if score >= 90: return "1", "Excellent"
    if score >= 80: return "2", "Very Good"
    if score >= 70: return "3", "Good"
    if score >= 60: return "4", "High Average"
    if score >= 55: return "5", "Average"
    if score >= 50: return "6", "Low Average"
    if score >= 45: return "7", "Low"
    if score >= 40: return "6", "Lower"
    return "9", "Lowest"


def get_grade_b16(score):
    if score >= 90: return "A",  "Excellent"
    if score >= 80: return "B1", "Very Good"
    if score >= 70: return "B2", "Good"
    if score >= 60: return "C1", "High Average"
    if score >= 55: return "C2", "Average"
    if score >= 50: return "D1", "Low Average"
    if score >= 45: return "D2", "Low"
    if score >= 40: return "E1", "Lower"
    return "E2", "Lowest"


def class_level(school_class):
    if not school_class:
        return "basic_1_6"
    name = school_class.name.lower()
    for marker in ("basic 7", "basic 8", "basic 9", "b7", "b8", "b9"):
        if marker in name:
            return "basic_7_9"
    return "basic_1_6"


def ordinal(n):
    if n is None:
        return "—"
    n = int(n)
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(
        n % 10 if n % 100 not in (11, 12, 13) else 0, "th"
    )
    return f"{n}{suffix}"


# ---------------------------------------------------------------------------
# Image loaders
# ---------------------------------------------------------------------------

def load_logo():
    try:
        if os.path.exists(LOGO_PATH):
            return Image(LOGO_PATH, width=20 * mm, height=20 * mm)
    except Exception:
        pass
    return None


def load_student_photo(student, size=24 * mm):
    try:
        if not student.photo:
            return None
        photo_url = student.photo.url
        if not photo_url.startswith("http"):
            path = os.path.join(settings.MEDIA_ROOT, str(student.photo))
            if not os.path.exists(path):
                return None
            with open(path, "rb") as f:
                img_bytes = BytesIO(f.read())
        else:
            resp = http_requests.get(photo_url, timeout=5, stream=True)
            resp.raise_for_status()
            img_bytes = BytesIO()
            for chunk in resp.iter_content(chunk_size=8192):
                img_bytes.write(chunk)
            img_bytes.seek(0)

        pil_img = PilImage.open(img_bytes)
        pil_img = ImageOps.exif_transpose(pil_img)
        px = int(size * 3.78)
        pil_img.thumbnail((px, px), PilImage.LANCZOS)
        if pil_img.mode in ("RGBA", "P", "CMYK", "LA", "L"):
            pil_img = pil_img.convert("RGB")
        out = BytesIO()
        pil_img.save(out, format="JPEG", quality=80, optimize=True)
        out.seek(0)
        pil_img.close()
        return Image(out, width=size, height=size)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Grade colour helper for PDF cells
# ---------------------------------------------------------------------------

def grade_color(grade):
    """Return (text_color, bg_color) for a grade string."""
    mapping = {
        "1":  (colors.HexColor("#166534"), colors.HexColor("#dcfce7")),
        "A":  (colors.HexColor("#166534"), colors.HexColor("#dcfce7")),
        "2":  (colors.HexColor("#065f46"), colors.HexColor("#d1fae5")),
        "B1": (colors.HexColor("#065f46"), colors.HexColor("#d1fae5")),
        "3":  (colors.HexColor("#0369a1"), colors.HexColor("#e0f2fe")),
        "B2": (colors.HexColor("#0369a1"), colors.HexColor("#e0f2fe")),
        "4":  (colors.HexColor("#1e40af"), colors.HexColor("#dbeafe")),
        "C1": (colors.HexColor("#1e40af"), colors.HexColor("#dbeafe")),
        "5":  (colors.HexColor("#92400e"), colors.HexColor("#fef3c7")),
        "C2": (colors.HexColor("#92400e"), colors.HexColor("#fef3c7")),
        "6":  (colors.HexColor("#9a3412"), colors.HexColor("#ffedd5")),
        "D1": (colors.HexColor("#9a3412"), colors.HexColor("#ffedd5")),
        "7":  (colors.HexColor("#991b1b"), colors.HexColor("#fee2e2")),
        "D2": (colors.HexColor("#991b1b"), colors.HexColor("#fee2e2")),
        "9":  (colors.HexColor("#7f1d1d"), colors.HexColor("#fecaca")),
        "E1": (colors.HexColor("#7f1d1d"), colors.HexColor("#fecaca")),
        "E2": (colors.HexColor("#7f1d1d"), colors.HexColor("#fecaca")),
    }
    return mapping.get(grade, (DGRAY, WHITE))


# ---------------------------------------------------------------------------
# PDF View
# ---------------------------------------------------------------------------

class StudentReportPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        student = get_object_or_404(Student, id=student_id)
        term    = request.query_params.get("term", "term1")
        year    = int(request.query_params.get("year", timezone.now().year))

        results = (
            Result.objects
            .filter(student=student, term=term, year=year)
            .select_related("subject")
            .order_by("subject__name")
        )

        if not results.exists():
            return HttpResponse("No results found for this student and term.", status=404)

        report_obj, _ = Report.objects.get_or_create(
            student=student, term=term, year=year,
        )

        school_class  = student.school_class
        level         = class_level(school_class)
        grade_fn      = get_grade_b79 if level == "basic_7_9" else get_grade_b16
        show_position = level == "basic_7_9"

        # ── Attendance ────────────────────────────────────────────────────────
        try:
            from apps.attendance.models import Attendance
            att_qs      = Attendance.objects.filter(student=student, term=term, year=year)
            att_total   = att_qs.count()
            att_present = att_qs.filter(status="present").count()
        except Exception:
            att_total   = report_obj.attendance_total
            att_present = report_obj.attendance

        # ── Number on roll ────────────────────────────────────────────────────
        number_on_roll = (
            Result.objects
            .filter(term=term, year=year, student__school_class=school_class)
            .values("student").distinct().count()
        )

        # ── Scores ────────────────────────────────────────────────────────────
        subjects_data = []
        total_score   = 0
        for r in results:
            grade, remark = grade_fn(r.score)
            subjects_data.append({
                "subject":          r.subject.name,
                "ca":               r.ca,
                "reopen":           r.reopen,
                "exams":            r.exams,
                "score":            r.score,
                "grade":            grade,
                "remark":           remark,
                "subject_position": r.subject_position,
            })
            total_score += r.score

        subject_count = len(subjects_data)
        average_score = round(total_score / subject_count, 2) if subject_count else 0

        # ── Overall position ──────────────────────────────────────────────────
        position = None
        if show_position:
            from django.db.models import Sum as DSum
            peer_scores = (
                Result.objects
                .filter(term=term, year=year, student__school_class=school_class)
                .values("student")
                .annotate(total=DSum("score"))
                .order_by("-total")
            )
            for rank, row in enumerate(peer_scores, start=1):
                if row["student"] == student.id:
                    position = rank
                    break

        # ── Dates ─────────────────────────────────────────────────────────────
        vacation_date   = report_obj.vacation_date.strftime("%-d %B, %Y").upper()   if report_obj.vacation_date   else "—"
        resumption_date = report_obj.resumption_date.strftime("%-d %B, %Y").upper() if report_obj.resumption_date else "—"

        # ── Overall grade ─────────────────────────────────────────────────────
        overall_grade, _ = grade_fn(average_score)

        # ── Build PDF ─────────────────────────────────────────────────────────
        buffer = BytesIO()
        pdf = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=15 * mm,
            rightMargin=15 * mm,
            topMargin=12 * mm,
            bottomMargin=12 * mm,
        )
        elements = []

        # ── HEADER ────────────────────────────────────────────────────────────
        logo       = load_logo()
        logo_cell  = logo if logo else para("", 9)
        photo      = load_student_photo(student, size=24 * mm)
        photo_cell = photo if photo else para("", 9)

        school_block = [
            para("TOP RIDGE SCHOOL",      16, bold=True, color=DGREEN,  align=TA_CENTER),
            para("CENTRE OF DISTINCTION",  9, bold=True, color=GREEN,   align=TA_CENTER),
            Spacer(1, 1 * mm),
            para("P.O BOX OD 292, Odorkor-Accra", 8, color=DGRAY,      align=TA_CENTER),
            para("Location: Sanat-Maria Off the Kwashieman Motor way Highway. TEL: 027-1591-079",
                 7, color=LGRAY, align=TA_CENTER),
            Spacer(1, 2 * mm),
            para("STUDENTS TERMINAL REPORT", 11, bold=True, color=BLACK, align=TA_CENTER),
        ]

        header = Table(
            [[logo_cell, school_block, photo_cell]],
            colWidths=[24 * mm, PAGE_W - 50 * mm, 26 * mm],
        )
        header.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",         (2, 0), (2,  0),  "RIGHT"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LINEBELOW",     (0, 0), (-1, -1), 1.5, DGREEN),
        ]))
        elements.append(header)
        elements.append(Spacer(1, 4 * mm))

        # ── STUDENT INFO BLOCK ────────────────────────────────────────────────
        class_name   = school_class.name if school_class else "—"
        term_label   = TERM_LABELS.get(term, term)
        overall_tc, overall_bc = grade_color(overall_grade)

        info_rows = [
            [
                para("Name :", 8, bold=True, color=DGREEN),
                para(student.full_name.upper(), 9, bold=True, color=BLACK),
                para("Number on roll", 8, bold=True, color=DGREEN),
                para(str(number_on_roll), 8, color=BLACK),
            ],
            [
                para("Basic :", 8, bold=True, color=DGREEN),
                para(class_name, 8, color=BLACK),
                para("Total Score :", 8, bold=True, color=DGREEN),
                para(f"{total_score:.2f}", 8, bold=True, color=BLACK),
            ],
            [
                para("Average Score", 8, bold=True, color=RED),
                para(f"{average_score:.2f}", 8, bold=True, color=RED),
                para("TOTAL:", 8, bold=True, color=BLACK),
                para(f"{total_score:.2f}    School Re-opens On: {resumption_date}", 8, color=BLACK),
            ],
            [
                para("School Vacates On:", 8, bold=True, color=BLACK),
                para(vacation_date, 8, color=BLACK),
                para("Term :", 8, bold=True, color=DGREEN),
                para(term_label.upper(), 8, bold=True, color=BLACK),
            ],
        ]

        info_tbl = Table(info_rows, colWidths=[
            32 * mm, PAGE_W / 2 - 32 * mm,
            32 * mm, PAGE_W / 2 - 32 * mm,
        ])
        info_tbl.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("LINEBELOW",     (0, -1), (-1, -1), 1, DGREEN),
        ]))
        elements.append(info_tbl)
        elements.append(Spacer(1, 4 * mm))

        # ── SUBJECT TABLE ─────────────────────────────────────────────────────
        col_subject  = 52 * mm
        col_ca       = 18 * mm
        col_reopen   = 22 * mm
        col_exams    = 20 * mm
        col_total    = 18 * mm
        col_grade    = 14 * mm
        col_position = 18 * mm if show_position else 0
        col_remark   = PAGE_W - col_subject - col_ca - col_reopen - col_exams - col_total - col_grade - col_position

        header_row = [
            para("SUBJECT",                     7, bold=True, color=WHITE, align=TA_CENTER),
            para("CLASS\nSC.\n(40%)",           7, bold=True, color=WHITE, align=TA_CENTER),
            para("READING\nAND REOPEN\n.(20%)", 7, bold=True, color=WHITE, align=TA_CENTER),
            para("EXAMS\nSCORE\n(40%)",         7, bold=True, color=WHITE, align=TA_CENTER),
            para("TOTAL\n(100%)",               7, bold=True, color=WHITE, align=TA_CENTER),
            para("GRADE",                       7, bold=True, color=WHITE, align=TA_CENTER),
        ]
        if show_position:
            header_row.append(para("POSITION", 7, bold=True, color=WHITE, align=TA_CENTER))
        header_row.append(para("REMARK", 7, bold=True, color=WHITE, align=TA_CENTER))

        col_widths = [col_subject, col_ca, col_reopen, col_exams, col_total, col_grade]
        if show_position:
            col_widths.append(col_position)
        col_widths.append(col_remark)

        rows = [header_row]

        for i, s in enumerate(subjects_data):
            gc_text, gc_bg = grade_color(s["grade"])
            row = [
                para(s["subject"],       8, bold=True, color=BLACK),
                para(f"{s['ca']}",       8,            color=DGRAY,   align=TA_CENTER),
                para(f"{s['reopen']}",   8,            color=DGRAY,   align=TA_CENTER),
                para(f"{s['exams']}",    8,            color=DGRAY,   align=TA_CENTER),
                para(f"{s['score']}",    8, bold=True, color=DGREEN,  align=TA_CENTER),
                para(s["grade"],         8, bold=True, color=gc_text, align=TA_CENTER),
            ]
            if show_position:
                pos = s["subject_position"]
                row.append(para(str(pos) if pos else "—", 8, bold=True, color=DGREEN, align=TA_CENTER))
            row.append(para(s["remark"].upper(), 8, bold=True, color=gc_text, align=TA_CENTER))
            rows.append(row)

        # Empty spacer row
        rows.append([para("", 6)] * len(col_widths))

        subj_tbl = Table(rows, colWidths=col_widths, repeatRows=1)

        tbl_style = [
            # Header
            ("BACKGROUND",    (0, 0), (-1, 0),  DGREEN),
            ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 3),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
            # Subject column left-align
            ("ALIGN",         (0, 1), (0, -1),  "LEFT"),
            # Alternating rows
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [WHITE, ROW_ALT]),
            # Grid
            ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
            ("LINEBELOW",     (0, 0), (-1, 0),  1.0, DGREEN),
            ("BOX",           (0, 0), (-1, -1), 1.0, DGREEN),
        ]

        # Colour grade cells per row
        for i, s in enumerate(subjects_data, start=1):
            _, gc_bg = grade_color(s["grade"])
            grade_col = 5
            subj_tbl.setStyle(TableStyle([("BACKGROUND", (grade_col, i), (grade_col, i), gc_bg)]))

        subj_tbl.setStyle(TableStyle(tbl_style))
        elements.append(subj_tbl)
        elements.append(Spacer(1, 4 * mm))

        # ── ATTENDANCE + REMARKS ──────────────────────────────────────────────
        att_text = f"{att_present}   OUT OF:   {att_total}"

        remarks_rows = [
            [
                para("TOTAL ATTENDANCE :", 8, bold=True, color=BLACK),
                para(att_text, 8, bold=True, color=DGREEN),
                para("PROMOTED TO :", 8, bold=True, color=BLACK),
                para(report_obj.promoted_to or "", 8, color=BLACK),
            ],
            [
                para("CLASS TEACHER\nREMARKS:", 8, bold=True, color=BLACK),
                para(report_obj.teacher_remark.upper() if report_obj.teacher_remark else "", 8, bold=True, color=BLACK),
                para("", 8),
                para("", 8),
            ],
            [
                para("ATTITUDE :", 8, bold=True, color=BLACK),
                para(report_obj.attitude.upper() if report_obj.attitude else "", 8, color=BLACK),
                para("", 8),
                para("", 8),
            ],
            [
                para("CONDUCT:", 8, bold=True, color=BLACK),
                para(report_obj.conduct.upper() if report_obj.conduct else "", 8, color=BLACK),
                para("TEACHER'S SIGNATURE", 8, bold=True, color=BLACK),
                para("", 8),
            ],
            [
                para("INTEREST:", 8, bold=True, color=BLACK),
                para(report_obj.interest.upper() if report_obj.interest else "", 8, color=BLACK),
                para("", 8),
                para("", 8),
            ],
        ]

        remarks_tbl = Table(remarks_rows, colWidths=[
            36 * mm, PAGE_W / 2 - 36 * mm,
            36 * mm, PAGE_W / 2 - 36 * mm,
        ])
        remarks_tbl.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("LINEBELOW",     (0, 0), (-1, -2), 0.3, colors.HexColor("#e5e7eb")),
            ("BOX",           (0, 0), (-1, -1), 0.6, BORDER),
            ("BACKGROUND",    (0, 0), (-1, -1), OFFWHITE),
            # Underline signature area
            ("LINEBELOW",     (3, 3), (3, 3), 0.8, BLACK),
            # Underline interest area
            ("LINEBELOW",     (1, 4), (1, 4), 0.8, BLACK),
        ]))
        elements.append(remarks_tbl)
        elements.append(Spacer(1, 5 * mm))

        # ── GRADING KEY ───────────────────────────────────────────────────────
        elements.append(HRFlowable(width="100%", thickness=0.5, color=DGREEN))
        elements.append(Spacer(1, 2 * mm))
        elements.append(para("GRADING", 8, bold=True, color=DGREEN))
        elements.append(Spacer(1, 1 * mm))

        if level == "basic_7_9":
            grade_text = (
                "90 – 100  1  Excellent,  80 – 89  2  V. Good,  70 – 79  3  Good,  "
                "60 – 69  4  High Average,  55 – 59  5  Average,  50 – 54  6  Low Average,  "
                "45 – 49  7  Low,  40 – 44  6  Lower,  0 – 39  9  Lowest"
            )
        else:
            grade_text = (
                "90 – 100  A  Excellent,  80 – 89  B1  V. Good,  70 – 79  B2  Good,  "
                "60 – 69  C1  High Average,  55 – 59  C2  Average,  50 – 54  D1  Low Average,  "
                "45 – 49  D2  Low,  40 – 44  E1  Lower,  0 – 39  E2  Lowest"
            )

        elements.append(para(grade_text, 7, color=RED, align=TA_CENTER))
        elements.append(Spacer(1, 3 * mm))

        # ── Footer ────────────────────────────────────────────────────────────
        elements.append(HRFlowable(width="100%", thickness=0.3, color=LGRAY))
        elements.append(Spacer(1, 1 * mm))
        elements.append(para(
            "This is an official report card of Top Ridge School — Centre of Distinction.",
            7, color=LGRAY, align=TA_CENTER,
        ))

        # ── Build ─────────────────────────────────────────────────────────────
        pdf.build(elements)
        pdf_data = buffer.getvalue()
        buffer.close()

        # ── Filename ──────────────────────────────────────────────────────────
        safe = re.sub(r"[^A-Za-z0-9_-]+", "_", student.full_name.strip()).strip("_")
        filename = f"report_{safe}_{term}_{year}.pdf"

        response = HttpResponse(pdf_data, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="{filename}"; filename*=UTF-8\'\'{quote(filename)}'
        )
        return response
