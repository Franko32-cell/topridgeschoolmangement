from django.db import models
from django.utils import timezone
from apps.students.models import Student
from apps.classes.models import SchoolClass


class Attendance(models.Model):

    TERM_CHOICES = [
        ("term1", "Term 1"),
        ("term2", "Term 2"),
        ("term3", "Term 3"),
    ]
    STATUS_CHOICES = [
        ("present", "Present"),
        ("absent",  "Absent"),
        ("late",    "Late"),
    ]

    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="attendances",
    )
    school_class = models.ForeignKey(
        SchoolClass, on_delete=models.CASCADE, related_name="attendances",
    )
    term = models.CharField(max_length=10, choices=TERM_CHOICES, default="term1")
    date = models.DateField(db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        # A student can only have one record per date per class (not just per date)
        unique_together = [["student", "date", "school_class"]]
        ordering = ["-date", "student"]
        indexes = [
            models.Index(fields=["school_class", "date"]),
            models.Index(fields=["student", "date"]),
        ]

    def __str__(self):
        return f"{self.student} – {self.date} – {self.status}"