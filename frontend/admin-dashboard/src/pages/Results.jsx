import React, { useEffect, useState, useCallback, useRef } from "react";
import API from "../services/api";

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
const TERMS = [
  { value: "term1", label: "Term 1" },
  { value: "term2", label: "Term 2" },
  { value: "term3", label: "Term 3" },
];
const YEARS = [2026, 2025, 2024, 2023, 2022];

// ── Grade scales matching backend exactly ──────────────────────────────────
// Basic 7–9: numeric grades 1–9
const GRADE_SCALE_B79 = [
  { range: "90–100", grade: "1", remark: "Excellent"    },
  { range: "80–89",  grade: "2", remark: "Very Good"    },
  { range: "70–79",  grade: "3", remark: "Good"         },
  { range: "60–69",  grade: "4", remark: "High Average" },
  { range: "55–59",  grade: "5", remark: "Average"      },
  { range: "50–54",  grade: "6", remark: "Low Average"  },
  { range: "45–49",  grade: "7", remark: "Low"          },
  { range: "40–44",  grade: "6", remark: "Lower"        },
  { range: "0–39",   grade: "9", remark: "Lowest"       },
];

// Basic 1–6 / KG: letter grades A–E2
const GRADE_SCALE_B16 = [
  { range: "90–100", grade: "A",  remark: "Excellent"    },
  { range: "80–89",  grade: "B1", remark: "Very Good"    },
  { range: "70–79",  grade: "B2", remark: "Good"         },
  { range: "60–69",  grade: "C1", remark: "High Average" },
  { range: "55–59",  grade: "C2", remark: "Average"      },
  { range: "50–54",  grade: "D1", remark: "Low Average"  },
  { range: "45–49",  grade: "D2", remark: "Low"          },
  { range: "40–44",  grade: "E1", remark: "Lower"        },
  { range: "0–39",   grade: "E2", remark: "Lowest"       },
];

// Grade → display colour
const GRADE_COLORS = {
  "1":  "#16a34a", "2":  "#059669", "3":  "#0284c7",
  "4":  "#0891b2", "5":  "#ca8a04", "6":  "#ea580c",
  "7":  "#dc2626", "9":  "#991b1b",
  "A":  "#16a34a", "B1": "#059669", "B2": "#0284c7",
  "C1": "#0891b2", "C2": "#ca8a04", "D1": "#ea580c",
  "D2": "#dc2626", "E1": "#b91c1c", "E2": "#991b1b",
};

// ── Grade compute helpers (mirror backend logic) ───────────────────────────
const computeGrade = (score, level = "basic_7_9") => {
  if (level === "basic_7_9") {
    if (score >= 90) return "1";
    if (score >= 80) return "2";
    if (score >= 70) return "3";
    if (score >= 60) return "4";
    if (score >= 55) return "5";
    if (score >= 50) return "6";
    if (score >= 45) return "7";
    if (score >= 40) return "6";
    return "9";
  }
  // basic_1_6
  if (score >= 90) return "A";
  if (score >= 80) return "B1";
  if (score >= 70) return "B2";
  if (score >= 60) return "C1";
  if (score >= 55) return "C2";
  if (score >= 50) return "D1";
  if (score >= 45) return "D2";
  if (score >= 40) return "E1";
  return "E2";
};

const computeRemark = (grade) => {
  const scale = [...GRADE_SCALE_B79, ...GRADE_SCALE_B16];
  return scale.find(g => g.grade === grade)?.remark || "—";
};

const computeScore = (ca, reopen, exams) => {
  const c = parseFloat(ca)     || 0;
  const r = parseFloat(reopen) || 0;
  const e = parseFloat(exams)  || 0;
  return Math.round((c + r + e) * 100) / 100;
};

const getStudentName = (s) =>
  s?.student_name ||
  (s?.first_name ? `${s.first_name} ${s.last_name || ""}`.trim() : null) ||
  s?.admission_number || "Unknown";

const fmtPos = (n) => {
  if (n == null) return "—";
  const v = n % 100;
  const suffix = ["th","st","nd","rd"];
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
};

