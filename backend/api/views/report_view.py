from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.results.models import Result, Report
from apps.students.models import Student
from apps.attendance.models import Attendance


# ---------------------------------------------------------------------------
# School info
# ---------------------------------------------------------------------------

SCHOOL_NAME    = "TOP RIDGE SCHOOL"
SCHOOL_MOTTO   = "CENTRE OF DISTINCTION"
SCHOOL_ADDRESS = "P.O BOX OD 292, Odorkor-Accra"
SCHOOL_LOCATION = "Sanat-Maria Off the Kwashieman Motor way Highway."
SCHOOL_TEL     = "027-1591-079"


# ---------------------------------------------------------------------------
# Grading systems
# ---------------------------------------------------------------------------

# Basic 7–9 — numeric grades (1–9) as seen on Ohemaa's report
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

# Basic 1–6 — letter grades (A, B1, B2, C1, C2, D1, D2, E1, E2)
# as seen on Janet's (Basic 3) and Thywords' (KG 2) reports
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
    return GRADE_THRESHOLDS_B79


def format_position(n):
    if n is None:
        return None
    suffix = (
        "th" if 10 <= n % 100 <= 20
        else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    )
    return f"{n}{suffix}"


def get_grading_scale(level: str) -> list:
    """Return a human-readable grading scale for the report footer."""
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
    # Basic 7–9
    return [
        {"range": "90 – 100", "grade": "1", "remark": "Excellent"},
        {"range": "80 – 89",  "grade": "2", "remark": "Very Good"},
        {"range": "70 – 79",  "grade": "3", "remark": "Good"},
        {"range": "60 – 69",  "grade": "4", "remark": "High Average"},
        {"range": "55 – 59",  "grade": "5", "remark": "Average"},
        {"range": "50 – 54",  "grade": "6", "remark": "Low Average"},
        {"range": "45 – 49",  "grade": "7", "remark": "Low"},
        {"range": "40 – 44",  "grade": "6", "remark": "Lower"},
        {"range": "0 – 39",   "grade": "9", "remark": "Lowest"},
    ]


# ---------------------------------------------------------------------------
# View
# ---------------------------------------------------------------------------

class StudentReportView(APIView):

    permission_classes = [IsAuthenticated]

    # ── GET ──────────────────────────────────────────────────────────────

    def get(self, request, student_id):
        term = request.query_params.get("term")
        if not term:
            return Response({"error": "term is required"}, status=400)

        student    = get_object_or_404(Student, id=student_id)
        level      = getattr(student.school_class, "level", "basic_7_9") if student.school_class else "basic_7_9"
        thresholds = get_thresholds(level)
        show_position = level != "nursery_kg"

        results = (
            Result.objects
            .filter(student=student, term=term)
            .select_related("subject")
        )

        report = Report.objects.filter(student=student, term=term).first()

        subjects    = []
        total_score = 0
        passed      = 0
        failed      = 0

        for r in results:
            score         = r.score or 0
            grade, remark = get_grade_and_remark(score, thresholds)

            subjects.append({
                "subject":          r.subject.name,
                "reopen":           r.reopen,
                "ca":               r.ca,
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
        average       = round(total_score / subject_count, 2) if subject_count else 0
        overall_grade = get_overall_grade(average, thresholds)

        # Attendance
        term_attendance = Attendance.objects.filter(student=student, term=term)
        total_days      = term_attendance.count()
        present_days    = term_attendance.filter(status__in=["present", "late"]).count()

        # Class ranking
        class_students = Student.objects.filter(school_class=student.school_class)
        student_totals = []

        for s in class_students:
            s_results = Result.objects.filter(student=s, term=term)
            student_totals.append({
                "student_id": s.id,
                "total":      sum(r.score or 0 for r in s_results),
            })

        ranked   = sorted(student_totals, key=lambda x: x["total"], reverse=True)
        position = next(
            (i + 1 for i, item in enumerate(ranked) if item["student_id"] == student.id),
            None,
        ) if show_position else None

        number_on_roll = class_students.count()

        return Response({
            # School info
            "school_name":      SCHOOL_NAME,
            "school_motto":     SCHOOL_MOTTO,
            "school_address":   SCHOOL_ADDRESS,
            "school_location":  SCHOOL_LOCATION,
            "school_tel":       SCHOOL_TEL,

            # Student info
            "student":            student.full_name,
            "admission_number":   student.admission_number,
            "class":              student.school_class.name if student.school_class else None,
            "photo":              student.photo.url if student.photo else None,
            "term":               term,
            "level":              level,
            "show_position":      show_position,
            "number_on_roll":     number_on_roll,

            # Results
            "subjects":           subjects,
            "total_score":        round(total_score, 2),
            "average_score":      average,
            "overall_grade":      overall_grade,
            "subjects_passed":    passed,
            "subjects_failed":    failed,

            # Class position
            "position":           position,
            "position_formatted": format_position(position),
            "out_of":             len(ranked) if show_position else None,

            # Attendance
            "attendance":         present_days,
            "attendance_total":   total_days,
            "attendance_percent": round((present_days / total_days) * 100) if total_days else 0,

            # Teacher remarks
            "conduct":          report.conduct          if report else None,
            "attitude":         report.attitude         if report else None,
            "interest":         report.interest         if report else None,
            "teacher_remark":   report.teacher_remark   if report else None,
            "promoted_to":      report.promoted_to      if report else None,

            # Dates
            "vacation_date":    str(report.vacation_date)   if report and report.vacation_date   else None,
            "resumption_date":  str(report.resumption_date) if report and report.resumption_date else None,

            # Grading scale for report footer
            "grading_scale":    get_grading_scale(level),
        })

    # ── PATCH ─────────────────────────────────────────────────────────────

    def patch(self, request, student_id):
        term = request.data.get("term")
        if not term:
            return Response({"error": "term is required"}, status=400)

        student = get_object_or_404(Student, id=student_id)

        report, _ = Report.objects.get_or_create(
            student=student,
            term=term,
            year=timezone.now().year,
            defaults={
                "attendance":       0,
                "attendance_total": 1,
            },
        )

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
                if field in ("vacation_date", "resumption_date") and value == "":
                    value = None
                setattr(report, field, value)
                changed.append(field)

        if changed:
            report.save(update_fields=changed)

        return Response({
            "detail":           "Saved.",
            "conduct":          report.conduct,
            "attitude":         report.attitude         if hasattr(report, "attitude") else None,
            "interest":         report.interest,
            "teacher_remark":   report.teacher_remark,
            "promoted_to":      report.promoted_to      if hasattr(report, "promoted_to") else None,
            "vacation_date":    str(report.vacation_date)   if report.vacation_date   else None,
            "resumption_date":  str(report.resumption_date) if report.resumption_date else None,
        })
