# api/views/auth_view.py

import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status, viewsets
from rest_framework.decorators import action

from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.models import update_last_login

from rest_framework_simplejwt.tokens import RefreshToken

from apps.students.models import Student
from apps.teachers.models import Teacher

User = get_user_model()
logger = logging.getLogger(__name__)

STUDENT_ID_PREFIX = "TRS"  # Changed from LSA → TRS


# ─────────────────────────────────────────────
# Permission helpers
# ─────────────────────────────────────────────

class IsAdminRole(IsAuthenticated):
    """Only allow authenticated users with role='admin'."""

    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and getattr(request.user, "role", None) == "admin"
        )


# ─────────────────────────────────────────────
# Profile builders  (DRY – used by Login & Me)
# ─────────────────────────────────────────────

def _build_student_profile(user: User) -> dict:
    """Return student profile dict, or {} if no linked Student exists."""
    try:
        student = Student.objects.select_related("school_class").get(user=user)
        return {
            "student_id":       student.id,
            "admission_number": student.admission_number,
            "full_name":        student.full_name,
            "class":            student.school_class.name if student.school_class else None,
            "class_id":         student.school_class.id   if student.school_class else None,
            "photo":            student.photo.url         if student.photo         else None,
        }
    except Student.DoesNotExist:
        logger.warning("No Student record linked to user '%s'.", user.username)
        return {}


def _build_teacher_profile(user: User) -> dict:
    """Return teacher profile dict, or {} if no linked Teacher exists."""
    try:
        teacher = Teacher.objects.select_related("school_class", "subject").get(user=user)
        photo_url = teacher.photo.url if getattr(teacher, "photo", None) else None
        return {
            "teacher_id": teacher.teacher_id,
            "full_name":  teacher.full_name,
            "class":      teacher.school_class.name if teacher.school_class else None,
            "class_id":   teacher.school_class.id   if teacher.school_class else None,
            "subject":    teacher.subject.name       if teacher.subject       else None,
            "subject_id": teacher.subject.id         if teacher.subject       else None,
            "photo":      photo_url,
        }
    except Teacher.DoesNotExist:
        logger.warning("No Teacher record linked to user '%s'.", user.username)
        return {}


def _build_profile(user: User) -> dict:
    """Dispatch to the correct profile builder based on role."""
    if user.role == "student":
        return _build_student_profile(user)
    if user.role == "teacher":
        return _build_teacher_profile(user)
    return {}


def _resolve_username(identifier: str) -> str:
    """
    Accept a plain username, a student admission number (TRS-YYYY-NNNN),
    or a teacher ID and resolve it to the underlying auth username.
    Returns the original identifier unchanged if no match is found.
    """
    # 1. Direct username match
    if User.objects.filter(username=identifier).exists():
        return identifier

    # 2. Student admission number (TRS- prefix)
    try:
        student = Student.objects.get(admission_number__iexact=identifier)
        logger.info(
            "Resolved admission number '%s' → username '%s'",
            identifier, student.user.username,
        )
        return student.user.username
    except Student.DoesNotExist:
        pass

    # 3. Teacher ID
    try:
        teacher = Teacher.objects.get(teacher_id__iexact=identifier)
        logger.info(
            "Resolved teacher ID '%s' → username '%s'",
            identifier, teacher.user.username,
        )
        return teacher.user.username
    except Teacher.DoesNotExist:
        pass

    logger.warning("Could not resolve identifier '%s' to any user.", identifier)
    return identifier


# ─────────────────────────────────────────────
# Auth views
# ─────────────────────────────────────────────

