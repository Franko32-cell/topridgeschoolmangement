from django.db import migrations


def update_lsa_to_trs(apps, schema_editor):
    Student = apps.get_model("students", "Student")
    students = Student.objects.filter(admission_number__istartswith="LSA-")
    for student in students:
        student.admission_number = "TRS-" + student.admission_number[4:]
        student.save(update_fields=["admission_number"])


def reverse_trs_to_lsa(apps, schema_editor):
    Student = apps.get_model("students", "Student")
    students = Student.objects.filter(admission_number__istartswith="TRS-")
    for student in students:
        student.admission_number = "LSA-" + student.admission_number[4:]
        student.save(update_fields=["admission_number"])


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0009_alter_student_id"),
    ]

    operations = [
        migrations.RunPython(update_lsa_to_trs, reverse_code=reverse_trs_to_lsa),
    ]