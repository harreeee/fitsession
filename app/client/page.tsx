"use client";

import { FormEvent, useEffect, useState } from "react";
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


function HomeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 10.5 12 3.75l8.25 6.75v8.25a1.5 1.5 0 0 1-1.5 1.5h-13.5a1.5 1.5 0 0 1-1.5-1.5V10.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20.25v-6h6v6" />
    </svg>
  );
}

function QrIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 14h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2h-2v-2Zm4 0h2v2h-2v-2Z" />
    </svg>
  );
}

function CalendarIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3.75v3M17.25 3.75v3M4.5 8.25h15M5.25 5.25h13.5A1.5 1.5 0 0 1 20.25 6.75v12a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-12a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  );
}

function UserIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <circle cx="12" cy="8.25" r="3.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 20c.7-4.1 3.1-6.15 7-6.15S18.3 15.9 19 20" />
    </svg>
  );
}

function HistoryIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5V9H9M12 7.5V12l3 2" />
    </svg>
  );
}

function CardIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path strokeLinecap="round" d="M3.5 10h17" />
    </svg>
  );
}

function ChevronRightIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
    </svg>
  );
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

  return String(error || "Unknown error");
}

async function compressProfilePhoto(file: File): Promise<Blob> {
  const maxDimension = 1200;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not prepare your profile photo.");
  }

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
  } else {
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error("Could not read this image file."));
        nextImage.src = objectUrl;
      });

      const scale = Math.min(
        1,
        maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not compress your profile photo."));
      },
      "image/jpeg",
      0.82,
    );
  });
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
  const [activeTab, setActiveTab] = useState<"home" | "qr" | "schedule" | "account">("home");

  const [clientPhotoPath, setClientPhotoPath] = useState("");
  const [clientPhotoUrl, setClientPhotoUrl] = useState("");
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState("");
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [profilePhotoMessage, setProfilePhotoMessage] = useState("");

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordMessageType, setPasswordMessageType] = useState<
    "success" | "error" | ""
  >("");

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/client/login");
  }

  function selectTab(tab: "home" | "qr" | "schedule" | "account") {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadClientProfilePhoto(path: string | null | undefined) {
    const cleanPath = String(path || "").trim();
    setClientPhotoPath(cleanPath);

    if (!cleanPath) {
      setClientPhotoUrl("");
      return;
    }

    const { data, error } = await supabase.storage
      .from("profile-photos")
      .createSignedUrl(cleanPath, 60 * 60 * 24 * 7);

    if (error || !data?.signedUrl) {
      console.error("Could not load client profile photo:", error?.message);
      setClientPhotoUrl("");
      return;
    }

    const separator = data.signedUrl.includes("?") ? "&" : "?";
    setClientPhotoUrl(`${data.signedUrl}${separator}v=${Date.now()}`);
  }

  function clearProfilePhotoSelection() {
    if (profilePhotoPreview) {
      URL.revokeObjectURL(profilePhotoPreview);
    }

    setProfilePhotoFile(null);
    setProfilePhotoPreview("");
  }

  function handleProfilePhotoChange(file: File | null) {
    clearProfilePhotoSelection();
    setProfilePhotoMessage("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfilePhotoMessage("Please choose an image file.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setProfilePhotoMessage("Photo is too large. Please choose an image under 15 MB.");
      return;
    }

    setProfilePhotoFile(file);
    setProfilePhotoPreview(URL.createObjectURL(file));
  }

  async function saveProfilePhoto() {
    if (!profilePhotoFile) return;

    setUploadingProfilePhoto(true);
    setProfilePhotoMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Your login session expired. Please sign in again.");
      }

      const compressedPhoto = await compressProfilePhoto(profilePhotoFile);
      const photoPath = `${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(photoPath, compressedPhoto, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { error: pathError } = await supabase.rpc("set_own_profile_photo", {
        p_photo_path: photoPath,
      });

      if (pathError) {
        throw new Error(
          `${pathError.message}. Run the Client Profile Photo SQL migration in Supabase first.`,
        );
      }

      await loadClientProfilePhoto(photoPath);
      clearProfilePhotoSelection();
      setProfilePhotoMessage("Profile photo updated successfully.");
    } catch (error) {
      setProfilePhotoMessage(getErrorMessage(error));
    } finally {
      setUploadingProfilePhoto(false);
    }
  }

  async function removeProfilePhoto() {
    if (!clientPhotoPath) return;

    setUploadingProfilePhoto(true);
    setProfilePhotoMessage("");

    try {
      const oldPath = clientPhotoPath;
      const { error: pathError } = await supabase.rpc("set_own_profile_photo", {
        p_photo_path: null,
      });

      if (pathError) throw pathError;

      const { error: removeError } = await supabase.storage
        .from("profile-photos")
        .remove([oldPath]);

      if (removeError) {
        console.warn("Profile photo path cleared but Storage cleanup failed:", removeError.message);
      }

      clearProfilePhotoSelection();
      setClientPhotoPath("");
      setClientPhotoUrl("");
      setProfilePhotoMessage("Profile photo removed.");
    } catch (error) {
      setProfilePhotoMessage(getErrorMessage(error));
    } finally {
      setUploadingProfilePhoto(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPasswordMessage("");
    setPasswordMessageType("");

    const cleanPassword = newPassword.trim();
    const cleanConfirmPassword = confirmPassword.trim();

    if (cleanPassword.length < 6) {
      setPasswordMessage("Password must be at least 6 characters.");
      setPasswordMessageType("error");
      return;
    }

    if (cleanPassword !== cleanConfirmPassword) {
      setPasswordMessage("Passwords do not match.");
      setPasswordMessageType("error");
      return;
    }

    setSavingPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: cleanPassword,
    });

    if (error) {
      setPasswordMessage(error.message);
      setPasswordMessageType("error");
      setSavingPassword(false);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Password updated successfully.");
    setPasswordMessageType("success");
    setSavingPassword(false);
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

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("profile_photo_path")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) {
      console.warn(
        "Could not load client profile photo. Run the Client Profile Photo SQL migration if the column is missing:",
        profileError.message,
      );
      setClientPhotoPath("");
      setClientPhotoUrl("");
    } else {
      await loadClientProfilePhoto(
        (profileData as { profile_photo_path?: string | null } | null)?.profile_photo_path,
      );
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
  const nextBooking = upcomingBookings[0] ?? null;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <style jsx global>{`
        html,
        body {
          background: #050505;
          overscroll-behavior-y: none;
        }

        * {
          -webkit-tap-highlight-color: transparent;
        }

        .fxa-safe-top {
          padding-top: max(10px, env(safe-area-inset-top));
        }

        .fxa-bottom-space {
          padding-bottom: calc(104px + env(safe-area-inset-bottom));
        }

        .fxa-bottom-safe {
          padding-bottom: max(10px, env(safe-area-inset-bottom));
        }

        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .fade-up {
          animation: fade-up 0.32s ease both;
        }

        @keyframes glow-pulse {
          0%,
          100% {
            box-shadow: 0 0 24px rgba(250, 204, 21, 0.12);
          }
          50% {
            box-shadow: 0 0 44px rgba(250, 204, 21, 0.24);
          }
        }

        .glow-pulse {
          animation: glow-pulse 3s ease-in-out infinite;
        }
      `}</style>

      <header className="fxa-safe-top sticky top-0 z-30 border-b border-white/[0.06] bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 pb-3 pt-2">
          <button
            type="button"
            onClick={() => selectTab("home")}
            className="flex items-center gap-2 rounded-xl py-2 text-left"
            aria-label="Go to home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-yellow-400/20 bg-yellow-400/[0.08] text-sm font-black text-yellow-400">
              FXA
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-yellow-400">
                FXA Fitness
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">Client Portal</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => selectTab("account")}
            className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border text-xs font-black transition active:scale-95 ${
              activeTab === "account"
                ? "border-yellow-400 bg-yellow-400 text-black"
                : "border-white/10 bg-white/[0.05] text-white"
            }`}
            aria-label="Open account"
          >
            {clientPhotoUrl ? (
              <img
                src={clientPhotoUrl}
                alt={`${client.full_name} profile`}
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(client.full_name) || "FX"
            )}
          </button>
        </div>
      </header>

      <div className="fxa-bottom-space mx-auto max-w-xl px-4 pt-5 sm:px-5">
        {activeTab === "home" ? (
          <div className="fade-up space-y-4">
            <section className="overflow-hidden rounded-[28px] border border-yellow-400/20 bg-[radial-gradient(circle_at_top_right,_rgba(250,204,21,0.17),_transparent_40%),linear-gradient(145deg,_#151208,_#0a0a0a_55%,_#050505)] p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-400">Welcome back,</p>
                  <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight text-white">
                    {getFirstName(client.full_name)} <span aria-hidden="true">👋</span>
                  </h1>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">
                    {quote}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => selectTab("account")}
                    className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-yellow-400/70 bg-yellow-400 text-sm font-black text-black shadow-[0_0_28px_rgba(250,204,21,0.10)]"
                    aria-label="Open profile photo settings"
                  >
                    {clientPhotoUrl ? (
                      <img
                        src={clientPhotoUrl}
                        alt={`${client.full_name} profile`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(client.full_name) || "FX"
                    )}
                  </button>
                  <StatusPill status={client.status} />
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-white/[0.08] bg-black/35 p-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      Sessions remaining
                    </p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span
                        className={`text-5xl font-semibold tabular-nums leading-none ${getSessionTextClass(
                          activePackage?.remaining_sessions,
                        )}`}
                      >
                        {activePackage?.remaining_sessions ?? 0}
                      </span>
                      <span className="text-sm text-zinc-500">
                        of {activePackage?.total_sessions ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="relative h-16 w-16 shrink-0">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
                      <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                      <circle
                        cx="28"
                        cy="28"
                        r="22"
                        fill="none"
                        stroke="#facc15"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${(usedPct / 100) * 138.2} 138.2`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-yellow-400">
                      {usedPct}%
                    </span>
                  </div>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full bg-yellow-400 transition-all duration-700"
                    style={{ width: `${usedPct}%` }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                  <span>{activePackage?.used_sessions ?? 0} completed</span>
                  <span>{activePackage?.remaining_sessions ?? 0} left</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => selectTab("qr")}
                  className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-4 text-sm font-bold text-black transition active:scale-[0.98]"
                >
                  <QrIcon className="h-5 w-5" />
                  Show QR
                </button>

                <Link
                  href="/client/book"
                  className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white transition active:scale-[0.98]"
                >
                  <CalendarIcon className="h-5 w-5" />
                  Book Session
                </Link>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Link
                href="/client/history"
                className="flex min-h-[104px] flex-col justify-between rounded-3xl border border-white/[0.08] bg-[#101010] p-4 transition active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                  <HistoryIcon className="h-5 w-5" />
                </div>
                <div className="mt-4 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">History</p>
                    <p className="mt-1 text-[11px] text-zinc-500">Training records</p>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 text-zinc-600" />
                </div>
              </Link>

              <Link
                href="/client/membership"
                className="flex min-h-[104px] flex-col justify-between rounded-3xl border border-white/[0.08] bg-[#101010] p-4 transition active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-400/10 text-purple-300">
                  <CardIcon className="h-5 w-5" />
                </div>
                <div className="mt-4 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">Membership</p>
                    <p className="mt-1 text-[11px] text-zinc-500">Packages & purchases</p>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 text-zinc-600" />
                </div>
              </Link>
            </section>

            <section className="rounded-[28px] border border-white/[0.08] bg-[#0d0d0d] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-yellow-400">
                    Next session
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    {nextBooking ? "You are booked" : "No session booked"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => selectTab("schedule")}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-300"
                >
                  View schedule
                </button>
              </div>

              {nextBooking ? (
                <div className="mt-4 flex items-center gap-4 rounded-3xl border border-yellow-400/15 bg-yellow-400/[0.05] p-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-yellow-400 text-black">
                    <span className="text-[10px] font-bold uppercase">
                      {new Date(nextBooking.starts_at).toLocaleString("en-CA", { month: "short" })}
                    </span>
                    <span className="text-xl font-black leading-none">
                      {new Date(nextBooking.starts_at).getDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">
                      {formatTimeOnly(nextBooking.starts_at)} - {formatTimeOnly(nextBooking.ends_at)}
                    </p>
                    <p className="mt-1 truncate text-xs text-zinc-400">
                      With {nextBooking.trainer_name}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {formatDateOnly(nextBooking.starts_at)}
                    </p>
                  </div>
                </div>
              ) : (
                <Link
                  href="/client/book"
                  className="mt-4 flex min-h-14 items-center justify-center rounded-2xl border border-dashed border-yellow-400/30 bg-yellow-400/[0.04] px-4 text-sm font-semibold text-yellow-300"
                >
                  Book your next session
                </Link>
              )}
            </section>

            <section className="flex items-start gap-3 rounded-3xl border border-yellow-400/15 bg-yellow-400/[0.05] p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-lg text-black">
                {packageCompliment.emoji}
              </div>
              <div>
                <p className="text-sm font-semibold text-yellow-300">{packageCompliment.title}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">{packageCompliment.message}</p>
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === "qr" ? (
          <div className="fade-up">
            <section className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-400">
                Trainer Scan Code
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Your QR Code</h1>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-zinc-500">
                Show this code to your PT when they record your session.
              </p>
            </section>

            <section className="mt-5 rounded-[32px] border border-yellow-400/20 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.13),_transparent_40%),#0c0c0c] p-5 shadow-2xl">
              <div className="flex items-center justify-center">
                <div className="glow-pulse rounded-[28px] border border-yellow-400/30 bg-white p-4">
                  {qrCode ? (
                    <img
                      src={qrCode}
                      alt="Client QR Code"
                      className="h-[min(72vw,320px)] w-[min(72vw,320px)] rounded-2xl object-contain"
                    />
                  ) : (
                    <div className="flex h-[min(72vw,320px)] w-[min(72vw,320px)] items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-400">
                      QR code not available
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 text-center">
                <h2 className="text-xl font-semibold text-white">{client.full_name}</h2>
                <div className="mt-2 flex justify-center">
                  <StatusPill status={client.status} />
                </div>
              </div>

              {qrCode ? (
                <button
                  type="button"
                  onClick={() => setShowQrFullscreen(true)}
                  className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-5 text-sm font-bold text-black transition active:scale-[0.98]"
                >
                  <QrIcon className="h-5 w-5" />
                  Open Full Screen
                </button>
              ) : null}
            </section>

            <div className="mt-4 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4 text-center text-xs leading-5 text-zinc-500">
              Keep your screen brightness up while your trainer scans the code.
            </div>
          </div>
        ) : null}

        {activeTab === "schedule" ? (
          <div className="fade-up">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-400">Schedule</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Upcoming Sessions</h1>
                <p className="mt-2 text-sm text-zinc-500">Your next booked training appointments.</p>
              </div>
            </div>

            <Link
              href="/client/book"
              className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-5 text-sm font-bold text-black transition active:scale-[0.98]"
            >
              <CalendarIcon className="h-5 w-5" />
              Book New Session
            </Link>

            {upcomingBookings.length === 0 ? (
              <div className="mt-5 rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
                <CalendarIcon className="mx-auto h-10 w-10 text-zinc-600" />
                <p className="mt-4 text-base font-semibold text-white">No upcoming sessions</p>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-zinc-500">
                  Book your next training slot and keep your momentum going.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {upcomingBookings.map((booking) => (
                  <article key={booking.id} className="rounded-[26px] border border-white/[0.08] bg-[#0e0e0e] p-4">
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-yellow-400 text-black">
                        <span className="text-[10px] font-bold uppercase">
                          {new Date(booking.starts_at).toLocaleString("en-CA", { month: "short" })}
                        </span>
                        <span className="text-xl font-black leading-none">{new Date(booking.starts_at).getDate()}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-white">
                              {formatTimeOnly(booking.starts_at)} - {formatTimeOnly(booking.ends_at)}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">{formatDateOnly(booking.starts_at)}</p>
                          </div>
                          <StatusPill status={booking.status} />
                        </div>

                        <p className="mt-3 text-sm text-zinc-400">
                          Trainer: <span className="text-white">{booking.trainer_name}</span>
                        </p>

                        {booking.notes ? (
                          <p className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs leading-5 text-zinc-400">
                            {booking.notes}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "account" ? (
          <div className="fade-up space-y-4">
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-400">Account</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">My Profile</h1>
            </section>

            <section className="rounded-[28px] border border-white/[0.08] bg-[#0e0e0e] p-5">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-yellow-400 bg-yellow-400 text-2xl font-black text-black shadow-[0_0_32px_rgba(250,204,21,0.12)]">
                  {profilePhotoPreview || clientPhotoUrl ? (
                    <img
                      src={profilePhotoPreview || clientPhotoUrl}
                      alt={`${client.full_name} profile preview`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials(client.full_name) || "FX"
                  )}
                </div>

                <h2 className="mt-4 max-w-full truncate text-xl font-semibold text-white">
                  {client.full_name}
                </h2>
                <div className="mt-2"><StatusPill status={client.status} /></div>

                <label className="mt-5 flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl border border-yellow-400/40 bg-yellow-400/[0.08] px-4 text-sm font-semibold text-yellow-300 transition active:scale-[0.98]">
                  {profilePhotoFile
                    ? "Choose Different Photo"
                    : clientPhotoUrl
                      ? "Change Profile Photo"
                      : "Add Profile Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) =>
                      handleProfilePhotoChange(event.target.files?.[0] || null)
                    }
                  />
                </label>

                {profilePhotoFile ? (
                  <div className="mt-3 grid w-full grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={saveProfilePhoto}
                      disabled={uploadingProfilePhoto}
                      className="min-h-12 rounded-2xl bg-yellow-400 px-3 text-sm font-bold text-black disabled:opacity-50"
                    >
                      {uploadingProfilePhoto ? "Uploading..." : "Save Photo"}
                    </button>
                    <button
                      type="button"
                      onClick={clearProfilePhotoSelection}
                      disabled={uploadingProfilePhoto}
                      className="min-h-12 rounded-2xl border border-white/10 bg-black px-3 text-sm font-semibold text-zinc-300 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : clientPhotoUrl ? (
                  <button
                    type="button"
                    onClick={removeProfilePhoto}
                    disabled={uploadingProfilePhoto}
                    className="mt-3 min-h-11 w-full rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] px-4 text-xs font-semibold text-rose-300 disabled:opacity-50"
                  >
                    {uploadingProfilePhoto ? "Removing..." : "Remove Photo"}
                  </button>
                ) : null}

                <p className="mt-3 text-[11px] leading-5 text-zinc-600">
                  Choose a clear square or portrait photo. Large photos are compressed before upload.
                </p>

                {profilePhotoMessage ? (
                  <p className="mt-3 w-full rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.06] p-3 text-left text-xs leading-5 text-yellow-200">
                    {profilePhotoMessage}
                  </p>
                ) : null}
              </div>

              <div className="mt-5 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                <div className="flex items-center justify-between gap-4 py-4">
                  <span className="text-sm text-zinc-500">Email</span>
                  <span className="truncate text-right text-sm text-white">{client.email || "Not added"}</span>
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <span className="text-sm text-zinc-500">Phone</span>
                  <span className="text-right text-sm text-white">{client.phone || "Not added"}</span>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Link href="/client/history" className="rounded-3xl border border-white/[0.08] bg-[#0e0e0e] p-4 transition active:scale-[0.98]">
                <HistoryIcon className="h-6 w-6 text-cyan-300" />
                <p className="mt-4 text-sm font-semibold text-white">Training History</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Review your completed sessions.</p>
              </Link>
              <Link href="/client/membership" className="rounded-3xl border border-white/[0.08] bg-[#0e0e0e] p-4 transition active:scale-[0.98]">
                <CardIcon className="h-6 w-6 text-purple-300" />
                <p className="mt-4 text-sm font-semibold text-white">Membership</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">View packages and purchases.</p>
              </Link>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0e0e0e]">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm((current) => !current);
                  setPasswordMessage("");
                  setPasswordMessageType("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                className="flex min-h-16 w-full items-center justify-between gap-4 p-5 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-white">Change Password</p>
                  <p className="mt-1 text-xs text-zinc-500">Update your login password.</p>
                </div>
                <ChevronRightIcon className={`h-5 w-5 text-zinc-500 transition ${showPasswordForm ? "rotate-90" : ""}`} />
              </button>

              {showPasswordForm ? (
                <form onSubmit={changePassword} className="border-t border-white/[0.08] p-5">
                  <div className="space-y-3">
                    <input
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="New password"
                      className="min-h-14 w-full rounded-2xl border border-white/10 bg-black/50 px-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
                    />
                    <input
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="Confirm new password"
                      className="min-h-14 w-full rounded-2xl border border-white/10 bg-black/50 px-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
                    />
                  </div>

                  {passwordMessage ? (
                    <p
                      className={`mt-4 rounded-2xl border p-4 text-sm ${
                        passwordMessageType === "success"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : "border-rose-400/30 bg-rose-400/10 text-rose-300"
                      }`}
                    >
                      {passwordMessage}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="mt-4 min-h-14 w-full rounded-2xl bg-yellow-400 px-5 text-sm font-bold text-black disabled:opacity-60"
                  >
                    {savingPassword ? "Updating..." : "Update Password"}
                  </button>
                </form>
              ) : null}
            </section>

            <button
              type="button"
              onClick={handleLogout}
              className="min-h-14 w-full rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] px-5 text-sm font-semibold text-rose-300 transition active:scale-[0.98]"
            >
              Log Out
            </button>
          </div>
        ) : null}
      </div>

      <nav className="fxa-bottom-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-black/95 backdrop-blur-xl">
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-1 px-2 pt-2">
          <button
            type="button"
            onClick={() => selectTab("home")}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition ${
              activeTab === "home" ? "bg-yellow-400/[0.10] text-yellow-400" : "text-zinc-500"
            }`}
          >
            <HomeIcon className="h-6 w-6" />
            Home
          </button>

          <button
            type="button"
            onClick={() => selectTab("qr")}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition ${
              activeTab === "qr" ? "bg-yellow-400/[0.10] text-yellow-400" : "text-zinc-500"
            }`}
          >
            <QrIcon className="h-6 w-6" />
            QR
          </button>

          <button
            type="button"
            onClick={() => selectTab("schedule")}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition ${
              activeTab === "schedule" ? "bg-yellow-400/[0.10] text-yellow-400" : "text-zinc-500"
            }`}
          >
            <CalendarIcon className="h-6 w-6" />
            Schedule
          </button>

          <button
            type="button"
            onClick={() => selectTab("account")}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition ${
              activeTab === "account" ? "bg-yellow-400/[0.10] text-yellow-400" : "text-zinc-500"
            }`}
          >
            <UserIcon className="h-6 w-6" />
            Account
          </button>
        </div>
      </nav>

      {showQrFullscreen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="fxa-safe-top relative flex h-full w-full max-w-sm flex-col items-center justify-center">
            <button
              type="button"
              onClick={() => setShowQrFullscreen(false)}
              className="absolute right-0 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xl text-white"
              aria-label="Close full screen QR code"
            >
              ×
            </button>

            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-yellow-400">FXA FITNESS</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Scan this code</h2>
            <p className="mt-2 text-center text-sm text-zinc-500">Show your trainer to record your session.</p>

            <div className="glow-pulse mt-7 rounded-[30px] bg-white p-4">
              {qrCode ? (
                <img
                  src={qrCode}
                  alt="QR Code"
                  className="h-[min(78vw,340px)] w-[min(78vw,340px)] rounded-2xl object-contain"
                />
              ) : null}
            </div>

            <p className="mt-5 text-center text-sm font-medium text-white">{client.full_name}</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
