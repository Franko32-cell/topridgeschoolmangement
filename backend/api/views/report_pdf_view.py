from io import BytesIO
from urllib.parse import quote
import re
import os

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.conf import settings

from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle,
    Paragraph, Spacer, HRFlowable, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from PIL import Image as PilImage, ImageOps

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

import requests

from apps.students.models import Student
from apps.results.models import Result, Report
from apps.attendance.models import Attendance


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TERM_LABELS = {"term1": "Term 1", "term2": "Term 2", "term3": "Term 3"}

# ── School info ──────────────────────────────────────────────────────────────
SCHOOL_NAME     = "TOP RIDGE SCHOOL"
SCHOOL_MOTTO    = "CENTRE OF DISTINCTION"
SCHOOL_ADDRESS  = "P.O BOX OD 292, Odorkor-Accra"
SCHOOL_LOCATION = "Sanat-Maria Off the Kwashieman Motor way Highway."
SCHOOL_TEL      = "TEL: 027-1591-079"

LOGO_PATH = os.path.join(settings.BASE_DIR, "static", "images", "logo.jpeg")

# ── Colours ──────────────────────────────────────────────────────────────────
DARKGREEN  = colors.HexColor("#1a4731")   # deep green — header bg
GREEN2     = colors.HexColor("#16a34a")   # accent green
LGREEN     = colors.HexColor("#dcfce7")
GOLD       = colors.HexColor("#b45309")
GOLD2      = colors.HexColor("#fef3c7")
RED        = colors.HexColor("#dc2626")
LRED       = colors.HexColor("#fee2e2")
BLUE2      = colors.HexColor("#1d4ed8")
LBLUE      = colors.HexColor("#dbeafe")
WHITE      = colors.white
BLACK      = colors.HexColor("#111827")
DGRAY      = colors.HexColor("#374151")
LGRAY      = colors.HexColor("#9ca3af")
GRAY       = colors.HexColor("#f8fafc")
MGRAY      = colors.HexColor("#f1f5f9")
DIVIDER    = colors.HexColor("#e2e8f0")
ACCENT     = colors.HexColor("#0369a1")


# ---------------------------------------------------------------------------
# Grading systems — matched exactly to Top Ridge report cards
# ---------------------------------------------------------------------------

# Basic 7–9: numeric grades 1–9
GRADE_THRESHOLDS_B79 = [
    (90, "1", "EXCELLENT"),
    (80, "2", "VERY GOOD"),
    (70, "3", "GOOD"),
    (60, "4", "HIGH AVERAGE"),
    (55, "5", "AVERAGE"),
    (50, "6", "LOW AVERAGE"),
    (45, "7", "LOW"),
    (40, "6", "LOWER"),
    (0,  "9", "LOWEST"),
]

# Basic 1–6 and KG: letter grades A, B1, B2, C1, C2, D1, D2, E1, E2
GRADE_THRESHOLDS_B16 = [
    (90, "A",  "EXCELLENT"),
    (80, "B1", "VERY GOOD"),
    (70, "B2", "GOOD"),
    (60, "C1", "HIGH AVERAGE"),
    (55, "C2", "AVERAGE"),
    (50, "D1", "LOW AVERAGE"),
    (45, "D2", "LOW"),
    (40, "E1", "LOWER"),
    (0,  "E2", "LOWEST"),
]

GRADE_THRESHOLDS_NKG = GRADE_THRESHOLDS_B16

# Interpretation rows for report footer
INTERP_ROWS_B79 = [
    ("90–100: 1 – EXCELLENT",    "60–69: 4 – HIGH AVERAGE", "40–44: 6 – LOWER"  ),
    ("80–89: 2 – VERY GOOD",     "55–59: 5 – AVERAGE",      "0–39: 9 – LOWEST"  ),
    ("70–79: 3 – GOOD",          "50–54: 6 – LOW AVERAGE",  "45–49: 7 – LOW"    ),
]

INTERP_ROWS_B16 = [
    ("90–100: A  – EXCELLENT",   "60–69: C1 – HIGH AVERAGE", "40–44: E1 – LOWER" ),
    ("80–89: B1 – VERY GOOD",    "55–59: C2 – AVERAGE",      "0–39:  E2 – LOWEST"),
    ("70–79: B2 – GOOD",         "50–54: D1 – LOW AVERAGE",  "45–49: D2 – LOW"   ),
]


def get_thresholds(level: str) -> list:
    if level in ("basic_1_6", "nursery_kg"):
        return GRADE_THRESHOLDS_B16
    return GRADE_THRESHOLDS_B79


