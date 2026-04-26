import { useEffect, useState } from "react";
import { getDashboard } from "../services/dashboardService";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import {
  FaUserGraduate,
  FaChalkboardTeacher,
  FaSchool,
  FaClipboardCheck,
  FaMoneyBillWave,
  FaCalendarCheck,
  FaChartLine,
  FaExclamationTriangle,
  FaArrowRight,
  FaSync,
  FaGraduationCap,
  FaUserCheck,
  FaBell,
  FaPlus,
} from "react-icons/fa";

// ── Helpers ────────────────────────────────────────────────────────────────────

const ghs = (n) =>
  `GHS ${Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 0 })}`;

const rateColor = (pct) =>
  pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-500";

const rateText = (pct) =>
  pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-500" : "text-red-500";

const rateBadge = (pct) =>
  pct >= 80
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : pct >= 50
    ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
    : "bg-red-50 text-red-600 ring-1 ring-red-200";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const Skeleton = ({ className = "" }) => (
  <div className={`animate-pulse bg-slate-100 rounded-2xl ${className}`} />
);

const KpiCard = ({
  label, value, sub, icon, iconBg, accent, onClick, index = 0, badge,
}) => (
  <div
    onClick={onClick}
    style={{ animationDelay: `${index * 60}ms` }}
    className={`
      group relative bg-white rounded-2xl p-5
      border border-slate-100 shadow-sm
      transition-all duration-200 animate-fade-in
      ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]" : ""}
    `}
  >
    <div className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl ${accent}`} />

    <div className="flex items-start justify-between gap-3 pt-1">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 leading-none">
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-black text-slate-800 leading-none tracking-tight tabular-nums">
            {value}
          </p>
          {badge && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.style}`}>
              {badge.text}
            </span>
          )}
        </div>
        {sub && (
          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{sub}</p>
        )}
      </div>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
    </div>

    {onClick && (
      <div className="mt-4 flex items-center gap-1.5 text-[10px] font-semibold text-slate-300 group-hover:text-blue-500 transition-colors">
        <span>View all</span>
        <FaArrowRight className="text-[8px] group-hover:translate-x-0.5 transition-transform" />
      </div>
    )}
  </div>
);

const SectionLabel = ({ children }) => (
  <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em] mb-3">
    {children}
  </h2>
);

const ProgressBar = ({ value, className = "" }) => (
  <div className={`w-full bg-slate-100 rounded-full h-1.5 overflow-hidden ${className}`}>
    <div
      className={`h-1.5 rounded-full transition-all duration-700 ease-out ${rateColor(value)}`}
      style={{ width: `${Math.min(value, 100)}%` }}
    />
  </div>
);

const StatusPill = ({ label, bg, text, dot }) => (
  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold ${bg} ${text}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
    {label}
  </span>
);

const QuickAction = ({ label, sub, path, color, icon, index }) => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(path)}
      style={{ animationDelay: `${index * 50}ms` }}
      className={`
        group flex items-center gap-3 bg-white border border-slate-100
        rounded-2xl p-4 text-left shadow-sm w-full
        hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]
        transition-all duration-200 animate-fade-in
      `}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 leading-tight">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <FaArrowRight className="text-slate-200 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all text-[10px] flex-shrink-0" />
    </button>
  );
};

