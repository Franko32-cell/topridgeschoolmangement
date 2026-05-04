from rest_framework import serializers
from apps.students.models import Student


class StudentSerializer(serializers.ModelSerializer):
    # ── Read-only computed fields ──────────────────────────────
    username     = serializers.CharField(source="user.username", read_only=True)
    email        = serializers.EmailField(source="user.email",   read_only=True)
    student_name = serializers.SerializerMethodField()
    class_name   = serializers.CharField(
        source="school_class.name", read_only=True, allow_null=True
    )
    photo_url    = serializers.SerializerMethodField()

    class Meta:
        model  = Student
        fields = [
            # identity
            "id", "username", "email",
            "admission_number", "admission_date",
            # names
            "student_name", "first_name", "last_name",
            # class
            "school_class", "class_name",
            # photo
            "photo", "photo_url",
            # personal
            "gender", "date_of_birth", "phone", "address",
            "nationality", "religion", "health_notes",
            # parent
            "parent_name", "parent_phone",
            # academic history
            "previous_school",
        ]
        extra_kwargs = {
            # FIX: admission_date is auto_now_add=True on the model — making
            # it writable via the API would raise a ValidationError.  Moved
            # to read_only_fields (below) so it is always treated as read-only.

            # FIX: photo is kept writable (CloudinaryField handles the upload)
            # but to_representation already returns the URL in the "photo" key,
            # so callers should use photo_url for display and only PATCH "photo"
            # when uploading a new file.
            "photo":           {"required": False, "allow_null": True},
            "school_class":    {"required": False, "allow_null": True},
            "first_name":      {"required": False},
            "last_name":       {"required": False},
            "gender":          {"required": False},
            "date_of_birth":   {"required": False, "allow_null": True},
            "phone":           {"required": False},
            "address":         {"required": False},
            "nationality":     {"required": False},
            "religion":        {"required": False},
            "health_notes":    {"required": False},
            "parent_name":     {"required": False},
            "parent_phone":    {"required": False},
            "previous_school": {"required": False},
        }
        # FIX: admission_date added to read_only_fields — it is auto_now_add
        # on the model so attempting to write it raises a ValidationError.
        read_only_fields = ["admission_date"]

    # ── Custom field getters ───────────────────────────────────
    def get_student_name(self, obj):
        return obj.full_name

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        try:
            return obj.photo.url
        except Exception:
            return None

    # ── Always serve photo as URL, never raw Cloudinary public-ID ─────────
    # NOTE: This intentionally overwrites the raw "photo" field in the
    # serialized output with the resolved URL so that frontend consumers
    # always receive a ready-to-use image URL rather than a Cloudinary
    # identifier string.  Writes still go through the CloudinaryField normally.
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["photo"] = self.get_photo_url(instance)
        return data
