"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { getCurrentUserRole } from "../../lib/checkUserRole";

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

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getTime(value: string | null) {
  if (!value) return 0;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 0;

  return date.getTime();
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

function getDebtNoticeClass(daysLeft: number | null) {
  if (daysLeft === null) {
    return "border-orange-400/30 bg-orange-400/10 text-orange-300";
  }

  if (daysLeft < 0) {
    return "border-red-400/30 bg-red-400/10 text-red-300";
  }

  if (daysLeft <= 7) {
    return "border-orange-400/30 bg-orange-400/10 text-orange-300";
  }

  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
}

function getDebtNoticeText(daysLeft: number | null) {
  if (daysLeft === null) return "No deadline";

  if (daysLeft < 0) {
    return `Overdue ${Math.abs(daysLeft)} day${
      Math.abs(daysLeft) === 1 ? "" : "s"
    }`;
  }

  if (daysLeft === 0) return "Due today";

  if (daysLeft <= 7) {
    return `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  }

  return `Due in ${daysLeft} days`;
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";

  return "Good evening";
}

function getRoleLabel(role: AdminRole | null) {
  if (role === "manager") return "Manager";
  return "Admin";
}

export default function AdminDashboardPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [packages, setPackages] = useState<SessionPackageRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState(
    "Checking admin access..."
  );
  const [currentRole, setCurrentRole] = useState<AdminRole | null>(null);

  const isAdmin = currentRole === "admin";
  const isManager = currentRole === "manager";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function fetchDashboardData() {
    setLoading(true);

    const [clientsResult, packagesResult, purchasesResult] = await Promise.all([
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

    if (clientsResult.error) {
      alert(clientsResult.error.message);
      setLoading(false);
      return;
    }

    if (packagesResult.error) {
      alert(packagesResult.error.message);
      setLoading(false);
      return;
    }

    if (purchasesResult.error) {
      alert(purchasesResult.error.message);
      setLoading(false);
      return;
    }

    setClients((clientsResult.data || []) as ClientRow[]);
    setPackages((packagesResult.data || []) as SessionPackageRow[]);
    setPurchases((purchasesResult.data || []) as PurchaseRow[]);
    setLoading(false);
  }

  const dashboardData = useMemo(() => {
    const activeClients = clients.filter(
      (client) => String(client.status || "").toLowerCase() === "active"
    ).length;

    const totalSessionsLeft = clients.reduce((sum, client) => {
      const clientPackages = packages.filter(
        (packageRow) => packageRow.client_id === client.id
      );

      const latestPackage = getLatestByDate(clientPackages);

      const totalSessions = toNumber(latestPackage?.total_sessions) ?? 0;
      const usedSessions = toNumber(latestPackage?.used_sessions) ?? 0;
      const savedRemaining = toNumber(latestPackage?.remaining_sessions);

      const remainingSessions =
        savedRemaining !== null
          ? savedRemaining
          : Math.max(totalSessions - usedSessions, 0);

      return sum + remainingSessions;
    }, 0);

    const debtRows: ClientDebtSummary[] = clients
      .map((client) => {
        const clientPurchases = purchases.filter(
          (purchase) => purchase.client_id === client.id
        );

        const purchaseWithDebt =
          clientPurchases.find(
            (purchase) => Number(purchase.balance_due || 0) > 0
          ) || getLatestByDate(clientPurchases);

        if (!purchaseWithDebt) return null;

        const price = toNumber(purchaseWithDebt.price);
        const paid = toNumber(purchaseWithDebt.amount_paid);
        const savedDebt = toNumber(purchaseWithDebt.balance_due);

        const balanceDue =
          savedDebt !== null
            ? savedDebt
            : price !== null && paid !== null
            ? Math.max(price - paid, 0)
            : 0;

        if (balanceDue <= 0) return null;

        const daysLeft = getDaysUntil(purchaseWithDebt.debt_deadline);

        return {
          clientId: client.id,
          clientCode: client.client_code || "-",
          clientName: client.full_name,
          planName: purchaseWithDebt.plan_name || "-",
          balanceDue,
          debtDeadline: purchaseWithDebt.debt_deadline,
          daysLeft,
        };
      })
      .filter((row): row is ClientDebtSummary => Boolean(row))
      .sort((a, b) => {
        const aDays = a.daysLeft ?? 9999;
        const bDays = b.daysLeft ?? 9999;

        return aDays - bDays;
      });

    const lowSessionRows: LowSessionSummary[] = clients
      .map((client) => {
        const clientPackages = packages.filter(
          (packageRow) => packageRow.client_id === client.id
        );

        const latestPackage = getLatestByDate(clientPackages);

        if (!latestPackage) return null;

        const totalSessions = toNumber(latestPackage.total_sessions) ?? 0;
        const usedSessions = toNumber(latestPackage.used_sessions) ?? 0;
        const savedRemaining = toNumber(latestPackage.remaining_sessions);

        const remainingSessions =
          savedRemaining !== null
            ? savedRemaining
            : Math.max(totalSessions - usedSessions, 0);

        if (remainingSessions <= 0 || remainingSessions > 10) return null;

        return {
          clientId: client.id,
          clientCode: client.client_code || "-",
          clientName: client.full_name,
          remainingSessions,
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

    return {
      activeClients,
      totalSessionsLeft,
      debtRows,
      lowSessionRows,
      totalDebt,
      overdueDebt,
      dueTodayDebt,
      dueSoonDebt,
      noDeadlineDebt,
    };
  }, [clients, packages, purchases]);

  useEffect(() => {
    async function protectDashboard() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
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

    protectDashboard();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-4 text-white md:p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            {checkingMessage}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="fxa-scrollbar min-h-screen overflow-y-auto bg-black p-3 text-white md:p-5">
      <style jsx global>{`
        html,
        body {
          scrollbar-width: thin;
          scrollbar-color: #facc15 #111111;
        }

        ::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }

        ::-webkit-scrollbar-track {
          background: #111111;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #facc15, #ca8a04);
          border: 3px solid #111111;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #fde047, #facc15);
        }

        .fxa-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #facc15 #111111;
        }
      `}</style>

      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <header className="mb-5 rounded-3xl border border-yellow-500/25 bg-black/55 p-5 shadow-2xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-3xl font-semibold md:text-5xl">
                  {getGreeting()}, {getRoleLabel(currentRole)}
                </h1>

                <p className="mt-2 max-w-3xl text-sm font-normal leading-6 text-gray-400">
                  Here is today&apos;s business snapshot: debt follow-ups,
                  upcoming payment notices, low-session clients, and important
                  client activity.
                </p>

                {isManager ? (
                  <div className="mt-4 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4">
                    <p className="text-sm font-normal leading-6 text-yellow-100">
                      Manager mode: you can view admin-level business data and
                      edit only basic client information. Delete, import, staff
                      changes, package changes, debt changes, and financial
                      edits should stay admin-only.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/admin/clients"
                  className="rounded-xl bg-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                >
                  Client Directory
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl border border-yellow-400 px-4 py-2 text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          {loading ? (
            <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 text-center shadow-2xl">
              <p className="text-sm font-semibold text-yellow-400">
                Loading dashboard...
              </p>
            </section>
          ) : (
            <>
              <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Total Clients
                  </p>
                  <p className="mt-2 text-4xl font-semibold text-yellow-400">
                    {clients.length}
                  </p>
                  <p className="mt-2 text-xs font-normal text-gray-500">
                    All client profiles
                  </p>
                </div>

                <div className="rounded-3xl border border-green-500/30 bg-green-500/10 p-5 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Active Clients
                  </p>
                  <p className="mt-2 text-4xl font-semibold text-green-300">
                    {dashboardData.activeClients}
                  </p>
                  <p className="mt-2 text-xs font-normal text-gray-500">
                    Currently active
                  </p>
                </div>

                <div className="rounded-3xl border border-yellow-500/30 bg-yellow-400/10 p-5 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Sessions Left
                  </p>
                  <p className="mt-2 text-4xl font-semibold text-yellow-300">
                    {dashboardData.totalSessionsLeft}
                  </p>
                  <p className="mt-2 text-xs font-normal text-gray-500">
                    Remaining sessions
                  </p>
                </div>

                <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Total Debt
                  </p>
                  <p className="mt-2 text-4xl font-semibold text-red-300">
                    {formatMoney(dashboardData.totalDebt)}
                  </p>
                  <p className="mt-2 text-xs font-normal text-gray-500">
                    Outstanding balance
                  </p>
                </div>

                <div className="rounded-3xl border border-orange-500/30 bg-orange-500/10 p-5 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Due Soon
                  </p>
                  <p className="mt-2 text-4xl font-semibold text-orange-300">
                    {dashboardData.dueSoonDebt.length}
                  </p>
                  <p className="mt-2 text-xs font-normal text-gray-500">
                    Due within 7 days
                  </p>
                </div>
              </section>

              <section className="mb-5 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                    Today&apos;s Focus
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    Important Notices
                  </h2>

                  <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                    Start here before checking the full client directory.
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-red-300">
                          Overdue Debt
                        </p>

                        <h3 className="mt-2 text-xl font-semibold text-white">
                          Needs follow-up
                        </h3>
                      </div>

                      <p className="text-4xl font-semibold text-red-300">
                        {dashboardData.overdueDebt.length}
                      </p>
                    </div>

                    <p className="mt-3 text-sm font-normal leading-6 text-gray-300">
                      Clients with payment deadlines already passed.
                    </p>

                    {dashboardData.overdueDebt.length > 0 ? (
                      <Link
                        href="/admin/clients"
                        className="mt-4 inline-block rounded-xl bg-red-300 px-4 py-2 text-xs font-semibold uppercase text-black transition hover:bg-red-200"
                      >
                        Review Now
                      </Link>
                    ) : (
                      <p className="mt-4 rounded-xl border border-green-400/20 bg-green-400/10 p-3 text-sm font-normal text-green-300">
                        No overdue debt right now.
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-orange-300">
                          Due This Week
                        </p>

                        <h3 className="mt-2 text-xl font-semibold text-white">
                          Payment reminders
                        </h3>
                      </div>

                      <p className="text-4xl font-semibold text-orange-300">
                        {dashboardData.dueSoonDebt.length}
                      </p>
                    </div>

                    <p className="mt-3 text-sm font-normal leading-6 text-gray-300">
                      Clients with debt due today or within 7 days.
                    </p>

                    {dashboardData.dueTodayDebt.length > 0 ? (
                      <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm font-normal text-red-200">
                        {dashboardData.dueTodayDebt.length} client
                        {dashboardData.dueTodayDebt.length === 1 ? "" : "s"} due
                        today.
                      </p>
                    ) : (
                      <p className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm font-normal text-yellow-100">
                        No payment due today.
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-yellow-300">
                          Low Sessions
                        </p>

                        <h3 className="mt-2 text-xl font-semibold text-white">
                          Renewal opportunity
                        </h3>
                      </div>

                      <p className="text-4xl font-semibold text-yellow-300">
                        {dashboardData.lowSessionRows.length}
                      </p>
                    </div>

                    <p className="mt-3 text-sm font-normal leading-6 text-gray-300">
                      Clients with 1 to 10 sessions left.
                    </p>

                    <Link
                      href="/admin/clients"
                      className="mt-4 inline-block rounded-xl bg-yellow-400 px-4 py-2 text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                    >
                      View Clients
                    </Link>
                  </div>
                </div>
              </section>

              <section className="mb-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-3xl border border-red-500/30 bg-white/[0.06] p-5 shadow-2xl">
                  <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-red-300">
                        Debt Follow-Up
                      </p>

                      <h2 className="mt-1 text-2xl font-semibold text-white">
                        Payment Priority List
                      </h2>

                      <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                        Sorted by closest deadline first.
                      </p>
                    </div>

                    <Link
                      href="/admin/clients"
                      className="rounded-xl border border-yellow-400 px-4 py-2 text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                    >
                      Open Directory
                    </Link>
                  </div>

                  {dashboardData.debtRows.length === 0 ? (
                    <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-5 text-center">
                      <h3 className="text-lg font-semibold text-green-300">
                        No active debt
                      </h3>
                      <p className="mt-2 text-sm font-normal text-gray-300">
                        All clients are currently clear for payment balance.
                      </p>
                    </div>
                  ) : (
                    <div className="fxa-scrollbar max-h-[520px] space-y-3 overflow-y-auto pr-2">
                      {dashboardData.debtRows.slice(0, 12).map((row) => (
                        <div
                          key={`${row.clientId}-${row.planName}`}
                          className="rounded-2xl border border-white/10 bg-black/45 p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                                {row.clientCode}
                              </p>

                              <h3 className="mt-1 text-lg font-semibold text-white">
                                {row.clientName}
                              </h3>

                              <p className="mt-1 text-sm font-normal text-gray-400">
                                {row.planName}
                              </p>
                            </div>

                            <div className="text-left md:text-right">
                              <p className="text-2xl font-semibold text-red-300">
                                {formatMoney(row.balanceDue)}
                              </p>

                              <span
                                className={`mt-2 inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getDebtNoticeClass(
                                  row.daysLeft
                                )}`}
                              >
                                {getDebtNoticeText(row.daysLeft)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-normal text-gray-400">
                              Deadline:{" "}
                              <span className="text-yellow-300">
                                {formatDate(row.debtDeadline)}
                              </span>
                            </p>

                            <Link
                              href={`/admin/clients/${row.clientId}`}
                              className="rounded-xl bg-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                            >
                              Open Client
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl">
                  <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                    Renewal Follow-Up
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    Clients Near Renewal
                  </h2>

                  <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                    These clients may need a package reminder soon.
                  </p>

                  {dashboardData.lowSessionRows.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-green-400/20 bg-green-400/10 p-5 text-center">
                      <h3 className="text-lg font-semibold text-green-300">
                        No low-session clients
                      </h3>

                      <p className="mt-2 text-sm font-normal text-gray-300">
                        No renewal follow-up needed right now.
                      </p>
                    </div>
                  ) : (
                    <div className="fxa-scrollbar mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-2">
                      {dashboardData.lowSessionRows.slice(0, 12).map((row) => (
                        <div
                          key={row.clientId}
                          className="rounded-2xl border border-white/10 bg-black/45 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                                {row.clientCode}
                              </p>

                              <h3 className="mt-1 text-base font-semibold text-white">
                                {row.clientName}
                              </h3>
                            </div>

                            <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-center">
                              <p className="text-3xl font-semibold text-yellow-300">
                                {row.remainingSessions}
                              </p>
                              <p className="text-[10px] font-semibold uppercase text-gray-400">
                                left
                              </p>
                            </div>
                          </div>

                          <Link
                            href={`/admin/clients/${row.clientId}`}
                            className="mt-4 block rounded-xl border border-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                          >
                            View Client
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                    Quick Actions
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    What would you like to do next?
                  </h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Link
                    href="/admin/clients"
                    className="rounded-3xl border border-yellow-500/30 bg-yellow-400 p-5 text-black shadow-2xl transition hover:bg-yellow-300"
                  >
                    <h3 className="text-xl font-semibold uppercase">
                      {isManager ? "View Clients" : "Manage Clients"}
                    </h3>
                    <p className="mt-2 text-sm font-normal leading-6 text-black/70">
                      View clients, sessions, debt, and payment status.
                    </p>
                  </Link>

                  {isAdmin ? (
                    <>
                      <Link
                        href="/admin/import-clients"
                        className="rounded-3xl border border-yellow-500/30 bg-black/45 p-5 shadow-2xl transition hover:bg-yellow-400 hover:text-black"
                      >
                        <h3 className="text-xl font-semibold uppercase">
                          Import Excel
                        </h3>
                        <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                          Upload Google Sheet exports and update client data.
                        </p>
                      </Link>

                      <Link
                        href="/admin/trainers"
                        className="rounded-3xl border border-yellow-500/30 bg-black/45 p-5 shadow-2xl transition hover:bg-yellow-400 hover:text-black"
                      >
                        <h3 className="text-xl font-semibold uppercase">
                          Staff
                        </h3>
                        <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                          Manage trainers, nutrition coaches, and staff access.
                        </p>
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="rounded-3xl border border-white/10 bg-black/35 p-5 opacity-70 shadow-2xl">
                        <h3 className="text-xl font-semibold uppercase text-gray-300">
                          Import Excel
                        </h3>
                        <p className="mt-2 text-sm font-normal leading-6 text-gray-500">
                          Admin-only. Managers can view imported data but cannot
                          import or overwrite records.
                        </p>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-black/35 p-5 opacity-70 shadow-2xl">
                        <h3 className="text-xl font-semibold uppercase text-gray-300">
                          Staff
                        </h3>
                        <p className="mt-2 text-sm font-normal leading-6 text-gray-500">
                          Admin-only. Managers cannot create, delete, or change
                          staff roles.
                        </p>
                      </div>
                    </>
                  )}

                  <Link
                    href="/history"
                    className="rounded-3xl border border-yellow-500/30 bg-black/45 p-5 shadow-2xl transition hover:bg-yellow-400 hover:text-black"
                  >
                    <h3 className="text-xl font-semibold uppercase">
                      Session History
                    </h3>
                    <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                      Review recent scans and completed sessions.
                    </p>
                  </Link>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}