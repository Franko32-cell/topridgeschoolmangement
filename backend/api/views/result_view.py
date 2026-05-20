"""
api/views/result_views.py

Design decisions
────────────────
- Grading logic lives entirely in results/grading.py — no threshold literals here.
- recompute_subject_positions() excludes NULL scores and uses a dict for O(1) rank lookup.
- bulk_save() batches position recomputation and properly surfaces per-record errors.
- StudentReportView imports Attendance at module level with a graceful fallback.
- All querysets that feed serializers use select_related to avoid N+1 queries.
"""

from __future__ import annotations

import logging
from collections import defaultdict

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.results.models import Result, Report
from apps.students.models import Student
from api.serializers.result_serializer import ResultSerializer
from apps.results.grading import (
    detect_grade_level,
    fmt_position,
    get_grade_and_remark,
    get_overall_grade,
    get_thresholds,
)

try:
    from apps.attendance.models import Attendance as AttendanceModel
    _HAS_ATTENDANCE = True
except ImportError:
    _HAS_ATTENDANCE = False

logger = logging.getLogger(__name__)

_CURRENT_YEAR = timezone.now().year


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _assign_ranks(rows: list[dict], key: str = "total_score") -> list[dict]:
    """
    Assign a 'rank' key to each dict in *rows* (already sorted descending by
    *key*), using standard competition ranking (ties share the same rank).

    Mutates rows in place AND returns them for convenience.
    """
    current_rank = 0
    prev_value: object = object()  # sentinel distinct from every real value

    for i, row in enumerate(rows):
        if row[key] != prev_value:
            current_rank = i + 1
            prev_value = row[key]
        row["rank"] = current_rank

    return rows


def recompute_subject_positions(
    subject_id: int,
    term: str,
    school_class_id: int,
    year: int,
) -> None:
    """
    Recompute per-subject class positions for every student in *school_class_id*
    who has a non-NULL score for (*subject_id*, *term*, *year*).

    Students with NULL scores are excluded entirely — they haven't been graded
    yet and should not count against other students' positions.

    Uses competition ranking: tied scores share the same position.
    All updates are issued in a single bulk_update call.
    """
    qs = (
        Result.objects
        .filter(
            subject_id=subject_id,
            term=term,
            year=year,
            student__school_class_id=school_class_id,
            score__isnull=False,
        )
        .order_by("-score", "id")  # secondary sort by id for determinism
    )

    results = list(qs)
    if not results:
        return

    current_rank = 0
    prev_score: object = object()

    for i, r in enumerate(results):
        if r.score != prev_score:
            current_rank = i + 1
            prev_score = r.score
        r.subject_position = current_rank

    Result.objects.bulk_update(results, ["subject_position"])


# ---------------------------------------------------------------------------
# ResultViewSet
# ---------------------------------------------------------------------------

