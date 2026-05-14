from django.db import IntegrityError
from rest_framework import serializers
from apps.attendance.models import Attendance


class AttendanceSerializer(serializers.ModelSerializer):

    student_name = serializers.SerializerMethodField()
    class_name   = serializers.SerializerMethodField()

    class Meta:
        model  = Attendance
        fields = [
            "id", "student", "student_name",
            "school_class", "class_name",
            "term", "date", "status", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_student_name(self, obj: Attendance) -> str:
        return obj.student.full_name if hasattr(obj.student, "full_name") else str(obj.student)

    def get_class_name(self, obj: Attendance) -> str:
        return obj.school_class.name if obj.school_class else ""

    def create(self, validated_data: dict) -> Attendance:
        """Upsert: update existing record instead of crashing on unique constraint."""
        try:
            instance, _ = Attendance.objects.update_or_create(
                student      = validated_data["student"],
                date         = validated_data["date"],
                school_class = validated_data["school_class"],
                defaults     = {"status": validated_data["status"],
                                "term":   validated_data.get("term", "term1")},
            )
            return instance
        except IntegrityError as e:
            raise serializers.ValidationError({"detail": str(e)})