const AlertBanner = ({ type = "warning", children }) => {
  const styles = {
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    danger:  "bg-red-50 border-red-200 text-red-700",
    info:    "bg-blue-50 border-blue-200 text-blue-800",
  };
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs font-medium ${styles[type]}`}>
      <FaBell className="mt-0.5 flex-shrink-0 text-sm" />
      <span>{children}</span>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats]             = useState(null);
  const [feeStats, setFeeStats]       = useState(null);
  const [attStats, setAttStats]       = useState(null);
  const [activeUsers, setActiveUsers] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [refreshing, setRefreshing]   = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => { loadAll(); }, []);

  const loadAll = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [dashRes, feeRes, attRes, activeRes] = await Promise.allSettled([
        getDashboard(),
        API.get("/accounts/dashboard/"),
        API.get(`/attendance/?date=${today}`),
        API.get("/accounts/active-users/"),
      ]);

      if (dashRes.status === "fulfilled") setStats(dashRes.value);
      if (feeRes.status  === "fulfilled") setFeeStats(feeRes.value.data);
      if (attRes.status  === "fulfilled") {
        const records = attRes.value.data.results || attRes.value.data;
        const present = records.filter(
          (r) => r.status === "present" || r.status === "late"
        ).length;
        setAttStats({ present, total: records.length });
      }
      if (activeRes.status === "fulfilled") {
        setActiveUsers(activeRes.value.data.active_users);
      }
      setLastRefreshed(new Date());
    } catch {
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const collectionRate  = feeStats?.collection_rate ?? 0;
  const attPercent =
    attStats?.total > 0
      ? Math.round((attStats.present / attStats.total) * 100)
      : null;

  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const refreshedStr = lastRefreshed
    ? lastRefreshed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Alerts
  const alerts = [];
  if (feeStats && collectionRate < 50)
    alerts.push({ type: "danger", msg: `Fee collection is low at ${collectionRate}% — follow up on outstanding balances.` });
  if (stats?.pending_admissions > 0)
    alerts.push({ type: "warning", msg: `${stats.pending_admissions} admission${stats.pending_admissions > 1 ? "s" : ""} pending review.` });
  if (attPercent !== null && attPercent < 70)
    alerts.push({ type: "warning", msg: `Today's attendance is ${attPercent}% — below the expected threshold.` });

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
        <Skeleton className="h-52" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex items-start justify-center">
        <div className="w-full max-w-md bg-white rounded-2xl border border-red-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <FaExclamationTriangle className="text-red-500" />
            </div>
            <div>
              <p className="font-bold text-slate-800">Something went wrong</p>
              <p className="text-sm text-slate-400">{error}</p>
            </div>
          </div>
          <button
            onClick={() => loadAll()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors"
          >
            <FaSync className="text-xs" /> Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-7">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <FaGraduationCap className="text-white text-xs" />
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-900 leading-none">
                  Top Ridge School
                </h1>
                <p className="text-[10px] text-slate-400 font-medium tracking-wide mt-0.5">
                  {greeting()} · {dateStr}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {refreshedStr && (
              <span className="text-[10px] text-slate-300 hidden sm:block">
                Updated {refreshedStr}
              </span>
            )}
            <button
              onClick={() => loadAll(true)}
              disabled={refreshing}
              className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-600 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm transition-colors disabled:opacity-40"
            >
              <FaSync className={`text-[10px] ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Alerts ── */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <AlertBanner key={i} type={a.type}>{a.msg}</AlertBanner>
            ))}
          </div>
        )}

        {/* ── Section 1: School Overview ── */}
        <section>
          <SectionLabel>School overview</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              index={0}
              label="Students"
              value={stats?.total_students ?? 0}
              icon={<FaUserGraduate className="text-blue-500" />}
              iconBg="bg-blue-50"
              accent="bg-blue-500"
              onClick={() => navigate("/admin/students")}
            />
            <KpiCard
              index={1}
              label="Teachers"
              value={stats?.total_teachers ?? 0}
              icon={<FaChalkboardTeacher className="text-emerald-500" />}
              iconBg="bg-emerald-50"
              accent="bg-emerald-500"
              onClick={() => navigate("/admin/teachers")}
            />
            <KpiCard
              index={2}
              label="Classes"
              value={stats?.total_classes ?? 0}
              icon={<FaSchool className="text-violet-500" />}
              iconBg="bg-violet-50"
              accent="bg-violet-500"
              onClick={() => navigate("/admin/classes")}
            />
            <KpiCard
              index={3}
              label="Pending Admissions"
              value={stats?.pending_admissions ?? 0}
              icon={<FaClipboardCheck className="text-amber-500" />}
              iconBg="bg-amber-50"
              accent="bg-amber-400"
              sub={`${stats?.approved_admissions ?? 0} approved this year`}
              badge={
                stats?.pending_admissions > 0
                  ? { text: "Action needed", style: "bg-amber-100 text-amber-700" }
                  : null
              }
              onClick={() => navigate("/admin/admissions")}
            />
          </div>
        </section>

        {/* ── Section 2: Finance & Attendance ── */}
        <section>
          <SectionLabel>Finance &amp; attendance</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard
              index={0}
              label="Fees Collected"
              value={feeStats ? ghs(feeStats.total_paid) : "—"}
              icon={<FaMoneyBillWave className="text-emerald-500" />}
              iconBg="bg-emerald-50"
              accent="bg-emerald-500"
              sub={feeStats ? `${ghs(feeStats.total_balance)} outstanding` : ""}
              onClick={() => navigate("/admin/accounts")}
            />
            <KpiCard
              index={1}
              label="Collection Rate"
              value={feeStats ? `${collectionRate}%` : "—"}
              icon={<FaChartLine className="text-indigo-500" />}
              iconBg="bg-indigo-50"
              accent="bg-indigo-500"
              sub={
                feeStats
                  ? `${feeStats.fully_paid} paid · ${feeStats.partial} partial · ${feeStats.unpaid} unpaid`
                  : ""
              }
              badge={
                feeStats
                  ? {
                      text: collectionRate >= 80 ? "On track" : collectionRate >= 50 ? "Average" : "Low",
                      style:
                        collectionRate >= 80
                          ? "bg-emerald-100 text-emerald-700"
                          : collectionRate >= 50
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700",
                    }
                  : null
              }
              onClick={() => navigate("/admin/fees")}
            />
            <KpiCard
              index={2}
              label="Today's Attendance"
              value={attStats ? `${attStats.present}/${attStats.total}` : "—"}
              icon={<FaCalendarCheck className="text-orange-500" />}
              iconBg="bg-orange-50"
              accent="bg-orange-400"
              sub={
                attPercent !== null ? `${attPercent}% present today` : "No records yet"
              }
              badge={
                attPercent !== null
                  ? {
                      text: attPercent >= 80 ? "Good" : attPercent >= 60 ? "Fair" : "Low",
                      style:
                        attPercent >= 80
                          ? "bg-emerald-100 text-emerald-700"
                          : attPercent >= 60
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700",
                    }
                  : null
              }
              onClick={() => navigate("/admin/attendance")}
            />
          </div>
        </section>

        {/* ── Section 3: System Activity ── */}
        <section>
          <SectionLabel>System activity</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              index={0}
              label="Active Users"
              value={activeUsers ?? "—"}
              icon={<FaUserCheck className="text-teal-500" />}
              iconBg="bg-teal-50"
              accent="bg-teal-500"
              sub="Staff currently logged in"
            />
          </div>
        </section>

        {/* ── Section 4: Fee Collection Progress ── */}
        {feeStats && (
          <section>
            <SectionLabel>Fee collection progress</SectionLabel>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-bold text-slate-700">Overall collection</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {ghs(feeStats.total_paid)} of {ghs(feeStats.total_billed)}
                    </span>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full ${rateBadge(collectionRate)}`}>
                    {collectionRate}%
                  </span>
                </div>
                <ProgressBar value={collectionRate} />
              </div>

              {feeStats.term_breakdown?.length > 0 && (
                <div className="grid grid-cols-3 gap-4 pt-5 border-t border-slate-100">
                  {feeStats.term_breakdown.map((t) => {
                    const pct = t.billed > 0 ? Math.round((t.paid / t.billed) * 100) : 0;
                    return (
                      <div key={t.term} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-600">{t.label}</span>
                          <span className={`text-[11px] font-bold ${rateText(pct)}`}>{pct}%</span>
                        </div>
                        <ProgressBar value={pct} />
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>{ghs(t.paid)}</span>
                          <span className="text-slate-300">{ghs(t.billed)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
                <StatusPill label={`${feeStats.fully_paid} Fully paid`}  bg="bg-emerald-50" text="text-emerald-700" dot="bg-emerald-500" />
                <StatusPill label={`${feeStats.partial} Partial`}        bg="bg-amber-50"   text="text-amber-700"   dot="bg-amber-400"  />
                <StatusPill label={`${feeStats.unpaid} Unpaid`}          bg="bg-red-50"     text="text-red-600"     dot="bg-red-500"    />
              </div>
            </div>
          </section>
        )}

        {/* ── Section 5: Quick Actions ── */}
        <section>
          <SectionLabel>Quick actions</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <QuickAction
              index={0}
              label="New admission"
              sub="Register a student"
              path="/admin/admissions"
              color="bg-blue-50 text-blue-500"
              icon={<FaPlus />}
            />
            <QuickAction
              index={1}
              label="Enter results"
              sub="Academic records"
              path="/admin/results"
              color="bg-violet-50 text-violet-500"
              icon={<FaClipboardCheck />}
            />
            <QuickAction
              index={2}
              label="Mark attendance"
              sub="Today's register"
              path="/admin/attendance"
              color="bg-orange-50 text-orange-500"
              icon={<FaCalendarCheck />}
            />
            <QuickAction
              index={3}
              label="Record payment"
              sub="Fee collection"
              path="/admin/fees"
              color="bg-emerald-50 text-emerald-500"
              icon={<FaMoneyBillWave />}
            />
          </div>
        </section>

      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.25s ease both;
          opacity: 0;
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
