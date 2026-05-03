"""
api/views/dashboard_view.py
GET /api/dashboard/  → summary stats, trends, and recent activity
"""

from django.utils import timezone
from django.db.models import Count, Q
from django.db.models.functions import TruncMonth

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.students.models import Student
from apps.teachers.models import Teacher
from apps.classes.models import SchoolClass
from apps.subjects.models import Subject
from apps.announcements.models import Announcement
from apps.admissions.models import Admission
from apps.fees.models import Fee
from apps.results.models import Result
from apps.attendance.models import Attendance


def _safe_count(queryset):
    """Return queryset count or 0 on any DB error."""
    try:
        return queryset.count()
    except Exception:
        return 0


def _admission_trend(months=6):
    """Monthly admission counts for the last N months."""
    cutoff = timezone.now() - timezone.timedelta(days=months * 30)
    rows = (
        Admission.objects
        .filter(created_at__gte=cutoff)
        .annotate(month=TruncMonth("created_at"))
        .values("month")
        .annotate(count=Count("id"))
        .order_by("month")
    )
    return [
        {
            "month": row["month"].strftime("%b %Y"),
            "count": row["count"],
        }
        for row in rows
    ]


def _recent_admissions(limit=5):
    """Most recent admission applications."""
    qs = (
        Admission.objects
        .order_by("-created_at")[:limit]
    )
    return [
        {
            "id":         a.id,
            "name":       f"{a.first_name} {a.last_name}".strip(),
            "status":     a.status,
            "created_at": a.created_at.isoformat(),
        }
        for a in qs
    ]


def _recent_announcements(limit=5):
    """Most recent announcements."""
    qs = Announcement.objects.order_by("-created_at")[:limit]
    return [
        {
            "id":         a.id,
            "title":      a.title,
            "audience":   getattr(a, "audience", "all"),
            "created_at": a.created_at.isoformat(),
        }
        for a in qs
    ]


def _class_enrollment():
    """Student count per class, ordered by size descending."""
    rows = (
        Student.objects
        .filter(school_class__isnull=False)
        .values("school_class__name")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    return [
        {"class": row["school_class__name"], "students": row["count"]}
        for row in rows
    ]


def _fee_summary():
    """Basic fee collection overview."""
    try:
        total_expected = Fee.objects.aggregate(
            total=__import__("django.db.models", fromlist=["Sum"]).Sum("amount")
        )["total"] or 0
        total_paid = Fee.objects.filter(status="paid").aggregate(
            total=__import__("django.db.models", fromlist=["Sum"]).Sum("amount")
        )["total"] or 0
        return {
            "total_expected": float(total_expected),
            "total_paid":     float(total_paid),
            "outstanding":    float(total_expected - total_paid),
            "paid_count":     _safe_count(Fee.objects.filter(status="paid")),
            "unpaid_count":   _safe_count(Fee.objects.filter(status__in=["unpaid", "pending"])),
        }
    except Exception:
        return {}


def _attendance_today():
    """Today's attendance snapshot."""
    try:
        today = timezone.now().date()
        qs    = Attendance.objects.filter(date=today)
        total   = qs.count()
        present = qs.filter(status="present").count()
        absent  = qs.filter(status="absent").count()
        return {
            "date":            today.isoformat(),
            "total_marked":    total,
            "present":         present,
            "absent":          absent,
            "percent_present": round((present / total) * 100, 1) if total else 0,
        }
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# View
# ---------------------------------------------------------------------------

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now  = timezone.now()
        user = request.user
        role = getattr(user, "role", "admin")

        # ── Core counts (always included) ─────────────────────────────────────
        data = {
            "total_students":     _safe_count(Student.objects),
            "total_teachers":     _safe_count(Teacher.objects),
            "total_classes":      _safe_count(SchoolClass.objects),
            "total_subjects":     _safe_count(Subject.objects),
            "total_announcements":_safe_count(Announcement.objects),

            # Admissions breakdown
            "admissions": {
                "pending":  _safe_count(Admission.objects.filter(status="pending")),
                "approved": _safe_count(Admission.objects.filter(status="approved")),
                "rejected": _safe_count(Admission.objects.filter(status="rejected")),
                "total":    _safe_count(Admission.objects),
            },

            # Results entered this term
            "results_entered": _safe_count(
                Result.objects.filter(year=now.year)
            ),

            # Metadata
            "generated_at": now.isoformat(),
            "role":         role,
        }

        # ── Admin-only enriched data ───────────────────────────────────────────
        if role == "admin":
            data.update({
                "admission_trend":    _admission_trend(months=6),
                "recent_admissions":  _recent_admissions(limit=5),
                "recent_announcements": _recent_announcements(limit=5),
                "class_enrollment":   _class_enrollment(),
                "fee_summary":        _fee_summary(),
                "attendance_today":   _attendance_today(),

                # New this month
                "new_students_this_month": _safe_count(
                    Student.objects.filter(
                        created_at__year=now.year,
                        created_at__month=now.month,
                    )
                ),
                "new_admissions_this_month": _safe_count(
                    Admission.objects.filter(
                        created_at__year=now.year,
                        created_at__month=now.month,
                    )
                ),
            })

        # ── Teacher: scoped to their class ───────────────────────────────────
        elif role == "teacher":
            try:
                teacher = Teacher.objects.select_related(
                    "school_class", "subject"
                ).get(user=user)
                sc = teacher.school_class

                data.update({
                    "my_class":   sc.name if sc else None,
                    "my_subject": teacher.subject.name if teacher.subject else None,
                    "my_students": _safe_count(
                        Student.objects.filter(school_class=sc)
                    ) if sc else 0,
                    "attendance_today": _attendance_today(),
                })
            except Teacher.DoesNotExist:
                pass

        # ── Student: scoped to their own record ──────────────────────────────
        elif role == "student":
            try:
                student = Student.objects.select_related("school_class").get(user=user)
                data.update({
                    "my_class":          student.school_class.name if student.school_class else None,
                    "my_results_count":  _safe_count(
                        Result.objects.filter(student=student, year=now.year)
                    ),
                    "recent_announcements": _recent_announcements(limit=3),
                })
            except Student.DoesNotExist:
                pass

        return Response(data)