"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { getCurrentUserRole } from "../../lib/checkUserRole";

type ClientData = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  qr_token: string | null;
  status: string | null;
  session_packages: {
    total_sessions: number | null;
    used_sessions: number | null;
    remaining_sessions: number | null;
    status: string | null;
  }[];
};

type SessionHistoryLog = {
  id: string;
  trainer_id: string | null;
  status: string;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string;
  trainer_name: string;
};

type UpcomingBooking = {
  id: string;
  trainer_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  trainer_name: string;
};

type TrainerProfile = {
  id: string;
  full_name: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getFirstName(fullName: string) {
  return fullName.trim().split(" ")[0] || "Client";
}

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getSessionBarWidth(used: number | null, total: number | null) {
  if (!total || total === 0) return 0;
  return Math.min(100, Math.round(((used ?? 0) / total) * 100));
}

function getSessionTextClass(value: number | null | undefined) {
  const v = Number(value ?? 0);
  if (v <= 0) return "text-rose-400";
  if (v <= 3) return "text-amber-400";
  return "text-emerald-400";
}

function getStatusBadge(status: string | null) {
  if (status === "active" || status === "success" || status === "booked") {
    return {
      dot: "bg-emerald-400",
      pill: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    };
  }
  if (status === "inactive" || status === "failed" || status === "cancelled") {
    return {
      dot: "bg-rose-400",
      pill: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    };
  }
  return {
    dot: "bg-amber-400",
    pill: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  };
}

function StatusPill({ status }: { status: string | null }) {
  const { dot, pill } = getStatusBadge(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] ${pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status ?? "unknown"}
    </span>
  );
}

