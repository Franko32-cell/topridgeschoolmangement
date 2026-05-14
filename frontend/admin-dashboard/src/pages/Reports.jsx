import { useEffect, useState, useCallback } from "react";
import API from "../services/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const TERMS = [
  { value: "term1", label: "Term 1" },
  { value: "term2", label: "Term 2" },
  { value: "term3", label: "Term 3" },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

const GRADE_COLORS = {
  A:  { bg: "#f0fdf4", color: "#15803d", border: "#86efac" },
  B1: { bg: "#ecfdf5", color: "#065f46", border: "#6ee7b7" },
  B2: { bg: "#f0fdfa", color: "#0f766e", border: "#5eead4" },
  C1: { bg: "#eff6ff", color: "#1d4ed8", border: "#93c5fd" },
  C2: { bg: "#f0f9ff", color: "#0369a1", border: "#7dd3fc" },
  D1: { bg: "#fefce8", color: "#a16207", border: "#fde047" },
  D2: { bg: "#fff7ed", color: "#c2410c", border: "#fdba74" },
  E1: { bg: "#fef2f2", color: "#b91c1c", border: "#fca5a5" },
  E2: { bg: "#fff1f2", color: "#9f1239", border: "#fda4af" },
  "1": { bg: "#f0fdf4", color: "#15803d", border: "#86efac" },
  "2": { bg: "#ecfdf5", color: "#065f46", border: "#6ee7b7" },
  "3": { bg: "#f0fdfa", color: "#0f766e", border: "#5eead4" },
  "4": { bg: "#eff6ff", color: "#1d4ed8", border: "#93c5fd" },
  "5": { bg: "#fefce8", color: "#a16207", border: "#fde047" },
  "6": { bg: "#fff7ed", color: "#c2410c", border: "#fdba74" },
  "7": { bg: "#fef2f2", color: "#b91c1c", border: "#fca5a5" },
  "9": { bg: "#fff1f2", color: "#9f1239", border: "#fda4af" },
};

const GRADE_SCALE_B79 = [
  { range: "90–100", grade: "1", label: "EXCELLENT"    },
  { range: "80–89",  grade: "2", label: "VERY GOOD"    },
  { range: "70–79",  grade: "3", label: "GOOD"         },
  { range: "60–69",  grade: "4", label: "HIGH AVERAGE" },
  { range: "55–59",  grade: "5", label: "AVERAGE"      },
  { range: "50–54",  grade: "6", label: "LOW AVERAGE"  },
  { range: "45–49",  grade: "7", label: "LOW"          },
  { range: "40–44",  grade: "6", label: "LOWER"        },
  { range: "0–39",   grade: "9", label: "LOWEST"       },
];

const GRADE_SCALE_B16 = [
  { range: "90–100", grade: "A",  label: "EXCELLENT"    },
  { range: "80–89",  grade: "B1", label: "VERY GOOD"    },
  { range: "70–79",  grade: "B2", label: "GOOD"         },
  { range: "60–69",  grade: "C1", label: "HIGH AVERAGE" },
  { range: "55–59",  grade: "C2", label: "AVERAGE"      },
  { range: "50–54",  grade: "D1", label: "LOW AVERAGE"  },
  { range: "45–49",  grade: "D2", label: "LOW"          },
  { range: "40–44",  grade: "E1", label: "LOWER"        },
  { range: "0–39",   grade: "E2", label: "LOWEST"       },
];

const CONDUCT_OPTIONS  = ["Excellent", "Very Good", "Good", "Fair", "Poor"];
const ATTITUDE_OPTIONS = [
  "Respectful and Hardworking", "Respectful and Kind",
  "Hardworking", "Cooperative", "Needs Improvement",
];

const STATUS_STYLES = {
  present: { bg: "#f0fdf4", color: "#15803d", label: "P" },
  absent:  { bg: "#fef2f2", color: "#b91c1c", label: "A" },
  late:    { bg: "#fffbeb", color: "#d97706", label: "L" },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const getStudentName = (s) =>
  s?.student_name ||
  [s?.first_name, s?.last_name].filter(Boolean).join(" ") ||
  s?.admission_number || "Unknown";

const formatDisplayDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ─── Sub-components ───────────────────────────────────────────────────────────

const GradeBadge = ({ grade }) => {
  const cfg = GRADE_COLORS[grade] || { bg: "#f3f4f6", color: "#374151", border: "#d1d5db" };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      padding: "2px 8px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700,
    }}>
      {grade}
    </span>
  );
};

