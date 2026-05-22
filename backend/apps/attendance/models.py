"""
apps/attendance/models.py

Changes vs previous version:
- Added `year` field (PositiveIntegerField, default=timezone.now().year)
- Updated unique_together to include year
- Added composite index on (student, term, year) for report-view queries
"""

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
    year = models.PositiveIntegerField(
        default=2025,
        help_text="Academic year this attendance record belongs to.",
    )
    date = models.DateField(db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        # A student can only have one record per date per class per year
        unique_together = [["student", "date", "school_class", "year"]]
        ordering = ["-date", "student"]
        indexes = [
            models.Index(fields=["school_class", "date"]),
            models.Index(fields=["student", "date"]),
            # Used by StudentReportView when aggregating attendance by term+year
            models.Index(
                fields=["student", "term", "year"],
                name="attendance_student_term_year_idx",
            ),
        ]

    def __str__(self):
        return f"{self.student} – {self.date} – {self.status}"