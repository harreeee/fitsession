"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { getCurrentUserRole } from "../../lib/checkUserRole";

type AdminRole = "admin" | "manager";
type TransactionType = "income" | "expense" | "cash_adjustment";

type ClientRow = {
  id: string;
  client_code: string | null;
  full_name: string;
  status: string | null;
  created_at: string | null;
};

type SessionPackageRow = {
  id: string;
  client_id: string;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  created_at: string | null;
};

type PurchaseRow = {
  id: string;
  client_id: string;
  plan_name: string | null;
  price: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  debt_deadline: string | null;
  purchase_type: string | null;
  status: string | null;
  created_at: string | null;
};

type BusinessTransactionRow = {
  id: string;
  transaction_type: TransactionType;
  source: string;
  title: string;
  amount: number | string | null;
  notes: string | null;
  transaction_date: string;
  created_at: string;
};

type ClientDebtSummary = {
  clientId: string;
  clientCode: string;
  clientName: string;
  planName: string;
  balanceDue: number;
  debtDeadline: string | null;
  daysLeft: number | null;
};

type LowSessionSummary = {
  clientId: string;
  clientCode: string;
  clientName: string;
  remainingSessions: number;
};

// ── Helpers ────────────────────────────────────────────────────

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "$0";
  return `$${Number(value).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "0%";
  return `${Number(value).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function getTime(value: string | null | undefined) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getLatestByDate<T extends { created_at: string | null }>(rows: T[]) {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => getTime(b.created_at) - getTime(a.created_at))[0];
}

function getDaysUntil(value: string | null) {
  if (!value) return null;
  const today = new Date();
  const deadline = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) return null;
  today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
}

function getDebtUrgency(daysLeft: number | null): "overdue" | "critical" | "warning" | "none" {
  if (daysLeft === null) return "none";
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "critical";
  if (daysLeft <= 7) return "warning";
  return "none";
}

function getDebtBadge(daysLeft: number | null) {
  const u = getDebtUrgency(daysLeft);
  if (u === "overdue" || u === "critical") return { pill: "bg-rose-500/15 text-rose-300 border-rose-500/30", dot: "bg-rose-400" };
  if (u === "warning") return { pill: "bg-amber-500/15 text-amber-300 border-amber-500/30", dot: "bg-amber-400" };
  return { pill: "bg-zinc-700/40 text-zinc-400 border-zinc-600/30", dot: "bg-zinc-500" };
}

function getDebtNoticeText(daysLeft: number | null) {
  if (daysLeft === null) return "No deadline";
  if (daysLeft < 0) return `Overdue ${Math.abs(daysLeft)}d`;
  if (daysLeft === 0) return "Due today";
  return `Due in ${daysLeft}d`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function getRoleLabel(role: AdminRole | null) {
  return role === "manager" ? "Manager" : "Admin";
}

function getSourceLabel(value: string | null | undefined) {
  if (!value) return "Manual";
  const labels: Record<string, string> = {
    package_sale: "Package Sale", membership: "Membership",
    personal_training: "Personal Training", debt_payment: "Debt Payment",
    merchandise: "Merchandise", rent: "Rent", payroll: "Payroll",
    utilities: "Utilities", marketing: "Marketing", equipment: "Equipment",
    manual: "Manual", other: "Other",
  };
  return labels[value] || value;
}

// ── Reusable components ────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub: string;
  accent: "yellow" | "emerald" | "rose" | "amber" | "sky" | "white";
}) {
  const colors = {
    yellow:  { border: "border-yellow-400/25",  bg: "bg-yellow-400/[0.08]",  text: "text-yellow-300"  },
    emerald: { border: "border-emerald-400/25", bg: "bg-emerald-400/[0.08]", text: "text-emerald-300" },
    rose:    { border: "border-rose-400/25",    bg: "bg-rose-400/[0.08]",    text: "text-rose-300"    },
    amber:   { border: "border-amber-400/25",   bg: "bg-amber-400/[0.08]",   text: "text-amber-300"   },
    sky:     { border: "border-sky-400/25",     bg: "bg-sky-400/[0.08]",     text: "text-sky-300"     },
    white:   { border: "border-white/10",       bg: "bg-white/[0.04]",       text: "text-white"       },
  };
  const c = colors[accent];
  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-5`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums md:text-4xl ${c.text}`}>{value}</p>
      <p className="mt-1.5 text-xs text-zinc-600">{sub}</p>
    </div>
  );
}

