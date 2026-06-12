import uuid
import secrets
import string
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from apps.teachers.models import Teacher

User = get_user_model()

# ── helpers ────────────────────────────────────────────────────────────────────

def _generate_teacher_id() -> str:
    """Collision-resistant 8-char hex ID prefixed with T-."""
    for _ in range(10):  # retry loop in case of collision
        tid = f"T-{uuid.uuid4().hex[:8].upper()}"
        if not Teacher.objects.filter(teacher_id=tid).exists():
            return tid
    raise RuntimeError("Could not generate a unique teacher ID after 10 attempts.")


# ── serializer ─────────────────────────────────────────────────────────────────

class TeacherSerializer(serializers.ModelSerializer):
    # write-only user fields
    first_name = serializers.CharField(write_only=True, max_length=150)
    last_name  = serializers.CharField(write_only=True, max_length=150)

    # read-only display fields
    teacher_name = serializers.SerializerMethodField()
    subject_name = serializers.SerializerMethodField()
    class_name   = serializers.SerializerMethodField()

    class Meta:
        model  = Teacher
        fields = [
            "id",
            "teacher_id",
            "first_name",
            "last_name",
            "teacher_name",
            "subject",
            "subject_name",
            "school_class",
            "class_name",
            "hire_date",
            "phone",
            "email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["teacher_id", "teacher_name", "subject_name",
                            "class_name", "created_at", "updated_at"]

    # ── read helpers ───────────────────────────────────────────────────────────

    def get_teacher_name(self, obj: Teacher) -> str:
        return obj.full_name

    def get_subject_name(self, obj: Teacher) -> str:
        return obj.subject.name if obj.subject else ""

    def get_class_name(self, obj: Teacher) -> str:
        return obj.school_class.name if obj.school_class else ""

    # ── write operations ───────────────────────────────────────────────────────

    @transaction.atomic
    def create(self, validated_data: dict) -> Teacher:
        first_name = validated_data.pop("first_name")
        last_name  = validated_data.pop("last_name")
        teacher_id = _generate_teacher_id()

        user = User.objects.create_user(
            username=teacher_id.lower(),
            first_name=first_name,
            last_name=last_name,
            password=''.join(secrets.choice(string.ascii_letters + string.digits + string.punctuation) for _ in range(16)),
            is_active=True,
            **{"role": "teacher"} if hasattr(User, "role") else {},
        )

        if hasattr(user, "is_approved"):
            user.is_approved = True
            user.save(update_fields=["is_approved"])

        return Teacher.objects.create(
            teacher_id=teacher_id,
            user=user,
            **validated_data,
        )

    @transaction.atomic
    def update(self, instance: Teacher, validated_data: dict) -> Teacher:
        # Update the linked User's name if provided
        first_name = validated_data.pop("first_name", None)
        last_name  = validated_data.pop("last_name", None)

        if first_name is not None or last_name is not None:
            user = instance.user
            if first_name is not None:
                user.first_name = first_name
            if last_name is not None:
                user.last_name = last_name
            user.save(update_fields=["first_name", "last_name"])

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
