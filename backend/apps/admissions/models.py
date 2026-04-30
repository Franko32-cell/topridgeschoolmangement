from django.db import models
from cloudinary.models import CloudinaryField
from apps.classes.models import SchoolClass


class Admission(models.Model):

    STATUS_CHOICES = [
        ("pending",  "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    GENDER_CHOICES = [
        ("Male",   "Male"),
        ("Female", "Female"),
        ("Other",  "Other"),
    ]

    RELIGION_CHOICES = [
        ("Christian",         "Christian"),
        ("Muslim",            "Muslim"),
        ("Other",             "Other"),
        ("Prefer not to say", "Prefer not to say"),
    ]

    # ── Identity ───────────────────────────────────────────────
    first_name   = models.CharField(max_length=100, blank=True, default="")
    last_name    = models.CharField(max_length=100, blank=True, default="")
    student_name = models.CharField(max_length=255, blank=True, default="")
    email        = models.EmailField(unique=True)

    # ── Class ──────────────────────────────────────────────────
    applied_class = models.ForeignKey(
        SchoolClass,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="admissions",
    )

    # ── Photo ──────────────────────────────────────────────────
    photo = CloudinaryField(
        resource_type="image",
        folder="admissions",
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
RELATIONSHIP_CHOICES = [
    ("Father",   "Father"),
    ("Mother",   "Mother"),
    ("Guardian", "Guardian"),
    ("Other",    "Other"),
]

parent_name         = models.CharField(max_length=100, blank=True, default="")
parent_phone        = models.CharField(max_length=20,  blank=True, default="")
relationship        = models.CharField(max_length=50,  blank=True, default="", choices=RELATIONSHIP_CHOICES)

    # ── Academic history ───────────────────────────────────────
    previous_school  = models.CharField(max_length=255, blank=True, default="")
    application_date = models.DateField(auto_now_add=True)

    # ── Status ─────────────────────────────────────────────────
    status           = models.CharField(max_length=20, default="pending", choices=STATUS_CHOICES)
    admission_number = models.CharField(max_length=50, blank=True, default="")

    class Meta:
        ordering = ["-application_date"]

    def __str__(self):
        name = f"{self.first_name} {self.last_name}".strip() or self.student_name or self.email
        return f"{name} ({self.status})"
