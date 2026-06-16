"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { getCurrentUserRole } from "../../lib/checkUserRole";

export default function AdminDashboardPage() {
  const router = useRouter();

  const [totalClients, setTotalClients] = useState(0);
  const [activeClients, setActiveClients] = useState(0);
  const [totalTrainers, setTotalTrainers] = useState(0);
  const [sessionsToday, setSessionsToday] = useState(0);
  const [lowSessionClients, setLowSessionClients] = useState(0);
  const [pendingPurchases, setPendingPurchases] = useState(0);
  const [revenueThisMonth, setRevenueThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function fetchDashboardStats() {
    setLoading(true);

    const { data: clients } = await supabase.from("clients").select(`
      id,
      status,
      session_packages (
        remaining_sessions
      )
    `);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: logs } = await supabase
      .from("session_logs")
      .select("id, scanned_at, status")
      .eq("status", "success")
      .gte("scanned_at", today.toISOString());

    const { data: purchases } = await supabase
      .from("client_purchases")
      .select("id")
      .eq("status", "pending");

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: transactions } = await supabase
      .from("business_transactions")
      .select("amount, transaction_type, transaction_date")
      .eq("transaction_type", "income")
      .gte("transaction_date", startOfMonth.toISOString().slice(0, 10));

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      const trainersResponse = await fetch("/api/admin/trainers", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (trainersResponse.ok) {
        const trainersData: { trainers: unknown[] } =
          await trainersResponse.json();

        setTotalTrainers(trainersData.trainers.length);
      }
    }

    const allClients = clients || [];

    setTotalClients(allClients.length);

    setActiveClients(
      allClients.filter((client) => client.status === "active").length
    );

    setSessionsToday((logs || []).length);
    setPendingPurchases((purchases || []).length);

    const lowClients = allClients.filter((client) => {
      const activePackage = client.session_packages?.[0];
      return activePackage && activePackage.remaining_sessions <= 2;
    });

    setLowSessionClients(lowClients.length);

    const monthRevenue = (transactions || []).reduce(
      (sum, transaction) => sum + Number(transaction.amount),
      0
    );

    setRevenueThisMonth(monthRevenue);
    setLoading(false);
  }

  useEffect(() => {
    async function protectAdminDashboard() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "admin") {
        if (role === "trainer") {
          router.push("/trainer/scan");
          return;
        }

        if (role === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setCheckingRole(false);
      await fetchDashboardStats();
    }

    protectAdminDashboard();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-black text-yellow-400">Checking admin access...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                Admin Dashboard
              </h1>

              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                Manage clients, trainers, memberships, purchases, sessions, and
                revenue.
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-2xl border border-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Logout
            </button>
          </header>

          {loading ? (
            <p className="font-black text-yellow-400">Loading dashboard...</p>
          ) : (
            <section className="mb-8 grid gap-4 md:grid-cols-7">
              <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Clients
                </p>
                <p className="mt-3 text-4xl font-black text-yellow-400">
                  {totalClients}
                </p>
              </div>

              <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Active
                </p>
                <p className="mt-3 text-4xl font-black text-yellow-400">
                  {activeClients}
                </p>
              </div>

              <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Trainers
                </p>
                <p className="mt-3 text-4xl font-black text-yellow-400">
                  {totalTrainers}
                </p>
              </div>

              <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Today
                </p>
                <p className="mt-3 text-4xl font-black text-yellow-400">
                  {sessionsToday}
                </p>
              </div>

              <div className="rounded-[2rem] border border-red-500/30 bg-red-500/10 p-5 text-center shadow-2xl backdrop-blur">
                <p className="text-xs font-black uppercase tracking-widest text-red-300">
                  Low
                </p>
                <p className="mt-3 text-4xl font-black text-red-300">
                  {lowSessionClients}
                </p>
              </div>

              <div className="rounded-[2rem] border border-yellow-500/30 bg-yellow-400/10 p-5 text-center shadow-2xl backdrop-blur">
                <p className="text-xs font-black uppercase tracking-widest text-yellow-300">
                  Pending
                </p>
                <p className="mt-3 text-4xl font-black text-yellow-400">
                  {pendingPurchases}
                </p>
              </div>

              <div className="rounded-[2rem] border border-green-500/30 bg-green-500/10 p-5 text-center shadow-2xl backdrop-blur">
                <p className="text-xs font-black uppercase tracking-widest text-green-300">
                  Revenue
                </p>
                <p className="mt-3 text-3xl font-black text-green-300">
                  ${revenueThisMonth.toFixed(0)}
                </p>
              </div>
            </section>
          )}

          <section className="grid gap-4 md:grid-cols-3">
            <Link
              href="/admin/trainers"
              className="rounded-[2rem] border border-yellow-400/60 bg-yellow-400/10 p-7 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/20"
            >
              <p className="mb-4 text-4xl">🏋️</p>
              <h2 className="text-2xl font-black text-white">
                Manage Trainers
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                View trainer contact info, monthly sessions, and session
                history.
              </p>
            </Link>

            <Link
              href="/admin/clients"
              className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-7 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <p className="mb-4 text-4xl">👥</p>
              <h2 className="text-2xl font-black text-white">
                Manage Clients
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                View clients, sessions, QR codes, and client profiles.
              </p>
            </Link>

            <Link
              href="/admin/clients/new"
              className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-7 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <p className="mb-4 text-4xl">➕</p>
              <h2 className="text-2xl font-black text-white">Add Client</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                Create a new client profile and assign sessions.
              </p>
            </Link>

            <Link
              href="/admin/purchases"
              className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-7 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <p className="mb-4 text-4xl">🧾</p>
              <h2 className="text-2xl font-black text-white">Purchases</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                Confirm client purchases and automatically add sessions.
              </p>
            </Link>

            <Link
              href="/admin/membership-plans"
              className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-7 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <p className="mb-4 text-4xl">💳</p>
              <h2 className="text-2xl font-black text-white">
                Membership Plans
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                Create and manage session packages clients can buy.
              </p>
            </Link>

            <Link
              href="/admin/revenue"
              className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-7 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <p className="mb-4 text-4xl">📈</p>
              <h2 className="text-2xl font-black text-white">Revenue</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                View income, expenses, cash flow, and monthly performance.
              </p>
            </Link>

            <Link
              href="/history"
              className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-7 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <p className="mb-4 text-4xl">📋</p>
              <h2 className="text-2xl font-black text-white">
                Session History
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                Review trainer scans and client session logs.
              </p>
            </Link>

            <Link
              href="/admin/low-sessions"
              className="rounded-[2rem] border border-red-500/30 bg-red-500/10 p-7 shadow-2xl backdrop-blur transition hover:border-red-400 hover:bg-red-400/10"
            >
              <p className="mb-4 text-4xl">⚠️</p>
              <h2 className="text-2xl font-black text-white">Low Sessions</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                Follow up with clients who have 2 or fewer sessions.
              </p>
            </Link>

            <Link
              href="/trainer/scan"
              className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-7 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <p className="mb-4 text-4xl">📷</p>
              <h2 className="text-2xl font-black text-white">
                Trainer Scanner
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                Open QR scanner for session check-ins.
              </p>
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}