class LoginView(APIView):

    def post(self, request):
        identifier = request.data.get("username", "").strip()
        password   = request.data.get("password", "")

        if not identifier or not password:
            return Response(
                {"error": "Username and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = _resolve_username(identifier)
        user     = authenticate(request=request, username=username, password=password)

        # Use a single generic message to avoid user-enumeration attacks
        if user is None:
            return Response(
                {"error": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            return Response(
                {"error": "Account is disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if user.role == "admin" and not user.is_approved:
            return Response(
                {
                    "error":   "pending_approval",
                    "message": "Your admin account is awaiting approval by an existing administrator.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        update_last_login(None, user)

        refresh = RefreshToken.for_user(user)
        profile = _build_profile(user)

        logger.info("User '%s' (role=%s) logged in successfully.", user.username, user.role)

        return Response(
            {
                "access":  str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id":       user.id,
                    "username": user.username,
                    "email":    user.email,
                    "role":     user.role,
                    **profile,
                },
            },
            status=status.HTTP_200_OK,
        )


class RegisterView(APIView):

    def post(self, request):
        username = request.data.get("username", "").strip()
        email    = request.data.get("email", "").strip()
        password = request.data.get("password", "")

        if not username or not password:
            return Response(
                {"error": "Username and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(password) < 6:
            return Response(
                {"error": "Password must be at least 6 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username=username).exists():
            return Response(
                {"error": "Username already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if email and User.objects.filter(email=email).exists():
            return Response(
                {"error": "Email already in use."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.create_user(
            username=username,
            email=email or None,   # store NULL rather than empty string
            password=password,
            role="admin",
            is_active=False,
            is_approved=False,
        )

        logger.info("New admin registration pending approval: '%s'.", username)

        return Response(
            {
                "message": (
                    "Account created. An existing administrator must approve "
                    "your account before you can log in."
                ),
                "status": "pending_approval",
                "user": {
                    "id":       user.id,
                    "username": user.username,
                    "email":    user.email,
                    "role":     user.role,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user    = request.user
        profile = _build_profile(user)

        return Response({
            "id":          user.id,
            "username":    user.username,
            "email":       user.email,
            "role":        user.role,
            "is_approved": user.is_approved,
            **profile,
        })


# ─────────────────────────────────────────────
# Change Password
# ─────────────────────────────────────────────

class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user         = request.user
        old_password = request.data.get("old_password", "")
        new_password = request.data.get("new_password", "")

        if not old_password or not new_password:
            return Response(
                {"error": "Both old and new passwords are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user.check_password(old_password):
            return Response(
                {"old_password": ["Incorrect password."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(new_password) < 8:
            return Response(
                {"new_password": ["Must be at least 8 characters."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if old_password == new_password:
            return Response(
                {"new_password": ["New password must differ from the old password."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()

        logger.info("Password changed for user: '%s'.", user.username)

        return Response({"detail": "Password updated successfully."})


# ─────────────────────────────────────────────
# Admin approval management
# ─────────────────────────────────────────────

class AdminApprovalViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminRole]

    @staticmethod
    def _serialize_user(user: User) -> dict:
        return {
            "id":          user.id,
            "username":    user.username,
            "email":       user.email,
            "is_approved": user.is_approved,
            "is_active":   user.is_active,
            "date_joined": user.date_joined.isoformat(),
        }

    def list(self, request):
        """Return all pending (unapproved) admin accounts."""
        pending = (
            User.objects
            .filter(role="admin", is_approved=False)
            .order_by("date_joined")
        )
        return Response([self._serialize_user(u) for u in pending])

    @action(detail=False, methods=["get"], url_path="all")
    def all_admins(self, request):
        """Return all other admin accounts (approved or not)."""
        admins = (
            User.objects
            .filter(role="admin")
            .exclude(id=request.user.id)
            .order_by("-date_joined")
        )
        return Response([self._serialize_user(u) for u in admins])

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        user = self._get_admin_or_404(pk)
        if isinstance(user, Response):
            return user

        if user == request.user:
            return Response(
                {"error": "You cannot approve yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.is_approved:
            return Response(
                {"error": "This account is already approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_approved = True
        user.is_active   = True
        user.save(update_fields=["is_approved", "is_active"])

        logger.info("Admin '%s' approved by '%s'.", user.username, request.user.username)

        return Response({
            "message": f"{user.username} has been approved and can now log in.",
            "user":    self._serialize_user(user),
        })

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        user = self._get_admin_or_404(pk)
        if isinstance(user, Response):
            return user

        if user == request.user:
            return Response(
                {"error": "You cannot reject yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = user.username
        user.delete()

        logger.info("Admin account '%s' rejected and deleted by '%s'.", username, request.user.username)

        return Response({"message": f"{username}'s account has been rejected and removed."})

    # ── Internal helper ──────────────────────────────────────────────────────

    @staticmethod
    def _get_admin_or_404(pk) -> "User | Response":
        """Return the User or a 404 Response."""
        try:
            return User.objects.get(pk=pk, role="admin")
        except User.DoesNotExist:
            return Response(
                {"error": "Admin not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
