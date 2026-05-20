"""
api/serializers/result_serializer.py
"""

from rest_framework import serializers

from apps.results.models import Result


class ResultSerializer(serializers.ModelSerializer):
    """
    Serializer for the Result model.

    Read-only computed fields
    ─────────────────────────
    score            — always derived from ca + reopen + exams in Result.save()
    subject_position — recomputed by recompute_subject_positions() in views
    student_name     — convenience denormalization; use student.school_class
                       directly when the class name is needed (no class_name
                       field here; that FK was removed from Result)

    Grade / remark are intentionally excluded — they depend on the student's
    school level (basic_7_9 / basic_1_6 / nursery_kg) and are computed at
    query time in the view, never stored on the model.
    """

    student_name = serializers.SerializerMethodField()
    subject_name = serializers.SerializerMethodField()

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
            "score",
            "subject_position",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "score",
            "subject_position",
            "created_at",
            "updated_at",
        ]

    # ------------------------------------------------------------------
    # Method fields
    # ------------------------------------------------------------------

    def get_student_name(self, obj: Result) -> str:
        return obj.student.full_name if obj.student_id else "—"

    def get_subject_name(self, obj: Result) -> str:
        return obj.subject.name if obj.subject_id else "—"

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate(self, attrs: dict) -> dict:
        """
        Cross-field validation: ensure the three components don't exceed their
        individual caps.  Model validators catch this too (via full_clean in
        save()), but surfacing errors here gives a cleaner API response with
        field-level messages rather than a 500.
        """
        caps = {"ca": 40, "reopen": 20, "exams": 40}
        errors = {}
        for field, cap in caps.items():
            value = attrs.get(field)
            if value is not None and value > cap:
                errors[field] = f"Must be ≤ {cap}. Got {value}."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
