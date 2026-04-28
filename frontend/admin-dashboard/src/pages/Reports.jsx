import { useEffect, useState } from "react";
import API from "../services/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERMS = [
  { value: "term1", label: "Term 1" },
  { value: "term2", label: "Term 2" },
  { value: "term3", label: "Term 3" },
];

// Grade colours — covers both numeric (Basic 7–9) and letter (Basic 1–6) systems
const GRADE_COLORS = {
  // Basic 1–6 letter grades
  "A":  "bg-green-100   text-green-800",
  "B1": "bg-emerald-100 text-emerald-800",
  "B2": "bg-teal-100    text-teal-800",
  "C1": "bg-blue-100    text-blue-800",
  "C2": "bg-cyan-100    text-cyan-800",
  "D1": "bg-yellow-100  text-yellow-800",
  "D2": "bg-orange-100  text-orange-700",
  "E1": "bg-red-100     text-red-700",
  "E2": "bg-red-200     text-red-800",
  // Basic 7–9 numeric grades
  "1":  "bg-green-100   text-green-800",
  "2":  "bg-emerald-100 text-emerald-800",
  "3":  "bg-teal-100    text-teal-800",
  "4":  "bg-blue-100    text-blue-800",
  "5":  "bg-yellow-100  text-yellow-800",
  "6":  "bg-orange-100  text-orange-700",
  "7":  "bg-red-100     text-red-700",
  "9":  "bg-red-200     text-red-800",
};

// Grading scales — labels match exactly what appears on the printed report cards
const GRADE_SCALE_B79 = [
  { range: "90 – 100", grade: "1", label: "EXCELLENT"    },
  { range: "80 – 89",  grade: "2", label: "VERY GOOD"    },
  { range: "70 – 79",  grade: "3", label: "GOOD"         },
  { range: "60 – 69",  grade: "4", label: "HIGH AVERAGE" },
  { range: "55 – 59",  grade: "5", label: "AVERAGE"      },
  { range: "50 – 54",  grade: "6", label: "LOW AVERAGE"  },
  { range: "45 – 49",  grade: "7", label: "LOW"          },
  { range: "40 – 44",  grade: "6", label: "LOWER"        },
  { range: "0 – 39",   grade: "9", label: "LOWEST"       },
];

const GRADE_SCALE_B16 = [
  { range: "90 – 100", grade: "A",  label: "EXCELLENT"    },
  { range: "80 – 89",  grade: "B1", label: "VERY GOOD"    },
  { range: "70 – 79",  grade: "B2", label: "GOOD"         },
  { range: "60 – 69",  grade: "C1", label: "HIGH AVERAGE" },
  { range: "55 – 59",  grade: "C2", label: "AVERAGE"      },
  { range: "50 – 54",  grade: "D1", label: "LOW AVERAGE"  },
  { range: "45 – 49",  grade: "D2", label: "LOW"          },
  { range: "40 – 44",  grade: "E1", label: "LOWER"        },
  { range: "0 – 39",   grade: "E2", label: "LOWEST"       },
];

const CONDUCT_OPTIONS = ["Excellent", "Very Good", "Good", "Fair", "Poor"];

const ATTITUDE_OPTIONS = [
  "Respectful and Hardworking",
  "Respectful and Kind",
  "Hardworking",
  "Cooperative",
  "Needs Improvement",
];

