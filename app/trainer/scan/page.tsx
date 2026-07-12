"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

const MOTIVATION_QUOTES = [
  "Every scan is proof that your coaching creates momentum.",
  "Strong coaches do not just count reps. They build standards.",
  "Your energy sets the room. Lead the session before it starts.",
  "One great session can change a client's whole week.",
  "Coach with purpose. Track with discipline. Win with consistency.",
  "Great PTs create results, trust, and reasons to come back.",
];

function getRoleLabel(role: string) {
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "trainer") return "Trainer";
  if (role === "admin") return "Admin";
  return "Staff";
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "FX"
  );
}

function getFirstName(name: string) {
  return name.trim().split(" ")[0] || "Coach";
}

function getDailyMotivation() {
  const today = new Date();
  const index =
    (today.getFullYear() + today.getMonth() + today.getDate()) %
    MOTIVATION_QUOTES.length;

  return MOTIVATION_QUOTES[index];
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getPerformanceLabel(sessionsToday: number) {
  if (sessionsToday >= 8) return "Elite day";
  if (sessionsToday >= 5) return "Strong day";
  if (sessionsToday >= 3) return "Momentum building";
  if (sessionsToday >= 1) return "Started strong";
  return "Ready to win";
}

function getPerformanceMessage(sessionsToday: number) {
  if (sessionsToday >= 8) return "You are setting the floor high today.";
  if (sessionsToday >= 5) return "Great pace. Keep client care sharp.";
  if (sessionsToday >= 3) return "Solid rhythm. Turn sessions into renewals.";
  if (sessionsToday >= 1) return "First win logged. Keep the streak going.";
  return "Scan your first client and start the day with energy.";
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

function formatTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString([], {
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

function getResultClass(type: ScanResult["type"]) {
  if (type === "success") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  }

  if (type === "error") {
    return "border-red-400/40 bg-red-400/10 text-red-200";
  }

  return "border-yellow-400/25 bg-yellow-400/10 text-yellow-100";
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

  const motivationQuote = useMemo(() => getDailyMotivation(), []);
  const greeting = useMemo(() => getGreeting(), []);
  const performanceLabel = getPerformanceLabel(sessionsToday);
  const performanceMessage = getPerformanceMessage(sessionsToday);

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

    const { data: clientsByProfileId, error: clientsByProfileError } =
      await supabase
        .from("clients")
        .select("id, profile_id, full_name, email")
        .in("profile_id", logClientIds);

    if (clientsByProfileError) {
      console.error(
        "clients by profile id error:",
        clientsByProfileError.message
      );
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
        340,
        Math.max(
          240,
          Math.floor(
            (typeof window !== "undefined" ? window.innerWidth : 360) * 0.72
          )
        )
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
        message:
          "Camera could not start. Allow camera permission and use localhost or HTTPS.",
      });
    }
  }

  async function findSessionPackage(clientId: string) {
    const { data: activePackage, error: activePackageError } = await supabase
      .from("session_packages")
      .select(
        "id, client_id, total_sessions, used_sessions, remaining_sessions, status, created_at"
      )
      .eq("client_id", clientId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activePackageError) throw activePackageError;
    if (activePackage) return activePackage as SessionPackageRow;

    const { data: latestPackage, error: latestPackageError } = await supabase
      .from("session_packages")
      .select(
        "id, client_id, total_sessions, used_sessions, remaining_sessions, status, created_at"
      )
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
    const historyMessage = `Session scanned by ${
      trainerName || trainerEmail || "staff"
    }.`;

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

    if (!fullInsert.error && fullInsert.data) {
      return fullInsert.data as CreatedSessionHistoryRow;
    }

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

    console.error(
      "session_history without trainer_note failed:",
      withoutTrainerNote.error
    );

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

    console.error(
      "session_history without package_id failed:",
      withoutPackageId.error
    );

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

    if (!basicInsert.error && basicInsert.data) {
      return basicInsert.data as CreatedSessionHistoryRow;
    }

    console.error("session_history basic insert failed:", basicInsert.error);

    throw new Error(
      `Could not create history. ${
        fullInsert.error?.message || "full insert failed"
      } | ${withoutTrainerNote.error?.message || "without trainer_note failed"} | ${
        withoutPackageId.error?.message || "without package_id failed"
      } | ${basicInsert.error?.message || "basic insert failed"}`
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

    if (client.status && client.status !== "active") {
      setResult({ type: "error", message: "Client is inactive." });
      return;
    }

    let sessionPackage: SessionPackageRow | null = null;

    try {
      sessionPackage = await findSessionPackage(client.id);
    } catch (error) {
      setResult({
        type: "error",
        message: `Package lookup error: ${getErrorMessage(error)}`,
      });
      return;
    }

    if (!sessionPackage) {
      setResult({
        type: "error",
        message:
          "No package found for this client. Open the client profile and add/renew a session package first.",
      });
      return;
    }

    const currentUsed = toNumber(sessionPackage.used_sessions) ?? 0;
    const totalSessions = toNumber(sessionPackage.total_sessions) ?? 0;
    const currentRemaining =
      toNumber(sessionPackage.remaining_sessions) ??
      Math.max(totalSessions - currentUsed, 0);

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
        message:
          "Duplicate scan detected. This client was already marked within the last 30 minutes.",
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
      <main className="min-h-screen bg-[#070707] p-4 text-white md:p-6">
        <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center rounded-[2rem] border border-yellow-400/20 bg-white/[0.04] p-6">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-yellow-400/20 border-t-yellow-400" />
            <p className="text-base font-semibold text-yellow-400">
              {checkingMessage}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#070707] text-white">
      <style jsx global>{`
        html,
        body {
          background: #070707;
        }

        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse-glow {
          0%,
          100% {
            box-shadow: 0 0 30px rgba(250, 204, 21, 0.18);
          }
          50% {
            box-shadow: 0 0 70px rgba(250, 204, 21, 0.32);
          }
        }

        .fade-up {
          animation: fade-up 0.45s ease both;
        }

        .pulse-glow {
          animation: pulse-glow 3s ease-in-out infinite;
        }

        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        ::-webkit-scrollbar-track {
          background: #111111;
        }

        ::-webkit-scrollbar-thumb {
          background: #facc15;
          border-radius: 999px;
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[440px] w-[440px] rounded-full bg-yellow-400/[0.08] blur-[120px]" />
        <div className="absolute -right-28 top-1/4 h-[360px] w-[360px] rounded-full bg-amber-500/[0.06] blur-[110px]" />
        <div className="absolute bottom-0 left-1/3 h-[320px] w-[320px] rounded-full bg-yellow-300/[0.04] blur-[90px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-7">
        <header className="fade-up mb-5 overflow-hidden rounded-[2rem] border border-yellow-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.20),_transparent_35%),linear-gradient(135deg,_rgba(24,24,27,0.96),_rgba(9,9,11,0.96))] p-5 shadow-2xl backdrop-blur md:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-yellow-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                  {getRoleLabel(trainerRole)} Hub
                </span>

                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {performanceLabel}
                </span>
              </div>

              <h1 className="text-4xl font-black leading-none tracking-tight md:text-6xl">
                {greeting},
                <br />
                <span className="text-yellow-400">
                  {getFirstName(trainerName || "Coach")}
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">
                {motivationQuote}
              </p>

              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                {performanceMessage} Scan fast, coach with standards, and keep
                notes clean so every client has a clear next step.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-black/35 p-4 md:p-5">
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-yellow-400 text-xl font-black text-black shadow-lg shadow-yellow-400/20">
                  {getInitials(trainerName || trainerEmail || "FX")}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-xl font-bold text-white">
                    {trainerName || "Staff"}
                  </p>
                  <p className="truncate text-sm text-zinc-500">
                    {trainerEmail || "No email saved"}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-yellow-400">
                    {getRoleLabel(trainerRole)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    Sessions
                  </p>
                  <p className="mt-2 text-3xl font-black text-yellow-400">
                    {sessionsToday}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">today</p>
                </div>

                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    Clients
                  </p>
                  <p className="mt-2 text-3xl font-black text-cyan-300">
                    {clientsToday}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">unique</p>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    Last
                  </p>
                  <p className="mt-3 text-sm font-black text-emerald-300">
                    {formatTime(lastScan)}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">scan</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="fade-up mb-5 grid gap-3 md:grid-cols-5">
          <Link
            href="/trainer/clients"
            className="rounded-2xl bg-yellow-400 px-4 py-3 text-center text-xs font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 active:scale-[0.98]"
          >
            Client Management
          </Link>

          <Link
            href="/trainer/calendar"
            className="rounded-2xl border border-yellow-400/50 bg-yellow-400/10 px-4 py-3 text-center text-xs font-black uppercase tracking-wide text-yellow-300 transition hover:bg-yellow-400 hover:text-black active:scale-[0.98]"
          >
            Calendar
          </Link>

          <Link
            href="/history"
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-wide text-zinc-300 transition hover:border-yellow-400/50 hover:text-yellow-300 active:scale-[0.98]"
          >
            History
          </Link>

          {trainerRole === "admin" ? (
            <Link
              href="/admin"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-wide text-zinc-300 transition hover:border-yellow-400/50 hover:text-yellow-300 active:scale-[0.98]"
            >
              Admin
            </Link>
          ) : (
            <div className="hidden md:block" />
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-2xl border border-red-400/50 bg-red-400/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-red-300 transition hover:bg-red-400 hover:text-black active:scale-[0.98]"
          >
            Logout
          </button>
        </section>

        <section className="fade-up mb-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="pulse-glow overflow-hidden rounded-[2rem] border border-yellow-400/30 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.16),_transparent_38%),linear-gradient(135deg,_#161006,_#09090b_65%)] p-4 shadow-2xl md:p-6">
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-yellow-400">
                  Quick Scan
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">
                  Scan Client QR
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                  One clean scan. One completed session. One step closer to the
                  client&apos;s goal.
                </p>
              </div>

              <button
                type="button"
                onClick={scannerStarted ? stopScanner : startScanner}
                className={`rounded-2xl px-7 py-4 text-sm font-black uppercase tracking-wide transition active:scale-[0.98] md:min-w-56 ${
                  scannerStarted
                    ? "bg-red-400 text-black hover:bg-red-300"
                    : "bg-yellow-400 text-black hover:bg-yellow-300"
                }`}
              >
                {scannerStarted ? "Stop Scanner" : "Start Scanner"}
              </button>
            </div>

            <div className="rounded-[1.75rem] border border-yellow-400/25 bg-black/70 p-3">
              <div
                id="qr-reader"
                className="min-h-[320px] w-full overflow-hidden rounded-[1.4rem] bg-white text-black md:min-h-[440px]"
              />
            </div>

            <div
              className={`mt-5 rounded-3xl border p-5 text-sm font-semibold leading-7 ${
                result.message
                  ? getResultClass(result.type)
                  : "border-yellow-400/25 bg-yellow-400/10 text-yellow-100"
              }`}
            >
              {result.message ||
                "Ready to scan. Use the camera to scan a client QR code and mark a session."}
            </div>

            {showNoteBox ? (
              <div className="mt-5 rounded-3xl border border-yellow-400/40 bg-black/75 p-5">
                <h3 className="text-xl font-black text-yellow-400">
                  Add Trainer Note
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Make the next session easier: training focus, injury flags,
                  client energy, or next-session plan.
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
                    className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingNote ? "Saving Note..." : "Save Note"}
                  </button>
                  <button
                    type="button"
                    onClick={skipTrainerNote}
                    disabled={savingNote}
                    className="rounded-2xl border border-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Skip Note
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-yellow-400">
                    Coach Mission
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    Today&apos;s Focus
                  </h2>
                </div>
                <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-300">
                  Impact
                </span>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <p className="text-sm font-semibold text-white">
                    1. Scan every completed session correctly.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Clean records protect client trust and your own performance.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <p className="text-sm font-semibold text-white">
                    2. Add notes after meaningful sessions.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Better notes create better renewals and better outcomes.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <p className="text-sm font-semibold text-white">
                    3. Watch low-session clients.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Renew conversations should start before the package ends.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur">
              <h2 className="text-2xl font-black text-white">Profile</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Keep your staff profile clean for clients and admin records.
              </p>

              <form onSubmit={saveProfile} className="mt-5 space-y-3">
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-2xl border border-yellow-500/20 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400"
                />
                <input
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                  type="email"
                  placeholder="Email"
                  className="w-full rounded-2xl border border-yellow-500/20 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400"
                />
                <input
                  value={editPhone}
                  onChange={(event) => setEditPhone(event.target.value)}
                  placeholder="Phone number"
                  className="w-full rounded-2xl border border-yellow-500/20 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400"
                />
                <input
                  value={editPassword}
                  onChange={(event) => setEditPassword(event.target.value)}
                  type="password"
                  minLength={6}
                  placeholder="New password optional"
                  className="w-full rounded-2xl border border-yellow-500/20 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400"
                />

                <button
                  disabled={savingProfile}
                  className="w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingProfile ? "Saving..." : "Save Profile"}
                </button>
              </form>

              {profileMessage ? (
                <p className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-3 text-sm text-yellow-300">
                  {profileMessage}
                </p>
              ) : null}
            </section>
          </div>
        </section>

        <section className="fade-up rounded-[2rem] border border-yellow-500/20 bg-white/[0.04] p-5 shadow-2xl backdrop-blur md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-yellow-400">
                Recent Wins
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Recent Session History
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Use this as your coaching memory. Every note makes the next
                session better.
              </p>
            </div>

            <Link
              href="/trainer/clients"
              className="rounded-2xl border border-yellow-400/60 px-4 py-3 text-center text-xs font-black uppercase tracking-wide text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
            >
              Open Clients
            </Link>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {historyLogs.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/15 bg-black/35 p-8 text-center lg:col-span-2">
                <p className="text-3xl">🏁</p>
                <p className="mt-3 text-sm font-semibold text-white">
                  No session history yet.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Scan your first client to start today&apos;s momentum.
                </p>
              </div>
            ) : (
              historyLogs.map((log) => {
                const client = clientMap.get(log.client_id);

                return (
                  <div
                    key={log.id}
                    className="rounded-3xl border border-yellow-500/20 bg-black/45 p-5 transition hover:border-yellow-400/45"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-lg font-black text-white">
                          {client?.full_name || "Unknown Client"}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {client?.email || "No client email"}
                        </p>
                      </div>

                      <div className="text-left md:text-right">
                        <p className="text-sm font-semibold text-yellow-400">
                          {formatDateTime(log.created_at)}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-widest text-zinc-600">
                          {log.status}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Remaining
                        </p>
                        <p className="mt-1 text-xl font-black text-cyan-300">
                          {log.remaining_after === null
                            ? "N/A"
                            : log.remaining_after}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:col-span-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Result
                        </p>
                        <p className="mt-1 text-sm leading-6 text-zinc-300">
                          {log.message || "Session scanned"}
                        </p>
                      </div>
                    </div>

                    {log.trainer_note ? (
                      <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-yellow-400">
                          Trainer Note
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yellow-100">
                          {log.trainer_note}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}