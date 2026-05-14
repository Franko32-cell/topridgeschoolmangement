import { useEffect, useState, useCallback, useMemo } from "react";
import API from "../services/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split("T")[0];

const STATUS_CONFIG = {
  present: { label: "✓ Present", color: "#16a34a", bg: "#f0fdf4", border: "#86efac", rowBg: "#f0fdf4", rowBorder: "#16a34a" },
  absent:  { label: "✗ Absent",  color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", rowBg: "#fef2f2", rowBorder: "#dc2626" },
  late:    { label: "⏱ Late",    color: "#d97706", bg: "#fffbeb", border: "#fcd34d", rowBg: "#fffbeb", rowBorder: "#d97706" },
};

const RATE_CONFIG = (rate) => {
  if (rate === null) return { color: "#9ca3af", barColor: "#e5e7eb" };
  if (rate >= 80)   return { color: "#16a34a", barColor: "#22c55e" };
  if (rate >= 60)   return { color: "#d97706", barColor: "#f59e0b" };
  return               { color: "#dc2626", barColor: "#ef4444" };
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const getStudentName = (s) =>
  s?.student_name ||
  [s?.first_name, s?.last_name].filter(Boolean).join(" ") ||
  s?.username || s?.admission_number || "Unknown";

// ─── Sub-components ───────────────────────────────────────────────────────────

const Alert = ({ type, message, onDismiss }) => {
  if (!message) return null;
  const cfg = type === "error"
    ? { bg: "#fef2f2", border: "#fca5a5", color: "#7f1d1d", icon: "✕" }
    : { bg: "#f0fdf4", border: "#86efac", color: "#14532d", icon: "✓" };
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0.75rem 1rem", borderRadius: 10, marginBottom: "1rem",
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
      fontSize: "0.875rem", fontWeight: 500,
    }}>
      <span>{cfg.icon} {message}</span>
      <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: cfg.color, fontSize: "1rem", lineHeight: 1 }}>×</button>
    </div>
  );
};

const StatusToggle = ({ value, onChange }) => (
  <div style={{ display: "flex", gap: "0.375rem", justifyContent: "center" }}>
    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
      const active = value === key;
      return (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: "0.3rem 0.7rem",
            borderRadius: 7,
            fontSize: "0.78rem",
            fontWeight: active ? 700 : 500,
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "all 0.15s",
            border: `1.5px solid ${active ? cfg.color : "#e5e7eb"}`,
            background: active ? cfg.bg : "white",
            color: active ? cfg.color : "#6b7280",
            boxShadow: active ? `0 0 0 2px ${cfg.border}` : "none",
          }}
        >
          {cfg.label}
        </button>
      );
    })}
  </div>
);

