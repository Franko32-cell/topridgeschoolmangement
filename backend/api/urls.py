class StudentReportPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        from apps.students.models import Student
        from apps.results.models import Result  # adjust import to your actual model path

        student = get_object_or_404(Student, id=student_id)
        term    = request.query_params.get("term", "term1")

        buffer = BytesIO()
        pdf = SimpleDocTemplate(
            buffer,
            pagesize=A5,
            leftMargin=12 * mm, rightMargin=12 * mm,
            topMargin=12 * mm,  bottomMargin=12 * mm,
        )
        elements = []

        # ── Header (reuses existing helpers) ──────────────────────────────────
        logo = load_logo()
        school_block = [
            para("TOP RIDGE SCHOOL",      12, bold=True, color=DGREEN, align=TA_CENTER),
            para("CENTRE OF DISTINCTION",  7, color=LGRAY,             align=TA_CENTER),
            Spacer(1, 1 * mm),
            para("STUDENT REPORT",        10, bold=True, color=BLACK,  align=TA_CENTER),
        ]
        header = Table(
            [[logo or para("", 9), school_block, para("", 9)]],
            colWidths=[18 * mm, W - 36 * mm, 18 * mm],
        )
        header.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), LGREEN),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING",   (0, 0), (0,  0),  5),
        ]))
        elements.append(header)
        elements.append(Spacer(1, 4 * mm))

        # ── Student info ──────────────────────────────────────────────────────
        class_name = student.school_class.name if student.school_class else "—"
        term_label = TERM_LABELS.get(term, term)
        photo      = load_student_photo(student, size=18 * mm)

        info = Table([
            [para("Student",      8, bold=True, color=DGREEN), para(student.full_name,        8)],
            [para("Admission No", 8, bold=True, color=DGREEN), para(student.admission_number, 8)],
            [para("Class",        8, bold=True, color=DGREEN), para(class_name,               8)],
            [para("Term",         8, bold=True, color=DGREEN), para(term_label,               8)],
        ], colWidths=[28 * mm, W - 28 * mm - 22 * mm])
        info.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING",   (0, 0), (-1, -1), 5),
            ("LINEBELOW",     (0, 0), (-1, -2), 0.3, colors.HexColor("#e5e7eb")),
        ]))
        photo_wrapper = Table([[photo or para("", 9)]], colWidths=[20 * mm])
        photo_wrapper.setStyle(TableStyle([
            ("BOX",           (0, 0), (-1, -1), 1.2, DGREEN),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("BACKGROUND",    (0, 0), (-1, -1), LGREEN),
            ("TOPPADDING",    (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        student_card = Table([[info, photo_wrapper]], colWidths=[W - 22 * mm, 22 * mm])
        student_card.setStyle(TableStyle([
            ("BOX",           (0, 0), (-1, -1), 0.6, BORDER),
            ("BACKGROUND",    (0, 0), (-1, -1), OFFWHITE),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(student_card)
        elements.append(Spacer(1, 4 * mm))

        # ── Results table ─────────────────────────────────────────────────────
        elements.append(para("Academic Results", 9, bold=True, color=DGREEN))
        elements.append(Spacer(1, 2 * mm))

        results = Result.objects.filter(
            student=student, term=term
        ).select_related("subject").order_by("subject__name")

        rows = [[
            para("Subject",  8, bold=True, color=DGREEN),
            para("Score",    8, bold=True, color=DGREEN, align=TA_RIGHT),
            para("Grade",    8, bold=True, color=DGREEN, align=TA_RIGHT),
            para("Remarks",  8, bold=True, color=DGREEN),
        ]]

        for r in results:
            rows.append([
                para(r.subject.name, 8),
                para(str(r.score),   8, align=TA_RIGHT),
                para(r.grade,        8, align=TA_RIGHT),
                para(r.remarks or "—", 8),
            ])

        if len(rows) == 1:
            rows.append([para("No results recorded.", 8, color=LGRAY), para(""), para(""), para("")])

        rtbl = Table(rows, colWidths=[W * 0.42, W * 0.13, W * 0.13, W * 0.32])
        rtbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0),  (-1, 0),  LGREEN),
            ("ROWBACKGROUNDS",(0, 1),  (-1, -1), [WHITE, ROW_ALT]),
            ("BOX",           (0, 0),  (-1, -1), 0.6, BORDER),
            ("GRID",          (0, 0),  (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("TOPPADDING",    (0, 0),  (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0),  (-1, -1), 4),
            ("LEFTPADDING",   (0, 0),  (-1, -1), 6),
            ("RIGHTPADDING",  (0, 0),  (-1, -1), 6),
        ]))
        elements.append(rtbl)
        elements.append(Spacer(1, 5 * mm))

        # ── Footer ────────────────────────────────────────────────────────────
        elements.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#e5e7eb")))
        elements.append(Spacer(1, 2 * mm))
        elements.append(para(
            f"Report generated: {timezone.now().strftime('%d %b %Y  %I:%M %p')}",
            7, color=LGRAY, align=TA_CENTER,
        ))
        elements.append(para("Top Ridge School — Centre of Distinction", 7, color=LGRAY, align=TA_CENTER))

        pdf.build(elements)
        pdf_data = buffer.getvalue()
        buffer.close()

        safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", student.full_name.strip()).strip("_")
        filename  = f"report_{safe_name}_{term_label.replace(' ', '_')}.pdf"

        response = HttpResponse(pdf_data, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="{filename}"; filename*=UTF-8\'\'{quote(filename)}'
        )
        return response
