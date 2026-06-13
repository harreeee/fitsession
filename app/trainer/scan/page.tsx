"use client";

import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { supabase } from "../../../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ScanResult = {
  type: "success" | "error" | "";
  message: string;
};

export default function TrainerScanPage() {
  const router = useRouter();

  const [result, setResult] = useState<ScanResult>({
    type: "",
    message: "",
  });

  const [scannerStarted, setScannerStarted] = useState(false);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [trainerName, setTrainerName] = useState("");
  const [trainerRole, setTrainerRole] = useState("");
  const [sessionsToday, setSessionsToday] = useState(0);
  const [clientsToday, setClientsToday] = useState(0);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function fetchTrainerStats(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: logs, error } = await supabase
      .from("session_logs")
      .select("id, client_id, scanned_at, status")
      .eq("trainer_id", userId)
      .eq("status", "success")
      .gte("scanned_at", today.toISOString())
      .order("scanned_at", { ascending: false });

    if (error) {
      console.log(error.message);
      return;
    }

    const todayLogs = logs || [];
    const uniqueClients = new Set(todayLogs.map((log) => log.client_id));

    setSessionsToday(todayLogs.length);
    setClientsToday(uniqueClients.size);
    setLastScan(todayLogs[0]?.scanned_at || null);
  }

  useEffect(() => {
    async function protectTrainerScanPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "trainer" && role !== "admin") {
        if (role === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setTrainerId(user.id);
      setTrainerRole(role || "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      setTrainerName(profile?.full_name || user.email || "Trainer");

      await fetchTrainerStats(user.id);
      setCheckingRole(false);
    }

    protectTrainerScanPage();
  }, [router]);

  function startScanner() {
    if (scannerStarted) return;

    setResult({
      type: "",
      message: "",
    });

    setScannerStarted(true);

    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: {
          width: 250,
          height: 250,
        },
      },
      false
    );

    scanner.render(
      async (decodedText) => {
        await markSession(decodedText);
        await scanner.clear();
        setScannerStarted(false);
      },
      () => {}
    );
  }

  async function markSession(qrToken: string) {
    const cleanQrToken = qrToken.trim();

    if (!trainerId) {
      setResult({
        type: "error",
        message: "Please log in as a trainer before scanning.",
      });
      return;
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("qr_token", cleanQrToken)
      .maybeSingle();

    if (clientError || !client) {
      setResult({
        type: "error",
        message: "Invalid QR code.",
      });
      return;
    }

    if (client.status !== "active") {
      setResult({
        type: "error",
        message: "Client is inactive.",
      });
      return;
    }

    const { data: sessionPackage, error: packageError } =
      await supabase
        .from("session_packages")
        .select("*")
        .eq("client_id", client.id)
        .eq("status", "active")
        .maybeSingle();

    if (packageError || !sessionPackage) {
      setResult({
        type: "error",
        message: "No active session package found.",
      });
      return;
    }

    if (!sessionPackage.id) {
      setResult({
        type: "error",
        message: "Session package ID is missing.",
      });
      return;
    }

    if (sessionPackage.remaining_sessions <= 0) {
      setResult({
        type: "error",
        message: "No sessions remaining.",
      });
      return;
    }

    const thirtyMinutesAgo = new Date();
    thirtyMinutesAgo.setMinutes(
      thirtyMinutesAgo.getMinutes() - 30
    );

    const { data: recentScan, error: recentScanError } =
      await supabase
        .from("session_logs")
        .select("*")
        .eq("client_id", client.id)
        .eq("status", "success")
        .gte("scanned_at", thirtyMinutesAgo.toISOString())
        .maybeSingle();

    if (recentScanError) {
      setResult({
        type: "error",
        message: recentScanError.message,
      });
      return;
    }

    if (recentScan) {
      setResult({
        type: "error",
        message:
          "Duplicate scan detected. This client was already marked within the last 30 minutes.",
      });
      return;
    }

    const newUsed = sessionPackage.used_sessions + 1;
    const newRemaining =
      sessionPackage.remaining_sessions - 1;

    const { error: updateError } = await supabase
      .from("session_packages")
      .update({
        used_sessions: newUsed,
        remaining_sessions: newRemaining,
      })
      .eq("id", sessionPackage.id);

    if (updateError) {
      setResult({
        type: "error",
        message: updateError.message,
      });
      return;
    }

    const { error: logError } = await supabase
      .from("session_logs")
      .insert({
        client_id: client.id,
        trainer_id: trainerId,
        package_id: sessionPackage.id,
        status: "success",
        message: "Session marked successfully.",
        remaining_after: newRemaining,
      });

    if (logError) {
      setResult({
        type: "error",
        message: logError.message,
      });
      return;
    }

    setResult({
      type: "success",
      message: `Success! ${client.full_name} now has ${newRemaining} sessions remaining.`,
    });

    await fetchTrainerStats(trainerId);
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">
            Checking scanner access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-yellow-400">
                FXA FITNESS
              </h1>

              <p className="text-gray-400 tracking-[0.25em] uppercase text-sm">
                Trainer QR Scanner
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-yellow-400 px-5 py-3 font-black uppercase text-yellow-400 hover:bg-yellow-400 hover:text-black transition"
            >
              Logout
            </button>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-xl backdrop-blur">
              <p className="text-sm font-black uppercase text-gray-400">
                Scanning As
              </p>

              <p className="mt-2 text-xl font-black text-yellow-400">
                {trainerName || "Loading..."}
              </p>

              <p className="mt-1 text-sm font-bold uppercase text-gray-300">
                {trainerRole || "-"}
              </p>
            </div>

            <div className="rounded-2xl border border-yellow-500/30 bg-white/[0.06] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-sm font-black uppercase text-gray-400">
                Sessions Today
              </p>

              <p className="mt-2 text-4xl font-black text-yellow-400">
                {sessionsToday}
              </p>
            </div>

            <div className="rounded-2xl border border-yellow-500/30 bg-white/[0.06] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-sm font-black uppercase text-gray-400">
                Clients Today
              </p>

              <p className="mt-2 text-4xl font-black text-yellow-400">
                {clientsToday}
              </p>
            </div>

            <div className="rounded-2xl border border-yellow-500/30 bg-white/[0.06] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-sm font-black uppercase text-gray-400">
                Last Scan
              </p>

              <p className="mt-2 text-lg font-black text-yellow-400">
                {lastScan
                  ? new Date(lastScan).toLocaleTimeString()
                  : "-"}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur">
            <div className="text-center mb-8">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-yellow-500/30 bg-black/50 text-4xl">
                📷
              </div>

              <h2 className="text-3xl font-black text-white uppercase">
                Scan Client QR
              </h2>

              <p className="mt-2 text-gray-400">
                Start the scanner, point the camera at a client QR code,
                and the session will be marked automatically.
              </p>
            </div>

            <button
              onClick={startScanner}
              disabled={scannerStarted}
              className="mb-6 w-full rounded-xl bg-yellow-400 p-4 text-lg font-black uppercase tracking-wide text-black hover:bg-yellow-300 disabled:opacity-60 transition"
            >
              {scannerStarted
                ? "Scanner Running..."
                : "Start QR Scanner"}
            </button>

            <div className="rounded-3xl border border-yellow-500/30 bg-black/50 p-4 mb-6">
              <div
                id="qr-reader"
                className="w-full overflow-hidden rounded-2xl text-black"
              />
            </div>

            {result.message && (
              <div
                className={`rounded-2xl border p-5 text-center font-black ${
                  result.type === "success"
                    ? "border-green-500/50 bg-green-500/10 text-green-300"
                    : "border-red-500/50 bg-red-500/10 text-red-300"
                }`}
              >
                {result.message}
              </div>
            )}

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-5 text-center">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-sm font-black uppercase text-gray-300">
                  Auto Deduct
                </p>
              </div>

              <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-5 text-center">
                <p className="text-3xl mb-2">⏱️</p>
                <p className="text-sm font-black uppercase text-gray-300">
                  Duplicate Block
                </p>
              </div>

              <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-5 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm font-black uppercase text-gray-300">
                  History Logged
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}