"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ScanResult = {
  type: "success" | "error" | "";
  message: string;
};

type TrainerHistoryLog = {
  id: string;
  client_id: string;
  status: string;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string;
};

type ClientInfo = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
};

type TrainerProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type ClientRow = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  qr_token: string;
  status: string;
};

type SessionPackageRow = {
  id: string;
  client_id: string;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string;
};

type CreatedSessionHistoryRow = {
  id: string;
};

function getRoleLabel(role: string) {
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "trainer") return "Trainer";
  if (role === "admin") return "Admin";
  return "Staff";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) return null;

  return numberValue;
}

function isForeignKeyClientIdError(message: string) {
  const lowerMessage = message.toLowerCase();

  return (
    lowerMessage.includes("session_history_client_id_fkey") ||
    lowerMessage.includes("foreign key constraint") ||
    lowerMessage.includes("violates foreign key")
  );
}

export default function TrainerScanPage() {
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const [result, setResult] = useState<ScanResult>({ type: "", message: "" });

  const [scannerStarted, setScannerStarted] = useState(false);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [trainerName, setTrainerName] = useState("");
  const [trainerEmail, setTrainerEmail] = useState("");
  const [trainerPhone, setTrainerPhone] = useState("");
  const [trainerRole, setTrainerRole] = useState("");

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const [sessionsToday, setSessionsToday] = useState(0);
  const [clientsToday, setClientsToday] = useState(0);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const [historyLogs, setHistoryLogs] = useState<TrainerHistoryLog[]>([]);
  const [clientMap, setClientMap] = useState<Map<string, ClientInfo>>(
    new Map()
  );

  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState(
    "Checking scanner access..."
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const [lastScannedHistoryId, setLastScannedHistoryId] = useState<
    string | null
  >(null);
  const [trainerNote, setTrainerNote] = useState("");
  const [showNoteBox, setShowNoteBox] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");

  async function handleLogout() {
    await stopScanner();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function extractQrToken(decodedText: string) {
    const cleanText = decodedText.trim();
    const match = cleanText.match(/FXA-[a-zA-Z0-9-]+/);
    return match ? match[0] : cleanText;
  }

  async function stopScanner() {
    if (!scannerRef.current) return;

    try {
      if (scannerRef.current.isScanning) {
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

  async function fetchClientsForHistory(logClientIds: string[]) {
    const nextClientMap = new Map<string, ClientInfo>();

    if (logClientIds.length === 0) {
      setClientMap(nextClientMap);
      return;
    }

    const { data: clientsById, error: clientsByIdError } = await supabase
      .from("clients")
      .select("id, profile_id, full_name, email")
      .in("id", logClientIds);

    if (clientsByIdError) {
      console.error(clientsByIdError);
    }

    ((clientsById || []) as ClientInfo[]).forEach((client) => {
      nextClientMap.set(client.id, client);

      if (client.profile_id) {
        nextClientMap.set(client.profile_id, client);
      }
    });

    const { data: clientsByProfileId, error: clientsByProfileError } =
      await supabase
        .from("clients")
        .select("id, profile_id, full_name, email")
        .in("profile_id", logClientIds);

    if (clientsByProfileError) {
      console.error(clientsByProfileError);
    }

    ((clientsByProfileId || []) as ClientInfo[]).forEach((client) => {
      nextClientMap.set(client.id, client);

      if (client.profile_id) {
        nextClientMap.set(client.profile_id, client);
      }
    });

    setClientMap(nextClientMap);
  }

  async function fetchTrainerStats(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayLogs, error: todayLogsError } = await supabase
      .from("session_history")
      .select("id, client_id, created_at, status")
      .eq("trainer_id", userId)
      .eq("status", "success")
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false });

    if (todayLogsError) {
      console.error(todayLogsError);
      setResult({
        type: "error",
        message: `Could not load today's stats: ${todayLogsError.message}`,
      });
      return;
    }

    const logsToday = todayLogs || [];
    const uniqueClients = new Set(logsToday.map((log) => log.client_id));

    setSessionsToday(logsToday.length);
    setClientsToday(uniqueClients.size);
    setLastScan(logsToday[0]?.created_at || null);

    const { data: recentLogs, error: recentLogsError } = await supabase
      .from("session_history")
      .select(
        "id, client_id, status, message, trainer_note, remaining_after, created_at"
      )
      .eq("trainer_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (recentLogsError) {
      console.error(recentLogsError);
      setResult({
        type: "error",
        message: `Could not load recent history: ${recentLogsError.message}`,
      });
      return;
    }

    const cleanLogs = (recentLogs || []) as TrainerHistoryLog[];
    setHistoryLogs(cleanLogs);

    const clientIds = Array.from(
      new Set(
        cleanLogs
          .map((log) => log.client_id)
          .filter((clientId): clientId is string => Boolean(clientId))
      )
    );

    await fetchClientsForHistory(clientIds);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trainerId) {
      setProfileMessage("Staff account not loaded.");
      return;
    }

    setSavingProfile(true);
    setProfileMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/trainer/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        full_name: editName,
        email: editEmail,
        phone: editPhone,
        password: editPassword,
      }),
    });

    const resultData: { error?: string } = await response.json();

    if (!response.ok) {
      setProfileMessage(resultData.error || "Could not update profile.");
      setSavingProfile(false);
      return;
    }

    setTrainerName(editName);
    setTrainerEmail(editEmail);
    setTrainerPhone(editPhone);
    setEditPassword("");
    setProfileMessage("Profile updated successfully.");
    setSavingProfile(false);
  }

  async function saveTrainerNote() {
    if (!lastScannedHistoryId) {
      setNoteMessage("No completed scan found for this note.");
      return;
    }

    setSavingNote(true);
    setNoteMessage("");

    try {
      const cleanNote = trainerNote.trim();

      const { error } = await supabase
        .from("session_history")
        .update({
          trainer_note: cleanNote || null,
        })
        .eq("id", lastScannedHistoryId);

      if (error) {
        throw error;
      }

      setNoteMessage("Note saved.");
      setShowNoteBox(false);
      setTrainerNote("");
      setLastScannedHistoryId(null);

      if (trainerId) {
        await fetchTrainerStats(trainerId);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save note.";
      setNoteMessage(message);
    } finally {
      setSavingNote(false);
    }
  }

  function skipTrainerNote() {
    setShowNoteBox(false);
    setTrainerNote("");
    setLastScannedHistoryId(null);
    setNoteMessage("");
  }

  async function startScanner() {
    if (scannerStarted) return;

    setResult({ type: "", message: "" });
    setNoteMessage("");
    setShowNoteBox(false);
    setTrainerNote("");
    setLastScannedHistoryId(null);
    setScannerStarted(true);

    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 20,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1,
        },
        async (decodedText) => {
          const qrToken = extractQrToken(decodedText);
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

  async function insertSessionHistoryWithFallback({
    client,
    sessionPackage,
    currentTrainerId,
    newRemaining,
  }: {
    client: ClientRow;
    sessionPackage: SessionPackageRow;
    currentTrainerId: string;
    newRemaining: number;
  }) {
    const possibleClientIds = [client.id, client.profile_id].filter(
      (value): value is string => Boolean(value)
    );

    let lastErrorMessage = "";

    for (const possibleClientId of possibleClientIds) {
      const { data, error } = await supabase
        .from("session_history")
        .insert({
          client_id: possibleClientId,
          trainer_id: currentTrainerId,
          package_id: sessionPackage.id,
          status: "success",
          message: `Session scanned by ${
            trainerName || trainerEmail || "staff"
          }.`,
          remaining_after: newRemaining,
          trainer_note: null,
        })
        .select("id")
        .single();

      if (!error) {
        return {
          history: data as CreatedSessionHistoryRow,
          historyClientId: possibleClientId,
        };
      }

      lastErrorMessage = error.message;

      if (!isForeignKeyClientIdError(error.message)) {
        throw error;
      }
    }

    throw new Error(lastErrorMessage || "Could not create session history.");
  }

  async function markSession(qrToken: string) {
    const cleanQrToken = qrToken.trim();

    setShowNoteBox(false);
    setTrainerNote("");
    setLastScannedHistoryId(null);
    setNoteMessage("");

    if (!trainerId) {
      setResult({
        type: "error",
        message: "Please log in before scanning.",
      });
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setResult({
        type: "error",
        message: "Could not confirm login. Please log in again.",
      });
      return;
    }

    const currentTrainerId = authData.user.id;

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("id, profile_id, full_name, email, qr_token, status")
      .eq("qr_token", cleanQrToken)
      .maybeSingle();

    if (clientError) {
      setResult({
        type: "error",
        message: `Client lookup error: ${clientError.message}`,
      });
      return;
    }

    const client = clientData as ClientRow | null;

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

    const { data: packageData, error: packageError } = await supabase
      .from("session_packages")
      .select(
        "id, client_id, total_sessions, used_sessions, remaining_sessions, status"
      )
      .eq("client_id", client.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (packageError) {
      setResult({
        type: "error",
        message: packageError.message,
      });
      return;
    }

    const sessionPackage = packageData as SessionPackageRow | null;

    if (!sessionPackage) {
      setResult({
        type: "error",
        message: "No active session package found.",
      });
      return;
    }

    const currentUsed = toNumber(sessionPackage.used_sessions) ?? 0;
    const totalSessions = toNumber(sessionPackage.total_sessions) ?? 0;
    const currentRemaining =
      toNumber(sessionPackage.remaining_sessions) ??
      Math.max(totalSessions - currentUsed, 0);

    if (currentRemaining <= 0) {
      setResult({
        type: "error",
        message: "No sessions remaining.",
      });
      return;
    }

    const thirtyMinutesAgo = new Date();
    thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

    const duplicateClientIds = [client.id, client.profile_id].filter(
      (value): value is string => Boolean(value)
    );

    const { data: recentScan, error: recentScanError } = await supabase
      .from("session_history")
      .select("id")
      .in("client_id", duplicateClientIds)
      .eq("status", "success")
      .gte("created_at", thirtyMinutesAgo.toISOString())
      .limit(1)
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

    const newUsed = currentUsed + 1;
    const newRemaining = currentRemaining - 1;

    let createdHistory: CreatedSessionHistoryRow | null = null;

    try {
      const insertResult = await insertSessionHistoryWithFallback({
        client,
        sessionPackage,
        currentTrainerId,
        newRemaining,
      });

      createdHistory = insertResult.history;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create history.";

      setResult({
        type: "error",
        message,
      });
      return;
    }

    const { error: updateError } = await supabase
      .from("session_packages")
      .update({
        used_sessions: newUsed,
        remaining_sessions: newRemaining,
        status: newRemaining <= 0 ? "completed" : sessionPackage.status,
      })
      .eq("id", sessionPackage.id);

    if (updateError) {
      setResult({
        type: "error",
        message: `Session was recorded, but package update failed: ${updateError.message}`,
      });
      return;
    }

    setResult({
      type: "success",
      message: `Success! ${client.full_name} now has ${newRemaining} sessions remaining.`,
    });

    if (createdHistory?.id) {
      setLastScannedHistoryId(createdHistory.id);
      setShowNoteBox(true);
    }

    await fetchTrainerStats(currentTrainerId);
  }

  useEffect(() => {
    async function protectTrainerScanPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (role === "client") {
        setCheckingMessage("Redirecting to client portal...");
        router.push("/client");
        return;
      }

      if (role !== "trainer" && role !== "nutrition_coach" && role !== "admin") {
        setCheckingMessage("Redirecting to login...");
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setTrainerId(user.id);
      setTrainerRole(role || "");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error(profileError);
      }

      const trainerProfile = profile as TrainerProfile | null;

      const name = trainerProfile?.full_name || user.email || "Staff";
      const email = trainerProfile?.email || user.email || "";
      const phone = trainerProfile?.phone || "";

      setTrainerName(name);
      setTrainerEmail(email);
      setTrainerPhone(phone);

      setEditName(name);
      setEditEmail(email);
      setEditPhone(phone);

      await fetchTrainerStats(user.id);
      setCheckingRole(false);
    }

    protectTrainerScanPage();

    return () => {
      stopScanner();
    };
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-5 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-base font-semibold text-yellow-400">
            {checkingMessage}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-semibold leading-none tracking-tight text-white md:text-6xl">
                {getRoleLabel(trainerRole)} Hub
              </h1>

              <p className="mt-3 max-w-xl text-sm font-normal leading-6 text-gray-400 md:text-base">
                Scan QR codes, view your history, manage your profile, connect
                Google Calendar, and open client management.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Link
                href="/trainer/calendar"
                className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300"
              >
                Google Calendar
              </Link>

              <Link
                href="/trainer/clients"
                className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                Client Management
              </Link>

              <Link
                href="/history"
                className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                History
              </Link>

              {trainerRole === "admin" ? (
                <Link
                  href="/admin"
                  className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Admin
                </Link>
              ) : null}

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-2xl border border-red-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-red-300 transition hover:bg-red-400 hover:text-black"
              >
                Logout
              </button>
            </div>
          </header>

          <section className="mb-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 shadow-xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Scanning As
              </p>

              <p className="mt-2 text-2xl font-semibold leading-tight text-yellow-400">
                {trainerName || "Loading..."}
              </p>

              <p className="mt-2 text-sm font-normal text-gray-400">
                {trainerEmail || "No email saved"}
              </p>

              <p className="mt-1 text-sm font-normal text-gray-400">
                {trainerPhone || "No phone saved"}
              </p>

              <p className="mt-3 inline-block rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black">
                {getRoleLabel(trainerRole)}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Sessions Today
              </p>
              <p className="mt-3 text-5xl font-semibold text-yellow-400">
                {sessionsToday}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Clients Today
              </p>
              <p className="mt-3 text-5xl font-semibold text-yellow-400">
                {clientsToday}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Last Scan
              </p>
              <p className="mt-4 text-xl font-semibold text-yellow-400">
                {lastScan ? new Date(lastScan).toLocaleTimeString() : "-"}
              </p>
            </div>
          </section>

          <section className="mb-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-7">
              <h2 className="text-2xl font-semibold">Profile</h2>

              <form onSubmit={saveProfile} className="mt-5 space-y-4">
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />

                <input
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                  type="email"
                  placeholder="Email"
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />

                <input
                  value={editPhone}
                  onChange={(event) => setEditPhone(event.target.value)}
                  placeholder="Phone number"
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />

                <input
                  value={editPassword}
                  onChange={(event) => setEditPassword(event.target.value)}
                  type="password"
                  minLength={6}
                  placeholder="New password optional"
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />

                <button
                  disabled={savingProfile}
                  className="w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingProfile ? "Saving..." : "Save Profile"}
                </button>
              </form>

              {profileMessage ? (
                <p className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4 text-sm font-normal text-yellow-300">
                  {profileMessage}
                </p>
              ) : null}
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-7">
              <h2 className="text-2xl font-semibold">Recent History</h2>

              <div className="mt-5 max-h-[430px] space-y-3 overflow-y-auto pr-1">
                {historyLogs.length === 0 ? (
                  <p className="text-sm font-normal text-gray-400">
                    No session history yet.
                  </p>
                ) : (
                  historyLogs.map((log) => {
                    const client = clientMap.get(log.client_id);

                    return (
                      <div
                        key={log.id}
                        className="rounded-2xl border border-yellow-500/20 bg-black/50 p-4"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold">
                              {client?.full_name || "Unknown Client"}
                            </p>
                            <p className="text-xs font-normal text-gray-500">
                              {client?.email || "No client email"}
                            </p>
                          </div>

                          <p className="text-sm font-semibold text-yellow-400">
                            {formatDateTime(log.created_at)}
                          </p>
                        </div>

                        <div className="mt-3 grid gap-2 text-sm font-normal text-gray-400 md:grid-cols-3">
                          <p>Status: {log.status}</p>
                          <p>
                            Remaining:{" "}
                            {log.remaining_after === null
                              ? "N/A"
                              : log.remaining_after}
                          </p>
                          <p>{log.message || "Session scanned"}</p>
                        </div>

                        {log.trainer_note ? (
                          <div className="mt-3 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                            <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                              Trainer Note
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm font-normal leading-6 text-yellow-100">
                              {log.trainer_note}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-8">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-yellow-500/30 bg-black/60 text-4xl shadow-xl">
                📷
              </div>

              <h2 className="text-3xl font-semibold uppercase tracking-tight text-white md:text-4xl">
                Scan Client QR
              </h2>

              <p className="mx-auto mt-3 max-w-lg text-sm font-normal leading-6 text-gray-400 md:text-base">
                Tap the button below, allow camera access, then point your
                camera at the client&apos;s QR code.
              </p>
            </div>

            <button
              onClick={scannerStarted ? stopScanner : startScanner}
              className={`mb-6 w-full rounded-2xl p-4 text-base font-semibold uppercase tracking-wide transition md:text-lg ${
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
                className={`rounded-3xl border p-5 text-center text-base font-semibold leading-7 ${
                  result.type === "success"
                    ? "border-green-500/50 bg-green-500/10 text-green-300"
                    : "border-red-500/50 bg-red-500/10 text-red-300"
                }`}
              >
                {result.message}
              </div>
            )}

            {showNoteBox ? (
              <div className="mt-5 rounded-3xl border border-yellow-400/40 bg-black/70 p-5">
                <h3 className="text-xl font-semibold text-yellow-400">
                  Add Trainer Note
                </h3>

                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  Optional note for this completed session. You can write what
                  the client trained, injuries, reminders, or next-session
                  focus.
                </p>

                <textarea
                  value={trainerNote}
                  onChange={(event) => setTrainerNote(event.target.value)}
                  placeholder="Example: Upper body strength today. Client reported mild shoulder tightness. Focus on mobility next session."
                  className="mt-4 min-h-32 w-full rounded-2xl border border-yellow-500/30 bg-black/80 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />

                {noteMessage ? (
                  <p className="mt-3 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-3 text-sm font-normal text-yellow-300">
                    {noteMessage}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={saveTrainerNote}
                    disabled={savingNote}
                    className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingNote ? "Saving Note..." : "Save Note"}
                  </button>

                  <button
                    type="button"
                    onClick={skipTrainerNote}
                    disabled={savingNote}
                    className="rounded-2xl border border-yellow-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Skip Note
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}