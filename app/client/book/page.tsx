"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type Trainer = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_primary: boolean;
};

type Slot = {
  id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  service_code: string | null;
  status: string;
};

type Package = {
  id: string;
  package_name: string | null;
  remaining_sessions: number | null;
  expires_at: string | null;
};

type UpcomingBooking = {
  id: string;
  trainer_id: string | null;
  trainer_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  can_cancel: boolean;
  hours_until: number;
};

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayShort(value: string) {
  return new Date(value).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function dayLong(value: string) {
  return new Date(value).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ClientBookPage() {
  const router = useRouter();
  const [checkingRole, setCheckingRole] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activePackage, setActivePackage] = useState<Package | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function protect() {
      const { user, role } = await getCurrentUserRole();
      if (!user) {
        router.push("/client/login");
        return;
      }
      if (role !== "client") {
        if (role === "admin" || role === "manager") router.push("/admin");
        else router.push("/trainer/scan");
        return;
      }
      setCheckingRole(false);
    }
    void protect();
  }, [router]);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function loadDashboard() {
    const token = await getToken();
    if (!token) return;

    setLoadingDashboard(true);
    const response = await fetch("/api/bookings/client-dashboard", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    setLoadingDashboard(false);

    if (!response.ok) {
      setMessage(result?.error || "Could not load booking information.");
      return;
    }

    const trainerList = (result?.trainers || []) as Trainer[];
    setTrainers(trainerList);
    setUpcomingBookings((result?.upcoming_bookings || []) as UpcomingBooking[]);

    setSelectedTrainerId((current) => {
      if (current && trainerList.some((trainer) => trainer.id === current)) return current;
      return trainerList[0]?.id || "";
    });
  }

  async function loadAvailability(trainerId: string) {
    if (!trainerId) {
      setSlots([]);
      setActivePackage(null);
      return;
    }

    const token = await getToken();
    if (!token) return;

    setLoadingSlots(true);
    setMessage("");
    setSelectedSlot(null);

    const response = await fetch(
      `/api/bookings/client-availability?trainerId=${encodeURIComponent(trainerId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const result = await response.json().catch(() => null);
    setLoadingSlots(false);

    if (!response.ok) {
      setSlots([]);
      setActivePackage(null);
      setMessage(result?.error || "Could not load available sessions.");
      return;
    }

    const nextSlots = (result?.slots || []) as Slot[];
    setSlots(nextSlots);
    setActivePackage(result?.package || null);
    setMessage(result?.message || "");
    setSelectedDay(nextSlots[0] ? dayKey(nextSlots[0].starts_at) : "");
  }

  useEffect(() => {
    if (!checkingRole) void loadDashboard();
  }, [checkingRole]);

  useEffect(() => {
    if (selectedTrainerId) void loadAvailability(selectedTrainerId);
  }, [selectedTrainerId]);

  const selectedTrainer = trainers.find((trainer) => trainer.id === selectedTrainerId) || null;

  const days = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of slots) {
      const key = dayKey(slot.starts_at);
      if (!map.has(key)) map.set(key, slot.starts_at);
    }
    return Array.from(map.entries());
  }, [slots]);

  const daySlots = slots.filter((slot) => dayKey(slot.starts_at) === selectedDay);

  async function confirmBooking() {
    if (!selectedSlot || !selectedTrainerId) return;
    const token = await getToken();
    if (!token) return;

    setBooking(true);
    setMessage("");
    setSuccessMessage("");

    const response = await fetch("/api/bookings/client-create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slotId: selectedSlot.id,
        trainerId: selectedTrainerId,
        notes: notes.trim() || null,
      }),
    });

    const result = await response.json().catch(() => null);
    setBooking(false);

    if (!response.ok) {
      setMessage(result?.error || "Could not book this session.");
      setSelectedSlot(null);
      await loadAvailability(selectedTrainerId);
      await loadDashboard();
      return;
    }

    setSuccessMessage(
      `Booked with ${result?.trainerName || selectedTrainer?.full_name || "trainer"} on ${dayLong(result.startsAt)} at ${timeLabel(result.startsAt)}.`,
    );
    setNotes("");
    setSelectedSlot(null);
    await loadAvailability(selectedTrainerId);
    await loadDashboard();
  }

  async function cancelBooking(bookingRow: UpcomingBooking) {
    if (!bookingRow.can_cancel) return;
    if (!window.confirm(`Cancel your session with ${bookingRow.trainer_name}?`)) return;

    const token = await getToken();
    if (!token) return;

    setCancellingId(bookingRow.id);
    setMessage("");
    setSuccessMessage("");

    const response = await fetch("/api/bookings/cancel", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bookingId: bookingRow.id }),
    });

    const result = await response.json().catch(() => null);
    setCancellingId(null);

    if (!response.ok) {
      setMessage(result?.error || "Could not cancel this session.");
      await loadDashboard();
      return;
    }

    setSuccessMessage(result?.warning || "Session cancelled successfully.");
    await loadDashboard();
    if (selectedTrainerId) await loadAvailability(selectedTrainerId);
  }

  if (checkingRole) {
    return <main className="min-h-screen bg-black p-6 text-yellow-400">Checking access...</main>;
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Book Session</h1>
            <p className="mt-2 text-sm text-zinc-500">Choose your trainer, then select one of their published available times.</p>
          </div>
          <Link href="/client" className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-zinc-300">Back</Link>
        </header>

        {successMessage ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        {message ? (
          <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">
            {message}
          </div>
        ) : null}

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">1. Choose trainer</p>
              <select
                value={selectedTrainerId}
                onChange={(event) => setSelectedTrainerId(event.target.value)}
                disabled={loadingDashboard}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-base text-white outline-none focus:border-yellow-400"
              >
                {trainers.length === 0 ? <option value="">No trainer available</option> : null}
                {trainers.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>
                    {trainer.full_name || trainer.email || "Trainer"}{trainer.is_primary ? " — Main Trainer" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-zinc-500">Your main trainer is always listed first.</p>
            </div>

            {activePackage ? (
              <div className="shrink-0 rounded-2xl bg-yellow-400 px-4 py-3 text-right text-black">
                <p className="text-[10px] uppercase tracking-wider">Sessions left</p>
                <p className="text-2xl font-semibold">{activePackage.remaining_sessions ?? 0}</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Your booked sessions</p>
              <h2 className="mt-1 text-xl font-semibold">Upcoming schedule</h2>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">{upcomingBookings.length}</span>
          </div>

          {loadingDashboard ? (
            <p className="mt-4 text-sm text-yellow-400">Loading bookings...</p>
          ) : upcomingBookings.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">No upcoming sessions booked.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {upcomingBookings.map((row) => (
                <div key={row.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{row.trainer_name}</p>
                      <p className="mt-1 text-sm text-zinc-400">{dayLong(row.starts_at)}</p>
                      <p className="mt-1 text-lg font-semibold text-yellow-300">{timeLabel(row.starts_at)} – {timeLabel(row.ends_at)}</p>
                    </div>
                    {row.can_cancel ? (
                      <button
                        type="button"
                        onClick={() => void cancelBooking(row)}
                        disabled={cancellingId === row.id}
                        className="rounded-xl border border-rose-400/30 px-4 py-2 text-sm text-rose-300 disabled:opacity-50"
                      >
                        {cancellingId === row.id ? "Cancelling..." : "Cancel session"}
                      </button>
                    ) : (
                      <div className="max-w-[220px] rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs leading-5 text-zinc-500">
                        Cancellation locked within 8 hours of the session.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs leading-5 text-zinc-500">Cancellation policy: clients can cancel until 8 hours before the session start time. Inside the 8-hour window, the booking remains locked.</p>
        </section>

        <section className="mt-5">
          <p className="mb-3 text-sm font-semibold text-zinc-300">2. Choose a day</p>
          {loadingSlots ? (
            <div className="rounded-3xl border border-white/10 p-8 text-center text-yellow-400">Loading {selectedTrainer?.full_name || "trainer"}&apos;s available times...</div>
          ) : days.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-6 text-center text-zinc-500">No published availability for this trainer right now.</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {days.map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedDay(key);
                    setSelectedSlot(null);
                  }}
                  className={`min-w-[116px] rounded-2xl border px-4 py-4 text-left ${selectedDay === key ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-white/[0.04] text-white"}`}
                >
                  <span className="block text-sm font-semibold">{dayShort(value)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {!loadingSlots && daySlots.length > 0 ? (
          <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-semibold text-zinc-300">3. Choose a time</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {daySlots.map((slot) => {
                const selected = selectedSlot?.id === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-2xl border px-4 py-4 text-center ${selected ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-black/30 text-white"}`}
                  >
                    <span className="text-lg font-semibold">{timeLabel(slot.starts_at)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {selectedSlot ? (
          <section className="mt-5 rounded-3xl border border-yellow-400/25 bg-yellow-400/[0.06] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-yellow-400">Confirm booking</p>
            <h2 className="mt-2 text-2xl font-semibold">{selectedTrainer?.full_name || "Trainer"}</h2>
            <p className="mt-2 text-zinc-300">{dayLong(selectedSlot.starts_at)}</p>
            <p className="mt-1 text-xl text-yellow-300">{timeLabel(selectedSlot.starts_at)} – {timeLabel(selectedSlot.ends_at)}</p>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Note for your trainer (optional)"
              className="mt-4 min-h-24 w-full rounded-2xl border border-white/10 bg-black/40 p-4 text-base text-white outline-none focus:border-yellow-400"
            />
            <button
              type="button"
              onClick={() => void confirmBooking()}
              disabled={booking}
              className="mt-4 w-full rounded-2xl bg-yellow-400 px-5 py-4 text-base font-semibold text-black disabled:opacity-50"
            >
              {booking ? "Booking..." : "Confirm Session"}
            </button>
            <p className="mt-3 text-center text-xs text-zinc-500">Your booking will also be added to the selected trainer&apos;s Google Calendar. Booking itself does not deduct a session.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