function FinCard({ label, value, sub, tone }: {
  label: string; value: string; sub: string;
  tone: "revenue" | "expense" | "cash" | "profit" | "debt" | "neutral";
}) {
  const styles: Record<string, string> = {
    revenue: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
    expense: "border-rose-400/20 bg-rose-400/[0.07] text-rose-300",
    cash:    "border-yellow-400/25 bg-yellow-400/[0.10] text-yellow-300",
    profit:  "border-sky-400/20 bg-sky-400/[0.07] text-sky-300",
    debt:    "border-amber-400/20 bg-amber-400/[0.07] text-amber-300",
    neutral: "border-white/[0.08] bg-white/[0.03] text-white",
  };
  return (
    <div className={`rounded-2xl border p-5 ${styles[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1.5 text-xs leading-5 text-zinc-600">{sub}</p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const router = useRouter();

  const [clients,      setClients]      = useState<ClientRow[]>([]);
  const [packages,     setPackages]     = useState<SessionPackageRow[]>([]);
  const [purchases,    setPurchases]    = useState<PurchaseRow[]>([]);
  const [transactions, setTransactions] = useState<BusinessTransactionRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMsg,  setCheckingMsg]  = useState("Checking admin access…");
  const [currentRole,  setCurrentRole]  = useState<AdminRole | null>(null);

  const isAdmin   = currentRole === "admin";
  const isManager = currentRole === "manager";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function fetchDashboardData() {
    setLoading(true);
    const [cr, pr, pur, trx] = await Promise.all([
      supabase.from("clients").select("id, client_code, full_name, status, created_at").order("created_at", { ascending: false }),
      supabase.from("session_packages").select("id, client_id, total_sessions, used_sessions, remaining_sessions, status, created_at").order("created_at", { ascending: false }),
      supabase.from("client_purchases").select("id, client_id, plan_name, price, amount_paid, balance_due, debt_deadline, purchase_type, status, created_at").order("created_at", { ascending: false }),
      supabase.from("business_transactions").select("id, transaction_type, source, title, amount, notes, transaction_date, created_at").order("transaction_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (cr.error)  { alert(cr.error.message);  setLoading(false); return; }
    if (pr.error)  { alert(pr.error.message);  setLoading(false); return; }
    if (pur.error) { alert(pur.error.message); setLoading(false); return; }
    if (trx.error) { alert(trx.error.message); setLoading(false); return; }
    setClients((cr.data   || []) as ClientRow[]);
    setPackages((pr.data   || []) as SessionPackageRow[]);
    setPurchases((pur.data || []) as PurchaseRow[]);
    setTransactions((trx.data || []) as BusinessTransactionRow[]);
    setLoading(false);
  }

  const dash = useMemo(() => {
    const activeClients = clients.filter((c) => String(c.status || "").toLowerCase() === "active").length;

    const totalSessionsLeft = clients.reduce((sum, c) => {
      const latest = getLatestByDate(packages.filter((p) => p.client_id === c.id));
      const total = toNumber(latest?.total_sessions) ?? 0;
      const used  = toNumber(latest?.used_sessions)  ?? 0;
      const saved = toNumber(latest?.remaining_sessions);
      return sum + (saved !== null ? saved : Math.max(total - used, 0));
    }, 0);

    const grossPackageValue = purchases.reduce((s, p) => s + (toNumber(p.price) ?? 0), 0);
    const income      = transactions.filter((t) => t.transaction_type === "income");
    const expenses    = transactions.filter((t) => t.transaction_type === "expense");
    const adjustments = transactions.filter((t) => t.transaction_type === "cash_adjustment");

    const totalRevenue     = income.reduce((s, t) => s + (toNumber(t.amount) ?? 0), 0);
    const totalExpenses    = expenses.reduce((s, t) => s + (toNumber(t.amount) ?? 0), 0);
    const totalAdjustments = adjustments.reduce((s, t) => s + (toNumber(t.amount) ?? 0), 0);
    const cashOnHand       = totalRevenue + totalAdjustments - totalExpenses;
    const netProfit        = cashOnHand;
    const averagePayment   = income.length > 0 ? totalRevenue / income.length : 0;
    const collectionRate   = grossPackageValue > 0 ? Math.min(100, (totalRevenue / grossPackageValue) * 100) : 0;

    const totalDebtFromPurchases = purchases.reduce((s, p) => {
      const saved = toNumber(p.balance_due);
      const price = toNumber(p.price);
      const paid  = toNumber(p.amount_paid);
      if (saved !== null) return s + Math.max(saved, 0);
      if (price !== null && paid !== null) return s + Math.max(price - paid, 0);
      return s;
    }, 0);

    const debtRows: ClientDebtSummary[] = clients.map((c) => {
      const cp = purchases.filter((p) => p.client_id === c.id);
      const purchase = cp.find((r) => Number(r.balance_due || 0) > 0) || getLatestByDate(cp);
      if (!purchase) return null;
      const price = toNumber(purchase.price);
      const paid  = toNumber(purchase.amount_paid);
      const saved = toNumber(purchase.balance_due);
      const balanceDue = saved !== null ? saved : (price !== null && paid !== null ? Math.max(price - paid, 0) : 0);
      if (balanceDue <= 0) return null;
      return { clientId: c.id, clientCode: c.client_code || "-", clientName: c.full_name, planName: purchase.plan_name || "-", balanceDue, debtDeadline: purchase.debt_deadline, daysLeft: getDaysUntil(purchase.debt_deadline) };
    }).filter((r): r is ClientDebtSummary => Boolean(r)).sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

    const lowSessionRows: LowSessionSummary[] = clients.map((c) => {
      const latest = getLatestByDate(packages.filter((p) => p.client_id === c.id));
      if (!latest) return null;
      const total     = toNumber(latest.total_sessions) ?? 0;
      const used      = toNumber(latest.used_sessions)  ?? 0;
      const saved     = toNumber(latest.remaining_sessions);
      const remaining = saved !== null ? saved : Math.max(total - used, 0);
      if (remaining <= 0 || remaining > 10) return null;
      return { clientId: c.id, clientCode: c.client_code || "-", clientName: c.full_name, remainingSessions: remaining };
    }).filter((r): r is LowSessionSummary => Boolean(r)).sort((a, b) => a.remainingSessions - b.remainingSessions);

    const totalDebt        = debtRows.reduce((s, r) => s + r.balanceDue, 0);
    const overdueDebt      = debtRows.filter((r) => r.daysLeft !== null && r.daysLeft < 0);
    const dueTodayDebt     = debtRows.filter((r) => r.daysLeft === 0);
    const dueSoonDebt      = debtRows.filter((r) => r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 7);
    const noDeadlineDebt   = debtRows.filter((r) => r.daysLeft === null);
    const overdueDebtAmount  = overdueDebt.reduce((s, r) => s + r.balanceDue, 0);
    const dueSoonDebtAmount  = dueSoonDebt.reduce((s, r) => s + r.balanceDue, 0);

    const recentIncome  = [...income].sort((a, b) => getTime(b.transaction_date || b.created_at) - getTime(a.transaction_date || a.created_at)).slice(0, 5);
    const recentExpense = [...expenses].sort((a, b) => getTime(b.transaction_date || b.created_at) - getTime(a.transaction_date || a.created_at)).slice(0, 5);

    return {
      activeClients, totalSessionsLeft, grossPackageValue,
      totalRevenue, totalExpenses, totalAdjustments, cashOnHand, netProfit,
      averagePayment, collectionRate, totalDebt, totalDebtFromPurchases,
      overdueDebtAmount, dueSoonDebtAmount,
      debtRows, lowSessionRows,
      overdueDebt, dueTodayDebt, dueSoonDebt, noDeadlineDebt,
      recentIncome, recentExpense,
    };
  }, [clients, packages, purchases, transactions]);

  useEffect(() => {
    async function init() {
      const { user, role } = await getCurrentUserRole();
      if (!user) { setCheckingMsg("Redirecting…"); router.push("/login"); return; }
      if (role === "admin" || role === "manager") { setCurrentRole(role); setCheckingRole(false); await fetchDashboardData(); return; }
      if (role === "trainer" || role === "nutrition_coach") { router.push("/trainer/scan"); return; }
      if (role === "client") { router.push("/client"); return; }
      await supabase.auth.signOut(); router.push("/login");
    }
    init();
  }, [router]);

  // ── Splash ──────────────────────────────────────────────────
  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-yellow-400" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">{checkingMsg}</p>
        </div>
      </main>
    );
  }

  const navActions = [
    { href: "/admin/reports",        label: "Reports",       icon: "📊", primary: true  },
    { href: "/admin/clients",        label: isManager ? "View Clients" : "Clients", icon: "👥", primary: true },
    { href: "/admin/revenue",        label: isManager ? "View Revenue" : "Revenue",  icon: "💰", primary: true },
    { href: "/history",              label: "History",       icon: "🗂️", primary: false },
    ...(isAdmin ? [
      { href: "/admin/import-clients", label: "Import",     icon: "📥", primary: false },
      { href: "/admin/trainers",       label: "Staff",      icon: "🏋️", primary: false },
    ] : []),
  ];

  return (
    <main className="min-h-screen overflow-y-auto bg-[#080808] text-white">
      <style jsx global>{`
        html, body { background: #080808; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 999px; }
        ::-webkit-scrollbar-thumb:hover { background: #facc15; }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fu  { animation: fade-up 0.4s ease both; }
        .fu1 { animation-delay: 0.05s; }
        .fu2 { animation-delay: 0.10s; }
        .fu3 { animation-delay: 0.15s; }
        .fu4 { animation-delay: 0.20s; }
        .fu5 { animation-delay: 0.25s; }
        .fu6 { animation-delay: 0.30s; }
      `}</style>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="fu sticky top-0 z-20 border-b border-white/[0.06] bg-[#080808]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-400/30 bg-yellow-400/15 text-sm font-black text-yellow-400">
              F
            </div>
            <div>
              <p className="text-sm font-bold leading-none text-white">FXA FITNESS</p>
              <p className="mt-0.5 text-[10px] uppercase leading-none tracking-widest text-zinc-600">
                {getRoleLabel(currentRole)} Dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/clients" className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold text-black transition hover:bg-yellow-300 active:scale-[0.97]">
              Client Directory
            </Link>
            <button type="button" onClick={handleLogout} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:border-white/20 hover:text-white active:scale-[0.97]">
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 md:px-6">

        {/* ── Greeting ─────────────────────────────────────── */}
        <div className="fu fu1 mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-600">{getGreeting()}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white md:text-3xl">
            {getRoleLabel(currentRole)} Overview
          </h1>
          {isManager && (
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3">
              <span className="mt-0.5 text-sm">⚠️</span>
              <p className="text-sm leading-6 text-amber-200/80">
                <strong className="text-amber-300">Manager mode:</strong> View-only for financials, imports, and staff. Basic client edits are allowed.
              </p>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════
            QUICK ACTIONS — top of page, always visible
        ══════════════════════════════════════════════════ */}
        <section className="fu fu1 mb-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-600">
            Quick Actions
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap">
            {navActions.map(({ href, label, icon, primary }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-bold transition duration-200 active:scale-[0.97] ${
                  primary
                    ? "border-yellow-400/40 bg-yellow-400/15 text-yellow-300 hover:bg-yellow-400 hover:text-black"
                    : "border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:border-yellow-400/25 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <span className="text-base">{icon}</span>
                {label}
              </Link>
            ))}
            {isManager && (
              <>
                <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-sm font-bold text-zinc-700 opacity-50 cursor-not-allowed">
                  <span className="text-base">📥</span> Import
                </div>
                <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-sm font-bold text-zinc-700 opacity-50 cursor-not-allowed">
                  <span className="text-base">🏋️</span> Staff
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Alert banners ─────────────────────────────────── */}
        {!loading && (dash.overdueDebt.length > 0 || dash.dueTodayDebt.length > 0) && (
          <section className="fu fu2 mb-6 grid gap-3 md:grid-cols-2">
            {dash.overdueDebt.length > 0 && (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/[0.10] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-lg">🚨</span>
                  <div>
                    <p className="text-sm font-bold text-rose-300">
                      {dash.overdueDebt.length} overdue payment{dash.overdueDebt.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-zinc-500">Deadlines passed — follow up now</p>
                  </div>
                </div>
                <Link href="/admin/clients" className="shrink-0 rounded-xl bg-rose-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-rose-300">
                  Review →
                </Link>
              </div>
            )}
            {dash.dueTodayDebt.length > 0 && (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.10] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-lg">⏰</span>
                  <div>
                    <p className="text-sm font-bold text-amber-300">
                      {dash.dueTodayDebt.length} payment{dash.dueTodayDebt.length !== 1 ? "s" : ""} due today
                    </p>
                    <p className="text-xs text-zinc-500">Collect before end of day</p>
                  </div>
                </div>
                <Link href="/admin/clients" className="shrink-0 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-amber-300">
                  Review →
                </Link>
              </div>
            )}
          </section>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-yellow-400" />
              </div>
              <p className="text-xs text-zinc-600">Loading dashboard…</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── KPI row ───────────────────────────────────── */}
            <section className="fu fu2 mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard label="Total Clients"  value={clients.length}              sub="All profiles"          accent="white"   />
              <KpiCard label="Active Clients" value={dash.activeClients}          sub="Currently active"      accent="emerald" />
              <KpiCard label="Sessions Left"  value={dash.totalSessionsLeft}      sub="Remaining across all"  accent="yellow"  />
              <KpiCard label="Total Debt"     value={formatMoney(dash.totalDebt)} sub="Outstanding balance"   accent="rose"    />
              <KpiCard label="Due This Week"  value={dash.dueSoonDebt.length}     sub="Deadlines ≤ 7 days"    accent="amber"   />
            </section>

            {/* ── Financial dashboard ───────────────────────── */}
            <section className="fu fu3 mb-6 overflow-hidden rounded-3xl border border-yellow-400/20 bg-[#0d0c08]">
              {/* Header strip */}
              <div className="flex items-center justify-between gap-4 border-b border-yellow-400/10 bg-yellow-400/[0.06] px-6 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-yellow-400/70">Business Reports</p>
                  <h2 className="mt-0.5 text-lg font-bold text-white">Financial Dashboard</h2>
                </div>
                <Link href="/admin/revenue" className="shrink-0 rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold text-black transition hover:bg-yellow-300 active:scale-[0.97]">
                  Open Revenue →
                </Link>
              </div>

              <div className="p-6">
                {/* Info note */}
                <div className="mb-5 rounded-2xl border border-yellow-400/15 bg-yellow-400/[0.05] px-4 py-3">
                  <p className="text-xs leading-5 text-yellow-100/60">
                    Revenue, expenses, and cash on hand are from Revenue page transactions only. Client debt is tracked separately from unpaid purchase balances.
                  </p>
                </div>

                {/* Main 4 financials */}
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <FinCard label="Revenue Collected" value={formatMoney(dash.totalRevenue)}  sub="Income on Revenue page"               tone="revenue" />
                  <FinCard label="Expenses"          value={formatMoney(dash.totalExpenses)} sub="Expenses on Revenue page"             tone="expense" />
                  <FinCard label="Cash On Hand"      value={formatMoney(dash.cashOnHand)}    sub="Income + adjustments − expenses"      tone="cash"    />
                  <FinCard label="Net Profit"        value={formatMoney(dash.netProfit)}     sub="Business transactions only"           tone="profit"  />
                </div>

                {/* Secondary 4 financials */}
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <FinCard label="Gross Package Value" value={formatMoney(dash.grossPackageValue)}       sub="Client purchase values"              tone="neutral" />
                  <FinCard label="Outstanding Debt"    value={formatMoney(dash.totalDebtFromPurchases)}  sub="Unpaid client balances"              tone="debt"    />
                  <FinCard label="Collection Rate"     value={formatPercent(dash.collectionRate)}        sub="Revenue vs package value"            tone="revenue" />
                  <FinCard label="Average Payment"     value={formatMoney(dash.averagePayment)}          sub="Per income transaction"              tone="neutral" />
                </div>

                {/* Extra 4 row */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Overdue Money</p>
                    <p className="mt-2 text-2xl font-bold text-rose-300">{formatMoney(dash.overdueDebtAmount)}</p>
                    <p className="mt-1 text-xs text-zinc-600">{dash.overdueDebt.length} overdue payment{dash.overdueDebt.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Due Soon Money</p>
                    <p className="mt-2 text-2xl font-bold text-amber-300">{formatMoney(dash.dueSoonDebtAmount)}</p>
                    <p className="mt-1 text-xs text-zinc-600">Due within 7 days</p>
                  </div>
                  <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Cash Adjustments</p>
                    <p className="mt-2 text-2xl font-bold text-sky-300">{formatMoney(dash.totalAdjustments)}</p>
                    <p className="mt-1 text-xs text-zinc-600">Manual changes from Revenue</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Purchase Records</p>
                    <p className="mt-2 text-2xl font-bold text-white">{purchases.length}</p>
                    <p className="mt-1 text-xs text-zinc-600">Total client purchase entries</p>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Debt + Low sessions ───────────────────────── */}
            <section className="fu fu4 mb-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">

              {/* Debt list */}
              <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03]">
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-600">Debt Follow-Up</p>
                    <h2 className="text-lg font-bold text-white">Payment Priority List</h2>
                  </div>
                  <Link href="/admin/clients" className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-yellow-400/30 hover:text-yellow-400">
                    Directory ↗
                  </Link>
                </div>
                <div className="p-5">
                  <p className="mb-4 text-xs text-zinc-600">Sorted by closest deadline first.</p>
                  {dash.debtRows.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-6 text-center">
                      <p className="mb-1 text-2xl">✅</p>
                      <p className="font-semibold text-emerald-300">No outstanding debt</p>
                      <p className="mt-1 text-xs text-zinc-500">All clients are cleared.</p>
                    </div>
                  ) : (
                    <div className="max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
                      {dash.debtRows.slice(0, 12).map((row) => {
                        const badge   = getDebtBadge(row.daysLeft);
                        const urgency = getDebtUrgency(row.daysLeft);
                        return (
                          <div
                            key={`${row.clientId}-${row.planName}`}
                            className={`rounded-2xl border bg-black/25 p-4 transition hover:bg-black/35 ${
                              urgency === "overdue" || urgency === "critical" ? "border-rose-500/25" :
                              urgency === "warning"                           ? "border-amber-500/20" :
                              "border-white/[0.06]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="mb-1 flex items-center gap-2">
                                  <p className="font-mono text-xs text-zinc-600">{row.clientCode}</p>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.pill}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                    {getDebtNoticeText(row.daysLeft)}
                                  </span>
                                </div>
                                <p className="truncate font-semibold text-white">{row.clientName}</p>
                                <p className="text-xs text-zinc-500">{row.planName}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xl font-bold text-rose-300">{formatMoney(row.balanceDue)}</p>
                                <p className="text-[11px] text-zinc-600">Due {formatDate(row.debtDeadline)}</p>
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <Link href={`/admin/clients/${row.clientId}`} className="rounded-xl bg-yellow-400 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-yellow-300 active:scale-[0.97]">
                                Open Client →
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Low sessions */}
              <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03]">
                <div className="border-b border-white/[0.06] px-6 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-600">Renewal Follow-Up</p>
                  <h2 className="text-lg font-bold text-white">Clients Near Renewal</h2>
                </div>
                <div className="p-5">
                  <p className="mb-4 text-xs text-zinc-600">1–10 sessions remaining — may need a package reminder.</p>
                  {dash.lowSessionRows.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-6 text-center">
                      <p className="mb-1 text-2xl">✅</p>
                      <p className="font-semibold text-emerald-300">No renewals needed</p>
                      <p className="mt-1 text-xs text-zinc-500">All clients have plenty of sessions.</p>
                    </div>
                  ) : (
                    <div className="max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
                      {dash.lowSessionRows.slice(0, 12).map((row) => {
                        const urgentColor = row.remainingSessions <= 2 ? "text-rose-400" : row.remainingSessions <= 5 ? "text-amber-400" : "text-yellow-300";
                        const barColor    = row.remainingSessions <= 2 ? "bg-rose-400"   : row.remainingSessions <= 5 ? "bg-amber-400"   : "bg-yellow-400";
                        return (
                          <div key={row.clientId} className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 transition hover:bg-black/35">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-mono text-xs text-zinc-600">{row.clientCode}</p>
                                <p className="truncate font-semibold text-white">{row.clientName}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className={`text-2xl font-bold tabular-nums ${urgentColor}`}>{row.remainingSessions}</p>
                                <p className="text-[10px] text-zinc-600">sessions left</p>
                              </div>
                            </div>
                            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, row.remainingSessions * 10)}%` }} />
                            </div>
                            <div className="mt-3 flex justify-end">
                              <Link href={`/admin/clients/${row.clientId}`} className="rounded-xl border border-yellow-400/30 px-3 py-1.5 text-xs font-semibold text-yellow-400 transition hover:bg-yellow-400 hover:text-black active:scale-[0.97]">
                                View Client →
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Recent transactions ───────────────────────── */}
            <section className="fu fu5 grid gap-5 lg:grid-cols-2">

              {/* Income */}
              <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03]">
                <div className="flex items-center gap-2 border-b border-emerald-400/10 bg-emerald-400/[0.05] px-6 py-4">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-sm">💵</span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Recent money in</p>
                    <h2 className="text-base font-bold text-white">Latest Income</h2>
                  </div>
                </div>
                <div className="p-5">
                  {dash.recentIncome.length === 0 ? (
                    <p className="rounded-2xl border border-white/[0.06] bg-black/20 p-5 text-sm text-zinc-500">
                      No income entered on the Revenue page yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {dash.recentIncome.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3 transition hover:bg-black/35">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{t.title || "Income"}</p>
                            <p className="text-xs text-zinc-600">{getSourceLabel(t.source)} · {formatDate(t.transaction_date)}</p>
                          </div>
                          <p className="shrink-0 font-bold text-emerald-300">+{formatMoney(toNumber(t.amount) ?? 0)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Expenses */}
              <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03]">
                <div className="flex items-center gap-2 border-b border-rose-400/10 bg-rose-400/[0.05] px-6 py-4">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-400/15 text-sm">🧾</span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Recent money out</p>
                    <h2 className="text-base font-bold text-white">Latest Expenses</h2>
                  </div>
                </div>
                <div className="p-5">
                  {dash.recentExpense.length === 0 ? (
                    <p className="rounded-2xl border border-white/[0.06] bg-black/20 p-5 text-sm text-zinc-500">
                      No expenses entered on the Revenue page yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {dash.recentExpense.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3 transition hover:bg-black/35">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{t.title || "Expense"}</p>
                            <p className="text-xs text-zinc-600">{getSourceLabel(t.source)} · {formatDate(t.transaction_date)}</p>
                          </div>
                          <p className="shrink-0 font-bold text-rose-300">−{formatMoney(toNumber(t.amount) ?? 0)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
