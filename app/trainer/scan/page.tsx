"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Html5Qrcode } from "html5-qrcode";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
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
  status: string | null;
};

type SessionPackageRow = {
  id: string;
  client_id: string;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  created_at: string | null;
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Unknown error";
}

export default function TrainerScanPage() {
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningLockRef = useRef(false);

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
  const [clientMap, setClientMap] = useState<Map<string, ClientInfo>>(new Map());

  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState("Checking scanner access...");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const [lastScannedHistoryId, setLastScannedHistoryId] = useState<string | null>(null);
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
    const scanner = scannerRef.current;

    try {
      if (scanner?.isScanning) {
        await scanner.stop();
      }

      if (scanner) {
        await scanner.clear();
      }
    } catch (error) {
      console.log("Scanner stop error:", error);
    } finally {
      scannerRef.current = null;
      scanningLockRef.current = false;
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
      console.error("clients by id error:", clientsByIdError.message);
    }

    ((clientsById || []) as ClientInfo[]).forEach((client) => {
      nextClientMap.set(client.id, client);
      if (client.profile_id) nextClientMap.set(client.profile_id, client);
    });

    const { data: clientsByProfileId, error: clientsByProfileError } = await supabase
      .from("clients")
      .select("id, profile_id, full_name, email")
      .in("profile_id", logClientIds);

    if (clientsByProfileError) {
      console.error("clients by profile id error:", clientsByProfileError.message);
    }

    ((clientsByProfileId || []) as ClientInfo[]).forEach((client) => {
      nextClientMap.set(client.id, client);
      if (client.profile_id) nextClientMap.set(client.profile_id, client);
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
      .select("id, client_id, status, message, trainer_note, remaining_after, created_at")
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

    try {
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
        return;
      }

      setTrainerName(editName);
      setTrainerEmail(editEmail);
      setTrainerPhone(editPhone);
      setEditPassword("");
      setProfileMessage("Profile updated successfully.");
    } catch (error) {
      setProfileMessage(getErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
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
        .update({ trainer_note: cleanNote || null })
        .eq("id", lastScannedHistoryId);

      if (error) throw error;

      setNoteMessage("Note saved.");
      setShowNoteBox(false);
      setTrainerNote("");
      setLastScannedHistoryId(null);

      if (trainerId) await fetchTrainerStats(trainerId);
    } catch (error) {
      setNoteMessage(getErrorMessage(error) || "Unable to save note.");
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
    if (scannerStarted || scannerRef.current) return;

    setResult({ type: "", message: "" });
    setNoteMessage("");
    setShowNoteBox(false);
    setTrainerNote("");
    setLastScannedHistoryId(null);
    scanningLockRef.current = false;
    setScannerStarted(true);

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      const qrSize = Math.min(
        320,
        Math.max(240, Math.floor((typeof window !== "undefined" ? window.innerWidth : 360) * 0.72))
      );

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 12,
          qrbox: { width: qrSize, height: qrSize },
        },
        async (decodedText) => {
          if (scanningLockRef.current) return;
          scanningLockRef.current = true;

          const qrToken = extractQrToken(decodedText);
          await stopScanner();
          await markSession(qrToken);
        },
        () => {}
      );
    } catch (error) {
      console.error(error);
      scannerRef.current = null;
      scanningLockRef.current = false;
      setScannerStarted(false);
      setResult({
        type: "error",
        message: "Camera could not start. Allow camera permission and use localhost or HTTPS.",
      });
    }
  }

  async function findSessionPackage(clientId: string) {
    const { data: activePackage, error: activePackageError } = await supabase
      .from("session_packages")
      .select("id, client_id, total_sessions, used_sessions, remaining_sessions, status, created_at")
      .eq("client_id", clientId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activePackageError) throw activePackageError;
    if (activePackage) return activePackage as SessionPackageRow;

    const { data: latestPackage, error: latestPackageError } = await supabase
      .from("session_packages")
      .select("id, client_id, total_sessions, used_sessions, remaining_sessions, status, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestPackageError) throw latestPackageError;
    return latestPackage as SessionPackageRow | null;
  }

  async function createHistoryRecord({
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
    const historyMessage = `Session scanned by ${trainerName || trainerEmail || "staff"}.`;

    const fullInsert = await supabase
      .from("session_history")
      .insert({
        client_id: client.id,
        trainer_id: currentTrainerId,
        package_id: sessionPackage.id,
        status: "success",
        message: historyMessage,
        remaining_after: newRemaining,
        trainer_note: null,
      })
      .select("id")
      .single();

    if (!fullInsert.error && fullInsert.data) return fullInsert.data as CreatedSessionHistoryRow;
    console.error("session_history full insert failed:", fullInsert.error);

    const withoutTrainerNote = await supabase
      .from("session_history")
      .insert({
        client_id: client.id,
        trainer_id: currentTrainerId,
        package_id: sessionPackage.id,
        status: "success",
        message: historyMessage,
        remaining_after: newRemaining,
      })
      .select("id")
      .single();

    if (!withoutTrainerNote.error && withoutTrainerNote.data) {
      return withoutTrainerNote.data as CreatedSessionHistoryRow;
    }
    console.error("session_history without trainer_note failed:", withoutTrainerNote.error);

    const withoutPackageId = await supabase
      .from("session_history")
      .insert({
        client_id: client.id,
        trainer_id: currentTrainerId,
        status: "success",
        message: historyMessage,
        remaining_after: newRemaining,
        trainer_note: null,
      })
      .select("id")
      .single();

    if (!withoutPackageId.error && withoutPackageId.data) {
      return withoutPackageId.data as CreatedSessionHistoryRow;
    }
    console.error("session_history without package_id failed:", withoutPackageId.error);

    const basicInsert = await supabase
      .from("session_history")
      .insert({
        client_id: client.id,
        trainer_id: currentTrainerId,
        status: "success",
        message: historyMessage,
        remaining_after: newRemaining,
      })
      .select("id")
      .single();

    if (!basicInsert.error && basicInsert.data) return basicInsert.data as CreatedSessionHistoryRow;
    console.error("session_history basic insert failed:", basicInsert.error);

    throw new Error(
      `Could not create history. ${fullInsert.error?.message || "full insert failed"} | ${
        withoutTrainerNote.error?.message || "without trainer_note failed"
      } | ${withoutPackageId.error?.message || "without package_id failed"} | ${
        basicInsert.error?.message || "basic insert failed"
      }`
    );
  }

  async function markSession(qrToken: string) {
    const cleanQrToken = qrToken.trim();

    setShowNoteBox(false);
    setTrainerNote("");
    setLastScannedHistoryId(null);
    setNoteMessage("");

    if (!trainerId) {
      setResult({ type: "error", message: "Please log in before scanning." });
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setResult({ type: "error", message: "Could not confirm login. Please log in again." });
      return;
    }

    const currentTrainerId = authData.user.id;

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("id, profile_id, full_name, email, qr_token, status")
      .eq("qr_token", cleanQrToken)
      .maybeSingle();

    if (clientError) {
      setResult({ type: "error", message: `Client lookup error: ${clientError.message}` });
      return;
    }

    const client = clientData as ClientRow | null;

    if (!client) {
      setResult({ type: "error", message: `Invalid QR code. Scanned: ${cleanQrToken}` });
      return;
    }

    if (client.status && client.status !== "active") {
      setResult({ type: "error", message: "Client is inactive." });
      return;
    }

    let sessionPackage: SessionPackageRow | null = null;

    try {
      sessionPackage = await findSessionPackage(client.id);
    } catch (error) {
      setResult({ type: "error", message: `Package lookup error: ${getErrorMessage(error)}` });
      return;
    }

    if (!sessionPackage) {
      setResult({
        type: "error",
        message: "No package found for this client. Open the client profile and add/renew a session package first.",
      });
      return;
    }

    const currentUsed = toNumber(sessionPackage.used_sessions) ?? 0;
    const totalSessions = toNumber(sessionPackage.total_sessions) ?? 0;
    const currentRemaining =
      toNumber(sessionPackage.remaining_sessions) ?? Math.max(totalSessions - currentUsed, 0);

    if (currentRemaining <= 0) {
      setResult({ type: "error", message: "No sessions remaining." });
      return;
    }

    const thirtyMinutesAgo = new Date();
    thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

    const { data: recentScan, error: recentScanError } = await supabase
      .from("session_history")
      .select("id")
      .eq("client_id", client.id)
      .eq("status", "success")
      .gte("created_at", thirtyMinutesAgo.toISOString())
      .limit(1)
      .maybeSingle();

    if (recentScanError) {
      setResult({ type: "error", message: recentScanError.message });
      return;
    }

    if (recentScan) {
      setResult({
        type: "error",
        message: "Duplicate scan detected. This client was already marked within the last 30 minutes.",
      });
      return;
    }

    const newUsed = currentUsed + 1;
    const newRemaining = currentRemaining - 1;

    let createdHistory: CreatedSessionHistoryRow | null = null;

    try {
      createdHistory = await createHistoryRecord({
        client,
        sessionPackage,
        currentTrainerId,
        newRemaining,
      });
    } catch (error) {
      setResult({ type: "error", message: getErrorMessage(error) });
      return;
    }

    const { error: updateError } = await supabase
      .from("session_packages")
      .update({
        used_sessions: newUsed,
        remaining_sessions: newRemaining,
        status: newRemaining <= 0 ? "completed" : "active",
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
    let alive = true;

    async function protectTrainerScanPage() {
      const { user, role } = await getCurrentUserRole();

      if (!alive) return;

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

      if (profileError) console.error(profileError);

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

      if (alive) setCheckingRole(false);
    }

    protectTrainerScanPage();

    return () => {
      alive = false;
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-zinc-950 p-4 text-white md:p-6">
        <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center rounded-[2rem] border border-yellow-500/20 bg-zinc-900 p-6">
          <p className="text-base font-semibold text-yellow-400">{checkingMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-3 text-white md:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 rounded-[1.5rem] border border-yellow-500/20 bg-zinc-900/90 p-4 shadow-xl md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-yellow-400">FXA FITNESS</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                {getRoleLabel(trainerRole)} Scanner
              </h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Scanner is placed first for faster check-in. Open this page, tap Start, scan, then add a note if needed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[520px]">
              <Link href="/trainer/clients" className="rounded-xl bg-yellow-400 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300">
                Clients
              </Link>
              <Link href="/trainer/calendar" className="rounded-xl border border-yellow-400/70 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-yellow-300 transition hover:bg-yellow-400 hover:text-black">
                Calendar
              </Link>
              <Link href="/history" className="rounded-xl border border-yellow-400/70 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-yellow-300 transition hover:bg-yellow-400 hover:text-black">
                History
              </Link>
              {trainerRole === "admin" ? (
                <Link href="/admin" className="rounded-xl border border-yellow-400/70 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-yellow-300 transition hover:bg-yellow-400 hover:text-black">
                  Admin
                </Link>
              ) : null}
              <button type="button" onClick={handleLogout} className="rounded-xl border border-red-400/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-red-300 transition hover:bg-red-400 hover:text-black">
                Logout
              </button>
            </div>
          </div>
        </header>

        <section className="mb-4 rounded-[1.7rem] border border-yellow-500/30 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.12),_transparent_35%),linear-gradient(135deg,_#18181b,_#09090b)] p-4 shadow-2xl md:p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-yellow-400">Quick Scan</p>
              <h2 className="mt-1 text-2xl font-semibold text-white md:text-3xl">Scan Client QR</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Hold the phone steady. The scan will stop automatically after reading one valid code.
              </p>
            </div>

            <button
              type="button"
              onClick={scannerStarted ? stopScanner : startScanner}
              className={`rounded-2xl px-6 py-4 text-sm font-semibold uppercase tracking-wide transition md:min-w-52 ${
                scannerStarted
                  ? "bg-red-400 text-black hover:bg-red-300"
                  : "bg-yellow-400 text-black hover:bg-yellow-300"
              }`}
            >
              {scannerStarted ? "Stop Scanner" : "Start Scanner"}
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div className="rounded-[1.5rem] border border-yellow-500/30 bg-black/70 p-3">
              <div id="qr-reader" className="min-h-[300px] w-full overflow-hidden rounded-[1.25rem] bg-white text-black md:min-h-[380px]" />
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-yellow-500/20 bg-white/[0.06] p-4 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Today</p>
                  <p className="mt-2 text-3xl font-semibold text-yellow-400">{sessionsToday}</p>
                  <p className="mt-1 text-xs text-zinc-500">sessions</p>
                </div>
                <div className="rounded-2xl border border-yellow-500/20 bg-white/[0.06] p-4 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Clients</p>
                  <p className="mt-2 text-3xl font-semibold text-yellow-400">{clientsToday}</p>
                  <p className="mt-1 text-xs text-zinc-500">unique</p>
                </div>
                <div className="rounded-2xl border border-yellow-500/20 bg-white/[0.06] p-4 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Last</p>
                  <p className="mt-3 text-sm font-semibold text-yellow-400">
                    {lastScan ? new Date(lastScan).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "-"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">scan</p>
                </div>
              </div>

              <div className="rounded-2xl border border-yellow-500/20 bg-white/[0.06] p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Scanning As</p>
                <p className="mt-2 text-xl font-semibold text-yellow-400">{trainerName || "Staff"}</p>
                <p className="mt-1 text-sm text-zinc-400">{trainerEmail || "No email saved"}</p>
                <p className="mt-1 text-sm text-zinc-500">{getRoleLabel(trainerRole)}</p>
              </div>

              {result.message ? (
                <div
                  className={`rounded-2xl border p-4 text-sm font-semibold leading-6 ${
                    result.type === "success"
                      ? "border-green-500/50 bg-green-500/10 text-green-300"
                      : "border-red-500/50 bg-red-500/10 text-red-300"
                  }`}
                >
                  {result.message}
                </div>
              ) : (
                <div className="rounded-2xl border border-yellow-500/20 bg-yellow-400/10 p-4 text-sm leading-6 text-yellow-100">
                  Tip: camera works best on localhost during dev or HTTPS after deployment.
                </div>
              )}
            </div>
          </div>

          {showNoteBox ? (
            <div className="mt-4 rounded-3xl border border-yellow-400/40 bg-black/70 p-5">
              <h3 className="text-xl font-semibold text-yellow-400">Add Trainer Note</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Optional note for this completed session: training focus, injury, reminder, or next-session plan.
              </p>

              <textarea
                value={trainerNote}
                onChange={(event) => setTrainerNote(event.target.value)}
                placeholder="Example: Lower body today. Client had mild knee discomfort. Keep squat depth controlled next session."
                className="mt-4 min-h-32 w-full rounded-2xl border border-yellow-500/30 bg-black/80 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400"
              />

              {noteMessage ? (
                <p className="mt-3 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-3 text-sm text-yellow-300">
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

        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[1.5rem] border border-yellow-500/20 bg-zinc-900 p-5 shadow-xl">
            <h2 className="text-xl font-semibold text-white">Profile</h2>

            <form onSubmit={saveProfile} className="mt-5 space-y-3">
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="Full name"
                className="w-full rounded-xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400"
              />
              <input
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                type="email"
                placeholder="Email"
                className="w-full rounded-xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400"
              />
              <input
                value={editPhone}
                onChange={(event) => setEditPhone(event.target.value)}
                placeholder="Phone number"
                className="w-full rounded-xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400"
              />
              <input
                value={editPassword}
                onChange={(event) => setEditPassword(event.target.value)}
                type="password"
                minLength={6}
                placeholder="New password optional"
                className="w-full rounded-xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400"
              />

              <button
                disabled={savingProfile}
                className="w-full rounded-xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </form>

            {profileMessage ? (
              <p className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-400/10 p-3 text-sm text-yellow-300">
                {profileMessage}
              </p>
            ) : null}
          </div>

          <div className="rounded-[1.5rem] border border-yellow-500/20 bg-zinc-900 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">Recent History</h2>
              <Link href="/trainer/clients" className="rounded-xl border border-yellow-400/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-yellow-300 transition hover:bg-yellow-400 hover:text-black">
                Open Clients
              </Link>
            </div>

            <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {historyLogs.length === 0 ? (
                <p className="text-sm text-zinc-400">No session history yet.</p>
              ) : (
                historyLogs.map((log) => {
                  const client = clientMap.get(log.client_id);

                  return (
                    <div key={log.id} className="rounded-2xl border border-yellow-500/20 bg-black/50 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-white">{client?.full_name || "Unknown Client"}</p>
                          <p className="text-xs text-zinc-500">{client?.email || "No client email"}</p>
                        </div>
                        <p className="text-sm font-semibold text-yellow-400">{formatDateTime(log.created_at)}</p>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-zinc-400 md:grid-cols-3">
                        <p>Status: {log.status}</p>
                        <p>Remaining: {log.remaining_after === null ? "N/A" : log.remaining_after}</p>
                        <p>{log.message || "Session scanned"}</p>
                      </div>

                      {log.trainer_note ? (
                        <div className="mt-3 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                          <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">Trainer Note</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yellow-100">{log.trainer_note}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
