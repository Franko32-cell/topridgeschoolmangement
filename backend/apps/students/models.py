from django.db import models
from django.conf import settings
from cloudinary.models import CloudinaryField
from apps.classes.models import SchoolClass


class Student(models.Model):

    GENDER_CHOICES = [
        ("Male",   "Male"),
        ("Female", "Female"),
        ("Other",  "Other"),
    ]

    RELIGION_CHOICES = [
        ("Christian",        "Christian"),
        ("Muslim",           "Muslim"),
        ("Other",            "Other"),
        ("Prefer not to say","Prefer not to say"),
    ]

    # ── Core identity ──────────────────────────────────────────
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student_profile",
    )
    admission_number = models.CharField(max_length=50, unique=True)

    # ── Name fields ────────────────────────────────────────────
    student_name = models.CharField(max_length=255, blank=True, default="")
    first_name   = models.CharField(max_length=100, blank=True, default="")
    last_name    = models.CharField(max_length=100, blank=True, default="")

    # ── Class & photo ──────────────────────────────────────────
    school_class = models.ForeignKey(
        SchoolClass,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="students",
    )
    photo = CloudinaryField(
        resource_type="image",
        folder="students",
        blank=True,
        null=True,
    )

    # ── Personal details ───────────────────────────────────────
    gender        = models.CharField(max_length=10,  blank=True, default="", choices=GENDER_CHOICES)
    date_of_birth = models.DateField(null=True, blank=True)
    phone         = models.CharField(max_length=20,  blank=True, default="")
    address       = models.TextField(blank=True, default="")
    nationality   = models.CharField(max_length=100, blank=True, default="")
    religion      = models.CharField(max_length=50,  blank=True, default="", choices=RELIGION_CHOICES)
    health_notes  = models.TextField(blank=True, default="")

    # ── Parent / guardian ──────────────────────────────────────
    parent_name  = models.CharField(max_length=100, blank=True, default="")
    parent_phone = models.CharField(max_length=20,  blank=True, default="")

    # ── Academic history ───────────────────────────────────────
    previous_school = models.CharField(max_length=255, blank=True, default="")
    admission_date  = models.DateField(auto_now_add=True)

    class Meta:
        ordering = ["last_name", "first_name", "user__username"]

    # ── Helpers ────────────────────────────────────────────────
    @property
    def full_name(self):
        if self.first_name or self.last_name:
            return f"{self.first_name} {self.last_name}".strip()
        return (
            self.student_name
            or self.user.get_full_name()
            or self.user.username
        )

    def __str__(self):
        return f"{self.full_name} ({self.admission_number})"
 re
import logging
import secrets
import string

from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from apps.admissions.models import Admission
from api.serializers.admission_serializer import AdmissionSerializer
from apps.students.models import Student
from apps.classes.models import SchoolClass

User = get_user_model()
logger = logging.getLogger(__name__)

# Student ID prefix — TRS = Top Ridge School
# Format: TRS-YYYY-NNNN  e.g. TRS-2025-0001
STUDENT_ID_PREFIX = "TRS"

# Password length for auto-generated student credentials
TEMP_PASSWORD_LENGTH = 12


def _generate_temp_password() -> str:
    """
    Generate a cryptographically random temporary password.
    Using secrets instead of a hardcoded string so credentials
    are not trivially guessable across all new students.
    """
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(TEMP_PASSWORD_LENGTH))


