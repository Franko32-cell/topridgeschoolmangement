"""
apps/attendance/migrations/0006_attendance_year.py

Adds a `year` field to Attendance so records can be filtered by academic year.
Defaults all existing records to 2025 (the previous academic year).

After applying: update unique_together to include year so a student can have
attendance for the same date across different academic years (edge case, but
consistent with how Result and Report are keyed).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        # Update this to match your actual latest attendance migration filename
        ("attendance", "0005_alter_attendance_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="attendance",
            name="year",
            field=models.PositiveIntegerField(
                default=2025,
                help_text="Academic year this attendance record belongs to.",
            ),
        ),
        # Update unique constraint to include year
        migrations.AlterUniqueTogether(
            name="attendance",
            unique_together={("student", "date", "school_class", "year")},
        ),
        # Add index for term+year queries (used by report view)
        migrations.AddIndex(
            model_name="attendance",
            index=models.Index(
                fields=["student", "term", "year"],
                name="attendance_student_term_year_idx",
            ),
        ),
    ]