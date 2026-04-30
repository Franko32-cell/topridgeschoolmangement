"""
api/views/report_view.py
GET  /api/report/student/<id>/          → JSON report data
PATCH /api/report/student/<id>/         → save teacher remarks
"""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from apps.students.models import Student
from apps.results.models import Result, Report
from apps.attendance.models import Attendance


# ---------------------------------------------------------------------------
# Grading helpers
# ---------------------------------------------------------------------------

def get_grade_b79(score):
    """Numeric grade scale for Basic 7–9."""
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
    """Letter grade scale for Basic 1–6 / KG."""
    if score >= 90: return "A",  "Excellent"
    if score >= 80: return "B1", "Very Good"
    if score >= 70: return "B2", "Good"
    if score >= 60: return "C1", "High Average"
    if score >= 55: return "C2", "Average"
    if score >= 50: return "D1", "Low Average"
    if score >= 45: return "D2", "Low"
    if score >= 40: return "E1", "Lower"
    return "E2", "Lowest"


def get_overall_grade(score, level):
    grade, _ = (get_grade_b79 if level == "basic_7_9" else get_grade_b16)(score)
    return grade


def ordinal(n):
    if n is None:
        return None
    n = int(n)
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10 if n % 100 not in (11, 12, 13) else 0, "th")
    return f"{n}{suffix}"


# ---------------------------------------------------------------------------
# Determine grading level from class name
# ---------------------------------------------------------------------------

def class_level(school_class):
    """
    Returns 'basic_7_9' or 'basic_1_6'.
    Basic 7, 8, 9 → numeric grades; everything else → letter grades.
    """
    if not school_class:
        return "basic_1_6"
    name = school_class.name.lower()
    for marker in ("basic 7", "basic 8", "basic 9", "b7", "b8", "b9", "7", "8", "9"):
        if marker in name:
            return "basic_7_9"
    return "basic_1_6"


# ---------------------------------------------------------------------------
# Report View
# ---------------------------------------------------------------------------

class StudentReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        student = get_object_or_404(Student, id=student_id)
        term    = request.query_params.get("term", "term1")
        year    = int(request.query_params.get("year", timezone.now().year))

        results = Result.objects.filter(
            student=student, term=term, year=year
        ).select_related("subject").order_by("subject__name")

        if not results.exists():
            return Response(
                {"detail": "No results found for this student and term."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ── Report record (remarks / dates) ───────────────────────────────────
        report_obj, _ = Report.objects.get_or_create(
            student=student, term=term, year=year,
        )

        # ── Attendance from Attendance model ──────────────────────────────────
        try:
            from apps.attendance.models import Attendance
            att_qs      = Attendance.objects.filter(student=student, term=term, year=year)
            att_total   = att_qs.count()
            att_present = att_qs.filter(status="present").count()
        except Exception:
            att_total   = report_obj.attendance_total
            att_present = report_obj.attendance

        att_percent = round((att_present / att_total) * 100, 1) if att_total else 0

        # ── Class + level ─────────────────────────────────────────────────────
        school_class = student.school_class
        level        = class_level(school_class)
        grade_fn     = get_grade_b79 if level == "basic_7_9" else get_grade_b16

        # ── Number on roll (students in same class + term with results) ────────
        number_on_roll = (
            Result.objects
            .filter(term=term, year=year, student__school_class=school_class)
            .values("student")
            .distinct()
            .count()
        )

        # ── Subject rows ──────────────────────────────────────────────────────
        subjects_data = []
        total_score   = 0

        for r in results:
            grade, remark = grade_fn(r.score)
            subjects_data.append({
                "subject":          r.subject.name,
                "class_score":      r.ca,
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
        overall_grade = get_overall_grade(average_score, level)

        # ── Overall class position ────────────────────────────────────────────
        # Rank by total score among students in same class/term/year
        from apps.results.models import Result as R
        from django.db.models import Sum

        peer_scores = (
            R.objects
            .filter(term=term, year=year, student__school_class=school_class)
            .values("student")
            .annotate(total=Sum("score"))
            .order_by("-total")
        )
        position      = None
        show_position = level == "basic_7_9"   # only show position for B7-9
        if show_position:
            for rank, row in enumerate(peer_scores, start=1):
                if row["student"] == student.id:
                    position = rank
                    break

        # ── Photo URL ─────────────────────────────────────────────────────────
        photo_url = None
        if student.photo:
            try:
                photo_url = student.photo.url
            except Exception:
                pass

        # ── Dates ─────────────────────────────────────────────────────────────
        vacation_date   = report_obj.vacation_date.strftime("%d %b, %Y").upper()   if report_obj.vacation_date   else ""
        resumption_date = report_obj.resumption_date.strftime("%d %b, %Y").upper() if report_obj.resumption_date else ""

        return Response({
            # School info
            "school_name":    "TOP RIDGE SCHOOL",
            "school_motto":   "CENTRE OF DISTINCTION",
            "school_address": "P.O BOX OD 292, Odorkor-Accra",

            # Student info
            "student":          student.full_name,
            "admission_number": student.admission_number,
            "class":            school_class.name if school_class else "—",
            "term":             term,
            "year":             year,
            "photo":            photo_url,
            "level":            level,

            # Scores
            "subjects":       subjects_data,
            "total_score":    round(total_score, 2),
            "average_score":  average_score,
            "overall_grade":  overall_grade,

            # Position
            "show_position":      show_position,
            "position":           position,
            "position_formatted": ordinal(position) if position else None,
            "out_of":             number_on_roll,
            "number_on_roll":     number_on_roll,

            # Attendance
            "attendance":         att_present,
            "attendance_total":   att_total,
            "attendance_percent": att_percent,

            # Remarks (editable)
            "conduct":         report_obj.conduct,
            "attitude":        report_obj.attitude,
            "interest":        report_obj.interest,
            "teacher_remark":  report_obj.teacher_remark,
            "promoted_to":     report_obj.promoted_to,
            "vacation_date":   report_obj.vacation_date.isoformat()   if report_obj.vacation_date   else "",
            "resumption_date": report_obj.resumption_date.isoformat() if report_obj.resumption_date else "",

            # Formatted dates for display
            "vacation_date_display":   vacation_date,
            "resumption_date_display": resumption_date,
        })

    def patch(self, request, student_id):
        student = get_object_or_404(Student, id=student_id)
        term    = request.data.get("term", "term1")
        year    = int(request.data.get("year", timezone.now().year))

        report_obj, _ = Report.objects.get_or_create(
            student=student, term=term, year=year,
        )

        fields = [
            "conduct", "attitude", "interest",
            "teacher_remark", "promoted_to",
            "vacation_date", "resumption_date",
        ]
        for field in fields:
            if field in request.data:
                val = request.data[field]
                # Allow clearing date fields with empty string
                if field in ("vacation_date", "resumption_date") and val == "":
                    val = None
                setattr(report_obj, field, val)

        report_obj.save()
        return Response({"detail": "Remarks saved."})