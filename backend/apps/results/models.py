from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from apps.students.models import Student
from apps.subjects.models import Subject
from apps.classes.models import SchoolClass

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TERM_CHOICES = (
    ("term1", "Term 1"),
    ("term2", "Term 2"),
    ("term3", "Term 3"),
)

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

class Result(models.Model):
    student      = models.ForeignKey(Student,     on_delete=models.CASCADE, related_name="results")
    subject      = models.ForeignKey(Subject,     on_delete=models.CASCADE, related_name="results")
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, null=True, blank=True, related_name="results")

    term = models.CharField(max_length=10, choices=TERM_CHOICES)
    year = models.PositiveIntegerField(default=2025)

    # Score components — must match the report columns exactly
    # CLASS SC. (40%) | READING AND RE-OPEN (20%) | EXAMS SCORE (40%)
    ca     = models.FloatField(default=0, validators=[MinValueValidator(0), MaxValueValidator(40)])   # CLASS SC.  40%
    reopen = models.FloatField(default=0, validators=[MinValueValidator(0), MaxValueValidator(20)])   # RE-OPEN    20%
    exams  = models.FloatField(default=0, validators=[MinValueValidator(0), MaxValueValidator(40)])   # EXAMS      40%

    # Computed total — kept read-only via save()
    score = models.FloatField(default=0, editable=False)

    # Class position within the subject (numeric, displayed as-is on report)
    subject_position = models.IntegerField(null=True, blank=True, default=None)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["student", "subject", "term", "year"]
        ordering        = ["-created_at"]

    def __str__(self):
        return f"{self.student} – {self.subject} – {self.score}"

    def save(self, *args, **kwargs):
        self.score = round(self.ca + self.reopen + self.exams, 2)
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

class Report(models.Model):
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="reports",
    )
    term = models.CharField(max_length=10, choices=TERM_CHOICES)
    year = models.PositiveIntegerField(
        validators=[MinValueValidator(2000), MaxValueValidator(2100)],
    )

    # Attendance is now derived from the Attendance model in the API view,
    # but we keep these fields for any legacy / manual overrides.
    attendance       = models.PositiveIntegerField(default=0, validators=[MinValueValidator(0)])
    attendance_total = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])

    # Teacher-editable fields — all appear on the printed report card
    conduct        = models.CharField(max_length=100, blank=True)   # e.g. "GOOD"
    attitude       = models.CharField(max_length=100, blank=True)   # e.g. "RESPECTFUL AND KIND"
    interest       = models.TextField(blank=True)                    # e.g. "R.M.E AND DANCING"
    teacher_remark = models.TextField(blank=True)                    # e.g. "VERY GOOD PERFORMANCE"

    # Promotion — filled in at the end of term
    promoted_to = models.CharField(max_length=100, blank=True)      # e.g. "Basic 4"

    # Term calendar dates
    vacation_date   = models.DateField(null=True, blank=True)        # School Vacates On
    resumption_date = models.DateField(null=True, blank=True)        # School Re-opens On

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["student", "term", "year"]
        ordering        = ["-year", "term"]

    def __str__(self):
        return f"{self.student} – {self.term} {self.year}"