const StatBox = ({ label, value, accent }) => (
  <div style={{ padding: "1rem", textAlign: "center", borderRight: "1px solid #e8f5e9" }}>
    <div style={{ fontSize: "1.625rem", fontWeight: 800, color: accent || "#166534", fontFamily: "'DM Serif Display', serif" }}>
      {value ?? "—"}
    </div>
    <div style={{ fontSize: "0.68rem", color: "#6b7280", marginTop: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
      {label}
    </div>
  </div>
);

const AttendanceCalendar = ({ records }) => {
  if (!records || records.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "1.5rem", color: "#9ca3af", fontSize: "0.85rem" }}>
        No attendance records for this term.
      </div>
    );
  }

  // Group records by month
  const byMonth = {};
  records.forEach((r) => {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    if (!byMonth[key]) byMonth[key] = { label: monthLabel, days: [] };
    byMonth[key].days.push(r);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {Object.values(byMonth).map((month) => (
        <div key={month.label}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
            {month.label}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
            {month.days.map((r) => {
              const cfg = STATUS_STYLES[r.status] || STATUS_STYLES.absent;
              const d = new Date(r.date);
              return (
                <div
                  key={r.date}
                  title={`${formatDisplayDate(r.date)} — ${r.status.charAt(0).toUpperCase() + r.status.slice(1)}`}
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: cfg.bg, color: cfg.color,
                    border: `1.5px solid ${cfg.color}30`,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    fontSize: "0.6rem", fontWeight: 700,
                    cursor: "default", lineHeight: 1.1,
                  }}
                >
                  <span style={{ fontSize: "0.68rem" }}>{d.getDate()}</span>
                  <span style={{ fontSize: "0.55rem", opacity: 0.8 }}>{cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

const AttendanceBreakdown = ({ report }) => {
  const { attendance_present, attendance_absent, attendance_late,
          attendance_total, attendance_percent, attendance_records } = report;

  const bars = [
    { label: "Present", count: attendance_present, color: "#16a34a", bg: "#f0fdf4" },
    { label: "Absent",  count: attendance_absent,  color: "#dc2626", bg: "#fef2f2" },
    { label: "Late",    count: attendance_late,     color: "#d97706", bg: "#fffbeb" },
  ];

  return (
    <div>
      {attendance_total > 0 ? (
        <>
          {/* Summary counts */}
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {bars.map(({ label, count, color, bg }) => (
              <div key={label} style={{
                flex: 1, minWidth: 70, padding: "0.625rem 0.75rem",
                background: bg, borderRadius: 10, textAlign: "center",
                border: `1px solid ${color}30`,
              }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color }}>{count ?? 0}</div>
                <div style={{ fontSize: "0.68rem", color: "#6b7280", fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Attendance rate bar */}
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>
                {attendance_present} of {attendance_total} days
              </span>
              <span style={{
                fontSize: "0.75rem", fontWeight: 700,
                color: attendance_percent >= 80 ? "#16a34a" : attendance_percent >= 60 ? "#d97706" : "#dc2626",
              }}>
                {attendance_percent}%
              </span>
            </div>
            <div style={{ height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99, transition: "width 0.6s ease",
                width: `${attendance_percent}%`,
                background: attendance_percent >= 80 ? "#22c55e" : attendance_percent >= 60 ? "#f59e0b" : "#ef4444",
              }} />
            </div>
          </div>

          {/* Calendar view */}
          {attendance_records?.length > 0 && (
            <details style={{ marginTop: "0.5rem" }}>
              <summary style={{
                fontSize: "0.78rem", fontWeight: 600, color: "#166534",
                cursor: "pointer", userSelect: "none", marginBottom: "0.75rem",
                listStyle: "none", display: "flex", alignItems: "center", gap: "0.375rem",
              }}>
                <span>▸</span> View daily records
              </summary>
              <AttendanceCalendar records={attendance_records} />
            </details>
          )}
        </>
      ) : (
        <p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>No attendance data recorded for this term.</p>
      )}
    </div>
  );
};

// ─── Remarks form ─────────────────────────────────────────────────────────────

const RemarksForm = ({ remarks, setRemark, subjectOptions, onSave, saving, saved }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
    <Field label="Conduct">
      <select value={remarks.conduct} onChange={(e) => setRemark("conduct", e.target.value)} style={selectStyle}>
        <option value="">— Select —</option>
        {CONDUCT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>

    <Field label="Attitude">
      <select value={remarks.attitude} onChange={(e) => setRemark("attitude", e.target.value)} style={selectStyle}>
        <option value="">— Select —</option>
        {ATTITUDE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>

    <Field label="Interest (subject)">
      <select value={remarks.interest} onChange={(e) => setRemark("interest", e.target.value)} style={selectStyle}>
        <option value="">— Select Subject —</option>
        {subjectOptions.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </Field>

    <Field label="Class Teacher Remarks">
      <textarea
        value={remarks.teacher_remark}
        onChange={(e) => setRemark("teacher_remark", e.target.value)}
        rows={2}
        placeholder="e.g. VERY GOOD PERFORMANCE"
        style={{ ...inputStyle, resize: "none" }}
      />
    </Field>

    <Field label="Promoted To">
      <input
        type="text"
        value={remarks.promoted_to}
        onChange={(e) => setRemark("promoted_to", e.target.value)}
        placeholder="e.g. Basic 4"
        style={inputStyle}
      />
    </Field>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
      <Field label="School Vacates On">
        <input type="date" value={remarks.vacation_date} onChange={(e) => setRemark("vacation_date", e.target.value)} style={inputStyle} />
      </Field>
      <Field label="School Re-opens On">
        <input type="date" value={remarks.resumption_date} onChange={(e) => setRemark("resumption_date", e.target.value)} style={inputStyle} />
      </Field>
    </div>

    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.25rem" }}>
      <button
        onClick={onSave}
        disabled={saving}
        style={{
          padding: "0.625rem 1.375rem", background: saving ? "#4ade80" : "#166534",
          color: "white", border: "none", borderRadius: 9,
          fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer", transition: "background 0.2s",
        }}
      >
        {saving ? "Saving…" : "Save Remarks"}
      </button>
      {saved && <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 600 }}>✓ Saved</span>}
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em" }}>
      {label}
    </label>
    {children}
  </div>
);

const inputStyle = {
  padding: "0.5rem 0.75rem", border: "1.5px solid #d1fae5",
  borderRadius: 8, fontFamily: "inherit", fontSize: "0.875rem",
  color: "#111827", background: "#f9fafb", outline: "none", width: "100%",
};
const selectStyle = { ...inputStyle, cursor: "pointer" };

// ─── Main Component ───────────────────────────────────────────────────────────

const Reports = () => {
  const [classes, setClasses]                 = useState([]);
  const [students, setStudents]               = useState([]);
  const [selectedClass, setSelectedClass]     = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedTerm, setSelectedTerm]       = useState("term1");
  const [selectedYear, setSelectedYear]       = useState(CURRENT_YEAR);
  const [report, setReport]                   = useState(null);
  const [loading, setLoading]                 = useState(false);
  const [downloading, setDownloading]         = useState(false);
  const [error, setError]                     = useState("");
  const [remarks, setRemarks]                 = useState({
    conduct: "", attitude: "", interest: "",
    teacher_remark: "", promoted_to: "",
    vacation_date: "", resumption_date: "",
  });
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [remarksSaved, setRemarksSaved]   = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    API.get("/classes/")
      .then((r) => setClasses(r.data.results ?? r.data))
      .catch(() => setError("Failed to load classes."));
  }, []);

  useEffect(() => {
    if (!selectedClass) { setStudents([]); setSelectedStudent(""); setReport(null); return; }
    API.get(`/students/?school_class=${selectedClass}`)
      .then((r) => setStudents(r.data.results ?? r.data))
      .catch(() => setError("Failed to load students."));
  }, [selectedClass]);

  const fetchReport = useCallback(async () => {
    if (!selectedStudent || !selectedTerm || !selectedYear) { setReport(null); return; }
    setLoading(true); setError(""); setReport(null); setRemarksSaved(false);
    try {
      const res = await API.get(
        `/report/student/${selectedStudent}/?term=${selectedTerm}&year=${selectedYear}`
      );
      setReport(res.data);
      setRemarks({
        conduct:         res.data.conduct         ?? "",
        attitude:        res.data.attitude        ?? "",
        interest:        res.data.interest        ?? "",
        teacher_remark:  res.data.teacher_remark  ?? "",
        promoted_to:     res.data.promoted_to     ?? "",
        vacation_date:   res.data.vacation_date   ?? "",
        resumption_date: res.data.resumption_date ?? "",
      });
    } catch (err) {
      setError(
        err.response?.status === 404
          ? `No results found for this student in ${selectedTerm.replace("term", "Term ")} ${selectedYear}.`
          : "Failed to load report. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [selectedStudent, selectedTerm, selectedYear]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const saveRemarks = async () => {
    setSavingRemarks(true); setRemarksSaved(false); setError("");
    try {
      await API.patch(`/report/student/${selectedStudent}/`, {
        term: selectedTerm, year: selectedYear, ...remarks,
        vacation_date:   remarks.vacation_date   || null,
        resumption_date: remarks.resumption_date || null,
      });
      setRemarksSaved(true);
      const res = await API.get(
        `/report/student/${selectedStudent}/?term=${selectedTerm}&year=${selectedYear}`
      );
      setReport(res.data);
    } catch { setError("Failed to save remarks."); }
    finally { setSavingRemarks(false); }
  };

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await API.get(
        `/report/student/${selectedStudent}/pdf/?term=${selectedTerm}&year=${selectedYear}`,
        { responseType: "blob" }
      );
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href  = url;
      link.setAttribute("download", `report_${selectedStudent}_${selectedTerm}_${selectedYear}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { setError("Failed to download PDF."); }
    finally { setDownloading(false); }
  };

  const setRemark = (key, value) => {
    setRemarks((p) => ({ ...p, [key]: value }));
    setRemarksSaved(false);
  };

  const level      = report?.level || "basic_1_6";
  const gradeScale = level === "basic_7_9" ? GRADE_SCALE_B79 : GRADE_SCALE_B16;
  const subjectOptions = report?.subjects?.map((s) => s.subject) ?? [];

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap');
        @keyframes r-spin { to { transform: rotate(360deg); } }
        @keyframes r-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        details[open] summary span:first-child { transform: rotate(90deg); display: inline-block; }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", padding: "2rem", background: "#f1f4f1", minHeight: "100vh", color: "#111827" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.75rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "#166534", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.375rem" }}>
            🎓
          </div>
          <div>
            <h1 style={{ fontSize: "1.625rem", fontWeight: 700, lineHeight: 1.2 }}>Student Reports</h1>
            <p style={{ fontSize: "0.8125rem", color: "#6b7280", marginTop: 2 }}>View, edit and download term report cards</p>
          </div>
          {report && (
            <button
              onClick={downloadPDF}
              disabled={downloading}
              style={{
                marginLeft: "auto", padding: "0.625rem 1.25rem",
                background: downloading ? "#4ade80" : "#166534",
                color: "white", border: "none", borderRadius: 10,
                fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600,
                cursor: downloading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: "0.5rem",
              }}
            >
              {downloading ? "Generating…" : "⬇ Download PDF"}
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "0.75rem 1rem", borderRadius: 10, marginBottom: "1rem",
            background: "#fef2f2", border: "1px solid #fca5a5", color: "#7f1d1d",
            fontSize: "0.875rem", fontWeight: 500,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>✕ {error}</span>
            <button onClick={() => setError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#7f1d1d" }}>×</button>
          </div>
        )}

        {/* Controls */}
        <div style={{
          background: "white", borderRadius: 16, border: "1px solid #d1fae5",
          padding: "1.125rem 1.5rem", marginBottom: "1.5rem",
          display: "flex", gap: "1rem", flexWrap: "wrap",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}>
          {[
            {
              label: "Class",
              node: (
                <select value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setReport(null); }} style={{ ...selectStyle, minWidth: 150 }}>
                  <option value="">Select class…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ),
            },
            {
              label: "Student",
              node: (
                <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} disabled={!students.length} style={{ ...selectStyle, minWidth: 180, opacity: students.length ? 1 : 0.5 }}>
                  <option value="">Select student…</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{getStudentName(s)}</option>)}
                </select>
              ),
            },
            {
              label: "Term",
              node: (
                <select value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)} style={selectStyle}>
                  {TERMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              ),
            },
            {
              label: "Year",
              node: (
                <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} style={selectStyle}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              ),
            },
          ].map(({ label, node }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</label>
              {node}
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#6b7280", padding: "3rem", justifyContent: "center" }}>
            <div style={{ width: 22, height: 22, border: "2.5px solid #d1fae5", borderTopColor: "#166534", borderRadius: "50%", animation: "r-spin 0.75s linear infinite" }} />
            Loading report…
          </div>
        )}

        {/* ── Report Card ── */}
        {report && !loading && (
          <div style={{ background: "white", borderRadius: 18, border: "1px solid #d1fae5", overflow: "hidden", maxWidth: 900, boxShadow: "0 4px 24px rgba(22,101,52,0.08)", animation: "r-fade 0.3s ease" }}>

            {/* ── Card Header ── */}
            <div style={{ background: "linear-gradient(135deg, #14532d 0%, #166534 60%, #15803d 100%)", color: "white", padding: "1.75rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
              <div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "0.05em", fontFamily: "'DM Serif Display', serif" }}>
                  {report.school_name || "TOP RIDGE SCHOOL"}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#86efac", letterSpacing: "0.2em", marginTop: 2, fontWeight: 600 }}>
                  {report.school_motto || "CENTRE OF DISTINCTION"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#bbf7d0", marginTop: 4 }}>{report.school_address}</div>
                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>{report.student}</div>
                  <div style={{ fontSize: "0.75rem", color: "#bbf7d0" }}>Admission No: {report.admission_number || "—"}</div>
                  <div style={{ fontSize: "0.75rem", color: "#bbf7d0" }}>Class: {report.class || "—"}</div>
                  <div style={{ fontSize: "0.75rem", color: "#bbf7d0" }}>
                    {TERMS.find((t) => t.value === report.term)?.label} · {report.year}
                  </div>
                  {report.number_on_roll > 0 && (
                    <div style={{ fontSize: "0.75rem", color: "#86efac" }}>Number on Roll: {report.number_on_roll}</div>
                  )}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                {report.photo ? (
                  <img src={report.photo} alt="student" style={{ width: 80, height: 80, borderRadius: 12, border: "2px solid rgba(255,255,255,0.4)", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: 12, border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", fontFamily: "'DM Serif Display', serif", fontWeight: 700 }}>
                    {report.student?.[0] || "?"}
                  </div>
                )}
              </div>
            </div>

            {/* ── Stats Row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid #d1fae5" }}>
              <StatBox label="Total Score"   value={report.total_score   ?? "—"} />
              <StatBox label="Average Score" value={report.average_score ?? "—"} />
              <StatBox
                label="Position"
                value={report.show_position
                  ? (report.position_formatted ? `${report.position_formatted} / ${report.out_of}` : "—")
                  : "N/A"}
              />
              <StatBox label="Overall Grade" value={report.overall_grade ?? "—"} accent={GRADE_COLORS[report.overall_grade]?.color} />
            </div>

            {/* ── Subject Table ── */}
            <div style={{ padding: "1.5rem 2rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#166534", marginBottom: "0.875rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Subject Results
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "#f0fdf4" }}>
                      {[
                        { label: "Subject",             align: "left"   },
                        { label: "Class Score\n40%",    align: "center" },
                        { label: "Reading/Re-open\n20%",align: "center" },
                        { label: "Exams\n40%",          align: "center" },
                        { label: "Total\n100%",         align: "center" },
                        ...(report.show_position ? [{ label: "Position", align: "center" }] : []),
                        { label: "Grade",   align: "center" },
                        { label: "Remark",  align: "center" },
                      ].map((h) => (
                        <th key={h.label} style={{
                          padding: "0.625rem 0.875rem", textAlign: h.align,
                          fontSize: "0.68rem", fontWeight: 700, color: "#166534",
                          textTransform: "uppercase", letterSpacing: "0.06em",
                          borderBottom: "2px solid #d1fae5", whiteSpace: "pre-line",
                        }}>{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.subjects?.map((sub, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f0fdf4", background: i % 2 ? "#f9fef9" : "white" }}>
                        <td style={{ padding: "0.625rem 0.875rem", fontWeight: 600 }}>{sub.subject}</td>
                        <td style={{ padding: "0.625rem 0.875rem", textAlign: "center", color: "#374151" }}>{sub.class_score ?? "—"}</td>
                        <td style={{ padding: "0.625rem 0.875rem", textAlign: "center", color: "#374151" }}>{sub.reopen      ?? "—"}</td>
                        <td style={{ padding: "0.625rem 0.875rem", textAlign: "center", color: "#374151" }}>{sub.exams       ?? "—"}</td>
                        <td style={{ padding: "0.625rem 0.875rem", textAlign: "center", fontWeight: 700, color: "#166534", fontSize: "0.9rem" }}>{sub.score}</td>
                        {report.show_position && (
                          <td style={{ padding: "0.625rem 0.875rem", textAlign: "center", fontWeight: 600 }}>{sub.subject_position ?? "—"}</td>
                        )}
                        <td style={{ padding: "0.625rem 0.875rem", textAlign: "center" }}><GradeBadge grade={sub.grade} /></td>
                        <td style={{ padding: "0.625rem 0.875rem", textAlign: "center" }}>
                          <span style={{ fontSize: "0.75rem", color: GRADE_COLORS[sub.grade]?.color || "#374151" }}>{sub.remark || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Grading key */}
              <div style={{ marginTop: "1rem", padding: "0.875rem 1rem", background: "#f0fdf4", borderRadius: 10, border: "1px solid #d1fae5" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                  Grading Key
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1.25rem" }}>
                  {gradeScale.map((g) => (
                    <span key={g.grade + g.range} style={{ fontSize: "0.72rem", color: "#374151" }}>
                      {g.range}: <strong>{g.grade} – {g.label}</strong>
                    </span>
                  ))}
                </div>
              </div>

              {/* Term dates */}
              {(report.vacation_date_display || report.resumption_date_display) && (
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                  {report.vacation_date_display && (
                    <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>
                      <strong style={{ color: "#374151" }}>School Vacates:</strong> {report.vacation_date_display}
                    </span>
                  )}
                  {report.resumption_date_display && (
                    <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>
                      <strong style={{ color: "#374151" }}>School Re-opens:</strong> {report.resumption_date_display}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Attendance + Remarks ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: "1px solid #d1fae5" }}>

              {/* Attendance */}
              <div style={{ padding: "1.5rem 2rem", borderRight: "1px solid #d1fae5" }}>
                <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#166534", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  📅 Attendance
                </div>
                <AttendanceBreakdown report={report} />
              </div>

              {/* Remarks */}
              <div style={{ padding: "1.5rem 2rem" }}>
                <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#166534", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  ✏️ Teacher's Remarks
                </div>
                <RemarksForm
                  remarks={remarks}
                  setRemark={setRemark}
                  subjectOptions={subjectOptions}
                  onSave={saveRemarks}
                  saving={savingRemarks}
                  saved={remarksSaved}
                />
              </div>
            </div>

          </div>
        )}

        {/* Empty states */}
        {!loading && !report && selectedStudent && !error && (
          <div style={{ textAlign: "center", padding: "4rem", color: "#9ca3af" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.75rem", opacity: 0.4 }}>📋</div>
            <p style={{ fontSize: "1rem", fontWeight: 500 }}>No report found for this student and term.</p>
            <p style={{ fontSize: "0.875rem", marginTop: 4 }}>Make sure results have been entered for this term.</p>
          </div>
        )}
        {!selectedStudent && !loading && (
          <div style={{ textAlign: "center", padding: "4rem", color: "#9ca3af" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.75rem", opacity: 0.3 }}>🎓</div>
            <p style={{ fontSize: "1rem" }}>Select a class and student to view their report.</p>
          </div>
        )}

      </div>
    </>
  );
};

export default Reports;