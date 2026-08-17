"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { getCurrentUserRole } from "../../lib/checkUserRole";
import AdminAiAssistant from "./AdminAiAssistant";

type AdminRole = "admin" | "manager";
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

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) return null;

  return numberValue;
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "$0";
  }

  return `$${Number(value).toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getTime(value: string | null | undefined) {
  if (!value) return 0;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getLatestByDate<T extends { created_at: string | null }>(rows: T[]) {
  if (rows.length === 0) return null;

  return [...rows].sort(
    (a, b) => getTime(b.created_at) - getTime(a.created_at)
  )[0];
}

function getDaysUntil(value: string | null) {
  if (!value) return null;

  const today = new Date();
  const deadline = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(deadline.getTime())) return null;

  today.setHours(0, 0, 0, 0);

  return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
}

function getDebtUrgency(
  daysLeft: number | null
): "overdue" | "critical" | "warning" | "none" {
  if (daysLeft === null) return "none";
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "critical";
  if (daysLeft <= 7) return "warning";

  return "none";
}

function getDebtBadge(daysLeft: number | null) {
  const urgency = getDebtUrgency(daysLeft);

  if (urgency === "overdue" || urgency === "critical") {
    return {
      pill: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      dot: "bg-rose-400",
    };
  }

  if (urgency === "warning") {
    return {
      pill: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      dot: "bg-amber-400",
    };
  }

  return {
    pill: "bg-zinc-700/40 text-zinc-400 border-zinc-600/30",
    dot: "bg-zinc-500",
  };
}

function getDebtNoticeText(daysLeft: number | null) {
  if (daysLeft === null) return "No deadline";
  if (daysLeft < 0) return `Overdue ${Math.abs(daysLeft)}d`;
  if (daysLeft === 0) return "Due today";

  return `Due in ${daysLeft}d`;
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";

  return "Good evening";
}

function getRoleLabel(role: AdminRole | null) {
  return role === "manager" ? "Manager" : "Admin";
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub: string;
  accent: "yellow" | "emerald" | "rose" | "amber" | "sky" | "white";
}) {
  const colors = {
    yellow: {
      border: "border-yellow-400/25",
      bg: "bg-yellow-400/[0.08]",
      text: "text-yellow-300",
    },
    emerald: {
      border: "border-emerald-400/25",
      bg: "bg-emerald-400/[0.08]",
      text: "text-emerald-300",
    },
    rose: {
      border: "border-rose-400/25",
      bg: "bg-rose-400/[0.08]",
      text: "text-rose-300",
    },
    amber: {
      border: "border-amber-400/25",
      bg: "bg-amber-400/[0.08]",
      text: "text-amber-300",
    },
    sky: {
      border: "border-sky-400/25",
      bg: "bg-sky-400/[0.08]",
      text: "text-sky-300",
    },
    white: {
      border: "border-white/10",
      bg: "bg-white/[0.04]",
      text: "text-white",
    },
  };

  const color = colors[accent];

  return (
    <div className={`rounded-2xl border ${color.border} ${color.bg} p-5`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-2 text-3xl font-bold tabular-nums md:text-4xl ${color.text}`}
      >
        {value}
      </p>

      <p className="mt-1.5 text-xs text-zinc-600">{sub}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [packages, setPackages] = useState<SessionPackageRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMsg, setCheckingMsg] = useState("Checking admin access...");
  const [currentRole, setCurrentRole] = useState<AdminRole | null>(null);

  const isAdmin = currentRole === "admin";
  const isManager = currentRole === "manager";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function fetchDashboardData() {
    setLoading(true);

    const [clientResult, packageResult, purchaseResult] = await Promise.all([
        supabase
          .from("clients")
          .select("id, client_code, full_name, status, created_at")
          .order("created_at", { ascending: false }),

        supabase
          .from("session_packages")
          .select(
            "id, client_id, total_sessions, used_sessions, remaining_sessions, status, created_at"
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("client_purchases")
          .select(
            "id, client_id, plan_name, price, amount_paid, balance_due, debt_deadline, purchase_type, status, created_at"
          )
          .order("created_at", { ascending: false }),
      ]);

    if (clientResult.error) {
      alert(clientResult.error.message);
      setLoading(false);
      return;
    }

    if (packageResult.error) {
      alert(packageResult.error.message);
      setLoading(false);
      return;
    }

    if (purchaseResult.error) {
      alert(purchaseResult.error.message);
      setLoading(false);
      return;
    }


    setClients((clientResult.data || []) as ClientRow[]);
    setPackages((packageResult.data || []) as SessionPackageRow[]);
    setPurchases((purchaseResult.data || []) as PurchaseRow[]);
    setLoading(false);
  }

  const dash = useMemo(() => {
    const activeClients = clients.filter(
      (client) => String(client.status || "").toLowerCase() === "active"
    ).length;

    const totalSessionsLeft = clients.reduce((sum, client) => {
      const latestPackage = getLatestByDate(
        packages.filter((packageRow) => packageRow.client_id === client.id)
      );

      const total = toNumber(latestPackage?.total_sessions) ?? 0;
      const used = toNumber(latestPackage?.used_sessions) ?? 0;
      const savedRemaining = toNumber(latestPackage?.remaining_sessions);

      return (
        sum +
        (savedRemaining !== null ? savedRemaining : Math.max(total - used, 0))
      );
    }, 0);


    const debtRows: ClientDebtSummary[] = clients
      .map((client) => {
        const clientPurchases = purchases.filter(
          (purchase) => purchase.client_id === client.id
        );

        const purchase =
          clientPurchases.find(
            (purchaseRow) => Number(purchaseRow.balance_due || 0) > 0
          ) || getLatestByDate(clientPurchases);

        if (!purchase) return null;

        const price = toNumber(purchase.price);
        const paid = toNumber(purchase.amount_paid);
        const savedBalance = toNumber(purchase.balance_due);

        const balanceDue =
          savedBalance !== null
            ? savedBalance
            : price !== null && paid !== null
            ? Math.max(price - paid, 0)
            : 0;

        if (balanceDue <= 0) return null;

        return {
          clientId: client.id,
          clientCode: client.client_code || "-",
          clientName: client.full_name,
          planName: purchase.plan_name || "-",
          balanceDue,
          debtDeadline: purchase.debt_deadline,
          daysLeft: getDaysUntil(purchase.debt_deadline),
        };
      })
      .filter((row): row is ClientDebtSummary => Boolean(row))
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

    const lowSessionRows: LowSessionSummary[] = clients
      .map((client) => {
        const latestPackage = getLatestByDate(
          packages.filter((packageRow) => packageRow.client_id === client.id)
        );

        if (!latestPackage) return null;

        const total = toNumber(latestPackage.total_sessions) ?? 0;
        const used = toNumber(latestPackage.used_sessions) ?? 0;
        const savedRemaining = toNumber(latestPackage.remaining_sessions);

        const remaining =
          savedRemaining !== null
            ? savedRemaining
            : Math.max(total - used, 0);

        if (remaining <= 0 || remaining > 10) return null;

        return {
          clientId: client.id,
          clientCode: client.client_code || "-",
          clientName: client.full_name,
          remainingSessions: remaining,
        };
      })
      .filter((row): row is LowSessionSummary => Boolean(row))
      .sort((a, b) => a.remainingSessions - b.remainingSessions);

    const totalDebt = debtRows.reduce((sum, row) => sum + row.balanceDue, 0);

    const overdueDebt = debtRows.filter(
      (row) => row.daysLeft !== null && row.daysLeft < 0
    );

    const dueTodayDebt = debtRows.filter((row) => row.daysLeft === 0);

    const dueSoonDebt = debtRows.filter(
      (row) => row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= 7
    );

    const noDeadlineDebt = debtRows.filter((row) => row.daysLeft === null);

    const overdueDebtAmount = overdueDebt.reduce(
      (sum, row) => sum + row.balanceDue,
      0
    );

    const dueSoonDebtAmount = dueSoonDebt.reduce(
      (sum, row) => sum + row.balanceDue,
      0
    );


    return {
      activeClients,
      totalSessionsLeft,
      totalDebt,
      overdueDebtAmount,
      dueSoonDebtAmount,
      debtRows,
      lowSessionRows,
      overdueDebt,
      dueTodayDebt,
      dueSoonDebt,
      noDeadlineDebt,
    };
  }, [clients, packages, purchases]);

  useEffect(() => {
    async function init() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMsg("Redirecting...");
        router.push("/login");
        return;
      }

      if (role === "admin" || role === "manager") {
        setCurrentRole(role);
        setCheckingRole(false);
        await fetchDashboardData();
        return;
      }

      if (role === "trainer" || role === "nutrition_coach") {
        router.push("/trainer/scan");
        return;
      }

      if (role === "client") {
        router.push("/client");
        return;
      }

      await supabase.auth.signOut();
      router.push("/login");
    }

    init();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-yellow-400" />
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
            {checkingMsg}
          </p>
        </div>
      </main>
    );
  }

  const navActions = [
    {
      href: "/admin/clients",
      label: isManager ? "View Clients" : "Clients",
      icon: "👥",
      primary: true,
      adminOnly: false,
    },
    {
      href: "/admin/leads",
      label: "Leads & Demos",
      icon: "🎯",
      primary: true,
      adminOnly: false,
    },
    {
      href: "/admin/marketing",
      label: "Marketing",
      icon: "📣",
      primary: true,
      adminOnly: false,
    },
    {
      href: "/admin/revenue",
      label: isManager ? "View Revenue" : "Revenue",
      icon: "💰",
      primary: true,
      adminOnly: false,
    },
    {
      href: "/admin/reports",
      label: "Reports",
      icon: "📊",
      primary: true,
      adminOnly: false,
    },
    {
      href: "/admin/ai/clients-summary",
      label: "AI Client Review",
      icon: "✨",
      primary: false,
      adminOnly: false,
    },
    {
      href: "/admin/clients/inactive",
      label: "Inactive Clients",
      icon: "🚫",
      primary: false,
      adminOnly: false,
    },
    {
      href: "/history",
      label: "History",
      icon: "🗂️",
      primary: false,
      adminOnly: false,
    },
    {
      href: isManager ? "/history/work" : "/admin/work-tasks",
      label: "Daily Work",
      icon: "✅",
      primary: false,
      adminOnly: false,
    },
    {
      href: "/admin/membership-plans",
      label: "Membership",
      icon: "💳",
      primary: false,
      adminOnly: true,
    },
    {
      href: "/admin/import-clients",
      label: "Import",
      icon: "📥",
      primary: false,
      adminOnly: true,
    },
    {
      href: "/admin/trainers",
      label: "Staff",
      icon: "🏋️",
      primary: false,
      adminOnly: true,
    },
  ];

  const visibleNavActions = navActions.filter(
    (action) => isAdmin || !action.adminOnly
  );

  return (
    <main className="min-h-screen overflow-y-auto bg-[#080808] text-white">
      <style jsx global>{`
        html,
        body {
          background: #080808;
        }

        ::-webkit-scrollbar {
          width: 5px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: #3f3f46;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #facc15;
        }

        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .fu {
          animation: fade-up 0.4s ease both;
        }

        .fu1 {
          animation-delay: 0.05s;
        }

        .fu2 {
          animation-delay: 0.1s;
        }

        .fu3 {
          animation-delay: 0.15s;
        }

        .fu4 {
          animation-delay: 0.2s;
        }

        .fu5 {
          animation-delay: 0.25s;
        }
      `}</style>

      <header className="fu sticky top-0 z-20 border-b border-white/[0.06] bg-[#080808]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-400/30 bg-yellow-400/15 text-sm font-black text-yellow-400">
              F
            </div>

            <div>
              <p className="text-sm font-bold leading-none text-white">
                FXA FITNESS
              </p>

              <p className="mt-0.5 text-[10px] uppercase leading-none tracking-widest text-zinc-600">
                {getRoleLabel(currentRole)} Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Link
                href="/admin/membership-plans"
                className="hidden rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-xs font-bold text-yellow-300 transition hover:bg-yellow-400 hover:text-black sm:inline-block"
              >
                Membership
              </Link>
            ) : null}

            <Link
              href="/admin/leads"
              className="hidden rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black sm:inline-block"
            >
              Leads & Demos
            </Link>

            <Link
              href="/admin/marketing"
              className="hidden rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-4 py-2 text-xs font-bold text-fuchsia-300 transition hover:bg-fuchsia-400 hover:text-black md:inline-block"
            >
              Marketing
            </Link>

            <Link
              href="/admin/ai/clients-summary"
              className="hidden rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-xs font-bold text-violet-300 transition hover:bg-violet-400 hover:text-black lg:inline-block"
            >
              AI Client Review
            </Link>

            <Link
              href="/admin/clients"
              className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold text-black transition hover:bg-yellow-300 active:scale-[0.97]"
            >
              Client Directory
            </Link>

            <Link
              href="/admin/clients/inactive"
              className="hidden rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-400 hover:text-black sm:inline-block"
            >
              Inactive
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:border-white/20 hover:text-white active:scale-[0.97]"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 md:px-6">
        <div className="fu fu1 mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-600">
            {getGreeting()}
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white md:text-3xl">
            {getRoleLabel(currentRole)} Overview
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Central management dashboard for clients, revenue, leads, marketing,
            reports, staff and daily operational follow-up.
          </p>

          {isManager ? (
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3">
              <span className="mt-0.5 text-sm">⚠️</span>

              <p className="text-sm leading-6 text-amber-200/80">
                <strong className="text-amber-300">Manager mode:</strong>{" "}
                View-only for financials, imports, and staff. Basic client edits
                are allowed.
              </p>
            </div>
          ) : null}
        </div>


        <section className="fu fu1 mb-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-rose-300/80">
                Important Alerts
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Items requiring immediate attention appear here before daily work tools.
              </p>
            </div>
          </div>
        </section>

        {!loading &&
        (dash.overdueDebt.length > 0 || dash.dueTodayDebt.length > 0) ? (
          <section className="fu fu2 mb-6 grid gap-3 md:grid-cols-2">
            {dash.overdueDebt.length > 0 ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/[0.10] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-lg">
                    🚨
                  </span>

                  <div>
                    <p className="text-sm font-bold text-rose-300">
                      {dash.overdueDebt.length} overdue payment
                      {dash.overdueDebt.length !== 1 ? "s" : ""}
                    </p>

                    <p className="text-xs text-zinc-500">
                      Deadlines passed — follow up now
                    </p>
                  </div>
                </div>

                <Link
                  href="/admin/clients"
                  className="shrink-0 rounded-xl bg-rose-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-rose-300"
                >
                  Review →
                </Link>
              </div>
            ) : null}

            {dash.dueTodayDebt.length > 0 ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.10] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-lg">
                    ⏰
                  </span>

                  <div>
                    <p className="text-sm font-bold text-amber-300">
                      {dash.dueTodayDebt.length} payment
                      {dash.dueTodayDebt.length !== 1 ? "s" : ""} due today
                    </p>

                    <p className="text-xs text-zinc-500">
                      Collect before end of day
                    </p>
                  </div>
                </div>

                <Link
                  href="/admin/clients"
                  className="shrink-0 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-amber-300"
                >
                  Review →
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="fu fu1 mb-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-600">
            Work Center
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap">
            {visibleNavActions.map(({ href, label, icon, primary }) => (
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

            {isManager ? (
              <>
                <div className="flex cursor-not-allowed items-center gap-2.5 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-sm font-bold text-zinc-700 opacity-50">
                  <span className="text-base">💳</span> Membership
                </div>

                <div className="flex cursor-not-allowed items-center gap-2.5 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-sm font-bold text-zinc-700 opacity-50">
                  <span className="text-base">📥</span> Import
                </div>

                <div className="flex cursor-not-allowed items-center gap-2.5 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-sm font-bold text-zinc-700 opacity-50">
                  <span className="text-base">🏋️</span> Staff
                </div>
              </>
            ) : null}
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-yellow-400" />
              </div>

              <p className="text-xs text-zinc-600">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          <>
            <section className="fu fu2 mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label="Total Clients"
                value={clients.length}
                sub="All profiles"
                accent="white"
              />

              <KpiCard
                label="Active Clients"
                value={dash.activeClients}
                sub="Currently active"
                accent="emerald"
              />

              <KpiCard
                label="Sessions Left"
                value={dash.totalSessionsLeft}
                sub="Remaining across all"
                accent="yellow"
              />

              <KpiCard
                label="Total Debt"
                value={formatMoney(dash.totalDebt)}
                sub="Outstanding balance"
                accent="rose"
              />

              <KpiCard
                label="Due This Week"
                value={dash.dueSoonDebt.length}
                sub="Deadlines ≤ 7 days"
                accent="amber"
              />
            </section>

            <section className="fu fu3 mb-6 overflow-hidden rounded-3xl border border-amber-400/20 bg-[#0d0c08]">
              <div className="flex flex-col gap-4 border-b border-amber-400/10 bg-amber-400/[0.06] px-6 py-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300/70">
                    Warning Center
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-white">
                    Items That Need Attention
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Review overdue balances, upcoming payments, missing deadlines, and clients close to renewal.
                  </p>
                </div>

                <Link
                  href="/admin/clients"
                  className="shrink-0 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-black transition hover:bg-amber-300 active:scale-[0.97]"
                >
                  Review Clients →
                </Link>
              </div>

              <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.08] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Overdue
                  </p>
                  <p className="mt-2 text-3xl font-bold text-rose-300">
                    {dash.overdueDebt.length}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {formatMoney(dash.overdueDebtAmount)} past deadline
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-400/25 bg-orange-400/[0.08] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Due Today
                  </p>
                  <p className="mt-2 text-3xl font-bold text-orange-300">
                    {dash.dueTodayDebt.length}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Payments to follow up today
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Due Soon
                  </p>
                  <p className="mt-2 text-3xl font-bold text-amber-300">
                    {dash.dueSoonDebt.length}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {formatMoney(dash.dueSoonDebtAmount)} due within 7 days
                  </p>
                </div>

                <div className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.08] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    No Deadline
                  </p>
                  <p className="mt-2 text-3xl font-bold text-sky-300">
                    {dash.noDeadlineDebt.length}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Debt records missing a due date
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-400/25 bg-yellow-400/[0.08] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Near Renewal
                  </p>
                  <p className="mt-2 text-3xl font-bold text-yellow-300">
                    {dash.lowSessionRows.length}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Clients with 1–10 sessions left
                  </p>
                </div>
              </div>

              {dash.overdueDebt.length === 0 &&
              dash.dueTodayDebt.length === 0 &&
              dash.dueSoonDebt.length === 0 &&
              dash.noDeadlineDebt.length === 0 &&
              dash.lowSessionRows.length === 0 ? (
                <div className="mx-5 mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-5 text-center">
                  <p className="font-semibold text-emerald-300">No urgent warnings</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Client payments and renewals are currently under control.
                  </p>
                </div>
              ) : null}
            </section>

            <section className="fu fu4 mb-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03]">
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
                      Debt Follow-Up
                    </p>

                    <h2 className="text-lg font-bold text-white">
                      Payment Priority List
                    </h2>
                  </div>

                  <Link
                    href="/admin/clients"
                    className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-yellow-400/30 hover:text-yellow-400"
                  >
                    Directory ↗
                  </Link>
                </div>

                <div className="p-5">
                  <p className="mb-4 text-xs text-zinc-600">
                    Sorted by closest deadline first.
                  </p>

                  {dash.debtRows.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-6 text-center">
                      <p className="mb-1 text-2xl">✅</p>

                      <p className="font-semibold text-emerald-300">
                        No outstanding debt
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        All clients are cleared.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
                      {dash.debtRows.slice(0, 12).map((row) => {
                        const badge = getDebtBadge(row.daysLeft);
                        const urgency = getDebtUrgency(row.daysLeft);

                        return (
                          <div
                            key={`${row.clientId}-${row.planName}`}
                            className={`rounded-2xl border bg-black/25 p-4 transition hover:bg-black/35 ${
                              urgency === "overdue" || urgency === "critical"
                                ? "border-rose-500/25"
                                : urgency === "warning"
                                ? "border-amber-500/20"
                                : "border-white/[0.06]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="mb-1 flex items-center gap-2">
                                  <p className="font-mono text-xs text-zinc-600">
                                    {row.clientCode}
                                  </p>

                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.pill}`}
                                  >
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${badge.dot}`}
                                    />
                                    {getDebtNoticeText(row.daysLeft)}
                                  </span>
                                </div>

                                <p className="truncate font-semibold text-white">
                                  {row.clientName}
                                </p>

                                <p className="text-xs text-zinc-500">
                                  {row.planName}
                                </p>
                              </div>

                              <div className="shrink-0 text-right">
                                <p className="text-xl font-bold text-rose-300">
                                  {formatMoney(row.balanceDue)}
                                </p>

                                <p className="text-[11px] text-zinc-600">
                                  Due {formatDate(row.debtDeadline)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 flex justify-end">
                              <Link
                                href={`/admin/clients/${row.clientId}`}
                                className="rounded-xl bg-yellow-400 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-yellow-300 active:scale-[0.97]"
                              >
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

              <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03]">
                <div className="border-b border-white/[0.06] px-6 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
                    Renewal Follow-Up
                  </p>

                  <h2 className="text-lg font-bold text-white">
                    Clients Near Renewal
                  </h2>
                </div>

                <div className="p-5">
                  <p className="mb-4 text-xs text-zinc-600">
                    1–10 sessions remaining — may need a package reminder.
                  </p>

                  {dash.lowSessionRows.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-6 text-center">
                      <p className="mb-1 text-2xl">✅</p>

                      <p className="font-semibold text-emerald-300">
                        No renewals needed
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        All clients have plenty of sessions.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
                      {dash.lowSessionRows.slice(0, 12).map((row) => {
                        const urgentColor =
                          row.remainingSessions <= 2
                            ? "text-rose-400"
                            : row.remainingSessions <= 5
                            ? "text-amber-400"
                            : "text-yellow-300";

                        const barColor =
                          row.remainingSessions <= 2
                            ? "bg-rose-400"
                            : row.remainingSessions <= 5
                            ? "bg-amber-400"
                            : "bg-yellow-400";

                        return (
                          <div
                            key={row.clientId}
                            className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 transition hover:bg-black/35"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-mono text-xs text-zinc-600">
                                  {row.clientCode}
                                </p>

                                <p className="truncate font-semibold text-white">
                                  {row.clientName}
                                </p>
                              </div>

                              <div className="shrink-0 text-right">
                                <p
                                  className={`text-2xl font-bold tabular-nums ${urgentColor}`}
                                >
                                  {row.remainingSessions}
                                </p>

                                <p className="text-[10px] text-zinc-600">
                                  sessions left
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className={`h-full rounded-full ${barColor}`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    row.remainingSessions * 10
                                  )}%`,
                                }}
                              />
                            </div>

                            <div className="mt-3 flex justify-end">
                              <Link
                                href={`/admin/clients/${row.clientId}`}
                                className="rounded-xl border border-yellow-400/30 px-3 py-1.5 text-xs font-semibold text-yellow-400 transition hover:bg-yellow-400 hover:text-black active:scale-[0.97]"
                              >
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

          </>
        )}
      </div>
      <AdminAiAssistant />
    </main>
  );
}
