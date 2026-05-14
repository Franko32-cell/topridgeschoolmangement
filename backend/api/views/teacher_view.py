from django.db.models import QuerySet
from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated

from apps.teachers.models import Teacher
from api.serializers.teacher_serializer import TeacherSerializer


class TeacherViewSet(viewsets.ModelViewSet):
    """
    CRUD for Teacher records.

    Supports:
      - ?search=   fuzzy-match on name, teacher_id, subject, class
      - ?ordering= any field (default: last_name, first_name via model Meta)
    """

    serializer_class   = TeacherSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]

    search_fields  = [
        "teacher_id",
        "user__first_name",
        "user__last_name",
        "subject__name",
        "school_class__name",
        "phone",
        "email",
    ]
    ordering_fields = ["hire_date", "teacher_id", "user__last_name"]

    def get_queryset(self) -> QuerySet:
        return (
            Teacher.objects
            .select_related("user", "subject", "school_class")
            .all()
        )