import { useEffect, useState, useCallback, useMemo } from "react";
import API from "../services/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  subject: "",
  school_class: "",
  hire_date: "",
  phone: "",
  email: "",
};

const PAGE_SIZE = 10;

const AVATAR_COLORS = [
  "#3b4fd8", "#0e8a8a", "#1a7a4a", "#b45309",
  "#be185d", "#6d28d9", "#b91c1c", "#0369a1",
];

// ─── Utilities ────────────────────────────────────────────────────────────────

const getInitials = (name = "") =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";

const getColor = (str = "") =>
  AVATAR_COLORS[(str.charCodeAt(0) || 0) % AVATAR_COLORS.length];

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Toast = ({ toast }) => {
  if (!toast) return null;
  return (
    <div className={`t-toast t-toast--${toast.type}`}>
      <span className="t-toast__icon">{toast.type === "success" ? "✓" : "✕"}</span>
      {toast.message}
    </div>
  );
};

const Avatar = ({ name, size = 36 }) => (
  <div
    className="t-avatar"
    style={{
      background: getColor(name),
      width: size,
      height: size,
      fontSize: size * 0.32,
    }}
  >
    {getInitials(name)}
  </div>
);

const StatCard = ({ icon, label, value, accent }) => (
  <div className="t-stat">
    <div className="t-stat__icon" style={{ background: accent + "18", color: accent }}>
      {icon}
    </div>
    <div>
      <div className="t-stat__label">{label}</div>
      <div className="t-stat__value">{value}</div>
    </div>
  </div>
);

const Skeleton = () => (
  <div className="t-skeleton-wrap">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="t-skeleton-row" style={{ animationDelay: `${i * 80}ms` }}>
        <div className="t-skel t-skel--avatar" />
        <div className="t-skel t-skel--text" style={{ width: "140px" }} />
        <div className="t-skel t-skel--text" style={{ width: "80px" }} />
        <div className="t-skel t-skel--text" style={{ width: "90px" }} />
        <div className="t-skel t-skel--text" style={{ width: "70px" }} />
        <div className="t-skel t-skel--text" style={{ width: "120px" }} />
        <div className="t-skel t-skel--text" style={{ width: "80px" }} />
      </div>
    ))}
  </div>
);

const FieldGroup = ({ label, children }) => (
  <div className="t-field">
    <label className="t-field__label">{label}</label>
    {children}
  </div>
);

const TeacherFormFields = ({ form, onChange, subjects, classes }) => (
  <>
    <div className="t-form-grid">
      <FieldGroup label="First Name">
        <input
          className="t-input"
          type="text"
          name="first_name"
          placeholder="e.g. Naomi"
          value={form.first_name}
          onChange={onChange}
          required
        />
      </FieldGroup>
      <FieldGroup label="Last Name">
        <input
          className="t-input"
          type="text"
          name="last_name"
          placeholder="e.g. Obeng"
          value={form.last_name}
          onChange={onChange}
          required
        />
      </FieldGroup>
      <FieldGroup label="Hire Date">
        <input
          className="t-input"
          type="date"
          name="hire_date"
          value={form.hire_date}
          onChange={onChange}
          required
        />
      </FieldGroup>
      <FieldGroup label="Subject">
        <select
          className="t-input t-input--select"
          name="subject"
          value={form.subject}
          onChange={onChange}
          required
        >
          <option value="">Select subject…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="Class">
        <select
          className="t-input t-input--select"
          name="school_class"
          value={form.school_class}
          onChange={onChange}
          required
        >
          <option value="">Select class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </FieldGroup>
    </div>

    <div className="t-divider-label">Contact Details</div>

    <div className="t-form-grid">
      <FieldGroup label="Phone Number">
        <input
          className="t-input"
          type="tel"
          name="phone"
          placeholder="+233 24 000 0000"
          value={form.phone}
          onChange={onChange}
        />
      </FieldGroup>
      <FieldGroup label="Email Address">
        <input
          className="t-input"
          type="email"
          name="email"
          placeholder="name@school.edu.gh"
          value={form.email}
          onChange={onChange}
        />
      </FieldGroup>
    </div>
  </>
);

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

