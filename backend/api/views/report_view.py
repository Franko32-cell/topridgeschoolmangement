from typing import Optional

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.results.models import Result, Report
from apps.students.models import Student
from apps.attendance.models import Attendance


# ---------------------------------------------------------------------------
# School info
# ---------------------------------------------------------------------------

SCHOOL_NAME     = "TOP RIDGE SCHOOL"
SCHOOL_MOTTO    = "CENTRE OF DISTINCTION"
SCHOOL_ADDRESS  = "P.O BOX OD 292, Odorkor-Accra"
SCHOOL_LOCATION = "Sanat-Maria Off the Kwashieman Motor way Highway."
SCHOOL_TEL      = "027-1591-079"

VALID_TERMS = {"term1", "term2", "term3"}


# ---------------------------------------------------------------------------
# Grading systems
# ---------------------------------------------------------------------------

# Basic 7–9 — numeric grades (1–9)
#   FIX: 40–44 was incorrectly mapped to grade "6" (duplicate). Corrected to "8".
GRADE_THRESHOLDS_B79 = [
    (90, "1", "EXCELLENT"),
    (80, "2", "VERY GOOD"),
    (70, "3", "GOOD"),
    (60, "4", "HIGH AVERAGE"),
    (55, "5", "AVERAGE"),
    (50, "6", "LOW AVERAGE"),
    (45, "7", "LOW"),
    (40, "8", "LOWER"),   # was "6" — duplicate grade bug fixed
    (0,  "9", "LOWEST"),
]

# Basic 1–6 — letter grades
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

# Nursery / KG — same letter system as Basic 1–6
GRADE_THRESHOLDS_NKG = GRADE_THRESHOLDS_B16


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_grade_and_remark(score: float, thresholds: list) -> tuple:
    """Return (grade, remark) for a given score using the supplied threshold table."""
    for threshold, grade, remark in thresholds:
        if score >= threshold:
            return grade, remark
    return thresholds[-1][1], thresholds[-1][2]


def get_overall_grade(avg: float, thresholds: list) -> str:
    return get_grade_and_remark(avg, thresholds)[0]


def get_thresholds(level: str) -> list:
    if level == "basic_1_6":
        return GRADE_THRESHOLDS_B16
    if level == "nursery_kg":
        return GRADE_THRESHOLDS_NKG
    return GRADE_THRESHOLDS_B79   # default: basic_7_9


# FIX: Use Optional[int] instead of int | None for Python 3.9 compatibility.
def format_position(n: Optional[int]) -> Optional[str]:
    """Return ordinal string e.g. 1 → '1st', 3 → '3rd'."""
    if n is None:
        return None
    suffix = (
        "th" if 10 <= n % 100 <= 20
        else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    )
    return f"{n}{suffix}"


def get_grading_scale(level: str) -> list:
    """
    Return the grading scale list for the report footer.
    Labels match exactly what is printed on the Top Ridge School report cards.
    """
    if level in ("basic_1_6", "nursery_kg"):
        return [
            {"range": "90 – 100", "grade": "A",  "remark": "Excellent"},
            {"range": "80 – 89",  "grade": "B1", "remark": "Very Good"},
            {"range": "70 – 79",  "grade": "B2", "remark": "Good"},
            {"range": "60 – 69",  "grade": "C1", "remark": "High Average"},
            {"range": "55 – 59",  "grade": "C2", "remark": "Average"},
            {"range": "50 – 54",  "grade": "D1", "remark": "Low Average"},
            {"range": "45 – 49",  "grade": "D2", "remark": "Low"},
            {"range": "40 – 44",  "grade": "E1", "remark": "Lower"},
            {"range": "0 – 39",   "grade": "E2", "remark": "Lowest"},
        ]
    # Basic 7–9 scale (matches Top Ridge School report card grading key)
    return [
        {"range": "90 – 100", "grade": "1", "remark": "Excellent"},
        {"range": "80 – 89",  "grade": "2", "remark": "Very Good"},
        {"range": "70 – 79",  "grade": "3", "remark": "Good"},
        {"range": "60 – 69",  "grade": "4", "remark": "High Average"},
        {"range": "55 – 59",  "grade": "5", "remark": "Average"},
        {"range": "50 – 54",  "grade": "6", "remark": "Low Average"},
        {"range": "45 – 49",  "grade": "7", "remark": "Low"},
        {"range": "40 – 44",  "grade": "8", "remark": "Lower"},   # fixed from "6"
        {"range": "0 – 39",   "grade": "9", "remark": "Lowest"},
    ]


