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
    total_sessions: number;
    used_sessions: number;
    remaining_sessions: number;
    status: string;
  }[];
};

type TrainerProfile =
  | {
      full_name: string | null;
      role: string | null;
    }
  | {
      full_name: string | null;
      role: string | null;
    }[]
  | null;

type SessionLog = {
  id: string;
  status: string;
  message: string | null;
  remaining_after: number | null;
  scanned_at: string;
  profiles: TrainerProfile;
};

function getTrainerName(profile: TrainerProfile) {
  if (Array.isArray(profile)) {
    return profile[0]?.full_name || "Unknown Trainer";
  }

  return profile?.full_name || "Unknown Trainer";
}

export default function ClientPortalPage() {
  const router = useRouter();

  const [client, setClient] = useState<ClientData | null>(null);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [qrCode, setQrCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/client/login");
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
      .select(`
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
      `)
      .eq("profile_id", userId)
      .single();

    if (clientError || !clientData) {
      alert("No client account is linked to this login.");
      await supabase.auth.signOut();
      router.push("/client/login");
      return;
    }

    setClient(clientData);

    const qrImage = await QRCode.toDataURL(clientData.qr_token);
    setQrCode(qrImage);

    const { data: logData } = await supabase
      .from("session_logs")
      .select(`
        id,
        status,
        message,
        remaining_after,
        scanned_at,
        profiles (
          full_name,
          role
        )
      `)
      .eq("client_id", clientData.id)
      .order("scanned_at", { ascending: false })
      .limit(10);

    setLogs((logData || []) as unknown as SessionLog[]);
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

        if (role === "trainer") {
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
      <main className="min-h-screen bg-black text-white p-6">
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
      <main className="min-h-screen bg-black text-white p-6">
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
      <main className="min-h-screen bg-black text-white p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">
            Client account not found.
          </p>
        </div>
      </main>
    );
  }

  const activePackage = client.session_packages?.[0];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todaysSessions = logs.filter(
    (log) =>
      log.status === "success" &&
      new Date(log.scanned_at).getTime() >= today.getTime()
  );

  const todaysTrainerNames = Array.from(
    new Set(todaysSessions.map((log) => getTrainerName(log.profiles)))
  );

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
        <div className="max-w-5xl mx-auto">
          <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-5xl font-black text-yellow-400">
                FXA FITNESS
              </h1>

              <p className="text-gray-400 tracking-[0.25em] uppercase text-sm">
                Client Portal
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-yellow-400 px-5 py-3 font-black uppercase text-yellow-400 hover:bg-yellow-400 hover:text-black transition"
            >
              Logout
            </button>
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

          <section className="mb-8 grid gap-4 md:grid-cols-3">
            <Link
              href="/client/membership"
              className="rounded-3xl border border-yellow-500/30 bg-yellow-400 p-6 text-black shadow-2xl transition hover:bg-yellow-300"
            >
              <p className="mb-3 text-4xl">💳</p>

              <h2 className="text-2xl font-black uppercase">
                Membership / Buy Packages
              </h2>

              <p className="mt-2 text-sm font-bold leading-6 text-black/70">
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
                <p className="text-black font-bold">Loading QR...</p>
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
                {activePackage?.total_sessions ?? 0}
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
                          {getTrainerName(log.profiles)}
                        </td>

                        <td className="p-3 font-black text-yellow-400">
                          {log.remaining_after ?? "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {new Date(log.scanned_at).toLocaleString()}
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