const RateBar = ({ rate }) => {
  const cfg = RATE_CONFIG(rate);
  return rate === null ? (
    <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>No records</span>
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
      <div style={{ width: 80, height: 6, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${rate}%`, height: "100%", background: cfg.barColor, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: cfg.color, minWidth: 36 }}>{rate}%</span>
    </div>
  );
};

const Skeleton = ({ rows = 6 }) => (
  <div style={{ padding: "0.5rem 0" }}>
    {[...Array(rows)].map((_, i) => (
      <div key={i} style={{
        display: "flex", gap: "1rem", padding: "0.75rem 1.25rem",
        borderBottom: "1px solid #f3f4f9",
        animation: "a-pulse 1.4s ease-in-out infinite",
        animationDelay: `${i * 70}ms`,
      }}>
        <div style={{ width: 24, height: 12, background: "#e9ecf2", borderRadius: 4, flexShrink: 0 }} />
        <div style={{ width: 140, height: 12, background: "#e9ecf2", borderRadius: 4 }} />
        <div style={{ width: 90, height: 12, background: "#e9ecf2", borderRadius: 4 }} />
        <div style={{ flex: 1, height: 12, background: "#e9ecf2", borderRadius: 4 }} />
      </div>
    ))}
  </div>
);

const DeleteModal = ({ name, onConfirm, onCancel }) => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(10,14,36,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 999, backdropFilter: "blur(4px)", animation: "a-fade 0.2s ease",
  }}>
    <div style={{
      background: "white", borderRadius: 18, padding: "1.75rem",
      maxWidth: 360, width: "92%", boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
      animation: "a-pop 0.2s ease",
    }}>
      <div style={{ fontSize: "2rem", marginBottom: "0.625rem" }}>🗑️</div>
      <div style={{ fontWeight: 700, fontSize: "1.0625rem", marginBottom: "0.5rem" }}>Delete Record?</div>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", lineHeight: 1.6, marginBottom: "1.375rem" }}>
        This will permanently remove the attendance record for <strong>{name}</strong> on the selected date.
      </p>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <button onClick={onCancel} style={ghostBtnStyle}>Cancel</button>
        <button onClick={onConfirm} style={dangerBtnStyle}>Yes, Delete</button>
      </div>
    </div>
  </div>
);

// ─── Button style helpers ─────────────────────────────────────────────────────

const ghostBtnStyle = {
  flex: 1, padding: "0.625rem", border: "1.5px solid #e5e7eb",
  background: "white", color: "#374151", borderRadius: 10,
  fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
};
const dangerBtnStyle = {
  flex: 1, padding: "0.625rem", border: "none",
  background: "#dc2626", color: "white", borderRadius: 10,
  fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
};

// ─── Tab: Mark Attendance ─────────────────────────────────────────────────────

const MarkAttendanceTab = ({
  students, attendance, existingIds,
  loadingStudents, saving,
  onStatusChange, onDelete, onSave,
}) => {
  const [deleteTarget, setDeleteTarget] = useState(null);

  const counts = useMemo(() =>
    Object.values(attendance).reduce((acc, s) => ({ ...acc, [s]: (acc[s] || 0) + 1 }), {}),
    [attendance]
  );

  if (loadingStudents) return <Skeleton />;
  if (!students.length) return (
    <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "0.625rem", opacity: 0.5 }}>👥</div>
      <p style={{ fontSize: "0.9rem" }}>No students found for this class.</p>
    </div>
  );

  return (
    <>
      {deleteTarget && (
        <DeleteModal
          name={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { onDelete(deleteTarget.id); setDeleteTarget(null); }}
        />
      )}

      {/* Summary bar */}
      <div style={{ display: "flex", gap: "1.25rem", padding: "0.875rem 1.5rem", borderBottom: "1px solid #f3f4f9", flexWrap: "wrap" }}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} style={{ fontSize: "0.8rem", fontWeight: 600, color: cfg.color }}>
            {cfg.label.split(" ")[1]}: {counts[key] || 0}
          </span>
        ))}
        <span style={{ fontSize: "0.8rem", color: "#9ca3af", marginLeft: "auto" }}>
          Total: {students.length}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8f9fc" }}>
              {["#", "Student", "Admission No.", "Status", "Action"].map((h) => (
                <th key={h} style={{
                  padding: "0.625rem 1.25rem", textAlign: h === "Status" || h === "Action" ? "center" : "left",
                  fontSize: "0.68rem", fontWeight: 700, color: "#6b7280",
                  textTransform: "uppercase", letterSpacing: "0.09em",
                  borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student, idx) => {
              const status = attendance[student.id];
              const cfg    = STATUS_CONFIG[status] || {};
              const saved  = !!existingIds[student.id];
              return (
                <tr key={student.id} style={{
                  borderBottom: "1px solid #f3f4f9",
                  borderLeft: `4px solid ${cfg.rowBorder || "transparent"}`,
                  background: cfg.rowBg || "white",
                  transition: "background 0.15s",
                }}>
                  <td style={{ padding: "0.75rem 1.25rem", color: "#9ca3af", fontSize: "0.8rem" }}>{idx + 1}</td>
                  <td style={{ padding: "0.75rem 1.25rem", fontWeight: 600 }}>
                    {getStudentName(student)}
                    {saved && (
                      <span style={{
                        marginLeft: 6, fontSize: "0.68rem", fontWeight: 600,
                        background: "#dcfce7", color: "#15803d",
                        padding: "1px 6px", borderRadius: 99,
                      }}>saved</span>
                    )}
                  </td>
                  <td style={{ padding: "0.75rem 1.25rem", color: "#6b7280", fontSize: "0.8rem", fontFamily: "monospace" }}>
                    {student.admission_number || "—"}
                  </td>
                  <td style={{ padding: "0.75rem 1.25rem" }}>
                    <StatusToggle value={status} onChange={(val) => onStatusChange(student.id, val)} />
                  </td>
                  <td style={{ padding: "0.75rem 1.25rem", textAlign: "center" }}>
                    {saved && (
                      <button
                        onClick={() => setDeleteTarget({ id: student.id, name: getStudentName(student) })}
                        style={{
                          padding: "0.3rem 0.7rem", borderRadius: 7, fontSize: "0.78rem",
                          fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                          background: "white", color: "#dc2626",
                          border: "1.5px solid #fca5a5", transition: "all 0.15s",
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = "#fef2f2"; }}
                        onMouseOut={(e)  => { e.currentTarget.style.background = "white"; }}
                      >
                        🗑 Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "1.25rem 1.5rem", borderTop: "1px solid #f3f4f9" }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: "0.75rem 2rem", background: saving ? "#818cf8" : "#3b4fd8",
            color: "white", border: "none", borderRadius: 10,
            fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer", transition: "background 0.2s",
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
          }}
        >
          {saving ? <><span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "a-spin 0.7s linear infinite" }} /> Saving…</> : "Save Attendance"}
        </button>
      </div>
    </>
  );
};

// ─── Tab: Student Summary ─────────────────────────────────────────────────────

const StudentSummaryTab = ({ summaryData, loading, hasClass }) => {
  if (!hasClass) return <p style={{ color: "#9ca3af", padding: "2rem 1.5rem" }}>Select a class to view the attendance summary.</p>;
  if (loading)   return <Skeleton />;
  if (!summaryData.length) return <p style={{ color: "#9ca3af", padding: "2rem 1.5rem" }}>No attendance records found for this class yet.</p>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8f9fc" }}>
            {["#", "Student", "Present", "Absent", "Late", "Total Days", "Attendance Rate"].map((h) => (
              <th key={h} style={{
                padding: "0.625rem 1.25rem",
                textAlign: ["Present","Absent","Late","Total Days","Attendance Rate"].includes(h) ? "center" : "left",
                fontSize: "0.68rem", fontWeight: 700, color: "#6b7280",
                textTransform: "uppercase", letterSpacing: "0.09em",
                borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summaryData.map(({ student, present, absent, late, total, rate }, idx) => (
            <tr key={student.id} style={{ borderBottom: "1px solid #f3f4f9", transition: "background 0.12s" }}
              onMouseOver={(e) => { e.currentTarget.style.background = "#f8f9fc"; }}
              onMouseOut={(e)  => { e.currentTarget.style.background = "white"; }}
            >
              <td style={{ padding: "0.8125rem 1.25rem", color: "#9ca3af", fontSize: "0.8rem" }}>{idx + 1}</td>
              <td style={{ padding: "0.8125rem 1.25rem", fontWeight: 600 }}>{getStudentName(student)}</td>
              <td style={{ padding: "0.8125rem 1.25rem", textAlign: "center", color: "#16a34a", fontWeight: 700 }}>{present}</td>
              <td style={{ padding: "0.8125rem 1.25rem", textAlign: "center", color: "#dc2626", fontWeight: 700 }}>{absent}</td>
              <td style={{ padding: "0.8125rem 1.25rem", textAlign: "center", color: "#d97706", fontWeight: 700 }}>{late}</td>
              <td style={{ padding: "0.8125rem 1.25rem", textAlign: "center", color: "#374151" }}>{total}</td>
              <td style={{ padding: "0.8125rem 1.25rem" }}><RateBar rate={rate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const Attendance = () => {
  const [classes, setClasses]               = useState([]);
  const [selectedClass, setSelectedClass]   = useState("");
  const [selectedDate, setSelectedDate]     = useState(todayStr());
  const [students, setStudents]             = useState([]);
  const [attendance, setAttendance]         = useState({});
  const [existingIds, setExistingIds]       = useState({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [summaryData, setSummaryData]       = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [activeTab, setActiveTab]           = useState("Mark Attendance");
  const [alert, setAlert]                   = useState(null); // { type, message }

  const showAlert = useCallback((message, type = "success") => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 4000);
  }, []);

  // ── Load classes ──────────────────────────────────────────────────────────

  useEffect(() => {
    API.get("/classes/")
      .then((r) => setClasses(r.data.results ?? r.data))
      .catch(() => showAlert("Failed to load classes.", "error"));
  }, []);

  // ── Load students + existing attendance ───────────────────────────────────

  const fetchStudents = useCallback(async (classId, date) => {
    if (!classId || !date) return;
    setLoadingStudents(true);
    setAlert(null);
    try {
      const [studRes, attRes] = await Promise.all([
        API.get(`/students/?school_class=${classId}`),
        API.get(`/attendance/?date=${date}&school_class=${classId}`),
      ]);
      const studentList = studRes.data.results ?? studRes.data;
      const existing    = attRes.data.results  ?? attRes.data;

      const defaults = {};
      const ids      = {};
      studentList.forEach((s) => {
        const record = existing.find(
          (a) => String(a.student) === String(s.id) || String(a.student_id) === String(s.id)
        );
        defaults[s.id] = record?.status ?? "present";
        if (record) ids[s.id] = record.id;
      });

      setStudents(studentList);
      setAttendance(defaults);
      setExistingIds(ids);
    } catch {
      showAlert("Failed to load students.", "error");
    } finally {
      setLoadingStudents(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (selectedClass && selectedDate) fetchStudents(selectedClass, selectedDate);
  }, [selectedClass, selectedDate, fetchStudents]);

  // ── Load summary ──────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async (classId) => {
    if (!classId) return;
    setLoadingSummary(true);
    try {
      const [studRes, attRes] = await Promise.all([
        API.get(`/students/?school_class=${classId}`),
        API.get(`/attendance/?school_class=${classId}`),
      ]);
      const classStudents = studRes.data.results ?? studRes.data;
      const records       = attRes.data.results  ?? attRes.data;

      const summary = classStudents.map((student) => {
        const sr      = records.filter((a) => String(a.student) === String(student.id));
        const present = sr.filter((a) => a.status === "present").length;
        const absent  = sr.filter((a) => a.status === "absent").length;
        const late    = sr.filter((a) => a.status === "late").length;
        const total   = sr.length;
        const rate    = total > 0 ? Math.round(((present + late) / total) * 100) : null;
        return { student, present, absent, late, total, rate };
      });
      setSummaryData(summary);
    } catch {
      showAlert("Failed to load attendance summary.", "error");
    } finally {
      setLoadingSummary(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (activeTab === "Student Summary" && selectedClass) fetchSummary(selectedClass);
  }, [activeTab, selectedClass, fetchSummary]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleClassChange = (e) => {
    setSelectedClass(e.target.value);
    setStudents([]); setAttendance({}); setExistingIds({});
    setSummaryData([]); setAlert(null);
  };

  const handleStatusChange = (studentId, status) =>
    setAttendance((prev) => ({ ...prev, [studentId]: status }));

  const handleDelete = async (studentId) => {
    const recordId = existingIds[studentId];
    if (!recordId) return;
    try {
      await API.delete(`/attendance/${recordId}/`);
      setAttendance((prev) => { const n = { ...prev }; delete n[studentId]; return n; });
      setExistingIds((prev) => { const n = { ...prev }; delete n[studentId]; return n; });
      showAlert("Attendance record deleted.");
      if (activeTab === "Student Summary") fetchSummary(selectedClass);
    } catch {
      showAlert("Failed to delete attendance record.", "error");
    }
  };

  // Uses PATCH/PUT for existing records, POST for new ones — no unique constraint crashes
  const submitAttendance = async () => {
    if (!selectedClass || !selectedDate) { showAlert("Please select a class and a date.", "error"); return; }
    if (!students.length) { showAlert("No students to save attendance for.", "error"); return; }
    setSaving(true);
    try {
      await Promise.all(
        students.map((s) => {
          const payload = {
            student: s.id,
            school_class: selectedClass,
            date: selectedDate,
            status: attendance[s.id] ?? "present",
          };
          return existingIds[s.id]
            ? API.patch(`/attendance/${existingIds[s.id]}/`, { status: payload.status })
            : API.post("/attendance/", payload);
        })
      );
      showAlert("Attendance saved successfully.");
      await fetchStudents(selectedClass, selectedDate);
      if (activeTab === "Student Summary") fetchSummary(selectedClass);
    } catch (err) {
      const detail = err.response?.data?.detail
        || Object.values(err.response?.data || {}).flat().join(" ")
        || "Error saving attendance.";
      showAlert(detail, "error");
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes a-spin  { to { transform: rotate(360deg); } }
        @keyframes a-fade  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes a-pop   { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes a-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", padding: "2rem", background: "#f1f4fb", minHeight: "100vh", color: "#111827" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.75rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "#3b4fd8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.375rem", flexShrink: 0 }}>
            📋
          </div>
          <div>
            <h1 style={{ fontSize: "1.625rem", fontWeight: 700, lineHeight: 1.2 }}>Attendance</h1>
            <p style={{ fontSize: "0.8125rem", color: "#6b7280", marginTop: 2 }}>Track and manage daily class attendance</p>
          </div>
        </div>

        <Alert type={alert?.type} message={alert?.message} onDismiss={() => setAlert(null)} />

        {/* Controls */}
        <div style={{
          background: "white", borderRadius: 16, border: "1px solid #e4e8f0",
          padding: "1.125rem 1.5rem", marginBottom: "1.5rem",
          display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em" }}>Class</label>
            <select
              value={selectedClass}
              onChange={handleClassChange}
              style={{ padding: "0.5625rem 0.875rem", border: "1.5px solid #e4e8f0", borderRadius: 8, fontFamily: "inherit", fontSize: "0.875rem", color: "#111827", background: "#f9fafb", outline: "none", minWidth: 160 }}
            >
              <option value="">Select class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em" }}>Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ padding: "0.5625rem 0.875rem", border: "1.5px solid #e4e8f0", borderRadius: 8, fontFamily: "inherit", fontSize: "0.875rem", color: "#111827", background: "#f9fafb", outline: "none" }}
            />
          </div>
        </div>

        {/* Main card */}
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #e4e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" }}>

          {/* Tabs */}
          {selectedClass && (
            <div style={{ display: "flex", borderBottom: "1px solid #f3f4f9" }}>
              {["Mark Attendance", "Student Summary"].map((tab) => {
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: "0.875rem 1.375rem", background: "none", border: "none",
                      borderBottom: `2.5px solid ${active ? "#3b4fd8" : "transparent"}`,
                      color: active ? "#3b4fd8" : "#6b7280",
                      fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600,
                      cursor: "pointer", transition: "all 0.15s",
                      marginBottom: -1,
                    }}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
          )}

          {!selectedClass ? (
            <div style={{ padding: "3.5rem", textAlign: "center", color: "#9ca3af" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.625rem", opacity: 0.4 }}>📋</div>
              <p style={{ fontSize: "0.9rem" }}>Select a class above to get started.</p>
            </div>
          ) : activeTab === "Mark Attendance" ? (
            <MarkAttendanceTab
              students={students}
              attendance={attendance}
              existingIds={existingIds}
              loadingStudents={loadingStudents}
              saving={saving}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onSave={submitAttendance}
            />
          ) : (
            <StudentSummaryTab
              summaryData={summaryData}
              loading={loadingSummary}
              hasClass={!!selectedClass}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default Attendance;