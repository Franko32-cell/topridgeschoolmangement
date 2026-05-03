from django.db import migrations


def update_lsa_to_trs(apps, schema_editor):
    Student = apps.get_model("students", "Student")

    for student in Student.objects.filter(admission_number__istartswith="LSA-"):
        new_number = "TRS-" + student.admission_number[4:]

        # Skip if the TRS- version already exists (was manually renamed)
        if Student.objects.filter(admission_number=new_number).exists():
            continue

        student.admission_number = new_number
        student.save(update_fields=["admission_number"])


def reverse_trs_to_lsa(apps, schema_editor):
    Student = apps.get_model("students", "Student")

    for student in Student.objects.filter(admission_number__istartswith="TRS-"):
        old_number = "LSA-" + student.admission_number[4:]

        # Skip if the LSA- version already exists
        if Student.objects.filter(admission_number=old_number).exists():
            continue

        student.admission_number = old_number
        student.save(update_fields=["admission_number"])


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0009_alter_student_id"),
    ]

    operations = [
        migrations.RunPython(update_lsa_to_trs, reverse_code=reverse_trs_to_lsa),
    ]