def get_grade_and_remark(score: float, thresholds: list) -> tuple:
    for threshold, grade, remark in thresholds:
        if score >= threshold:
            return grade, remark
    return thresholds[-1][1], thresholds[-1][2]


def get_overall_grade(avg: float, thresholds: list) -> str:
    return get_grade_and_remark(avg, thresholds)[0]


def fmt_pos(n):
    if n is None:
        return "-"
    suffix = (
        "th" if 10 <= n % 100 <= 20
        else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    )
    return f"{n}{suffix}"


def fmt_date(date_val):
    if not date_val:
        return "-"
    try:
        from datetime import date as date_type
        import datetime
        if isinstance(date_val, str):
            date_val = datetime.date.fromisoformat(date_val)
        day = date_val.day
        suffix = (
            "th" if 10 <= day % 100 <= 20
            else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
        )
        return f"{day}{suffix} {date_val.strftime('%B')} {date_val.year}"
    except Exception:
        return str(date_val)


# ---------------------------------------------------------------------------
# Image loading
# ---------------------------------------------------------------------------

def load_image_flowable(path_or_url, width, height):
    try:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            resp = requests.get(path_or_url, timeout=10, stream=True)
            resp.raise_for_status()
            img_bytes = BytesIO()
            for chunk in resp.iter_content(chunk_size=8192):
                img_bytes.write(chunk)
            img_bytes.seek(0)
        elif os.path.exists(path_or_url):
            with open(path_or_url, "rb") as f:
                img_bytes = BytesIO(f.read())
        else:
            return None

        pil_img = PilImage.open(img_bytes)
        pil_img = ImageOps.exif_transpose(pil_img)

        target_w = int(width * 3.78)
        target_h = int(height * 3.78)
        pil_img.thumbnail((target_w, target_h), PilImage.LANCZOS)

        if pil_img.mode in ("RGBA", "P", "CMYK", "LA", "L"):
            pil_img = pil_img.convert("RGB")

        corrected = BytesIO()
        pil_img.save(corrected, format="JPEG", quality=75, optimize=True)
        corrected.seek(0)
        pil_img.close()

        return Image(corrected, width=width, height=height)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_para(styles):
    def para(text, size=9, bold=False, color=DGRAY, align=TA_LEFT):
        return Paragraph(str(text), ParagraphStyle(
            "p", parent=styles["Normal"],
            fontSize=size,
            fontName="Helvetica-Bold" if bold else "Helvetica",
            textColor=color,
            alignment=align,
            leading=size + 3,
        ))
    return para


def section_label_row(para, text, col_width):
    tbl = Table([[para(f"  {text}", 7, bold=True, color=WHITE)]], colWidths=[col_width])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), DARKGREEN),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return tbl


# ---------------------------------------------------------------------------
# PDF View
# ---------------------------------------------------------------------------

