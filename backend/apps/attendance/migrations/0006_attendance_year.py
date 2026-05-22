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
        # Update unique constraint to include year.
        # Use SeparateDatabaseAndState so the database operation can be applied
        # safely even when the original constraint is missing from the current DB.
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE attendance_attendance
                        DROP CONSTRAINT IF EXISTS attendance_attendance_student_id_date_uniq;
                        ALTER TABLE attendance_attendance
                        ADD CONSTRAINT attendance_attendance_student_id_date_school_class_id_year_uniq
                        UNIQUE (student_id, date, school_class_id, year);
                    """,
                    reverse_sql="""
                        ALTER TABLE attendance_attendance
                        DROP CONSTRAINT IF EXISTS attendance_attendance_student_id_date_school_class_id_year_uniq;
                        ALTER TABLE attendance_attendance
                        ADD CONSTRAINT attendance_attendance_student_id_date_uniq
                        UNIQUE (student_id, date);
                    """,
                )
            ],
            state_operations=[
                migrations.AlterUniqueTogether(
                    name="attendance",
                    unique_together={("student", "date", "school_class", "year")},
                )
            ],
        ),
        # Add index for term+year queries (used by report view)
        migrations.AddIndex(
            model_name="attendance",
            index=models.Index(
                fields=["student", "term", "year"],
                name="attendance_st_term_year_idx",
            ),
        ),
    ]