from django.db import models
from django.conf import settings
from apps.subjects.models import Subject
from apps.classes.models import SchoolClass


class Teacher(models.Model):
    teacher_id = models.CharField(max_length=20, unique=True, db_index=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="teacher_profile",
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teachers",
    )
    school_class = models.ForeignKey(
        SchoolClass,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teachers",
    )
    hire_date = models.DateField()
    phone = models.CharField(max_length=30, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)
    class Meta:
        ordering = ["user__last_name", "user__first_name"]
        indexes = [
            models.Index(fields=["hire_date"]),
        ]

    @property
    def full_name(self) -> str:
        return self.user.get_full_name() or self.user.username

    def __str__(self) -> str:
        return f"{self.teacher_id} – {self.full_name}"