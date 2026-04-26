import { useEffect, useState } from "react";
import API from "../services/api";

const TERMS = [
  { value: "term1", label: "Term 1" },
  { value: "term2", label: "Term 2" },
  { value: "term3", label: "Term 3" },
];
const YEARS = [2026, 2025, 2024, 2023, 2022];
const STATUS_FILTERS = [
  { value: "",        label: "All"     },
  { value: "paid",    label: "Paid"    },
  { value: "partial", label: "Partial" },
  { value: "unpaid",  label: "Unpaid"  },
];
const TABS = ["Fee Records", "Fee Schedule", "Assign to Class", "Assign to Student"];
const emptyAssign = { amount: "", book_user_fee: "", workbook_fee: "", arrears: "" };

// ─── Fee schedule extracted from school fee sheet ───────────────────────────
const FEE_SCHEDULE = {
  "nursery-lily":       { label: "Lily / Roses",  amount: 813,  department: "Pre-School (Nursery–KG)" },
  "nursery-roses":      { label: "Lily / Roses",  amount: 813,  department: "Pre-School (Nursery–KG)" },
  "nursery-pearls":     { label: "Pearls",        amount: 820,  department: "Pre-School (Nursery–KG)" },
  "nursery-kindergold": { label: "Kindergold",    amount: 830,  department: "Pre-School (Nursery–KG)" },
  "class1":             { label: "Class 1",       amount: 928,  department: "Lower Primary (Class 1–2)" },
  "class2":             { label: "Class 2",       amount: 928,  department: "Lower Primary (Class 1–2)" },
  "class3":             { label: "Class 3",       amount: 928,  department: "Upper Primary (Class 3–5)" },
  "class4":             { label: "Class 4 & 5",   amount: 925,  department: "Upper Primary (Class 3–5)" },
  "class5":             { label: "Class 4 & 5",   amount: 925,  department: "Upper Primary (Class 3–5)" },
  "class6":             { label: "Class 6",       amount: 963,  department: "JHS & Class 6" },
  "jhs1":               { label: "JHS 1 & 2",     amount: 1650, department: "JHS & Class 6" },
  "jhs2":               { label: "JHS 1 & 2",     amount: 1650, department: "JHS & Class 6" },
};

