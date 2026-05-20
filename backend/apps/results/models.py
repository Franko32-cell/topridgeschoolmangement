"""
results/models.py

Design decisions:
- Result.score is always recomputed on save(); never stored externally.
- school_class is intentionally NOT on Result; use student__school_class for filtering.
- Report.attendance / attendance_total are legacy columns retained for manual
  overrides only; live attendance is derived from the Attendance model in views.
- TERM_CHOICES and GRADE_LEVEL_CHOICES are canonical here; import them elsewhere
  rather than redefining strings.
"""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.students.models import Student
from apps.subjects.models import Subject


# ---------------------------------------------------------------------------
# Choices
# ---------------------------------------------------------------------------

class Term(models.TextChoices):
    TERM1 = "term1", "Term 1"
    TERM2 = "term2", "Term 2"
    TERM3 = "term3", "Term 3"


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

class Result(models.Model):
    """
    One row = one student × one subject × one term × one year.

    Score breakdown
    ───────────────
    ca     : Class Score  (0–40)   CLASS SC.   40 %
    reopen : Re-Open      (0–20)   RE-OPEN     20 %
    exams  : Exams        (0–40)   EXAMS       40 %
    score  : Computed sum (0–100)  read-only, set in save()
    """

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="results",
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name="results",
    )

    term = models.CharField(max_length=10, choices=Term.choices)
    year = models.PositiveIntegerField(
        default=2025,
        validators=[MinValueValidator(2000), MaxValueValidator(2100)],
    )

    ca = models.FloatField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(40)],
        help_text="Class Score component — 40 % of total.",
    )
    reopen = models.FloatField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(20)],
        help_text="Re-Open / Reading component — 20 % of total.",
    )
    exams = models.FloatField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(40)],
        help_text="Examination component — 40 % of total.",
    )

    # Computed field — never set directly; always derived from ca + reopen + exams.
    score = models.FloatField(default=0, editable=False)

    # Per-subject class position; recomputed by recompute_subject_positions().
    subject_position = models.IntegerField(null=True, blank=True, default=None)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["student", "subject", "term", "year"]
        ordering = ["-year", "term", "subject__name"]
        indexes = [
            # Accelerates the class-scoped queries used in views and position recomputation.
            models.Index(
                fields=["term", "year"],
                name="result_term_year_idx",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"{self.student} – {self.subject} – "
            f"{self.get_term_display()} {self.year} – {self.score}"
        )

    def save(self, *args, **kwargs) -> None:
        # Enforce field-level validators even outside form/serializer paths
        # (shell, management commands, tests).  Must run before score is set.
        self.full_clean()
        self.score = round(self.ca + self.reopen + self.exams, 2)
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

class Report(models.Model):
    """
    Per-student teacher remarks and term calendar data.
    One row = one student × one term × one year.

    Attendance columns are legacy / manual-override only.
    Live attendance is read from apps.attendance.Attendance in views.
    """

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="reports",
    )
    term = models.CharField(max_length=10, choices=Term.choices)
    year = models.PositiveIntegerField(
        validators=[MinValueValidator(2000), MaxValueValidator(2100)],
    )

    # Legacy attendance — kept for backward compatibility; not used by the API view.
    attendance = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Legacy manual override. Live value derived from Attendance model.",
    )
    attendance_total = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Legacy manual override. Default 0 so attendance_percent is 0 % before any records exist.",
    )

    # Teacher-editable narrative fields
    conduct        = models.CharField(max_length=100, blank=True)
    attitude       = models.CharField(max_length=100, blank=True)
    interest       = models.TextField(blank=True)
    teacher_remark = models.TextField(blank=True)

    # End-of-term promotion
    promoted_to = models.CharField(max_length=100, blank=True)

    # Term calendar
    vacation_date   = models.DateField(null=True, blank=True)
    resumption_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["student", "term", "year"]
        ordering = ["-year", "term"]

    def __str__(self) -> str:
        return f"{self.student} – {self.get_term_display()} {self.year}"
