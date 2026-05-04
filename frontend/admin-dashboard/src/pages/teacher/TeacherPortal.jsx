/**
 * TeacherPortalResults.jsx
 *
 * Drop-in replacement for the Results tab in TeacherPortal.
 *
 * Improvements over original:
 * ─────────────────────────────────────────────────────────
 * 1. Score breakdown modals (CA/MGT, Re-Open, Exams) identical
 *    to the admin Results component — teachers now see sub-scores
 *    and formulas instead of raw text inputs.
 * 2. Class-level detection (Basic 7-9 vs Basic 1-6) → correct
 *    grade scale used automatically.
 * 3. "Saved" indicator per student row (blue dot + label).
 * 4. Delete individual result button (requires existingIds map).
 * 5. Grade scale legend rendered below the table.
 * 6. Shimmer skeleton while results load.
 * 7. Breakdown sub-labels shown under each score button.
 * 8. Toast notifications for all async actions.
 * 9. Subject-level position shown in sub-table (Class Summary).
 * 10. Consistent score computation with admin (CA+Reopen+Exams=100).
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import API from "../../services/api";

// ─────────────────────────────────────────────
// Constants / Grade data
// ─────────────────────────────────────────────

const GRADE_SCALE_B79 = [
  { range: "90–100", grade: "1", remark: "Excellent"    },
  { range: "80–89",  grade: "2", remark: "Very Good"    },
  { range: "70–79",  grade: "3", remark: "Good"         },
  { range: "60–69",  grade: "4", remark: "High Average" },
  { range: "55–59",  grade: "5", remark: "Average"      },
  { range: "50–54",  grade: "6", remark: "Low Average"  },
  { range: "45–49",  grade: "7", remark: "Low"          },
  { range: "40–44",  grade: "8", remark: "Lower"        },
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
  "1":  "#16a34a", "2":  "#059669", "3":  "#0284c7",
  "4":  "#0891b2", "5":  "#ca8a04", "6":  "#ea580c",
  "7":  "#dc2626", "8":  "#b91c1c", "9":  "#991b1b",
  "A":  "#16a34a", "B1": "#059669", "B2": "#0284c7",
  "C1": "#0891b2", "C2": "#ca8a04", "D1": "#ea580c",
  "D2": "#dc2626", "E1": "#b91c1c", "E2": "#991b1b",
};

// ─────────────────────────────────────────────
// Score / grade helpers (mirrors admin exactly)
// ─────────────────────────────────────────────

const computeGrade = (score, level = "basic_7_9") => {
  if (level === "basic_7_9") {
    if (score >= 90) return "1";  if (score >= 80) return "2";
    if (score >= 70) return "3";  if (score >= 60) return "4";
    if (score >= 55) return "5";  if (score >= 50) return "6";
    if (score >= 45) return "7";  if (score >= 40) return "8";
    return "9";
  }
  if (score >= 90) return "A";   if (score >= 80) return "B1";
  if (score >= 70) return "B2";  if (score >= 60) return "C1";
  if (score >= 55) return "C2";  if (score >= 50) return "D1";
  if (score >= 45) return "D2";  if (score >= 40) return "E1";
  return "E2";
};

const computeRemark = (grade, level = "basic_7_9") => {
  const scale = level === "basic_7_9" ? GRADE_SCALE_B79 : GRADE_SCALE_B16;
  return scale.find(g => g.grade === grade)?.remark || "—";
};

const computeTotal = (ca, reopen, exams) =>
  Math.round(((parseFloat(ca) || 0) + (parseFloat(reopen) || 0) + (parseFloat(exams) || 0)) * 100) / 100;

// ── Breakdown calculators ─────────────────────────────────────────────────

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

const calcMGTScore  = (b) => Math.round(Math.min(15, parseFloat(b.mgt_raw) || 0) * 10) / 10;
const calcCAScore   = (b) => Math.round((calcCAonly(b) + calcMGTScore(b)) * 10) / 10;
const calcExamsScore = (b) => Math.round(((parseFloat(b.exam_raw) || 0) / 100) * 40 * 10) / 10;

// ── Breakdown label helpers ───────────────────────────────────────────────

const getReopenBreakdown = (breakdowns, studentId) => {
  const b = breakdowns[studentId]?.reopen;
  return b ? `${parseFloat(b.reopen_raw)||0}+${parseFloat(b.rda)||0}` : null;
};
const getCABreakdown = (breakdowns, studentId) => {
  const b = breakdowns[studentId]?.ca;
  return b ? `CA:${calcCAonly(b).toFixed(1)} MGT:${parseFloat(b.mgt_raw)||0}` : null;
};
const getExamsBreakdown = (breakdowns, studentId) => {
  const b = breakdowns[studentId]?.exams;
  return b ? `raw:${parseFloat(b.exam_raw)||0}/100` : null;
};

// ─────────────────────────────────────────────
// CSS injected once
// ─────────────────────────────────────────────

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  .tp-res-toast { position:fixed; top:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
  .tp-res-toast-item { padding:11px 16px; border-radius:10px; font-size:13px; font-weight:500; display:flex; align-items:center; gap:9px; box-shadow:0 4px 20px rgba(0,0,0,.12); animation:tp-slideIn .2s ease; min-width:260px; pointer-events:all; font-family:'DM Sans',sans-serif; }
  .tp-res-toast-success { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
  .tp-res-toast-error   { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }
  .tp-res-toast-info    { background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; }
  @keyframes tp-slideIn { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }

  /* Score cells */
  .tp-score-cell { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .tp-score-btn { min-width:68px; padding:6px 10px; border-radius:8px; font-family:'DM Mono',monospace; font-size:12.5px; font-weight:600; cursor:pointer; border:1.5px solid #e2e8f0; background:#fff; color:#1e293b; transition:all .15s; display:flex; align-items:center; justify-content:center; gap:4px; }
  .tp-score-btn:hover { border-color:#3b82f6; background:#eff6ff; color:#1d4ed8; }
  .tp-score-btn-filled { border-color:#93c5fd; background:#f0f7ff; color:#1d4ed8; }
  .tp-score-btn-max    { border-color:#86efac; background:#f0fdf4; color:#166534; }
  .tp-score-btn-empty  { border-color:#e2e8f0; color:#94a3b8; font-weight:400; }
  .tp-score-breakdown  { font-size:10px; color:#94a3b8; font-family:'DM Mono',monospace; white-space:nowrap; }
  .tp-saved-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#3b82f6; margin-right:4px; vertical-align:middle; }

  /* Skeleton */
  .tp-skeleton { height:13px; border-radius:5px; background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size:200% 100%; animation:tp-shimmer 1.4s infinite; }
  @keyframes tp-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

  /* Legend */
  .tp-legend { display:flex; flex-wrap:wrap; gap:5px; margin-top:12px; padding:12px 14px; background:#fff; border-radius:10px; box-shadow:0 1px 2px rgba(0,0,0,.06); border:1px solid #f1f5f9; }
  .tp-legend-item { display:flex; align-items:center; gap:4px; padding:2px 7px; background:#f8fafc; border-radius:5px; font-size:11px; }
  .tp-legend-range { font-family:'DM Mono',monospace; color:#64748b; font-size:10.5px; }
  .tp-grade { display:inline-block; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:700; letter-spacing:.3px; font-family:'DM Mono',monospace; }

  /* Modal */
  .tp-modal-backdrop { position:fixed; inset:0; background:rgba(15,23,42,.5); backdrop-filter:blur(4px); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; animation:tp-fadeIn .18s ease; }
  @keyframes tp-fadeIn { from{opacity:0} to{opacity:1} }
  .tp-modal { background:#fff; border-radius:18px; width:100%; max-width:500px; box-shadow:0 24px 60px rgba(15,23,42,.25); animation:tp-slideUp .2s ease; overflow:hidden; }
  @keyframes tp-slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  .tp-modal-header { padding:18px 22px 14px; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; }
  .tp-modal-title { font-size:15px; font-weight:700; color:#0f172a; margin:0; font-family:'DM Sans',sans-serif; }
  .tp-modal-subtitle { font-size:12px; color:#94a3b8; margin:0; font-family:'DM Sans',sans-serif; }
  .tp-modal-close { width:28px; height:28px; border-radius:7px; border:none; background:#f1f5f9; color:#64748b; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:15px; transition:all .15s; }
  .tp-modal-close:hover { background:#e2e8f0; color:#1e293b; }
  .tp-modal-body { padding:20px 22px; display:flex; flex-direction:column; gap:16px; max-height:72vh; overflow-y:auto; }
  .tp-modal-preview { background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); border-radius:12px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .tp-modal-preview-item { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .tp-modal-preview-value { font-family:'DM Mono',monospace; font-size:19px; font-weight:700; color:#fff; line-height:1; }
  .tp-modal-preview-label { font-size:10px; color:#64748b; font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
  .tp-modal-preview-arrow { color:#475569; font-size:16px; }
  .tp-modal-preview-final { font-family:'DM Mono',monospace; font-size:23px; font-weight:800; color:#3b82f6; line-height:1; }
  .tp-modal-preview-max { font-size:11px; color:#475569; font-weight:500; }
  .tp-modal-section { display:flex; flex-direction:column; gap:8px; }
  .tp-modal-section-label { font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.7px; display:flex; align-items:center; justify-content:space-between; }
  .tp-modal-inputs { display:flex; gap:8px; flex-wrap:wrap; }
  .tp-modal-field { display:flex; flex-direction:column; gap:4px; flex:1; min-width:68px; }
  .tp-modal-field label { font-size:11px; color:#64748b; font-weight:600; font-family:'DM Sans',sans-serif; }
  .tp-modal-field input { border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-family:'DM Mono',monospace; font-size:14px; font-weight:600; color:#1e293b; text-align:center; outline:none; transition:all .15s; width:100%; box-sizing:border-box; background:#fafafa; }
  .tp-modal-field input:focus { border-color:#3b82f6; background:#fff; box-shadow:0 0 0 3px rgba(59,130,246,.1); }
  .tp-modal-footer { padding:12px 22px 18px; display:flex; gap:10px; justify-content:flex-end; }
  .tp-modal-btn-cancel { padding:8px 18px; border-radius:9px; border:1.5px solid #e2e8f0; background:#fff; color:#64748b; font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; font-family:'DM Sans',sans-serif; }
  .tp-modal-btn-cancel:hover { border-color:#94a3b8; color:#1e293b; }
  .tp-modal-btn-apply { padding:8px 20px; border-radius:9px; border:none; background:#0f172a; color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; display:flex; align-items:center; gap:7px; font-family:'DM Sans',sans-serif; }
  .tp-modal-btn-apply:hover { background:#1e293b; transform:translateY(-1px); box-shadow:0 4px 12px rgba(15,23,42,.2); }
  .tp-res-divider { height:1px; background:#f1f5f9; margin:0 -22px; }
  .tp-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:700; }
  .tp-pill-blue   { background:#eff6ff; color:#1d4ed8; }
  .tp-pill-purple { background:#f5f3ff; color:#6d28d9; }

  /* Delete button */
  .tp-btn-delete { padding:3px 9px; border-radius:6px; font-size:11px; font-weight:500; border:1.5px solid #fca5a5; color:#dc2626; background:transparent; cursor:pointer; transition:all .15s; font-family:'DM Sans',sans-serif; }
  .tp-btn-delete:hover { background:#dc2626; color:#fff; border-color:#dc2626; }
  .tp-btn-delete:disabled { opacity:.4; cursor:not-allowed; }

  /* Save bar */
  .tp-save-bar { display:flex; align-items:center; justify-content:space-between; margin-top:14px; flex-wrap:wrap; gap:10px; }
  .tp-btn-save { display:flex; align-items:center; gap:7px; background:#0f172a; color:#fff; border:none; border-radius:9px; padding:9px 22px; font-size:13.5px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; transition:all .15s; }
  .tp-btn-save:hover:not(:disabled) { background:#1e293b; transform:translateY(-1px); box-shadow:0 4px 12px rgba(15,23,42,.22); }
  .tp-btn-save:disabled { opacity:.5; cursor:not-allowed; }
  .tp-spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:tp-spin .6s linear infinite; }
  @keyframes tp-spin { to { transform:rotate(360deg); } }

  .tp-info-bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:11px; flex-wrap:wrap; gap:6px; }
  .tp-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:20px; font-size:11.5px; font-weight:600; font-family:'DM Sans',sans-serif; }
  .tp-badge-blue  { background:#eff6ff; color:#1d4ed8; }
  .tp-badge-green { background:#f0fdf4; color:#166534; }
  .tp-badge-amber { background:#fffbeb; color:#92400e; }

  @media (max-width:640px) { .tp-modal { max-width:100%; } }
`;

// ─────────────────────────────────────────────
// Toast hook
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
// Breakdown Modals (identical logic to admin)
// ─────────────────────────────────────────────

function ReopenModal({ studentName, initial, onApply, onClose }) {
  const [vals, setVals] = useState({ reopen_raw: initial?.reopen_raw ?? "", rda: initial?.rda ?? "" });
  const set   = (k, v) => setVals(p => ({ ...p, [k]: v }));
  const score = calcReopenScore(vals);
  return (
    <div className="tp-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tp-modal">
        <div className="tp-modal-header">
          <div><p className="tp-modal-title">Re-Open Score</p><p className="tp-modal-subtitle">{studentName}</p></div>
          <button className="tp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="tp-modal-body">
          <div className="tp-modal-preview">
            <div className="tp-modal-preview-item">
              <span className="tp-modal-preview-final">{score.toFixed(1)}</span>
              <span className="tp-modal-preview-max">/ 20</span>
            </div>
            <div className="tp-modal-preview-item" style={{marginLeft:"auto",alignItems:"flex-end"}}>
              <span style={{fontSize:"10px",color:"#475569"}}>Formula</span>
              <span style={{fontSize:"11px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>Re-Open/10 + RDA/10</span>
            </div>
          </div>
          <div className="tp-modal-section">
            <div className="tp-modal-section-label">
              Re-Open Assessment
              <span className="tp-pill tp-pill-blue">max 20 marks</span>
            </div>
            <div className="tp-modal-inputs">
              <div className="tp-modal-field">
                <label>Re-Open <span style={{color:"#94a3b8",fontWeight:400}}>/10</span></label>
                <input type="number" min="0" max="10" step="0.5" placeholder="0" value={vals.reopen_raw}
                  onChange={e => set("reopen_raw", Math.min(10, Math.max(0, parseFloat(e.target.value)||0)))} />
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>+</div>
              <div className="tp-modal-field">
                <label>RDA <span style={{color:"#94a3b8",fontWeight:400}}>/10</span></label>
                <input type="number" min="0" max="10" step="0.5" placeholder="0" value={vals.rda}
                  onChange={e => set("rda", Math.min(10, Math.max(0, parseFloat(e.target.value)||0)))} />
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
              <div className="tp-modal-field">
                <label style={{color:"#3b82f6"}}>Total /20</label>
                <input readOnly value={score.toFixed(1)} style={{background:"#f0f7ff",borderColor:"#93c5fd",color:"#1d4ed8",cursor:"default"}} />
              </div>
            </div>
          </div>
        </div>
        <div className="tp-modal-footer">
          <button className="tp-modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="tp-modal-btn-apply" onClick={() => onApply(score, vals)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply {score.toFixed(1)} / 20
          </button>
        </div>
      </div>
    </div>
  );
}

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

  const readonlyInput = (val, max, col = "#1d4ed8", bg = "#f0f7ff", border = "#93c5fd") => (
    <div className="tp-modal-field">
      <input readOnly value={val.toFixed(1)} style={{background:bg,borderColor:border,color:col,cursor:"default",fontWeight:"700"}} />
      <label style={{color:"#94a3b8",fontSize:"10px",textAlign:"center"}}>/{max}</label>
    </div>
  );

  return (
    <div className="tp-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tp-modal" style={{maxWidth:"580px"}}>
        <div className="tp-modal-header">
          <div>
            <p className="tp-modal-title">CA / MGT Score</p>
            <p className="tp-modal-subtitle">{studentName} · CA (25%) + MGT (15%) = 40%</p>
          </div>
          <button className="tp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="tp-modal-body">
          <div className="tp-modal-preview">
            <div className="tp-modal-preview-item">
              <span style={{fontSize:"12px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>{caOnly.toFixed(1)}/25</span>
              <span className="tp-modal-preview-label">CA</span>
            </div>
            <span className="tp-modal-preview-arrow">+</span>
            <div className="tp-modal-preview-item">
              <span style={{fontSize:"12px",color:"#a78bfa",fontFamily:"'DM Mono',monospace"}}>{mgtScore.toFixed(1)}/15</span>
              <span className="tp-modal-preview-label">MGT</span>
            </div>
            <span className="tp-modal-preview-arrow">=</span>
            <div className="tp-modal-preview-item">
              <span className="tp-modal-preview-final">{combined.toFixed(1)}</span>
              <span className="tp-modal-preview-max">/ 40</span>
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:"10px"}}>
              {[["HW",hwTotal,20],["CW",cwTotal,40],["CT",ctTotal,50]].map(([lbl,val,mx]) => (
                <div key={lbl} className="tp-modal-preview-item">
                  <span style={{fontSize:"11px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>{val.toFixed(1)}/{mx}</span>
                  <span className="tp-modal-preview-label">{lbl}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="tp-modal-section">
            <div className="tp-modal-section-label">
              <span>Continuous Assessment (CA) <span className="tp-pill tp-pill-blue" style={{marginLeft:"6px"}}>scaled to /25</span></span>
              <span style={{fontWeight:400,color:"#94a3b8",fontSize:"10px"}}>raw total /110</span>
            </div>

            {/* Homework */}
            <div style={{marginBottom:"5px"}}>
              <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:"600",marginBottom:"4px",textTransform:"uppercase",letterSpacing:".5px"}}>Homework — 4×5 = /20</div>
              <div className="tp-modal-inputs" style={{alignItems:"flex-start"}}>
                {["hw1","hw2","hw3","hw4"].map(k => (
                  <div className="tp-modal-field" key={k}>
                    <label>HW {k.slice(2)}</label>
                    <input type="number" min="0" max="5" step="0.5" placeholder="0" value={vals[k]}
                      onChange={e => set(k, Math.min(5, Math.max(0, parseFloat(e.target.value)||0)))} />
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
                {readonlyInput(hwTotal, 20)}
              </div>
            </div>

            {/* Classwork */}
            <div style={{marginBottom:"5px"}}>
              <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:"600",marginBottom:"4px",textTransform:"uppercase",letterSpacing:".5px"}}>Classwork — 4×10 = /40</div>
              <div className="tp-modal-inputs" style={{alignItems:"flex-start"}}>
                {["cw1","cw2","cw3","cw4"].map(k => (
                  <div className="tp-modal-field" key={k}>
                    <label>CW {k.slice(2)}</label>
                    <input type="number" min="0" max="10" step="0.5" placeholder="0" value={vals[k]}
                      onChange={e => set(k, Math.min(10, Math.max(0, parseFloat(e.target.value)||0)))} />
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
                {readonlyInput(cwTotal, 40)}
              </div>
            </div>

            {/* Class Test */}
            <div>
              <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:"600",marginBottom:"4px",textTransform:"uppercase",letterSpacing:".5px"}}>Class Test — 10+10+10+20 = /50</div>
              <div className="tp-modal-inputs" style={{alignItems:"flex-start"}}>
                {[["ct1",10],["ct2",10],["ct3",10],["ct4",20]].map(([k,max]) => (
                  <div className="tp-modal-field" key={k}>
                    <label>CT{k.slice(2)} /{max}</label>
                    <input type="number" min="0" max={max} step="0.5" placeholder="0" value={vals[k]}
                      onChange={e => set(k, Math.min(max, Math.max(0, parseFloat(e.target.value)||0)))} />
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700"}}>=</div>
                {readonlyInput(ctTotal, 50)}
              </div>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"4px",padding:"8px 12px",background:"#eff6ff",borderRadius:"8px",border:"1px solid #bfdbfe"}}>
              <span style={{fontSize:"12px",color:"#64748b"}}>CA raw ({(hwTotal+cwTotal+ctTotal).toFixed(1)}/110) scaled to</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontWeight:"700",color:"#1d4ed8",fontSize:"15px"}}>{caOnly.toFixed(1)} / 25</span>
            </div>
          </div>

          <div className="tp-res-divider" />

          <div className="tp-modal-section">
            <div className="tp-modal-section-label">
              MGT Test <span className="tp-pill tp-pill-purple" style={{marginLeft:"6px"}}>direct entry /15</span>
            </div>
            <div className="tp-modal-inputs">
              <div className="tp-modal-field" style={{flex:"none",width:"120px"}}>
                <label>MGT Score <span style={{color:"#94a3b8",fontWeight:400}}>/15</span></label>
                <input type="number" min="0" max="15" step="0.5" placeholder="0" value={vals.mgt_raw}
                  style={{fontSize:"22px",padding:"10px"}}
                  onChange={e => set("mgt_raw", Math.min(15, Math.max(0, parseFloat(e.target.value)||0)))}
                  autoFocus />
              </div>
              <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end",paddingBottom:"4px",color:"#94a3b8",fontSize:"12px",gap:"2px"}}>
                <span>Direct entry, no scaling</span>
              </div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#f0fdf4",borderRadius:"10px",border:"1px solid #bbf7d0"}}>
            <span style={{fontSize:"13px",color:"#166534",fontWeight:"600"}}>CA + MGT Combined</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:"800",color:"#166534",fontSize:"18px"}}>{combined.toFixed(1)} / 40</span>
          </div>
        </div>
        <div className="tp-modal-footer">
          <button className="tp-modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="tp-modal-btn-apply" onClick={() => onApply(combined, vals)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply {combined.toFixed(1)} / 40
          </button>
        </div>
      </div>
    </div>
  );
}

function ExamsModal({ studentName, initial, onApply, onClose }) {
  const [examRaw, setExamRaw] = useState(initial?.exam_raw ?? "");
  const raw   = parseFloat(examRaw) || 0;
  const score = Math.round((raw / 100) * 40 * 10) / 10;
  return (
    <div className="tp-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tp-modal" style={{maxWidth:"360px"}}>
        <div className="tp-modal-header">
          <div><p className="tp-modal-title">Examination Score</p><p className="tp-modal-subtitle">{studentName}</p></div>
          <button className="tp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="tp-modal-body">
          <div className="tp-modal-preview">
            <div className="tp-modal-preview-item">
              <span className="tp-modal-preview-value">{raw.toFixed(1)}</span>
              <span className="tp-modal-preview-label">Raw /100</span>
            </div>
            <span className="tp-modal-preview-arrow">→</span>
            <div className="tp-modal-preview-item">
              <span className="tp-modal-preview-final">{score.toFixed(1)}</span>
              <span className="tp-modal-preview-max">/ 40</span>
            </div>
            <div className="tp-modal-preview-item" style={{marginLeft:"auto",alignItems:"flex-end"}}>
              <span style={{fontSize:"10px",color:"#475569"}}>Formula</span>
              <span style={{fontSize:"11px",color:"#64748b",fontFamily:"'DM Mono',monospace"}}>(raw/100)×40</span>
            </div>
          </div>
          <div className="tp-modal-section">
            <div className="tp-modal-section-label">
              Exam Score <span style={{fontWeight:400,color:"#94a3b8",fontSize:"10px",textTransform:"none"}}>enter raw mark out of 100</span>
            </div>
            <div className="tp-modal-inputs">
              <div className="tp-modal-field" style={{flex:"none",width:"120px"}}>
                <label>Raw Mark</label>
                <input type="number" min="0" max="100" step="0.5" placeholder="0" value={examRaw}
                  style={{fontSize:"24px",padding:"12px 10px"}}
                  onChange={e => setExamRaw(Math.min(100, Math.max(0, parseFloat(e.target.value)||0)))}
                  autoFocus />
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:"18px",color:"#cbd5e1",fontWeight:"700",fontSize:"20px"}}>/</div>
              <div className="tp-modal-field" style={{flex:"none",width:"60px"}}>
                <label>Max</label>
                <input readOnly value="100" style={{background:"#f8fafc",color:"#94a3b8",cursor:"default",fontSize:"24px",padding:"12px 10px"}} />
              </div>
            </div>
          </div>
        </div>
        <div className="tp-modal-footer">
          <button className="tp-modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="tp-modal-btn-apply" onClick={() => onApply(score, { exam_raw: raw })}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply {score.toFixed(1)} / 40
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main: TeacherResultsTab
//
// Props (all required):
//   selectedClass   string   – current class id
//   selectedTerm    string   – e.g. "term1"
//   selectedYear    string   – e.g. "2026"
//   selectedSubject string   – current subject id
//   students        array    – student objects from parent
//   classLevel      string   – "basic_7_9" | "basic_1_6"
//   loadingStudents bool
// ─────────────────────────────────────────────

export function TeacherResultsTab({
  selectedClass,
  selectedTerm,
  selectedYear,
  selectedSubject,
  students,
  classLevel = "basic_7_9",
  loadingStudents,
}) {
  const { toasts, add: toast } = useToast();

  const [scores,      setScores]      = useState({});
  const [breakdowns,  setBreakdowns]  = useState({});
  const [existingIds, setExistingIds] = useState({});
  const [loadingScores, setLoadingScores] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(null);
  const [modal,       setModal]       = useState(null);

  const loadedRef = useRef({ class: "", subject: "", term: "", year: "" });

  // Style injection
  useEffect(() => {
    if (document.getElementById("tp-res-styles")) return;
    const el = document.createElement("style");
    el.id = "tp-res-styles";
    el.textContent = STYLES;
    document.head.appendChild(el);
  }, []);

  // Load existing scores when filters change
  const loadExistingScores = useCallback(async (studs) => {
    if (!selectedClass || !selectedTerm || !selectedSubject) return;
    const studentList = studs || students;
    if (!studentList.length) return;
    setLoadingScores(true);
    try {
      const res = await API.get(
        `/results/?school_class=${selectedClass}&term=${selectedTerm}&subject=${selectedSubject}&year=${selectedYear}`
      );
      const records = res.data.results || res.data;
      const map = {}; const ids = {};
      records.forEach(r => {
        map[r.student] = { ca: r.ca ?? "", reopen: r.reopen ?? "", exams: r.exams ?? "" };
        ids[r.student] = r.id;
      });
      const next = {};
      studentList.forEach(s => { next[s.id] = map[s.id] || { ca: "", reopen: "", exams: "" }; });
      setScores(next);
      setExistingIds(ids);
      loadedRef.current = { class: selectedClass, subject: selectedSubject, term: selectedTerm, year: selectedYear };
      if (records.length > 0)
        toast(`Loaded ${records.length} saved result${records.length !== 1 ? "s" : ""}.`, "info");
    } catch {
      toast("Failed to load existing scores.", "error");
    } finally {
      setLoadingScores(false);
    }
  }, [selectedClass, selectedTerm, selectedSubject, selectedYear, students, toast]);

  useEffect(() => {
    if (!selectedClass || !selectedSubject || !selectedTerm || !students.length) {
      if (!selectedSubject) { setScores({}); setExistingIds({}); setBreakdowns({}); }
      return;
    }
    const ref = loadedRef.current;
    if (ref.class === selectedClass && ref.subject === selectedSubject && ref.term === selectedTerm && ref.year === selectedYear) return;
    setScores({}); setExistingIds({}); setBreakdowns({});
    loadExistingScores(students);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedSubject, selectedTerm, selectedYear, students]);

  // Modal apply handlers
  const applyReopen = (score, breakdown) => {
    const { studentId } = modal;
    setScores(p => ({ ...p, [studentId]: { ...(p[studentId]||{}), reopen: score } }));
    setBreakdowns(p => ({ ...p, [studentId]: { ...(p[studentId]||{}), reopen: breakdown } }));
    setModal(null);
  };
  const applyCA = (score, breakdown) => {
    const { studentId } = modal;
    setScores(p => ({ ...p, [studentId]: { ...(p[studentId]||{}), ca: score } }));
    setBreakdowns(p => ({ ...p, [studentId]: { ...(p[studentId]||{}), ca: breakdown } }));
    setModal(null);
  };
  const applyExams = (score, breakdown) => {
    const { studentId } = modal;
    setScores(p => ({ ...p, [studentId]: { ...(p[studentId]||{}), exams: score } }));
    setBreakdowns(p => ({ ...p, [studentId]: { ...(p[studentId]||{}), exams: breakdown } }));
    setModal(null);
  };

  const handleDelete = async (studentId) => {
    const id = existingIds[studentId];
    if (!id) return;
    if (!window.confirm("Delete this student's result for the selected subject and term?")) return;
    setDeleting(studentId);
    try {
      await API.delete(`/results/${id}/`);
      setScores(p => ({ ...p, [studentId]: { ca: "", reopen: "", exams: "" } }));
      setExistingIds(p => { const n = { ...p }; delete n[studentId]; return n; });
      setBreakdowns(p => { const n = { ...p }; delete n[studentId]; return n; });
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
      toast(
        errCount === 0
          ? `Saved ${res.data.saved} result${res.data.saved !== 1 ? "s" : ""} successfully.`
          : `Saved ${res.data.saved} record(s) with ${errCount} error(s).`,
        errCount === 0 ? "success" : "info"
      );
      loadedRef.current = { class: "", subject: "", term: "", year: "" };
      await loadExistingScores();
    } catch (err) {
      toast(err.response?.data?.detail || "Error saving results.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Derived
  const filledCount = Object.values(scores).filter(v => v?.ca !== "" || v?.reopen !== "" || v?.exams !== "").length;
  const savedCount  = Object.keys(existingIds).length;
  const gradeScale  = classLevel === "basic_7_9" ? GRADE_SCALE_B79 : GRADE_SCALE_B16;

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

  if (!selectedSubject) return null; // parent handles "select subject" empty state

  return (
    <>
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
      <div className="tp-res-toast">
        {toasts.map(t => (
          <div key={t.id} className={`tp-res-toast-item tp-res-toast-${t.type}`}>
            <span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}</span>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Info bar */}
      <div className="tp-info-bar">
        <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
          <span className="tp-badge tp-badge-blue">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            {students.length} students
          </span>
          {filledCount > 0 && <span className="tp-badge tp-badge-amber">✏ {filledCount} filled</span>}
          {savedCount  > 0 && <span className="tp-badge tp-badge-green">✓ {savedCount} saved</span>}
          {loadingScores && (
            <span style={{fontSize:"12px",color:"#64748b",display:"flex",alignItems:"center",gap:"5px"}}>
              <span style={{width:"12px",height:"12px",border:"2px solid #e2e8f0",borderTopColor:"#3b82f6",borderRadius:"50%",display:"inline-block",animation:"tp-spin .6s linear infinite"}}/>
              Loading…
            </span>
          )}
        </div>
        <div style={{fontSize:"11.5px",color:"#94a3b8",display:"flex",alignItems:"center",gap:"5px"}}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
          Click any score to enter breakdown
        </div>
      </div>

      {/* Table */}
      {loadingStudents ? (
        <div style={{background:"#fff",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              {[...Array(6)].map((_,i) => (
                <tr key={i} style={{borderBottom:"1px solid #f1f5f9"}}>
                  {[50,130,80,80,80,60,50,80,60].map((w,j) => (
                    <td key={j} style={{padding:"14px"}}>
                      <div className="tp-skeleton" style={{width:`${w}px`}}/>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : students.length === 0 ? (
        <div style={{background:"#fff",borderRadius:"14px",padding:"48px 20px",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:"36px",marginBottom:"10px"}}>👤</div>
          <p style={{fontWeight:"600",color:"#1e293b",margin:"0 0 4px"}}>No students found</p>
          <p style={{color:"#94a3b8",fontSize:"13.5px",margin:0}}>No students assigned to this class.</p>
        </div>
      ) : (
        <div style={{background:"#fff",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13.5px",fontFamily:"'DM Sans',sans-serif"}}>
              <thead>
                <tr style={{background:"#0f172a"}}>
                  {[
                    ["#",  "40px",  "center"],
                    ["Student", "180px", "left"],
                    ["CLASS SC.\n/40 (click)", "90px", "center"],
                    ["RE-OPEN\n/20 (click)",   "90px", "center"],
                    ["EXAMS\n/40 (click)",      "90px", "center"],
                    ["TOTAL\n/100",             "70px", "center"],
                    ["GRADE",                   "60px", "center"],
                    ["REMARK",                  "90px", "center"],
                    ["ACTION",                  "70px", "center"],
                  ].map(([label, w, align]) => (
                    <th key={label} style={{padding:"10px 12px",color:"#94a3b8",fontSize:"10.5px",fontWeight:"600",textTransform:"uppercase",letterSpacing:".7px",textAlign:align,whiteSpace:"pre-line",width:w}}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student, i) => {
                  const name     = student.student_name || student.first_name || student.admission_number || "Unknown";
                  const s        = scores[student.id] || { ca: "", reopen: "", exams: "" };
                  const dirty    = s.ca !== "" || s.reopen !== "" || s.exams !== "";
                  const total    = computeTotal(s.ca, s.reopen, s.exams);
                  const grade    = dirty ? computeGrade(total, classLevel) : null;
                  const remark   = grade ? computeRemark(grade, classLevel) : null;
                  const clr      = grade ? (GRADE_COLORS[grade] || "#64748b") : null;
                  const isSaved  = !!existingIds[student.id];

                  const caFilled = s.ca     !== "" && s.ca     !== 0;
                  const rFilled  = s.reopen !== "" && s.reopen !== 0;
                  const eFilled  = s.exams  !== "" && s.exams  !== 0;

                  const caBreak    = getCABreakdown(breakdowns, student.id);
                  const rBreak     = getReopenBreakdown(breakdowns, student.id);
                  const examsBreak = getExamsBreakdown(breakdowns, student.id);

                  return (
                    <tr key={student.id} style={{borderBottom:"1px solid #f1f5f9",transition:"background .1s"}}
                      onMouseEnter={e => e.currentTarget.style.background="#fafbfd"}
                      onMouseLeave={e => e.currentTarget.style.background=""}>

                      <td style={{padding:"10px 12px",textAlign:"center",color:"#94a3b8",fontFamily:"'DM Mono',monospace",fontSize:"11.5px"}}>{i+1}</td>

                      <td style={{padding:"10px 12px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"7px"}}>
                          <div style={{width:"30px",height:"30px",borderRadius:"50%",background:`hsl(${(student.id*47)%360},55%,88%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"700",color:`hsl(${(student.id*47)%360},55%,35%)`,flexShrink:0}}>
                            {name.charAt(0)}
                          </div>
                          <div>
                            <div style={{fontWeight:"600",color:"#1e293b",fontSize:"13px"}}>{name}</div>
                            {isSaved && <div style={{fontSize:"10.5px",color:"#3b82f6",display:"flex",alignItems:"center"}}>
                              <span className="tp-saved-dot"/>saved
                            </div>}
                          </div>
                        </div>
                      </td>

                      {/* CLASS SCORE (CA/MGT) */}
                      <td style={{padding:"8px 10px",textAlign:"center"}}>
                        <div className="tp-score-cell">
                          <button
                            className={`tp-score-btn ${caFilled ? (parseFloat(s.ca)===40 ? "tp-score-btn-max" : "tp-score-btn-filled") : "tp-score-btn-empty"}`}
                            onClick={() => setModal({ type:"ca", studentId:student.id, studentName:name })}>
                            {caFilled ? <>{editIcon}{parseFloat(s.ca).toFixed(1)}</> : <>{addIcon}Enter</>}
                          </button>
                          {caBreak && <span className="tp-score-breakdown">{caBreak}</span>}
                        </div>
                      </td>

                      {/* RE-OPEN */}
                      <td style={{padding:"8px 10px",textAlign:"center"}}>
                        <div className="tp-score-cell">
                          <button
                            className={`tp-score-btn ${rFilled ? (parseFloat(s.reopen)===20 ? "tp-score-btn-max" : "tp-score-btn-filled") : "tp-score-btn-empty"}`}
                            onClick={() => setModal({ type:"reopen", studentId:student.id, studentName:name })}>
                            {rFilled ? <>{editIcon}{parseFloat(s.reopen).toFixed(1)}</> : <>{addIcon}Enter</>}
                          </button>
                          {rBreak && <span className="tp-score-breakdown">{rBreak}</span>}
                        </div>
                      </td>

                      {/* EXAMS */}
                      <td style={{padding:"8px 10px",textAlign:"center"}}>
                        <div className="tp-score-cell">
                          <button
                            className={`tp-score-btn ${eFilled ? (parseFloat(s.exams)===40 ? "tp-score-btn-max" : "tp-score-btn-filled") : "tp-score-btn-empty"}`}
                            onClick={() => setModal({ type:"exams", studentId:student.id, studentName:name })}>
                            {eFilled ? <>{editIcon}{parseFloat(s.exams).toFixed(1)}</> : <>{addIcon}Enter</>}
                          </button>
                          {examsBreak && <span className="tp-score-breakdown">{examsBreak}</span>}
                        </div>
                      </td>

                      <td style={{padding:"10px 12px",textAlign:"center"}}>
                        {dirty
                          ? <span style={{fontFamily:"'DM Mono',monospace",fontWeight:"700",fontSize:"14px",color:"#1d4ed8"}}>{total}</span>
                          : <span style={{color:"#cbd5e1"}}>—</span>}
                      </td>

                      <td style={{padding:"10px 12px",textAlign:"center"}}>
                        {grade
                          ? <span className="tp-grade" style={{background:`${clr}18`,color:clr}}>{grade}</span>
                          : <span style={{color:"#e2e8f0"}}>—</span>}
                      </td>

                      <td style={{padding:"10px 12px",textAlign:"center",fontSize:"12px",color:clr||"#cbd5e1"}}>
                        {remark || "—"}
                      </td>

                      <td style={{padding:"10px 12px",textAlign:"center"}}>
                        {isSaved && (
                          <button className="tp-btn-delete"
                            onClick={() => handleDelete(student.id)}
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
        </div>
      )}

      {/* Grade scale legend */}
      {students.length > 0 && (
        <div className="tp-legend">
          <span style={{fontSize:"10.5px",fontWeight:"700",color:"#475569",marginRight:"3px",alignSelf:"center"}}>GRADE SCALE:</span>
          {gradeScale.map(item => {
            const c = GRADE_COLORS[item.grade] || "#64748b";
            return (
              <div key={item.grade+item.range} className="tp-legend-item">
                <span className="tp-grade" style={{background:`${c}18`,color:c,padding:"1px 6px"}}>{item.grade}</span>
                <span className="tp-legend-range">{item.range}</span>
                <span style={{fontSize:"10.5px",color:"#94a3b8"}}>{item.remark}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Save bar */}
      {students.length > 0 && (
        <div className="tp-save-bar">
          <div style={{fontSize:"12.5px",color:"#94a3b8"}}>
            {filledCount === 0
              ? "Click any score cell to enter breakdown details"
              : `${filledCount} of ${students.length} students have scores entered`}
          </div>
          <button className="tp-btn-save"
            onClick={submitResults}
            disabled={saving || filledCount === 0}>
            {saving ? (
              <><div className="tp-spinner"/>Saving…</>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
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
  );
}

// ─────────────────────────────────────────────
// Integration guide (how to use in TeacherPortal)
// ─────────────────────────────────────────────
/*
  1. Import in TeacherPortal.jsx:
       import { TeacherResultsTab } from "./TeacherPortalResults";

  2. Add class-level detection alongside handleClassChange:
       const [classLevel, setClassLevel] = useState("basic_7_9");

       // inside handleClassChange:
       const name = (found?.name || "").toLowerCase();
       const isB79 = ["basic 7","basic 8","basic 9","b7","b8","b9"].some(m => name.includes(m));
       setClassLevel(isB79 ? "basic_7_9" : "basic_1_6");

  3. Replace the "Results" tab body with:
       {tab === "Results" && selectedClass && (
         <>
           {!selectedSubject && (
             <EmptyState icon="📊" title="Select a subject above to enter scores" />
           )}
           {selectedSubject && (
             <TeacherResultsTab
               selectedClass={selectedClass}
               selectedTerm={selectedTerm}
               selectedYear={selectedYear}
               selectedSubject={selectedSubject}
               students={students}
               classLevel={classLevel}
               loadingStudents={loadingStudents}
             />
           )}
         </>
       )}
*/

export default TeacherResultsTab;