const getStudentName = (s) =>
  s?.student_name ||
  (s?.first_name ? `${s.first_name} ${s.last_name || ""}`.trim() : null) ||
  s?.admission_number ||
  "Unknown";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Reports = () => {
  const [classes, setClasses]                 = useState([]);
  const [students, setStudents]               = useState([]);
  const [selectedClass, setSelectedClass]     = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedTerm, setSelectedTerm]       = useState("term1");
  const [report, setReport]                   = useState(null);
  const [loading, setLoading]                 = useState(false);
  const [downloading, setDownloading]         = useState(false);
  const [error, setError]                     = useState("");

  const [remarks, setRemarks] = useState({
    conduct:         "",
    attitude:        "",
    interest:        "",
    teacher_remark:  "",
    promoted_to:     "",
    vacation_date:   "",
    resumption_date: "",
  });
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [remarksSaved, setRemarksSaved]   = useState(false);

  useEffect(() => { fetchClasses(); }, []);

  useEffect(() => {
    if (selectedClass) fetchStudents(selectedClass);
    else { setStudents([]); setSelectedStudent(""); setReport(null); }
  }, [selectedClass]);

  useEffect(() => {
    if (selectedStudent && selectedTerm) fetchReport();
    else setReport(null);
  }, [selectedStudent, selectedTerm]);

  const fetchClasses = async () => {
    try {
      const res = await API.get("/classes/");
      setClasses(res.data.results || res.data);
    } catch {
      setError("Failed to load classes.");
    }
  };

  const fetchStudents = async (classId) => {
    try {
      const res = await API.get(`/students/?school_class=${classId}`);
      setStudents(res.data.results || res.data);
    } catch {
      setError("Failed to load students.");
    }
  };

  const fetchReport = async () => {
    setLoading(true); setError(""); setReport(null); setRemarksSaved(false);
    try {
      const res = await API.get(`/report/student/${selectedStudent}/?term=${selectedTerm}`);
      setReport(res.data);
      setRemarks({
        conduct:         res.data.conduct         || "",
        attitude:        res.data.attitude        || "",
        interest:        res.data.interest        || "",
        teacher_remark:  res.data.teacher_remark  || "",
        promoted_to:     res.data.promoted_to     || "",
        vacation_date:   res.data.vacation_date   || "",
        resumption_date: res.data.resumption_date || "",
      });
    } catch (err) {
      setError(
        err.response?.status === 404
          ? "No report found for this student and term."
          : "Failed to load report."
      );
    } finally {
      setLoading(false);
    }
  };

  const saveRemarks = async () => {
    setSavingRemarks(true); setRemarksSaved(false); setError("");
    try {
      await API.patch(`/report/student/${selectedStudent}/`, {
        term:            selectedTerm,
        conduct:         remarks.conduct,
        attitude:        remarks.attitude,
        interest:        remarks.interest,
        teacher_remark:  remarks.teacher_remark,
        promoted_to:     remarks.promoted_to,
        vacation_date:   remarks.vacation_date   || "",
        resumption_date: remarks.resumption_date || "",
      });
      setRemarksSaved(true);
      // Refresh so the preview reflects saved data
      const res = await API.get(`/report/student/${selectedStudent}/?term=${selectedTerm}`);
      setReport(res.data);
    } catch {
      setError("Failed to save remarks.");
    } finally {
      setSavingRemarks(false);
    }
  };

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await API.get(
        `/report/student/${selectedStudent}/pdf/?term=${selectedTerm}`,
        { responseType: "blob" }
      );
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href  = url;
      link.setAttribute("download", `report_${selectedStudent}_${selectedTerm}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const setRemark = (key, value) => {
    setRemarks((prev) => ({ ...prev, [key]: value }));
    setRemarksSaved(false);
  };

  const level      = report?.level || "basic_7_9";
  const gradeScale = level === "basic_7_9" ? GRADE_SCALE_B79 : GRADE_SCALE_B16;

  // Subject options for the Interest dropdown
  const subjectOptions = report?.subjects?.map((s) => s.subject) || [];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Student Reports</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded">
          {error}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select
          value={selectedClass}
          onChange={(e) => { setSelectedClass(e.target.value); setReport(null); }}
          className="border p-2 rounded min-w-[150px]"
        >
          <option value="">Select Class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={selectedStudent}
          onChange={(e) => setSelectedStudent(e.target.value)}
          disabled={!students.length}
          className="border p-2 rounded min-w-[180px] disabled:opacity-50"
        >
          <option value="">Select Student</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{getStudentName(s)}</option>
          ))}
        </select>

        <select
          value={selectedTerm}
          onChange={(e) => setSelectedTerm(e.target.value)}
          className="border p-2 rounded"
        >
          {TERMS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {report && (
          <button
            onClick={downloadPDF}
            disabled={downloading}
            className="ml-auto bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            {downloading ? "Generating…" : "⬇ Download PDF"}
          </button>
        )}
      </div>

      {loading && <p className="text-gray-500">Loading report…</p>}

      {report && (
        <div className="bg-white rounded-lg shadow border max-w-4xl">

          {/* ── Header ── */}
          <div className="bg-green-800 text-white p-6 rounded-t-lg flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold tracking-wide">
                {report.school_name || "TOP RIDGE SCHOOL"}
              </h2>
              <p className="text-green-200 text-xs mt-0.5 tracking-widest">
                {report.school_motto || "CENTRE OF DISTINCTION"}
              </p>
              <p className="text-green-300 text-xs mt-1">
                {report.school_address}
              </p>
              <div className="mt-3 space-y-0.5">
                <p className="text-green-100 text-sm font-semibold">{report.student}</p>
                <p className="text-green-200 text-xs">Admission No: {report.admission_number || "—"}</p>
                <p className="text-green-200 text-xs">Class: {report.class || "—"}</p>
                <p className="text-green-200 text-xs">
                  Term: {TERMS.find((t) => t.value === report.term)?.label || report.term}
                </p>
                {report.number_on_roll && (
                  <p className="text-green-200 text-xs">Number on Roll: {report.number_on_roll}</p>
                )}
              </div>
            </div>
            <div>
              {report.photo ? (
                <img
                  src={report.photo}
                  alt="student"
                  className="w-20 h-20 rounded-lg border-2 border-white object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg border-2 border-white bg-green-700 flex items-center justify-center text-3xl font-bold">
                  {report.student?.[0] || "?"}
                </div>
              )}
            </div>
          </div>

          {/* ── Stats Row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border-b">
            {[
              { label: "Total Score",   value: report.total_score   ?? "—" },
              { label: "Average Score", value: report.average_score ?? "—" },
              {
                label: "Position",
                value: report.show_position
                  ? (report.position_formatted
                      ? `${report.position_formatted} / ${report.out_of}`
                      : "—")
                  : "N/A",
              },
              { label: "Overall Grade", value: report.overall_grade ?? "—" },
            ].map((stat) => (
              <div key={stat.label} className="p-4 text-center border-r last:border-r-0">
                <div
                  className={`text-2xl font-bold ${
                    stat.label === "Overall Grade"
                      ? (GRADE_COLORS[stat.value] || "text-green-700")
                      : "text-green-700"
                  }`}
                >
                  {stat.value}
                </div>
                <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* ── Subject Table ── */}
          <div className="p-6">
            <h3 className="font-semibold text-gray-700 mb-3">Subject Results</h3>
            <div className="overflow-x-auto">
              <table className="w-full border rounded text-sm">
                <thead className="bg-green-50">
                  <tr>
                    <th className="p-2 text-left">SUBJECT</th>
                    {/* Column order matches the printed report card exactly */}
                    <th className="p-2 text-center text-green-800">
                      CLASS SC.<br /><span className="font-normal text-xs">40%</span>
                    </th>
                    <th className="p-2 text-center text-green-800">
                      READING &amp; RE-OPEN<br /><span className="font-normal text-xs">20%</span>
                    </th>
                    <th className="p-2 text-center text-green-800">
                      EXAMS SCORE<br /><span className="font-normal text-xs">40%</span>
                    </th>
                    <th className="p-2 text-center font-bold text-green-900">
                      TOTAL<br /><span className="font-normal text-xs">100%</span>
                    </th>
                    {report.show_position && (
                      <th className="p-2 text-center">POSITION</th>
                    )}
                    <th className="p-2 text-center">GRADE</th>
                    <th className="p-2 text-center">REMARK</th>
                  </tr>
                </thead>
                <tbody>
                  {report.subjects?.map((sub, i) => {
                    const badgeCls = GRADE_COLORS[sub.grade] || "bg-gray-100 text-gray-700";
                    return (
                      <tr
                        key={i}
                        className={`border-t ${i % 2 === 0 ? "" : "bg-gray-50"}`}
                      >
                        <td className="p-2 font-medium">{sub.subject}</td>
                        <td className="p-2 text-center">{sub.class_score ?? "—"}</td>
                        <td className="p-2 text-center">{sub.reopen      ?? "—"}</td>
                        <td className="p-2 text-center">{sub.exams       ?? "—"}</td>
                        <td className="p-2 text-center font-bold text-green-800">
                          {sub.score}
                        </td>
                        {report.show_position && (
                          <td className="p-2 text-center font-semibold">
                            {sub.subject_position ?? "—"}
                          </td>
                        )}
                        <td className="p-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${badgeCls}`}>
                            {sub.grade}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs ${badgeCls}`}>
                            {sub.remark || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Grading scale footer */}
            <div className="mt-4 p-3 bg-green-50 rounded border border-green-100 text-xs text-gray-600">
              <p className="font-semibold text-green-800 mb-2">GRADING KEY</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {gradeScale.map((g) => (
                  <span key={g.grade}>
                    {g.range}: <b>{g.grade} – {g.label}</b>
                  </span>
                ))}
              </div>
            </div>

            {/* Term dates */}
            {(report.vacation_date || report.resumption_date) && (
              <div className="mt-3 flex gap-6 text-xs text-gray-500">
                {report.vacation_date && (
                  <span>
                    <span className="font-semibold text-gray-600">School Vacates On:</span>{" "}
                    {report.vacation_date}
                  </span>
                )}
                {report.resumption_date && (
                  <span>
                    <span className="font-semibold text-gray-600">School Re-opens On:</span>{" "}
                    {report.resumption_date}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Attendance + Remarks ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 px-6 pb-6">

            {/* Attendance */}
            <div className="border rounded p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Attendance</h3>
              {report.attendance_total > 0 ? (
                <>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Days Present</span>
                    <span className="font-semibold">
                      {report.attendance} / {report.attendance_total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        report.attendance_percent >= 80 ? "bg-green-500" :
                        report.attendance_percent >= 60 ? "bg-yellow-400" : "bg-red-500"
                      }`}
                      style={{ width: `${report.attendance_percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    {report.attendance_percent}% attendance
                  </p>
                </>
              ) : (
                <p className="text-gray-400 text-sm">No attendance data recorded.</p>
              )}
            </div>

            {/* Teacher's Remarks */}
            <div className="border rounded p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Teacher's Remarks</h3>
              <div className="space-y-3">

                {/* Conduct */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Conduct</label>
                  <select
                    value={remarks.conduct}
                    onChange={(e) => setRemark("conduct", e.target.value)}
                    className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="">— Select —</option>
                    {CONDUCT_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                {/* Attitude */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Attitude</label>
                  <select
                    value={remarks.attitude}
                    onChange={(e) => setRemark("attitude", e.target.value)}
                    className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="">— Select —</option>
                    {ATTITUDE_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                {/* Interest */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Interest{" "}
                    <span className="text-gray-400">(subject student shows most interest in)</span>
                  </label>
                  <select
                    value={remarks.interest}
                    onChange={(e) => setRemark("interest", e.target.value)}
                    className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="">— Select Subject —</option>
                    {subjectOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Teacher's overall remark */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Class Teacher Remarks</label>
                  <textarea
                    value={remarks.teacher_remark}
                    onChange={(e) => setRemark("teacher_remark", e.target.value)}
                    rows={2}
                    placeholder="e.g. VERY GOOD PERFORMANCE"
                    className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  />
                </div>

                {/* Promoted to */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Promoted To</label>
                  <input
                    type="text"
                    value={remarks.promoted_to}
                    onChange={(e) => setRemark("promoted_to", e.target.value)}
                    placeholder="e.g. Basic 4"
                    className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                {/* Term dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">School Vacates On</label>
                    <input
                      type="date"
                      value={remarks.vacation_date}
                      onChange={(e) => setRemark("vacation_date", e.target.value)}
                      className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">School Re-opens On</label>
                    <input
                      type="date"
                      value={remarks.resumption_date}
                      onChange={(e) => setRemark("resumption_date", e.target.value)}
                      className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                </div>

                {/* Save */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveRemarks}
                    disabled={savingRemarks}
                    className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded text-sm disabled:opacity-50 transition-colors"
                  >
                    {savingRemarks ? "Saving…" : "Save Remarks"}
                  </button>
                  {remarksSaved && (
                    <span className="text-green-600 text-xs font-medium">✓ Saved</span>
                  )}
                </div>

              </div>
            </div>
          </div>

        </div>
      )}

      {/* Empty states */}
      {!loading && !report && selectedStudent && !error && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-lg">No report found for this student and term.</p>
          <p className="text-sm mt-1">Make sure results have been entered for this term.</p>
        </div>
      )}
      {!selectedStudent && (
        <div className="text-center py-16 text-gray-300">
          <div className="text-5xl mb-4">🎓</div>
          <p className="text-lg">Select a class and student to view their report.</p>
        </div>
      )}
    </div>
  );
};

export default Reports;
