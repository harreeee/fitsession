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

type SessionType = "training" | "nutrition_follow_up";

type SessionStatus = "success" | "no_show" | "late_cancel";

type LeadStatus =
  | "new"
  | "contacted"
  | "demo_booked"
  | "demo_completed"
  | "no_show"
  | "interested"
  | "follow_up"
  | "converted"
  | "lost";

type AssignedDemo = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source_type: string | null;
  source_detail: string | null;
  status: LeadStatus;
  demo_at: string | null;
  notes: string | null;
  demo_result_note: string | null;
};

type TrainerHistoryLog = {
  id: string;
  client_id: string;
  session_type: SessionType | null;
  status: string;
  message: string | null;
  session_topic: string | null;
  session_content: string | null;
  trainer_note: string | null;
  photo_path: string | null;
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

type RecordSessionRpcRow = {
  history_id: string;
  client_id: string;
  client_name: string;
  session_type: SessionType;
  session_status: SessionStatus;
  remaining_after: number | null;
  nutrition_allowed: number;
  nutrition_used: number;
  nutrition_remaining: number;
};

const MOTIVATION_QUOTES = [
  "Every scan is proof that your coaching creates momentum.",
  "Strong coaches do not just count reps. They build standards.",
  "Your energy sets the room. Lead the session before it starts.",
  "One great session can change a client's whole week.",
  "Coach with purpose. Track with discipline. Win with consistency.",
  "Great PTs create results, trust, and reasons to come back.",
];


function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function normalizeScannerRole(role: string | null | undefined) {
  const cleanRole = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (cleanRole === "nutritioncoach") return "nutrition_coach";
  return cleanRole;
}

function canScanClients(role: string | null | undefined) {
  const cleanRole = normalizeScannerRole(role);

  return (
    cleanRole === "trainer" ||
    cleanRole === "nutrition_coach" ||
    cleanRole === "admin"
  );
}

function getRoleLabel(role: string) {
  const cleanRole = normalizeScannerRole(role);

  if (cleanRole === "nutrition_coach") return "Nutrition Coach";
  if (cleanRole === "trainer") return "Trainer";
  if (cleanRole === "admin") return "Admin";
  return "Staff";
}

function getSessionStatusLabel(status: SessionStatus | string) {
  if (status === "no_show") return "No-show";
  if (status === "late_cancel") return "Late cancel";
  return "Success";
}

function getSessionStatusClass(status: SessionStatus | string) {
  if (status === "no_show") {
    return "border-orange-400/40 bg-orange-400/10 text-orange-300";
  }

  if (status === "late_cancel") {
    return "border-red-400/40 bg-red-400/10 text-red-300";
  }

  return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
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

function formatDemoDateTime(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getLeadSourceLabel(source: string | null, detail: string | null) {
  const labels: Record<string, string> = {
    walk_in: "Walk-in",
    referral: "Referral",
    facebook: "Facebook",
    instagram: "Instagram",
    google: "Google",
    other_marketing: "Other Marketing",
    other: "Other",
  };
  const base = labels[source || ""] || source || "Unknown source";
  return detail ? `${base} — ${detail}` : base;
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
  const [trainingSessionsToday, setTrainingSessionsToday] = useState(0);
  const [nutritionFollowsToday, setNutritionFollowsToday] = useState(0);
  const [clientsToday, setClientsToday] = useState(0);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<SessionType>("training");
  const [selectedSessionStatus, setSelectedSessionStatus] =
    useState<SessionStatus>("success");
  const [activeScanStatus, setActiveScanStatus] =
    useState<SessionStatus>("success");
  const [lastScannedType, setLastScannedType] =
    useState<SessionType>("training");
  const [lastScannedStatus, setLastScannedStatus] =
    useState<SessionStatus>("success");
  const [lastScannedClientId, setLastScannedClientId] = useState("");
  const [lastScannedClientName, setLastScannedClientName] = useState("");
  const [lastScannedRemaining, setLastScannedRemaining] = useState<number | null>(null);
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);

  const [historyLogs, setHistoryLogs] = useState<TrainerHistoryLog[]>([]);
  const [clientMap, setClientMap] = useState<Map<string, ClientInfo>>(new Map());
  const [historyPhotoUrls, setHistoryPhotoUrls] = useState<Map<string, string>>(
    new Map(),
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
  const [sessionTopic, setSessionTopic] = useState("");
  const [sessionContent, setSessionContent] = useState("");
  const [trainerNote, setTrainerNote] = useState("");
  const [showNoteBox, setShowNoteBox] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const [sessionPhoto, setSessionPhoto] = useState<File | null>(null);
  const [sessionPhotoPreview, setSessionPhotoPreview] = useState("");

  const [upcomingDemos, setUpcomingDemos] = useState<AssignedDemo[]>([]);
  const [loadingDemos, setLoadingDemos] = useState(false);
  const [updatingDemoId, setUpdatingDemoId] = useState<string | null>(null);

  const [noteClients, setNoteClients] = useState<ClientInfo[]>([]);
  const [selectedNoteClientId, setSelectedNoteClientId] = useState("");
  const [selectedClientHistory, setSelectedClientHistory] = useState<
    TrainerHistoryLog[]
  >([]);
  const [loadingClientHistory, setLoadingClientHistory] = useState(false);
  const [clientHistoryMessage, setClientHistoryMessage] = useState("");

  const motivationQuote = useMemo(() => getDailyMotivation(), []);
  const greeting = useMemo(() => getGreeting(), []);
  const performanceLabel = getPerformanceLabel(sessionsToday);
  const performanceMessage = getPerformanceMessage(sessionsToday);

  async function fetchUpcomingDemos(userId: string) {
    if (!isValidUuid(userId)) return;

    setLoadingDemos(true);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, full_name, email, phone, source_type, source_detail, status, demo_at, notes, demo_result_note",
      )
      .eq("assigned_trainer_id", userId)
      .gte("demo_at", start.toISOString())
      .lte("demo_at", end.toISOString())
      .in("status", ["demo_booked", "contacted", "interested", "follow_up"])
      .order("demo_at", { ascending: true });

    if (error) {
      console.error("Could not load upcoming demos:", error.message);
      setUpcomingDemos([]);
    } else {
      setUpcomingDemos((data || []) as AssignedDemo[]);
    }
    setLoadingDemos(false);
  }

  async function updateDemoStatus(
    lead: AssignedDemo,
    nextStatus: LeadStatus,
  ) {
    if (!trainerId) return;

    const note = window.prompt(
      nextStatus === "demo_completed"
        ? "Add a short demo result note (optional):"
        : nextStatus === "no_show"
          ? "Add a no-show note (optional):"
          : "Add a follow-up note (optional):",
      lead.demo_result_note || "",
    );

    if (note === null) return;

    setUpdatingDemoId(lead.id);
    const { error } = await supabase
      .from("leads")
      .update({
        status: nextStatus,
        demo_result_note: note.trim() || null,
      })
      .eq("id", lead.id)
      .eq("assigned_trainer_id", trainerId);

    if (error) {
      alert(error.message);
      setUpdatingDemoId(null);
      return;
    }

    await fetchUpcomingDemos(trainerId);
    setUpdatingDemoId(null);
  }

  function blockPendingSessionNavigation(event?: { preventDefault: () => void }) {
    if (!showNoteBox || !lastScannedHistoryId) return false;

    event?.preventDefault();
    setNoteMessage(
      "Complete the required session record before leaving this page.",
    );
    return true;
  }

  async function handleLogout() {
    if (blockPendingSessionNavigation()) return;

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
      // Keep the scan lock active until the current scan has fully finished.
      // startScanner() resets it before a new camera session begins.
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

  async function loadHistoryPhotoUrls(logs: TrainerHistoryLog[]) {
    const photoLogs = logs.filter((log) => Boolean(log.photo_path));

    if (photoLogs.length === 0) {
      setHistoryPhotoUrls(new Map());
      return;
    }

    const nextMap = new Map<string, string>();

    await Promise.all(
      photoLogs.map(async (log) => {
        if (!log.photo_path) return;

        const { data, error } = await supabase.storage
          .from("session-photos")
          .createSignedUrl(log.photo_path, 60 * 60);

        if (error) {
          console.error(
            `Could not create signed photo URL for history ${log.id}:`,
            error.message,
          );
          return;
        }

        if (data?.signedUrl) {
          nextMap.set(log.id, data.signedUrl);
        }
      }),
    );

    setHistoryPhotoUrls(nextMap);
  }

  function getRequiredTopicLabel() {
    if (lastScannedType === "nutrition_follow_up") return "Follow-up topic";
    if (lastScannedStatus === "no_show") return "No-show topic / reason";
    if (lastScannedStatus === "late_cancel") return "Late-cancel topic / reason";
    return "Session topic";
  }

  function getRequiredContentLabel() {
    if (lastScannedType === "nutrition_follow_up") return "Follow-up content";
    if (lastScannedStatus === "no_show") return "Contact / follow-up action";
    if (lastScannedStatus === "late_cancel") return "Cancellation details / next action";
    return "Session content";
  }

  function getRequiredContentPlaceholder() {
    if (lastScannedType === "nutrition_follow_up") {
      return "Example: Reviewed protein target, meal timing, hydration and next-week action items.";
    }

    if (lastScannedStatus === "no_show") {
      return "Example: Client did not arrive. Called at 6:10 PM, left a message and requested a new booking.";
    }

    if (lastScannedStatus === "late_cancel") {
      return "Example: Client cancelled 45 minutes before the session due to work. Rebook for Thursday.";
    }

    return "Example: Goblet squat 4x10, RDL 4x8, split squat 3x10/side, sled push 6 rounds. Keep squat depth controlled next time.";
  }

  async function fetchNoteClients() {
    const { data, error } = await supabase
      .from("clients")
      .select("id, profile_id, full_name, email")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Could not load clients for note history:", error.message);
      setNoteClients([]);
      return;
    }

    setNoteClients((data || []) as ClientInfo[]);
  }

  async function fetchClientLessonHistory(clientId: string) {
    const client = noteClients.find((item) => item.id === clientId);

    if (!client) {
      setSelectedClientHistory([]);
      setClientHistoryMessage("");
      return;
    }

    setLoadingClientHistory(true);
    setClientHistoryMessage("");

    const clientKeys = [client.id, client.profile_id].filter(
      (value): value is string => Boolean(value),
    );

    const { data, error } = await supabase
      .from("session_history")
      .select(
        "id, client_id, session_type, status, message, session_topic, session_content, trainer_note, photo_path, remaining_after, created_at",
      )
      .in("client_id", clientKeys)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      console.error("Could not load client lesson history:", error.message);
      setSelectedClientHistory([]);
      setClientHistoryMessage(error.message);
      setLoadingClientHistory(false);
      return;
    }

    setSelectedClientHistory((data || []) as TrainerHistoryLog[]);
    setLoadingClientHistory(false);
  }

  async function fetchTrainerStats(userId: string) {
    if (!isValidUuid(userId)) {
      console.error("Invalid staff UUID passed to fetchTrainerStats:", userId);
      setResult({
        type: "error",
        message: "Your staff account ID is invalid. Please sign out and sign in again.",
      });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayLogs, error: todayLogsError } = await supabase
      .from("session_history")
      .select("id, client_id, created_at, status, session_type")
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

    const logsToday = (todayLogs || []) as Array<{
      id: string;
      client_id: string;
      created_at: string;
      status: string;
      session_type: SessionType | null;
    }>;
    const uniqueClients = new Set(logsToday.map((log) => log.client_id));
    const trainingCount = logsToday.filter(
      (log) => (log.session_type || "training") === "training",
    ).length;
    const nutritionCount = logsToday.filter(
      (log) => log.session_type === "nutrition_follow_up",
    ).length;

    setSessionsToday(logsToday.length);
    setTrainingSessionsToday(trainingCount);
    setNutritionFollowsToday(nutritionCount);
    setClientsToday(uniqueClients.size);
    setLastScan(logsToday[0]?.created_at || null);

    const { data: recentLogs, error: recentLogsError } = await supabase
      .from("session_history")
      .select(
        "id, client_id, session_type, status, message, session_topic, session_content, trainer_note, photo_path, remaining_after, created_at"
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
    await loadHistoryPhotoUrls(cleanLogs);

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

  function clearSessionPhoto() {
    if (sessionPhotoPreview) {
      URL.revokeObjectURL(sessionPhotoPreview);
    }

    setSessionPhoto(null);
    setSessionPhotoPreview("");
  }

  function handleSessionPhotoChange(file: File | null) {
    clearSessionPhoto();

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setNoteMessage("Please choose an image file.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setNoteMessage("Photo is too large. Please choose an image under 15 MB.");
      return;
    }

    setNoteMessage("");
    setSessionPhoto(file);
    setSessionPhotoPreview(URL.createObjectURL(file));
  }

  async function compressSessionPhoto(file: File) {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1600;
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      bitmap.close();
      throw new Error("Could not prepare the session photo.");
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Could not compress the session photo."));
        },
        "image/jpeg",
        0.78,
      );
    });

    return blob;
  }

  async function uploadSessionPhoto(historyId: string) {
    if (!sessionPhoto) return null;
    if (!isValidUuid(trainerId)) {
      throw new Error("Staff account ID is invalid.");
    }

    const compressedPhoto = await compressSessionPhoto(sessionPhoto);
    const photoPath = `${trainerId}/${historyId}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("session-photos")
      .upload(photoPath, compressedPhoto, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    return photoPath;
  }

  async function saveTrainerNote() {
    if (!isValidUuid(lastScannedHistoryId)) {
      setNoteMessage("No valid completed scan was found for this update.");
      return;
    }

    const cleanTopic = sessionTopic.trim();
    const cleanContent = sessionContent.trim();
    const cleanNote = trainerNote.trim();

    if (!cleanTopic || !cleanContent) {
      setNoteMessage(
        "Session Topic and Session Content are required before this session can be completed.",
      );
      return;
    }

    setSavingNote(true);
    setNoteMessage("");

    let uploadedPhotoPath: string | null = null;

    try {
      if (sessionPhoto) {
        setNoteMessage("Uploading photo...");
        uploadedPhotoPath = await uploadSessionPhoto(lastScannedHistoryId);
      }

      const updatePayload: {
        session_topic: string;
        session_content: string;
        trainer_note: string | null;
        photo_path?: string | null;
      } = {
        session_topic: cleanTopic,
        session_content: cleanContent,
        trainer_note: cleanNote || null,
      };

      if (uploadedPhotoPath) {
        updatePayload.photo_path = uploadedPhotoPath;
      }

      const { error } = await supabase
        .from("session_history")
        .update(updatePayload)
        .eq("id", lastScannedHistoryId);

      if (error) {
        if (uploadedPhotoPath) {
          await supabase.storage
            .from("session-photos")
            .remove([uploadedPhotoPath]);
        }

        throw error;
      }

      setNoteMessage(
        sessionPhoto
          ? "Session record and photo saved. This session is complete."
          : "Session record saved. This session is complete.",
      );
      setShowNoteBox(false);
      setSessionTopic("");
      setSessionContent("");
      setTrainerNote("");
      clearSessionPhoto();
      setLastScannedHistoryId(null);
  
      if (isValidUuid(trainerId)) await fetchTrainerStats(trainerId);
      if (selectedNoteClientId) {
        await fetchClientLessonHistory(selectedNoteClientId);
      }
    } catch (error) {
      setNoteMessage(getErrorMessage(error) || "Unable to save session update.");
    } finally {
      setSavingNote(false);
    }
  }

  async function startScanner(
    requestedMode: SessionType = "training",
    requestedStatus: SessionStatus = selectedSessionStatus,
  ) {
    if (showNoteBox || lastScannedHistoryId) {
      setResult({
        type: "error",
        message:
          "Complete the required session record before scanning another client.",
      });
      return;
    }

    if (scannerStarted || scannerRef.current) return;

    const nextMode: SessionType =
      requestedMode === "nutrition_follow_up" &&
      (trainerRole === "nutrition_coach" || trainerRole === "admin")
        ? "nutrition_follow_up"
        : "training";

    const nextStatus: SessionStatus =
      nextMode === "nutrition_follow_up" ? "success" : requestedStatus;

    setScanMode(nextMode);
    setActiveScanStatus(nextStatus);

    setResult({ type: "", message: "" });
    setNoteMessage("");
    setShowNoteBox(false);
    setSessionTopic("");
    setSessionContent("");
    setTrainerNote("");
    clearSessionPhoto();
    setLastScannedHistoryId(null);
    setLastScannedClientId("");
    setLastScannedClientName("");
    setLastScannedRemaining(null);
    setLastScannedAt(null);
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

          try {
            await stopScanner();
            await markSession(qrToken, nextMode, nextStatus);
          } catch (error) {
            console.error("Scan processing error:", error);
            setResult({
              type: "error",
              message: getErrorMessage(error) || "Unable to process this scan.",
            });
          }
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

  async function markSession(
    qrToken: string,
    sessionType: SessionType,
    sessionStatus: SessionStatus,
  ) {
    const cleanQrToken = qrToken.trim();

    setShowNoteBox(false);
    setSessionTopic("");
    setSessionContent("");
    setTrainerNote("");
    clearSessionPhoto();
    setLastScannedHistoryId(null);
    setLastScannedStatus("success");
    setNoteMessage("");

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const authenticatedUserId = authData.user?.id;

    if (authError || !isValidUuid(authenticatedUserId)) {
      setResult({
        type: "error",
        message: "Your login session does not contain a valid staff ID. Please sign out and sign in again. No session was deducted.",
      });
      return;
    }

    if (!isValidUuid(trainerId) || trainerId !== authenticatedUserId) {
      setTrainerId(authenticatedUserId);
    }

    const cleanTrainerRole = normalizeScannerRole(trainerRole);

    if (!canScanClients(cleanTrainerRole)) {
      setResult({
        type: "error",
        message:
          "This account cannot scan clients. Allowed roles: trainer, nutrition coach, or admin.",
      });
      return;
    }

    if (
      sessionType === "nutrition_follow_up" &&
      cleanTrainerRole !== "nutrition_coach" &&
      cleanTrainerRole !== "admin"
    ) {
      setResult({
        type: "error",
        message:
          "Only a Nutrition Coach or Admin can record a nutrition follow-up.",
      });
      return;
    }

    if (
      sessionType === "training" &&
      !["success", "no_show", "late_cancel"].includes(sessionStatus)
    ) {
      setResult({
        type: "error",
        message: "Invalid training status. No session was deducted.",
      });
      return;
    }

    try {
      const { data, error } = await supabase.rpc("record_staff_session", {
        p_qr_token: cleanQrToken,
        p_session_type: sessionType,
        p_session_status:
          sessionType === "nutrition_follow_up" ? "success" : sessionStatus,
      });

      if (error) {
        // The database function is atomic: when it returns an error, no training
        // session should be deducted and no successful history row is created.
        const lowerMessage = error.message.toLowerCase();

        if (
          lowerMessage.includes("record_staff_session") ||
          lowerMessage.includes("function") ||
          lowerMessage.includes("schema cache")
        ) {
          throw new Error(
            "The secure session function is not installed yet. Run the nutrition follow-up SQL migration in Supabase, then reload the app.",
          );
        }

        throw error;
      }

      const rawRow = Array.isArray(data) ? data[0] : data;
      const row = rawRow as RecordSessionRpcRow | null;

      if (!row || !isValidUuid(row.history_id)) {
        console.error("Invalid RPC response from record_staff_session:", rawRow);
        throw new Error(
          "The scan function returned an invalid history ID. No additional action was taken in the app. Check the record_staff_session SQL function return columns.",
        );
      }

      const savedStatus: SessionStatus =
        row.session_type === "nutrition_follow_up"
          ? "success"
          : row.session_status || sessionStatus;

      setLastScannedHistoryId(row.history_id);
      setLastScannedType(row.session_type || sessionType);
      setLastScannedStatus(savedStatus);
      setLastScannedClientId(row.client_id || "");
      setLastScannedClientName(row.client_name || "Client");
      setLastScannedRemaining(row.remaining_after ?? null);
      setLastScannedAt(new Date().toISOString());
      setShowNoteBox(true);

      const trainingRemaining = row.remaining_after ?? 0;
      const nutritionRemaining = row.nutrition_remaining ?? 0;
      const nutritionUsed = row.nutrition_used ?? 0;
      const nutritionAllowed = row.nutrition_allowed ?? 0;

      if (row.session_type === "nutrition_follow_up") {
        setResult({
          type: "success",
          message: `QR RECORDED — ${row.client_name}. Nutrition follow-up was recorded and no training session was deducted. Complete the required Topic + Follow-up Content below before continuing. Nutrition follow-ups remaining: ${nutritionRemaining} (${nutritionUsed}/${nutritionAllowed} used). Training sessions remaining: ${trainingRemaining}.`,
        });
      } else if (savedStatus === "no_show") {
        setResult({
          type: "success",
          message: `NO-SHOW RECORDED — ${row.client_name}. 1 training session was deducted. Complete the required Topic + Follow-up Action below before continuing. Training sessions remaining: ${trainingRemaining}.`,
        });
      } else if (savedStatus === "late_cancel") {
        setResult({
          type: "success",
          message: `LATE CANCEL RECORDED — ${row.client_name}. 1 training session was deducted. Complete the required Topic + Cancellation Details below before continuing. Training sessions remaining: ${trainingRemaining}.`,
        });
      } else {
        setResult({
          type: "success",
          message: `QR RECORDED — ${row.client_name}. 1 training session was deducted. Complete the required Session Topic + Session Content below before this workflow is finished. Training sessions remaining: ${trainingRemaining}.`,
        });
      }

      if (isValidUuid(authenticatedUserId)) {
        await fetchTrainerStats(authenticatedUserId);
      }
    } catch (error) {
      setResult({
        type: "error",
        message: `${getErrorMessage(error) || "Unable to process this scan."} No session was deducted.`,
      });
    }
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

      const cleanRole = normalizeScannerRole(role);

      if (!canScanClients(cleanRole)) {
        setCheckingMessage("Redirecting to login...");
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      if (!isValidUuid(user.id)) {
        setCheckingMessage("Invalid account ID. Redirecting to login...");
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setTrainerId(user.id);
      setTrainerRole(cleanRole);

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

      await Promise.all([
        fetchTrainerStats(user.id),
        fetchUpcomingDemos(user.id),
        fetchNoteClients(),
      ]);

      if (alive) setCheckingRole(false);
    }

    protectTrainerScanPage();

    return () => {
      alive = false;
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!showNoteBox || !lastScannedHistoryId) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [showNoteBox, lastScannedHistoryId]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto flex min-h-[75vh] max-w-md items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-yellow-400" />
            <p className="mt-4 text-sm font-semibold text-yellow-400">
              {checkingMessage}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const canUseNutrition =
    trainerRole === "nutrition_coach" || trainerRole === "admin";

  const selectedStatusDescription =
    selectedSessionStatus === "no_show"
      ? "Client did not show up. Deducts 1 training session."
      : selectedSessionStatus === "late_cancel"
        ? "Client cancelled late. Deducts 1 training session."
        : "Client attended successfully. Deducts 1 training session.";

  return (
    <main className="min-h-screen bg-black pb-24 text-white md:pb-8">
      <style jsx global>{`
        html,
        body {
          background: #000;
        }

        * {
          -webkit-tap-highlight-color: transparent;
        }

        #qr-reader {
          border: 0 !important;
        }

        #qr-reader video {
          border-radius: 22px !important;
          object-fit: cover !important;
        }

        #qr-reader img {
          display: none !important;
        }

        #qr-reader__scan_region {
          background: #080808 !important;
        }

        #qr-reader__dashboard {
          border: 0 !important;
          background: #080808 !important;
          color: #fff !important;
          padding: 12px !important;
        }

        #qr-reader__dashboard button,
        #qr-reader__dashboard select {
          border-radius: 12px !important;
        }

        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        ::-webkit-scrollbar-track {
          background: #090909;
        }

        ::-webkit-scrollbar-thumb {
          background: #facc15;
          border-radius: 999px;
        }
      `}</style>

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-4 md:px-6 md:pt-6">
        <header id="home" className="mb-5 md:mb-7">
          <div className="flex items-center justify-between gap-4">
            <div className="leading-none">
              <div className="text-[28px] font-black italic tracking-[-0.08em] text-white">
                F<span className="text-yellow-400">X</span>A
              </div>
              <div className="mt-1 text-[9px] font-black tracking-[0.36em] text-white">
                FITNESS
              </div>
              <div className="mt-1 text-[7px] font-bold uppercase tracking-[0.18em] text-yellow-400">
                Stronger everyday
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-white/10 bg-[#101010] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400 sm:inline-flex">
                {getRoleLabel(trainerRole)}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-white/10 bg-[#101010] px-3 py-2 text-xs font-bold text-zinc-300 transition hover:border-red-400/50 hover:text-red-300"
              >
                Log out
              </button>
            </div>
          </div>

          <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_230px] lg:items-end">
            <div>
              <p className="text-xl font-medium text-zinc-400 md:text-2xl">
                {greeting},
              </p>
              <h1 className="mt-1 text-4xl font-black tracking-tight text-yellow-400 md:text-5xl">
                {getFirstName(trainerName || "Coach")} 👋
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300 md:text-base">
                {motivationQuote}
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
                {performanceLabel} · {performanceMessage}
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111] p-3 lg:flex-col lg:items-stretch lg:text-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-lg font-black text-black lg:mx-auto">
                {getInitials(trainerName || trainerEmail || "FX")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">
                  {trainerName || "Staff"}
                </p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-400">
                  {getRoleLabel(trainerRole)}
                </p>
              </div>
            </div>
          </div>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-300">
                Today Overview
              </p>
              <Link
                href="/history"
                onClick={(event) => blockPendingSessionNavigation(event)}
                className="text-xs font-bold text-yellow-400 hover:text-yellow-300"
              >
                See all
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
              <div className="rounded-2xl border border-yellow-400/35 bg-[#10100c] p-4 text-center">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-400/10 text-lg text-yellow-400">
                  ◫
                </div>
                <p className="mt-2 text-2xl font-black text-yellow-400">
                  {sessionsToday}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-zinc-300">
                  Paid Sessions
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-400/25 bg-[#0b110d] p-4 text-center">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-lg text-emerald-300">
                  ✓
                </div>
                <p className="mt-2 text-2xl font-black text-emerald-300">
                  {trainingSessionsToday}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-zinc-300">
                  Training Sessions
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-400/25 bg-[#091011] p-4 text-center">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 text-lg text-cyan-300">
                  ◌
                </div>
                <p className="mt-2 text-2xl font-black text-cyan-300">
                  {nutritionFollowsToday}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-zinc-300">
                  Nutrition Follow-ups
                </p>
              </div>

              <div className="rounded-2xl border border-purple-400/25 bg-[#100b12] p-4 text-center">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-purple-400/10 text-lg text-purple-300">
                  ●
                </div>
                <p className="mt-2 text-2xl font-black text-purple-300">
                  {clientsToday}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-zinc-300">
                  Active Clients
                </p>
              </div>
            </div>
          </section>

          <section className="mt-7">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-zinc-300">
              Quick Actions
            </p>
            <div className="grid grid-cols-4 gap-2 md:max-w-2xl md:gap-3">
              <a
                href="#scan"
                className="rounded-2xl border border-yellow-400/35 bg-[#121212] px-2 py-4 text-center transition hover:border-yellow-400 hover:bg-yellow-400/10"
              >
                <div className="text-xl text-yellow-400">⌗</div>
                <p className="mt-2 text-[10px] font-bold text-white sm:text-xs">
                  Scan QR
                </p>
              </a>
              <Link
                href="/trainer/clients"
                onClick={(event) => blockPendingSessionNavigation(event)}
                className="rounded-2xl border border-white/10 bg-[#121212] px-2 py-4 text-center transition hover:border-yellow-400/50"
              >
                <div className="text-xl text-yellow-400">♙</div>
                <p className="mt-2 text-[10px] font-bold text-white sm:text-xs">
                  Clients
                </p>
              </Link>
              <Link
                href="/trainer/calendar"
                onClick={(event) => blockPendingSessionNavigation(event)}
                className="rounded-2xl border border-white/10 bg-[#121212] px-2 py-4 text-center transition hover:border-yellow-400/50"
              >
                <div className="text-xl text-yellow-400">□</div>
                <p className="mt-2 text-[10px] font-bold text-white sm:text-xs">
                  Calendar
                </p>
              </Link>
              <Link
                href="/history"
                onClick={(event) => blockPendingSessionNavigation(event)}
                className="rounded-2xl border border-white/10 bg-[#121212] px-2 py-4 text-center transition hover:border-yellow-400/50"
              >
                <div className="text-xl text-yellow-400">▤</div>
                <p className="mt-2 text-[10px] font-bold text-white sm:text-xs">
                  History
                </p>
              </Link>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-cyan-400/20 bg-[#0d1010] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.13em] text-cyan-300">
                  Upcoming Demos
                </p>
                <p className="mt-1 text-xs font-semibold text-emerald-300">
                  Next 7 days
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-emerald-300">
                  {upcomingDemos.length}
                </p>
                <p className="text-[10px] text-zinc-500">assigned</p>
              </div>
            </div>

            {loadingDemos ? (
              <p className="mt-3 text-xs text-zinc-500">Loading demos...</p>
            ) : upcomingDemos.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-500">
                No demos assigned in the next seven days.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {upcomingDemos.slice(0, 3).map((demo) => (
                  <div
                    key={demo.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {demo.full_name}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {formatDemoDateTime(demo.demo_at)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-cyan-300/25 px-2 py-1 text-[9px] font-black uppercase text-cyan-300">
                      {demo.status.replaceAll("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </header>

        <section
          id="scan"
          className="scroll-mt-4 border-t border-white/10 pt-8 md:pt-10"
        >
          <div className="mx-auto max-w-2xl">
            {!scannerStarted && !showNoteBox ? (
              <div>
                <div className="text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-yellow-400/15 bg-yellow-400/[0.05] text-5xl text-yellow-400">
                    ▣
                  </div>
                  <h2 className="mt-5 text-2xl font-black md:text-3xl">
                    Scan Client QR
                  </h2>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
                    Choose the training result before scanning. Each training option
                    deducts 1 training session.
                  </p>
                </div>

                <div className="mt-8">
                  <p className="mb-3 text-xs font-black uppercase tracking-[0.13em] text-zinc-400">
                    Select Training Result
                  </p>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setSelectedSessionStatus("success")}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedSessionStatus === "success"
                          ? "border-yellow-400 bg-yellow-400/[0.08] shadow-[0_0_0_1px_rgba(250,204,21,0.12)]"
                          : "border-white/15 bg-[#101010] hover:border-white/30"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${selectedSessionStatus === "success" ? "bg-yellow-400 text-black" : "border border-white/20 text-white"}`}>
                          ✓
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`text-base font-black ${selectedSessionStatus === "success" ? "text-yellow-400" : "text-white"}`}>
                              Success
                            </p>
                            <span className="rounded-full bg-yellow-400/10 px-2 py-1 text-[9px] font-black uppercase text-yellow-400">
                              Default
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-400">
                            Client attended successfully.
                          </p>
                        </div>
                        <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${selectedSessionStatus === "success" ? "border-yellow-400 bg-yellow-400 shadow-[inset_0_0_0_4px_#000]" : "border-zinc-500"}`} />
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedSessionStatus("no_show")}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedSessionStatus === "no_show"
                          ? "border-orange-400 bg-orange-400/[0.08]"
                          : "border-white/15 bg-[#101010] hover:border-white/30"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-lg text-white">
                          ✓
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-black text-white">No-Show</p>
                          <p className="mt-1 text-xs text-zinc-400">
                            Client did not show up.
                          </p>
                        </div>
                        <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${selectedSessionStatus === "no_show" ? "border-orange-400 bg-orange-400 shadow-[inset_0_0_0_4px_#000]" : "border-zinc-500"}`} />
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedSessionStatus("late_cancel")}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedSessionStatus === "late_cancel"
                          ? "border-orange-500 bg-orange-500/[0.08]"
                          : "border-white/15 bg-[#101010] hover:border-white/30"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-500/60 text-lg text-orange-400">
                          ◷
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-black text-white">Late Cancel</p>
                          <p className="mt-1 text-xs text-zinc-400">
                            Client cancelled late.
                          </p>
                        </div>
                        <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${selectedSessionStatus === "late_cancel" ? "border-orange-500 bg-orange-500 shadow-[inset_0_0_0_4px_#000]" : "border-zinc-500"}`} />
                      </div>
                    </button>

                    {canUseNutrition ? (
                      <button
                        type="button"
                        onClick={() => startScanner("nutrition_follow_up", "success")}
                        className="w-full rounded-2xl border border-emerald-400/35 bg-emerald-400/[0.06] p-4 text-left transition hover:border-emerald-400/70"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 text-lg text-emerald-300">
                            ◇
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-black text-emerald-300">
                              Nutrition Follow-Up
                            </p>
                            <p className="mt-1 text-xs text-zinc-400">
                              Does not deduct a training session. Tap to scan now.
                            </p>
                          </div>
                          <span className="text-lg text-emerald-300">›</span>
                        </div>
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-[#0c0c0c] p-3 text-xs leading-5 text-zinc-500">
                    Selected: <span className="font-bold text-white">{getSessionStatusLabel(selectedSessionStatus)}</span> · {selectedStatusDescription}
                  </div>

                  <button
                    type="button"
                    onClick={() => startScanner("training", selectedSessionStatus)}
                    className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-yellow-400 px-5 py-4 text-sm font-black uppercase tracking-[0.08em] text-black transition hover:bg-yellow-300 active:scale-[0.99]"
                  >
                    <span className="text-xl">⌗</span>
                    Start Scan
                  </button>
                </div>
              </div>
            ) : null}

            {scannerStarted ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={stopScanner}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#111] text-xl text-white"
                    aria-label="Back"
                  >
                    ‹
                  </button>
                  <div className="text-center">
                    <h2 className="text-xl font-black">Scan QR Code</h2>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-yellow-400">
                      {scanMode === "nutrition_follow_up"
                        ? "Nutrition Follow-Up"
                        : getSessionStatusLabel(activeScanStatus)}
                    </p>
                  </div>
                  <div className="h-10 w-10" />
                </div>

                <p className="mx-auto mt-5 max-w-sm text-center text-sm leading-6 text-zinc-400">
                  Position the client&apos;s QR code within the frame.
                </p>

                <div className="relative mt-7 rounded-[28px] border border-yellow-400/25 bg-[#0a0a0a] p-2 shadow-[0_0_50px_rgba(250,204,21,0.08)]">
                  <span className="absolute left-0 top-0 z-20 h-8 w-8 rounded-tl-[24px] border-l-4 border-t-4 border-yellow-400" />
                  <span className="absolute right-0 top-0 z-20 h-8 w-8 rounded-tr-[24px] border-r-4 border-t-4 border-yellow-400" />
                  <span className="absolute bottom-0 left-0 z-20 h-8 w-8 rounded-bl-[24px] border-b-4 border-l-4 border-yellow-400" />
                  <span className="absolute bottom-0 right-0 z-20 h-8 w-8 rounded-br-[24px] border-b-4 border-r-4 border-yellow-400" />
                  <div
                    id="qr-reader"
                    className="min-h-[360px] w-full overflow-hidden rounded-[22px] bg-[#080808] text-white md:min-h-[500px]"
                  />
                </div>

                <button
                  type="button"
                  onClick={stopScanner}
                  className="mt-6 w-full rounded-2xl border border-yellow-400/50 bg-yellow-400/[0.05] px-5 py-3.5 text-sm font-bold text-yellow-400"
                >
                  Stop Scanner
                </button>
              </div>
            ) : null}

            {!scannerStarted && result.message ? (
              <div className="mt-7">
                <div
                  className={`rounded-2xl border p-4 text-sm leading-6 ${getResultClass(
                    result.type,
                  )}`}
                >
                  {result.message}
                </div>
              </div>
            ) : null}

            {!scannerStarted && result.type === "success" && lastScannedClientName ? (
              <section className="mt-6">
                <div className="text-center">
                  <div className="text-5xl">🎉</div>
                  <h2 className="mt-3 text-3xl font-black text-emerald-300">
                    {lastScannedType === "nutrition_follow_up"
                      ? "Recorded!"
                      : getSessionStatusLabel(lastScannedStatus)}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {lastScannedType === "nutrition_follow_up"
                      ? "Nutrition follow-up recorded."
                      : "Training session recorded."}
                  </p>
                </div>

                <div className="mt-5 rounded-2xl border border-white/15 bg-[#111] p-4">
                  <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400 text-sm font-black text-black">
                      {getInitials(lastScannedClientName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-black text-white">
                        {lastScannedClientName}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {lastScannedClientId
                          ? `Client ID: ${lastScannedClientId.slice(0, 8)}…`
                          : "Client"}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-300">
                      Recorded
                    </span>
                  </div>

                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-zinc-500">Result</span>
                      <span className="font-semibold text-white">
                        {lastScannedType === "nutrition_follow_up"
                          ? "Nutrition Follow-Up"
                          : getSessionStatusLabel(lastScannedStatus)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-zinc-500">Deducted</span>
                      <span className="font-semibold text-white">
                        {lastScannedType === "nutrition_follow_up"
                          ? "0 training sessions"
                          : "1 training session"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-zinc-500">Remaining sessions</span>
                      <span className="text-lg font-black text-emerald-300">
                        {lastScannedRemaining === null
                          ? "—"
                          : lastScannedRemaining}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-zinc-500">Scanned at</span>
                      <span className="font-semibold text-white">
                        {formatDateTime(lastScannedAt)}
                      </span>
                    </div>
                  </div>

                  {lastScannedClientId ? (
                    <Link
                      href={`/trainer/clients/${lastScannedClientId}`}
                      onClick={(event) => blockPendingSessionNavigation(event)}
                      className="mt-4 block rounded-xl border border-yellow-400/40 px-4 py-3 text-center text-xs font-black uppercase tracking-[0.08em] text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                    >
                      View Client Profile
                    </Link>
                  ) : null}
                </div>
              </section>
            ) : null}

            {showNoteBox ? (
              <section className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-yellow-400">
                      Required Session Record
                    </p>
                    <h3 className="mt-1 text-xl font-black">Save & Finish</h3>
                  </div>
                  <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-2 py-1 text-[9px] font-black uppercase text-orange-300">
                    Incomplete
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.1em] text-yellow-400">
                      {getRequiredTopicLabel()} *
                    </label>
                    <input
                      value={sessionTopic}
                      onChange={(event) => setSessionTopic(event.target.value)}
                      placeholder={
                        lastScannedType === "nutrition_follow_up"
                          ? "Protein & hydration review"
                          : lastScannedStatus === "no_show"
                            ? "No-show follow-up"
                            : lastScannedStatus === "late_cancel"
                              ? "Late cancellation follow-up"
                              : "Lower Body Strength — Squat Focus"
                      }
                      className="w-full rounded-2xl border border-white/15 bg-[#111] px-4 py-3.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.1em] text-yellow-400">
                      {getRequiredContentLabel()} *
                    </label>
                    <textarea
                      value={sessionContent}
                      onChange={(event) => setSessionContent(event.target.value)}
                      placeholder={getRequiredContentPlaceholder()}
                      className="min-h-36 w-full rounded-2xl border border-white/15 bg-[#111] px-4 py-3.5 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="text-[11px] font-black uppercase tracking-[0.1em] text-yellow-400">
                        Add Note
                      </label>
                      <span className="text-[10px] font-semibold uppercase text-zinc-600">
                        Optional
                      </span>
                    </div>
                    <textarea
                      value={trainerNote}
                      onChange={(event) => setTrainerNote(event.target.value)}
                      placeholder="Add a quick note..."
                      className="min-h-24 w-full rounded-2xl border border-white/15 bg-[#111] px-4 py-3.5 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
                    />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#0e0e0e] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-white">Session Photo</p>
                        <p className="mt-1 text-[11px] text-zinc-500">Optional</p>
                      </div>
                      <label className="cursor-pointer rounded-xl border border-yellow-400/40 px-3 py-2 text-xs font-bold text-yellow-400 transition hover:bg-yellow-400 hover:text-black">
                        {sessionPhoto ? "Change Photo" : "Add Photo"}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(event) =>
                            handleSessionPhotoChange(
                              event.target.files?.[0] || null,
                            )
                          }
                        />
                      </label>
                    </div>

                    {sessionPhotoPreview ? (
                      <div className="mt-4">
                        <img
                          src={sessionPhotoPreview}
                          alt="Selected session preview"
                          className="max-h-72 w-full rounded-2xl border border-white/10 object-cover"
                        />
                        <button
                          type="button"
                          onClick={clearSessionPhoto}
                          disabled={savingNote}
                          className="mt-3 text-xs font-bold text-red-300 disabled:opacity-50"
                        >
                          Remove photo
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {noteMessage ? (
                  <p className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.06] p-3 text-xs leading-5 text-yellow-300">
                    {noteMessage}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={saveTrainerNote}
                  disabled={
                    savingNote || !sessionTopic.trim() || !sessionContent.trim()
                  }
                  className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-4 text-sm font-black uppercase tracking-[0.08em] text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingNote ? "Saving..." : "Save & Finish"}
                </button>
              </section>
            ) : null}

            {!scannerStarted && !showNoteBox && result.type === "success" ? (
              <button
                type="button"
                onClick={() => {
                  setResult({ type: "", message: "" });
                  setLastScannedClientId("");
                  setLastScannedClientName("");
                  setLastScannedRemaining(null);
                  setLastScannedAt(null);
                  document.getElementById("scan")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
                className="mt-4 w-full rounded-2xl border border-yellow-400/60 px-5 py-3.5 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-yellow-400 hover:text-black"
              >
                Scan Another
              </button>
            ) : null}
          </div>
        </section>

        <section className="mt-10 grid gap-5 border-t border-white/10 pt-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div id="notes" className="rounded-3xl border border-white/10 bg-[#0e0e0e] p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-yellow-400">
              Previous Lesson Plans
            </p>
            <h2 className="mt-2 text-xl font-black">Client Note History</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Select a client to review previous session topics and coaching notes.
            </p>

            <select
              value={selectedNoteClientId}
              onChange={async (event) => {
                const clientId = event.target.value;
                setSelectedNoteClientId(clientId);
                setSelectedClientHistory([]);
                if (clientId) await fetchClientLessonHistory(clientId);
              }}
              className="mt-4 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
            >
              <option value="">Choose a client...</option>
              {noteClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name}
                  {client.email ? ` — ${client.email}` : ""}
                </option>
              ))}
            </select>

            {loadingClientHistory ? (
              <p className="mt-4 text-xs text-yellow-400">Loading history...</p>
            ) : clientHistoryMessage ? (
              <p className="mt-4 text-xs text-red-300">{clientHistoryMessage}</p>
            ) : selectedNoteClientId && selectedClientHistory.length === 0 ? (
              <p className="mt-4 text-xs text-zinc-600">
                No previous session notes found.
              </p>
            ) : null}

            {selectedClientHistory.length > 0 ? (
              <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {selectedClientHistory.map((log) => (
                  <article
                    key={log.id}
                    className="rounded-2xl border border-white/10 bg-black/50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${log.session_type === "nutrition_follow_up" ? "bg-emerald-400/10 text-emerald-300" : "bg-yellow-400/10 text-yellow-400"}`}>
                          {log.session_type === "nutrition_follow_up"
                            ? "Nutrition"
                            : "Training"}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getSessionStatusClass(log.status)}`}>
                          {getSessionStatusLabel(log.status)}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-600">
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>

                    {log.session_topic ? (
                      <p className="mt-3 text-sm font-bold text-white">
                        {log.session_topic}
                      </p>
                    ) : null}
                    {log.session_content ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-400">
                        {log.session_content}
                      </p>
                    ) : null}
                    {log.trainer_note ? (
                      <p className="mt-2 rounded-xl bg-yellow-400/[0.05] p-3 text-xs leading-5 text-yellow-100">
                        {log.trainer_note}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <div id="demos" className="rounded-3xl border border-cyan-400/15 bg-[#0d0f0f] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-cyan-300">
                  Upcoming Demos
                </p>
                <h2 className="mt-2 text-xl font-black">Assigned Potential Clients</h2>
              </div>
              <button
                type="button"
                onClick={() => trainerId && fetchUpcomingDemos(trainerId)}
                disabled={loadingDemos}
                className="rounded-xl border border-cyan-300/30 px-3 py-2 text-[10px] font-black uppercase text-cyan-300 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {upcomingDemos.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-500">
                No demos assigned in the next seven days.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {upcomingDemos.map((demo) => (
                  <article
                    key={demo.id}
                    className="rounded-2xl border border-white/10 bg-black/45 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-black text-white">{demo.full_name}</p>
                        <p className="mt-1 text-xs font-semibold text-cyan-300">
                          {formatDemoDateTime(demo.demo_at)}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {demo.phone || demo.email || "No contact details"}
                        </p>
                        <p className="mt-1 text-[11px] text-yellow-400">
                          {getLeadSourceLabel(demo.source_type, demo.source_detail)}
                        </p>
                      </div>
                      <span className="w-fit rounded-full border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400">
                        {demo.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => updateDemoStatus(demo, "demo_completed")}
                        disabled={updatingDemoId === demo.id}
                        className="rounded-xl bg-emerald-400 px-2 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
                      >
                        Completed
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDemoStatus(demo, "no_show")}
                        disabled={updatingDemoId === demo.id}
                        className="rounded-xl bg-orange-500 px-2 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
                      >
                        No-show
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDemoStatus(demo, "follow_up")}
                        disabled={updatingDemoId === demo.id}
                        className="rounded-xl border border-yellow-400/40 px-2 py-2.5 text-[10px] font-black uppercase text-yellow-400 disabled:opacity-50"
                      >
                        Follow-up
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="history" className="mt-8 rounded-3xl border border-white/10 bg-[#0d0d0d] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-yellow-400">
                Session History
              </p>
              <h2 className="mt-2 text-xl font-black">Recent Sessions</h2>
            </div>
            <Link
              href="/history"
              onClick={(event) => blockPendingSessionNavigation(event)}
              className="rounded-xl border border-yellow-400/40 px-3 py-2 text-[10px] font-black uppercase text-yellow-400"
            >
              View all
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {historyLogs.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/15 p-5 text-center text-xs text-zinc-500">
                No session history yet.
              </p>
            ) : (
              historyLogs.slice(0, 8).map((log) => {
                const client = clientMap.get(log.client_id);
                return (
                  <article
                    key={log.id}
                    className="rounded-2xl border border-white/10 bg-black/45 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-black ${getSessionStatusClass(log.status)}`}>
                        {log.status === "success" ? "✓" : "!"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-black text-white">
                            {getSessionStatusLabel(log.status)}
                          </p>
                          {log.session_type === "nutrition_follow_up" ? (
                            <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-300">
                              Nutrition
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-400">
                          {client?.full_name || "Unknown Client"}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-600">
                          {log.session_type === "nutrition_follow_up"
                            ? "No training session deducted"
                            : "1 session deducted"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-400">
                          {formatTime(log.created_at)}
                        </p>
                        <p className="mt-1 text-lg text-zinc-500">›</p>
                      </div>
                    </div>

                    {log.session_topic ? (
                      <p className="mt-3 border-t border-white/10 pt-3 text-xs font-semibold text-yellow-100">
                        {log.session_topic}
                      </p>
                    ) : null}

                    {log.photo_path && historyPhotoUrls.get(log.id) ? (
                      <a
                        href={historyPhotoUrls.get(log.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 block overflow-hidden rounded-xl border border-white/10"
                      >
                        <img
                          src={historyPhotoUrls.get(log.id)}
                          alt={`Session for ${client?.full_name || "client"}`}
                          loading="lazy"
                          className="max-h-52 w-full object-cover"
                        />
                      </a>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section id="profile" className="mt-8 rounded-3xl border border-white/10 bg-[#0d0d0d] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400 text-lg font-black text-black">
              {getInitials(trainerName || trainerEmail || "FX")}
            </div>
            <div>
              <h2 className="text-lg font-black">{trainerName || "Staff"}</h2>
              <p className="mt-1 text-xs text-zinc-500">{trainerEmail}</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-400">
                {getRoleLabel(trainerRole)}
              </p>
            </div>
          </div>

          <form onSubmit={saveProfile} className="mt-5 grid gap-3 md:grid-cols-2">
            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="Full name"
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
            />
            <input
              value={editEmail}
              onChange={(event) => setEditEmail(event.target.value)}
              type="email"
              placeholder="Email"
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
            />
            <input
              value={editPhone}
              onChange={(event) => setEditPhone(event.target.value)}
              placeholder="Phone number"
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
            />
            <input
              value={editPassword}
              onChange={(event) => setEditPassword(event.target.value)}
              type="password"
              minLength={6}
              placeholder="New password optional"
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
            />
            <button
              disabled={savingProfile}
              className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase text-black disabled:opacity-50 md:col-span-2"
            >
              {savingProfile ? "Saving..." : "Save Profile"}
            </button>
          </form>

          {profileMessage ? (
            <p className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.06] p-3 text-xs text-yellow-300">
              {profileMessage}
            </p>
          ) : null}
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          <a href="#home" className="px-1 py-1.5 text-center text-yellow-400">
            <div className="text-lg">⌂</div>
            <div className="mt-1 text-[9px] font-bold">Home</div>
          </a>
          <a href="#scan" className="px-1 py-1.5 text-center text-zinc-300">
            <div className="text-lg">⌗</div>
            <div className="mt-1 text-[9px] font-bold">Scan</div>
          </a>
          <Link
            href="/trainer/clients"
            onClick={(event) => blockPendingSessionNavigation(event)}
            className="px-1 py-1.5 text-center text-zinc-300"
          >
            <div className="text-lg">♙</div>
            <div className="mt-1 text-[9px] font-bold">Clients</div>
          </Link>
          <Link
            href="/trainer/calendar"
            onClick={(event) => blockPendingSessionNavigation(event)}
            className="px-1 py-1.5 text-center text-zinc-300"
          >
            <div className="text-lg">□</div>
            <div className="mt-1 text-[9px] font-bold">Calendar</div>
          </Link>
          <a href="#profile" className="px-1 py-1.5 text-center text-zinc-300">
            <div className="text-lg">☰</div>
            <div className="mt-1 text-[9px] font-bold">Menu</div>
          </a>
        </div>
      </nav>
    </main>
  );
}