const DeleteModal = ({ target, onConfirm, onCancel }) => (
  <div className="t-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
    <div className="t-modal">
      <div className="t-modal__emoji">🗑️</div>
      <div className="t-modal__title">Remove Teacher?</div>
      <p className="t-modal__body">
        <strong>{target.name}</strong> will be permanently removed along with all
        associated records. This action cannot be undone.
      </p>
      <div className="t-modal__actions">
        <button className="t-btn t-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="t-btn t-btn--danger" onClick={() => onConfirm(target.id)}>
          Yes, Delete
        </button>
      </div>
    </div>
  </div>
);

// ─── Edit Modal ───────────────────────────────────────────────────────────────

const EditModal = ({ teacher, form, onChange, onSave, onClose, submitting, subjects, classes }) => (
  <div className="t-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="t-edit-modal">
      <div className="t-edit-modal__header">
        <div className="t-edit-modal__who">
          <Avatar name={teacher.teacher_name} size={40} />
          <div>
            <div className="t-edit-modal__name">Edit Teacher</div>
            <div className="t-edit-modal__meta">
              {teacher.teacher_name} · <span className="t-mono">{teacher.teacher_id}</span>
            </div>
          </div>
        </div>
        <button className="t-icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <form onSubmit={onSave} style={{ display: "contents" }}>
        <div className="t-edit-modal__body">
          <TeacherFormFields
            form={form}
            onChange={onChange}
            subjects={subjects}
            classes={classes}
          />
        </div>
        <div className="t-edit-modal__footer">
          <button type="button" className="t-btn t-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="t-btn t-btn--primary" disabled={submitting}>
            {submitting ? (
              <><span className="t-spinner t-spinner--sm" /> Saving…</>
            ) : (
              "✓ Save Changes"
            )}
          </button>
        </div>
      </form>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Teachers = () => {
  const [teachers, setTeachers]         = useState([]);
  const [subjects, setSubjects]         = useState([]);
  const [classes, setClasses]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [submitting, setSubmitting]     = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [toast, setToast]               = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTeacher, setEditTeacher]   = useState(null);
  const [editForm, setEditForm]         = useState(EMPTY_FORM);
  const [search, setSearch]             = useState("");
  const [page, setPage]                 = useState(1);
  const [form, setForm]                 = useState(EMPTY_FORM);

  // ── data loading ──────────────────────────────────────────────────────────

  const loadTeachers = useCallback(async () => {
    const res = await API.get("/teachers/");
    setTeachers(res.data);
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      try {
        await Promise.all([
          loadTeachers(),
          API.get("/subjects/").then((r) => setSubjects(r.data)),
          API.get("/classes/").then((r) => setClasses(r.data)),
        ]);
      } catch (err) {
        showToast("Failed to load data", "error");
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [loadTeachers]);

  // ── toast ─────────────────────────────────────────────────────────────────

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── form handlers ─────────────────────────────────────────────────────────

  const handleChange     = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const handleEditChange = (e) => setEditForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const buildPayload = (f) => ({
    first_name:   f.first_name,
    last_name:    f.last_name,
    subject:      Number(f.subject),
    school_class: Number(f.school_class),
    hire_date:    f.hire_date,
    phone:        f.phone,
    email:        f.email,
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────
const handleResetPassword = async (id, name) => {
  if (!window.confirm(`Reset password for ${name} to "teacher123"?`)) return;
  try {
    await API.post(`/teachers/${id}/reset_password/`);
    showToast(`Password reset for ${name}`);
  } catch {
    showToast("Failed to reset password", "error");
  }
};
  const createTeacher = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await API.post("/teachers/", buildPayload(form));
      showToast("Teacher created successfully");
      setForm(EMPTY_FORM);
      await loadTeachers();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to create teacher", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (t) => {
    setEditTeacher(t);
    setEditForm({
      first_name:   t.teacher_name?.split(" ")[0] ?? "",
      last_name:    t.teacher_name?.split(" ").slice(1).join(" ") ?? "",
      subject:      t.subject      ?? "",
      school_class: t.school_class ?? "",
      hire_date:    t.hire_date    ?? "",
      phone:        t.phone        ?? "",
      email:        t.email        ?? "",
    });
  };

  const closeEdit = () => { setEditTeacher(null); setEditForm(EMPTY_FORM); };

  const saveEdit = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    try {
      await API.put(`/teachers/${editTeacher.id}/`, buildPayload(editForm));
      showToast("Teacher updated successfully");
      closeEdit();
      await loadTeachers();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update teacher", "error");
    } finally {
      setEditSubmitting(false);
    }
  };

  const deleteTeacher = async (id) => {
    try {
      await API.delete(`/teachers/${id}/`);
      setDeleteTarget(null);
      showToast("Teacher removed successfully");
      await loadTeachers();
    } catch {
      showToast("Failed to delete teacher", "error");
    }
  };

  // ── filtering + pagination ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) =>
      [t.teacher_name, t.teacher_id, t.subject_name, t.class_name, t.phone, t.email]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [teachers, search]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated   = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSearch = (e) => { setSearch(e.target.value); setPage(1); };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{CSS}</style>
      <div className="t-root">

        <Toast toast={toast} />

        {deleteTarget && (
          <DeleteModal
            target={deleteTarget}
            onConfirm={deleteTeacher}
            onCancel={() => setDeleteTarget(null)}
          />
        )}

        {editTeacher && (
          <EditModal
            teacher={editTeacher}
            form={editForm}
            onChange={handleEditChange}
            onSave={saveEdit}
            onClose={closeEdit}
            submitting={editSubmitting}
            subjects={subjects}
            classes={classes}
          />
        )}

        {/* ── Page Header ── */}
        <header className="t-page-header">
          <div className="t-page-header__left">
            <div className="t-page-header__icon">👨‍🏫</div>
            <div>
              <h1 className="t-page-title">Teachers</h1>
              <p className="t-page-sub">Manage staff, subjects and class assignments</p>
            </div>
          </div>
        </header>

        {/* ── Stats ── */}
        <div className="t-stats">
          <StatCard icon="👨‍🏫" label="Total Teachers" value={teachers.length}  accent="#3b4fd8" />
          <StatCard icon="📚" label="Subjects"        value={subjects.length}  accent="#0e8a8a" />
          <StatCard icon="🏫" label="Classes"         value={classes.length}   accent="#b45309" />
        </div>

        {/* ── Add Teacher ── */}
        <section className="t-card" aria-labelledby="add-teacher-heading">
          <div className="t-card__header">
            <span className="t-card__header-icon" aria-hidden>➕</span>
            <h2 id="add-teacher-heading" className="t-card__title">Add New Teacher</h2>
          </div>
          <form onSubmit={createTeacher}>
            <div className="t-card__body">
              <TeacherFormFields
                form={form}
                onChange={handleChange}
                subjects={subjects}
                classes={classes}
              />
            </div>
            <div className="t-card__footer">
              <button className="t-btn t-btn--primary t-btn--full" type="submit" disabled={submitting}>
                {submitting
                  ? <><span className="t-spinner t-spinner--sm" /> Creating…</>
                  : "+ Create Teacher"}
              </button>
            </div>
          </form>
        </section>

        {/* ── Teachers Table ── */}
        <section className="t-card" aria-labelledby="teachers-table-heading">
          <div className="t-table-toolbar">
            <div className="t-table-toolbar__left">
              <span aria-hidden>📋</span>
              <h2 id="teachers-table-heading" className="t-card__title">All Teachers</h2>
            </div>
            <div className="t-table-toolbar__right">
              <div className="t-search-wrap">
                <span className="t-search-wrap__icon" aria-hidden>🔍</span>
                <input
                  className="t-search"
                  placeholder="Search teachers…"
                  value={search}
                  onChange={handleSearch}
                  aria-label="Search teachers"
                />
              </div>
              <span className="t-count-badge" aria-live="polite">
                {filtered.length} of {teachers.length}
              </span>
            </div>
          </div>

          {loading ? (
            <Skeleton />
          ) : (
            <>
              <div className="t-table-wrap" role="region" aria-label="Teachers table" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>ID</th>
                      <th>Subject</th>
                      <th>Class</th>
                      <th>Contact</th>
                      <th>Hire Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="t-empty">
                            <div className="t-empty__icon" aria-hidden>👨‍🏫</div>
                            <p className="t-empty__text">
                              {search
                                ? "No teachers match your search."
                                : "No teachers yet — add one above."}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : paginated.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className="t-teacher-cell">
                            <Avatar name={t.teacher_name} />
                            <span className="t-teacher-cell__name">{t.teacher_name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="t-badge t-badge--id t-mono">{t.teacher_id}</span>
                        </td>
                        <td>
                          <span className="t-badge t-badge--subject">{t.subject_name || "—"}</span>
                        </td>
                        <td>
                          <span className="t-badge t-badge--class">{t.class_name || "—"}</span>
                        </td>
                        <td>
                          {t.phone || t.email ? (
                            <div className="t-contact">
                              {t.phone && (
                                <a className="t-contact__line" href={`tel:${t.phone}`}>
                                  <span aria-hidden>📞</span> {t.phone}
                                </a>
                              )}
                              {t.email && (
                                <a className="t-contact__line" href={`mailto:${t.email}`}>
                                  <span aria-hidden>✉️</span> {t.email}
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="t-no-contact">No contact</span>
                          )}
                        </td>
                        <td className="t-date">{formatDate(t.hire_date)}</td>
                        <td>
                          <div className="t-action-btns">
                            <button
                                  className="t-btn t-btn--outline-blue t-btn--sm"
                                  onClick={() => handleResetPassword(t.id, t.teacher_name)}
                                  aria-label={`Reset password for ${t.teacher_name}`}
                                >
                                  🔑 Reset
                                </button>
                            <button
                              className="t-btn t-btn--outline-blue t-btn--sm"
                              onClick={() => openEdit(t)}
                              aria-label={`Edit ${t.teacher_name}`}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              className="t-btn t-btn--outline-red t-btn--sm"
                              onClick={() => setDeleteTarget({ id: t.id, name: t.teacher_name })}
                              aria-label={`Remove ${t.teacher_name}`}
                            >
                              🗑 Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="t-pagination" role="navigation" aria-label="Table pagination">
                  <button
                    className="t-page-btn"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  {[...Array(totalPages)].map((_, i) => (
                    <button
                      key={i}
                      className={`t-page-btn ${currentPage === i + 1 ? "t-page-btn--active" : ""}`}
                      onClick={() => setPage(i + 1)}
                      aria-label={`Page ${i + 1}`}
                      aria-current={currentPage === i + 1 ? "page" : undefined}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    className="t-page-btn"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </div>
              )}
            </>
          )}
        </section>

      </div>
    </>
  );
};

export default Teachers;

// ─── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

.t-root *, .t-root *::before, .t-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

.t-root {
  font-family: 'DM Sans', sans-serif;
  background: #f1f4fb;
  min-height: 100vh;
  padding: 2rem;
  color: #111827;
  --accent: #3b4fd8;
  --accent-hover: #2f3fb0;
  --radius: 14px;
  --radius-sm: 8px;
  --border: #e4e8f0;
  --surface: #ffffff;
  --text-muted: #6b7280;
  --text-dim: #9ca3af;
  --red: #dc2626;
  --red-bg: #fef2f2;
  --red-border: #fca5a5;
  --blue: #1d4ed8;
  --blue-bg: #eff6ff;
  --blue-border: #bfdbfe;
}

/* ── Toast ── */
.t-toast {
  position: fixed; top: 1.25rem; right: 1.25rem; z-index: 1200;
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.75rem 1.125rem; border-radius: 10px;
  font-size: 0.875rem; font-weight: 500; max-width: 320px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  animation: t-slide-in 0.25s ease;
}
.t-toast--success { background: #f0fdf4; color: #14532d; border: 1px solid #86efac; }
.t-toast--error   { background: var(--red-bg); color: #7f1d1d; border: 1px solid var(--red-border); }
.t-toast__icon { font-style: normal; font-weight: 700; }
@keyframes t-slide-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }

/* ── Page Header ── */
.t-page-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 1.75rem; flex-wrap: wrap; gap: 1rem;
}
.t-page-header__left { display: flex; align-items: center; gap: 1rem; }
.t-page-header__icon {
  width: 48px; height: 48px; border-radius: 14px;
  background: var(--accent); display: flex; align-items: center;
  justify-content: center; font-size: 1.375rem; flex-shrink: 0;
}
.t-page-title { font-size: 1.625rem; font-weight: 700; line-height: 1.2; }
.t-page-sub   { font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.125rem; }

/* ── Stats ── */
.t-stats { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.t-stat {
  background: var(--surface); border-radius: var(--radius);
  border: 1px solid var(--border); padding: 1rem 1.375rem;
  display: flex; align-items: center; gap: 0.875rem;
  flex: 1; min-width: 140px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.t-stat__icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.125rem; flex-shrink: 0;
}
.t-stat__label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; }
.t-stat__value { font-size: 1.5rem; font-weight: 700; line-height: 1.2; }

/* ── Card ── */
.t-card {
  background: var(--surface); border-radius: var(--radius);
  border: 1px solid var(--border); overflow: hidden;
  margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.t-card__header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 1.125rem 1.5rem; border-bottom: 1px solid #f3f4f9;
}
.t-card__header-icon { color: var(--accent); }
.t-card__title { font-size: 0.9375rem; font-weight: 600; }
.t-card__body { padding: 1.375rem 1.5rem; }
.t-card__footer { padding: 0 1.5rem 1.375rem; }

/* ── Forms ── */
.t-form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0.875rem; }
.t-field { display: flex; flex-direction: column; gap: 0.3rem; }
.t-field__label {
  font-size: 0.7rem; font-weight: 600; color: #4b5563;
  text-transform: uppercase; letter-spacing: 0.07em;
}
.t-input {
  padding: 0.5625rem 0.8125rem; border: 1.5px solid var(--border);
  border-radius: var(--radius-sm); font-size: 0.875rem;
  font-family: 'DM Sans', sans-serif; color: #111827;
  background: #f9fafb; outline: none; transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  -webkit-appearance: none;
}
.t-input:focus { border-color: var(--accent); background: white; box-shadow: 0 0 0 3px rgba(59,79,216,0.12); }
.t-input::placeholder { color: var(--text-dim); }
.t-input--select { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b7280' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; padding-right: 2rem; }

.t-divider-label {
  font-size: 0.7rem; font-weight: 700; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.1em;
  display: flex; align-items: center; gap: 0.625rem;
  margin: 1.125rem 0 0.875rem;
}
.t-divider-label::after { content: ''; flex: 1; height: 1px; background: #f0f2f8; }

/* ── Buttons ── */
.t-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem;
  font-family: 'DM Sans', sans-serif; font-size: 0.875rem; font-weight: 600;
  border-radius: var(--radius-sm); border: none; cursor: pointer; transition: all 0.18s;
  padding: 0.625rem 1.125rem; white-space: nowrap;
}
.t-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.t-btn--sm { padding: 0.375rem 0.75rem; font-size: 0.8rem; }
.t-btn--full { width: 100%; padding: 0.75rem; font-size: 0.9rem; }
.t-btn--primary { background: var(--accent); color: white; }
.t-btn--primary:hover:not(:disabled) { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(59,79,216,0.3); transform: translateY(-1px); }
.t-btn--ghost { background: white; color: #374151; border: 1.5px solid var(--border); }
.t-btn--ghost:hover:not(:disabled) { background: #f9fafb; }
.t-btn--danger { background: var(--red); color: white; }
.t-btn--danger:hover:not(:disabled) { background: #b91c1c; }
.t-btn--outline-blue { background: transparent; color: var(--blue); border: 1.5px solid var(--blue-border); }
.t-btn--outline-blue:hover { background: var(--blue-bg); border-color: var(--blue); transform: translateY(-1px); }
.t-btn--outline-red { background: transparent; color: var(--red); border: 1.5px solid var(--red-border); }
.t-btn--outline-red:hover { background: var(--red-bg); border-color: var(--red); transform: translateY(-1px); }

/* ── Spinner ── */
.t-spinner {
  display: inline-block; width: 20px; height: 20px;
  border: 2.5px solid rgba(255,255,255,0.3);
  border-top-color: white; border-radius: 50%;
  animation: t-spin 0.7s linear infinite;
}
.t-spinner--sm { width: 14px; height: 14px; border-width: 2px; }
@keyframes t-spin { to { transform: rotate(360deg); } }

/* ── Table ── */
.t-table-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.875rem 1.5rem; border-bottom: 1px solid #f3f4f9;
  flex-wrap: wrap; gap: 0.75rem;
}
.t-table-toolbar__left { display: flex; align-items: center; gap: 0.5rem; }
.t-table-toolbar__right { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }

.t-search-wrap { position: relative; }
.t-search-wrap__icon { position: absolute; left: 0.625rem; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-dim); font-size: 0.8rem; }
.t-search { padding: 0.4375rem 0.75rem 0.4375rem 2rem; border: 1.5px solid var(--border); border-radius: var(--radius-sm); font-family: 'DM Sans', sans-serif; font-size: 0.875rem; color: #111827; background: #f9fafb; outline: none; transition: all 0.15s; width: 220px; }
.t-search:focus { border-color: var(--accent); background: white; box-shadow: 0 0 0 3px rgba(59,79,216,0.1); }
.t-count-badge { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); background: #f3f4f9; padding: 0.25rem 0.625rem; border-radius: 99px; }

.t-table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8f9fc; }
th { padding: 0.625rem 1.25rem; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.09em; border-bottom: 1px solid var(--border); white-space: nowrap; }
tbody tr { border-bottom: 1px solid #f3f4f9; transition: background 0.12s; }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: #f8f9fd; }
td { padding: 0.8125rem 1.25rem; font-size: 0.875rem; vertical-align: middle; }

/* ── Avatar ── */
.t-avatar {
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: white; flex-shrink: 0; letter-spacing: -0.01em;
}

/* ── Table Cells ── */
.t-teacher-cell { display: flex; align-items: center; gap: 0.625rem; }
.t-teacher-cell__name { font-weight: 600; color: #111827; }
.t-mono { font-family: 'DM Mono', monospace; }

.t-badge {
  display: inline-block; font-size: 0.75rem; font-weight: 600;
  padding: 0.2rem 0.575rem; border-radius: 6px;
}
.t-badge--id      { background: #eef0fb; color: var(--accent); font-family: 'DM Mono', monospace; font-size: 0.73rem; }
.t-badge--subject { background: #f0fdf4; color: #166534; }
.t-badge--class   { background: #fff7ed; color: #9a3412; }

.t-contact { display: flex; flex-direction: column; gap: 0.25rem; }
.t-contact__line { display: flex; align-items: center; gap: 0.3125rem; font-size: 0.8rem; color: var(--accent); text-decoration: none; transition: color 0.15s; }
.t-contact__line:hover { color: var(--accent-hover); text-decoration: underline; }
.t-no-contact { font-size: 0.8rem; color: var(--text-dim); font-style: italic; }
.t-date { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }
.t-action-btns { display: flex; gap: 0.5rem; }

/* ── Skeleton ── */
.t-skeleton-wrap { padding: 0.5rem 0; }
.t-skeleton-row {
  display: flex; align-items: center; gap: 1.25rem;
  padding: 0.8125rem 1.25rem;
  border-bottom: 1px solid #f3f4f9;
  animation: t-pulse 1.4s ease-in-out infinite;
}
.t-skel { background: #e9ecf2; border-radius: 6px; height: 14px; flex-shrink: 0; }
.t-skel--avatar { width: 34px; height: 34px; border-radius: 50%; }
.t-skel--text { height: 12px; }
@keyframes t-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* ── Empty State ── */
.t-empty { padding: 3.5rem 1.5rem; text-align: center; }
.t-empty__icon { font-size: 2.25rem; margin-bottom: 0.625rem; opacity: 0.45; }
.t-empty__text { font-size: 0.9rem; color: var(--text-muted); }

/* ── Pagination ── */
.t-pagination { display: flex; align-items: center; justify-content: center; gap: 0.375rem; padding: 1rem; border-top: 1px solid #f3f4f9; }
.t-page-btn {
  min-width: 32px; height: 32px; padding: 0 0.5rem;
  border: 1.5px solid var(--border); background: white;
  border-radius: 8px; font-family: 'DM Sans', sans-serif;
  font-size: 0.875rem; font-weight: 600; color: #374151;
  cursor: pointer; transition: all 0.15s;
}
.t-page-btn:hover:not(:disabled):not(.t-page-btn--active) { background: #f3f4f9; border-color: #c9cde0; }
.t-page-btn--active { background: var(--accent); color: white; border-color: var(--accent); }
.t-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Modals ── */
.t-overlay {
  position: fixed; inset: 0; background: rgba(10,14,36,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 999; backdrop-filter: blur(4px);
  animation: t-fade-in 0.2s ease;
}
@keyframes t-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes t-pop-in  { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }

.t-modal {
  background: white; border-radius: 18px; padding: 1.875rem;
  max-width: 380px; width: 92%;
  box-shadow: 0 24px 64px rgba(0,0,0,0.22);
  animation: t-pop-in 0.22s ease;
}
.t-modal__emoji { font-size: 2rem; margin-bottom: 0.75rem; }
.t-modal__title { font-size: 1.0625rem; font-weight: 700; margin-bottom: 0.5rem; }
.t-modal__body { font-size: 0.875rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.5rem; }
.t-modal__actions { display: flex; gap: 0.625rem; }
.t-modal__actions .t-btn { flex: 1; }

.t-edit-modal {
  background: white; border-radius: 18px;
  max-width: 640px; width: 95%;
  box-shadow: 0 24px 64px rgba(0,0,0,0.22);
  animation: t-pop-in 0.22s ease;
  max-height: 92vh; display: flex; flex-direction: column;
}
.t-edit-modal__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.375rem 1.625rem 1.125rem;
  border-bottom: 1px solid #f3f4f9; flex-shrink: 0;
}
.t-edit-modal__who { display: flex; align-items: center; gap: 0.75rem; }
.t-edit-modal__name { font-size: 0.9375rem; font-weight: 700; }
.t-edit-modal__meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.1rem; }
.t-edit-modal__body { padding: 1.375rem 1.625rem; overflow-y: auto; flex: 1; }
.t-edit-modal__footer {
  display: flex; gap: 0.625rem;
  padding: 1.125rem 1.625rem; border-top: 1px solid #f3f4f9; flex-shrink: 0;
}
.t-edit-modal__footer .t-btn--primary { flex: 1; }

.t-icon-btn {
  width: 30px; height: 30px; border-radius: 7px;
  border: 1.5px solid var(--border); background: white;
  cursor: pointer; font-size: 0.8rem; color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; flex-shrink: 0;
}
.t-icon-btn:hover { background: #f9fafb; color: #111827; border-color: #c9cde0; }

/* ── Responsive ── */
@media (max-width: 640px) {
  .t-root { padding: 1rem; }
  .t-form-grid { grid-template-columns: 1fr; }
  .t-search { width: 160px; }
  .t-stats { gap: 0.75rem; }
  .t-stat { min-width: 100%; }
}
`;
