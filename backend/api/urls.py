from django.urls import path, include
from rest_framework.routers import DefaultRouter

# ── Auth ─────────────────────────────────────────────────────────────────────
from api.views.auth_view import (
    LoginView,
    RegisterView,
    MeView,
    ChangePasswordView,
    AdminApprovalViewSet,
)

# ── Core resources ────────────────────────────────────────────────────────────
from api.views.student_view      import StudentViewSet
from api.views.teacher_view      import TeacherViewSet
from api.views.class_view        import ClassViewSet
from api.views.subject_view      import SubjectViewSet
from api.views.attendance_view   import AttendanceViewSet
from api.views.announcement_view import AnnouncementViewSet
from api.views.admission_view    import AdmissionViewSet
from api.views.fee_view          import FeeViewSet
from api.views.result_view       import ResultViewSet

# ── APIViews ──────────────────────────────────────────────────────────────────
from api.views.dashboard_view    import DashboardView
from api.views.active_users_view import ActiveUsersView
from api.views.report_view       import StudentReportView          # GET/PATCH report data
from api.views.result_view       import StudentReportView as LegacyStudentReportView  # kept for compat

# ── Accounts / finance ────────────────────────────────────────────────────────
from api.views.accounts_view import (
    AccountsDashboardView,
    IncomeLedgerView,
    FeeCollectionReportView,
    DefaultersListView,
)

# ── PDF views ─────────────────────────────────────────────────────────────────
from api.views.admission_form_pdf_view import AdmissionFormPDFView
from api.views.bill_pdf_view import (
    PaymentReceiptPDFView  as BillReceiptPDFView,
    StudentFeeBillPDFView,
    ClassFeeBillPDFView,
)
from api.views.receipt_pdf_view import PaymentReceiptPDFView       # canonical receipt PDF

# ── Router (ViewSets) ─────────────────────────────────────────────────────────
router = DefaultRouter()
router.register(r"students",      StudentViewSet,      basename="student")
router.register(r"teachers",      TeacherViewSet,      basename="teacher")
router.register(r"classes",       ClassViewSet,        basename="class")
router.register(r"subjects",      SubjectViewSet,      basename="subject")
router.register(r"attendance",    AttendanceViewSet,   basename="attendance")
router.register(r"announcements", AnnouncementViewSet, basename="announcement")
router.register(r"admissions",    AdmissionViewSet,    basename="admission")
router.register(r"fees",          FeeViewSet,          basename="fee")
router.register(r"results",       ResultViewSet,       basename="result")
router.register("admin-approvals", AdminApprovalViewSet, basename="approval")

urlpatterns = [
    # ── Router URLs ───────────────────────────────────────────────────────────
    path("", include(router.urls)),

    # ── Auth ──────────────────────────────────────────────────────────────────
    path("auth/login/",           LoginView.as_view(),          name="login"),
    path("auth/register/",        RegisterView.as_view(),       name="register"),
    path("auth/me/",              MeView.as_view(),             name="me"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="change-password"),

    # ── Dashboard ─────────────────────────────────────────────────────────────
    path("dashboard/",            DashboardView.as_view(),      name="dashboard"),
    path("active-users/",         ActiveUsersView.as_view(),    name="active-users"),

    # ── Reports (JSON) ────────────────────────────────────────────────────────
    path("students/<int:student_id>/report/",
         StudentReportView.as_view(), name="student-report"),

    # ── Accounts / finance ────────────────────────────────────────────────────
    path("accounts/dashboard/",       AccountsDashboardView.as_view(),  name="accounts-dashboard"),
    path("accounts/income-ledger/",   IncomeLedgerView.as_view(),       name="income-ledger"),
    path("accounts/fee-collection/",  FeeCollectionReportView.as_view(),name="fee-collection"),
    path("accounts/defaulters/",      DefaultersListView.as_view(),     name="defaulters"),

    # ── PDF downloads ─────────────────────────────────────────────────────────
    path("students/<int:student_id>/report/pdf/",
         StudentReportView.as_view(),       name="student-report-pdf"),
    path("students/<int:student_id>/bill/pdf/",
         StudentFeeBillPDFView.as_view(),   name="student-bill-pdf"),
    path("admissions/<int:admission_id>/form/",
         AdmissionFormPDFView.as_view(),    name="admission-form-pdf"),
    path("fees/class-bill/pdf/",
         ClassFeeBillPDFView.as_view(),     name="class-bill-pdf"),
    path("fees/transactions/<int:transaction_id>/receipt/pdf/",
         PaymentReceiptPDFView.as_view(),   name="receipt-pdf"),

]
