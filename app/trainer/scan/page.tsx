"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ScanResult = {
  type: "success" | "error" | "";
  message: string;
};

export default function TrainerScanPage() {
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);

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
    await stopScanner();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function extractQrToken(decodedText: string) {
    const cleanText = decodedText.trim();

    const match = cleanText.match(/FXA-[a-zA-Z0-9-]+/);

    if (match) {
      return match[0];
    }

    return cleanText;
  }

  async function stopScanner() {
    if (!scannerRef.current) return;

    try {
      const isScanning = scannerRef.current.isScanning;

      if (isScanning) {
        await scannerRef.current.stop();
      }

      await scannerRef.current.clear();
    } catch (error) {
      console.log("Scanner stop error:", error);
    } finally {
      scannerRef.current = null;
      setScannerStarted(false);
    }
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

    return () => {
      stopScanner();
    };
  }, [router]);

  async function startScanner() {
    if (scannerStarted) return;

    setResult({
      type: "",
      message: "",
    });

    setScannerStarted(true);

    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    try {
      await scanner.start(
        {
          facingMode: "environment",
        },
        {
          fps: 20,
          qrbox: {
            width: 280,
            height: 280,
          },
          aspectRatio: 1,
        },
        async (decodedText) => {
          const qrToken = extractQrToken(decodedText);

          console.log("RAW SCANNED CODE:", decodedText);
          console.log("LOOKING FOR QR TOKEN:", qrToken);

          await stopScanner();
          await markSession(qrToken);
        },
        () => {}
      );
    } catch (error) {
      console.error(error);

      setScannerStarted(false);
      scannerRef.current = null;

      setResult({
        type: "error",
        message:
          "Camera could not start. Please allow camera permission and use HTTPS.",
      });
    }
  }

  async function markSession(qrToken: string) {
    const cleanQrToken = qrToken.trim();

    console.log("Scanned QR token:", cleanQrToken);

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

    if (clientError) {
  setResult({
    type: "error",
    message: `Client lookup error: ${clientError.message}`,
  });
  return;
}

if (!client) {
  setResult({
    type: "error",
    message: `Invalid QR code. Scanned: ${cleanQrToken}`,
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

    const { data: sessionPackage, error: packageError } = await supabase
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
    thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

    const { data: recentScan, error: recentScanError } = await supabase
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
    const newRemaining = sessionPackage.remaining_sessions - 1;

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

    const { error: logError } = await supabase.from("session_logs").insert({
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
      <main className="min-h-screen bg-black p-5 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-base font-black text-yellow-400">
            Checking scanner access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-black leading-none tracking-tight text-white md:text-6xl">
                Trainer Scanner
              </h1>

              <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-gray-400 md:text-base">
                Scan client QR codes, deduct sessions, and track today&apos;s
                training activity.
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-2xl border border-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Logout
            </button>
          </header>

          <section className="mb-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Scanning As
              </p>

              <p className="mt-2 text-2xl font-black leading-tight text-yellow-400">
                {trainerName || "Loading..."}
              </p>

              <p className="mt-2 inline-block rounded-full bg-yellow-400 px-3 py-1 text-xs font-black uppercase tracking-wide text-black">
                {trainerRole || "-"}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Sessions Today
              </p>

              <p className="mt-3 text-5xl font-black text-yellow-400">
                {sessionsToday}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Clients Today
              </p>

              <p className="mt-3 text-5xl font-black text-yellow-400">
                {clientsToday}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Last Scan
              </p>

              <p className="mt-4 text-xl font-black text-yellow-400">
                {lastScan ? new Date(lastScan).toLocaleTimeString() : "-"}
              </p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-8">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-yellow-500/30 bg-black/60 text-4xl shadow-xl">
                📷
              </div>

              <h2 className="text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
                Scan Client QR
              </h2>

              <p className="mx-auto mt-3 max-w-lg text-sm font-medium leading-6 text-gray-400 md:text-base">
                Tap the button below, allow camera access, then point your
                camera at the client&apos;s QR code.
              </p>
            </div>

            <button
              onClick={scannerStarted ? stopScanner : startScanner}
              className={`mb-6 w-full rounded-2xl p-4 text-base font-black uppercase tracking-wide transition md:text-lg ${
                scannerStarted
                  ? "bg-red-400 text-black hover:bg-red-300"
                  : "bg-yellow-400 text-black hover:bg-yellow-300"
              }`}
            >
              {scannerStarted ? "Stop Scanner" : "Start QR Scanner"}
            </button>

            <div className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-black/60 p-3 md:p-5">
              <div
                id="qr-reader"
                className="w-full overflow-hidden rounded-3xl bg-white text-black"
              />
            </div>

            {result.message && (
              <div
                className={`rounded-3xl border p-5 text-center text-base font-black leading-7 ${
                  result.type === "success"
                    ? "border-green-500/50 bg-green-500/10 text-green-300"
                    : "border-red-500/50 bg-red-500/10 text-red-300"
                }`}
              >
                {result.message}
              </div>
            )}

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-yellow-500/30 bg-black/40 p-5 text-center">
                <p className="mb-3 text-4xl">✅</p>
                <p className="text-xs font-black uppercase tracking-widest text-gray-300">
                  Auto Deduct
                </p>
              </div>

              <div className="rounded-3xl border border-yellow-500/30 bg-black/40 p-5 text-center">
                <p className="mb-3 text-4xl">⏱️</p>
                <p className="text-xs font-black uppercase tracking-widest text-gray-300">
                  Duplicate Block
                </p>
              </div>

              <div className="rounded-3xl border border-yellow-500/30 bg-black/40 p-5 text-center">
                <p className="mb-3 text-4xl">📋</p>
                <p className="text-xs font-black uppercase tracking-widest text-gray-300">
                  History Logged
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}