// Maps class name strings from the API to a schedule key for auto-fill lookup.
// Adjust these matchers to match your actual class names in the database.
const CLASS_NAME_TO_SCHEDULE_KEY = (name = "") => {
  const n = name.toLowerCase().trim();
  if (n.includes("lily"))        return "nursery-lily";
  if (n.includes("roses"))       return "nursery-roses";
  if (n.includes("pearls"))      return "nursery-pearls";
  if (n.includes("kindergold"))  return "nursery-kindergold";
  if (n.includes("class 1") || n === "1") return "class1";
  if (n.includes("class 2") || n === "2") return "class2";
  if (n.includes("class 3") || n === "3") return "class3";
  if (n.includes("class 4") || n === "4") return "class4";
  if (n.includes("class 5") || n === "5") return "class5";
  if (n.includes("class 6") || n === "6") return "class6";
  if (n.includes("jhs 1") || n.includes("jhs1")) return "jhs1";
  if (n.includes("jhs 2") || n.includes("jhs2")) return "jhs2";
  return null;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const Badge = ({ fee }) => {
  if (fee.balance <= 0) return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">✓ Paid</span>;
  if (fee.paid > 0)     return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">◑ Partial</span>;
  return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 ring-1 ring-red-200">✕ Unpaid</span>;
};

const Modal = ({ children, onClose }) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

const Btn = ({ children, onClick, disabled, variant = "primary", size = "md", className = "" }) => {
  const base = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-sm" };
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
    warning: "bg-amber-500 hover:bg-amber-600 text-white shadow-sm",
    danger:  "bg-white hover:bg-red-600 text-red-600 hover:text-white ring-1 ring-red-200 hover:ring-red-600",
    ghost:   "bg-slate-100 hover:bg-slate-200 text-slate-700",
    outline: "bg-white hover:bg-slate-50 text-slate-700 ring-1 ring-slate-200",
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const StatCard = ({ label, value, sub, color = "text-slate-800", bg = "bg-white" }) => (
  <div className={`${bg} rounded-xl border border-slate-200 p-4 shadow-sm`}>
    <div className={`text-2xl font-bold tracking-tight ${color}`}>{value}</div>
    {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    <div className="text-xs font-medium text-slate-500 mt-1">{label}</div>
  </div>
);

// Auto-fill hint pill shown above fee fields when a matching schedule exists
const AutoFillHint = ({ scheduleKey, onFill }) => {
  if (!scheduleKey || !FEE_SCHEDULE[scheduleKey]) return null;
  const sch = FEE_SCHEDULE[scheduleKey];
  return (
    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg mb-3">
      <span className="text-xs text-blue-600 font-medium flex-1">
        📋 Schedule found: <strong>{sch.label}</strong> — GHS {sch.amount.toLocaleString()}/term
      </span>
      <button
        type="button"
        onClick={() => onFill(sch)}
        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-medium transition-colors"
      >
        Auto-fill tuition
      </button>
    </div>
  );
};

const FeeFormFields = ({ values, onChange, showArrears = false, scheduleKey = null }) => {
  const total =
    parseFloat(values.amount       || 0) +
    parseFloat(values.book_user_fee || 0) +
    parseFloat(values.workbook_fee  || 0) +
    parseFloat(values.arrears       || 0);

  const handleAutoFill = (sch) => {
    onChange("amount", String(sch.amount));
  };

  return (
    <div className="space-y-3">
      <AutoFillHint scheduleKey={scheduleKey} onFill={handleAutoFill} />
      <div>
        <label className="text-xs font-medium text-slate-600 block mb-1">
          School Fees (GHS) <span className="text-red-500">*</span>
        </label>
        <input
          type="number" min="0" step="0.01" placeholder="0.00"
          value={values.amount}
          onChange={(e) => onChange("amount", e.target.value)}
          className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[["book_user_fee", "Book User Fee"], ["workbook_fee", "Workbook Fee"]].map(([key, label]) => (
          <div key={key}>
            <label className="text-xs font-medium text-slate-600 block mb-1">{label} (GHS)</label>
            <input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={values[key]}
              onChange={(e) => onChange(key, e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>
        ))}
      </div>
      {showArrears && (
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Arrears (GHS)</label>
          <input
            type="number" min="0" step="0.01" placeholder="0.00"
            value={values.arrears}
            onChange={(e) => onChange("arrears", e.target.value)}
            className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        </div>
      )}
      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
        <span className="text-sm text-blue-700 font-medium">Total Due</span>
        <span className="text-base font-bold text-blue-700">
          GHS {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
};

// ─── Fee Schedule Reference Table ────────────────────────────────────────────

const FeeScheduleTab = () => {
  const SectionHeader = ({ title, badge, badgeColor = "bg-green-100 text-green-800" }) => (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
    </div>
  );

  const Row = ({ label, values, highlight = false }) => (
    <tr className={highlight ? "bg-slate-50" : "hover:bg-slate-50 transition-colors"}>
      <td className="px-4 py-2.5 text-sm text-slate-600 border-b border-slate-100">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-4 py-2.5 text-sm text-right font-medium text-slate-800 border-b border-slate-100">
          {v}
        </td>
      ))}
    </tr>
  );

  const ColHead = ({ cols }) => (
    <thead>
      <tr className="bg-slate-100">
        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Fee Type</th>
        {cols.map((c) => (
          <th key={c} className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">{c}</th>
        ))}
      </tr>
    </thead>
  );

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
        <span className="text-lg mt-0.5">📋</span>
        <div>
          <strong>Top Ridge School — Official Fee Schedule</strong>
          <p className="mt-0.5 text-xs text-amber-700">
            Daily fees (feeding & studies) are not included in the auto-fill. Admission fee applies on first enrolment only.
            P.E. uniform fee is to be confirmed (TBC).
          </p>
        </div>
      </div>

      {/* Pre-school */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <SectionHeader title="Pre-School Department (Nursery to KG)" badge="Nursery – KG" badgeColor="bg-green-100 text-green-800" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <ColHead cols={["Lily / Roses", "Pearls", "Kindergold"]} />
            <tbody>
              <Row label="Admission Fee"         values={["—", "—", "—"]} />
              <Row label="Tuition Fee"           values={["GHS 813.00", "GHS 820.00", "GHS 830.00"]} highlight />
              <Row label="Feeding Fee (Daily)"   values={["GHS 10.00", "GHS 10.00", "GHS 10.00"]} />
              <Row label="Studies Fee – KG (Daily)" values={["GHS 2.00", "GHS 2.00", "GHS 2.00"]} />
              <Row label="T-Shirt"              values={["GHS 60.00", "GHS 60.00", "GHS 60.00"]} />
              <Row label="House Dress – Lily (×2)" values={["GHS 160.00", "—", "—"]} />
              <Row label="P.E. Uniform"          values={["TBC", "TBC", "TBC"]} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Lower Primary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <SectionHeader title="Lower Primary (Class 1 & 2)" badge="Class 1–2" badgeColor="bg-blue-100 text-blue-800" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <ColHead cols={["Amount"]} />
            <tbody>
              <Row label="Admission Fee"       values={["—"]} />
              <Row label="Tuition Fee"         values={["GHS 928.00"]} highlight />
              <Row label="Feeding Fee (Daily)" values={["GHS 10.00"]} />
              <Row label="Studies Fee (Daily)" values={["GHS 2.00"]} />
              <Row label="T-Shirt"             values={["GHS 60.00"]} />
              <Row label="P.E. Uniform"        values={["TBC"]} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Upper Primary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <SectionHeader title="Upper Primary (Class 3 – 5)" badge="Class 3–5" badgeColor="bg-amber-100 text-amber-800" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <ColHead cols={["Class 3", "Class 4 & 5"]} />
            <tbody>
              <Row label="Admission Fee"       values={["GHS 200.00", "GHS 200.00"]} />
              <Row label="Tuition Fee"         values={["GHS 928.00", "GHS 925.00"]} highlight />
              <Row label="Feeding Fee (Daily)" values={["GHS 10.00", "GHS 10.00"]} />
              <Row label="Studies Fee (Daily)" values={["GHS 2.00",  "GHS 2.00"]} />
              <Row label="T-Shirt"             values={["GHS 60.00", "GHS 60.00"]} />
              <Row label="P.E. Uniform"        values={["TBC", "TBC"]} />
            </tbody>
          </table>
        </div>
      </div>

      {/* JHS & Class 6 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <SectionHeader title="JHS & Class Six (6) Department" badge="Class 6 – JHS" badgeColor="bg-purple-100 text-purple-800" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <ColHead cols={["JHS 2 & 1", "Class 6"]} />
            <tbody>
              <Row label="Admission Fee"       values={["GHS 200.00", "GHS 200.00"]} />
              <Row label="Tuition Fee"         values={["GHS 1,650.00", "GHS 963.00"]} highlight />
              <Row label="Feeding Fee (Daily)" values={["GHS 10.00", "GHS 10.00"]} />
              <Row label="Studies Fee (Daily)" values={["GHS 5.00",  "GHS 5.00"]} />
              <Row label="T-Shirt"             values={["GHS 60.00", "GHS 60.00"]} />
              <Row label="P.E. Uniform"        values={["TBC", "TBC"]} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const Fees = () => {
  const [tab, setTab]                       = useState("Fee Records");
  const [classes, setClasses]               = useState([]);
  const [students, setStudents]             = useState([]);
  const [selectedClass, setSelectedClass]   = useState("");
  const [selectedTerm, setSelectedTerm]     = useState("term1");
  const [selectedYear, setSelectedYear]     = useState(String(YEARS[0]));
  const [statusFilter, setStatusFilter]     = useState("");
  const [summary, setSummary]               = useState(null);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState("");
  const [success, setSuccess]               = useState("");
  const [deletingFee, setDeletingFee]       = useState(null);

  // Pay
  const [payingFee, setPayingFee]   = useState(null);
  const [payAmount, setPayAmount]   = useState("");
  const [payNote, setPayNote]       = useState("");
  const [paying, setPaying]         = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  // Arrears
  const [arrearsFee, setArrearsFee]       = useState(null);
  const [arrearsAmount, setArrearsAmount] = useState("");
  const [savingArrears, setSavingArrears] = useState(false);

  // History
  const [historyFee, setHistoryFee]         = useState(null);
  const [transactions, setTransactions]     = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Assign
  const [classAssign, setClassAssign]           = useState({ ...emptyAssign });
  const [assigning, setAssigning]               = useState(false);
  const [selectedStudent, setSelectedStudent]   = useState("");
  const [studentAssign, setStudentAssign]       = useState({ ...emptyAssign });
  const [assigningStudent, setAssigningStudent] = useState(false);

  // Derive schedule key from selected class name for auto-fill
  const selectedClassName = classes.find((c) => String(c.id) === String(selectedClass))?.name || "";
  const scheduleKey       = CLASS_NAME_TO_SCHEDULE_KEY(selectedClassName);

  useEffect(() => { fetchClasses(); }, []);
  useEffect(() => { if (selectedClass) fetchStudents(selectedClass); else setStudents([]); }, [selectedClass]);
  useEffect(() => { if (selectedClass && selectedTerm) fetchSummary(); else setSummary(null); }, [selectedClass, selectedTerm, selectedYear, statusFilter]);
  useEffect(() => { setError(""); setSuccess(""); }, [tab, selectedClass, selectedTerm, selectedYear]);

  const fetchClasses  = async () => { try { const r = await API.get("/classes/"); setClasses(r.data.results || r.data); } catch { setError("Failed to load classes."); } };
  const fetchStudents = async (id) => { try { const r = await API.get(`/students/?school_class=${id}`); setStudents(r.data.results || r.data); } catch { setError("Failed to load students."); } };

  const fetchSummary = async () => {
    setLoading(true); setError("");
    try {
      const r = await API.get(
        `/fees/summary/?school_class=${selectedClass}&term=${selectedTerm}&year=${selectedYear}` +
        (statusFilter ? `&status=${statusFilter}` : "")
      );
      setSummary(r.data);
    } catch { setError("Failed to load fee records."); }
    finally { setLoading(false); }
  };

  const openHistory = async (fee) => {
    setHistoryFee(fee); setTransactions([]); setLoadingHistory(true);
    try { const r = await API.get(`/fees/${fee.id}/transactions/`); setTransactions(r.data.transactions || []); }
    catch { setTransactions([]); }
    finally { setLoadingHistory(false); }
  };

  const downloadFile = async (url, fallbackFilename) => {
    const r = await API.get(url, { responseType: "blob" });
    const disposition = r.headers["content-disposition"];
    let filename = fallbackFilename;
    if (disposition) {
      const match = disposition.match(/filename\*=UTF-8''(.+)|filename="?([^"]+)"?/);
      if (match) filename = decodeURIComponent(match[1] || match[2]);
    }
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(new Blob([r.data]));
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadBill = async (url, filename) => {
    try { await downloadFile(url, filename); }
    catch { setError("Bill could not be generated."); }
  };

  const handleDeleteFee = async (fee) => {
    if (!window.confirm(`Delete fee record for ${fee.student_name}? This cannot be undone.`)) return;
    setDeletingFee(fee.id); setError("");
    try { await API.delete(`/fees/${fee.id}/`); setSuccess(`Deleted fee record for ${fee.student_name}.`); fetchSummary(); }
    catch { setError("Failed to delete fee record."); }
    finally { setDeletingFee(null); }
  };

  const submitPayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) { setError("Enter a valid payment amount."); return; }
    setPaying(true); setError("");
    try {
      const res = await API.post(`/fees/${payingFee.id}/pay/`, { amount: payAmount, note: payNote });
      const txnId       = res.data.transaction_id;
      const studentName = payingFee.student_name;
      const admNo       = payingFee.admission_number;

      setPayingFee(null); setPayAmount(""); setPayNote("");
      fetchSummary();
      setSuccess(`Payment of GHS ${payAmount} recorded for ${studentName}. Downloading receipt…`);

      setDownloadingReceipt(true);
      try {
        await downloadFile(
          `/fees/receipt/${txnId}/`,
          `receipt_${admNo}_${selectedTerm}_${txnId}.pdf`,
        );
        setSuccess(`Payment recorded for ${studentName}. Receipt downloaded.`);
      } catch {
        setSuccess(`Payment recorded for ${studentName}. Receipt download failed — use History to retry.`);
      } finally {
        setDownloadingReceipt(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to record payment.");
    } finally {
      setPaying(false);
    }
  };

  const downloadReceiptFromHistory = async (txn, admNo) => {
    try {
      await downloadFile(
        `/fees/receipt/${txn.id}/`,
        `receipt_${admNo}_${txn.id}.pdf`,
      );
    } catch { setError("Receipt download failed."); }
  };

  const submitArrears = async () => {
    if (arrearsAmount === "" || parseFloat(arrearsAmount) < 0) { setError("Enter a valid arrears amount."); return; }
    setSavingArrears(true); setError("");
    try {
      await API.post(`/fees/${arrearsFee.id}/add-arrears/`, { arrears: arrearsAmount });
      setSuccess(`Arrears updated for ${arrearsFee.student_name}.`);
      setArrearsFee(null); setArrearsAmount(""); fetchSummary();
    } catch (err) { setError(err.response?.data?.error || "Failed to update arrears."); }
    finally { setSavingArrears(false); }
  };

  const submitClassAssign = async () => {
    if (!selectedClass || !selectedTerm || !classAssign.amount) { setError("Please select a class, term, and enter a fee amount."); return; }
    setAssigning(true); setError("");
    try {
      const res = await API.post("/fees/bulk-assign/", {
        school_class:  selectedClass,
        term:          selectedTerm,
        year:          selectedYear,
        amount:        classAssign.amount,
        book_user_fee: classAssign.book_user_fee || 0,
        workbook_fee:  classAssign.workbook_fee  || 0,
      });
      setSuccess(`Done — ${res.data.created} created, ${res.data.updated} updated.`);
      setClassAssign({ ...emptyAssign }); fetchSummary();
      await downloadBill(
        `/fees/bill/class/?school_class=${selectedClass}&term=${selectedTerm}&year=${selectedYear}`,
        `class_bill_${selectedTerm}_${selectedYear}.pdf`,
      );
    } catch (err) { setError(err.response?.data?.error || "Failed to assign fees."); }
    finally { setAssigning(false); }
  };

  const submitStudentAssign = async () => {
    if (!selectedStudent || !selectedTerm || !studentAssign.amount) { setError("Please select a student, term, and enter a fee amount."); return; }
    setAssigningStudent(true); setError("");
    try {
      await API.post("/fees/assign-student/", {
        student:       selectedStudent,
        term:          selectedTerm,
        year:          selectedYear,
        amount:        studentAssign.amount,
        book_user_fee: studentAssign.book_user_fee || 0,
        workbook_fee:  studentAssign.workbook_fee  || 0,
        arrears:       studentAssign.arrears       || 0,
      });
      setSuccess("Fee assigned successfully.");
      const cap = selectedStudent;
      setStudentAssign({ ...emptyAssign }); setSelectedStudent(""); fetchSummary();
      await downloadBill(
        `/fees/bill/student/${cap}/?term=${selectedTerm}&year=${selectedYear}`,
        `bill_${cap}_${selectedTerm}_${selectedYear}.pdf`,
      );
    } catch (err) { setError(err.response?.data?.error || "Failed to assign fee."); }
    finally { setAssigningStudent(false); }
  };

  const filteredRecords = (summary?.records || []).filter((fee) => {
    if (!statusFilter) return true;
    if (statusFilter === "paid")    return fee.balance <= 0;
    if (statusFilter === "partial") return fee.paid > 0 && fee.balance > 0;
    if (statusFilter === "unpaid")  return Number(fee.paid) === 0;
    return true;
  });

  const SelectField = ({ label, value, onChange, children, disabled }) => (
    <div>
      {label && <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>}
      <select
        value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="border border-slate-200 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:bg-slate-50 w-full"
      >
        {children}
      </select>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {downloadingReceipt && (
        <div className="fixed top-4 right-4 z-50 bg-blue-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <span className="animate-spin">⟳</span> Generating receipt…
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Fee Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage student fees, payments and billing</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            <span>⚠</span> {error}
            <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm">
            <span>✓</span> {success}
            <button onClick={() => setSuccess("")} className="ml-auto text-emerald-400 hover:text-emerald-600">✕</button>
          </div>
        )}

        {/* Filter bar — hidden on Fee Schedule tab */}
        {tab !== "Fee Schedule" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="min-w-[160px]">
                <SelectField value={selectedClass} onChange={setSelectedClass}>
                  <option value="">Select Class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
              </div>
              <SelectField value={selectedTerm} onChange={setSelectedTerm}>
                {TERMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </SelectField>
              <SelectField value={selectedYear} onChange={setSelectedYear}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </SelectField>
              {tab === "Fee Records" && (
                <SelectField value={statusFilter} onChange={setStatusFilter}>
                  {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </SelectField>
              )}
              {/* Show matched schedule badge in filter bar */}
              {scheduleKey && tab !== "Fee Records" && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium">
                  <span>📋</span>
                  {FEE_SCHEDULE[scheduleKey].department} — {FEE_SCHEDULE[scheduleKey].label}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
          {TABS.map((t) => (
            <button
              key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                tab === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Fee Records ── */}
        {tab === "Fee Records" && (
          <>
            {!selectedClass && (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">💳</div>
                <p className="font-medium">Select a class to view fee records</p>
              </div>
            )}
            {loading && (
              <div className="text-center py-16 text-slate-400">
                <div className="animate-spin text-3xl mb-2">⟳</div>
                <p className="text-sm">Loading records...</p>
              </div>
            )}
            {summary && !loading && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                  <StatCard label="Total Expected"  value={`GHS ${Number(summary.total_expected).toLocaleString()}`} color="text-slate-800" />
                  <StatCard label="Total Collected" value={`GHS ${Number(summary.total_paid).toLocaleString()}`}     color="text-emerald-600" bg="bg-emerald-50" />
                  <StatCard label="Outstanding"     value={`GHS ${Number(summary.total_balance).toLocaleString()}`}  color="text-red-600"     bg="bg-red-50" />
                  <StatCard
                    label="Fully Paid"
                    value={`${summary.fully_paid} / ${summary.total_students}`}
                    sub={`${summary.partial} partial · ${summary.unpaid} unpaid`}
                    color="text-blue-600" bg="bg-blue-50"
                  />
                </div>

                {filteredRecords.length > 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            {["Student","Fees","Books","Workbook","Arrears","Total","Paid","Balance","Status","Actions"].map((h) => (
                              <th
                                key={h}
                                className={`p-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${
                                  h === "Student" || h === "Actions" ? "text-left" : "text-right"
                                } ${h === "Status" || h === "Actions" ? "text-center" : ""}`}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredRecords.map((fee) => (
                            <tr key={fee.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3">
                                <div className="font-medium text-slate-800">{fee.student_name}</div>
                                <div className="text-xs text-slate-400">{fee.admission_number}</div>
                              </td>
                              <td className="p-3 text-right text-slate-600">{Number(fee.amount).toLocaleString()}</td>
                              <td className="p-3 text-right text-slate-600">{Number(fee.book_user_fee).toLocaleString()}</td>
                              <td className="p-3 text-right text-slate-600">{Number(fee.workbook_fee).toLocaleString()}</td>
                              <td className="p-3 text-right text-red-500">{Number(fee.arrears).toLocaleString()}</td>
                              <td className="p-3 text-right font-semibold text-slate-800">{Number(fee.total_amount).toLocaleString()}</td>
                              <td className="p-3 text-right font-medium text-emerald-600">{Number(fee.paid).toLocaleString()}</td>
                              <td className="p-3 text-right font-medium text-red-500">{Number(fee.balance).toLocaleString()}</td>
                              <td className="p-3 text-center"><Badge fee={fee} /></td>
                              <td className="p-3">
                                <div className="flex gap-1.5 justify-center flex-wrap">
                                  {fee.balance > 0 && (
                                    <Btn size="sm" variant="primary" onClick={() => { setPayingFee(fee); setPayAmount(""); setPayNote(""); setError(""); setSuccess(""); }}>Pay</Btn>
                                  )}
                                  {Number(fee.paid) > 0 && (
                                    <Btn size="sm" variant="success" onClick={() => openHistory(fee)}>History</Btn>
                                  )}
                                  <Btn size="sm" variant="warning" onClick={() => { setArrearsFee(fee); setArrearsAmount(fee.arrears); setError(""); setSuccess(""); }}>Arrears</Btn>
                                  <Btn size="sm" variant="ghost" onClick={() => downloadBill(`/fees/bill/student/${fee.student}/?term=${selectedTerm}&year=${selectedYear}`, `bill_${fee.admission_number}_${selectedTerm}_${selectedYear}.pdf`)}>Bill</Btn>
                                  <Btn size="sm" variant="danger" disabled={deletingFee === fee.id} onClick={() => handleDeleteFee(fee)}>
                                    {deletingFee === fee.id ? "…" : "Delete"}
                                  </Btn>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-400">
                    <div className="text-4xl mb-2">📭</div>
                    <p>No fee records found for this filter.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Fee Schedule ── */}
        {tab === "Fee Schedule" && <FeeScheduleTab />}

        {/* ── Assign to Class ── */}
        {tab === "Assign to Class" && (
          <div className="max-w-lg">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="font-semibold text-slate-800 mb-1">Assign to Entire Class</h2>
              <p className="text-sm text-slate-500 mb-5">
                Sets the same fee structure for every student in the selected class.
              </p>
              <div className="space-y-4">
                <SelectField label="Class" value={selectedClass} onChange={setSelectedClass}>
                  <option value="">Select Class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="Term" value={selectedTerm} onChange={setSelectedTerm}>
                    {TERMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </SelectField>
                  <SelectField label="Year" value={selectedYear} onChange={setSelectedYear}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </SelectField>
                </div>
                <FeeFormFields
                  values={classAssign}
                  onChange={(f, v) => setClassAssign((p) => ({ ...p, [f]: v }))}
                  scheduleKey={scheduleKey}
                />
                <Btn variant="primary" onClick={submitClassAssign} disabled={assigning} className="w-full justify-center py-2.5">
                  {assigning ? "Assigning…" : "Assign Fees to Entire Class"}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {/* ── Assign to Student ── */}
        {tab === "Assign to Student" && (
          <div className="max-w-lg">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="font-semibold text-slate-800 mb-1">Assign to Student</h2>
              <p className="text-sm text-slate-500 mb-5">
                Assign or update fees for a specific student, including arrears.
              </p>
              <div className="space-y-4">
                <SelectField label="Class" value={selectedClass} onChange={setSelectedClass}>
                  <option value="">Select Class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
                <SelectField label="Student" value={selectedStudent} onChange={setSelectedStudent} disabled={!students.length}>
                  <option value="">Select Student</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.student_name || s.admission_number || "Unknown"}</option>
                  ))}
                </SelectField>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="Term" value={selectedTerm} onChange={setSelectedTerm}>
                    {TERMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </SelectField>
                  <SelectField label="Year" value={selectedYear} onChange={setSelectedYear}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </SelectField>
                </div>
                <FeeFormFields
                  values={studentAssign}
                  onChange={(f, v) => setStudentAssign((p) => ({ ...p, [f]: v }))}
                  showArrears
                  scheduleKey={scheduleKey}
                />
                <Btn variant="primary" onClick={submitStudentAssign} disabled={assigningStudent} className="w-full justify-center py-2.5">
                  {assigningStudent ? "Saving…" : "Assign Fee to Student"}
                </Btn>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Pay modal ── */}
      {payingFee && (
        <Modal onClose={() => { setPayingFee(null); setPayAmount(""); setPayNote(""); }}>
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Record Payment</h2>
                <p className="text-sm text-slate-500">{payingFee.student_name}</p>
              </div>
              <button onClick={() => { setPayingFee(null); setPayAmount(""); setPayNote(""); }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { label: "Total Due", value: `GHS ${Number(payingFee.total_amount).toLocaleString()}`, color: "text-slate-700" },
                { label: "Paid",      value: `GHS ${Number(payingFee.paid).toLocaleString()}`,         color: "text-emerald-600" },
                { label: "Balance",   value: `GHS ${Number(payingFee.balance).toLocaleString()}`,      color: "text-red-600" },
              ].map((s) => (
                <div key={s.label} className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
                  <div className={`font-bold text-sm ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Amount (GHS) <span className="text-red-500">*</span></label>
                <input
                  type="number" min="0.01" step="0.01" max={payingFee.balance}
                  value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={`Max: GHS ${payingFee.balance}`} autoFocus
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Note <span className="text-slate-400">(optional)</span></label>
                <input
                  type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)}
                  placeholder="e.g. Cash, mobile money, bank transfer..."
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4 text-xs text-blue-600 flex items-center gap-2">
              🧾 A receipt PDF will be downloaded automatically after confirming.
            </div>
            <div className="flex gap-3">
              <Btn variant="primary" onClick={submitPayment} disabled={paying} className="flex-1 justify-center py-2.5">
                {paying ? "Saving…" : "Confirm & Download Receipt"}
              </Btn>
              <Btn variant="outline" onClick={() => { setPayingFee(null); setPayAmount(""); setPayNote(""); }} className="flex-1 justify-center py-2.5">
                Cancel
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Arrears modal ── */}
      {arrearsFee && (
        <Modal onClose={() => { setArrearsFee(null); setArrearsAmount(""); }}>
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Update Arrears</h2>
                <p className="text-sm text-slate-500">{arrearsFee.student_name}</p>
              </div>
              <button onClick={() => { setArrearsFee(null); setArrearsAmount(""); }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="mb-5">
              <label className="text-xs font-medium text-slate-600 block mb-1">Arrears Amount (GHS)</label>
              <input
                type="number" min="0" step="0.01" value={arrearsAmount}
                onChange={(e) => setArrearsAmount(e.target.value)} placeholder="0.00" autoFocus
                className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div className="flex gap-3">
              <Btn variant="warning" onClick={submitArrears} disabled={savingArrears} className="flex-1 justify-center py-2.5">
                {savingArrears ? "Saving…" : "Update Arrears"}
              </Btn>
              <Btn variant="outline" onClick={() => { setArrearsFee(null); setArrearsAmount(""); }} className="flex-1 justify-center py-2.5">
                Cancel
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Payment History modal ── */}
      {historyFee && (
        <Modal onClose={() => setHistoryFee(null)}>
          <div className="p-6 max-w-md w-full">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Payment History</h2>
                <p className="text-sm text-slate-500">{historyFee.student_name}</p>
              </div>
              <button onClick={() => setHistoryFee(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { label: "Total Due", value: `GHS ${Number(historyFee.total_amount).toLocaleString()}`, color: "text-slate-700" },
                { label: "Paid",      value: `GHS ${Number(historyFee.paid).toLocaleString()}`,         color: "text-emerald-600" },
                { label: "Balance",   value: `GHS ${Number(historyFee.balance).toLocaleString()}`,      color: Number(historyFee.balance) > 0 ? "text-red-600" : "text-emerald-600" },
              ].map((s) => (
                <div key={s.label} className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
                  <div className={`font-bold text-sm ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {loadingHistory && <div className="text-center py-8 text-slate-400 text-sm">Loading transactions...</div>}

            {!loadingHistory && transactions.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <div className="text-3xl mb-2">🧾</div>
                <p className="text-sm">No payment records found.</p>
                <p className="text-xs mt-1 text-slate-300">Payments recorded going forward will appear here.</p>
              </div>
            )}

            {!loadingHistory && transactions.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {transactions.map((t) => (
                  <div key={t.id} className="flex items-start justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></span>
                        <span className="text-xs text-slate-500">{t.date}</span>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs text-slate-400">{t.time}</span>
                      </div>
                      {t.note && <p className="text-xs text-slate-500 mt-1 italic truncate">"{t.note}"</p>}
                      <p className="text-xs text-slate-400 mt-0.5">by {t.recorded_by}</p>
                    </div>
                    <div className="ml-3 flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-600">+ GHS {Number(t.amount).toLocaleString()}</span>
                      <button
                        onClick={() => downloadReceiptFromHistory(t, historyFee.admission_number)}
                        className="text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2"
                      >
                        Receipt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Btn variant="outline" onClick={() => setHistoryFee(null)} className="w-full justify-center mt-4 py-2">Close</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Fees;
