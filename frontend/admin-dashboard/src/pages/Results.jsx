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

// ── Grade scales ──────────────────────────────────────────────────────────
// Verified against printed Top Ridge School report cards (Term 2, 2026)
const GRADE_SCALE_B79 = [
  { range: "90–100", grade: "1", remark: "Excellent"    },
  { range: "80–89",  grade: "2", remark: "Very Good"    },
  { range: "70–79",  grade: "3", remark: "Good"         },
  { range: "60–69",  grade: "4", remark: "High Average" },
  { range: "55–59",  grade: "5", remark: "Average"      },
  { range: "50–54",  grade: "6", remark: "Low Average"  },
  { range: "45–49",  grade: "7", remark: "Low"          },
  { range: "40–44",  grade: "6", remark: "Lower"        }, // confirmed: "40–44  6  Lower" on printed card
  { range: "0–39",   grade: "9", remark: "Lowest"       },
];

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

const GRADE_COLORS = {
  // Basic 7–9 numeric (grade "6" covers both Low Average 50–54 and Lower 40–44)
  "1": "#16a34a", "2": "#059669", "3": "#0284c7",
  "4": "#0891b2", "5": "#ca8a04", "6": "#ea580c",
  "7": "#dc2626", "9": "#991b1b",
  // Basic 1–6 / KG letter
  "A":  "#16a34a", "B1": "#059669", "B2": "#0284c7",
  "C1": "#0891b2", "C2": "#ca8a04", "D1": "#ea580c",
  "D2": "#dc2626", "E1": "#b91c1c", "E2": "#991b1b",
};

