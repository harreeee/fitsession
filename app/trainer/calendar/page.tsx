"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type Rule = {
  id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
};

type CalendarConnection = {
  google_email: string | null;
  calendar_id: string;
  updated_at: string | null;
};

type ScheduleSlot = {
  starts_at: string;
  ends_at: string;
  state: "available" | "google_busy" | "booked";
  booking?: {
    id: string;
    client_name: string | null;
    starts_at: string;
    ends_at: string;
    sync_status: string | null;
  } | null;
};

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

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
  return <main className="min-h-screen bg-black p-6 text-yellow-400">Loading calendar...</main>;
}

function TrainerCalendarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkingRole, setCheckingRole] = useState(true);
  const [role, setRole] = useState("");
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const connected = searchParams.get("connected");
  const oauthError = searchParams.get("error");

  useEffect(() => {
    async function protect() {
      const { user, role: currentRole } = await getCurrentUserRole();
      if (!user) {
        router.push("/login");
        return;
      }
      if (!["trainer", "nutrition_coach", "admin"].includes(currentRole || "")) {
        router.push("/login");
        return;
      }
      setRole(currentRole || "");
      setCheckingRole(false);
    }
    void protect();
  }, [router]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function loadData() {
    const authToken = await token();
    if (!authToken) return;

    setLoading(true);
    setMessage("");

    const response = await fetch("/api/bookings/trainer-availability", {
      headers: { Authorization: `Bearer ${authToken}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setMessage(result?.error || "Could not load booking availability.");
      return;
    }

    setConnection(result?.connection || null);
    setRules((result?.rules || []) as Rule[]);
    setSlots((result?.slots || []) as ScheduleSlot[]);
    if (result?.google_error) setMessage(result.google_error);

    const firstSlot = result?.slots?.[0]?.starts_at;
    if (firstSlot) setSelectedDay((current) => current || dayKey(firstSlot));
  }

  useEffect(() => {
    if (!checkingRole) void loadData();
  }, [checkingRole, connected]);

  function addWindow(weekday: number) {
    setRules((current) => [
      ...current,
      { weekday, start_time: "09:00", end_time: "17:00", is_active: true },
    ]);
  }

  function updateWindow(index: number, field: "start_time" | "end_time", value: string) {
    setRules((current) => current.map((rule, currentIndex) => currentIndex === index ? { ...rule, [field]: value } : rule));
  }

  function removeWindow(index: number) {
    setRules((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function copyMondayToWeekdays() {
    const monday = rules.filter((rule) => rule.weekday === 1);
    if (monday.length === 0) {
      setMessage("Add Monday availability first.");
      return;
    }

    setRules((current) => [
      ...current.filter((rule) => ![2, 3, 4, 5].includes(rule.weekday)),
      ...[2, 3, 4, 5].flatMap((weekday) => monday.map((rule) => ({
        weekday,
        start_time: rule.start_time.slice(0, 5),
        end_time: rule.end_time.slice(0, 5),
        is_active: true,
      }))),
    ]);
    setSuccess("Monday copied to Tuesday–Friday. Save changes to apply.");
  }

  async function saveAvailability() {
    const authToken = await token();
    if (!authToken) return;

    setSaving(true);
    setMessage("");
    setSuccess("");

    const response = await fetch("/api/bookings/trainer-weekly-availability", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rules: rules.map((rule) => ({
          weekday: rule.weekday,
          start_time: rule.start_time.slice(0, 5),
          end_time: rule.end_time.slice(0, 5),
        })),
      }),
    });

    const result = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok) {
      setMessage(result?.error || "Could not save weekly availability.");
      return;
    }

    setSuccess("Weekly availability saved. Google busy time will be blocked automatically.");
    await loadData();
  }

  async function connectGoogleCalendar() {
    const authToken = await token();
    if (!authToken) return;

    setConnecting(true);
    setMessage("");
    const response = await fetch("/api/google-calendar/connect", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await response.json().catch(() => null);
    setConnecting(false);

    if (!response.ok || !result?.url) {
      setMessage(result?.error || "Could not start Google Calendar connection.");
      return;
    }

    window.location.href = result.url;
  }

  const scheduleDays = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of slots) {
      const key = dayKey(slot.starts_at);
      if (!map.has(key)) map.set(key, slot.starts_at);
    }
    return Array.from(map.entries());
  }, [slots]);

  const selectedSlots = slots.filter((slot) => dayKey(slot.starts_at) === selectedDay);

  if (checkingRole) {
    return <main className="min-h-screen bg-black p-6 text-yellow-400">Checking access...</main>;
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">My Availability</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-500">Set your normal working hours once. FXA automatically removes Google Calendar busy time and existing FXA bookings.</p>
          </div>
          <Link href={role === "admin" ? "/admin" : "/trainer/scan"} className="rounded-2xl border border-white/10 px-4 py-3 text-center text-sm text-zinc-300">Back</Link>
        </header>

        {connected ? <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-200">Google Calendar connected successfully.</div> : null}
        {oauthError ? <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">{oauthError}</div> : null}
        {success ? <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-200">{success}</div> : null}
        {message ? <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">{message}</div> : null}

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.045] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Google Calendar</p>
              <p className="mt-1 text-xl font-semibold">{connection?.google_email || "Not connected"}</p>
              <p className="mt-1 text-xs text-zinc-500">FXA only needs busy/free access plus permission to add FXA sessions.</p>
            </div>
            <button type="button" onClick={() => void connectGoogleCalendar()} disabled={connecting} className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-50">
              {connecting ? "Connecting..." : connection ? "Reconnect Google" : "Connect Google Calendar"}
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Weekly schedule</p>
              <h2 className="mt-1 text-2xl font-semibold">Regular working hours</h2>
            </div>
            <button type="button" onClick={copyMondayToWeekdays} className="rounded-xl border border-yellow-400/30 px-4 py-2 text-sm text-yellow-300">Copy Monday to weekdays</button>
          </div>

          <div className="mt-5 space-y-4">
            {DAYS.map((day) => {
              const indexed = rules.map((rule, index) => ({ rule, index })).filter((item) => item.rule.weekday === day.value);
              return (
                <div key={day.value} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{day.label}</p>
                    <button type="button" onClick={() => addWindow(day.value)} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-yellow-300">+ Add time</button>
                  </div>
                  {indexed.length === 0 ? (
                    <p className="mt-3 text-sm text-zinc-600">Off</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {indexed.map(({ rule, index }) => (
                        <div key={`${day.value}-${index}`} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                          <input type="time" value={rule.start_time.slice(0, 5)} onChange={(event) => updateWindow(index, "start_time", event.target.value)} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-white" />
                          <span className="text-zinc-600">to</span>
                          <input type="time" value={rule.end_time.slice(0, 5)} onChange={(event) => updateWindow(index, "end_time", event.target.value)} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-white" />
                          <button type="button" onClick={() => removeWindow(index)} className="rounded-xl border border-rose-400/20 px-3 py-2 text-xs text-rose-300">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" onClick={() => void saveAvailability()} disabled={saving} className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-4 text-base font-semibold text-black disabled:opacity-50">
            {saving ? "Saving..." : "Save Weekly Availability"}
          </button>
          <p className="mt-3 text-center text-xs text-zinc-500">Clients must book at least 2 hours ahead. Sessions are 60 minutes.</p>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">My schedule</p>
              <h2 className="mt-1 text-2xl font-semibold">Next 14 days</h2>
            </div>
            <button type="button" onClick={() => void loadData()} disabled={loading} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300">Refresh</button>
          </div>

          {loading ? <p className="mt-5 text-sm text-yellow-400">Loading schedule...</p> : null}

          {!loading && scheduleDays.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">Set your weekly availability to preview your schedule.</p>
          ) : null}

          {scheduleDays.length > 0 ? (
            <>
              <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
                {scheduleDays.map(([key, value]) => (
                  <button key={key} type="button" onClick={() => setSelectedDay(key)} className={`min-w-[112px] rounded-2xl border px-4 py-3 text-left ${selectedDay === key ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-black/30 text-white"}`}>
                    <span className="text-sm font-semibold">{dayLabel(value)}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {selectedSlots.map((slot) => (
                  <div key={`${slot.starts_at}-${slot.ends_at}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div>
                      <p className="font-semibold">{timeLabel(slot.starts_at)} – {timeLabel(slot.ends_at)}</p>
                      <p className="mt-1 text-xs text-zinc-500">{slot.booking?.client_name || (slot.state === "google_busy" ? "Google Calendar busy" : "Available for client booking")}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${slot.state === "booked" ? "bg-yellow-400/15 text-yellow-300" : slot.state === "google_busy" ? "bg-rose-400/10 text-rose-300" : "bg-emerald-400/10 text-emerald-300"}`}>
                      {slot.state === "booked" ? "Booked" : slot.state === "google_busy" ? "Busy" : "Available"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>
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
