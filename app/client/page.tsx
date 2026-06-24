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
  qr_token: string;
  status: string;
  session_packages: {
    total_sessions: number | null;
    used_sessions: number;
    remaining_sessions: number;
    status: string;
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

export default function ClientPortalPage() {
  const router = useRouter();

  const [client, setClient] = useState<ClientData | null>(null);
  const [logs, setLogs] = useState<SessionHistoryLog[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>(
    []
  );
  const [qrCode, setQrCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/client/login");
  }

  async function fetchLogsWithTrainerNames(clientId: string) {
    const { data: logData, error: logError } = await supabase
      .from("session_history")
      .select(
        `
        id,
        trainer_id,
        status,
        message,
        trainer_note,
        remaining_after,
        created_at
      `
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (logError) {
      console.log("Session history error:", logError.message);
      setLogs([]);
      return;
    }

    const rawLogs = (logData || []) as Omit<
      SessionHistoryLog,
      "trainer_name"
    >[];

    const trainerIds = Array.from(
      new Set(rawLogs.map((log) => log.trainer_id).filter(Boolean))
    ) as string[];

    if (trainerIds.length === 0) {
      setLogs(
        rawLogs.map((log) => ({
          ...log,
          trainer_name: "Unknown Trainer",
        }))
      );
      return;
    }

    const { data: trainerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", trainerIds);

    const trainerNameMap = new Map(
      ((trainerProfiles || []) as TrainerProfile[]).map((profile) => [
        profile.id,
        profile.full_name || "Unknown Trainer",
      ])
    );

    setLogs(
      rawLogs.map((log) => ({
        ...log,
        trainer_name:
          log.trainer_id && trainerNameMap.get(log.trainer_id)
            ? trainerNameMap.get(log.trainer_id)!
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
      .limit(5);

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
      new Set(rawBookings.map((booking) => booking.trainer_id).filter(Boolean))
    ) as string[];

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

    const trainerNameMap = new Map(
      ((trainerProfiles || []) as TrainerProfile[]).map((profile) => [
        profile.id,
        profile.full_name || "Unknown Trainer",
      ])
    );

    setUpcomingBookings(
      rawBookings.map((booking) => ({
        ...booking,
        trainer_name:
          booking.trainer_id && trainerNameMap.get(booking.trainer_id)
            ? trainerNameMap.get(booking.trainer_id)!
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

    const userId = userData.user.id;

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select(
        `
        id,
        full_name,
        email,
        phone,
        qr_token,
        status,
        session_packages (
          total_sessions,
          used_sessions,
          remaining_sessions,
          status
        )
      `
      )
      .eq("profile_id", userId)
      .single();

    if (clientError || !clientData) {
      alert("No client account is linked to this login.");
      await supabase.auth.signOut();
      router.push("/client/login");
      return;
    }

    const cleanClient = clientData as ClientData;

    setClient(cleanClient);

    const qrImage = await QRCode.toDataURL(cleanClient.qr_token);
    setQrCode(qrImage);

    await fetchLogsWithTrainerNames(cleanClient.id);
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
        if (role === "admin") {
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

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">
            Checking client access...
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">
            Loading your client portal...
          </p>
        </div>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">
            Client account not found.
          </p>
        </div>
      </main>
    );
  }

  const activePackage =
    client.session_packages?.find(
      (packageRow) => packageRow.status === "active"
    ) || client.session_packages?.[0];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todaysSessions = logs.filter(
    (log) =>
      log.status === "success" &&
      new Date(log.created_at).getTime() >= today.getTime()
  );

  const todaysTrainerNames = Array.from(
    new Set(todaysSessions.map((log) => log.trainer_name))
  );

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-5xl font-black text-yellow-400">
                FXA FITNESS
              </h1>

              <p className="text-sm uppercase tracking-[0.25em] text-gray-400">
                Client Portal
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/client/book"
                className="rounded-xl bg-yellow-400 px-5 py-3 text-center font-black uppercase text-black transition hover:bg-yellow-300"
              >
                Book Session
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-yellow-400 px-5 py-3 font-black uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                Logout
              </button>
            </div>
          </header>

          <section className="mb-8 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur">
            <p className="mb-2 text-sm font-black uppercase tracking-widest text-yellow-400">
              Welcome Back
            </p>

            <h2 className="text-4xl font-black text-white">
              {client.full_name}
            </h2>

            <p className="mt-2 text-gray-300">
              {client.email || "-"} {client.phone ? `| ${client.phone}` : ""}
            </p>

            <p className="mt-2 font-bold text-gray-300">
              Account Status:{" "}
              <span className="text-yellow-400">{client.status}</span>
            </p>
          </section>

          <section className="mb-8 grid gap-4 md:grid-cols-4">
            <Link
              href="/client/book"
              className="rounded-3xl border border-yellow-500/30 bg-yellow-400 p-6 text-black shadow-2xl transition hover:bg-yellow-300"
            >
              <p className="mb-3 text-4xl">📅</p>

              <h2 className="text-2xl font-black uppercase">Book Session</h2>

              <p className="mt-2 text-sm font-bold leading-6 text-black/70">
                Choose a trainer, view available times, and book your next
                session.
              </p>
            </Link>

            <Link
              href="/client/membership"
              className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur transition hover:bg-yellow-400 hover:text-black"
            >
              <p className="mb-3 text-4xl">💳</p>

              <h2 className="text-2xl font-black uppercase">
                Membership / Buy Packages
              </h2>

              <p className="mt-2 text-sm font-bold leading-6 text-gray-400">
                View available packages, request a new purchase, and track your
                purchase history.
              </p>
            </Link>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
              <p className="mb-3 text-4xl">🎯</p>

              <h2 className="text-2xl font-black uppercase text-white">
                Current Sessions
              </h2>

              <p className="mt-2 text-sm font-bold leading-6 text-gray-400">
                You currently have{" "}
                <span className="text-yellow-400">
                  {activePackage?.remaining_sessions ?? 0}
                </span>{" "}
                sessions remaining.
              </p>
            </div>

            <div className="rounded-3xl border border-green-500/30 bg-green-500/10 p-6 shadow-2xl backdrop-blur">
              <p className="mb-3 text-4xl">🏋️</p>

              <h2 className="text-2xl font-black uppercase text-white">
                Today&apos;s Trainer
              </h2>

              {todaysTrainerNames.length === 0 ? (
                <p className="mt-2 text-sm font-bold leading-6 text-gray-400">
                  No completed session today yet.
                </p>
              ) : (
                <p className="mt-2 text-sm font-bold leading-6 text-green-300">
                  {todaysTrainerNames.join(", ")}
                </p>
              )}
            </div>
          </section>

          <section className="mb-8 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-3xl font-black text-white">
                  Upcoming Sessions
                </h2>

                <p className="text-gray-400">
                  Your booked sessions will appear here.
                </p>
              </div>

              <Link
                href="/client/book"
                className="rounded-xl bg-yellow-400 px-5 py-3 text-center text-sm font-black uppercase text-black transition hover:bg-yellow-300"
              >
                Book Session
              </Link>
            </div>

            {upcomingBookings.length === 0 ? (
              <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-6 text-center">
                <h3 className="text-xl font-black text-white">
                  No Upcoming Sessions
                </h3>

                <p className="mt-2 text-gray-300">
                  Once you book a session, it will show here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-2xl border border-yellow-500/30 bg-black/40 p-5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xl font-black text-yellow-400">
                          {formatDateTime(booking.starts_at)}
                        </p>

                        <p className="mt-1 text-sm font-bold text-gray-300">
                          Ends: {formatDateTime(booking.ends_at)}
                        </p>

                        <p className="mt-1 text-sm font-bold text-gray-400">
                          Trainer: {booking.trainer_name}
                        </p>
                      </div>

                      <span className="inline-block rounded-full bg-yellow-400 px-3 py-1 text-xs font-black uppercase tracking-wide text-black">
                        {booking.status}
                      </span>
                    </div>

                    {booking.notes ? (
                      <p className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm font-semibold leading-6 text-yellow-100">
                        {booking.notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mb-8 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur">
            <p className="mb-2 text-sm font-black uppercase tracking-widest text-yellow-400">
              Your QR Code
            </p>

            <h2 className="mb-6 text-3xl font-black text-white">
              Trainer Scan Code
            </h2>

            <div className="mx-auto inline-block rounded-3xl border border-yellow-500/40 bg-white p-5">
              {qrCode ? (
                <img
                  src={qrCode}
                  alt="Client QR Code"
                  className="mx-auto h-72 w-72 rounded-xl"
                />
              ) : (
                <p className="font-bold text-black">Loading QR...</p>
              )}
            </div>

            <p className="mx-auto mt-6 max-w-sm text-sm font-bold text-gray-300">
              Show this QR code to your trainer to mark one session.
            </p>
          </section>

          <section className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 text-center shadow-2xl backdrop-blur">
              <p className="text-sm font-black uppercase text-gray-300">
                Total Sessions
              </p>

              <p className="mt-3 text-5xl font-black text-yellow-400">
                {activePackage?.total_sessions ?? "-"}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 text-center shadow-2xl backdrop-blur">
              <p className="text-sm font-black uppercase text-gray-300">
                Used Sessions
              </p>

              <p className="mt-3 text-5xl font-black text-yellow-400">
                {activePackage?.used_sessions ?? 0}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 text-center shadow-2xl backdrop-blur">
              <p className="text-sm font-black uppercase text-gray-300">
                Sessions Left
              </p>

              <p className="mt-3 text-5xl font-black text-yellow-400">
                {activePackage?.remaining_sessions ?? 0}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <div className="mb-6">
              <h2 className="text-3xl font-black text-white">
                Recent Sessions
              </h2>

              <p className="text-gray-400">
                Your latest training session records.
              </p>
            </div>

            {logs.length === 0 ? (
              <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-8 text-center">
                <h3 className="text-xl font-black text-white">
                  No Sessions Yet
                </h3>

                <p className="mt-2 text-gray-300">
                  Your completed sessions will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-yellow-500/30 text-left text-sm uppercase tracking-wide text-yellow-400">
                      <th className="p-3">Status</th>
                      <th className="p-3">Trainer</th>
                      <th className="p-3">Remaining After</th>
                      <th className="p-3">Date / Time</th>
                    </tr>
                  </thead>

                  <tbody>
                    {logs.map((log) => (
                      <tr
                        key={log.id}
                        className="border-b border-white/10 hover:bg-white/[0.04]"
                      >
                        <td className="p-3">
                          <span
                            className={`rounded-full px-3 py-1 text-sm font-black uppercase ${
                              log.status === "success"
                                ? "bg-green-200 text-green-900"
                                : "bg-red-200 text-red-900"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>

                        <td className="p-3 font-bold text-gray-200">
                          {log.trainer_name}
                        </td>

                        <td className="p-3 font-black text-yellow-400">
                          {log.remaining_after ?? "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {formatDateTime(log.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}