class AdmissionViewSet(ModelViewSet):
    """
    CRUD viewset for student admission applications.

    On approval (PATCH/PUT status → 'approved'), automatically:
      1. Creates a User account with a unique student ID and a random temp password.
      2. Creates a linked Student record, copying the Cloudinary photo reference.
      3. Writes the generated student ID back onto the Admission record.

    All three steps are wrapped in a database transaction so a partial failure
    leaves no orphaned User or Student rows.
    """

    queryset         = Admission.objects.select_related("applied_class").order_by("-application_date")
    serializer_class = AdmissionSerializer
    parser_classes   = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    # ── Create ───────────────────────────────────────────────────────────────

    def perform_create(self, serializer):
        logger.info("[ADMISSION CREATE] FILES: %s", list(self.request.FILES.keys()))
        instance = serializer.save()
        photo_url = instance.photo.url if instance.photo else "none"
        logger.info(
            "[ADMISSION CREATE] id=%s  photo=%s  url=%s",
            instance.id, instance.photo, photo_url,
        )

    # ── Update (triggers student provisioning on approval) ───────────────────

    def perform_update(self, serializer):
        admission = serializer.save()
        logger.info("[ADMISSION UPDATE] id=%s  status=%s", admission.id, admission.status)

        if admission.status != "approved":
            return

        if Student.objects.filter(user__email=admission.email).exists():
            logger.info(
                "[ADMISSION UPDATE] Student already exists for %s — skipping provisioning.",
                admission.email,
            )
            return

        self._provision_student(admission)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _generate_student_id(self) -> str:
        """
        Build a sequential year-scoped student ID: TRS-YYYY-NNNN
        e.g. TRS-2025-0001 (Top Ridge School).
        Scans existing usernames with that year prefix and increments
        the highest found sequence number.
        """
        year = timezone.now().year
        prefix = f"{STUDENT_ID_PREFIX}-{year}-"

        existing = (
            User.objects
            .filter(username__startswith=prefix)
            .values_list("username", flat=True)
        )

        max_seq = 0
        for username in existing:
            tail = username[len(prefix):]
            if tail.isdigit():
                max_seq = max(max_seq, int(tail))

        return f"{prefix}{str(max_seq + 1).zfill(4)}"

    def _resolve_class(self, admission) -> SchoolClass | None:
        """Return the SchoolClass for this admission, or None if unset / deleted."""
        if not admission.applied_class_id:
            return None
        try:
            return SchoolClass.objects.get(id=admission.applied_class_id)
        except SchoolClass.DoesNotExist:
            logger.warning(
                "[RESOLVE CLASS] SchoolClass id=%s not found for admission id=%s",
                admission.applied_class_id, admission.id,
            )
            return None

    def _get_cloudinary_photo_id(self, admission) -> str | None:
        """
        Retrieve the raw Cloudinary public_id stored in the DB for this admission.

        CloudinaryField persists the public_id as a plain string, so we read
        it directly via .values_list() to avoid any descriptor magic that would
        try to build a full URL (which may fail in off-request contexts).
        """
        try:
            raw = (
                Admission.objects
                .filter(pk=admission.pk)
                .values_list("photo", flat=True)
                .first()
            )
            logger.info("[PHOTO COPY] Admission id=%s  raw_photo=%s", admission.pk, raw)
            return raw or None
        except Exception as exc:
            logger.error("[PHOTO COPY] Failed to read photo for admission id=%s: %s", admission.pk, exc)
            return None

    def _parse_name(self, admission) -> tuple[str, str]:
        """
        Extract first_name / last_name, falling back to student_name if the
        dedicated fields are blank (handles older records created before the
        split-name fields were added).
        """
        first = admission.first_name or ""
        last  = admission.last_name  or ""

        if not first and hasattr(admission, "student_name") and admission.student_name:
            parts = admission.student_name.split(" ", 1)
            first = parts[0]
            last  = parts[1] if len(parts) > 1 else ""

        return first.strip(), last.strip()

    # ── Student provisioning ──────────────────────────────────────────────────

    @transaction.atomic
    def _provision_student(self, admission: Admission) -> None:
        """
        Create User + Student records for an approved admission.
        Wrapped in a transaction so any failure rolls back fully.
        """
        student_id   = self._generate_student_id()
        school_class = self._resolve_class(admission)
        first_name, last_name = self._parse_name(admission)
        photo_value  = self._get_cloudinary_photo_id(admission)
        temp_password = _generate_temp_password()

        try:
            user = User.objects.create_user(
                username=student_id,
                email=admission.email,
                password=temp_password,
                first_name=first_name,
                last_name=last_name,
                role="student",
            )

            student = Student.objects.create(
                user=user,
                admission_number=student_id,
                # Name fields
                student_name=f"{first_name} {last_name}".strip(),
                first_name=first_name,
                last_name=last_name,
                # Class & photo
                school_class=school_class,
                photo=photo_value,
                # Personal details
                gender=admission.gender or "",
                date_of_birth=admission.date_of_birth,
                address=admission.address or "",
                nationality=admission.nationality or "",
                religion=admission.religion or "",
                health_notes=admission.health_notes or "",
                # Parent / guardian
                parent_name=admission.parent_name or "",
                parent_phone=admission.phone or "",
                # Academic history
                previous_school=admission.previous_school or "",
            )

            # Write generated ID back to the admission record
            Admission.objects.filter(pk=admission.pk).update(admission_number=student_id)

            logger.info(
                "[PROVISION] Student created — name=%s  id=%s  class=%s  photo=%s",
                student.student_name, student_id,
                school_class.name if school_class else "unassigned",
                photo_value,
            )

            # TODO: send welcome email with temp_password to admission.email

        except Exception as exc:
            logger.error(
                "[PROVISION] Failed for admission id=%s: %s", admission.id, exc,
                exc_info=True,
            )
            raise  # re-raise so the transaction rolls back and DRF returns 500
