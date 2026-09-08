"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { staffFetch } from "@/lib/staffFetch";
import type { StaffAccessSnapshot } from "@/lib/staffAccess";

const card = "rounded-3xl border border-white/10 bg-white/[0.06] p-5 transition hover:border-yellow-400/40";

export default function StaffToolsPage() {
  const router = useRouter();
  const [access, setAccess] = useState<StaffAccessSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void staffFetch<StaffAccessSnapshot>("/api/staff/access")
      .then(setAccess)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Access check failed.";
        setError(message);
        if (/sign in/i.test(message)) router.push("/login");
      });
  }, [router]);

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-5 md:p-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-7 pt-20 md:pt-16">
            <p className="text-xs font-black uppercase tracking-[0.4em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-2 text-4xl font-black md:text-6xl">Staff Tools</h1>
            <p className="mt-3 text-sm text-gray-400">
              {access ? `${access.fullName || "Staff"} · ${access.role || "staff"}` : "Checking access..."}
            </p>
          </header>

          {error ? <p className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p> : null}

          {access ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {["admin", "manager", "nutrition_coach"].includes(String(access.role || "")) ? (
                <Link href="/nutrition" className="rounded-3xl border border-yellow-400/30 bg-yellow-400/[0.08] p-5 transition hover:border-yellow-400/70 hover:bg-yellow-400/[0.12]">
                  <p className="text-xs font-bold uppercase tracking-widest text-yellow-400">Nutrition workspace</p>
                  <h2 className="mt-2 text-2xl font-black">Nutrition</h2>
                  <p className="mt-2 text-sm text-gray-400">See every client, follow priority, current status, coach assignment and follow history.</p>
                </Link>
              ) : null}

              {access.canViewRevenue ? (
                <Link href="/staff/revenue" className={card}>
                  <p className="text-xs font-bold uppercase tracking-widest text-yellow-400">Read only</p>
                  <h2 className="mt-2 text-2xl font-black">Revenue</h2>
                  <p className="mt-2 text-sm text-gray-400">View monthly income, expenses and net result.</p>
                </Link>
              ) : null}

              {access.canViewClients ? (
                <Link href="/staff/clients" className={card}>
                  <p className="text-xs font-bold uppercase tracking-widest text-yellow-400">Read only</p>
                  <h2 className="mt-2 text-2xl font-black">Clients List</h2>
                  <p className="mt-2 text-sm text-gray-400">View the full client roster and coach assignments.</p>
                </Link>
              ) : null}

              {access.canViewBookedCalendar ? (
                <Link href="/staff/booked-calendar" className={card}>
                  <p className="text-xs font-bold uppercase tracking-widest text-yellow-400">This week</p>
                  <h2 className="mt-2 text-2xl font-black">Booked Calendar</h2>
                  <p className="mt-2 text-sm text-gray-400">View all booked sessions for the current Toronto week.</p>
                </Link>
              ) : null}

              {access.canManagePermissions ? (
                <Link href="/admin/staff-permissions" className={card}>
                  <p className="text-xs font-bold uppercase tracking-widest text-sky-300">Admin</p>
                  <h2 className="mt-2 text-2xl font-black">Staff Permissions</h2>
                  <p className="mt-2 text-sm text-gray-400">Choose feature access for trainers and nutrition coaches.</p>
                </Link>
              ) : null}

              {access.role === "trainer" ? (
                <Link href="/trainer/calendar" className={card}>
                  <h2 className="text-2xl font-black">My Schedule</h2>
                  <p className="mt-2 text-sm text-gray-400">Manage your availability and your own bookings.</p>
                </Link>
              ) : null}

              {(access.role === "trainer" || access.role === "nutrition_coach") ? (
                <Link href="/trainer/scan" className={card}>
                  <h2 className="text-2xl font-black">Scanner</h2>
                  <p className="mt-2 text-sm text-gray-400">Return to your session workspace.</p>
                </Link>
              ) : (
                <Link href="/admin" className={card}>
                  <h2 className="text-2xl font-black">Admin Dashboard</h2>
                  <p className="mt-2 text-sm text-gray-400">Return to management dashboard.</p>
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
