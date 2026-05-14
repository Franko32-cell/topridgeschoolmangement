from django.db.models import QuerySet
from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated

from apps.attendance.models import Attendance
from api.serializers.attendance_serializer import AttendanceSerializer


class AttendanceViewSet(viewsets.ModelViewSet):
    """
    CRUD for Attendance records.

    Supports filtering via query params:
      ?date=YYYY-MM-DD
      ?school_class=<id>
      ?student=<id>
      ?term=term1|term2|term3
    """

    serializer_class   = AttendanceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [filters.OrderingFilter]
    ordering_fields    = ["date", "student"]

    def get_queryset(self) -> QuerySet:
        qs = (
            Attendance.objects
            .select_related("student", "school_class", "student__user")
            .all()
        )
        params = self.request.query_params
        if date  := params.get("date"):        qs = qs.filter(date=date)
        if cls   := params.get("school_class"): qs = qs.filter(school_class_id=cls)
        if stu   := params.get("student"):      qs = qs.filter(student_id=stu)
        if term  := params.get("term"):         qs = qs.filter(term=term)
        return qs