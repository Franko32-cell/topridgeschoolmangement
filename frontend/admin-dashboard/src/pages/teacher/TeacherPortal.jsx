// apps/teacher/components/TeacherPortal.jsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { getUser, logout } from "../../services/auth";
import API from "../../services/api";
import AnnouncementsFeed from "../AnnouncementsFeed";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const TERMS = [
  { value: "term1", label: "Term 1" },
  { value: "term2", label: "Term 2" },
  { value: "term3", label: "Term 3" },
];

const YEARS = [2026, 2025, 2024, 2023, 2022];

const GRADE_REMARK = {
  "1":  { label: "HIGHEST",       color: "#16a34a", bg: "bg-emerald-100 text-emerald-800" },
  "2":  { label: "HIGHER",        color: "#059669", bg: "bg-emerald-50  text-emerald-700" },
  "3":  { label: "HIGH",          color: "#0284c7", bg: "bg-blue-100    text-blue-800"    },
  "4":  { label: "HIGH AVERAGE",  color: "#0891b2", bg: "bg-cyan-100    text-cyan-800"    },
  "5":  { label: "AVERAGE",       color: "#ca8a04", bg: "bg-yellow-100  text-yellow-800"  },
  "6":  { label: "LOW AVERAGE",   color: "#ea580c", bg: "bg-orange-100  text-orange-800"  },
  "7":  { label: "LOW",           color: "#dc2626", bg: "bg-red-100     text-red-700"     },
  "8":  { label: "LOWER",         color: "#b91c1c", bg: "bg-red-200     text-red-800"     },
  "9":  { label: "LOWEST",        color: "#991b1b", bg: "bg-red-300     text-red-900"     },
  "A":  { label: "EXCELLENT",     color: "#16a34a", bg: "bg-emerald-100 text-emerald-800" },
  "B":  { label: "VERY GOOD",     color: "#059669", bg: "bg-emerald-50  text-emerald-700" },
  "C":  { label: "GOOD",          color: "#0284c7", bg: "bg-blue-100    text-blue-800"    },
  "D":  { label: "HIGH AVERAGE",  color: "#0891b2", bg: "bg-cyan-100    text-cyan-800"    },
  "E2": { label: "BELOW AVERAGE", color: "#ea580c", bg: "bg-orange-100  text-orange-800"  },
  "E3": { label: "LOW",           color: "#dc2626", bg: "bg-red-100     text-red-700"     },
  "E4": { label: "LOWER",         color: "#b91c1c", bg: "bg-red-200     text-red-800"     },
  "E5": { label: "LOWEST",        color: "#991b1b", bg: "bg-red-300     text-red-900"     },
};

// Grade colors for legend pills (matches GRADE_REMARK colors)
const GRADE_COLORS = {
  "1": "#16a34a", "2": "#059669", "3": "#0284c7",
  "4": "#0891b2", "5": "#ca8a04", "6": "#ea580c",
  "7": "#dc2626", "8": "#b91c1c", "9": "#991b1b",
  "A": "#16a34a", "B": "#059669", "C": "#0284c7",
  "D": "#0891b2", "E2": "#ea580c", "E3": "#dc2626",
  "E4": "#b91c1c", "E5": "#991b1b",
};

const GRADE_SCALE_B79 = [
  { range: "90–100", grade: "1",  label: "HIGHEST"      },
  { range: "80–89",  grade: "2",  label: "HIGHER"       },
  { range: "60–79",  grade: "3",  label: "HIGH"         },
  { range: "55–59",  grade: "4",  label: "HIGH AVERAGE" },
  { range: "50–54",  grade: "5",  label: "AVERAGE"      },
  { range: "45–49",  grade: "6",  label: "LOW AVERAGE"  },
  { range: "40–44",  grade: "7",  label: "LOW"          },
  { range: "35–39",  grade: "8",  label: "LOWER"        },
  { range: "0–34",   grade: "9",  label: "LOWEST"       },
];

const GRADE_SCALE_B16 = [
  { range: "90–100", grade: "A",  label: "EXCELLENT"     },
  { range: "80–89",  grade: "B",  label: "VERY GOOD"     },
  { range: "60–79",  grade: "C",  label: "GOOD"          },
  { range: "55–59",  grade: "D",  label: "HIGH AVERAGE"  },
  { range: "45–49",  grade: "E2", label: "BELOW AVERAGE" },
  { range: "40–44",  grade: "E3", label: "LOW"           },
  { range: "35–39",  grade: "E4", label: "LOWER"         },
  { range: "0–34",   grade: "E5", label: "LOWEST"        },
];

const CONDUCT_OPTIONS = ["Excellent", "Very Good", "Good", "Fair", "Poor"];

const TABS = [
  { key: "Classes",       icon: "🏫", label: "Classes"       },
  { key: "Attendance",    icon: "📋", label: "Attendance"    },
  { key: "Results",       icon: "📊", label: "Results"       },
  { key: "Reports",       icon: "📄", label: "Reports"       },
  { key: "Announcements", icon: "📢", label: "Announcements" },
];

