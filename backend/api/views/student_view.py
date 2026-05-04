from rest_framework.viewsets import ModelViewSet
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated

from apps.students.models import Student
from api.serializers.student_serializer import StudentSerializer


class StudentViewSet(ModelViewSet):
    serializer_class = StudentSerializer
    # Accept multipart so photo uploads work on PUT/PATCH
    parser_classes   = [MultiPartParser, FormParser, JSONParser]

    # FIX: Added IsAuthenticated — previously missing, meaning all student
    # data (photos, DOBs, health notes, parent contacts) was publicly
    # accessible to unauthenticated callers.
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # FIX: Added select_related("user", "school_class") to the base
        # queryset.  The serializer accesses user.username, user.email, and
        # school_class.name on every row; without this each was a separate
        # SQL query (classic N+1 on list endpoints).
        queryset = (
            Student.objects
            .select_related("user", "school_class")
            .all()
        )

        school_class     = self.request.query_params.get("school_class")
        admission_number = self.request.query_params.get("admission_number")

        if school_class:
            queryset = queryset.filter(school_class_id=school_class)
        if admission_number:
            queryset = queryset.filter(admission_number__iexact=admission_number)

        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context
