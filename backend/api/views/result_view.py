from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.results.models import Result, Report
from apps.students.models import Student
from api.serializers.result_serializer import ResultSerializer


# ---------------------------------------------------------------------------
# Grading systems — must match frontend and report_pdf_view exactly
# ---------------------------------------------------------------------------

GRADE_THRESHOLDS_B79 = [
    (90, "1", "Excellent"),
    (80, "2", "Very Good"),
    (70, "3", "Good"),
    (60, "4", "High Average"),
    (55, "5", "Average"),
    (50, "6", "Low Average"),
    (45, "7", "Low"),
    # FIX: was "6" (duplicate) — corrected to "8" to match the 1–9 sequence
    (40, "8", "Lower"),
    (0,  "9", "Lowest"),
]

GRADE_THRESHOLDS_B16 = [
    (90, "A",  "Excellent"),
    (80, "B1", "Very Good"),
    (70, "B2", "Good"),
    (60, "C1", "High Average"),
    (55, "C2", "Average"),
    (50, "D1", "Low Average"),
    (45, "D2", "Low"),
    (40, "E1", "Lower"),
    (0,  "E2", "Lowest"),
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


def class_level(school_class) -> str:
    """Detect grading level from class name (mirrors frontend logic)."""
    if not school_class:
        return "basic_1_6"
    name = school_class.name.lower()
    for marker in ("basic 7", "basic 8", "basic 9", "b7", "b8", "b9"):
        if marker in name:
            return "basic_7_9"
    return "basic_1_6"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_position(n) -> str:
    if n is None:
        return "—"
    n = int(n)
    suffix = (
        "th" if 10 <= n % 100 <= 20
        else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    )
    return f"{n}{suffix}"


def recompute_subject_positions(subject_id, term, school_class_id, year=None):
    """
    Recompute per-subject positions for all students in a class.
    Filters via student__school_class_id since Result has no direct class FK.
    """
    qs = Result.objects.filter(
        subject_id=subject_id,
        term=term,
        student__school_class_id=school_class_id,
    )
    if year:
        qs = qs.filter(year=year)

    results = list(qs.order_by("-score", "id"))

    current_rank = 0
    prev_score   = object()

    for i, r in enumerate(results):
        if r.score != prev_score:
            current_rank = i + 1
            prev_score   = r.score
        r.subject_position = current_rank

    Result.objects.bulk_update(results, ["subject_position"])


def _assign_ranks(rows: list, key: str = "total_score") -> None:
    current_rank = 0
    prev_value   = object()
    for i, row in enumerate(rows):
        if row[key] != prev_value:
            current_rank = i + 1
            prev_value   = row[key]
        row["rank"] = current_rank


# ---------------------------------------------------------------------------
# ViewSet
# ---------------------------------------------------------------------------

class ResultViewSet(ModelViewSet):

    queryset           = Result.objects.all().order_by("-created_at")
    serializer_class   = ResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs     = super().get_queryset()
        params = self.request.query_params

        student      = params.get("student")
        school_class = params.get("school_class")
        term         = params.get("term")
        subject      = params.get("subject")
        year         = params.get("year")

        if student:      qs = qs.filter(student_id=student)
        if school_class: qs = qs.filter(student__school_class_id=school_class)
        if term:         qs = qs.filter(term=term)
        if subject:      qs = qs.filter(subject_id=subject)
        if year:         qs = qs.filter(year=year)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save()
        if instance.student.school_class_id:
            recompute_subject_positions(
                instance.subject_id,
                instance.term,
                instance.student.school_class_id,
                instance.year,
            )

    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.student.school_class_id:
            recompute_subject_positions(
                instance.subject_id,
                instance.term,
                instance.student.school_class_id,
                instance.year,
            )

    # ------------------------------------------------------------------
    # Bulk upsert  POST /api/results/bulk/
    # ------------------------------------------------------------------

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk_save(self, request):
        records = request.data if isinstance(request.data, list) else [request.data]
        saved   = []
        errors  = []
        year    = timezone.now().year

        for record in records:
            missing = [k for k in ("student", "subject", "term") if k not in record]
            if missing:
                errors.append({"record": record, "error": f"Missing fields: {missing}"})
                continue
            try:
                rec_year = int(record.get("year") or year)
                instance, _ = Result.objects.update_or_create(
                    student_id=record["student"],
                    subject_id=record["subject"],
                    term=record["term"],
                    year=rec_year,
                    defaults={
                        "reopen": float(record.get("reopen") or 0),
                        "ca":     float(record.get("ca")     or 0),
                        "exams":  float(record.get("exams")  or 0),
                    },
                )
                saved.append(instance.id)
            except Exception as exc:
                errors.append({"record": record, "error": str(exc)})

        # FIX: Collect unique (subject, term, class, year) combos first, then
        # recompute positions once per combo instead of once per record.
        # For a 30-student bulk save this reduces position queries from 30 → 1.
        combos = set()
        for record in records:
            if "subject" not in record or "term" not in record:
                continue
            try:
                student = Student.objects.select_related("school_class").get(
                    id=record["student"]
                )
                if student.school_class_id:
                    combos.add((
                        record["subject"],
                        record["term"],
                        student.school_class_id,
                        int(record.get("year") or year),
                    ))
            except Exception:
                pass

        for subject_id, term, class_id, yr in combos:
            recompute_subject_positions(subject_id, term, class_id, yr)

        response_status = (
            status.HTTP_400_BAD_REQUEST  if not saved and errors else
            status.HTTP_207_MULTI_STATUS if errors               else
            status.HTTP_200_OK
        )
        return Response({"saved": len(saved), "errors": errors}, status=response_status)

    # ------------------------------------------------------------------
    # Class summary  GET /api/results/summary/
    # ------------------------------------------------------------------

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        school_class = request.query_params.get("school_class")
        term         = request.query_params.get("term")
        year         = request.query_params.get("year", timezone.now().year)

        if not school_class or not term:
            return Response(
                {"error": "school_class and term are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = (
            Result.objects
            .filter(
                student__school_class_id=school_class,
                term=term,
                year=year,
            )
            .select_related("student", "student__school_class", "subject")
        )

        student_map = {}

        for r in results:
            sid        = r.student.id
            level      = class_level(r.student.school_class)
            thresholds = get_thresholds(level)
            score      = r.score or 0
            grade, remark = get_grade_and_remark(score, thresholds)

            if sid not in student_map:
                student_map[sid] = {
                    "student_id":       r.student.id,
                    "student_name":     r.student.full_name,
                    "admission_number": r.student.admission_number,
                    "level":            level,
                    "subjects":         [],
                    "total_score":      0,
                    "count":            0,
                }

            student_map[sid]["subjects"].append({
                "subject_id":       r.subject.id,
                "subject_name":     r.subject.name,
                "ca":               r.ca,
                "reopen":           r.reopen,
                "exams":            r.exams,
                "score":            r.score,
                "grade":            grade,
                "remark":           remark,
                "subject_position": r.subject_position,
            })

            if r.score is not None:
                student_map[sid]["total_score"] += r.score
                student_map[sid]["count"]        += 1

        rows = []
        for data in student_map.values():
            count = data["count"]
            total = round(data["total_score"], 2)
            avg   = round(total / count, 2) if count else 0
            thresholds = get_thresholds(data["level"])

            rows.append({
                "student_id":       data["student_id"],
                "student_name":     data["student_name"],
                "admission_number": data["admission_number"],
                "subjects":         data["subjects"],
                "total_score":      total,
                "average_score":    avg,
                "overall_grade":    get_overall_grade(avg, thresholds),
                "subject_count":    count,
            })

        rows.sort(key=lambda x: x["total_score"], reverse=True)
        _assign_ranks(rows)
        return Response(rows)


# ---------------------------------------------------------------------------
# Per-student report card  GET /api/report/student/<id>/
# ---------------------------------------------------------------------------

class StudentReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        term = request.query_params.get("term")
        year = int(request.query_params.get("year", timezone.now().year))
        if not term:
            raise ValidationError({"error": "term is required"})

        student    = get_object_or_404(
            Student.objects.select_related("school_class"), id=student_id
        )
        level      = class_level(student.school_class)
        thresholds = get_thresholds(level)

        results = (
            Result.objects
            .filter(student=student, term=term, year=year)
            .select_related("subject")
        )

        subjects    = []
        total_score = 0

        for r in results:
            score         = r.score or 0
            grade, remark = get_grade_and_remark(score, thresholds)
            subjects.append({
                "subject":          r.subject.name,
                "ca":               r.ca,
                "reopen":           r.reopen,
                "exams":            r.exams,
                "score":            r.score,
                "grade":            grade,
                "remark":           remark,
                "subject_position": r.subject_position,
            })
            total_score += score

        subject_count = len(subjects)
        average       = round(total_score / subject_count, 2) if subject_count else 0

        # Class ranking — via student__school_class
        # FIX: Removed redundant Python sort; .order_by("-total") already sorts.
        class_totals = (
            Result.objects
            .filter(student__school_class=student.school_class, term=term, year=year)
            .values("student_id")
            .annotate(total=Sum("score"))
            .order_by("-total")
        )
        ranked = list(class_totals)
        _assign_ranks(ranked, key="total")

        position = next(
            (row["rank"] for row in ranked if row["student_id"] == student.id),
            None,
        )

        number_on_roll = len(ranked)

        # Attendance
        try:
            from apps.attendance.models import Attendance
            att_qs      = Attendance.objects.filter(student=student, term=term, year=year)
            att_total   = att_qs.count()
            att_present = att_qs.filter(status="present").count()
        except Exception:
            att_total   = 0
            att_present = 0

        att_percent = round((att_present / att_total) * 100, 1) if att_total else 0

        report = Report.objects.filter(student=student, term=term, year=year).first()

        vacation_date   = ""
        resumption_date = ""
        if report:
            if report.vacation_date:
                vacation_date   = report.vacation_date.isoformat()
            if report.resumption_date:
                resumption_date = report.resumption_date.isoformat()

        photo_url = None
        if student.photo:
            try:
                photo_url = student.photo.url
            except Exception:
                pass

        return Response({
            # School
            "school_name":    "TOP RIDGE SCHOOL",
            "school_motto":   "CENTRE OF DISTINCTION",
            "school_address": "P.O BOX OD 292, Odorkor-Accra",
            # Student
            "student":          student.full_name,
            "admission_number": student.admission_number,
            "class":            student.school_class.name if student.school_class else "—",
            "photo":            photo_url,
            "term":             term,
            "year":             year,
            "level":            level,
            # Scores
            "subjects":       subjects,
            "total_score":    round(total_score, 2),
            "average_score":  average,
            "overall_grade":  get_overall_grade(average, thresholds),
            # Position
            "show_position":      level == "basic_7_9",
            "position":           position,
            "position_formatted": _fmt_position(position),
            "out_of":             number_on_roll,
            "number_on_roll":     number_on_roll,
            # Attendance
            "attendance":         att_present,
            "attendance_total":   att_total,
            "attendance_percent": att_percent,
            # Remarks
            "conduct":         report.conduct         if report else "",
            "attitude":        report.attitude        if report else "",
            "interest":        report.interest        if report else "",
            "teacher_remark":  report.teacher_remark  if report else "",
            "promoted_to":     report.promoted_to     if report else "",
            "vacation_date":   vacation_date,
            "resumption_date": resumption_date,
        })

    def patch(self, request, student_id):
        term = request.data.get("term")
        year = int(request.data.get("year", timezone.now().year))
        if not term:
            raise ValidationError({"error": "term is required"})

        student = get_object_or_404(Student, id=student_id)
        report, _ = Report.objects.get_or_create(
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
                if field in ("vacation_date", "resumption_date") and val == "":
                    val = None
                setattr(report, field, val)

        report.save()
        return Response({"detail": "Remarks saved."})
