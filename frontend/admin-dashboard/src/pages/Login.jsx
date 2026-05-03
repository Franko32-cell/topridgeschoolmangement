import { useState } from "react";
import {
  FaUser, FaLock, FaUserShield, FaChalkboardTeacher,
  FaUserGraduate, FaClock, FaEnvelope, FaPhone,
  FaChevronDown, FaChevronUp, FaEye, FaEyeSlash,
} from "react-icons/fa";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../services/auth";


// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const ROLES = [
  {
    value:       "admin",
    label:       "Admin",
    icon:        <FaUserShield />,
    hint:        "Use your username",
    placeholder: "Username",
  },
  {
    value:       "teacher",
    label:       "Teacher",
    icon:        <FaChalkboardTeacher />,
    hint:        "Use your Teacher ID",
    placeholder: "Teacher ID",
  },
  {
    value:       "student",
    label:       "Student",
    icon:        <FaUserGraduate />,
    hint:        "Use your Admission Number (TRS-YYYY-NNNN)",
    placeholder: "Admission Number",
  },
];

/** Maps a role value to its dashboard route. */
const ROLE_ROUTES = {
  admin:   "/admin",
  teacher: "/teacher",
  student: "/student",
};

const FORGOT_CONTENT = {
  admin: {
    title:       "Forgot your password?",
    body:        "Admins can reset their password via the registration page, or contact your system administrator for assistance.",
    showContact: false,
  },
  teacher: {
    title:       "Can't access your account?",
    body:        "Teachers cannot reset passwords directly. Please contact the school administration office with your Teacher ID to have your password reset.",
    showContact: true,
  },
  student: {
    title:       "Can't access your account?",
    body:        "Students cannot reset passwords directly. Please visit the administration office with your admission number and a valid school ID to have your password reset.",
    showContact: true,
  },
};

const CONTACT_LINKS = {
  email: { href: "mailto:admin@topridgeschool.edu", label: "Email admin", icon: <FaEnvelope className="text-[10px]" /> },
  phone: { href: "tel:+254712345678",               label: "Call office", icon: <FaPhone    className="text-[10px]" /> },
};


// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