def _current_year() -> int:
    return timezone.now().year


def _safe_photo_url(student) -> Optional[str]:
    """
    FIX: Cloudinary fields can be truthy even when empty (empty string).
    Explicitly check the field has a name before calling .url to avoid ValueError.
    """
    try:
        if student.photo and student.photo.name:
            return student.photo.url
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

class StudentReportView(APIView):
    permission_classes = [IsAuthenticated]

    # ── GET ──────────────────────────────────────────────────────────────────

    def get(self, request, student_id):
        term = request.query_params.get("term")
        if not term:
            return Response({"error": "term is required"}, status=400)
        # FIX: Validate term value to avoid silently returning empty/wrong data.
        if term not in VALID_TERMS:
            return Response(
                {"error": f"term must be one of: {', '.join(sorted(VALID_TERMS))}"},
                status=400,
            )

        # FIX: Accept an explicit year param; fall back to current year.
        # This keeps GET and PATCH consistent and avoids cross-year data mixing.
        try:
            year = int(request.query_params.get("year", _current_year()))
        except ValueError:
            return Response({"error": "year must be an integer"}, status=400)

        student    = get_object_or_404(Student, id=student_id)
        level      = getattr(student.school_class, "level", "basic_7_9") if student.school_class else "basic_7_9"
        thresholds = get_thresholds(level)

        # Nursery/KG reports use the Montessori rubric — positions not shown.
        show_position = level != "nursery_kg"

        # FIX: Filter by year to avoid mixing results across academic years.
        results = (
            Result.objects
            .filter(student=student, term=term, year=year)
            .select_related("subject")
            .order_by("subject__name")
        )

        # FIX: Filter Report by year too.
        report = Report.objects.filter(student=student, term=term, year=year).first()

        subjects    = []
        total_score = 0.0
        passed      = 0
        failed      = 0

        for r in results:
            score         = r.score or 0.0
            grade, remark = get_grade_and_remark(score, thresholds)

            subjects.append({
                "subject":          r.subject.name,
                # Column order matches the printed report: CLASS SC.(40%) | RE-OPEN(20%) | EXAMS(40%)
                "class_score":      r.ca,
                "reopen":           r.reopen,
                "exams":            r.exams,
                "score":            r.score,
                "grade":            grade,
                "remark":           remark,
                "subject_position": r.subject_position if show_position else None,
            })

            total_score += score
            if score >= 50:
                passed += 1
            else:
                failed += 1

        subject_count = len(subjects)
        average       = round(total_score / subject_count, 2) if subject_count else 0.0
        overall_grade = get_overall_grade(average, thresholds)

        # ── Attendance ───────────────────────────────────────────────────────
        # FIX: Filter attendance by year as well.
        term_attendance  = Attendance.objects.filter(student=student, term=term, year=year)
        total_days       = term_attendance.count()
        present_days     = term_attendance.filter(status__in=["present", "late"]).count()

        # ── Class ranking ────────────────────────────────────────────────────
        # FIX: Replace N+1 loop with a single aggregated query using annotate+Sum.
        # Previously this fired one DB query per classmate — O(N) queries.
        class_students   = Student.objects.filter(school_class=student.school_class)
        number_on_roll   = class_students.count()

        if show_position:
            student_totals = (
                Result.objects
                .filter(
                    student__school_class=student.school_class,
                    term=term,
                    year=year,
                )
                .values("student_id")
                .annotate(total=Sum("score"))
                .order_by("-total")
            )

            ranked = list(student_totals)
            position = next(
                (i + 1 for i, item in enumerate(ranked) if item["student_id"] == student.id),
                None,
            )
            out_of = len(ranked)
        else:
            position = None
            out_of   = None

        return Response({
            # ── School info ─────────────────────────────────────────────────
            "school_name":     SCHOOL_NAME,
            "school_motto":    SCHOOL_MOTTO,
            "school_address":  SCHOOL_ADDRESS,
            "school_location": SCHOOL_LOCATION,
            "school_tel":      SCHOOL_TEL,

            # ── Student info ────────────────────────────────────────────────
            "student":          student.full_name,
            "admission_number": student.admission_number,
            "class":            student.school_class.name if student.school_class else None,
            "photo":            _safe_photo_url(student),  # FIX: safe Cloudinary URL
            "term":             term,
            "year":             year,
            "level":            level,
            "show_position":    show_position,
            "number_on_roll":   number_on_roll,

            # ── Results ──────────────────────────────────────────────────────
            "subjects":        subjects,
            "total_score":     round(total_score, 2),
            "average_score":   average,
            "overall_grade":   overall_grade,
            "subjects_passed": passed,
            "subjects_failed": failed,

            # ── Class position ───────────────────────────────────────────────
            "position":           position,
            "position_formatted": format_position(position),
            "out_of":             out_of,

            # ── Attendance ───────────────────────────────────────────────────
            "attendance":         present_days,
            "attendance_total":   total_days,
            "attendance_percent": round((present_days / total_days) * 100) if total_days else 0,

            # ── Teacher remarks ───────────────────────────────────────────────
            "conduct":        report.conduct        if report else None,
            "attitude":       report.attitude       if report else None,
            "interest":       report.interest       if report else None,
            "teacher_remark": report.teacher_remark if report else None,
            "promoted_to":    report.promoted_to    if report else None,

            # ── Term dates ───────────────────────────────────────────────────
            "vacation_date":   str(report.vacation_date)   if report and report.vacation_date   else None,
            "resumption_date": str(report.resumption_date) if report and report.resumption_date else None,

            # ── Grading scale (for footer) ───────────────────────────────────
            "grading_scale": get_grading_scale(level),
        })

    # ── PATCH ─────────────────────────────────────────────────────────────────

    def patch(self, request, student_id):
        term = request.data.get("term")
        if not term:
            return Response({"error": "term is required"}, status=400)
        if term not in VALID_TERMS:
            return Response(
                {"error": f"term must be one of: {', '.join(sorted(VALID_TERMS))}"},
                status=400,
            )

        # FIX: Accept explicit year in PATCH body, same as GET.
        # Prevents cross-year mismatch when PATCH is called near year boundary.
        try:
            year = int(request.data.get("year", _current_year()))
        except (TypeError, ValueError):
            return Response({"error": "year must be an integer"}, status=400)

        student = get_object_or_404(Student, id=student_id)

        report, _ = Report.objects.get_or_create(
            student=student,
            term=term,
            year=year,
            defaults={
                # FIX: Use 0 for attendance_total default so the API-computed
                # value is always authoritative; 1 was a silent footgun that
                # made a student look like 0/1 attendance until corrected.
                "attendance":       0,
                "attendance_total": 0,
            },
        )

        # All teacher-editable fields — must match Report model fields exactly
        updatable = [
            "conduct",
            "attitude",
            "interest",
            "teacher_remark",
            "promoted_to",
            "vacation_date",
            "resumption_date",
        ]
        changed = []

        for field in updatable:
            if field in request.data:
                value = request.data[field]
                # Treat empty string as NULL for date fields
                if field in ("vacation_date", "resumption_date") and value == "":
                    value = None
                setattr(report, field, value)
                changed.append(field)

        if changed:
            report.save(update_fields=changed)

        return Response({
            "detail":          "Saved.",
            "conduct":         report.conduct,
            "attitude":        report.attitude,
            "interest":        report.interest,
            "teacher_remark":  report.teacher_remark,
            "promoted_to":     report.promoted_to,
            "vacation_date":   str(report.vacation_date)   if report.vacation_date   else None,
            "resumption_date": str(report.resumption_date) if report.resumption_date else None,
        })