/* ─────────────────────────────────────────────
   Styles
───────────────────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  .res-root { font-family: 'DM Sans', sans-serif; background: #f4f5f7; min-height: 100vh; }
  .res-header { background: #0f172a; padding: 20px 28px; display:flex; align-items:center; gap:12px; }
  .res-header-icon { width:36px; height:36px; background: linear-gradient(135deg,#3b82f6,#6366f1); border-radius:10px; display:flex; align-items:center; justify-content:center; }
  .res-header h1 { color:#fff; font-size:18px; font-weight:700; letter-spacing:-0.3px; margin:0; }
  .res-header span { color:#94a3b8; font-size:13px; margin-left:auto; font-family:'DM Mono',monospace; }

  .res-body { padding: 24px 28px; max-width: 1300px; }

  .res-filters { background:#fff; border-radius:14px; padding:18px 20px; display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; box-shadow:0 1px 3px rgba(0,0,0,.07); margin-bottom:20px; }
  .res-filter-group { display:flex; flex-direction:column; gap:5px; }
  .res-filter-group label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.6px; }
  .res-select { border: 1.5px solid #e2e8f0; border-radius:8px; padding: 8px 12px; font-size:13.5px; font-family:'DM Sans',sans-serif; color:#1e293b; background:#fff; cursor:pointer; min-width:140px; outline:none; transition: border-color .15s; appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position: right 10px center; padding-right:30px; }
  .res-select:focus { border-color:#3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
  .res-select-active { border-color: #3b82f6; background-color: #f0f7ff; }

  .res-tabs { display:flex; gap:4px; background:#fff; border-radius:10px; padding:4px; width:fit-content; box-shadow:0 1px 3px rgba(0,0,0,.07); margin-bottom:20px; }
  .res-tab { padding:7px 18px; border-radius:7px; font-size:13px; font-weight:500; cursor:pointer; border:none; background:transparent; color:#64748b; transition: all .15s; }
  .res-tab:hover { color:#1e293b; background:#f8fafc; }
  .res-tab-active { background:#0f172a; color:#fff; font-weight:600; }

  .res-toast { position:fixed; top:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:8px; }
  .res-toast-item { padding:12px 16px; border-radius:10px; font-size:13.5px; font-weight:500; display:flex; align-items:center; gap:10px; box-shadow:0 4px 20px rgba(0,0,0,.12); animation: slideIn .2s ease; min-width:280px; max-width:380px; }
  .res-toast-success { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
  .res-toast-error   { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }
  .res-toast-info    { background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; }
  @keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }

  .res-info-bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
  .res-info-bar-left { display:flex; align-items:center; gap:10px; }
  .res-badge { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:600; }
  .res-badge-blue  { background:#eff6ff; color:#1d4ed8; }
  .res-badge-green { background:#f0fdf4; color:#166534; }
  .res-badge-amber { background:#fffbeb; color:#92400e; }

  .res-table-card { background:#fff; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,.07); overflow:hidden; }
  .res-table { width:100%; border-collapse:collapse; font-size:13.5px; }
  .res-table thead tr { background:#0f172a; }
  .res-table thead th { padding:11px 14px; color:#94a3b8; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.7px; text-align:center; white-space:nowrap; }
  .res-table thead th:nth-child(2) { text-align:left; }
  .res-table tbody tr { border-bottom:1px solid #f1f5f9; transition:background .1s; }
  .res-table tbody tr:hover { background:#fafbfd; }
  .res-table tbody tr:last-child { border-bottom:none; }
  .res-table td { padding:10px 14px; text-align:center; color:#334155; }
  .res-table td:nth-child(2) { text-align:left; }

  .res-input { width:60px; border:1.5px solid #e2e8f0; border-radius:7px; padding:6px 6px; text-align:center; font-family:'DM Mono',monospace; font-size:13px; color:#1e293b; outline:none; transition:border-color .15s,box-shadow .15s; background:#fff; }
  .res-input:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.12); }
  .res-input:hover { border-color:#94a3b8; }
  .res-input-filled { border-color:#93c5fd; background:#f0f7ff; }
  .res-input-max { border-color:#86efac; background:#f0fdf4; }

  .res-grade { display:inline-block; padding:3px 9px; border-radius:20px; font-size:11px; font-weight:700; letter-spacing:.3px; font-family:'DM Mono',monospace; }
  .res-saved-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#3b82f6; margin-right:5px; vertical-align:middle; }
  .res-total { font-family:'DM Mono',monospace; font-weight:700; font-size:14px; color:#1d4ed8; }
  .res-total-dash { color:#cbd5e1; }

  .res-btn-delete { padding:4px 10px; border-radius:6px; font-size:11.5px; font-weight:500; border:1.5px solid #fca5a5; color:#dc2626; background:transparent; cursor:pointer; transition:all .15s; }
  .res-btn-delete:hover { background:#dc2626; color:#fff; border-color:#dc2626; }
  .res-btn-delete:disabled { opacity:.4; cursor:not-allowed; }

  .res-btn-save { display:flex; align-items:center; gap:8px; background:#0f172a; color:#fff; border:none; border-radius:9px; padding:10px 24px; font-size:14px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; transition:all .15s; }
  .res-btn-save:hover:not(:disabled) { background:#1e293b; transform:translateY(-1px); box-shadow:0 4px 12px rgba(15,23,42,.25); }
  .res-btn-save:disabled { opacity:.5; cursor:not-allowed; }
  .res-btn-save-wrap { display:flex; align-items:center; justify-content:space-between; margin-top:16px; flex-wrap:wrap; gap:12px; }

  .res-legend { display:flex; flex-wrap:wrap; gap:6px; margin-top:14px; padding:14px 16px; background:#fff; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
  .res-legend-item { display:flex; align-items:center; gap:5px; padding:3px 8px; background:#f8fafc; border-radius:6px; font-size:11.5px; }
  .res-legend-range { font-family:'DM Mono',monospace; color:#64748b; font-size:11px; }

  .res-empty { background:#fff; border-radius:14px; padding:56px 20px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.07); }
  .res-empty-icon { font-size:40px; margin-bottom:12px; }
  .res-empty h3 { color:#1e293b; font-weight:600; margin:0 0 6px; }
  .res-empty p  { color:#94a3b8; font-size:14px; margin:0; }

  .res-skeleton-row td { padding:12px 14px; }
  .res-skeleton { height:14px; border-radius:6px; background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; }
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

  .res-loading-overlay { display:flex; align-items:center; gap:10px; padding:16px 0; color:#64748b; font-size:13.5px; }
  .res-spinner { width:18px; height:18px; border:2px solid #e2e8f0; border-top-color:#3b82f6; border-radius:50%; animation:spin .6s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }

  .res-summary-table { width:100%; border-collapse:collapse; font-size:13.5px; }
  .res-summary-table thead tr { background:#0f172a; }
  .res-summary-table thead th { padding:11px 14px; color:#94a3b8; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.7px; }
  .res-summary-table tbody tr { border-bottom:1px solid #f1f5f9; transition:background .1s; cursor:pointer; }
  .res-summary-table tbody tr:hover { background:#fafbfd; }
  .res-summary-row-expanded { background:#f8fafc !important; }
  .res-rank-1 { color:#d97706; font-weight:800; }
  .res-rank-2 { color:#94a3b8; font-weight:700; }
  .res-rank-3 { color:#c2692c; font-weight:700; }

  .res-expand-inner { padding:16px; background:#f8fafc; }
  .res-sub-table { width:100%; border-collapse:collapse; font-size:12.5px; background:#fff; border-radius:10px; overflow:hidden; }
  .res-sub-table thead { background:#1e293b; }
  .res-sub-table thead th { padding:8px 12px; color:#94a3b8; font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; text-align:center; }
  .res-sub-table thead th:first-child { text-align:left; }
  .res-sub-table tbody tr { border-bottom:1px solid #f1f5f9; }
  .res-sub-table tbody td { padding:8px 12px; text-align:center; color:#475569; }
  .res-sub-table tbody td:first-child { text-align:left; font-weight:500; color:#1e293b; }

  @media (max-width: 640px) {
    .res-body { padding:16px; }
    .res-filters { gap:8px; }
    .res-select { min-width:120px; }
  }
`;

/* ─────────────────────────────────────────────
   Toast hook
───────────────────────────────────────────── */
let toastId = 0;
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "success") => {
    const id = ++toastId;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
const Results = () => {
  useEffect(() => {
    if (document.getElementById("res-styles")) return;
    const el = document.createElement("style");
    el.id = "res-styles";
    el.textContent = STYLES;
    document.head.appendChild(el);
  }, []);

  const { toasts, add: toast } = useToast();

  const [tab, setTab]                         = useState("Enter Results");
  const [classes, setClasses]                 = useState([]);
  const [subjects, setSubjects]               = useState([]);
  const [students, setStudents]               = useState([]);
  const [selectedClass, setSelectedClass]     = useState("");
  const [selectedTerm, setSelectedTerm]       = useState("term1");
  const [selectedYear, setSelectedYear]       = useState(String(YEARS[0]));
  const [selectedSubject, setSelectedSubject] = useState("");
  const [classLevel, setClassLevel]           = useState("basic_7_9");
  const [scores, setScores]                   = useState({});
  const [existingIds, setExistingIds]         = useState({});
  const [saving, setSaving]                   = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingScores, setLoadingScores]     = useState(false);
  const [deleting, setDeleting]               = useState(null);
  const [summary, setSummary]                 = useState([]);
  const [loadingSummary, setLoadingSummary]   = useState(false);
  const [expandedStudent, setExpandedStudent] = useState(null);

  const loadedRef = useRef({ class: "", subject: "", term: "", year: "" });

  /* ── Initial data ── */
  useEffect(() => {
    API.get("/classes/").then(r  => setClasses(r.data.results  || r.data)).catch(() => toast("Failed to load classes.", "error"));
    API.get("/subjects/").then(r => setSubjects(r.data.results || r.data)).catch(() => toast("Failed to load subjects.", "error"));
  }, []);

  /* ── Students when class changes ── */
  useEffect(() => {
    if (!selectedClass) { setStudents([]); return; }
    setLoadingStudents(true);
    API.get(`/students/?school_class=${selectedClass}`)
      .then(r => setStudents(r.data.results || r.data))
      .catch(() => toast("Failed to load students.", "error"))
      .finally(() => setLoadingStudents(false));
  }, [selectedClass]);

  /* ── Load existing scores ── */
  const loadExistingScores = useCallback(async (studentsOverride) => {
    if (!selectedClass || !selectedTerm || !selectedSubject) return;
    const studentList = studentsOverride || students;
    if (!studentList.length) return;

    setLoadingScores(true);
    try {
      const res = await API.get(
        `/results/?school_class=${selectedClass}&term=${selectedTerm}&subject=${selectedSubject}&year=${selectedYear}`
      );
      const records = res.data.results || res.data;

      const map = {};
      const ids = {};
      records.forEach(r => {
        // Backend field order: ca (CLASS SC.), reopen (RE-OPEN), exams (EXAMS)
        map[r.student] = { ca: r.ca ?? "", reopen: r.reopen ?? "", exams: r.exams ?? "" };
        ids[r.student] = r.id;
      });

      const next = {};
      studentList.forEach(s => {
        next[s.id] = map[s.id] || { ca: "", reopen: "", exams: "" };
      });

      setScores(next);
      setExistingIds(ids);
      loadedRef.current = { class: selectedClass, subject: selectedSubject, term: selectedTerm, year: selectedYear };

      if (records.length > 0) {
        toast(`Loaded ${records.length} saved result${records.length !== 1 ? "s" : ""}.`, "info");
      }
    } catch {
      toast("Failed to load existing scores.", "error");
    } finally {
      setLoadingScores(false);
    }
  }, [selectedClass, selectedTerm, selectedSubject, selectedYear, students]);

  /* ── Reload on filter change ── */
  useEffect(() => {
    if (!selectedSubject) { setScores({}); setExistingIds({}); return; }
    setScores({}); setExistingIds({});
    if (selectedClass && students.length) loadExistingScores();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject, selectedTerm, selectedYear]);

  useEffect(() => {
    if (students.length && selectedSubject && selectedClass && selectedTerm) {
      setScores({}); setExistingIds({});
      loadExistingScores(students);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students]);

  /* ── Summary tab ── */
  useEffect(() => {
    if (tab !== "Class Summary" || !selectedClass || !selectedTerm) return;
    setLoadingSummary(true);
    API.get(`/results/summary/?school_class=${selectedClass}&term=${selectedTerm}&year=${selectedYear}`)
      .then(r => setSummary(r.data))
      .catch(() => toast("Failed to load summary.", "error"))
      .finally(() => setLoadingSummary(false));
  }, [tab, selectedClass, selectedTerm, selectedYear]);

  /* ── Handlers ── */
  const handleClassChange = (e) => {
    const id = e.target.value;
    setSelectedClass(id);
    setSelectedSubject("");
    setScores({});
    setExistingIds({});
    setStudents([]);
    setSummary([]);
    setExpandedStudent(null);
    const found = classes.find(c => String(c.id) === String(id));
    // Detect level from class name
    const name = (found?.name || "").toLowerCase();
    const isB79 = ["basic 7","basic 8","basic 9","b7","b8","b9"].some(m => name.includes(m));
    setClassLevel(isB79 ? "basic_7_9" : "basic_1_6");
  };

  const handleSubjectChange = (e) => setSelectedSubject(e.target.value);

  const handleScoreChange = (studentId, field, value) => {
    const max = field === "reopen" ? 20 : 40;
    const clamped = value === "" ? "" : Math.min(max, Math.max(0, parseFloat(value) || 0));
    setScores(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: clamped } }));
  };

  const handleDeleteResult = async (studentId) => {
    const id = existingIds[studentId];
    if (!id) return;
    if (!window.confirm("Delete this student's result for the selected subject and term?")) return;
    setDeleting(studentId);
    try {
      await API.delete(`/results/${id}/`);
      setScores(prev => ({ ...prev, [studentId]: { ca: "", reopen: "", exams: "" } }));
      setExistingIds(prev => { const n = { ...prev }; delete n[studentId]; return n; });
      toast("Result deleted.", "info");
    } catch {
      toast("Failed to delete result.", "error");
    } finally {
      setDeleting(null);
    }
  };

  const submitResults = async () => {
    if (!selectedClass || !selectedTerm || !selectedSubject) {
      toast("Please select class, term, and subject.", "error"); return;
    }
    const records = Object.entries(scores)
      .filter(([, v]) => v.ca !== "" || v.reopen !== "" || v.exams !== "")
      .map(([studentId, v]) => ({
        student:      studentId,
        subject:      selectedSubject,
        school_class: selectedClass,
        term:         selectedTerm,
        year:         selectedYear,
        ca:           parseFloat(v.ca)     || 0,
        reopen:       parseFloat(v.reopen) || 0,
        exams:        parseFloat(v.exams)  || 0,
      }));
    if (!records.length) { toast("No scores entered.", "error"); return; }

    setSaving(true);
    try {
      const res = await API.post("/results/bulk/", records);
      const errCount = res.data.errors?.length || 0;
      if (errCount === 0) {
        toast(`Saved ${res.data.saved} result${res.data.saved !== 1 ? "s" : ""} successfully.`, "success");
      } else {
        toast(`Saved ${res.data.saved} record(s) with ${errCount} error(s).`, "info");
      }
      await loadExistingScores();
    } catch (err) {
      toast(err.response?.data?.detail || "Error saving results.", "error");
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived ── */
  const filledCount = Object.values(scores).filter(v => v?.ca !== "" || v?.reopen !== "" || v?.exams !== "").length;
  const savedCount  = Object.keys(existingIds).length;
  const gradeScale  = classLevel === "basic_7_9" ? GRADE_SCALE_B79 : GRADE_SCALE_B16;

  const selectedClassName   = classes.find(c  => String(c.id) === String(selectedClass))?.name   || "";
  const selectedSubjectName = subjects.find(s => String(s.id) === String(selectedSubject))?.name || "";
  const selectedTermLabel   = TERMS.find(t => t.value === selectedTerm)?.label || "";

  /* ─────────────────────────────────────────────
     Render
  ───────────────────────────────────────────── */
  return (
    <div className="res-root">

      {/* Toast */}
      <div className="res-toast">
        {toasts.map(t => (
          <div key={t.id} className={`res-toast-item res-toast-${t.type}`}>
            <span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}</span>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="res-header">
        <div className="res-header-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
        </div>
        <h1>Results Entry</h1>
        {selectedClassName && selectedSubjectName && (
          <span>{selectedClassName} · {selectedSubjectName} · {selectedTermLabel} {selectedYear}</span>
        )}
      </div>

      <div className="res-body">

        {/* Filter bar */}
        <div className="res-filters">
          <div className="res-filter-group">
            <label>Year</label>
            <select className={`res-select ${selectedYear ? "res-select-active" : ""}`}
              value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="res-filter-group">
            <label>Term</label>
            <select className={`res-select ${selectedTerm ? "res-select-active" : ""}`}
              value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              {TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="res-filter-group">
            <label>Class</label>
            <select className={`res-select ${selectedClass ? "res-select-active" : ""}`}
              value={selectedClass} onChange={handleClassChange}>
              <option value="">Select Class</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {tab === "Enter Results" && (
            <div className="res-filter-group">
              <label>Subject</label>
              <select className={`res-select ${selectedSubject ? "res-select-active" : ""}`}
                value={selectedSubject} onChange={handleSubjectChange}>
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Tabs */}
        {selectedClass && (
          <div className="res-tabs">
            {["Enter Results", "Class Summary"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`res-tab ${tab === t ? "res-tab-active" : ""}`}>
                {t}
              </button>
            ))}
          </div>
        )}

        {/* ── Enter Results ── */}
        {tab === "Enter Results" && (
          <>
            {!selectedClass && (
              <div className="res-empty">
                <div className="res-empty-icon">🏫</div>
                <h3>Select a class to begin</h3>
                <p>Choose a year, term, class and subject to load or enter results.</p>
              </div>
            )}

            {selectedClass && !selectedSubject && !loadingStudents && (
              <div className="res-empty">
                <div className="res-empty-icon">📚</div>
                <h3>Select a subject</h3>
                <p>Choose a subject above to load existing results or enter new ones.</p>
              </div>
            )}

            {selectedClass && selectedSubject && (
              <>
                {/* Info bar */}
                <div className="res-info-bar">
                  <div className="res-info-bar-left">
                    <span className="res-badge res-badge-blue">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                        <path d="M16 3.13a4 4 0 010 7.75"/>
                      </svg>
                      {students.length} students
                    </span>
                    {filledCount > 0 && <span className="res-badge res-badge-amber">✏ {filledCount} filled</span>}
                    {savedCount  > 0 && <span className="res-badge res-badge-green">✓ {savedCount} saved</span>}
                    {loadingScores && (
                      <div className="res-loading-overlay" style={{padding:"0"}}>
                        <div className="res-spinner" style={{width:"14px",height:"14px"}}/>
                        <span style={{fontSize:"12px"}}>Loading saved results…</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Table */}
                {loadingStudents ? (
                  <div className="res-table-card">
                    <table className="res-table">
                      <tbody>
                        {[...Array(5)].map((_, i) => (
                          <tr key={i} className="res-skeleton-row">
                            {[...Array(9)].map((__, j) => (
                              <td key={j}><div className="res-skeleton" style={{width:j===1?"120px":"60px"}}/></td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : students.length === 0 ? (
                  <div className="res-empty">
                    <div className="res-empty-icon">👤</div>
                    <h3>No students found</h3>
                    <p>No students are assigned to this class.</p>
                  </div>
                ) : (
                  <div className="res-table-card">
                    <table className="res-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th style={{textAlign:"left"}}>Student</th>
                          {/* Column order: CLASS SC. | READING & RE-OPEN | EXAMS — matches printed report card */}
                          <th>CLASS SC.<br/><span style={{fontWeight:400,fontSize:"10px",color:"#475569"}}>/40</span></th>
                          <th>READING &amp; RE-OPEN<br/><span style={{fontWeight:400,fontSize:"10px",color:"#475569"}}>/20</span></th>
                          <th>EXAMS<br/><span style={{fontWeight:400,fontSize:"10px",color:"#475569"}}>/40</span></th>
                          <th>TOTAL<br/><span style={{fontWeight:400,fontSize:"10px",color:"#475569"}}>/100</span></th>
                          <th>GRADE</th>
                          <th>REMARK</th>
                          <th>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student, i) => {
                          const s       = scores[student.id] || { ca: "", reopen: "", exams: "" };
                          const dirty   = s.ca !== "" || s.reopen !== "" || s.exams !== "";
                          const total   = computeScore(s.ca, s.reopen, s.exams);
                          const grade   = dirty ? computeGrade(total, classLevel) : null;
                          const remark  = grade ? computeRemark(grade) : null;
                          const clr     = grade ? (GRADE_COLORS[grade] || "#64748b") : null;
                          const isSaved = !!existingIds[student.id];

                          return (
                            <tr key={student.id}>
                              <td style={{color:"#94a3b8",fontFamily:"'DM Mono',monospace",fontSize:"12px"}}>{i+1}</td>
                              <td>
                                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                                  <div style={{
                                    width:"28px",height:"28px",borderRadius:"50%",
                                    background:`hsl(${(student.id*47)%360},55%,88%)`,
                                    display:"flex",alignItems:"center",justifyContent:"center",
                                    fontSize:"11px",fontWeight:"700",
                                    color:`hsl(${(student.id*47)%360},55%,35%)`,
                                    flexShrink:0,
                                  }}>
                                    {getStudentName(student).charAt(0)}
                                  </div>
                                  <div>
                                    <div style={{fontWeight:"600",color:"#1e293b",fontSize:"13.5px"}}>
                                      {getStudentName(student)}
                                    </div>
                                    {isSaved && (
                                      <div style={{fontSize:"11px",color:"#3b82f6",display:"flex",alignItems:"center",gap:"3px"}}>
                                        <span className="res-saved-dot"/>saved
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* CA (CLASS SC. 40%) */}
                              {[
                                { field: "ca",     max: 40 },
                                { field: "reopen", max: 20 },
                                { field: "exams",  max: 40 },
                              ].map(({ field, max }) => {
                                const val    = s[field];
                                const isMax  = val !== "" && parseFloat(val) === max;
                                const filled = val !== "";
                                return (
                                  <td key={field}>
                                    <input
                                      type="number" min="0" max={max} step="0.5"
                                      value={val} placeholder="—"
                                      onChange={e => handleScoreChange(student.id, field, e.target.value)}
                                      className={`res-input ${isMax ? "res-input-max" : filled ? "res-input-filled" : ""}`}
                                    />
                                  </td>
                                );
                              })}

                              <td>
                                {dirty
                                  ? <span className="res-total">{total}</span>
                                  : <span className="res-total-dash">—</span>}
                              </td>
                              <td>
                                {grade
                                  ? <span className="res-grade" style={{background:`${clr}18`,color:clr}}>{grade}</span>
                                  : <span style={{color:"#e2e8f0"}}>—</span>}
                              </td>
                              <td style={{fontSize:"12px",color:clr||"#cbd5e1"}}>
                                {remark || "—"}
                              </td>
                              <td>
                                {isSaved && (
                                  <button className="res-btn-delete"
                                    onClick={() => handleDeleteResult(student.id)}
                                    disabled={deleting === student.id}>
                                    {deleting === student.id ? "…" : "Delete"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Grade legend */}
                {students.length > 0 && (
                  <div className="res-legend">
                    <span style={{fontSize:"11px",fontWeight:"700",color:"#475569",marginRight:"4px",alignSelf:"center"}}>
                      GRADE SCALE:
                    </span>
                    {gradeScale.map(item => {
                      const clr = GRADE_COLORS[item.grade] || "#64748b";
                      return (
                        <div key={item.grade + item.range} className="res-legend-item">
                          <span className="res-grade" style={{background:`${clr}18`,color:clr,padding:"1px 6px"}}>
                            {item.grade}
                          </span>
                          <span className="res-legend-range">{item.range}</span>
                          <span style={{fontSize:"11px",color:"#94a3b8"}}>{item.remark}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Save */}
                {students.length > 0 && (
                  <div className="res-btn-save-wrap">
                    <div style={{fontSize:"13px",color:"#94a3b8"}}>
                      {filledCount === 0
                        ? "Enter scores above to save"
                        : `${filledCount} of ${students.length} students have scores entered`}
                    </div>
                    <button className="res-btn-save"
                      onClick={submitResults}
                      disabled={saving || filledCount === 0}>
                      {saving ? (
                        <><div className="res-spinner" style={{borderTopColor:"#fff"}}/> Saving…</>
                      ) : (
                        <>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                            <polyline points="17 21 17 13 7 13 7 21"/>
                            <polyline points="7 3 7 8 15 8"/>
                          </svg>
                          Save {filledCount} Result{filledCount !== 1 ? "s" : ""}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Class Summary tab ── */}
        {tab === "Class Summary" && (
          <>
            {!selectedClass && (
              <div className="res-empty">
                <div className="res-empty-icon">📊</div>
                <h3>Select a class</h3>
                <p>Choose a class and term to view the summary.</p>
              </div>
            )}
            {loadingSummary && (
              <div className="res-loading-overlay">
                <div className="res-spinner"/>Loading summary…
              </div>
            )}
            {!loadingSummary && selectedClass && summary.length === 0 && (
              <div className="res-empty">
                <div className="res-empty-icon">📭</div>
                <h3>No results yet</h3>
                <p>No results found for this class and term.</p>
              </div>
            )}
            {!loadingSummary && summary.length > 0 && (
              <div className="res-table-card">
                <table className="res-summary-table">
                  <thead>
                    <tr>
                      <th style={{textAlign:"center",width:"60px"}}>RANK</th>
                      <th style={{textAlign:"left"}}>STUDENT</th>
                      <th style={{textAlign:"center"}}>SUBJECTS</th>
                      <th style={{textAlign:"center"}}>TOTAL</th>
                      <th style={{textAlign:"center"}}>AVG</th>
                      <th style={{textAlign:"center"}}>GRADE</th>
                      <th style={{textAlign:"center"}}>DETAILS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map(row => {
                      const clr = GRADE_COLORS[row.overall_grade] || "#64748b";
                      return (
                        <React.Fragment key={row.student_id}>
                          <tr
                            onClick={() => setExpandedStudent(expandedStudent === row.student_id ? null : row.student_id)}
                            className={expandedStudent === row.student_id ? "res-summary-row-expanded" : ""}
                            style={{color:"#334155"}}>
                            <td style={{textAlign:"center"}}>
                              <span className={row.rank===1?"res-rank-1":row.rank===2?"res-rank-2":row.rank===3?"res-rank-3":""}
                                style={{fontFamily:"'DM Mono',monospace",fontSize:"13px"}}>
                                {row.rank===1?"🥇":row.rank===2?"🥈":row.rank===3?"🥉":`#${row.rank}`}
                              </span>
                            </td>
                            <td>
                              <div style={{fontWeight:"600",color:"#1e293b"}}>{row.student_name}</div>
                              <div style={{fontSize:"11.5px",color:"#94a3b8",fontFamily:"'DM Mono',monospace"}}>{row.admission_number}</div>
                            </td>
                            <td style={{textAlign:"center",color:"#64748b"}}>{row.subject_count}</td>
                            <td style={{textAlign:"center",fontFamily:"'DM Mono',monospace",fontWeight:"700",color:"#1d4ed8"}}>{row.total_score}</td>
                            <td style={{textAlign:"center",fontFamily:"'DM Mono',monospace",color:"#475569"}}>{row.average_score}</td>
                            <td style={{textAlign:"center"}}>
                              <span className="res-grade" style={{background:`${clr}18`,color:clr}}>
                                {row.overall_grade}
                              </span>
                            </td>
                            <td style={{textAlign:"center",fontSize:"12px",color:"#3b82f6"}}>
                              {expandedStudent === row.student_id ? "▲ Hide" : "▼ Show"}
                            </td>
                          </tr>
                          {expandedStudent === row.student_id && (
                            <tr>
                              <td colSpan={7} style={{padding:"0",background:"#f8fafc"}}>
                                <div className="res-expand-inner">
                                  <table className="res-sub-table">
                                    <thead>
                                      <tr>
                                        <th style={{textAlign:"left"}}>Subject</th>
                                        <th>Class SC.</th>
                                        <th>Re-Open</th>
                                        <th>Exams</th>
                                        <th>Total</th>
                                        <th>Position</th>
                                        <th>Grade</th>
                                        <th>Remark</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.subjects.map(sub => {
                                        const sc = GRADE_COLORS[sub.grade] || "#64748b";
                                        return (
                                          <tr key={sub.subject_id}>
                                            <td>{sub.subject_name}</td>
                                            <td>{sub.ca    ?? "—"}</td>
                                            <td>{sub.reopen ?? "—"}</td>
                                            <td>{sub.exams  ?? "—"}</td>
                                            <td style={{fontWeight:"700",color:"#1d4ed8",fontFamily:"'DM Mono',monospace"}}>{sub.score ?? "—"}</td>
                                            <td style={{color:"#64748b"}}>{fmtPos(sub.subject_position)}</td>
                                            <td>
                                              <span className="res-grade" style={{background:`${sc}18`,color:sc,fontSize:"11px"}}>
                                                {sub.grade ?? "—"}
                                              </span>
                                            </td>
                                            <td style={{fontSize:"11.5px",color:sc}}>{sub.remark ?? "—"}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
};

export default Results;