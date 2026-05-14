import { useEffect, useState } from "react";
import API from "../services/api";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  subject: "",
  school_class: "",
  hire_date: "",
  phone: "",
  email: "",
};

const Teachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editTeacher, setEditTeacher] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    Promise.all([loadTeachers(), loadSubjects(), loadClasses()]).finally(() =>
      setLoading(false)
    );
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadTeachers = async () => {
    try {
      const res = await API.get("/teachers/");
      setTeachers(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadSubjects = async () => {
    try {
      const res = await API.get("/subjects/");
      setSubjects(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadClasses = async () => {
    try {
      const res = await API.get("/classes/");
      setClasses(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleEditChange = (e) => setEditForm({ ...editForm, [e.target.name]: e.target.value });

  const openEdit = (t) => {
    setEditTeacher(t);
    setEditForm({
      first_name: t.first_name || t.teacher_name?.split(" ")[0] || "",
      last_name: t.last_name || t.teacher_name?.split(" ").slice(1).join(" ") || "",
      subject: t.subject || "",
      school_class: t.school_class || "",
      hire_date: t.hire_date || "",
      phone: t.phone || "",
      email: t.email || "",
    });
  };

  const closeEdit = () => {
    setEditTeacher(null);
    setEditForm(EMPTY_FORM);
  };

  const createTeacher = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        subject: Number(form.subject),
        school_class: Number(form.school_class),
        hire_date: form.hire_date,
        phone: form.phone,
        email: form.email,
      };
      await API.post("/teachers/", payload);
      showToast("Teacher created successfully");
      setForm(EMPTY_FORM);
      loadTeachers();
    } catch (error) {
      showToast(error.response?.data?.detail || "Failed to create teacher", "error");
      console.error(error.response?.data);
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    try {
      const payload = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        subject: Number(editForm.subject),
        school_class: Number(editForm.school_class),
        hire_date: editForm.hire_date,
        phone: editForm.phone,
        email: editForm.email,
      };
      await API.put(`/teachers/${editTeacher.id}/`, payload);
      showToast("Teacher updated successfully");
      closeEdit();
      loadTeachers();
    } catch (error) {
      showToast(error.response?.data?.detail || "Failed to update teacher", "error");
      console.error(error.response?.data);
    } finally {
      setEditSubmitting(false);
    }
  };

  const deleteTeacher = async (id) => {
    try {
      await API.delete(`/teachers/${id}/`);
      setDeleteConfirm(null);
      showToast("Teacher removed successfully");
      loadTeachers();
    } catch (error) {
      showToast("Failed to delete teacher", "error");
      console.error(error);
    }
  };

  const filtered = teachers.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.teacher_name?.toLowerCase().includes(q) ||
      t.teacher_id?.toLowerCase().includes(q) ||
      t.subject_name?.toLowerCase().includes(q) ||
      t.class_name?.toLowerCase().includes(q) ||
      t.phone?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q)
    );
  });

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const avatarColors = ["#4f46e5","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#db2777","#0284c7"];
  const getColor = (str) => avatarColors[(str?.charCodeAt(0) || 0) % avatarColors.length];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        .teachers-root * { box-sizing: border-box; margin: 0; padding: 0; }
        .teachers-root {
          font-family: 'Sora', sans-serif;
          background: #f0f2f8;
          min-height: 100vh;
          padding: 2rem;
          color: #1a1d2e;
        }

        .toast {
          position: fixed; top: 1.5rem; right: 1.5rem; z-index: 1100;
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.875rem 1.25rem; border-radius: 12px;
          font-size: 0.875rem; font-weight: 500;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15);
          animation: slideIn 0.3s ease; max-width: 340px;
        }
        .toast.success { background: #ecfdf5; color: #065f46; border: 1px solid #6ee7b7; }
        .toast.error   { background: #fef2f2; color: #7f1d1d; border: 1px solid #fca5a5; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

        .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
        .page-title { font-size: 1.75rem; font-weight: 700; color: #1a1d2e; display: flex; align-items: center; gap: 0.75rem; }
        .page-title-icon { width: 44px; height: 44px; background: #4f46e5; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.25rem; }
        .page-subtitle { font-size: 0.875rem; color: #64748b; margin-top: 0.125rem; }

        .stats-row { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
        .stat-card { background: white; border-radius: 14px; padding: 1.125rem 1.5rem; border: 1px solid #e2e8f0; flex: 1; min-width: 130px; display: flex; align-items: center; gap: 1rem; }
        .stat-icon { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.125rem; flex-shrink: 0; }
        .stat-label { font-size: 0.75rem; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
        .stat-value { font-size: 1.5rem; font-weight: 700; color: #1a1d2e; line-height: 1.2; }

        .card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.06); overflow: hidden; margin-bottom: 1.5rem; }
        .card-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 0.625rem; }
        .card-header-title { font-size: 1rem; font-weight: 600; color: #1a1d2e; }
        .card-header-icon { color: #4f46e5; font-size: 1rem; }

        .form-body { padding: 1.5rem; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
        .field-group { display: flex; flex-direction: column; gap: 0.375rem; }
        .field-label { font-size: 0.75rem; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; }
        .field-input, .field-select {
          padding: 0.625rem 0.875rem; border: 1.5px solid #e2e8f0;
          border-radius: 10px; font-size: 0.875rem; font-family: 'Sora', sans-serif;
          color: #1a1d2e; background: #f8fafc; transition: all 0.2s; outline: none;
        }
        .field-input:focus, .field-select:focus { border-color: #4f46e5; background: white; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
        .field-input::placeholder { color: #94a3b8; }
        .form-footer { padding: 0 1.5rem 1.5rem; }
        .btn-submit {
          width: 100%; padding: 0.75rem; background: #4f46e5; color: white;
          border: none; border-radius: 10px; font-family: 'Sora', sans-serif;
          font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
        }
        .btn-submit:hover:not(:disabled) { background: #4338ca; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(79,70,229,0.35); }
        .btn-submit:disabled { opacity: 0.65; cursor: not-allowed; }

        .form-section-label {
          font-size: 0.7rem; font-weight: 700; color: #94a3b8;
          text-transform: uppercase; letter-spacing: 0.1em;
          display: flex; align-items: center; gap: 0.5rem;
        }
        .form-section-label::after { content: ''; flex: 1; height: 1px; background: #f1f5f9; }

        .table-toolbar { padding: 1rem 1.5rem; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .search-wrap { position: relative; flex: 1; min-width: 180px; max-width: 320px; }
        .search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.875rem; pointer-events: none; }
        .search-input { width: 100%; padding: 0.5rem 0.75rem 0.5rem 2.25rem; border: 1.5px solid #e2e8f0; border-radius: 8px; font-family: 'Sora', sans-serif; font-size: 0.875rem; color: #1a1d2e; background: #f8fafc; outline: none; transition: all 0.2s; }
        .search-input:focus { border-color: #4f46e5; background: white; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
        .count-badge { font-size: 0.75rem; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 0.25rem 0.75rem; border-radius: 99px; }

        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #f8fafc; }
        th { padding: 0.75rem 1.25rem; text-align: left; font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
        tbody tr { border-bottom: 1px solid #f1f5f9; transition: background 0.15s; }
        tbody tr:last-child { border-bottom: none; }
        tbody tr:hover { background: #f8fafc; }
        td { padding: 0.875rem 1.25rem; font-size: 0.875rem; vertical-align: middle; }

        .avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: white; flex-shrink: 0; }
        .teacher-cell { display: flex; align-items: center; gap: 0.75rem; }
        .teacher-name { font-weight: 600; color: #1a1d2e; }

        .id-badge { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 500; background: #eef2ff; color: #4f46e5; padding: 0.25rem 0.625rem; border-radius: 6px; letter-spacing: 0.03em; }
        .subject-badge { font-size: 0.75rem; font-weight: 600; background: #f0fdf4; color: #166534; padding: 0.25rem 0.625rem; border-radius: 6px; }
        .class-badge { font-size: 0.75rem; font-weight: 600; background: #fff7ed; color: #9a3412; padding: 0.25rem 0.625rem; border-radius: 6px; }
        .date-text { font-size: 0.8rem; color: #64748b; }

        .contact-cell { display: flex; flex-direction: column; gap: 0.3rem; }
        .contact-line { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8rem; color: #475569; }
        .contact-icon { font-size: 0.75rem; flex-shrink: 0; }
        .contact-link { color: #4f46e5; text-decoration: none; font-size: 0.8rem; transition: color 0.15s; }
        .contact-link:hover { color: #4338ca; text-decoration: underline; }
        .contact-empty { font-size: 0.8rem; color: #cbd5e1; font-style: italic; }

        .action-btns { display: flex; gap: 0.5rem; align-items: center; }
        .btn-edit {
          padding: 0.375rem 0.75rem; background: transparent;
          border: 1.5px solid #bfdbfe; color: #1d4ed8;
          border-radius: 8px; font-size: 0.8rem; font-weight: 600;
          font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; gap: 0.375rem;
        }
        .btn-edit:hover { background: #eff6ff; border-color: #1d4ed8; transform: translateY(-1px); }
        .btn-delete {
          padding: 0.375rem 0.75rem; background: transparent;
          border: 1.5px solid #fca5a5; color: #dc2626;
          border-radius: 8px; font-size: 0.8rem; font-weight: 600;
          font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; gap: 0.375rem;
        }
        .btn-delete:hover { background: #fef2f2; border-color: #dc2626; transform: translateY(-1px); }

        .empty-state { padding: 3.5rem 1.5rem; text-align: center; color: #94a3b8; }
        .empty-icon { font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.5; }
        .empty-text { font-size: 0.9rem; font-weight: 500; }

        .loading-state { padding: 3rem; text-align: center; }
        .spinner { width: 36px; height: 36px; border: 3px solid #e2e8f0; border-top-color: #4f46e5; border-radius: 50%; animation: spin 0.75s linear infinite; margin: 0 auto 0.75rem; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 999; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }

        .modal { background: white; border-radius: 16px; padding: 2rem; max-width: 380px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.2); animation: popIn 0.2s ease; }
        .modal-icon { font-size: 2rem; margin-bottom: 0.75rem; }
        .modal-title { font-size: 1.1rem; font-weight: 700; color: #1a1d2e; margin-bottom: 0.5rem; }
        .modal-text { font-size: 0.875rem; color: #64748b; line-height: 1.5; margin-bottom: 1.5rem; }
        .modal-actions { display: flex; gap: 0.75rem; }
        .btn-cancel { flex: 1; padding: 0.625rem; border: 1.5px solid #e2e8f0; background: white; color: #475569; border-radius: 10px; font-family: 'Sora', sans-serif; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-cancel:hover { background: #f8fafc; }
        .btn-danger { flex: 1; padding: 0.625rem; border: none; background: #dc2626; color: white; border-radius: 10px; font-family: 'Sora', sans-serif; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-danger:hover { background: #b91c1c; }

        /* Edit modal */
        .edit-modal {
          background: white; border-radius: 20px;
          max-width: 640px; width: 95%;
          box-shadow: 0 24px 64px rgba(0,0,0,0.2);
          animation: popIn 0.2s ease;
          max-height: 90vh;
          display: flex; flex-direction: column;
        }
        .edit-modal-header {
          padding: 1.5rem 1.75rem 1.25rem;
          border-bottom: 1px solid #f1f5f9;
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
        }
        .edit-modal-title { display: flex; align-items: center; gap: 0.75rem; }
        .edit-modal-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: white; flex-shrink: 0; }
        .edit-modal-name { font-size: 1rem; font-weight: 700; color: #1a1d2e; }
        .edit-modal-sub { font-size: 0.75rem; color: #64748b; margin-top: 0.1rem; }
        .btn-close { width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid #e2e8f0; background: white; cursor: pointer; font-size: 0.9rem; color: #64748b; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
        .btn-close:hover { background: #f8fafc; color: #1a1d2e; border-color: #cbd5e1; }
        .edit-modal-body { padding: 1.5rem 1.75rem; overflow-y: auto; flex: 1; }
        .edit-modal-footer { padding: 1.25rem 1.75rem; border-top: 1px solid #f1f5f9; display: flex; gap: 0.75rem; flex-shrink: 0; }
        .btn-save {
          flex: 1; padding: 0.75rem; background: #4f46e5; color: white;
          border: none; border-radius: 10px; font-family: 'Sora', sans-serif;
          font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
        }
        .btn-save:hover:not(:disabled) { background: #4338ca; box-shadow: 0 4px 12px rgba(79,70,229,0.35); }
        .btn-save:disabled { opacity: 0.65; cursor: not-allowed; }
        .btn-cancel-lg { padding: 0.75rem 1.5rem; border: 1.5px solid #e2e8f0; background: white; color: #475569; border-radius: 10px; font-family: 'Sora', sans-serif; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-cancel-lg:hover { background: #f8fafc; }
      `}</style>

      <div className="teachers-root">

        {/* Toast */}
        {toast && (
          <div className={`toast ${toast.type}`}>
            <span>{toast.type === "success" ? "✓" : "✕"}</span>
            {toast.message}
          </div>
        )}

        {/* Delete Modal */}
        {deleteConfirm && (
          <div className="overlay">
            <div className="modal">
              <div className="modal-icon">🗑️</div>
              <div className="modal-title">Remove Teacher?</div>
              <div className="modal-text">
                This will permanently delete <strong>{deleteConfirm.name}</strong> and all associated records. This action cannot be undone.
              </div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="btn-danger" onClick={() => deleteTeacher(deleteConfirm.id)}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editTeacher && (
          <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
            <div className="edit-modal">
              <div className="edit-modal-header">
                <div className="edit-modal-title">
                  <div className="edit-modal-avatar" style={{ background: getColor(editTeacher.teacher_name) }}>
                    {getInitials(editTeacher.teacher_name)}
                  </div>
                  <div>
                    <div className="edit-modal-name">Edit Teacher</div>
                    <div className="edit-modal-sub">{editTeacher.teacher_name} · {editTeacher.teacher_id}</div>
                  </div>
                </div>
                <button className="btn-close" onClick={closeEdit}>✕</button>
              </div>

              <form onSubmit={saveEdit} style={{ display: "contents" }}>
                <div className="edit-modal-body">
                  <div className="form-grid" style={{ marginBottom: "1.25rem" }}>
                    <div className="field-group">
                      <label className="field-label">First Name</label>
                      <input className="field-input" type="text" name="first_name" value={editForm.first_name} onChange={handleEditChange} required />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Last Name</label>
                      <input className="field-input" type="text" name="last_name" value={editForm.last_name} onChange={handleEditChange} required />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Hire Date</label>
                      <input className="field-input" type="date" name="hire_date" value={editForm.hire_date} onChange={handleEditChange} required />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Subject</label>
                      <select className="field-select" name="subject" value={editForm.subject} onChange={handleEditChange} required>
                        <option value="">Select Subject</option>
                        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Class</label>
                      <select className="field-select" name="school_class" value={editForm.school_class} onChange={handleEditChange} required>
                        <option value="">Select Class</option>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-section-label" style={{ marginBottom: "1rem" }}>Contact Details</div>
                  <div className="form-grid">
                    <div className="field-group">
                      <label className="field-label">📞 Phone Number</label>
                      <input className="field-input" type="tel" name="phone" placeholder="e.g. +233 24 000 0000" value={editForm.phone} onChange={handleEditChange} />
                    </div>
                    <div className="field-group">
                      <label className="field-label">✉️ Email Address</label>
                      <input className="field-input" type="email" name="email" placeholder="e.g. name@school.edu" value={editForm.email} onChange={handleEditChange} />
                    </div>
                  </div>
                </div>

                <div className="edit-modal-footer">
                  <button type="button" className="btn-cancel-lg" onClick={closeEdit}>Cancel</button>
                  <button type="submit" className="btn-save" disabled={editSubmitting}>
                    {editSubmitting
                      ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0 }} /> Saving...</>
                      : <>✓ Save Changes</>
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="page-header">
          <div>
            <div className="page-title">
              <div className="page-title-icon">👨‍🏫</div>
              <div>
                Teachers
                <div className="page-subtitle">Manage staff, subjects and class assignments</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#eef2ff" }}>👨‍🏫</div>
            <div>
              <div className="stat-label">Total Teachers</div>
              <div className="stat-value">{teachers.length}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#f0fdf4" }}>📚</div>
            <div>
              <div className="stat-label">Subjects</div>
              <div className="stat-value">{subjects.length}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#fff7ed" }}>🏫</div>
            <div>
              <div className="stat-label">Classes</div>
              <div className="stat-value">{classes.length}</div>
            </div>
          </div>
        </div>

        {/* Add Teacher Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-header-icon">➕</span>
            <span className="card-header-title">Add New Teacher</span>
          </div>
          <form onSubmit={createTeacher}>
            <div className="form-body">
              <div className="form-grid" style={{ marginBottom: "1rem" }}>
                <div className="field-group">
                  <label className="field-label">First Name</label>
                  <input className="field-input" type="text" name="first_name" placeholder="e.g. Naomi" value={form.first_name} onChange={handleChange} required />
                </div>
                <div className="field-group">
                  <label className="field-label">Last Name</label>
                  <input className="field-input" type="text" name="last_name" placeholder="e.g. Obeng" value={form.last_name} onChange={handleChange} required />
                </div>
                <div className="field-group">
                  <label className="field-label">Hire Date</label>
                  <input className="field-input" type="date" name="hire_date" value={form.hire_date} onChange={handleChange} required />
                </div>
                <div className="field-group">
                  <label className="field-label">Subject</label>
                  <select className="field-select" name="subject" value={form.subject} onChange={handleChange} required>
                    <option value="">Select Subject</option>
                    {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Class</label>
                  <select className="field-select" name="school_class" value={form.school_class} onChange={handleChange} required>
                    <option value="">Select Class</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-section-label" style={{ marginBottom: "1rem" }}>Contact Details</div>
              <div className="form-grid">
                <div className="field-group">
                  <label className="field-label">📞 Phone Number</label>
                  <input className="field-input" type="tel" name="phone" placeholder="e.g. +233 24 000 0000" value={form.phone} onChange={handleChange} />
                </div>
                <div className="field-group">
                  <label className="field-label">✉️ Email Address</label>
                  <input className="field-input" type="email" name="email" placeholder="e.g. naomi.obeng@school.edu" value={form.email} onChange={handleChange} />
                </div>
              </div>
            </div>
            <div className="form-footer">
              <button className="btn-submit" type="submit" disabled={submitting}>
                {submitting ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating...</> : <><span>+</span> Create Teacher</>}
              </button>
            </div>
          </form>
        </div>

        {/* Teachers Table Card */}
        <div className="card">
          <div className="table-toolbar">
            <div className="card-header-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "#4f46e5" }}>📋</span> All Teachers
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input className="search-input" placeholder="Search teachers..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <span className="count-badge">{filtered.length} of {teachers.length}</span>
            </div>
          </div>

          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <div style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading teachers...</div>
            </div>
          ) : (
            <div className="table-wrap">
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
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">
                          <div className="empty-icon">👨‍🏫</div>
                          <div className="empty-text">{search ? "No teachers match your search" : "No teachers yet — add one above"}</div>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="teacher-cell">
                          <div className="avatar" style={{ background: getColor(t.teacher_name) }}>
                            {getInitials(t.teacher_name)}
                          </div>
                          <span className="teacher-name">{t.teacher_name}</span>
                        </div>
                      </td>
                      <td><span className="id-badge">{t.teacher_id}</span></td>
                      <td><span className="subject-badge">{t.subject_name}</span></td>
                      <td><span className="class-badge">{t.class_name}</span></td>
                      <td>
                        {t.phone || t.email ? (
                          <div className="contact-cell">
                            {t.phone && (
                              <div className="contact-line">
                                <span className="contact-icon">📞</span>
                                <a className="contact-link" href={`tel:${t.phone}`}>{t.phone}</a>
                              </div>
                            )}
                            {t.email && (
                              <div className="contact-line">
                                <span className="contact-icon">✉️</span>
                                <a className="contact-link" href={`mailto:${t.email}`}>{t.email}</a>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="contact-empty">No contact info</span>
                        )}
                      </td>
                      <td><span className="date-text">{t.hire_date}</span></td>
                      <td>
                        <div className="action-btns">
                          <button className="btn-edit" onClick={() => openEdit(t)}>
                            ✏️ Edit
                          </button>
                          <button className="btn-delete" onClick={() => setDeleteConfirm({ id: t.id, name: t.teacher_name })}>
                            🗑 Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Teachers;