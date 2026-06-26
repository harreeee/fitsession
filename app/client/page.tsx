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

const MOTIVATION_QUOTES = [
  "Small progress every day becomes big results.",
  "You do not need to be perfect. You just need to show up.",
  "Strong body. Strong mind. Better life.",
  "Today’s effort is tomorrow’s confidence.",
  "Discipline beats motivation. Keep going.",
  "One session at a time. That is how real change happens.",
];

function getDailyQuote() {
  const today = new Date();
  const index =
    (today.getFullYear() + today.getMonth() + today.getDate()) %
    MOTIVATION_QUOTES.length;

  return MOTIVATION_QUOTES[index];
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
    .map((name) => name[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getSessionBarWidth(used: number | null, total: number | null) {
  if (!total || total === 0) return 0;

  return Math.min(100, Math.round(((used ?? 0) / total) * 100));
}

function getSessionTextClass(value: number | null | undefined) {
  const cleanValue = Number(value ?? 0);

  if (cleanValue <= 0) return "text-rose-400";
  if (cleanValue <= 3) return "text-amber-400";

  return "text-emerald-400";
}

function getPackageCompliment(usedPct: number) {
  if (usedPct >= 100) {
    return {
      title: "Package completed!",
      message: "Amazing work. You showed up and finished strong.",
      emoji: "🏆",
    };
  }

  if (usedPct >= 90) {
    return {
      title: "Almost there!",
      message: "You are close to finishing this package. Finish strong.",
      emoji: "🔥",
    };
  }

  if (usedPct >= 70) {
    return {
      title: "Strong progress!",
      message: "You are deep in the process now. Keep the discipline going.",
      emoji: "💪",
    };
  }

  if (usedPct >= 50) {
    return {
      title: "Halfway there!",
      message: "Great job. You have completed half of your package.",
      emoji: "⭐",
    };
  }

  if (usedPct >= 30) {
    return {
      title: "Nice consistency!",
      message: "You are building a real routine. Keep showing up.",
      emoji: "👏",
    };
  }

  if (usedPct >= 20) {
    return {
      title: "Great start!",
      message: "Momentum is building. Small progress becomes big results.",
      emoji: "🚀",
    };
  }

  if (usedPct > 0) {
    return {
      title: "You started!",
      message: "The hardest part is starting. Keep going.",
      emoji: "✅",
    };
  }

  return {
    title: "Ready to begin",
    message: "Book your next session and start building momentum.",
    emoji: "⚡",
  };
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
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>(
    []
  );
  const [qrCode, setQrCode] = useState("");
  const [showQrFullscreen, setShowQrFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/client/login");
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

    const rawBookings = (bookingData || []) as Omit<
      UpcomingBooking,
      "trainer_name"
    >[];

    const trainerIds = Array.from(
      new Set(
        rawBookings
          .map((booking) => booking.trainer_id)
          .filter((trainerId): trainerId is string => Boolean(trainerId))
      )
    );

    if (trainerIds.length === 0) {
      setUpcomingBookings(
        rawBookings.map((booking) => ({
          ...booking,
          trainer_name: "Trainer not assigned",
        }))
      );
      return;
    }

    const { data: trainerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", trainerIds);

    const trainerMap = new Map(
      ((trainerProfiles || []) as TrainerProfile[]).map((profile) => [
        profile.id,
        profile.full_name || "Unknown Trainer",
      ])
    );

    setUpcomingBookings(
      rawBookings.map((booking) => ({
        ...booking,
        trainer_name:
          booking.trainer_id && trainerMap.get(booking.trainer_id)
            ? trainerMap.get(booking.trainer_id)!
            : "Unknown Trainer",
      }))
    );
  }

  async function fetchClientPortal() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      router.push("/client/login");
      return;
    }

    const loginEmail = userData.user.email?.trim().toLowerCase() || "";

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select(
        `id, full_name, email, phone, qr_token, status,
        session_packages (total_sessions, used_sessions, remaining_sessions, status)`
      )
      .or(`profile_id.eq.${userData.user.id},email.eq.${loginEmail}`)
      .limit(1)
      .maybeSingle();

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

    await fetchUpcomingBookings(cleanClient.id);

    setLoading(false);
  }

  useEffect(() => {
    async function protectClientPortal() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/client/login");
        return;
      }

      if (role !== "client") {
        if (role === "admin" || role === "manager") {
          router.push("/admin");
          return;
        }

        if (role === "trainer" || role === "nutrition_coach") {
          router.push("/trainer/scan");
          return;
        }

        await supabase.auth.signOut();
        router.push("/client/login");
        return;
      }

      setCheckingRole(false);
      await fetchClientPortal();
    }

    protectClientPortal();
  }, [router]);

  if (checkingRole || loading || !client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808]">
        <style jsx global>{`
          @keyframes spin-slow {
            to {
              transform: rotate(360deg);
            }
          }

          .spin-slow {
            animation: spin-slow 2s linear infinite;
          }
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
              {checkingRole ? "Verifying access..." : "Loading your portal..."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const activePackage =
    client.session_packages?.find(
      (packageRow) => packageRow.status === "active"
    ) || client.session_packages?.[0];

  const usedPct = getSessionBarWidth(
    activePackage?.used_sessions ?? 0,
    activePackage?.total_sessions ?? 0
  );

  const packageCompliment = getPackageCompliment(usedPct);
  const quote = getDailyQuote();

  return (
    <main className="min-h-screen overflow-y-auto bg-[#080808] text-white">
      <style jsx global>{`
        html,
        body {
          background: #080808;
        }

        ::-webkit-scrollbar {
          width: 6px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: #facc15;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #fde047;
        }

        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(12px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .fade-up {
          animation: fade-up 0.45s ease both;
        }

        @keyframes glow-pulse {
          0%,
          100% {
            box-shadow: 0 0 24px rgba(250, 204, 21, 0.15);
          }

          50% {
            box-shadow: 0 0 42px rgba(250, 204, 21, 0.3);
          }
        }

        .glow-pulse {
          animation: glow-pulse 3s ease-in-out infinite;
        }
      `}</style>

      <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 md:px-6 md:pt-8">
        <nav className="fade-up mb-5 flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
          <span className="text-[11px] font-bold uppercase tracking-[0.35em] text-yellow-400">
            FXA FITNESS
          </span>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-yellow-400/50 hover:text-yellow-400"
          >
            Log out
          </button>
        </nav>

        <section className="fade-up mb-5 overflow-hidden rounded-[2rem] border border-yellow-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.22),_transparent_35%),linear-gradient(135deg,_#17120a,_#0b0b0b_55%,_#050505)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-yellow-400">
                Welcome back
              </p>

              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
                {getFirstName(client.full_name)}
              </h1>

              <p className="mt-3 max-w-md text-sm leading-6 text-gray-300">
                {quote}
              </p>
            </div>

            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-yellow-300 to-amber-500 text-xl font-black text-black shadow-lg shadow-yellow-400/10">
              {getInitials(client.full_name)}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <StatusPill status={client.status} />

            {client.email ? (
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-gray-300">
                {client.email}
              </span>
            ) : null}

            {client.phone ? (
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-gray-300">
                {client.phone}
              </span>
            ) : null}
          </div>
        </section>

        <section className="fade-up mb-5">
          <div className="overflow-hidden rounded-[2rem] border border-yellow-400/20 bg-gradient-to-br from-[#111008] to-[#0d0d0d] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-400/80">
                  Active Package
                </p>

                <div className="mt-3 flex items-end gap-2">
                  <span
                    className={`text-5xl font-black tabular-nums leading-none tracking-tight ${getSessionTextClass(
                      activePackage?.remaining_sessions
                    )}`}
                  >
                    {activePackage?.remaining_sessions ?? 0}
                  </span>

                  <span className="mb-1 text-sm text-gray-500">
                    / {activePackage?.total_sessions ?? 0} sessions left
                  </span>
                </div>
              </div>

              <div className="relative h-16 w-16 shrink-0">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 56 56">
                  <circle
                    cx="28"
                    cy="28"
                    r="22"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="6"
                  />

                  <circle
                    cx="28"
                    cy="28"
                    r="22"
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

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-[11px] text-gray-500">
                <span>{activePackage?.used_sessions ?? 0} used</span>
                <span>{activePackage?.remaining_sessions ?? 0} remaining</span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-700"
                  style={{ width: `${usedPct}%` }}
                />
              </div>

              <div className="mt-5 rounded-3xl border border-yellow-400/20 bg-yellow-400/[0.08] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-xl text-black">
                    {packageCompliment.emoji}
                  </div>

                  <div>
                    <p className="text-sm font-bold text-yellow-300">
                      {packageCompliment.title}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-yellow-100/75">
                      {packageCompliment.message}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500">
                    Total
                  </p>
                  <p className="mt-1 text-lg font-bold text-white">
                    {activePackage?.total_sessions ?? 0}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500">
                    Used
                  </p>
                  <p className="mt-1 text-lg font-bold text-yellow-300">
                    {activePackage?.used_sessions ?? 0}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500">
                    Left
                  </p>
                  <p
                    className={`mt-1 text-lg font-bold ${getSessionTextClass(
                      activePackage?.remaining_sessions
                    )}`}
                  >
                    {activePackage?.remaining_sessions ?? 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="fade-up mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Link
            href="/client/book"
            className="group flex flex-col gap-2 rounded-3xl border border-yellow-400 bg-yellow-400 p-5 text-black transition hover:bg-yellow-300 active:scale-[0.97]"
          >
            <span className="text-2xl">📅</span>
            <span className="text-sm font-bold uppercase tracking-wide">
              Book Session
            </span>
            <span className="text-xs leading-5 text-black/60">
              Reserve your next slot
            </span>
          </Link>

          <Link
            href="/client/history"
            className="group flex flex-col gap-2 rounded-3xl border border-yellow-400/30 bg-yellow-400/[0.08] p-5 transition hover:border-yellow-400/60 hover:bg-yellow-400/[0.12] active:scale-[0.97]"
          >
            <span className="text-2xl">📋</span>
            <span className="text-sm font-bold uppercase tracking-wide text-white">
              History
            </span>
            <span className="text-xs leading-5 text-gray-500">
              View training records
            </span>
          </Link>

          <Link
            href="/client/membership"
            className="group col-span-2 flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-yellow-400/30 hover:bg-white/[0.07] active:scale-[0.97] md:col-span-1"
          >
            <span className="text-2xl">💳</span>
            <span className="text-sm font-bold uppercase tracking-wide text-white">
              Membership
            </span>
            <span className="text-xs leading-5 text-gray-500">
              Packages & purchases
            </span>
          </Link>
        </section>

        <section className="fade-up mb-5">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl">
            <div className="flex items-start justify-between gap-4 p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  Trainer Scan Code
                </p>

                <h2 className="mt-2 text-xl font-semibold text-white">
                  Your QR Code
                </h2>

                <p className="mt-1.5 max-w-[210px] text-xs leading-5 text-gray-500">
                  Show this QR code to your trainer to mark your session.
                </p>

                {qrCode ? (
                  <button
                    type="button"
                    onClick={() => setShowQrFullscreen(true)}
                    className="mt-4 rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold uppercase text-black transition hover:bg-yellow-300 active:scale-[0.97]"
                  >
                    Full Screen
                  </button>
                ) : null}
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

            <div className="border-t border-white/10 px-6 py-3">
              <p className="text-[11px] text-gray-600">
                Tip: rotate your phone to landscape for easier scanning.
              </p>
            </div>
          </div>
        </section>

        <section className="fade-up">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              Upcoming Sessions
            </h2>

            <Link
              href="/client/book"
              className="text-[11px] font-semibold text-yellow-400 transition hover:text-yellow-300"
            >
              + Book new
            </Link>
          </div>

          {upcomingBookings.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-3xl">🗓️</p>

              <p className="mt-3 text-sm font-medium text-white">
                No upcoming sessions
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Book your next training slot and keep the momentum going.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition hover:border-yellow-400/20"
                >
                  <div className="flex items-start gap-4 p-5">
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-2xl border border-white/10 bg-black/30 py-2.5 text-center">
                      <span className="text-[10px] font-semibold uppercase text-gray-500">
                        {new Date(booking.starts_at).toLocaleString("en-CA", {
                          month: "short",
                        })}
                      </span>

                      <span className="text-xl font-bold leading-none text-yellow-400">
                        {new Date(booking.starts_at).getDate()}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-white">
                            {formatTimeOnly(booking.starts_at)} -{" "}
                            {formatTimeOnly(booking.ends_at)}
                          </p>

                          <p className="mt-1 text-xs text-gray-400">
                            {formatDateOnly(booking.starts_at)}
                          </p>
                        </div>

                        <StatusPill status={booking.status} />
                      </div>

                      <p className="mt-2 text-xs text-gray-500">
                        Trainer:{" "}
                        <span className="text-gray-300">
                          {booking.trainer_name}
                        </span>
                      </p>

                      {booking.notes ? (
                        <p className="mt-3 rounded-xl border border-yellow-400/10 bg-yellow-400/[0.05] p-3 text-xs leading-5 text-yellow-200/80">
                          {booking.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showQrFullscreen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
          <div className="relative flex w-full max-w-sm flex-col items-center rounded-[2.5rem] border border-white/10 bg-[#0a0a0a] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
            <button
              type="button"
              onClick={() => setShowQrFullscreen(false)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-gray-400 transition hover:border-white/20 hover:text-white"
            >
              X
            </button>

            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-yellow-400">
              FXA FITNESS
            </p>

            <h2 className="mt-2 text-xl font-semibold text-white">
              Scan this code
            </h2>

            <p className="mt-1 text-center text-xs leading-5 text-gray-500">
              Show your trainer to mark a completed session.
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
          </div>
        </div>
      ) : null}
    </main>
  );
}