"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

export default function AdminDashboardPage() {
  const router = useRouter();

  const [totalClients, setTotalClients] = useState(0);
  const [activeClients, setActiveClients] = useState(0);
  const [sessionsToday, setSessionsToday] = useState(0);
  const [lowSessionClients, setLowSessionClients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function fetchDashboardStats() {
    const { data: clients } = await supabase
      .from("clients")
      .select(`
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

    const allClients = clients || [];

    setTotalClients(allClients.length);

    setActiveClients(
      allClients.filter((client) => client.status === "active").length
    );

    setSessionsToday((logs || []).length);

    const lowClients = allClients.filter((client) => {
      const activePackage = client.session_packages?.[0];
      return activePackage && activePackage.remaining_sessions <= 2;
    });

    setLowSessionClients(lowClients.length);
    setLoading(false);
  }

  useEffect(() => {
    async function protectAdminPage() {
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

    protectAdminPage();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">
            Checking admin access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
        <div className="max-w-7xl mx-auto">
          <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-5xl md:text-6xl font-black text-yellow-400">
                FXA FITNESS
              </h1>

              <p className="text-gray-400 tracking-[0.3em] uppercase text-sm">
                Admin Dashboard
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-yellow-400 px-5 py-3 font-black uppercase text-yellow-400 hover:bg-yellow-400 hover:text-black transition"
            >
              Logout
            </button>
          </header>

          {loading ? (
            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur">
              <p className="font-bold text-yellow-400">
                Loading dashboard...
              </p>
            </div>
          ) : (
            <section className="mb-8 grid gap-4 md:grid-cols-4">
              <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 text-center shadow-2xl backdrop-blur">
                <p className="text-sm font-black uppercase tracking-wide text-gray-300">
                  Total Clients
                </p>
                <p className="mt-3 text-5xl font-black text-yellow-400">
                  {totalClients}
                </p>
              </div>

              <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 text-center shadow-2xl backdrop-blur">
                <p className="text-sm font-black uppercase tracking-wide text-gray-300">
                  Active Clients
                </p>
                <p className="mt-3 text-5xl font-black text-yellow-400">
                  {activeClients}
                </p>
              </div>

              <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 text-center shadow-2xl backdrop-blur">
                <p className="text-sm font-black uppercase tracking-wide text-gray-300">
                  Sessions Today
                </p>
                <p className="mt-3 text-5xl font-black text-yellow-400">
                  {sessionsToday}
                </p>
              </div>

              <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-6 text-center shadow-2xl backdrop-blur">
                <p className="text-sm font-black uppercase tracking-wide text-red-300">
                  Low Sessions
                </p>
                <p className="mt-3 text-5xl font-black text-red-400">
                  {lowSessionClients}
                </p>
              </div>
            </section>
          )}

          <section className="grid gap-4 md:grid-cols-3">
            <Link
              href="/admin/clients"
              className="group rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <div className="mb-4 text-4xl">👥</div>
              <h2 className="text-2xl font-black text-white group-hover:text-yellow-400">
                Manage Clients
              </h2>
              <p className="mt-2 text-gray-400">
                View clients, sessions, QR codes, and profiles.
              </p>
            </Link>

            <Link
              href="/admin/clients/new"
              className="group rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <div className="mb-4 text-4xl">➕</div>
              <h2 className="text-2xl font-black text-white group-hover:text-yellow-400">
                Add Client
              </h2>
              <p className="mt-2 text-gray-400">
                Create a new client and assign session packages.
              </p>
            </Link>

            <Link
              href="/history"
              className="group rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <div className="mb-4 text-4xl">📋</div>
              <h2 className="text-2xl font-black text-white group-hover:text-yellow-400">
                Session History
              </h2>
              <p className="mt-2 text-gray-400">
                Review completed scans, trainers, and remaining sessions.
              </p>
            </Link>

            <Link
              href="/admin/low-sessions"
              className="group rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <div className="mb-4 text-4xl">⚠️</div>
              <h2 className="text-2xl font-black text-white group-hover:text-yellow-400">
                Low Sessions
              </h2>
              <p className="mt-2 text-gray-400">
                See clients with 2 or fewer sessions left.
              </p>
            </Link>

            <Link
              href="/trainer/scan"
              className="group rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <div className="mb-4 text-4xl">📷</div>
              <h2 className="text-2xl font-black text-white group-hover:text-yellow-400">
                Trainer Scanner
              </h2>
              <p className="mt-2 text-gray-400">
                Scan client QR codes and mark training sessions.
              </p>
            </Link>

            <Link
              href="/login"
              className="group rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur transition hover:border-yellow-400 hover:bg-yellow-400/10"
            >
              <div className="mb-4 text-4xl">🔐</div>
              <h2 className="text-2xl font-black text-white group-hover:text-yellow-400">
                Login Page
              </h2>
              <p className="mt-2 text-gray-400">
                Return to the main staff login screen.
              </p>
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}