class ResultViewSet(ModelViewSet):
    """
    CRUD for individual Result records plus two custom actions:
      POST /api/results/bulk/     — upsert many results at once
      GET  /api/results/summary/  — class-wide score summary
    """

    serializer_class   = ResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs     = Result.objects.select_related("student", "subject").order_by("-created_at")
        params = self.request.query_params

        filters = {}
        if student := params.get("student"):
            filters["student_id"] = student
        if school_class := params.get("school_class"):
            filters["student__school_class_id"] = school_class
        if term := params.get("term"):
            filters["term"] = term
        if subject := params.get("subject"):
            filters["subject_id"] = subject
        if year := params.get("year"):
            filters["year"] = year

        return qs.filter(**filters)

    def _recompute_for_instance(self, instance: Result) -> None:
        if instance.student.school_class_id:
            recompute_subject_positions(
                instance.subject_id,
                instance.term,
                instance.student.school_class_id,
                instance.year,
            )

    def perform_create(self, serializer):
        instance = serializer.save()
        self._recompute_for_instance(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        self._recompute_for_instance(instance)

    # ------------------------------------------------------------------
    # Bulk upsert  POST /api/results/bulk/
    # ------------------------------------------------------------------

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk_save(self, request):
        """
        Upsert a list of result records.

        Accepts a JSON array.  Each item must contain at least:
            student, subject, term
        Optional: year, ca, reopen, exams (all default to 0 / current year).

        Partial score entry is fully supported — missing component fields are
        defaulted to 0, but existing saved values are NOT overwritten unless
        the field is explicitly provided in the payload.  This means you can
        POST only the 'ca' field for a student and the saved 'reopen' and
        'exams' values are preserved.

        Returns:
            200  — all records saved, no errors
            207  — some saved, some failed
            400  — nothing saved (all failed)
        """
        records = request.data if isinstance(request.data, list) else [request.data]
        year    = timezone.now().year
        saved   = []
        errors  = []

        for record in records:
            missing = [k for k in ("student", "subject", "term") if k not in record]
            if missing:
                errors.append({"record": record, "error": f"Missing required fields: {missing}"})
                continue

            try:
                rec_year = int(record.get("year") or year)

                # Build defaults only from fields that were explicitly provided.
                # This preserves previously-saved values for fields absent from
                # this payload — critical when scores are entered across multiple
                # sessions (e.g. CA first, exams later).
                provided_defaults = {}
                for field in ("ca", "reopen", "exams"):
                    if field in record:
                        provided_defaults[field] = float(record[field] or 0)

                instance, created = Result.objects.get_or_create(
                    student_id=record["student"],
                    subject_id=record["subject"],
                    term=record["term"],
                    year=rec_year,
                    defaults=provided_defaults,
                )

                # If the record already existed AND new values were provided,
                # apply only the provided fields (leave the rest untouched).
                if not created and provided_defaults:
                    for field, value in provided_defaults.items():
                        setattr(instance, field, value)
                    # save() will recompute score and run full_clean()
                    instance.save()

                saved.append(instance.id)

            except Exception as exc:
                logger.warning("bulk_save: failed to save record %s — %s", record, exc)
                errors.append({"record": record, "error": str(exc)})

        # Recompute positions once per unique (subject, term, class, year) combo.
        # Collect combos from successfully-saved records only.
        combos: set[tuple] = set()
        student_class_cache: dict[int, int | None] = {}

        for record in records:
            if "subject" not in record or "term" not in record:
                continue
            try:
                student_id = int(record["student"])
                if student_id not in student_class_cache:
                    student = Student.objects.select_related("school_class").get(id=student_id)
                    student_class_cache[student_id] = student.school_class_id
                class_id = student_class_cache[student_id]
                if class_id:
                    rec_year = int(record.get("year") or year)
                    combos.add((int(record["subject"]), record["term"], class_id, rec_year))
            except Exception as exc:
                logger.warning(
                    "bulk_save: could not resolve class for student %s — %s",
                    record.get("student"),
                    exc,
                )

        for subject_id, term, class_id, yr in combos:
            recompute_subject_positions(subject_id, term, class_id, yr)

        if not saved and errors:
            response_status = status.HTTP_400_BAD_REQUEST
        elif errors:
            response_status = status.HTTP_207_MULTI_STATUS
        else:
            response_status = status.HTTP_200_OK

        return Response(
            {"saved": len(saved), "errors": errors},
            status=response_status,
        )

    # ------------------------------------------------------------------
    # Class summary  GET /api/results/summary/
    # ------------------------------------------------------------------

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        Return a ranked list of all students in a class for a given term/year,
        each with their per-subject breakdown and overall totals.

        Required query params: school_class, term
        Optional query params: year (defaults to current year)
        """
        school_class = request.query_params.get("school_class")
        term         = request.query_params.get("term")
        year         = request.query_params.get("year", _CURRENT_YEAR)

        if not school_class or not term:
            return Response(
                {"error": "school_class and term are required."},
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

        student_map: dict[int, dict] = {}

        for r in results:
            sid        = r.student.id
            level      = detect_grade_level(r.student.school_class)
            score      = r.score or 0
            grade, remark = get_grade_and_remark(score, level)

            if sid not in student_map:
                student_map[sid] = {
                    "student_id":       sid,
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
            level = data["level"]

            rows.append({
                "student_id":       data["student_id"],
                "student_name":     data["student_name"],
                "admission_number": data["admission_number"],
                "subjects":         data["subjects"],
                "total_score":      total,
                "average_score":    avg,
                "overall_grade":    get_overall_grade(avg, level),
                "subject_count":    count,
            })

        rows.sort(key=lambda x: x["total_score"], reverse=True)
        _assign_ranks(rows)
        return Response(rows)


# ---------------------------------------------------------------------------
# Per-student report card
# ---------------------------------------------------------------------------

class StudentReportView(APIView):
    """
    GET  /api/report/student/<id>/  — full report card data
    PATCH /api/report/student/<id>/ — update teacher remarks
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        term = request.query_params.get("term")
        year = int(request.query_params.get("year", _CURRENT_YEAR))
        if not term:
            raise ValidationError({"error": "term is required."})

        student = get_object_or_404(
            Student.objects.select_related("school_class"),
            id=student_id,
        )
        level      = detect_grade_level(student.school_class)

        results = (
            Result.objects
            .filter(student=student, term=term, year=year)
            .select_related("subject")
        )

        subjects    = []
        total_score = 0.0

        for r in results:
            score         = r.score or 0
            grade, remark = get_grade_and_remark(score, level)
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
        average = round(total_score / subject_count, 2) if subject_count else 0

        # ── Class ranking ──────────────────────────────────────────────
        class_totals = (
            Result.objects
            .filter(student__school_class=student.school_class, term=term, year=year)
            .values("student_id")
            .annotate(total=Sum("score"))
            .order_by("-total")
        )
        ranked = list(class_totals)
        _assign_ranks(ranked, key="total")

        # O(1) lookup instead of O(n) linear scan
        rank_map = {row["student_id"]: row["rank"] for row in ranked}
        position = rank_map.get(student.id)

        number_on_roll = len(ranked)

        # ── Attendance ────────────────────────────────────────────────
        att_present = att_total = 0
        if _HAS_ATTENDANCE:
            try:
                att_qs      = AttendanceModel.objects.filter(student=student, term=term, year=year)
                att_total   = att_qs.count()
                att_present = att_qs.filter(status="present").count()
            except Exception:
                logger.exception("Could not load attendance for student %s", student_id)

        att_percent = round((att_present / att_total) * 100, 1) if att_total else 0

        # ── Report remarks ────────────────────────────────────────────
        report = Report.objects.filter(student=student, term=term, year=year).first()

        vacation_date = resumption_date = ""
        if report:
            if report.vacation_date:
                vacation_date = report.vacation_date.isoformat()
            if report.resumption_date:
                resumption_date = report.resumption_date.isoformat()

        # ── Photo ─────────────────────────────────────────────────────
        photo_url = None
        if student.photo:
            try:
                photo_url = student.photo.url
            except Exception:
                logger.warning("Could not resolve photo URL for student %s", student_id)

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
            "subjects":      subjects,
            "total_score":   round(total_score, 2),
            "average_score": average,
            "overall_grade": get_overall_grade(average, level),
            # Position
            "show_position":      level == "basic_7_9",
            "position":           position,
            "position_formatted": fmt_position(position),
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
        year = int(request.data.get("year", _CURRENT_YEAR))
        if not term:
            raise ValidationError({"error": "term is required."})

        student = get_object_or_404(Student, id=student_id)
        report, _ = Report.objects.get_or_create(student=student, term=term, year=year)

        date_fields = {"vacation_date", "resumption_date"}
        editable_fields = [
            "conduct", "attitude", "interest",
            "teacher_remark", "promoted_to",
            *date_fields,
        ]

        for field in editable_fields:
            if field in request.data:
                val = request.data[field]
                # Coerce empty string to None for date fields
                if field in date_fields and val == "":
                    val = None
                setattr(report, field, val)

        report.save()
        return Response({"detail": "Remarks saved."})
