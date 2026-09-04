"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type CalendarConnection = {
  google_email: string | null;
  calendar_id: string;
  updated_at: string | null;
};

type Slot = {
  id?: string;
  starts_at: string;
  ends_at: string;
  status?: string;
  service_code?: string;
};

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(value: string) {
  return new Date(value).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function CalendarLoadingFallback() {
  return (
    <main className="min-h-screen bg-black p-6 text-yellow-400">
      Loading calendar...
    </main>
  );
}

function TrainerCalendarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkingRole, setCheckingRole] = useState(true);
  const [role, setRole] = useState("");
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [candidateSlots, setCandidateSlots] = useState<Slot[]>([]);
  const [publishedSlots, setPublishedSlots] = useState<Slot[]>([]);
  const [message, setMessage] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [busySlot, setBusySlot] = useState("");

  const connected = searchParams.get("connected");
  const oauthError = searchParams.get("error");

  useEffect(() => {
    async function protectPage() {
      const { user, role: currentRole } = await getCurrentUserRole();
      if (!user) {
        router.push("/login");
        return;
      }
      if (!["admin", "trainer", "nutrition_coach"].includes(currentRole || "")) {
        router.push("/login");
        return;
      }
      setRole(currentRole || "");
      setCheckingRole(false);
    }
    void protectPage();
  }, [router]);

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function loadConnection() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setLoadingConnection(false);
      return;
    }

    const { data } = await supabase
      .from("trainer_google_calendar_connections")
      .select("google_email, calendar_id, updated_at")
      .eq("trainer_id", user.id)
      .maybeSingle();

    setConnection((data || null) as CalendarConnection | null);
    setLoadingConnection(false);
  }

  async function loadAvailability() {
    const token = await authToken();
    if (!token) return;

    setLoadingSlots(true);
    setMessage("");

    const response = await fetch("/api/bookings/trainer-availability", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setCandidateSlots([]);
      setPublishedSlots([]);
      setMessage(result?.error || "Could not load Google Calendar availability.");
      setLoadingSlots(false);
      return;
    }

    setCandidateSlots(result?.candidates || []);
    setPublishedSlots(result?.published || []);
    const firstDay = result?.candidates?.[0]?.starts_at || result?.published?.[0]?.starts_at;
    if (firstDay) setSelectedDay((current) => current || dayKey(firstDay));
    setLoadingSlots(false);
  }

  useEffect(() => {
    if (!checkingRole) {
      void loadConnection();
    }
  }, [checkingRole, connected]);

  useEffect(() => {
    if (!checkingRole && connection) {
      void loadAvailability();
    }
  }, [checkingRole, connection]);

  async function connectGoogleCalendar() {
    const token = await authToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setConnecting(true);
    setMessage("");
    const response = await fetch("/api/google-calendar/connect", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => null);
    setConnecting(false);

    if (!response.ok || !result?.url) {
      setMessage(result?.error || "Could not start Google Calendar connection.");
      return;
    }

    window.location.href = result.url;
  }

  async function publishSlot(slot: Slot) {
    const token = await authToken();
    if (!token) return;
    setBusySlot(slot.starts_at);
    setMessage("");

    const response = await fetch("/api/bookings/publish-slot", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
        serviceCode: "pt_1on1",
      }),
    });
    const result = await response.json().catch(() => null);
    setBusySlot("");

    if (!response.ok) {
      setMessage(result?.error || "Could not publish this time.");
      return;
    }

    setMessage("Time published. Clients can now see it.");
    await loadAvailability();
  }

  async function closeSlot(slot: Slot) {
    if (!slot.id) return;
    const token = await authToken();
    if (!token) return;
    setBusySlot(slot.id);

    const response = await fetch(
      `/api/bookings/publish-slot?slotId=${encodeURIComponent(slot.id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const result = await response.json().catch(() => null);
    setBusySlot("");

    if (!response.ok) {
      setMessage(result?.error || "Could not close this time.");
      return;
    }

    setMessage("Time removed from client booking view.");
    await loadAvailability();
  }

  const publishedOpenKeys = useMemo(
    () =>
      new Set(
        publishedSlots
          .filter((slot) => slot.status === "open")
          .map((slot) => `${slot.starts_at}|${slot.ends_at}`),
      ),
    [publishedSlots],
  );

  const availableForPublishing = candidateSlots.filter(
    (slot) => !publishedOpenKeys.has(`${slot.starts_at}|${slot.ends_at}`),
  );

  const days = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of [...availableForPublishing, ...publishedSlots]) {
      if (!map.has(dayKey(slot.starts_at))) map.set(dayKey(slot.starts_at), slot.starts_at);
    }
    return Array.from(map.entries());
  }, [availableForPublishing, publishedSlots]);

  const dayCandidates = availableForPublishing.filter(
    (slot) => dayKey(slot.starts_at) === selectedDay,
  );
  const dayPublished = publishedSlots.filter(
    (slot) => dayKey(slot.starts_at) === selectedDay && slot.status !== "closed",
  );

  if (checkingRole) {
    return <main className="min-h-screen bg-black p-6 text-yellow-400">Checking access...</main>;
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="mx-auto max-w-5xl rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">Booking Availability</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Google Calendar blocks your busy time. You choose which free hours are visible to clients.
            </p>
          </div>
          <Link
            href={role === "admin" ? "/admin" : "/trainer/scan"}
            className="rounded-2xl border border-white/15 px-4 py-3 text-center text-sm text-zinc-300"
          >
            Back
          </Link>
        </header>

        {connected ? <div className="mb-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-300">Google Calendar connected successfully.</div> : null}
        {oauthError ? <div className="mb-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-300">{oauthError}</div> : null}
        {message ? <div className="mb-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">{message}</div> : null}

        <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Google Calendar</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {loadingConnection ? "Checking connection..." : connection?.google_email || "Not connected"}
              </p>
              {connection ? <p className="mt-1 text-xs text-zinc-500">Busy events stay private. FXA only checks whether the time is free.</p> : null}
            </div>
            <button
              type="button"
              onClick={connectGoogleCalendar}
              disabled={connecting}
              className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              {connecting ? "Connecting..." : connection ? "Reconnect Google" : "Connect Google Calendar"}
            </button>
          </div>
        </section>

        {connection ? (
          <>
            <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Choose a day</h2>
                  <p className="mt-1 text-sm text-zinc-500">Next 14 days · Sunday excluded</p>
                </div>
                <button type="button" onClick={() => void loadAvailability()} disabled={loadingSlots} className="rounded-xl border border-yellow-400/30 px-3 py-2 text-xs text-yellow-300 disabled:opacity-50">Refresh</button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2">
                {days.map(([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    className={`min-w-[112px] rounded-2xl border px-4 py-3 text-left ${selectedDay === key ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-black/30 text-zinc-300"}`}
                  >
                    <span className="block text-sm font-semibold">{dayLabel(value)}</span>
                  </button>
                ))}
                {!loadingSlots && days.length === 0 ? <p className="py-3 text-sm text-zinc-500">No free times found.</p> : null}
              </div>
            </section>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section className="rounded-3xl border border-yellow-400/20 bg-yellow-400/[0.05] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-yellow-400">Google free time</p>
                <h2 className="mt-1 text-2xl font-semibold">Available to publish</h2>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {dayCandidates.map((slot) => (
                    <button
                      key={slot.starts_at}
                      type="button"
                      onClick={() => void publishSlot(slot)}
                      disabled={busySlot === slot.starts_at}
                      className="rounded-2xl border border-white/10 bg-black/35 px-3 py-4 text-center transition hover:border-yellow-400/50 disabled:opacity-50"
                    >
                      <span className="block text-base font-semibold text-white">{timeLabel(slot.starts_at)}</span>
                      <span className="mt-1 block text-[11px] uppercase tracking-wide text-zinc-500">Open for clients</span>
                    </button>
                  ))}
                  {!loadingSlots && dayCandidates.length === 0 ? <p className="col-span-full py-5 text-sm text-zinc-500">No additional Google-free times for this day.</p> : null}
                </div>
              </section>

              <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-400">Client booking view</p>
                <h2 className="mt-1 text-2xl font-semibold">Published times</h2>
                <div className="mt-4 space-y-2">
                  {dayPublished.map((slot) => (
                    <div key={slot.id || slot.starts_at} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div>
                        <p className="font-semibold text-white">{timeLabel(slot.starts_at)} – {timeLabel(slot.ends_at)}</p>
                        <p className={`mt-1 text-xs ${slot.status === "booked" ? "text-yellow-300" : "text-emerald-300"}`}>{slot.status === "booked" ? "Booked" : "Visible to clients"}</p>
                      </div>
                      {slot.status === "open" ? (
                        <button type="button" onClick={() => void closeSlot(slot)} disabled={busySlot === slot.id} className="rounded-xl border border-rose-400/25 px-3 py-2 text-xs text-rose-300 disabled:opacity-50">Close</button>
                      ) : null}
                    </div>
                  ))}
                  {!loadingSlots && dayPublished.length === 0 ? <p className="py-5 text-sm text-zinc-500">You have not published any times for this day.</p> : null}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

export default function TrainerCalendarPage() {
  return (
    <Suspense fallback={<CalendarLoadingFallback />}>
      <TrainerCalendarContent />
    </Suspense>
  );
}