class StudentReportPDFView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        term = request.query_params.get("term")
        if not term:
            from rest_framework.response import Response
            return Response({"error": "term is required"}, status=400)

        student = get_object_or_404(Student, id=student_id)
        results = Result.objects.filter(student=student, term=term).select_related("subject")
        report  = Report.objects.filter(student=student, term=term).first()

        level         = getattr(student.school_class, "level", "basic_7_9") if student.school_class else "basic_7_9"
        thresholds    = get_thresholds(level)
        show_position = level != "nursery_kg"
        interp_rows   = INTERP_ROWS_B79 if level == "basic_7_9" else INTERP_ROWS_B16

        term_attendance = Attendance.objects.filter(student=student, term=term)
        total_days      = term_attendance.count()
        present_days    = term_attendance.filter(status__in=["present", "late"]).count()
        att_percent     = round((present_days / total_days) * 100) if total_days else 0

        subjects    = []
        total_score = 0

        for r in results:
            score         = r.score or 0
            grade, remark = get_grade_and_remark(score, thresholds)
            subjects.append({
                "name":     r.subject.name,
                "reopen":   r.reopen,
                "ca":       r.ca,
                "exams":    r.exams,
                "score":    score,
                "grade":    grade,
                "remark":   remark,
                "position": r.subject_position if show_position else None,
            })
            total_score += score

        subject_count = len(subjects)
        average       = round(total_score / subject_count, 2) if subject_count else 0
        overall_grade = get_overall_grade(average, thresholds)

        class_students = Student.objects.filter(school_class=student.school_class)
        student_totals = []
        for s in class_students:
            s_res = Result.objects.filter(student=s, term=term)
            student_totals.append({
                "student_id": s.id,
                "total":      sum(r.score or 0 for r in s_res),
            })
        ranked   = sorted(student_totals, key=lambda x: x["total"], reverse=True)
        position = next(
            (i + 1 for i, item in enumerate(ranked) if item["student_id"] == student.id),
            None,
        ) if show_position else None

        number_on_roll  = class_students.count()
        vacation_date   = getattr(report, "vacation_date",   None) if report else None
        resumption_date = getattr(report, "resumption_date", None) if report else None
        promoted_to     = getattr(report, "promoted_to",     None) if report else None
        attitude        = getattr(report, "attitude",        None) if report else None

        # ── Build PDF ──────────────────────────────────────────────────────
        buffer = BytesIO()
        pdf    = SimpleDocTemplate(
            buffer, pagesize=A4,
            leftMargin=12*mm, rightMargin=12*mm,
            topMargin=12*mm, bottomMargin=12*mm,
        )
        styles   = getSampleStyleSheet()
        elements = []
        para     = make_para(styles)

        FULL_W = A4[0] - 24*mm

        # ── Header ────────────────────────────────────────────────────────
        logo_img  = load_image_flowable(LOGO_PATH, width=22*mm, height=22*mm)
        logo_cell = logo_img if logo_img else para("", 9)

        photo_img = None
        if student.photo:
            photo_url = student.photo.url
            if not photo_url.startswith("http"):
                photo_path = os.path.join(settings.MEDIA_ROOT, str(student.photo))
                photo_img  = load_image_flowable(photo_path, width=20*mm, height=22*mm)
            else:
                photo_img = load_image_flowable(photo_url, width=20*mm, height=22*mm)
        photo_cell = photo_img if photo_img else para("", 9)

        school_center = [
            para(SCHOOL_NAME,    16, bold=True,  color=WHITE,                          align=TA_CENTER),
            para(SCHOOL_MOTTO,    8, bold=False, color=colors.HexColor("#86efac"),     align=TA_CENTER),
            Spacer(1, 1.5*mm),
            para(SCHOOL_ADDRESS,  7, bold=False, color=colors.HexColor("#d1fae5"),     align=TA_CENTER),
            para(f"{SCHOOL_LOCATION}  {SCHOOL_TEL}", 6, color=colors.HexColor("#bbf7d0"), align=TA_CENTER),
            Spacer(1, 2*mm),
            para("STUDENTS TERMINAL REPORT", 11, bold=True, color=GOLD,               align=TA_CENTER),
            para(TERM_LABELS.get(term, term),  8, bold=False, color=colors.HexColor("#e0f2fe"), align=TA_CENTER),
        ]

        header_table = Table([[logo_cell, school_center, photo_cell]], colWidths=[25*mm, 136*mm, 25*mm])
        header_table.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",         (0, 0), (0,  0),  "LEFT"),
            ("ALIGN",         (2, 0), (2,  0),  "RIGHT"),
            ("BACKGROUND",    (0, 0), (-1, -1), DARKGREEN),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING",   (0, 0), (0,  0),  6),
            ("RIGHTPADDING",  (2, 0), (2,  0),  6),
        ]))
        elements.append(header_table)

        # Gold accent bar
        accent = Table([[""]], colWidths=[FULL_W])
        accent.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), GOLD),
            ("TOPPADDING",    (0, 0), (-1, -1), 1.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ]))
        elements.append(accent)
        elements.append(Spacer(1, 4*mm))

        # ── Student Info ──────────────────────────────────────────────────
        class_name    = student.school_class.name if student.school_class else "-"
        avg_color     = GREEN2 if average >= 60 else (GOLD if average >= 45 else RED)
        position_text = (
            f"<b>POSITION:</b>  {fmt_pos(position)} out of {len(ranked)}"
            if show_position else "<b>POSITION:</b>  N/A"
        )

        info_rows = [
            [
                para(f"<b>NAME:</b>  {student.full_name}", 9),
                para(f"<b>NUMBER ON ROLL:</b>  {number_on_roll}", 9),
            ],
            [
                para(f"<b>CLASS:</b>  {class_name}", 9),
                para(f"<b>TOTAL SCORE:</b>  {round(total_score, 2)}", 9, color=BLUE2),
            ],
            [
                para(f"<b>TERM:</b>  {TERM_LABELS.get(term, term)}", 9),
                para(f"<b>AVERAGE SCORE:</b>  {average}  |  <b>GRADE:</b>  {overall_grade}", 9, color=avg_color),
            ],
            [
                para(f"<b>ADMISSION NO:</b>  {student.admission_number}", 9),
                para(position_text, 9, color=BLUE2),
            ],
        ]

        # Dates row
        date_row = [
            para(f"<b>SCHOOL VACATES ON:</b>  {fmt_date(vacation_date)}", 9, color=GREEN2),
            para(f"<b>SCHOOL RE-OPENS ON:</b>  {fmt_date(resumption_date)}", 9, color=GREEN2),
        ]
        info_rows.append(date_row)

        info_table = Table(info_rows, colWidths=[93*mm, 93*mm])
        info_table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), GRAY),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("BOX",           (0, 0), (-1, -1), 0.8, DIVIDER),
            ("GRID",          (0, 0), (-1, -1), 0.4, DIVIDER),
            ("ROWBACKGROUNDS",(0, 0), (-1, -1), [WHITE, GRAY]),
            ("LINEBEFORE",    (0, 0), (0, -1),  3, DARKGREEN),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 4*mm))

        # ── Subject Table ─────────────────────────────────────────────────
        elements.append(section_label_row(para, "ACADEMIC PERFORMANCE", FULL_W))
        elements.append(Spacer(1, 1*mm))

        subj_header = [
            para("  SUBJECT",          8, bold=True, color=WHITE),
            para("CLASS SC.\n(40%)",   7, bold=True, color=WHITE, align=TA_CENTER),
            para("READING &\nRE-OPEN\n(20%)", 7, bold=True, color=WHITE, align=TA_CENTER),
            para("EXAMS\nSCORE\n(40%)", 7, bold=True, color=WHITE, align=TA_CENTER),
            para("TOTAL\n(100%)",       7, bold=True, color=WHITE, align=TA_CENTER),
            para("GRADE",               7, bold=True, color=WHITE, align=TA_CENTER),
            para("REMARK",              7, bold=True, color=WHITE, align=TA_CENTER),
        ]
        if show_position:
            subj_header.insert(5, para("POS.", 7, bold=True, color=WHITE, align=TA_CENTER))

        col_widths = (
            [50*mm, 17*mm, 17*mm, 17*mm, 17*mm, 13*mm, 13*mm, 30*mm]
            if show_position else
            [54*mm, 19*mm, 19*mm, 19*mm, 19*mm, 14*mm, 36*mm]
        )

        subj_rows = [subj_header]
        for i, sub in enumerate(subjects):
            score_color = GREEN2 if sub["score"] >= 60 else (GOLD if sub["score"] >= 45 else RED)
            row = [
                para(f"  {sub['name']}",              8),
                para(str(sub["ca"]),                   8, align=TA_CENTER),
                para(str(sub["reopen"]),               8, align=TA_CENTER),
                para(str(sub["exams"]),                8, align=TA_CENTER),
                para(f'<b>{sub["score"]}</b>',         8, color=score_color, align=TA_CENTER),
                para(f'<b>{sub["grade"]}</b>',         8, color=DARKGREEN, align=TA_CENTER),
                para(sub["remark"],                    7, align=TA_CENTER),
            ]
            if show_position:
                row.insert(5, para(str(sub["position"] or "-"), 8, align=TA_CENTER))
            subj_rows.append(row)

        subj_table = Table(subj_rows, colWidths=col_widths)
        subj_table.setStyle(TableStyle([
            ("BACKGROUND",     (0, 0),  (-1, 0),  DARKGREEN),
            ("TOPPADDING",     (0, 0),  (-1, 0),  6),
            ("BOTTOMPADDING",  (0, 0),  (-1, 0),  6),
            ("GRID",           (0, 0),  (-1, -1), 0.4, DIVIDER),
            ("BOX",            (0, 0),  (-1, -1), 0.8, DIVIDER),
            ("TOPPADDING",     (0, 1),  (-1, -1), 5),
            ("BOTTOMPADDING",  (0, 1),  (-1, -1), 5),
            ("LEFTPADDING",    (0, 0),  (-1, -1), 4),
            ("VALIGN",         (0, 0),  (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1),  (-1, -1), [WHITE, MGRAY]),
            ("BACKGROUND",     (4, 1),  (4, -1),  colors.HexColor("#f0fdf4")),
        ]))
        elements.append(subj_table)
        elements.append(Spacer(1, 4*mm))

        # ── Attendance + Remarks ──────────────────────────────────────────
        att_label = section_label_row(para, "ATTENDANCE & CONDUCT", 90*mm)
        rem_label = section_label_row(para, "CLASS TEACHER REMARKS", 90*mm)

        att_rows = []
        if total_days > 0:
            att_rows.append([
                para("Total Attendance:", 8, bold=True, color=DARKGREEN),
                para(f"{present_days}  OUT OF:  {total_days}  ({att_percent}%)", 8),
            ])
            att_rows.append([
                para("Days Absent:", 8, bold=True, color=DARKGREEN),
                para(
                    str(total_days - present_days),
                    8, color=RED if (total_days - present_days) > 3 else DGRAY,
                ),
            ])
        else:
            att_rows.append([para("Attendance:", 8, bold=True, color=DARKGREEN),
                             para("No data recorded.", 8, color=LGRAY)])

        if report:
            if attitude:
                att_rows.append([para("Attitude:", 8, bold=True, color=DARKGREEN),
                                 para(attitude, 8)])
            if report.conduct:
                att_rows.append([para("Conduct:", 8, bold=True, color=DARKGREEN),
                                 para(report.conduct, 8)])
            if report.interest:
                att_rows.append([para("Interest:", 8, bold=True, color=DARKGREEN),
                                 para(report.interest, 8)])
            if promoted_to:
                att_rows.append([para("Promoted To:", 8, bold=True, color=BLUE2),
                                 para(promoted_to, 8, color=BLUE2)])

        att_inner = Table(att_rows, colWidths=[30*mm, 56*mm])
        att_inner.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("LINEBELOW",     (0, 0), (-1, -2), 0.3, DIVIDER),
        ]))

        rem_rows = []
        if report and report.teacher_remark:
            rem_rows.append([para(f'"{report.teacher_remark}"', 9, color=DGRAY)])
        else:
            rem_rows.append([para("No remarks recorded.", 9, color=LGRAY)])

        # Teacher signature line
        rem_rows.append([para("", 6)])
        rem_rows.append([
            Table(
                [[para("TEACHER'S SIGNATURE:  ___________________________", 8, color=LGRAY)]],
                colWidths=[86*mm],
            )
        ])

        rem_inner = Table(rem_rows, colWidths=[86*mm])
        rem_inner.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ]))

        att_block = Table([[att_label], [att_inner]], colWidths=[90*mm])
        att_block.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("BOX",           (0, 0), (-1, -1), 0.8, DIVIDER),
            ("BACKGROUND",    (0, 1), (-1, -1), GRAY),
        ]))

        rem_block = Table([[rem_label], [rem_inner]], colWidths=[90*mm])
        rem_block.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("BOX",           (0, 0), (-1, -1), 0.8, DIVIDER),
            ("BACKGROUND",    (0, 1), (-1, -1), GRAY),
        ]))

        bottom_table = Table([[att_block, rem_block]], colWidths=[93*mm, 93*mm])
        bottom_table.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(bottom_table)
        elements.append(Spacer(1, 4*mm))

        # ── Grading Key ───────────────────────────────────────────────────
        elements.append(section_label_row(para, "GRADING", FULL_W))
        elements.append(Spacer(1, 1*mm))

        interp_data = []
        for row in interp_rows:
            interp_data.append([
                para(f"  {row[0]}", 7, color=DGRAY),
                para(row[1],        7, color=DGRAY, align=TA_CENTER),
                para(row[2],        7, color=DGRAY, align=TA_RIGHT),
            ])

        interp_table = Table(interp_data, colWidths=[62*mm, 62*mm, 62*mm])
        interp_table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), MGRAY),
            ("BOX",           (0, 0), (-1, -1), 0.8, DIVIDER),
            ("GRID",          (0, 0), (-1, -1), 0.3, DIVIDER),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS",(0, 0), (-1, -1), [WHITE, MGRAY]),
        ]))
        elements.append(interp_table)

        # ── Footer ────────────────────────────────────────────────────────
        elements.append(Spacer(1, 4*mm))
        elements.append(HRFlowable(width="100%", thickness=0.6, color=DIVIDER))
        elements.append(Spacer(1, 2*mm))
        elements.append(para(
            f"{SCHOOL_NAME}  ·  {SCHOOL_ADDRESS}  ·  {SCHOOL_TEL}",
            7, color=LGRAY, align=TA_CENTER,
        ))

        pdf.build(elements)
        pdf_data = buffer.getvalue()
        buffer.close()

        name_slug = getattr(student, "student_name", student.full_name).strip().replace(" ", "_")
        if not name_slug:
            name_slug = student.admission_number

        safe_name = re.sub(r'[^A-Za-z0-9_-]+', '_', name_slug).strip("_")
        filename  = f"TopRidge_Report_{safe_name}_{term}.pdf"

        response = HttpResponse(pdf_data, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="{filename}"; filename*=UTF-8\'\'{quote(filename)}'
        )
        return response
