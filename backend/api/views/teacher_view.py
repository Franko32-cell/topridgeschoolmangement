from django.db.models import QuerySet
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from apps.teachers.models import Teacher
from api.serializers.teacher_serializer import TeacherSerializer


class TeacherViewSet(viewsets.ModelViewSet):
    """
    CRUD for Teacher records.
    Supports:
      - ?search=   fuzzy-match on name, teacher_id, subject, class
      - ?ordering= any field (default: last_name, first_name via model Meta)

    Extra actions:
      - POST /teachers/{id}/reset_password/  (admin only) → resets to 'teacher123'
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

    def get_permissions(self):
        if self.action == "reset_password":
            return [IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()

    @action(detail=True, methods=["post"], url_path="reset_password")
    def reset_password(self, request, pk=None):
        """Reset a teacher's password to the default 'teacher123'."""
        teacher = self.get_object()
        teacher.user.set_password("teacher123")
        teacher.user.save(update_fields=["password"])
        return Response(
            {"detail": f"Password for {teacher.full_name} has been reset successfully."},
            status=status.HTTP_200_OK,
        )