export default function ClientPortalPage() {
  const router = useRouter();

  const [client, setClient] = useState<ClientData | null>(null);
  const [logs, setLogs] = useState<SessionHistoryLog[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>([]);
  const [qrCode, setQrCode] = useState("");
  const [showQrFullscreen, setShowQrFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/client/login");
  }

  async function fetchLogsWithTrainerNames(clientId: string) {
    const { data: logData, error: logError } = await supabase
      .from("session_history")
      .select(`id, trainer_id, status, message, trainer_note, remaining_after, created_at`)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(6);

    if (logError) {
      console.log("Session history error:", logError.message);
      setLogs([]);
      return;
    }

    const rawLogs = (logData || []) as Omit<SessionHistoryLog, "trainer_name">[];
    const trainerIds = Array.from(
      new Set(rawLogs.map((l) => l.trainer_id).filter(Boolean))
    ) as string[];

    if (trainerIds.length === 0) {
      setLogs(rawLogs.map((l) => ({ ...l, trainer_name: "Unknown Trainer" })));
      return;
    }

    const { data: trainerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", trainerIds);

    const map = new Map(
      ((trainerProfiles || []) as TrainerProfile[]).map((p) => [
        p.id,
        p.full_name || "Unknown Trainer",
      ])
    );

    setLogs(
      rawLogs.map((l) => ({
        ...l,
        trainer_name:
          l.trainer_id && map.get(l.trainer_id)
            ? map.get(l.trainer_id)!
            : "Unknown Trainer",
      }))
    );
  }

  async function fetchUpcomingBookings(clientId: string) {
    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .select("id, trainer_id, starts_at, ends_at, status, notes")
      .eq("client_id", clientId)
      .eq("status", "booked")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(3);

    if (bookingError) {
      console.log("Upcoming bookings error:", bookingError.message);
      setUpcomingBookings([]);
      return;
    }

    const rawBookings = (bookingData || []) as Omit<UpcomingBooking, "trainer_name">[];
    const trainerIds = Array.from(
      new Set(rawBookings.map((b) => b.trainer_id).filter(Boolean))
    ) as string[];

    if (trainerIds.length === 0) {
      setUpcomingBookings(
        rawBookings.map((b) => ({ ...b, trainer_name: "Trainer not assigned" }))
      );
      return;
    }

    const { data: trainerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", trainerIds);

    const map = new Map(
      ((trainerProfiles || []) as TrainerProfile[]).map((p) => [
        p.id,
        p.full_name || "Unknown Trainer",
      ])
    );

    setUpcomingBookings(
      rawBookings.map((b) => ({
        ...b,
        trainer_name:
          b.trainer_id && map.get(b.trainer_id)
            ? map.get(b.trainer_id)!
            : "Unknown Trainer",
      }))
    );
  }

  async function fetchClientPortal() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/client/login");
      return;
    }

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select(`id, full_name, email, phone, qr_token, status,
        session_packages (total_sessions, used_sessions, remaining_sessions, status)`)
      .eq("profile_id", userData.user.id)
      .single();

    if (clientError || !clientData) {
      alert("No client account is linked to this login.");
      await supabase.auth.signOut();
      router.push("/client/login");
      return;
    }

    const cleanClient = clientData as ClientData;
    setClient(cleanClient);

    if (cleanClient.qr_token) {
      const qrImage = await QRCode.toDataURL(cleanClient.qr_token, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 700,
      });
      setQrCode(qrImage);
    } else {
      setQrCode("");
    }

    await fetchLogsWithTrainerNames(cleanClient.id);
    await fetchUpcomingBookings(cleanClient.id);
    setLoading(false);
  }

  useEffect(() => {
    async function protectClientPortal() {
      const { user, role } = await getCurrentUserRole();
      if (!user) { router.push("/client/login"); return; }
      if (role !== "client") {
        if (role === "admin") { router.push("/admin"); return; }
        if (role === "trainer" || role === "nutrition_coach") { router.push("/trainer/scan"); return; }
        await supabase.auth.signOut();
        router.push("/client/login");
        return;
      }
      setCheckingRole(false);
      await fetchClientPortal();
    }
    protectClientPortal();
  }, [router]);

  // ── Splash screens ──────────────────────────────────────────
  if (checkingRole || loading || !client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808]">
        <style jsx global>{`
          @keyframes spin-slow { to { transform: rotate(360deg); } }
          .spin-slow { animation: spin-slow 2s linear infinite; }
        `}</style>
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="relative h-14 w-14">
            <div className="absolute inset-0 rounded-full border-2 border-yellow-400/20" />
            <div className="spin-slow absolute inset-0 rounded-full border-t-2 border-yellow-400" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-yellow-400">
              FXA FITNESS
            </p>
            <p className="mt-1.5 text-sm text-gray-400">
              {checkingRole ? "Verifying access…" : "Loading your portal…"}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const activePackage =
    client.session_packages?.find((p) => p.status === "active") ||
    client.session_packages?.[0];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todaysSessions = logs.filter(
    (l) => l.status === "success" && new Date(l.created_at).getTime() >= today.getTime()
  );
  const todaysTrainerNames = Array.from(new Set(todaysSessions.map((l) => l.trainer_name)));

  const usedPct = getSessionBarWidth(
    activePackage?.used_sessions ?? 0,
    activePackage?.total_sessions ?? 0
  );

  return (
    <main className="portal-root min-h-screen overflow-y-auto bg-[#080808] text-white">
      {/* ── Global styles ───────────────────────────────── */}
      <style jsx global>{`
        html, body { background: #080808; }

        /* scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: #facc15;
          border-radius: 999px;
        }
        ::-webkit-scrollbar-thumb:hover { background: #fde047; }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fade-up 0.45s ease both; }
        .fade-up-1 { animation-delay: 0.05s; }
        .fade-up-2 { animation-delay: 0.12s; }
        .fade-up-3 { animation-delay: 0.19s; }
        .fade-up-4 { animation-delay: 0.26s; }
        .fade-up-5 { animation-delay: 0.33s; }

        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(250,204,21,0.15); }
          50%       { box-shadow: 0 0 40px rgba(250,204,21,0.30); }
        }
        .glow-pulse { animation: glow-pulse 3s ease-in-out infinite; }
      `}</style>

      <div className="mx-auto max-w-2xl px-4 pb-16 pt-8 md:px-6">

        {/* ── Top nav bar ─────────────────────────────────── */}
        <nav className="fade-up mb-8 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.35em] text-yellow-400">
            FXA FITNESS
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-yellow-400/50 hover:text-yellow-400"
          >
            Log out
          </button>
        </nav>

        {/* ── Hero greeting ───────────────────────────────── */}
        <section className="fade-up fade-up-1 mb-8">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 text-lg font-bold text-black shadow-lg">
              {getInitials(client.full_name)}
            </div>
            <div>
              <p className="text-xs text-gray-500">Welcome back</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                {getFirstName(client.full_name)}
              </h1>
            </div>
            <div className="ml-auto">
              <StatusPill status={client.status} />
            </div>
          </div>

          {/* contact row */}
          <div className="mt-4 flex flex-wrap gap-3">
            {client.email && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-gray-400">
                <svg className="h-3 w-3 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {client.email}
              </span>
            )}
            {client.phone && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-gray-400">
                <svg className="h-3 w-3 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {client.phone}
              </span>
            )}
          </div>
        </section>

        {/* ── Session package card ─────────────────────────── */}
        <section className="fade-up fade-up-2 mb-5">
          <div className="overflow-hidden rounded-3xl border border-yellow-400/20 bg-gradient-to-br from-[#111008] to-[#0d0d0d] p-6 shadow-2xl">
            {/* top row */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-400/80">
                  Active Package
                </p>
                <div className="mt-3 flex items-end gap-2">
                  <span className={`text-5xl font-bold tabular-nums leading-none tracking-tight ${getSessionTextClass(activePackage?.remaining_sessions)}`}>
                    {activePackage?.remaining_sessions ?? 0}
                  </span>
                  <span className="mb-1 text-sm text-gray-500">
                    / {activePackage?.total_sessions ?? 0} sessions left
                  </span>
                </div>
              </div>

              {/* Donut-style ring */}
              <div className="relative h-16 w-16 shrink-0">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                  <circle
                    cx="28" cy="28" r="22"
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${(usedPct / 100) * 138.2} 138.2`}
                    className="transition-all duration-700"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-yellow-400">
                  {usedPct}%
                </span>
              </div>
            </div>

            {/* progress bar */}
            <div className="mt-5">
              <div className="flex justify-between text-[11px] text-gray-500 mb-2">
                <span>{activePackage?.used_sessions ?? 0} used</span>
                <span>{activePackage?.remaining_sessions ?? 0} remaining</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-700"
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Quick actions ────────────────────────────────── */}
        <section className="fade-up fade-up-2 mb-5 grid grid-cols-2 gap-3">
          <Link
            href="/client/book"
            className="group flex flex-col gap-2 rounded-3xl border border-yellow-400 bg-yellow-400 p-5 text-black transition duration-200 hover:bg-yellow-300 active:scale-[0.97]"
          >
            <span className="text-2xl">📅</span>
            <span className="text-sm font-bold uppercase tracking-wide">Book Session</span>
            <span className="text-xs text-black/60 leading-5">Reserve your next training slot</span>
          </Link>

          <Link
            href="/client/membership"
            className="group flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition duration-200 hover:border-yellow-400/30 hover:bg-white/[0.07] active:scale-[0.97]"
          >
            <span className="text-2xl">💳</span>
            <span className="text-sm font-bold uppercase tracking-wide text-white">Membership</span>
            <span className="text-xs leading-5 text-gray-500">Packages & purchase history</span>
          </Link>
        </section>

        {/* ── Today's trainer ──────────────────────────────── */}
        {todaysTrainerNames.length > 0 && (
          <section className="fade-up fade-up-3 mb-5">
            <div className="flex items-center gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] px-5 py-4">
              <span className="text-xl">🏋️</span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                  Today's Trainer
                </p>
                <p className="mt-0.5 text-sm font-medium text-white">
                  {todaysTrainerNames.join(", ")}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── QR code card ─────────────────────────────────── */}
        <section className="fade-up fade-up-3 mb-5">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
            <div className="flex items-start justify-between gap-4 p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  Trainer Scan Code
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">Your QR Code</h2>
                <p className="mt-1.5 max-w-[200px] text-xs leading-5 text-gray-500">
                  Show to your trainer so they can mark your session.
                </p>
                {qrCode && (
                  <button
                    type="button"
                    onClick={() => setShowQrFullscreen(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold uppercase text-black transition hover:bg-yellow-300 active:scale-[0.97]"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    Full Screen
                  </button>
                )}
              </div>

              <div className="glow-pulse shrink-0 rounded-2xl border border-yellow-400/30 bg-white p-2.5 shadow-xl">
                {qrCode ? (
                  <img
                    src={qrCode}
                    alt="Client QR Code"
                    className="h-32 w-32 rounded-xl object-contain sm:h-36 sm:w-36"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-xl bg-gray-100 text-center text-[11px] text-gray-400 sm:h-36 sm:w-36">
                    Not available
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/6 px-6 py-3">
              <p className="text-[11px] text-gray-600">
                💡 Tip: rotate your phone to landscape for easier scanning
              </p>
            </div>
          </div>
        </section>

        {/* ── Upcoming sessions ────────────────────────────── */}
        <section className="fade-up fade-up-4 mb-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Upcoming Sessions</h2>
            <Link
              href="/client/book"
              className="text-[11px] font-semibold text-yellow-400 transition hover:text-yellow-300"
            >
              + Book new
            </Link>
          </div>

          {upcomingBookings.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-3xl">🗓️</p>
              <p className="mt-3 text-sm font-medium text-white">No upcoming sessions</p>
              <p className="mt-1 text-xs text-gray-500">Book your next training slot below.</p>
              <Link
                href="/client/book"
                className="mt-4 inline-block rounded-xl bg-yellow-400 px-5 py-2.5 text-xs font-bold uppercase text-black transition hover:bg-yellow-300"
              >
                Book Session
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((booking, i) => (
                <div
                  key={booking.id}
                  className={`overflow-hidden rounded-3xl border border-white/8 bg-white/[0.04] transition hover:border-yellow-400/20 ${i === 0 ? "ring-1 ring-yellow-400/15" : ""}`}
                >
                  <div className="flex items-start gap-4 p-5">
                    {/* date block */}
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-2xl border border-white/10 bg-black/30 py-2.5 text-center">
                      <span className="text-[10px] font-semibold uppercase text-gray-500">
                        {new Date(booking.starts_at).toLocaleString("en-CA", { month: "short" })}
                      </span>
                      <span className="text-xl font-bold leading-none text-yellow-400">
                        {new Date(booking.starts_at).getDate()}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-white">
                            {formatTimeOnly(booking.starts_at)} – {formatTimeOnly(booking.ends_at)}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            {formatDateOnly(booking.starts_at)}
                          </p>
                        </div>
                        <StatusPill status={booking.status} />
                      </div>

                      <p className="mt-2 text-xs text-gray-500">
                        Trainer:{" "}
                        <span className="text-gray-300">{booking.trainer_name}</span>
                      </p>
                    </div>
                  </div>

                  {booking.notes && (
                    <div className="border-t border-yellow-400/10 bg-yellow-400/[0.05] px-5 py-3">
                      <p className="text-xs leading-5 text-yellow-200/80">{booking.notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Recent sessions ──────────────────────────────── */}
        <section className="fade-up fade-up-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-white">Recent Sessions</h2>
            <p className="mt-0.5 text-xs text-gray-500">Your last 6 training records</p>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-3xl">📋</p>
              <p className="mt-3 text-sm font-medium text-white">No sessions recorded yet</p>
              <p className="mt-1 text-xs text-gray-500">Your history will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="overflow-hidden rounded-3xl border border-white/8 bg-white/[0.04] transition hover:border-white/12"
                >
                  <div className="flex items-start gap-4 p-5">
                    {/* status dot column */}
                    <div className="mt-1 flex shrink-0 flex-col items-center gap-1">
                      <div className={`h-2.5 w-2.5 rounded-full ${getStatusBadge(log.status).dot} shadow-[0_0_6px_currentColor]`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <StatusPill status={log.status} />
                          <p className="mt-2 text-xs text-gray-400">
                            {formatDateTime(log.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-gray-600">Sessions left</p>
                          <p className={`text-lg font-bold ${getSessionTextClass(log.remaining_after)}`}>
                            {log.remaining_after ?? "-"}
                          </p>
                        </div>
                      </div>

                      <p className="mt-2 text-xs text-gray-500">
                        Trainer:{" "}
                        <span className="text-gray-300">{log.trainer_name}</span>
                      </p>
                    </div>
                  </div>

                  {log.trainer_note && (
                    <div className="border-t border-yellow-400/10 bg-yellow-400/[0.05] px-5 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-yellow-500/70 mb-1">
                        Trainer note
                      </p>
                      <p className="text-xs leading-5 text-yellow-100/80">{log.trainer_note}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── QR Fullscreen Modal ──────────────────────────────── */}
      {showQrFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
          <div className="relative flex w-full max-w-sm flex-col items-center rounded-[2.5rem] border border-white/10 bg-[#0a0a0a] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
            {/* close */}
            <button
              type="button"
              onClick={() => setShowQrFullscreen(false)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-gray-400 transition hover:border-white/20 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-yellow-400">
              FXA FITNESS
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Scan this code</h2>
            <p className="mt-1 text-center text-xs leading-5 text-gray-500">
              Show your trainer to mark a completed session
            </p>

            <div className="glow-pulse mt-6 rounded-3xl border border-yellow-400/30 bg-white p-4 shadow-2xl">
              {qrCode ? (
                <img
                  src={qrCode}
                  alt="QR Code"
                  className="h-[min(68vw,300px)] w-[min(68vw,300px)] rounded-2xl object-contain"
                />
              ) : (
                <div className="flex h-[min(68vw,300px)] w-[min(68vw,300px)] items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-400">
                  Not available
                </div>
              )}
            </div>

            <p className="mt-5 rounded-2xl border border-yellow-400/15 bg-yellow-400/[0.07] px-4 py-3 text-center text-xs text-yellow-200/70">
              💡 Rotate to landscape for a larger scan area
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