/** Segmented role selector tabs. */
const RoleSelector = ({ role, onChange }) => (
  <div className="flex mb-5 border border-gray-200 rounded-xl overflow-hidden">
    {ROLES.map((r) => (
      <button
        key={r.value}
        type="button"
        onClick={() => onChange(r.value)}
        className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
          role === r.value
            ? "bg-blue-600 text-white"
            : "bg-gray-50 text-gray-500 hover:bg-gray-100"
        }`}
      >
        {r.icon} {r.label}
      </button>
    ))}
  </div>
);

/** Inline hint strip showing what credential to use for the current role. */
const RoleHint = ({ role }) => {
  const selected = ROLES.find((r) => r.value === role);
  if (!selected) return null;
  return (
    <div className="mb-4 p-2.5 bg-blue-50 text-blue-700 rounded-lg text-xs flex items-center gap-2">
      {selected.icon}
      <span>{selected.hint}</span>
    </div>
  );
};

/** Amber banner shown when the admin account is awaiting approval. */
const PendingApprovalBanner = () => (
  <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
    <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm mb-1">
      <FaClock className="flex-shrink-0" /> Account Pending Approval
    </div>
    <p className="text-amber-600 text-xs leading-relaxed">
      Your admin account is awaiting approval. Please contact your system administrator or try again later.
    </p>
  </div>
);

/** Red error banner for failed login attempts. */
const ErrorBanner = ({ message }) => (
  <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm">
    {message}
  </div>
);

/** Input row with a leading icon and optional trailing toggle button. */
const IconInput = ({ leadingIcon, trailingButton, ...inputProps }) => (
  <div className="flex items-center border border-gray-300 rounded-lg px-3 focus-within:ring-2 focus-within:ring-blue-500 transition">
    <span className="text-gray-400 text-xs flex-shrink-0">{leadingIcon}</span>
    <input className="w-full p-3 outline-none text-sm" {...inputProps} />
    {trailingButton}
  </div>
);

/** Collapsible "Forgot password?" section with role-specific guidance. */
const ForgotPasswordPanel = ({ role, visible, onToggle }) => {
  const content = FORGOT_CONTENT[role];

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
        >
          Forgot password?
          {visible
            ? <FaChevronUp   className="text-[10px]" />
            : <FaChevronDown className="text-[10px]" />}
        </button>
      </div>

      {visible && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
          <p className="font-semibold text-amber-900 mb-1">{content.title}</p>
          <p>{content.body}</p>

          {content.showContact && (
            <div className="flex gap-2 mt-3">
              {Object.values(CONTACT_LINKS).map(({ href, label, icon }) => (
                <a
                  key={href}
                  href={href}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white border border-amber-300 rounded-lg text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  {icon} {label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

/** Left-hand branded panel visible on medium+ screens. */
const BrandingPanel = () => (
  <div className="hidden md:flex w-5/12 bg-blue-700 text-white flex-col items-center justify-center p-10">
    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-5">
      <span className="text-2xl font-medium text-white">TR</span>
    </div>
    <h1 className="text-3xl font-medium mb-1 text-center">Top Ridge School</h1>
    <p className="text-blue-300 text-sm mb-10">Centre of distinction</p>

    <div className="space-y-3 w-full max-w-xs">
      {[
        { icon: <FaUserShield />,        text: "Admins — full system access"            },
        { icon: <FaChalkboardTeacher />, text: "Teachers — class, attendance & results" },
        { icon: <FaUserGraduate />,      text: "Students — results, reports & fees"     },
      ].map(({ icon, text }) => (
        <div key={text} className="flex items-center gap-3 text-blue-200 text-sm">
          <span className="text-blue-300 text-xs">{icon}</span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  </div>
);


// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

const INITIAL_FORM_STATE = {
  username:    "",
  password:    "",
  error:       "",
  pending:     false,
  loading:     false,
  showForgot:  false,
  showPassword: false,
};

const Login = () => {
  const navigate = useNavigate();

  const [role, setRole] = useState("student");
  const [form, setForm] = useState(INITIAL_FORM_STATE);

  const selectedRole = ROLES.find((r) => r.value === role);

  // ── Helpers ────────────────────────────────

  const setField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setForm(INITIAL_FORM_STATE);
  };

  // ── Submit ─────────────────────────────────

  const handleLogin = async (e) => {
    e.preventDefault();
    setForm((prev) => ({ ...prev, error: "", pending: false, loading: true }));

    try {
      const user  = await login(form.username, form.password);
      const route = ROLE_ROUTES[user.role] ?? "/";
      navigate(route);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.error === "pending_approval") {
        setField("pending", true);
      } else {
        setField("error", errData?.error || errData?.message || "Invalid credentials. Please try again.");
      }
    } finally {
      setField("loading", false);
    }
  };

  // ── Render ─────────────────────────────────

  return (
    <div className="flex min-h-screen">
      <BrandingPanel />

      <div className="flex flex-1 items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-md p-8">

          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors mb-5"
          >
            ← Back to Home
          </Link>

          <h2 className="text-2xl font-semibold text-gray-800 text-center mb-1">Welcome Back</h2>
          <p className="text-sm text-gray-400 text-center mb-6">Sign in to your portal</p>

          <RoleSelector role={role} onChange={handleRoleChange} />
          <RoleHint role={role} />

          {form.pending && <PendingApprovalBanner />}
          {form.error   && <ErrorBanner message={form.error} />}

          <form onSubmit={handleLogin} className="space-y-3">

            <IconInput
              leadingIcon={<FaUser />}
              type="text"
              placeholder={selectedRole?.placeholder}
              value={form.username}
              onChange={(e) => setField("username", e.target.value)}
              required
            />

            <IconInput
              leadingIcon={<FaLock />}
              type={form.showPassword ? "text" : "password"}
              placeholder="Password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              required
              trailingButton={
                <button
                  type="button"
                  onClick={() => setField("showPassword", !form.showPassword)}
                  className="text-gray-400 hover:text-blue-600 transition-colors ml-2 flex-shrink-0"
                  tabIndex={-1}
                  aria-label={form.showPassword ? "Hide password" : "Show password"}
                >
                  {form.showPassword
                    ? <FaEyeSlash className="text-sm" />
                    : <FaEye      className="text-sm" />}
                </button>
              }
            />

            <ForgotPasswordPanel
              role={role}
              visible={form.showForgot}
              onToggle={() => setField("showForgot", !form.showForgot)}
            />

            <button
              type="submit"
              disabled={form.loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              {form.loading ? "Signing in…" : `Sign in as ${selectedRole?.label}`}
            </button>

          </form>

          {role === "admin" && (
            <p className="text-center text-xs text-gray-400 mt-5">
              New admin?{" "}
              <Link to="/register" className="text-blue-600 hover:underline font-medium">
                Create an account
              </Link>
            </p>
          )}

        </div>
      </div>
    </div>
  );
};

export default Login;