const STATUS_CYCLE  = { present: "absent", absent: "late", late: "present" };
const STATUS_CONFIG = {
  present: { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", label: "Present" },
  absent:  { dot: "bg-red-500",     pill: "bg-red-50    text-red-700    ring-1 ring-red-200",        label: "Absent"  },
  late:    { dot: "bg-amber-400",   pill: "bg-amber-50  text-amber-700  ring-1 ring-amber-200",      label: "Late"    },
};

const todayStr = new Date().toISOString().split("T")[0];

// ─────────────────────────────────────────────
// Score breakdown helpers
//
// Re-Open : reopen_raw/10 + rda/10 → direct sum → /20
// CA      : (hw+cw+ct)/110 × 25   → /25
// MGT Test: mgt_raw direct         → /15
// CA+MGT combined stored as `ca`  → /40
// Exams   : (exam_raw/100) × 40   → /40
// Total                            → /100
// ─────────────────────────────────────────────

const calcReopenScore = (breakdown) => {
  const reopen = Math.min(10, parseFloat(breakdown.reopen_raw) || 0);
  const rda    = Math.min(10, parseFloat(breakdown.rda)        || 0);
  return Math.round((reopen + rda) * 10) / 10;
};

const calcCAonly = (breakdown) => {
  const hw = ["hw1","hw2","hw3","hw4"].reduce((s,k) => s + (parseFloat(breakdown[k]) || 0), 0);
  const cw = ["cw1","cw2","cw3","cw4"].reduce((s,k) => s + (parseFloat(breakdown[k]) || 0), 0);
  const ct = ["ct1","ct2","ct3","ct4"].reduce((s,k) => s + (parseFloat(breakdown[k]) || 0), 0);
  return Math.round(((hw + cw + ct) / 110) * 25 * 10) / 10;
};

const calcMGTScore  = (breakdown) => Math.round(Math.min(15, parseFloat(breakdown.mgt_raw) || 0) * 10) / 10;
const calcCAScore   = (breakdown) => Math.round((calcCAonly(breakdown) + calcMGTScore(breakdown)) * 10) / 10;
const calcExamsScore = (breakdown) => Math.round(((parseFloat(breakdown.exam_raw) || 0) / 100) * 40 * 10) / 10;

// ─────────────────────────────────────────────
// General helpers
// ─────────────────────────────────────────────

const computeTotal = (reopen, ca, exams) =>
  Math.round(((parseFloat(reopen)||0) + (parseFloat(ca)||0) + (parseFloat(exams)||0)) * 10) / 10;

const THRESHOLDS_B79 = [
  [90,"1"],[80,"2"],[60,"3"],[55,"4"],[50,"5"],[45,"6"],[40,"7"],[35,"8"],[0,"9"],
];
const THRESHOLDS_B16 = [
  [90,"A"],[80,"B"],[60,"C"],[55,"D"],[45,"E2"],[40,"E3"],[35,"E4"],[0,"E5"],
];

const gradeFromTotal = (total, level = "basic_7_9") => {
  const thresholds = (level === "basic_1_6" || level === "nursery_kg")
    ? THRESHOLDS_B16 : THRESHOLDS_B79;
  for (const [min, grade] of thresholds) if (total >= min) return grade;
  return thresholds[thresholds.length - 1][1];
};

const fmtPos = (n) => {
  if (n == null) return "—";
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// ─────────────────────────────────────────────
// Breakdown label helpers (sub-text under score buttons)
// ─────────────────────────────────────────────

const getReopenBreakdown = (breakdowns, studentId) => {
  const b = breakdowns[studentId]?.reopen;
  if (!b) return null;
  return `${parseFloat(b.reopen_raw)||0}+${parseFloat(b.rda)||0}`;
};

const getCABreakdown = (breakdowns, studentId) => {
  const b = breakdowns[studentId]?.ca;
  if (!b) return null;
  return `CA:${calcCAonly(b).toFixed(1)} MGT:${parseFloat(b.mgt_raw)||0}`;
};

const getExamsBreakdown = (breakdowns, studentId) => {
  const b = breakdowns[studentId]?.exams;
  if (!b) return null;
  return `raw:${parseFloat(b.exam_raw)||0}/100`;
};

// ─────────────────────────────────────────────
// Toast hook (from TeacherPortalResults)
// ─────────────────────────────────────────────

let _toastId = 0;
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "success") => {
    const id = ++_toastId;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

// ─────────────────────────────────────────────
// Styles (modal + score cells + toast + skeleton + legend)
// ─────────────────────────────────────────────

const PORTAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  @keyframes tp-modal-fadein  { from{opacity:0} to{opacity:1} }
  @keyframes tp-modal-slideup { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes tp-spin          { to{transform:rotate(360deg)} }
  @keyframes tp-slide-up      { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes tp-slideIn       { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }
  @keyframes tp-shimmer       { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

  /* ── Modals ── */
  .tp-modal-backdrop {
    position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
    z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px;
    animation:tp-modal-fadein .18s ease;
  }
  .tp-modal {
    background:#fff; border-radius:18px; width:100%; max-width:500px;
    box-shadow:0 24px 60px rgba(15,23,42,.25); animation:tp-modal-slideup .2s ease; overflow:hidden;
  }
  .tp-modal-header {
    padding:18px 22px 14px; border-bottom:1px solid #f1f5f9;
    display:flex; align-items:center; justify-content:space-between;
  }
  .tp-modal-title   { font-size:15px; font-weight:700; color:#0f172a; margin:0; font-family:'DM Sans',sans-serif; }
  .tp-modal-subtitle{ font-size:12px; color:#94a3b8; margin:0; font-family:'DM Sans',sans-serif; }
  .tp-modal-close   {
    width:30px; height:30px; border-radius:8px; border:none; background:#f1f5f9;
    color:#64748b; cursor:pointer; display:flex; align-items:center; justify-content:center;
    font-size:16px; transition:all .15s;
  }
  .tp-modal-close:hover { background:#e2e8f0; color:#1e293b; }
  .tp-modal-body { padding:20px 22px; display:flex; flex-direction:column; gap:18px; max-height:75vh; overflow-y:auto; }

  .tp-modal-preview {
    background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
    border-radius:12px; padding:14px 18px;
    display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
  }
  .tp-preview-item  { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .tp-preview-val   { font-family:'DM Mono',monospace; font-size:20px; font-weight:700; color:#fff; line-height:1; }
  .tp-preview-lbl   { font-size:10px; color:#64748b; font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
  .tp-preview-arrow { color:#475569; font-size:16px; }
  .tp-preview-final { font-family:'DM Mono',monospace; font-size:24px; font-weight:800; color:#3b82f6; line-height:1; }
  .tp-preview-max   { font-size:11px; color:#475569; font-weight:500; }

  .tp-modal-section { display:flex; flex-direction:column; gap:8px; }
  .tp-section-label {
    font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.7px;
    display:flex; align-items:center; justify-content:space-between;
  }
  .tp-section-label span { font-weight:400; color:#94a3b8; font-size:10px; letter-spacing:0; text-transform:none; }
  .tp-modal-inputs  { display:flex; gap:8px; flex-wrap:wrap; }
  .tp-modal-field   { display:flex; flex-direction:column; gap:4px; flex:1; min-width:70px; }
  .tp-modal-field label { font-size:11px; color:#64748b; font-weight:600; font-family:'DM Sans',sans-serif; }
  .tp-modal-field input {
    border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 10px;
    font-family:'DM Mono',monospace; font-size:14px; font-weight:600; color:#1e293b;
    text-align:center; outline:none; transition:all .15s; width:100%; box-sizing:border-box; background:#fafafa;
  }
  .tp-modal-field input:focus { border-color:#3b82f6; background:#fff; box-shadow:0 0 0 3px rgba(59,130,246,.1); }

  .tp-divider { height:1px; background:#f1f5f9; margin:0 -22px; }

  .tp-modal-footer { padding:14px 22px 20px; display:flex; gap:10px; justify-content:flex-end; }
  .tp-modal-btn-cancel {
    padding:9px 20px; border-radius:9px; border:1.5px solid #e2e8f0;
    background:#fff; color:#64748b; font-size:13.5px; font-weight:600; cursor:pointer; transition:all .15s;
    font-family:'DM Sans',sans-serif;
  }
  .tp-modal-btn-cancel:hover { border-color:#94a3b8; color:#1e293b; }
  .tp-modal-btn-apply {
    padding:9px 22px; border-radius:9px; border:none;
    background:#0f172a; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer; transition:all .15s;
    display:flex; align-items:center; gap:8px; font-family:'DM Sans',sans-serif;
  }
  .tp-modal-btn-apply:hover { background:#1e293b; transform:translateY(-1px); box-shadow:0 4px 12px rgba(15,23,42,.2); }

  /* Pill labels */
  .tp-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:700; }
  .tp-pill-blue   { background:#eff6ff; color:#1d4ed8; }
  .tp-pill-purple { background:#f5f3ff; color:#6d28d9; }
  .tp-pill-green  { background:#f0fdf4; color:#166534; }

  /* ── Score buttons ── */
  .tp-score-cell { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .tp-score-btn {
    min-width:72px; padding:6px 10px; border-radius:8px;
    font-size:13px; font-weight:600; cursor:pointer; border:1.5px solid #e2e8f0;
    background:#fff; color:#1e293b; transition:all .15s; text-align:center;
    display:flex; align-items:center; justify-content:center; gap:4px;
    font-family:'DM Mono',monospace;
  }
  .tp-score-btn:hover       { border-color:#3b82f6; background:#eff6ff; color:#1d4ed8; }
  .tp-score-btn-filled      { border-color:#93c5fd; background:#f0f7ff; color:#1d4ed8; }
  .tp-score-btn-max         { border-color:#86efac; background:#f0fdf4; color:#166534; }
  .tp-score-btn-empty       { border-color:#e2e8f0; color:#94a3b8; font-weight:400; }
  .tp-score-breakdown       { font-size:10px; color:#94a3b8; white-space:nowrap; font-family:'DM Mono',monospace; }

  /* ── Saved dot ── */
  .tp-saved-dot {
    display:inline-block; width:6px; height:6px; border-radius:50%;
    background:#10b981; margin-right:4px; vertical-align:middle;
  }

  /* ── Skeleton shimmer ── */
  .tp-skeleton {
    height:13px; border-radius:5px;
    background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);
    background-size:200% 100%; animation:tp-shimmer 1.4s infinite;
  }

  /* ── Grade legend ── */
  .tp-legend {
    display:flex; flex-wrap:wrap; gap:5px; margin-top:0;
    padding:12px 14px; background:#fff; border-top:1px solid #f1f5f9;
  }
  .tp-legend-item {
    display:flex; align-items:center; gap:4px;
    padding:2px 7px; background:#f8fafc; border-radius:5px; font-size:11px;
  }
  .tp-legend-range { font-family:'DM Mono',monospace; color:#64748b; font-size:10.5px; }
  .tp-grade-pill {
    display:inline-block; padding:1px 7px; border-radius:20px;
    font-size:11px; font-weight:700; letter-spacing:.3px; font-family:'DM Mono',monospace;
  }

  /* ── Toast ── */
  .tp-toast-wrap {
    position:fixed; top:20px; right:20px; z-index:9999;
    display:flex; flex-direction:column; gap:8px; pointer-events:none;
  }
  .tp-toast-item {
    padding:11px 16px; border-radius:10px; font-size:13px; font-weight:500;
    display:flex; align-items:center; gap:9px;
    box-shadow:0 4px 20px rgba(0,0,0,.12); animation:tp-slideIn .2s ease;
    min-width:260px; pointer-events:all; font-family:'DM Sans',sans-serif;
  }
  .tp-toast-success { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
  .tp-toast-error   { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }
  .tp-toast-info    { background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; }

  @media (max-width:640px) { .tp-modal { max-width:100%; } }
`;

// ─────────────────────────────────────────────
// Password strength helper
// ─────────────────────────────────────────────

function pwStrength(pw) {
  if (!pw) return { score: 0, label: "", color: "transparent", w: "0%" };
  let s = 0;
  if (pw.length >= 8)           s++;
  if (/[A-Z]/.test(pw))         s++;
  if (/[0-9]/.test(pw))         s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const map = [
    { label: "Too short", color: "#f87171", w: "25%"  },
    { label: "Weak",      color: "#fb923c", w: "40%"  },
    { label: "Fair",      color: "#fbbf24", w: "60%"  },
    { label: "Good",      color: "#34d399", w: "80%"  },
    { label: "Strong",    color: "#16a34a", w: "100%" },
  ];
  return { score: s, ...map[Math.min(s, map.length - 1)] };
}

// ─────────────────────────────────────────────
// Eye icon
// ─────────────────────────────────────────────

const EyeIcon = ({ open }) =>
  open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );

// ─────────────────────────────────────────────
// REOPEN MODAL – Re-Open /10 + RDA /10 = /20
// ─────────────────────────────────────────────

function ReopenModal({ studentName, initial, onApply, onClose }) {
  const [vals, setVals] = useState({
    reopen_raw: initial?.reopen_raw ?? "",
    rda:        initial?.rda        ?? "",
  });
  const set   = (k, v) => setVals(p => ({ ...p, [k]: v }));
  const score = calcReopenScore(vals);

  return (
    <div className="tp-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tp-modal">
        <div className="tp-modal-header">
          <div>
            <p className="tp-modal-title">Re-Open Score</p>
            <p className="tp-modal-subtitle">{studentName}</p>
          </div>
          <button className="tp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="tp-modal-body">
          <div className="tp-modal-preview">
            <div className="tp-preview-item">
              <span className="tp-preview-final">{score.toFixed(1)}</span>
              <span className="tp-preview-max">/ 20</span>
            </div>
            <div className="tp-preview-item" style={{marginLeft:"auto",alignItems:"flex-end"}}>
              <span style={{fontSize:"10px",color:"#475569"}}>Formula</span>
              <span style={{fontSize:"11px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>Re-Open/10 + RDA/10</span>
            </div>
          </div>
          <div className="tp-modal-section">
            <div className="tp-section-label">
              Re-Open Assessment
              <span className="tp-pill tp-pill-blue">max 20 marks total</span>
            </div>
            <div className="tp-modal-inputs">
              <div className="tp-modal-field">
                <label>Re-Open <span style={{color:"#94a3b8",fontWeight:400}}>/10</span></label>
                <input type="number" min="0" max="10" step="0.5"
                  placeholder="0" value={vals.reopen_raw}
                  onChange={e => set("reopen_raw", Math.min(10, Math.max(0, parseFloat(e.target.value)||0)))} />
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>+</div>
              <div className="tp-modal-field">
                <label>RDA <span style={{color:"#94a3b8",fontWeight:400}}>/10</span></label>
                <input type="number" min="0" max="10" step="0.5"
                  placeholder="0" value={vals.rda}
                  onChange={e => set("rda", Math.min(10, Math.max(0, parseFloat(e.target.value)||0)))} />
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
              <div className="tp-modal-field">
                <label style={{color:"#3b82f6"}}>Total /20</label>
                <input readOnly value={score.toFixed(1)}
                  style={{background:"#f0f7ff",borderColor:"#93c5fd",color:"#1d4ed8",cursor:"default"}} />
              </div>
            </div>
          </div>
        </div>
        <div className="tp-modal-footer">
          <button className="tp-modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="tp-modal-btn-apply" onClick={() => onApply(score, vals)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply {score.toFixed(1)} / 20
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CA / MGT MODAL
// CA  : hw(4×5=20) + cw(4×10=40) + ct(10+10+10+20=50) = /110 → scaled to /25
// MGT : single raw entry → /15
// Combined → /40
// ─────────────────────────────────────────────

function CAModal({ studentName, initial, onApply, onClose }) {
  const [vals, setVals] = useState({
    hw1: initial?.hw1??"", hw2: initial?.hw2??"", hw3: initial?.hw3??"", hw4: initial?.hw4??"",
    cw1: initial?.cw1??"", cw2: initial?.cw2??"", cw3: initial?.cw3??"", cw4: initial?.cw4??"",
    ct1: initial?.ct1??"", ct2: initial?.ct2??"", ct3: initial?.ct3??"", ct4: initial?.ct4??"",
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

  const totalField = (val, max) => (
    <div className="tp-modal-field">
      <input readOnly value={val.toFixed(1)}
        style={{background:"#f0f7ff",borderColor:"#93c5fd",color:"#1d4ed8",cursor:"default",fontWeight:"700"}} />
      <label style={{color:"#94a3b8",fontSize:"10px",textAlign:"center"}}>/{max}</label>
    </div>
  );

  return (
    <div className="tp-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tp-modal" style={{maxWidth:"580px"}}>
        <div className="tp-modal-header">
          <div>
            <p className="tp-modal-title">CA / MGT Score</p>
            <p className="tp-modal-subtitle">{studentName} · CA (25%) + MGT Test (15%) = 40%</p>
          </div>
          <button className="tp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="tp-modal-body">
          {/* Preview */}
          <div className="tp-modal-preview">
            <div className="tp-preview-item">
              <span style={{fontSize:"12px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>{caOnly.toFixed(1)}/25</span>
              <span className="tp-preview-lbl">CA</span>
            </div>
            <span className="tp-preview-arrow">+</span>
            <div className="tp-preview-item">
              <span style={{fontSize:"12px",color:"#a78bfa",fontFamily:"'DM Mono',monospace"}}>{mgtScore.toFixed(1)}/15</span>
              <span className="tp-preview-lbl">MGT</span>
            </div>
            <span className="tp-preview-arrow">=</span>
            <div className="tp-preview-item">
              <span className="tp-preview-final">{combined.toFixed(1)}</span>
              <span className="tp-preview-max">/ 40</span>
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:"10px"}}>
              {[["HW",hwTotal,20],["CW",cwTotal,40],["CT",ctTotal,50]].map(([l,v,m]) => (
                <div key={l} className="tp-preview-item">
                  <span style={{fontSize:"11px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>{v.toFixed(1)}/{m}</span>
                  <span className="tp-preview-lbl">{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CA Section */}
          <div className="tp-modal-section">
            <div className="tp-section-label">
              <span style={{display:"flex",alignItems:"center",gap:"6px"}}>
                Continuous Assessment (CA)
                <span className="tp-pill tp-pill-blue">scaled to /25</span>
              </span>
              <span>raw total /110</span>
            </div>

            <div style={{marginBottom:"6px"}}>
              <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:"600",marginBottom:"4px",textTransform:"uppercase",letterSpacing:".5px"}}>
                Homework — 4 × 5 = /20
              </div>
              <div className="tp-modal-inputs" style={{alignItems:"flex-start"}}>
                {["hw1","hw2","hw3","hw4"].map(k => (
                  <div className="tp-modal-field" key={k}>
                    <label>HW {k.slice(2)}</label>
                    <input type="number" min="0" max="5" step="0.5" placeholder="0" value={vals[k]}
                      onChange={e => set(k, Math.min(5, Math.max(0, parseFloat(e.target.value)||0)))} />
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
                {totalField(hwTotal, 20)}
              </div>
            </div>

            <div style={{marginBottom:"6px"}}>
              <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:"600",marginBottom:"4px",textTransform:"uppercase",letterSpacing:".5px"}}>
                Classwork — 4 × 10 = /40
              </div>
              <div className="tp-modal-inputs" style={{alignItems:"flex-start"}}>
                {["cw1","cw2","cw3","cw4"].map(k => (
                  <div className="tp-modal-field" key={k}>
                    <label>CW {k.slice(2)}</label>
                    <input type="number" min="0" max="10" step="0.5" placeholder="0" value={vals[k]}
                      onChange={e => set(k, Math.min(10, Math.max(0, parseFloat(e.target.value)||0)))} />
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
                {totalField(cwTotal, 40)}
              </div>
            </div>

            <div>
              <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:"600",marginBottom:"4px",textTransform:"uppercase",letterSpacing:".5px"}}>
                Class Test — 10+10+10+20 = /50
              </div>
              <div className="tp-modal-inputs" style={{alignItems:"flex-start"}}>
                {[["ct1",10],["ct2",10],["ct3",10],["ct4",20]].map(([k,max]) => (
                  <div className="tp-modal-field" key={k}>
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

          <div className="tp-divider" />

          {/* MGT Section */}
          <div className="tp-modal-section">
            <div className="tp-section-label">
              <span style={{display:"flex",alignItems:"center",gap:"6px"}}>
                MGT Test
                <span className="tp-pill tp-pill-purple">direct entry /15</span>
              </span>
            </div>
            <div className="tp-modal-inputs">
              <div className="tp-modal-field" style={{flex:"none",width:"120px"}}>
                <label>MGT Score <span style={{color:"#94a3b8",fontWeight:400}}>/15</span></label>
                <input type="number" min="0" max="15" step="0.5"
                  placeholder="0" value={vals.mgt_raw}
                  style={{fontSize:"22px",padding:"10px"}}
                  onChange={e => set("mgt_raw", Math.min(15, Math.max(0, parseFloat(e.target.value)||0)))}
                  autoFocus
                />
              </div>
              <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end",paddingBottom:"4px",color:"#94a3b8",fontSize:"12px",gap:"2px"}}>
                <span>Entered directly</span>
                <span>No scaling applied</span>
              </div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#f0fdf4",borderRadius:"10px",border:"1px solid #bbf7d0"}}>
            <span style={{fontSize:"13px",color:"#166534",fontWeight:"600"}}>CA + MGT Combined Total</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:"800",color:"#166534",fontSize:"18px"}}>{combined.toFixed(1)} / 40</span>
          </div>
        </div>
        <div className="tp-modal-footer">
          <button className="tp-modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="tp-modal-btn-apply" onClick={() => onApply(combined, vals)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply {combined.toFixed(1)} / 40
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// EXAMS MODAL — raw /100 → /40
// ─────────────────────────────────────────────

function ExamsModal({ studentName, initial, onApply, onClose }) {
  const [examRaw, setExamRaw] = useState(initial?.exam_raw ?? "");
  const raw   = parseFloat(examRaw) || 0;
  const score = Math.round((raw / 100) * 40 * 10) / 10;

  return (
    <div className="tp-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tp-modal" style={{maxWidth:"380px"}}>
        <div className="tp-modal-header">
          <div>
            <p className="tp-modal-title">Examination Score</p>
            <p className="tp-modal-subtitle">{studentName}</p>
          </div>
          <button className="tp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="tp-modal-body">
          <div className="tp-modal-preview">
            <div className="tp-preview-item">
              <span className="tp-preview-val">{raw.toFixed(1)}</span>
              <span className="tp-preview-lbl">Raw /100</span>
            </div>
            <span className="tp-preview-arrow">→</span>
            <div className="tp-preview-item">
              <span className="tp-preview-final">{score.toFixed(1)}</span>
              <span className="tp-preview-max">/ 40</span>
            </div>
            <div className="tp-preview-item" style={{marginLeft:"auto",alignItems:"flex-end"}}>
              <span style={{fontSize:"10px",color:"#475569"}}>Formula</span>
              <span style={{fontSize:"11px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>(raw/100)×40</span>
            </div>
          </div>
          <div className="tp-modal-section">
            <div className="tp-section-label">Exam Score <span>enter raw mark out of 100</span></div>
            <div className="tp-modal-inputs">
              <div className="tp-modal-field" style={{flex:"none",width:"120px"}}>
                <label>Raw Mark</label>
                <input type="number" min="0" max="100" step="0.5" placeholder="0" value={examRaw}
                  style={{fontSize:"24px",padding:"12px 10px"}} autoFocus
                  onChange={e => setExamRaw(Math.min(100, Math.max(0, parseFloat(e.target.value)||0)))} />
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700",fontSize:"20px"}}>/</div>
              <div className="tp-modal-field" style={{flex:"none",width:"60px"}}>
                <label>Max</label>
                <input readOnly value="100"
                  style={{background:"#f8fafc",color:"#94a3b8",cursor:"default",fontSize:"24px",padding:"12px 10px"}} />
              </div>
            </div>
          </div>
        </div>
        <div className="tp-modal-footer">
          <button className="tp-modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="tp-modal-btn-apply" onClick={() => onApply(score, { exam_raw: raw })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply {score.toFixed(1)} / 40
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Change Password Modal
// ─────────────────────────────────────────────

const ChangePasswordModal = ({ onClose }) => {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showCon, setShowCon] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);

  const strength = pwStrength(next);
  const mismatch = confirm && next !== confirm;

  const handleSubmit = async () => {
    setError("");
    if (!current)         return setError("Enter your current password.");
    if (next.length < 8)  return setError("New password must be at least 8 characters.");
    if (next !== confirm)  return setError("New passwords do not match.");
    setSaving(true);
    try {
      await API.post("/auth/change-password/", { old_password: current, new_password: next });
      setSuccess(true);
      setTimeout(onClose, 2200);
    } catch (e) {
      const d = e.response?.data;
      setError(d?.old_password?.[0] || d?.new_password?.[0] || d?.detail || "Failed to change password.");
    } finally { setSaving(false); }
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7" style={{ animation: "tp-slide-up .2s ease" }}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-lg font-black text-slate-800">Change Password</h2>
            <p className="text-sm text-slate-400 mt-0.5">Keep your account secure with a strong password.</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors text-2xl leading-none mt-0.5">×</button>
        </div>
        {success ? (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-4 text-sm font-medium">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            Password changed successfully!
          </div>
        ) : (
          <>
            {[
              { label:"Current Password",    value:current, set:setCurrent, show:showCur, setShow:setShowCur },
              { label:"New Password",         value:next,    set:setNext,    show:showNew, setShow:setShowNew },
              { label:"Confirm New Password", value:confirm, set:setConfirm, show:showCon, setShow:setShowCon },
            ].map(({ label, value, set, show, setShow }, i) => (
              <div key={i} className="mb-4">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">{label}</label>
                <div className="relative">
                  <input type={show ? "text" : "password"} value={value}
                    onChange={e => { set(e.target.value); setError(""); }}
                    placeholder={i === 0 ? "Enter current password" : i === 1 ? "Min. 8 characters" : "Repeat new password"}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-slate-50"
                    style={i === 2 ? { borderColor: mismatch ? "#f87171" : confirm && !mismatch ? "#34d399" : "#e2e8f0" } : {}}
                  />
                  <button type="button" onClick={() => setShow(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <EyeIcon open={show} />
                  </button>
                </div>
                {i === 1 && next && (
                  <>
                    <div className="h-1 rounded-full mt-2 transition-all duration-300"
                      style={{ background: strength.color, width: strength.w, maxWidth: "100%" }} />
                    <p className="text-xs mt-1" style={{ color: strength.color }}>{strength.label}</p>
                  </>
                )}
                {i === 2 && mismatch && <p className="text-xs mt-1 text-red-400">Passwords don't match</p>}
              </div>
            ))}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
            )}
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={onClose}
                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleSubmit} disabled={saving || !!mismatch}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {saving ? (
                  <><div style={{width:"14px",height:"14px",border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"tp-spin .6s linear infinite"}}/>Saving…</>
                ) : "Update Password"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Confirm modal
// ─────────────────────────────────────────────

const ConfirmModal = ({ title, body, confirmLabel, onConfirm, onCancel }) => {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ animation: "tp-slide-up .2s ease" }}>
        <h2 className="text-base font-black text-slate-800 mb-2">{title}</h2>
        <p className="text-sm text-slate-500 mb-6">{body}</p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel}
            className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Micro-components
// ─────────────────────────────────────────────

const Badge = ({ grade }) => {
  const info = GRADE_REMARK[grade];
  if (!info) return <span className="text-slate-300 text-xs">—</span>;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${info.bg}`}>{grade}</span>;
};

const RemarkBadge = ({ grade }) => {
  const info = GRADE_REMARK[grade];
  if (!info) return <span className="text-slate-300 text-xs">—</span>;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs ${info.bg}`}>{info.label}</span>;
};

const KpiCard = ({ label, value, color = "text-slate-800", sub }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
    <p className={`text-2xl font-black ${color}`}>{value}</p>
    {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
  </div>
);

// Inline Alert – kept for non-results tabs; Results tab uses toast instead
const Alert = ({ message, type, onDismiss }) => {
  if (!message) return null;
  const s = type === "error"
    ? "bg-red-50 border-red-200 text-red-700"
    : "bg-emerald-50 border-emerald-200 text-emerald-700";
  return (
    <div role="alert" className={`mb-5 flex items-center justify-between px-4 py-3 rounded-xl border text-sm ${s}`}>
      <span>{type === "error" ? "⚠ " : "✓ "}{message}</span>
      <button onClick={onDismiss} className="ml-4 text-lg leading-none opacity-50 hover:opacity-100">×</button>
    </div>
  );
};

const EmptyState = ({ icon, title, sub }) => (
  <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-100 shadow-sm">
    <div className="text-5xl mb-3">{icon}</div>
    <p className="font-medium text-slate-500">{title}</p>
    {sub && <p className="text-xs mt-1">{sub}</p>}
  </div>
);

const SectionHeader = ({ title, badge }) => (
  <div className="flex items-center justify-between mb-4">
    <h3 className="font-bold text-slate-700">{title}</h3>
    {badge && <span className="text-xs text-slate-500 bg-white border border-slate-100 px-2.5 py-1 rounded-full shadow-sm">{badge}</span>}
  </div>
);

const Th = ({ children, center }) => (
  <th className={`px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide ${center ? "text-center" : "text-left"}`}>
    {children}
  </th>
);

// Shared icons for score buttons
const EditIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const AddIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
  </svg>
);

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

const TeacherPortal = () => {
  const user = getUser();
  const { toasts, add: toast } = useToast();

  // Inject styles once
  useEffect(() => {
    if (document.getElementById("tp-portal-styles")) return;
    const el = document.createElement("style");
    el.id = "tp-portal-styles";
    el.textContent = PORTAL_STYLES;
    document.head.appendChild(el);
  }, []);

  const [tab, setTab]                         = useState("Classes");
  const [selectedTerm, setSelectedTerm]       = useState("term1");
  const [selectedYear, setSelectedYear]       = useState(YEARS[0]);
  const [showPwModal, setShowPwModal]         = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const [classes, setClasses]                       = useState([]);
  const [selectedClass, setSelectedClass]           = useState(user.class_id ? String(user.class_id) : "");
  const [selectedClassName, setSelectedClassName]   = useState(user.class || "");
  const [selectedClassLevel, setSelectedClassLevel] = useState("basic_7_9");
  const [students, setStudents]                     = useState([]);
  const [loadingStudents, setLoadingStudents]       = useState(false);

  const [attendance, setAttendance] = useState({});
  const [attDate, setAttDate]       = useState(todayStr);
  const [savingAtt, setSavingAtt]   = useState(false);

  const [subjects, setSubjects]               = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [scores, setScores]                   = useState({});
  const [breakdowns, setBreakdowns]           = useState({});
  const [existingIds, setExistingIds]         = useState({});
  const [loadingScores, setLoadingScores]     = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [deleting, setDeleting]               = useState(null);
  const [scoreModal, setScoreModal]           = useState(null);

  // loadedRef prevents redundant fetches when filters haven't changed
  const loadedRef = useRef({ class: "", subject: "", term: "", year: "" });

  const [selectedStudent, setSelectedStudent]   = useState("");
  const [report, setReport]                     = useState(null);
  const [loadingReport, setLoadingReport]       = useState(false);
  const [expandedStudent, setExpandedStudent]   = useState(null);
  const [summary, setSummary]                   = useState([]);
  const [loadingSummary, setLoadingSummary]     = useState(false);

  const [remarks, setRemarks]             = useState({ conduct: "", interest: "", teacher_remark: "" });
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [remarksSaved, setRemarksSaved]   = useState(false);
  const [downloading, setDownloading]     = useState(false);

  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const latestStudentsRef = useRef([]);
  latestStudentsRef.current = students;

  // ── Derived ──────────────────────────────────────────────────────────────

  const filledCount = useMemo(
    () => Object.values(scores).filter(v => v?.reopen !== "" || v?.ca !== "" || v?.exams !== "").length,
    [scores]
  );

  const savedCount = useMemo(() => Object.keys(existingIds).length, [existingIds]);

  const classAvg = useMemo(() => {
    const filled = Object.values(scores).filter(v => v?.reopen !== "" || v?.ca !== "" || v?.exams !== "");
    if (!filled.length) return null;
    const sum = filled.reduce((acc, v) => acc + computeTotal(v.reopen, v.ca, v.exams), 0);
    return (sum / filled.length).toFixed(1);
  }, [scores]);

  const below50Count = useMemo(
    () => Object.values(scores).filter(v => {
      if (!v || (v.reopen === "" && v.ca === "" && v.exams === "")) return false;
      return computeTotal(v.reopen, v.ca, v.exams) < 50;
    }).length,
    [scores]
  );

  const attStats = useMemo(() => ({
    present: Object.values(attendance).filter(v => v === "present").length,
    absent:  Object.values(attendance).filter(v => v === "absent").length,
    late:    Object.values(attendance).filter(v => v === "late").length,
  }), [attendance]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchClasses  = useCallback(async () => {
    try { const r = await API.get("/classes/");  setClasses(r.data.results ?? r.data); }
    catch { setError("Failed to load classes."); }
  }, []);

  const fetchSubjects = useCallback(async () => {
    try { const r = await API.get("/subjects/"); setSubjects(r.data.results ?? r.data); }
    catch {}
  }, []);

  const fetchStudents = useCallback(async (classId) => {
    if (!classId) return;
    setLoadingStudents(true);
    try {
      const r = await API.get(`/students/?school_class=${classId}`);
      setStudents(r.data.results ?? r.data);
    }
    catch { setError("Failed to load students."); }
    finally { setLoadingStudents(false); }
  }, []);

  const loadAttendance = useCallback(async (classId, date, currentStudents) => {
    if (!classId || !currentStudents.length) return;
    try {
      const r       = await API.get(`/attendance/?school_class=${classId}&date=${date}`);
      const records = r.data.results ?? r.data;
      const map     = Object.fromEntries(records.map(rec => [String(rec.student), rec.status]));
      setAttendance(Object.fromEntries(currentStudents.map(s => [s.id, map[String(s.id)] ?? "present"])));
    } catch {}
  }, []);

  const loadExistingScores = useCallback(async (classId, term, subjectId, year) => {
    if (!classId || !term || !subjectId) return;
    setLoadingScores(true);
    try {
      const r       = await API.get(`/results/?school_class=${classId}&term=${term}&subject=${subjectId}&year=${year}`);
      const records = r.data.results ?? r.data;

      const serverMap = Object.fromEntries(
        records.map(rec => [String(rec.student), { reopen: rec.reopen, ca: rec.ca, exams: rec.exams }])
      );
      const idMap = Object.fromEntries(records.map(rec => [rec.student, rec.id]));

      setScores(Object.fromEntries(
        latestStudentsRef.current.map(s => [
          s.id, serverMap[String(s.id)] ?? { reopen: "", ca: "", exams: "" },
        ])
      ));
      setExistingIds(idMap);
      loadedRef.current = { class: classId, subject: subjectId, term, year };
      if (records.length > 0)
        toast(`Loaded ${records.length} saved result${records.length !== 1 ? "s" : ""}.`, "info");
    } catch { toast("Failed to load existing scores.", "error"); }
    finally { setLoadingScores(false); }
  }, [toast]);

  const fetchSummary = useCallback(async (classId, term, year) => {
    if (!classId || !term) return;
    setLoadingSummary(true);
    try {
      const r = await API.get(`/results/summary/?school_class=${classId}&term=${term}&year=${year}`);
      setSummary(r.data);
    }
    catch { setError("Failed to load summary."); }
    finally { setLoadingSummary(false); }
  }, []);

  const fetchStudentReport = useCallback(async (studentId, term) => {
    setLoadingReport(true); setReport(null); setRemarksSaved(false);
    try {
      const r = await API.get(`/report/student/${studentId}/?term=${term}`);
      setReport(r.data);
      setRemarks({ conduct: r.data.conduct ?? "", interest: r.data.interest ?? "", teacher_remark: r.data.teacher_remark ?? "" });
    } catch { setError("No report found for this student and term."); }
    finally { setLoadingReport(false); }
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => { fetchClasses(); fetchSubjects(); }, [fetchClasses, fetchSubjects]);

  useEffect(() => {
    if (selectedClass) fetchStudents(selectedClass);
    else setStudents([]);
  }, [selectedClass, fetchStudents]);

  useEffect(() => {
    if (tab === "Attendance" && selectedClass && students.length > 0)
      loadAttendance(selectedClass, attDate, students);
  }, [tab, attDate, selectedClass, students, loadAttendance]);

  // Guard against redundant fetches via loadedRef
  useEffect(() => {
    if (tab !== "Results" || !selectedClass || !selectedSubject || !selectedTerm || !students.length) {
      if (!selectedSubject) { setScores({}); setExistingIds({}); setBreakdowns({}); }
      return;
    }
    const ref = loadedRef.current;
    if (
      ref.class   === selectedClass   &&
      ref.subject === selectedSubject &&
      ref.term    === selectedTerm    &&
      ref.year    === String(selectedYear)
    ) return;
    setScores({}); setExistingIds({}); setBreakdowns({});
    loadExistingScores(selectedClass, selectedTerm, selectedSubject, selectedYear);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedClass, selectedSubject, selectedTerm, selectedYear, students]);

  useEffect(() => {
    if (tab === "Reports" && selectedClass && selectedTerm)
      fetchSummary(selectedClass, selectedTerm, selectedYear);
  }, [tab, selectedClass, selectedTerm, selectedYear, fetchSummary]);

  useEffect(() => { setError(""); setSuccess(""); }, [tab]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleStatus = useCallback((id) => {
    setAttendance(p => ({ ...p, [id]: STATUS_CYCLE[p[id]] ?? "present" }));
  }, []);

  const saveAttendance = async () => {
    if (attDate > todayStr) { setError("Cannot record attendance for a future date."); return; }
    setSavingAtt(true); setError(""); setSuccess("");
    try {
      const existingRes = await API.get(`/attendance/?school_class=${selectedClass}&date=${attDate}`);
      const existing    = existingRes.data.results ?? existingRes.data;
      const existingMap = Object.fromEntries(existing.map(rec => [String(rec.student), rec.id]));
      const results = await Promise.allSettled(
        students.map(s => {
          const existingId = existingMap[String(s.id)];
          const status     = attendance[s.id] ?? "present";
          return existingId
            ? API.patch(`/attendance/${existingId}/`, { status })
            : API.post("/attendance/", { student: s.id, school_class: selectedClass, date: attDate, status });
        })
      );
      const failedCount = results.filter(r => r.status === "rejected").length;
      if (failedCount > 0) setError(`${failedCount} record(s) could not be saved. Please try again.`);
      else setSuccess("Attendance saved successfully.");
    } catch { setError("Failed to save attendance."); }
    finally { setSavingAtt(false); }
  };

  // ── Score modal apply handlers ────────────────────────────────────────────

  const applyReopen = (score, breakdown) => {
    const { studentId } = scoreModal;
    setScores(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), reopen: score } }));
    setBreakdowns(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), reopen: breakdown } }));
    setScoreModal(null);
  };

  const applyCA = (score, breakdown) => {
    const { studentId } = scoreModal;
    setScores(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), ca: score } }));
    setBreakdowns(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), ca: breakdown } }));
    setScoreModal(null);
  };

  const applyExams = (score, breakdown) => {
    const { studentId } = scoreModal;
    setScores(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), exams: score } }));
    setBreakdowns(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), exams: breakdown } }));
    setScoreModal(null);
  };

  const handleDeleteResult = async (studentId) => {
    const id = existingIds[studentId];
    if (!id) return;
    setDeleting(studentId);
    try {
      await API.delete(`/results/${id}/`);
      setScores(prev => ({ ...prev, [studentId]: { reopen: "", ca: "", exams: "" } }));
      setExistingIds(prev => { const n = { ...prev }; delete n[studentId]; return n; });
      setBreakdowns(prev => { const n = { ...prev }; delete n[studentId]; return n; });
      loadedRef.current = { class: "", subject: "", term: "", year: "" };
      toast("Result deleted.", "info");
    } catch { toast("Failed to delete result.", "error"); }
    finally { setDeleting(null); }
  };

  const submitResults = async () => {
    if (!selectedClass || !selectedTerm || !selectedSubject) {
      setError("Please select a class, term, and subject."); return;
    }
    const records = Object.entries(scores)
      .filter(([, v]) => v.reopen !== "" || v.ca !== "" || v.exams !== "")
      .map(([sid, v]) => ({
        student: sid, subject: selectedSubject, school_class: selectedClass,
        term: selectedTerm, year: selectedYear,
        reopen: parseFloat(v.reopen) || 0,
        ca:     parseFloat(v.ca)     || 0,
        exams:  parseFloat(v.exams)  || 0,
      }));
    if (!records.length) { setError("No scores entered."); return; }
    setSaving(true); setError("");
    try {
      const r = await API.post("/results/bulk/", records);
      if (r.data.errors?.length > 0) {
        toast(`${r.data.saved} saved, ${r.data.errors.length} failed.`, "info");
      } else {
        toast(`Saved ${r.data.saved} result${r.data.saved !== 1 ? "s" : ""} successfully.`, "success");
        loadedRef.current = { class: "", subject: "", term: "", year: "" };
        loadExistingScores(selectedClass, selectedTerm, selectedSubject, selectedYear);
      }
    }
    catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error;
      toast(detail || "Error saving results. Please try again.", "error");
    }
    finally { setSaving(false); }
  };

  const saveRemarks = async () => {
    setSavingRemarks(true); setRemarksSaved(false); setError("");
    try {
      await API.patch(`/report/student/${selectedStudent}/`, { term: selectedTerm, ...remarks });
      setRemarksSaved(true);
      const r = await API.get(`/report/student/${selectedStudent}/?term=${selectedTerm}`);
      setReport(r.data);
    } catch { setError("Failed to save remarks."); }
    finally { setSavingRemarks(false); }
  };

  const downloadPDF = async () => {
    setDownloading(true); setError("");
    let url;
    try {
      const r = await API.get(`/report/student/${selectedStudent}/pdf/?term=${selectedTerm}`, { responseType: "blob" });
      url = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement("a");
      link.href  = url;
      link.setAttribute("download", `report_${selectedStudent}_${selectedTerm}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch { setError("Failed to download PDF."); }
    finally { if (url) window.URL.revokeObjectURL(url); setDownloading(false); }
  };

  const handleClassChange = (classId) => {
    setSelectedClass(classId);
    const found = classes.find(c => String(c.id) === String(classId));
    setSelectedClassName(found?.name ?? "");
    setSelectedClassLevel(found?.level ?? "basic_7_9");
    setSelectedSubject("");
    setStudents([]); setScores({}); setBreakdowns({}); setExistingIds({});
    setAttendance({}); setSummary([]);
    setReport(null); setSelectedStudent(""); setExpandedStudent(null);
    setRemarks({ conduct: "", interest: "", teacher_remark: "" });
    setRemarksSaved(false); setError(""); setSuccess("");
    loadedRef.current = { class: "", subject: "", term: "", year: "" };
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isB16       = selectedClassLevel === "basic_1_6" || selectedClassLevel === "nursery_kg";
  const gradeScale  = isB16 ? GRADE_SCALE_B16 : GRADE_SCALE_B79;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Score entry modals ── */}
      {scoreModal?.type === "reopen" && (
        <ReopenModal studentName={scoreModal.studentName} initial={breakdowns[scoreModal.studentId]?.reopen}
          onApply={applyReopen} onClose={() => setScoreModal(null)} />
      )}
      {scoreModal?.type === "ca" && (
        <CAModal studentName={scoreModal.studentName} initial={breakdowns[scoreModal.studentId]?.ca}
          onApply={applyCA} onClose={() => setScoreModal(null)} />
      )}
      {scoreModal?.type === "exams" && (
        <ExamsModal studentName={scoreModal.studentName} initial={breakdowns[scoreModal.studentId]?.exams}
          onApply={applyExams} onClose={() => setScoreModal(null)} />
      )}

      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}

      {showSubmitConfirm && (
        <ConfirmModal
          title="Save Results?"
          body={`You are about to save ${filledCount} result${filledCount !== 1 ? "s" : ""} for ${selectedClassName}. This will overwrite any existing scores for the selected subject and term.`}
          confirmLabel={`Save ${filledCount} Result${filledCount !== 1 ? "s" : ""}`}
          onConfirm={() => { setShowSubmitConfirm(false); submitResults(); }}
          onCancel={() => setShowSubmitConfirm(false)}
        />
      )}

      {/* ── Toast stack ── */}
      <div className="tp-toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`tp-toast-item tp-toast-${t.type}`}>
            <span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}</span>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {user.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">{user.username}</p>
              <p className="text-slate-400 text-xs">{user.teacher_id}{user.subject ? ` · ${user.subject}` : ""}</p>
            </div>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            {TABS.map(({ key, icon, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  tab === key ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}>
                <span className="text-base">{icon}</span>
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowPwModal(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg">
              🔑 <span className="hidden md:inline">Password</span>
            </button>
            <button onClick={logout}
              className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors border border-slate-200 hover:border-red-200 px-3 py-1.5 rounded-lg">
              Sign out
            </button>
          </div>
        </div>

        {/* Mobile tab bar */}
        <nav className="sm:hidden flex border-t border-slate-100 overflow-x-auto">
          {TABS.map(({ key, icon, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium border-b-2 transition-all min-w-[60px] ${
                tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400"
              }`}>
              <span className="text-lg">{icon}</span>{label}
            </button>
          ))}
        </nav>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Global filters ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 mb-6">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Year</label>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                className="border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Term</label>
              <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}
                className="border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Class</label>
              <select value={selectedClass} onChange={e => handleClassChange(e.target.value)}
                className="border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm min-w-[150px] focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">Select Class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {tab === "Results" && (
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Subject</label>
                <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                  className="border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {tab === "Attendance" && (
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Date</label>
                <input type="date" value={attDate} max={todayStr} onChange={e => setAttDate(e.target.value)}
                  className="border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            )}
            <div className="sm:hidden ml-auto">
              <button onClick={() => setShowPwModal(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-200 px-3 py-2 rounded-xl transition-colors">
                🔑 Password
              </button>
            </div>
          </div>
        </div>

        {/* ── Alerts (non-Results tabs) ── */}
        {tab !== "Results" && (
          <>
            <Alert message={error}   type="error"   onDismiss={() => setError("")}   />
            <Alert message={success} type="success" onDismiss={() => setSuccess("")} />
          </>
        )}

        {!selectedClass && (
          <EmptyState icon="🏫" title="Select a class to get started" sub="Use the dropdown above to choose your class" />
        )}

        {/* ══════════════════════════════════════
            TAB: Classes
        ══════════════════════════════════════ */}
        {tab === "Classes" && selectedClass && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <KpiCard label="Students" value={students.length}          color="text-blue-600" />
              <KpiCard label="Class"    value={selectedClassName || "—"} color="text-slate-800" />
              <KpiCard label="Term"     value={TERMS.find(t => t.value === selectedTerm)?.label} color="text-slate-800" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center">
                <p className="font-bold text-slate-700 text-sm">{selectedClassName} — Student List</p>
                <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-semibold">{students.length} enrolled</span>
              </div>
              {loadingStudents ? (
                <div className="p-10 text-center text-slate-400 text-sm">Loading students…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>#</Th><Th>Name</Th><Th>Admission No.</Th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {students.map((s, i) => (
                      <tr key={s.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{s.student_name}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.admission_number}</td>
                      </tr>
                    ))}
                    {!students.length && (
                      <tr><td colSpan={3} className="px-5 py-12 text-center text-slate-400">No students found for this class.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: Attendance
        ══════════════════════════════════════ */}
        {tab === "Attendance" && selectedClass && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <KpiCard label="Present" value={attStats.present} color="text-emerald-600" sub={`of ${students.length}`} />
              <KpiCard label="Absent"  value={attStats.absent}  color="text-red-600"     sub={`of ${students.length}`} />
              <KpiCard label="Late"    value={attStats.late}    color="text-amber-600"   sub={`of ${students.length}`} />
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center flex-wrap gap-2">
                <p className="font-bold text-slate-700 text-sm">{selectedClassName} — {attDate}</p>
                <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">Tap to cycle: Present → Absent → Late</span>
              </div>
              {loadingStudents ? (
                <div className="p-10 text-center text-slate-400 text-sm">Loading students…</div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>#</Th><Th>Name</Th><Th center>Status</Th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {students.map((s, i) => {
                        const status = attendance[s.id] ?? "present";
                        const cfg    = STATUS_CONFIG[status];
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{s.student_name}</td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => toggleStatus(s.id)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all active:scale-95 ${cfg.pill}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!students.length && (
                        <tr><td colSpan={3} className="px-5 py-12 text-center text-slate-400">No students found.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end">
                    <button onClick={saveAttendance} disabled={savingAtt || !students.length}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm">
                      {savingAtt ? "Saving…" : "Save Attendance"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: Results
        ══════════════════════════════════════ */}
        {tab === "Results" && selectedClass && (
          <>
            {!selectedSubject && (
              <EmptyState icon="📊" title="Select a subject above to enter scores"
                sub="Click any score button to open the breakdown entry modal" />
            )}

            {selectedSubject && (
              <>
                {/* KPI bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                  <KpiCard label="Filled"    value={`${filledCount} / ${students.length}`} color="text-blue-600" />
                  <KpiCard label="Saved"     value={savedCount}     color="text-emerald-600" />
                  <KpiCard label="Class Avg" value={classAvg ?? "—"} color="text-slate-700" />
                  <KpiCard label="Below 50%" value={below50Count}   color="text-red-600" />
                </div>

                {/* Status bar */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-6 text-sm">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="font-bold text-blue-600">{filledCount}</span> filled
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="font-bold text-emerald-600">{savedCount}</span> saved
                    </span>
                    {loadingScores && (
                      <span className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <span style={{width:"11px",height:"11px",border:"2px solid #e2e8f0",borderTopColor:"#3b82f6",borderRadius:"50%",display:"inline-block",animation:"tp-spin .6s linear infinite"}}/>
                        Loading…
                      </span>
                    )}
                    <span className="text-xs text-slate-400">({isB16 ? "A–E5 scale" : "1–9 scale"})</span>
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                    Click any score cell to enter breakdown details
                  </p>
                </div>

                {/* Table */}
                {loadingStudents ? (
                  /* Shimmer skeleton */
                  <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <tbody>
                        {[...Array(6)].map((_,i) => (
                          <tr key={i} style={{borderBottom:"1px solid #f1f5f9"}}>
                            {[50,150,90,90,90,60,55,90,60].map((w,j) => (
                              <td key={j} style={{padding:"14px 16px"}}>
                                <div className="tp-skeleton" style={{width:`${w}px`}}/>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : students.length === 0 ? (
                  <EmptyState icon="👤" title="No students found" sub="No students assigned to this class." />
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" style={{fontFamily:"'DM Sans',sans-serif"}}>
                        <thead>
                          <tr className="bg-slate-800">
                            <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-left">#</th>
                            <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-left">Student</th>
                            <th className="px-4 py-3 text-[11px] font-semibold text-blue-400 uppercase tracking-wide text-center">
                              Re-Open<br /><span className="text-slate-500 normal-case font-normal">/20 (click)</span>
                            </th>
                            <th className="px-4 py-3 text-[11px] font-semibold text-blue-400 uppercase tracking-wide text-center">
                              CA / MGT<br /><span className="text-slate-500 normal-case font-normal">/40 (click)</span>
                            </th>
                            <th className="px-4 py-3 text-[11px] font-semibold text-blue-400 uppercase tracking-wide text-center">
                              Exams<br /><span className="text-slate-500 normal-case font-normal">/40 (click)</span>
                            </th>
                            <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-center">
                              Total<br /><span className="font-normal">/100</span>
                            </th>
                            <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-center">Grade</th>
                            <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-center">Remark</th>
                            <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {students.map((student, i) => {
                            const s       = scores[student.id] ?? { reopen: "", ca: "", exams: "" };
                            const dirty   = s.reopen !== "" || s.ca !== "" || s.exams !== "";
                            const total   = dirty ? computeTotal(s.reopen, s.ca, s.exams) : null;
                            const grade   = total !== null ? gradeFromTotal(total, selectedClassLevel) : null;
                            const info    = grade ? GRADE_REMARK[grade] : null;
                            const isSaved = !!existingIds[student.id];

                            const rFilled = s.reopen !== "" && s.reopen !== 0;
                            const cFilled = s.ca     !== "" && s.ca     !== 0;
                            const eFilled = s.exams  !== "" && s.exams  !== 0;

                            const reopenBreak = getReopenBreakdown(breakdowns, student.id);
                            const caBreak     = getCABreakdown(breakdowns, student.id);
                            const examsBreak  = getExamsBreakdown(breakdowns, student.id);

                            return (
                              <tr key={student.id} className="hover:bg-blue-50/20 transition-colors">
                                <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>

                                {/* Student name + saved indicator */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div style={{
                                      width:"28px", height:"28px", borderRadius:"50%", flexShrink:0,
                                      background:`hsl(${(student.id * 47) % 360},55%,88%)`,
                                      display:"flex", alignItems:"center", justifyContent:"center",
                                      fontSize:"11px", fontWeight:"700",
                                      color:`hsl(${(student.id * 47) % 360},55%,35%)`,
                                    }}>
                                      {student.student_name?.charAt(0)}
                                    </div>
                                    <div>
                                      <div className="font-medium text-slate-800 leading-tight">{student.student_name}</div>
                                      {isSaved && (
                                        <div style={{fontSize:"10.5px",color:"#10b981",display:"flex",alignItems:"center"}}>
                                          <span className="tp-saved-dot"/>saved
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* RE-OPEN */}
                                <td className="px-3 py-2.5 text-center">
                                  <div className="tp-score-cell">
                                    <button
                                      className={`tp-score-btn ${rFilled ? (parseFloat(s.reopen)===20?"tp-score-btn-max":"tp-score-btn-filled") : "tp-score-btn-empty"}`}
                                      onClick={() => setScoreModal({ type:"reopen", studentId:student.id, studentName:student.student_name })}>
                                      {rFilled ? <><EditIcon />{parseFloat(s.reopen).toFixed(1)}</> : <><AddIcon />Enter</>}
                                    </button>
                                    {reopenBreak && <span className="tp-score-breakdown">{reopenBreak}</span>}
                                  </div>
                                </td>

                                {/* CA / MGT */}
                                <td className="px-3 py-2.5 text-center">
                                  <div className="tp-score-cell">
                                    <button
                                      className={`tp-score-btn ${cFilled ? (parseFloat(s.ca)===40?"tp-score-btn-max":"tp-score-btn-filled") : "tp-score-btn-empty"}`}
                                      onClick={() => setScoreModal({ type:"ca", studentId:student.id, studentName:student.student_name })}>
                                      {cFilled ? <><EditIcon />{parseFloat(s.ca).toFixed(1)}</> : <><AddIcon />Enter</>}
                                    </button>
                                    {caBreak && <span className="tp-score-breakdown">{caBreak}</span>}
                                  </div>
                                </td>

                                {/* EXAMS */}
                                <td className="px-3 py-2.5 text-center">
                                  <div className="tp-score-cell">
                                    <button
                                      className={`tp-score-btn ${eFilled ? (parseFloat(s.exams)===40?"tp-score-btn-max":"tp-score-btn-filled") : "tp-score-btn-empty"}`}
                                      onClick={() => setScoreModal({ type:"exams", studentId:student.id, studentName:student.student_name })}>
                                      {eFilled ? <><EditIcon />{parseFloat(s.exams).toFixed(1)}</> : <><AddIcon />Enter</>}
                                    </button>
                                    {examsBreak && <span className="tp-score-breakdown">{examsBreak}</span>}
                                  </div>
                                </td>

                                {/* Total */}
                                <td className="px-4 py-3 text-center">
                                  {total !== null ? (
                                    <span className={`font-black tabular-nums font-mono ${total >= 50 ? "text-blue-700" : "text-red-600"}`}>
                                      {total}
                                    </span>
                                  ) : <span className="text-slate-300">—</span>}
                                </td>

                                {/* Grade */}
                                <td className="px-4 py-3 text-center">
                                  {grade ? (
                                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold"
                                      style={{background:`${info.color}18`, color:info.color}}>
                                      {grade}
                                    </span>
                                  ) : <span className="text-slate-300 text-xs">—</span>}
                                </td>

                                {/* Remark */}
                                <td className="px-4 py-3 text-center" style={{fontSize:"12px", color: info ? info.color : "#cbd5e1"}}>
                                  {info ? info.label : "—"}
                                </td>

                                {/* Action */}
                                <td className="px-4 py-3 text-center">
                                  {isSaved && (
                                    <button
                                      onClick={() => handleDeleteResult(student.id)}
                                      disabled={deleting === student.id}
                                      className="px-3 py-1 rounded-md text-xs font-medium border border-red-200 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all disabled:opacity-40">
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

                    {/* Grade scale legend (pill style from TeacherPortalResults) */}
                    <div className="tp-legend">
                      <span style={{fontSize:"10.5px",fontWeight:"700",color:"#475569",marginRight:"3px",alignSelf:"center"}}>SCALE:</span>
                      {gradeScale.map(item => {
                        const c = GRADE_COLORS[item.grade] || "#64748b";
                        return (
                          <div key={item.grade + item.range} className="tp-legend-item">
                            <span className="tp-grade-pill" style={{background:`${c}18`, color:c}}>{item.grade}</span>
                            <span className="tp-legend-range">{item.range}</span>
                            <span style={{fontSize:"10.5px",color:"#94a3b8"}}>{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Save bar */}
                {students.length > 0 && (
                  <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                    <p className="text-sm text-slate-400">
                      {filledCount === 0
                        ? "Click any score cell to enter breakdown details"
                        : `${filledCount} of ${students.length} students have scores entered`}
                    </p>
                    {filledCount > 0 && (
                      <button onClick={() => setShowSubmitConfirm(true)} disabled={saving}
                        className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all shadow-sm flex items-center gap-2 hover:-translate-y-px hover:shadow-md">
                        {saving ? (
                          <><div style={{width:"13px",height:"13px",border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"tp-spin .6s linear infinite"}}/>Saving…</>
                        ) : (
                          <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                          </svg>Save {filledCount} Result{filledCount !== 1 ? "s" : ""}</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══════════════════════════════════════
            TAB: Reports
        ══════════════════════════════════════ */}
        {tab === "Reports" && selectedClass && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Student — Full Report</label>
                <select value={selectedStudent}
                  onChange={e => {
                    const id = e.target.value;
                    setSelectedStudent(id); setReport(null); setRemarksSaved(false);
                    if (id) fetchStudentReport(id, selectedTerm);
                  }}
                  className="w-full border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— Select a student —</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.student_name}</option>)}
                </select>
              </div>
              {report && (
                <button onClick={downloadPDF} disabled={downloading}
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm">
                  {downloading ? "Generating…" : "⬇ Download PDF"}
                </button>
              )}
            </div>

            {loadingReport && <div className="text-center text-slate-400 text-sm py-8">Loading report…</div>}

            {!loadingReport && selectedStudent && !report && !error && (
              <EmptyState icon="📋" title="No report found for this student and term"
                sub="Make sure results have been entered for this term." />
            )}

            {report && !loadingReport && (() => {
              const level         = report.level || "basic_7_9";
              const reportScale   = level === "basic_7_9" ? GRADE_SCALE_B79 : GRADE_SCALE_B16;
              const subjectOptions = report.subjects?.map(s => s.subject) ?? [];
              return (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-br from-blue-700 to-blue-900 text-white px-6 py-5 flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <p className="font-black text-lg leading-tight">{report.school_name || "LEADING STARS ACADEMY"}</p>
                      <p className="text-blue-300 text-xs">{level === "nursery_kg" ? "GLOBAL LEADERS" : "WHERE LEADERS ARE BORN"}</p>
                      <div className="mt-3 space-y-0.5">
                        <p className="font-bold text-base">{report.student}</p>
                        <p className="text-blue-200 text-xs">Admission: {report.admission_number ?? "—"}</p>
                        <p className="text-blue-200 text-xs">Class: {report.class ?? "—"} · {TERMS.find(t => t.value === report.term)?.label ?? report.term}</p>
                      </div>
                    </div>
                    {report.photo ? (
                      <img src={report.photo} alt="Student photo"
                        className="w-20 h-20 rounded-xl border-2 border-white/30 object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-20 h-20 rounded-xl border-2 border-white/20 bg-white/10 flex items-center justify-center text-3xl font-black flex-shrink-0">
                        {report.student?.[0] ?? "?"}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-100">
                    {[
                      { label: "Total Marks",  value: report.total_score   ?? "—" },
                      { label: "Average",       value: report.average_score ?? "—" },
                      { label: "Position",      value: report.show_position ? (report.position_formatted ? `${report.position_formatted} / ${report.out_of}` : "—") : "N/A" },
                      { label: "Overall Grade", value: report.overall_grade ?? "—" },
                    ].map(stat => (
                      <div key={stat.label} className="p-4 text-center border-r border-slate-100 last:border-r-0">
                        <p className="text-2xl font-black text-blue-700">{stat.value}</p>
                        <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-5">
                    <SectionHeader title="Subject Results" />
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-blue-50">
                            <Th>Subject</Th>
                            <Th center>Re-Open</Th><Th center>CA/MGT</Th><Th center>Exams</Th>
                            <Th center>Total</Th>
                            {report.show_position && <Th center>Pos.</Th>}
                            <Th center>Grade</Th><Th center>Remark</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {report.subjects?.map((sub, i) => (
                            <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-slate-800">{sub.subject}</td>
                              <td className="px-4 py-2.5 text-center text-slate-500">{sub.reopen ?? "—"}</td>
                              <td className="px-4 py-2.5 text-center text-slate-500">{sub.ca     ?? "—"}</td>
                              <td className="px-4 py-2.5 text-center text-slate-500">{sub.exams  ?? "—"}</td>
                              <td className="px-4 py-2.5 text-center font-black text-blue-700">{sub.score}</td>
                              {report.show_position && (
                                <td className="px-4 py-2.5 text-center text-slate-500 font-semibold">{sub.subject_position ?? "—"}</td>
                              )}
                              <td className="px-4 py-2.5 text-center"><Badge grade={sub.grade} /></td>
                              <td className="px-4 py-2.5 text-center"><RemarkBadge grade={sub.grade} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500">
                      <p className="font-bold text-slate-600 mb-2 text-[11px] uppercase tracking-wide">Result Interpretation</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                        {reportScale.map(g => <span key={g.grade}>{g.range}: <b>{g.grade} – {g.label}</b></span>)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-5 pb-5">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                      <h3 className="font-bold text-slate-700 mb-3 text-sm">Attendance</h3>
                      {(report.attendance_total ?? 0) > 0 ? (
                        <>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-slate-500">Days Present</span>
                            <span className="font-bold text-slate-700">{report.attendance} / {report.attendance_total}</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${
                              report.attendance_percent >= 80 ? "bg-emerald-500" : report.attendance_percent >= 60 ? "bg-amber-400" : "bg-red-500"
                            }`} style={{ width: `${report.attendance_percent ?? 0}%` }} />
                          </div>
                          <p className="text-xs text-slate-400 mt-1.5 text-right">{report.attendance_percent}% attendance</p>
                        </>
                      ) : (
                        <p className="text-slate-400 text-sm">No attendance data recorded.</p>
                      )}
                    </div>

                    <div className="border border-slate-100 rounded-2xl p-4">
                      <h3 className="font-bold text-slate-700 mb-3 text-sm">Teacher's Remarks</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Conduct</label>
                          <select value={remarks.conduct}
                            onChange={e => { setRemarks(p => ({ ...p, conduct: e.target.value })); setRemarksSaved(false); }}
                            className="w-full border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                            <option value="">— Select —</option>
                            {CONDUCT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Interest</label>
                          <select value={remarks.interest}
                            onChange={e => { setRemarks(p => ({ ...p, interest: e.target.value })); setRemarksSaved(false); }}
                            className="w-full border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                            <option value="">— Select Subject —</option>
                            {subjectOptions.map(name => <option key={name} value={name}>{name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Remark</label>
                          <textarea value={remarks.teacher_remark}
                            onChange={e => { setRemarks(p => ({ ...p, teacher_remark: e.target.value })); setRemarksSaved(false); }}
                            rows={3} placeholder="Write a remark for this student…"
                            className="w-full border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={saveRemarks} disabled={savingRemarks}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm">
                            {savingRemarks ? "Saving…" : "Save Remarks"}
                          </button>
                          {remarksSaved && <span className="text-emerald-600 text-xs font-semibold">✓ Saved</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Class summary */}
            <div>
              <SectionHeader
                title={`Class Summary — ${selectedClassName}`}
                badge={summary.length > 0 ? `${summary.length} students ranked` : null}
              />
              {loadingSummary && <div className="text-center text-slate-400 text-sm py-8">Loading summary…</div>}
              {!loadingSummary && summary.length === 0 && (
                <EmptyState icon="📭" title="No results found for this class and term" />
              )}
              {!loadingSummary && summary.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <Th center>Rank</Th><Th>Student</Th>
                        <Th center>Total</Th><Th center>Average</Th>
                        <Th center>Grade</Th><Th center>Details</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {summary.map(row => {
                        const rankColor = row.rank===1?"text-amber-500":row.rank===2?"text-slate-400":row.rank===3?"text-orange-400":"text-slate-400";
                        const isExp     = expandedStudent === row.student_id;
                        return (
                          <React.Fragment key={row.student_id}>
                            <tr className={`hover:bg-blue-50/20 cursor-pointer transition-colors ${row.rank===1?"bg-amber-50":""}`}
                              onClick={() => setExpandedStudent(isExp ? null : row.student_id)}>
                              <td className="px-4 py-3 text-center">
                                <span className={`font-black text-base ${rankColor}`}>
                                  {row.rank===1?"🥇":row.rank===2?"🥈":row.rank===3?"🥉":`#${row.rank}`}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-800">{row.student_name}</p>
                                <p className="text-xs text-slate-400 font-mono">{row.admission_number}</p>
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-slate-700">{row.total_score}</td>
                              <td className="px-4 py-3 text-center text-slate-600">{row.average_score}</td>
                              <td className="px-4 py-3 text-center"><Badge grade={row.overall_grade} /></td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-blue-500 text-xs font-semibold">{isExp ? "▲ Hide" : "▼ Show"}</span>
                              </td>
                            </tr>
                            {isExp && (
                              <tr className="bg-slate-50/80">
                                <td colSpan={6} className="px-6 py-4">
                                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-blue-50">
                                          <Th>Subject</Th>
                                          <Th center>Re-Open</Th><Th center>CA/MGT</Th>
                                          <Th center>Exams</Th><Th center>Total</Th>
                                          <Th center>Pos.</Th><Th center>Grade</Th><Th center>Remark</Th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 bg-white">
                                        {row.subjects.map(sub => (
                                          <tr key={sub.subject_id} className="hover:bg-blue-50/20">
                                            <td className="px-3 py-2 font-medium text-slate-800">{sub.subject_name}</td>
                                            <td className="px-3 py-2 text-center text-slate-500">{sub.reopen ?? "—"}</td>
                                            <td className="px-3 py-2 text-center text-slate-500">{sub.ca     ?? "—"}</td>
                                            <td className="px-3 py-2 text-center text-slate-500">{sub.exams  ?? "—"}</td>
                                            <td className="px-3 py-2 text-center font-black text-blue-700">{sub.score ?? "—"}</td>
                                            <td className="px-3 py-2 text-center text-slate-500">{fmtPos(sub.subject_position)}</td>
                                            <td className="px-3 py-2 text-center"><Badge grade={sub.grade} /></td>
                                            <td className="px-3 py-2 text-center"><RemarkBadge grade={sub.grade} /></td>
                                          </tr>
                                        ))}
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
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: Announcements
        ══════════════════════════════════════ */}
        {tab === "Announcements" && (
          <AnnouncementsFeed audience="teachers" />
        )}

      </div>
    </div>
  );
};

export default TeacherPortal;