// ── Grade / score helpers ─────────────────────────────────────────────────
// Must match backend apps/results/grading.py exactly
const computeGrade = (score, level = "basic_7_9") => {
  if (level === "basic_7_9") {
    if (score >= 90) return "1";
    if (score >= 80) return "2";
    if (score >= 70) return "3";
    if (score >= 60) return "4";
    if (score >= 55) return "5";
    if (score >= 50) return "6";  // Low Average
    if (score >= 45) return "7";
    if (score >= 40) return "6";  // Lower — same grade "6", confirmed from printed card
    return "9";
  }
  // basic_1_6 covers Basic 1–6, KG 1–2, Kindergold
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

const computeRemark = (grade, level = "basic_7_9") => {
  const scale = level === "basic_7_9" ? GRADE_SCALE_B79 : GRADE_SCALE_B16;
  // score 40–44 in B79 returns grade "6" which appears twice — find by score range context;
  // since we only have the grade string here, return the first match (Low Average label is fine)
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
  const abs    = Math.abs(n);
  const mod100 = abs % 100;
  const mod10  = abs % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th"
    : mod10 === 1 ? "st"
    : mod10 === 2 ? "nd"
    : mod10 === 3 ? "rd"
    : "th";
  return `${n}${suffix}`;
};

/* ─────────────────────────────────────────────
   Score Breakdown Helpers
   Re-Open : reopen_raw/10 + rda/10  → /20
   CA      : (hw+cw+ct)/110 × 25    → /25
   MGT Test: mgt_raw direct          → /15
   CA+MGT combined stored as `ca`   → /40
   Exams   : (exam_raw/100) × 40    → /40
───────────────────────────────────────────── */
const calcReopenScore = (b) => {
  const reopen = Math.min(10, parseFloat(b.reopen_raw) || 0);
  const rda    = Math.min(10, parseFloat(b.rda)        || 0);
  return Math.round((reopen + rda) * 10) / 10;
};

const calcCAonly = (b) => {
  const hw = ["hw1","hw2","hw3","hw4"].reduce((s,k) => s + (parseFloat(b[k]) || 0), 0);
  const cw = ["cw1","cw2","cw3","cw4"].reduce((s,k) => s + (parseFloat(b[k]) || 0), 0);
  const ct = ["ct1","ct2","ct3","ct4"].reduce((s,k) => s + (parseFloat(b[k]) || 0), 0);
  return Math.round(((hw + cw + ct) / 110) * 25 * 10) / 10;
};

const calcMGTScore = (b) =>
  Math.round(Math.min(15, parseFloat(b.mgt_raw) || 0) * 10) / 10;

const calcCAScore = (b) =>
  Math.round((calcCAonly(b) + calcMGTScore(b)) * 10) / 10;

const calcExamsScore = (b) =>
  Math.round(((parseFloat(b.exam_raw) || 0) / 100) * 40 * 10) / 10;

/* ─────────────────────────────────────────────
   Breakdown label helpers
───────────────────────────────────────────── */
const getReopenBreakdown = (breakdowns, studentId) => {
  const b = breakdowns[studentId]?.reopen;
  if (!b) return null;
  return `${parseFloat(b.reopen_raw)||0}+${parseFloat(b.rda)||0}`;
};

const getCABreakdown = (breakdowns, studentId) => {
  const b = breakdowns[studentId]?.ca;
  if (!b) return null;
  const mgt = parseFloat(b.mgt_raw) || 0;
  return `CA:${calcCAonly(b).toFixed(1)} MGT:${mgt}`;
};

const getExamsBreakdown = (breakdowns, studentId) => {
  const b = breakdowns[studentId]?.exams;
  if (!b) return null;
  return `raw:${parseFloat(b.exam_raw)||0}/100`;
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

  .res-score-cell { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .res-score-btn {
    min-width:64px; padding:6px 10px; border-radius:8px; font-family:'DM Mono',monospace;
    font-size:13px; font-weight:600; cursor:pointer; border:1.5px solid #e2e8f0;
    background:#fff; color:#1e293b; transition:all .15s; text-align:center;
    display:flex; align-items:center; justify-content:center; gap:4px;
  }
  .res-score-btn:hover { border-color:#3b82f6; background:#eff6ff; color:#1d4ed8; }
  .res-score-btn-filled { border-color:#93c5fd; background:#f0f7ff; color:#1d4ed8; }
  .res-score-btn-max    { border-color:#86efac; background:#f0fdf4; color:#166534; }
  .res-score-btn-empty  { border-color:#e2e8f0; color:#94a3b8; font-weight:400; }
  .res-score-breakdown  { font-size:10px; color:#94a3b8; font-family:'DM Mono',monospace; white-space:nowrap; }

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

  /* MODAL */
  .res-modal-backdrop {
    position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
    z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px;
    animation: fadeIn .18s ease;
  }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  .res-modal {
    background:#fff; border-radius:18px; width:100%; max-width:500px;
    box-shadow:0 24px 60px rgba(15,23,42,.25); animation: slideUp .2s ease; overflow:hidden;
  }
  @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  .res-modal-header {
    padding:18px 22px 14px; border-bottom:1px solid #f1f5f9;
    display:flex; align-items:center; justify-content:space-between;
  }
  .res-modal-header-left { display:flex; flex-direction:column; gap:2px; }
  .res-modal-title { font-size:15px; font-weight:700; color:#0f172a; margin:0; }
  .res-modal-subtitle { font-size:12px; color:#94a3b8; margin:0; }
  .res-modal-close {
    width:30px; height:30px; border-radius:8px; border:none; background:#f1f5f9;
    color:#64748b; cursor:pointer; display:flex; align-items:center; justify-content:center;
    font-size:16px; transition:all .15s;
  }
  .res-modal-close:hover { background:#e2e8f0; color:#1e293b; }
  .res-modal-body { padding:20px 22px; display:flex; flex-direction:column; gap:18px; max-height:75vh; overflow-y:auto; }
  .res-modal-section { display:flex; flex-direction:column; gap:8px; }
  .res-modal-section-label {
    font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.7px;
    display:flex; align-items:center; justify-content:space-between;
  }
  .res-modal-section-label span { font-weight:400; color:#94a3b8; font-size:10px; letter-spacing:0; text-transform:none; }
  .res-modal-inputs { display:flex; gap:8px; flex-wrap:wrap; }
  .res-modal-field { display:flex; flex-direction:column; gap:4px; flex:1; min-width:70px; }
  .res-modal-field label { font-size:11px; color:#64748b; font-weight:600; }
  .res-modal-field input {
    border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 10px;
    font-family:'DM Mono',monospace; font-size:14px; font-weight:600; color:#1e293b;
    text-align:center; outline:none; transition:all .15s; width:100%; box-sizing:border-box; background:#fafafa;
  }
  .res-modal-field input:focus { border-color:#3b82f6; background:#fff; box-shadow:0 0 0 3px rgba(59,130,246,.1); }
  .res-modal-preview {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border-radius:12px; padding:14px 18px;
    display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
  }
  .res-modal-preview-item { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .res-modal-preview-value { font-family:'DM Mono',monospace; font-size:20px; font-weight:700; color:#fff; line-height:1; }
  .res-modal-preview-label { font-size:10px; color:#64748b; font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
  .res-modal-preview-arrow { color:#475569; font-size:16px; }
  .res-modal-preview-final { font-family:'DM Mono',monospace; font-size:24px; font-weight:800; color:#3b82f6; line-height:1; }
  .res-modal-preview-max { font-size:11px; color:#475569; font-weight:500; }
  .res-modal-footer { padding:14px 22px 20px; display:flex; gap:10px; justify-content:flex-end; }
  .res-modal-btn-cancel {
    padding:9px 20px; border-radius:9px; border:1.5px solid #e2e8f0;
    background:#fff; color:#64748b; font-size:13.5px; font-weight:600; cursor:pointer; transition:all .15s;
  }
  .res-modal-btn-cancel:hover { border-color:#94a3b8; color:#1e293b; }
  .res-modal-btn-apply {
    padding:9px 22px; border-radius:9px; border:none;
    background:#0f172a; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer; transition:all .15s;
    display:flex; align-items:center; gap:8px;
  }
  .res-modal-btn-apply:hover { background:#1e293b; transform:translateY(-1px); box-shadow:0 4px 12px rgba(15,23,42,.2); }
  .res-divider { height:1px; background:#f1f5f9; margin:0 -22px; }
  .res-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:700; }
  .res-pill-blue   { background:#eff6ff; color:#1d4ed8; }
  .res-pill-green  { background:#f0fdf4; color:#166534; }
  .res-pill-purple { background:#f5f3ff; color:#6d28d9; }

  @media (max-width: 640px) {
    .res-body { padding:16px; }
    .res-filters { gap:8px; }
    .res-select { min-width:120px; }
    .res-modal { max-width:100%; }
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
   REOPEN MODAL
───────────────────────────────────────────── */
function ReopenModal({ studentName, initial, onApply, onClose }) {
  const [vals, setVals] = useState({
    reopen_raw: initial?.reopen_raw ?? "",
    rda:        initial?.rda        ?? "",
  });
  const set   = (k, v) => setVals(p => ({ ...p, [k]: v }));
  const score = calcReopenScore(vals);

  return (
    <div className="res-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="res-modal">
        <div className="res-modal-header">
          <div className="res-modal-header-left">
            <p className="res-modal-title">Re-Open Score</p>
            <p className="res-modal-subtitle">{studentName}</p>
          </div>
          <button className="res-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="res-modal-body">
          <div className="res-modal-preview">
            <div className="res-modal-preview-item">
              <span className="res-modal-preview-final">{score.toFixed(1)}</span>
              <span className="res-modal-preview-max">/ 20</span>
            </div>
            <div className="res-modal-preview-item" style={{marginLeft:"auto",alignItems:"flex-end"}}>
              <span style={{fontSize:"10px",color:"#475569"}}>Formula</span>
              <span style={{fontSize:"11px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>Re-Open/10 + RDA/10</span>
            </div>
          </div>
          <div className="res-modal-section">
            <div className="res-modal-section-label">
              Re-Open Assessment
              <span className="res-pill res-pill-blue">max 20 marks total</span>
            </div>
            <div className="res-modal-inputs">
              <div className="res-modal-field">
                <label>Re-Open <span style={{color:"#94a3b8",fontWeight:400}}>/10</span></label>
                <input type="number" min="0" max="10" step="0.5" placeholder="0" value={vals.reopen_raw}
                  onChange={e => set("reopen_raw", Math.min(10, Math.max(0, parseFloat(e.target.value)||0)))} />
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>+</div>
              <div className="res-modal-field">
                <label>RDA <span style={{color:"#94a3b8",fontWeight:400}}>/10</span></label>
                <input type="number" min="0" max="10" step="0.5" placeholder="0" value={vals.rda}
                  onChange={e => set("rda", Math.min(10, Math.max(0, parseFloat(e.target.value)||0)))} />
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
              <div className="res-modal-field">
                <label style={{color:"#3b82f6"}}>Total /20</label>
                <input readOnly value={score.toFixed(1)}
                  style={{background:"#f0f7ff",borderColor:"#93c5fd",color:"#1d4ed8",cursor:"default"}} />
              </div>
            </div>
          </div>
        </div>
        <div className="res-modal-footer">
          <button className="res-modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="res-modal-btn-apply" onClick={() => onApply(score, vals)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply {score.toFixed(1)} / 20
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CA / MGT MODAL
───────────────────────────────────────────── */
function CAModal({ studentName, initial, onApply, onClose }) {
  const [vals, setVals] = useState({
    hw1: initial?.hw1 ?? "", hw2: initial?.hw2 ?? "", hw3: initial?.hw3 ?? "", hw4: initial?.hw4 ?? "",
    cw1: initial?.cw1 ?? "", cw2: initial?.cw2 ?? "", cw3: initial?.cw3 ?? "", cw4: initial?.cw4 ?? "",
    ct1: initial?.ct1 ?? "", ct2: initial?.ct2 ?? "", ct3: initial?.ct3 ?? "", ct4: initial?.ct4 ?? "",
    mgt_raw: initial?.mgt_raw ?? "",
  });

  const set = (k, v) => setVals(p => ({ ...p, [k]: v }));
  const num = (k)    => parseFloat(vals[k]) || 0;

  const hwTotal  = num("hw1")+num("hw2")+num("hw3")+num("hw4");
  const cwTotal  = num("cw1")+num("cw2")+num("cw3")+num("cw4");
  const ctTotal  = num("ct1")+num("ct2")+num("ct3")+num("ct4");
  const caOnly   = calcCAonly(vals);
  const mgtScore = calcMGTScore(vals);
  const combined = calcCAScore(vals);

  const totalField = (val, max, color = "#1d4ed8", bg = "#f0f7ff", border = "#93c5fd") => (
    <div className="res-modal-field">
      <input readOnly value={val.toFixed(1)}
        style={{background:bg,borderColor:border,color,cursor:"default",fontWeight:"700"}} />
      <label style={{color:"#94a3b8",fontSize:"10px",textAlign:"center"}}>/{max}</label>
    </div>
  );

  return (
    <div className="res-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="res-modal" style={{maxWidth:"580px"}}>
        <div className="res-modal-header">
          <div className="res-modal-header-left">
            <p className="res-modal-title">CA / MGT Score</p>
            <p className="res-modal-subtitle">{studentName} · CA (25%) + MGT Test (15%) = 40%</p>
          </div>
          <button className="res-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="res-modal-body">
          {/* Preview */}
          <div className="res-modal-preview">
            <div className="res-modal-preview-item">
              <span style={{fontSize:"12px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>{caOnly.toFixed(1)}/25</span>
              <span className="res-modal-preview-label">CA</span>
            </div>
            <span className="res-modal-preview-arrow">+</span>
            <div className="res-modal-preview-item">
              <span style={{fontSize:"12px",color:"#a78bfa",fontFamily:"'DM Mono',monospace"}}>{mgtScore.toFixed(1)}/15</span>
              <span className="res-modal-preview-label">MGT</span>
            </div>
            <span className="res-modal-preview-arrow">=</span>
            <div className="res-modal-preview-item">
              <span className="res-modal-preview-final">{combined.toFixed(1)}</span>
              <span className="res-modal-preview-max">/ 40</span>
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:"10px"}}>
              {[["HW",hwTotal,20],["CW",cwTotal,40],["CT",ctTotal,50]].map(([lbl,val,mx]) => (
                <div key={lbl} className="res-modal-preview-item">
                  <span style={{fontSize:"11px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>{val.toFixed(1)}/{mx}</span>
                  <span className="res-modal-preview-label">{lbl}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CA Section */}
          <div className="res-modal-section">
            <div className="res-modal-section-label">
              <span style={{display:"flex",alignItems:"center",gap:"6px"}}>
                Continuous Assessment (CA)
                <span className="res-pill res-pill-blue">scaled to /25</span>
              </span>
              <span>raw total /110</span>
            </div>

            {/* Homework */}
            <div style={{marginBottom:"6px"}}>
              <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:"600",marginBottom:"4px",textTransform:"uppercase",letterSpacing:".5px"}}>
                Homework — 4 × 5 = /20
              </div>
              <div className="res-modal-inputs" style={{alignItems:"flex-start"}}>
                {["hw1","hw2","hw3","hw4"].map(k => (
                  <div className="res-modal-field" key={k}>
                    <label>HW {k.slice(2)}</label>
                    <input type="number" min="0" max="5" step="0.5" placeholder="0" value={vals[k]}
                      onChange={e => set(k, Math.min(5, Math.max(0, parseFloat(e.target.value)||0)))} />
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
                {totalField(hwTotal, 20)}
              </div>
            </div>

            {/* Classwork */}
            <div style={{marginBottom:"6px"}}>
              <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:"600",marginBottom:"4px",textTransform:"uppercase",letterSpacing:".5px"}}>
                Classwork — 4 × 10 = /40
              </div>
              <div className="res-modal-inputs" style={{alignItems:"flex-start"}}>
                {["cw1","cw2","cw3","cw4"].map(k => (
                  <div className="res-modal-field" key={k}>
                    <label>CW {k.slice(2)}</label>
                    <input type="number" min="0" max="10" step="0.5" placeholder="0" value={vals[k]}
                      onChange={e => set(k, Math.min(10, Math.max(0, parseFloat(e.target.value)||0)))} />
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
                {totalField(cwTotal, 40)}
              </div>
            </div>

            {/* Class Test */}
            <div>
              <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:"600",marginBottom:"4px",textTransform:"uppercase",letterSpacing:".5px"}}>
                Class Test — 10+10+10+20 = /50
              </div>
              <div className="res-modal-inputs" style={{alignItems:"flex-start"}}>
                {[["ct1",10],["ct2",10],["ct3",10],["ct4",20]].map(([k,max]) => (
                  <div className="res-modal-field" key={k}>
                    <label>CT{k.slice(2)} /{max}</label>
                    <input type="number" min="0" max={max} step="0.5" placeholder="0" value={vals[k]}
                      onChange={e => set(k, Math.min(max, Math.max(0, parseFloat(e.target.value)||0)))} />
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
                {totalField(ctTotal, 50)}
              </div>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"4px",padding:"8px 12px",background:"#eff6ff",borderRadius:"8px",border:"1px solid #bfdbfe"}}>
              <span style={{fontSize:"12px",color:"#64748b"}}>CA raw ({(hwTotal+cwTotal+ctTotal).toFixed(1)}/110) scaled to</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontWeight:"700",color:"#1d4ed8",fontSize:"15px"}}>{caOnly.toFixed(1)} / 25</span>
            </div>
          </div>

          <div className="res-divider" />

          {/* MGT Test */}
          <div className="res-modal-section">
            <div className="res-modal-section-label">
              <span style={{display:"flex",alignItems:"center",gap:"6px"}}>
                MGT Test
                <span className="res-pill res-pill-purple">direct entry /15</span>
              </span>
            </div>
            <div className="res-modal-inputs">
              <div className="res-modal-field" style={{flex:"none",width:"120px"}}>
                <label>MGT Score <span style={{color:"#94a3b8",fontWeight:400}}>/15</span></label>
                <input type="number" min="0" max="15" step="0.5" placeholder="0" value={vals.mgt_raw}
                  style={{fontSize:"22px",padding:"10px"}}
                  onChange={e => set("mgt_raw", Math.min(15, Math.max(0, parseFloat(e.target.value)||0)))}
                  autoFocus />
              </div>
              <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end",paddingBottom:"4px",color:"#94a3b8",fontSize:"12px",gap:"2px"}}>
                <span>Entered directly</span><span>No scaling applied</span>
              </div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#f0fdf4",borderRadius:"10px",border:"1px solid #bbf7d0"}}>
            <span style={{fontSize:"13px",color:"#166534",fontWeight:"600"}}>CA + MGT Combined Total</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:"800",color:"#166534",fontSize:"18px"}}>{combined.toFixed(1)} / 40</span>
          </div>
        </div>
        <div className="res-modal-footer">
          <button className="res-modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="res-modal-btn-apply" onClick={() => onApply(combined, vals)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply {combined.toFixed(1)} / 40
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   EXAMS MODAL
───────────────────────────────────────────── */
function ExamsModal({ studentName, initial, onApply, onClose }) {
  const [examRaw, setExamRaw] = useState(initial?.exam_raw ?? "");
  const raw   = parseFloat(examRaw) || 0;
  const score = Math.round((raw / 100) * 40 * 10) / 10;

  return (
    <div className="res-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="res-modal" style={{maxWidth:"380px"}}>
        <div className="res-modal-header">
          <div className="res-modal-header-left">
            <p className="res-modal-title">Examination Score</p>
            <p className="res-modal-subtitle">{studentName}</p>
          </div>
          <button className="res-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="res-modal-body">
          <div className="res-modal-preview">
            <div className="res-modal-preview-item">
              <span className="res-modal-preview-value">{raw.toFixed(1)}</span>
              <span className="res-modal-preview-label">Raw /100</span>
            </div>
            <span className="res-modal-preview-arrow">→</span>
            <div className="res-modal-preview-item">
              <span className="res-modal-preview-final">{score.toFixed(1)}</span>
              <span className="res-modal-preview-max">/ 40</span>
            </div>
            <div className="res-modal-preview-item" style={{marginLeft:"auto",alignItems:"flex-end"}}>
              <span style={{fontSize:"10px",color:"#475569"}}>Formula</span>
              <span style={{fontSize:"11px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>(raw/100)×40</span>
            </div>
          </div>
          <div className="res-modal-section">
            <div className="res-modal-section-label">
              Exam Score <span>enter raw mark out of 100</span>
            </div>
            <div className="res-modal-inputs">
              <div className="res-modal-field" style={{flex:"none",width:"120px"}}>
                <label>Raw Mark</label>
                <input type="number" min="0" max="100" step="0.5" placeholder="0" value={examRaw}
                  style={{fontSize:"24px",padding:"12px 10px"}}
                  onChange={e => setExamRaw(Math.min(100, Math.max(0, parseFloat(e.target.value)||0)))}
                  autoFocus />
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700",fontSize:"20px"}}>/</div>
              <div className="res-modal-field" style={{flex:"none",width:"60px"}}>
                <label>Max</label>
                <input readOnly value="100"
                  style={{background:"#f8fafc",color:"#94a3b8",cursor:"default",fontSize:"24px",padding:"12px 10px"}} />
              </div>
            </div>
          </div>
        </div>
        <div className="res-modal-footer">
          <button className="res-modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="res-modal-btn-apply" onClick={() => onApply(score, { exam_raw: raw })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply {score.toFixed(1)} / 40
          </button>
        </div>
      </div>
    </div>
  );
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
  const [selectedTerm, setSelectedTerm]       = useState("term3");   // ← Term 3
  const [selectedYear, setSelectedYear]       = useState("2026");    // ← 2026
  const [selectedSubject, setSelectedSubject] = useState("");
  const [classLevel, setClassLevel]           = useState("basic_7_9");
  const [scores, setScores]                   = useState({});
  const [breakdowns, setBreakdowns]           = useState({});
  const [existingIds, setExistingIds]         = useState({});
  const [saving, setSaving]                   = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingScores, setLoadingScores]     = useState(false);
  const [deleting, setDeleting]               = useState(null);
  const [summary, setSummary]                 = useState([]);
  const [loadingSummary, setLoadingSummary]   = useState(false);
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [modal, setModal]                     = useState(null);

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
        map[r.student] = { ca: r.ca ?? "", reopen: r.reopen ?? "", exams: r.exams ?? "" };
        ids[r.student] = r.id;
      });

      const next = {};
      studentList.forEach(s => {
        next[s.id] = map[s.id] || { ca: "", reopen: "", exams: "" };
      });

      setScores(next);
      setExistingIds(ids);
      loadedRef.current = {
        class:   selectedClass,
        subject: selectedSubject,
        term:    selectedTerm,
        year:    selectedYear,
      };

      if (records.length > 0)
        toast(`Loaded ${records.length} saved result${records.length !== 1 ? "s" : ""}.`, "info");
    } catch {
      toast("Failed to load existing scores.", "error");
    } finally {
      setLoadingScores(false);
    }
  }, [selectedClass, selectedTerm, selectedSubject, selectedYear, students]);

  useEffect(() => {
    if (!selectedClass || !selectedSubject || !selectedTerm || !students.length) {
      if (!selectedSubject) { setScores({}); setExistingIds({}); }
      return;
    }
    const ref = loadedRef.current;
    const alreadyLoaded =
      ref.class   === selectedClass   &&
      ref.subject === selectedSubject &&
      ref.term    === selectedTerm    &&
      ref.year    === selectedYear;
    if (alreadyLoaded) return;
    setScores({}); setExistingIds({});
    loadExistingScores(students);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedSubject, selectedTerm, selectedYear, students]);

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
    setScores({}); setExistingIds({});
    setStudents([]); setSummary([]);
    setExpandedStudent(null); setBreakdowns({});
    loadedRef.current = { class: "", subject: "", term: "", year: "" };
    const found = classes.find(c => String(c.id) === String(id));
    const name  = (found?.name || "").toLowerCase();
    // Basic 7/8/9 and JHS use numeric grades; everything else (Basic 1–6, KG, KG2, Kindergold, Montessori) uses letter grades
    const isB79 = ["basic 7","basic 8","basic 9","b7","b8","b9","jhs"].some(m => name.includes(m));
    setClassLevel(isB79 ? "basic_7_9" : "basic_1_6");
  };

  /* ── Modal apply handlers ── */
  const applyReopen = (score, breakdown) => {
    const { studentId } = modal;
    setScores(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), reopen: score } }));
    setBreakdowns(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), reopen: breakdown } }));
    setModal(null);
  };

  const applyCA = (score, breakdown) => {
    const { studentId } = modal;
    setScores(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), ca: score } }));
    setBreakdowns(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), ca: breakdown } }));
    setModal(null);
  };

  const applyExams = (score, breakdown) => {
    const { studentId } = modal;
    setScores(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), exams: score } }));
    setBreakdowns(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), exams: breakdown } }));
    setModal(null);
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
      setBreakdowns(prev => { const n = { ...prev }; delete n[studentId]; return n; });
      loadedRef.current = { class: "", subject: "", term: "", year: "" };
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
      loadedRef.current = { class: "", subject: "", term: "", year: "" };
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

  const editIcon = (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
  const addIcon = (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
    </svg>
  );

  /* ─────────────────────────────────────────────
     Render
  ───────────────────────────────────────────── */
  return (
    <div className="res-root">

      {/* Modals */}
      {modal?.type === "reopen" && (
        <ReopenModal studentName={modal.studentName} initial={breakdowns[modal.studentId]?.reopen}
          onApply={applyReopen} onClose={() => setModal(null)} />
      )}
      {modal?.type === "ca" && (
        <CAModal studentName={modal.studentName} initial={breakdowns[modal.studentId]?.ca}
          onApply={applyCA} onClose={() => setModal(null)} />
      )}
      {modal?.type === "exams" && (
        <ExamsModal studentName={modal.studentName} initial={breakdowns[modal.studentId]?.exams}
          onApply={applyExams} onClose={() => setModal(null)} />
      )}

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
                value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
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
                className={`res-tab ${tab === t ? "res-tab-active" : ""}`}>{t}</button>
            ))}
          </div>
        )}

        {/* ── Enter Results ── */}
        {tab === "Enter Results" && (
          <>
            {!selectedClass && (
              <div className="res-empty"><div className="res-empty-icon">🏫</div>
                <h3>Select a class to begin</h3><p>Choose a year, term, class and subject to load or enter results.</p></div>
            )}
            {selectedClass && !selectedSubject && !loadingStudents && (
              <div className="res-empty"><div className="res-empty-icon">📚</div>
                <h3>Select a subject</h3><p>Choose a subject above to load existing results or enter new ones.</p></div>
            )}

            {selectedClass && selectedSubject && (
              <>
                <div className="res-info-bar">
                  <div className="res-info-bar-left">
                    <span className="res-badge res-badge-blue">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
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
                  <div style={{fontSize:"12px",color:"#94a3b8",display:"flex",alignItems:"center",gap:"6px"}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                    Click any score cell to enter breakdown details
                  </div>
                </div>

                {loadingStudents ? (
                  <div className="res-table-card">
                    <table className="res-table"><tbody>
                      {[...Array(5)].map((_, i) => (
                        <tr key={i} className="res-skeleton-row">
                          {[...Array(9)].map((__, j) => (
                            <td key={j}><div className="res-skeleton" style={{width:j===1?"120px":"60px"}}/></td>
                          ))}
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                ) : students.length === 0 ? (
                  <div className="res-empty"><div className="res-empty-icon">👤</div>
                    <h3>No students found</h3><p>No students are assigned to this class.</p></div>
                ) : (
                  <div className="res-table-card">
                    <table className="res-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th style={{textAlign:"left"}}>Student</th>
                          <th>CLASS SC.<br/><span style={{fontWeight:400,fontSize:"10px",color:"#475569"}}>/40 (click)</span></th>
                          <th>RE-OPEN<br/><span style={{fontWeight:400,fontSize:"10px",color:"#475569"}}>/20 (click)</span></th>
                          <th>EXAMS<br/><span style={{fontWeight:400,fontSize:"10px",color:"#475569"}}>/40 (click)</span></th>
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
                          const remark  = grade ? computeRemark(grade, classLevel) : null;
                          const clr     = grade ? (GRADE_COLORS[grade] || "#64748b") : null;
                          const isSaved = !!existingIds[student.id];
                          const name    = getStudentName(student);

                          const caVal = s.ca; const rVal = s.reopen; const eVal = s.exams;
                          const caFilled = caVal !== "" && caVal !== 0;
                          const rFilled  = rVal  !== "" && rVal  !== 0;
                          const eFilled  = eVal  !== "" && eVal  !== 0;

                          const caBreak    = getCABreakdown(breakdowns, student.id);
                          const rBreak     = getReopenBreakdown(breakdowns, student.id);
                          const examsBreak = getExamsBreakdown(breakdowns, student.id);

                          return (
                            <tr key={student.id}>
                              <td style={{color:"#94a3b8",fontFamily:"'DM Mono',monospace",fontSize:"12px"}}>{i+1}</td>
                              <td>
                                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                                  <div style={{width:"28px",height:"28px",borderRadius:"50%",background:`hsl(${(student.id*47)%360},55%,88%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"700",color:`hsl(${(student.id*47)%360},55%,35%)`,flexShrink:0}}>
                                    {name.charAt(0)}
                                  </div>
                                  <div>
                                    <div style={{fontWeight:"600",color:"#1e293b",fontSize:"13.5px"}}>{name}</div>
                                    {isSaved && <div style={{fontSize:"11px",color:"#3b82f6",display:"flex",alignItems:"center",gap:"3px"}}><span className="res-saved-dot"/>saved</div>}
                                  </div>
                                </div>
                              </td>

                              {/* CLASS SCORE (CA/MGT) */}
                              <td>
                                <div className="res-score-cell">
                                  <button className={`res-score-btn ${caFilled?(parseFloat(caVal)===40?"res-score-btn-max":"res-score-btn-filled"):"res-score-btn-empty"}`}
                                    onClick={() => setModal({ type:"ca", studentId:student.id, studentName:name })}>
                                    {caFilled ? <>{editIcon}{parseFloat(caVal).toFixed(1)}</> : <>{addIcon}Enter</>}
                                  </button>
                                  {caBreak && <span className="res-score-breakdown">{caBreak}</span>}
                                </div>
                              </td>

                              {/* RE-OPEN */}
                              <td>
                                <div className="res-score-cell">
                                  <button className={`res-score-btn ${rFilled?(parseFloat(rVal)===20?"res-score-btn-max":"res-score-btn-filled"):"res-score-btn-empty"}`}
                                    onClick={() => setModal({ type:"reopen", studentId:student.id, studentName:name })}>
                                    {rFilled ? <>{editIcon}{parseFloat(rVal).toFixed(1)}</> : <>{addIcon}Enter</>}
                                  </button>
                                  {rBreak && <span className="res-score-breakdown">{rBreak}</span>}
                                </div>
                              </td>

                              {/* EXAMS */}
                              <td>
                                <div className="res-score-cell">
                                  <button className={`res-score-btn ${eFilled?(parseFloat(eVal)===40?"res-score-btn-max":"res-score-btn-filled"):"res-score-btn-empty"}`}
                                    onClick={() => setModal({ type:"exams", studentId:student.id, studentName:name })}>
                                    {eFilled ? <>{editIcon}{parseFloat(eVal).toFixed(1)}</> : <>{addIcon}Enter</>}
                                  </button>
                                  {examsBreak && <span className="res-score-breakdown">{examsBreak}</span>}
                                </div>
                              </td>

                              <td>{dirty ? <span className="res-total">{total}</span> : <span className="res-total-dash">—</span>}</td>
                              <td>{grade ? <span className="res-grade" style={{background:`${clr}18`,color:clr}}>{grade}</span> : <span style={{color:"#e2e8f0"}}>—</span>}</td>
                              <td style={{fontSize:"12px",color:clr||"#cbd5e1"}}>{remark || "—"}</td>
                              <td>
                                {isSaved && (
                                  <button className="res-btn-delete" onClick={() => handleDeleteResult(student.id)} disabled={deleting === student.id}>
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

                {students.length > 0 && (
                  <>
                    <div className="res-legend">
                      <span style={{fontSize:"11px",fontWeight:"700",color:"#475569",marginRight:"4px",alignSelf:"center"}}>GRADE SCALE:</span>
                      {gradeScale.map((item, idx) => {
                        const c = GRADE_COLORS[item.grade] || "#64748b";
                        return (
                          <div key={item.grade + item.range + idx} className="res-legend-item">
                            <span className="res-grade" style={{background:`${c}18`,color:c,padding:"1px 6px"}}>{item.grade}</span>
                            <span className="res-legend-range">{item.range}</span>
                            <span style={{fontSize:"11px",color:"#94a3b8"}}>{item.remark}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="res-btn-save-wrap">
                      <div style={{fontSize:"13px",color:"#94a3b8"}}>
                        {filledCount === 0 ? "Click any score cell to enter breakdown details" : `${filledCount} of ${students.length} students have scores entered`}
                      </div>
                      <button className="res-btn-save" onClick={submitResults} disabled={saving || filledCount === 0}>
                        {saving ? (
                          <><div className="res-spinner" style={{borderTopColor:"#fff"}}/> Saving…</>
                        ) : (
                          <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                          </svg>Save {filledCount} Result{filledCount !== 1 ? "s" : ""}</>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Class Summary ── */}
        {tab === "Class Summary" && (
          <>
            {!selectedClass && <div className="res-empty"><div className="res-empty-icon">📊</div><h3>Select a class</h3><p>Choose a class and term to view the summary.</p></div>}
            {loadingSummary && <div className="res-loading-overlay"><div className="res-spinner"/>Loading summary…</div>}
            {!loadingSummary && selectedClass && summary.length === 0 && (
              <div className="res-empty"><div className="res-empty-icon">📭</div><h3>No results yet</h3><p>No results found for this class and term.</p></div>
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
                          <tr onClick={() => setExpandedStudent(expandedStudent === row.student_id ? null : row.student_id)}
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
                              <span className="res-grade" style={{background:`${clr}18`,color:clr}}>{row.overall_grade}</span>
                            </td>
                            <td style={{textAlign:"center",fontSize:"12px",color:"#3b82f6"}}>
                              {expandedStudent === row.student_id ? "▲ Hide" : "▼ Show"}
                            </td>
                          </tr>
                          {expandedStudent === row.student_id && (
                            <tr><td colSpan={7} style={{padding:"0",background:"#f8fafc"}}>
                              <div className="res-expand-inner">
                                <table className="res-sub-table">
                                  <thead>
                                    <tr>
                                      <th style={{textAlign:"left"}}>Subject</th>
                                      <th>Class SC.</th><th>Re-Open</th><th>Exams</th>
                                      <th>Total</th><th>Position</th><th>Grade</th><th>Remark</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.subjects.map(sub => {
                                      const sc = GRADE_COLORS[sub.grade] || "#64748b";
                                      return (
                                        <tr key={sub.subject_id}>
                                          <td>{sub.subject_name}</td>
                                          <td>{sub.ca     ?? "—"}</td>
                                          <td>{sub.reopen ?? "—"}</td>
                                          <td>{sub.exams  ?? "—"}</td>
                                          <td style={{fontWeight:"700",color:"#1d4ed8",fontFamily:"'DM Mono',monospace"}}>{sub.score ?? "—"}</td>
                                          <td style={{color:"#64748b"}}>{fmtPos(sub.subject_position)}</td>
                                          <td><span className="res-grade" style={{background:`${sc}18`,color:sc,fontSize:"11px"}}>{sub.grade ?? "—"}</span></td>
                                          <td style={{fontSize:"11.5px",color:sc}}>{sub.remark ?? "—"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td></tr>
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