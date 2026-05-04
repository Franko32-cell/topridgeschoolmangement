from rest_framework import serializers
from apps.results.models import Result


class ResultSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    subject_name = serializers.SerializerMethodField()

    # FIX: Removed school_class and class_name entirely — the school_class FK
    # no longer exists on Result (it was removed from the model to avoid silent
    # inconsistency with student.school_class).  Any caller that needs the
    # class name should read student.school_class.name directly.

    class Meta:
        model = Result
        fields = [
            "id",
            "student",
            "student_name",
            "subject",
            "subject_name",
            "term",
            "year",
            "ca",
            "reopen",
            "exams",
            "score",            # computed on model.save(), read-only
            "subject_position",
            "created_at",
        ]
        read_only_fields = ["score", "subject_position", "created_at"]
        # NOTE: grade and remark are intentionally excluded — they depend on the
        # student's school level (B79 / B16 / NKG) and are computed at query
        # time in the view (ResultViewSet / StudentReportView), never stored.

    def get_student_name(self, obj):
        return obj.student.full_name if obj.student else "-"

    def get_subject_name(self, obj):
        return obj.subject.name if obj.subject else "-"
