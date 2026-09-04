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
  is_primary: boolean;
};

type Slot = {
  id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
};

type ActivePackage = {
  id: string;
  package_name: string | null;
  remaining_sessions: number | null;
  expires_at: string | null;
};

type UpcomingBooking = {
  id: string;
  trainer_name: string;
  starts_at: string;
  ends_at: string;
  can_cancel: boolean;
};

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayCard(value: string) {
  const date = new Date(value);
  return {
    weekday: date.toLocaleDateString("en-CA", { weekday: "short" }),
    day: date.toLocaleDateString("en-CA", { day: "numeric" }),
    month: date.toLocaleDateString("en-CA", { month: "short" }),
  };
}

function longDate(value: string) {
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
  const [cancellingId, setCancellingId] = useState("");

  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [trainerId, setTrainerId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [activePackage, setActivePackage] = useState<ActivePackage | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingBooking[]>([]);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function protect() {
      const { user, role } = await getCurrentUserRole();
      if (!user) {
        router.push("/client/login");
        return;
      }
      if (role !== "client") {
        router.push(role === "admin" || role === "manager" ? "/admin" : "/trainer/scan");
        return;
      }
      setCheckingRole(false);
    }
    void protect();
  }, [router]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function loadDashboard() {
    const authToken = await token();
    if (!authToken) return;

    setLoadingDashboard(true);
    const response = await fetch("/api/bookings/client-dashboard", {
      headers: { Authorization: `Bearer ${authToken}` },
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
    setUpcoming((result?.upcoming_bookings || []) as UpcomingBooking[]);
    setTrainerId((current) => current || trainerList[0]?.id || "");
  }

  async function loadAvailability(selectedTrainerId: string) {
    if (!selectedTrainerId) return;
    const authToken = await token();
    if (!authToken) return;

    setLoadingSlots(true);
    setMessage("");
    setSelectedSlot(null);

    const response = await fetch(
      `/api/bookings/client-availability?trainerId=${encodeURIComponent(selectedTrainerId)}`,
      { headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store" },
    );
    const result = await response.json().catch(() => null);
    setLoadingSlots(false);

    if (!response.ok) {
      setSlots([]);
      setActivePackage(null);
      setMessage(result?.error || "Could not load available times.");
      return;
    }

    const nextSlots = (result?.slots || []) as Slot[];
    setSlots(nextSlots);
    setActivePackage(result?.package || null);
    setMessage(result?.message || "");
    setSelectedDay(nextSlots[0]?.starts_at ? dayKey(nextSlots[0].starts_at) : "");
  }

  useEffect(() => {
    if (!checkingRole) void loadDashboard();
  }, [checkingRole]);

  useEffect(() => {
    if (trainerId) void loadAvailability(trainerId);
  }, [trainerId]);

  const selectedTrainer = trainers.find((trainer) => trainer.id === trainerId) || null;

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
    if (!selectedSlot || !trainerId) return;
    const authToken = await token();
    if (!authToken) return;

    setBooking(true);
    setMessage("");
    setSuccess("");

    const response = await fetch("/api/bookings/client-create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slotId: selectedSlot.id,
        trainerId,
      }),
    });
    const result = await response.json().catch(() => null);
    setBooking(false);

    if (!response.ok) {
      setMessage(result?.error || "Could not book this session.");
      await loadAvailability(trainerId);
      await loadDashboard();
      return;
    }

    setSuccess(
      result?.warning ||
        `Session booked with ${result?.trainerName || selectedTrainer?.full_name || "trainer"}.`,
    );
    setSelectedSlot(null);
    await loadDashboard();
    await loadAvailability(trainerId);
  }

  async function cancelBooking(row: UpcomingBooking) {
    if (!row.can_cancel || !window.confirm(`Cancel your session with ${row.trainer_name}?`)) return;
    const authToken = await token();
    if (!authToken) return;

    setCancellingId(row.id);
    setMessage("");
    setSuccess("");

    const response = await fetch("/api/bookings/cancel", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bookingId: row.id }),
    });
    const result = await response.json().catch(() => null);
    setCancellingId("");

    if (!response.ok) {
      setMessage(result?.error || "Could not cancel this session.");
      return;
    }

    setSuccess(result?.warning || "Session cancelled.");
    await loadDashboard();
    if (trainerId) await loadAvailability(trainerId);
  }

  if (checkingRole) {
    return <main className="min-h-screen bg-black p-6 text-yellow-400">Checking access...</main>;
  }

  return (
    <main className="min-h-screen bg-black px-4 py-5 text-white">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Book Session</h1>
            <p className="mt-2 text-sm text-zinc-500">Choose a trainer, then pick an available time.</p>
          </div>
          <Link href="/client" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Back</Link>
        </header>

        {success ? <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-200">{success}</div> : null}
        {message ? <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">{message}</div> : null}

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Upcoming</p>
              <h2 className="mt-1 text-xl font-semibold">Your sessions</h2>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">{upcoming.length}</span>
          </div>

          {loadingDashboard ? <p className="mt-4 text-sm text-yellow-400">Loading...</p> : null}
          {!loadingDashboard && upcoming.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No upcoming sessions.</p> : null}

          <div className="mt-4 space-y-3">
            {upcoming.map((row) => (
              <div key={row.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">{row.trainer_name}</p>
                    <p className="mt-1 text-sm text-zinc-400">{longDate(row.starts_at)}</p>
                    <p className="mt-1 text-lg font-semibold text-yellow-300">{timeLabel(row.starts_at)} – {timeLabel(row.ends_at)}</p>
                  </div>
                  {row.can_cancel ? (
                    <button type="button" onClick={() => void cancelBooking(row)} disabled={cancellingId === row.id} className="rounded-xl border border-rose-400/30 px-3 py-2 text-xs font-semibold text-rose-300 disabled:opacity-50">
                      {cancellingId === row.id ? "Cancelling..." : "Cancel"}
                    </button>
                  ) : (
                    <span className="max-w-[110px] text-right text-[11px] leading-4 text-zinc-600">Locked within 8 hours</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">1. Trainer</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {trainers.map((trainer) => {
              const selected = trainer.id === trainerId;
              return (
                <button key={trainer.id} type="button" onClick={() => setTrainerId(trainer.id)} className={`min-w-[150px] rounded-2xl border p-4 text-left ${selected ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-black/30 text-white"}`}>
                  <p className="font-semibold">{trainer.full_name || trainer.email || "Trainer"}</p>
                  <p className={`mt-1 text-[11px] ${selected ? "text-black/60" : "text-zinc-500"}`}>{trainer.is_primary ? "★ Main Trainer" : "Trainer"}</p>
                </button>
              );
            })}
          </div>

          {activePackage ? (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-yellow-400/15 bg-yellow-400/[0.05] p-3 text-sm">
              <span className="text-zinc-400">Sessions remaining</span>
              <span className="font-semibold text-yellow-300">{activePackage.remaining_sessions ?? 0}</span>
            </div>
          ) : null}
        </section>

        <section className="mt-5">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">2. Date</p>
          {loadingSlots ? <div className="mt-3 rounded-2xl border border-white/10 p-6 text-center text-sm text-yellow-400">Loading available times...</div> : null}
          {!loadingSlots && days.length === 0 ? <div className="mt-3 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">No availability right now.</div> : null}

          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {days.map(([key, value]) => {
              const card = dayCard(value);
              const selected = selectedDay === key;
              return (
                <button key={key} type="button" onClick={() => { setSelectedDay(key); setSelectedSlot(null); }} className={`min-w-[82px] rounded-2xl border px-3 py-3 text-center ${selected ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-white/[0.04] text-white"}`}>
                  <span className="block text-xs font-medium">{card.weekday}</span>
                  <span className="mt-1 block text-2xl font-semibold">{card.day}</span>
                  <span className="block text-[10px] uppercase">{card.month}</span>
                </button>
              );
            })}
          </div>
        </section>

        {daySlots.length > 0 ? (
          <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">3. Time</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {daySlots.map((slot) => {
                const selected = selectedSlot?.id === slot.id;
                return (
                  <button key={slot.id} type="button" onClick={() => setSelectedSlot(slot)} className={`rounded-2xl border px-4 py-4 text-center text-base font-semibold ${selected ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-black/30 text-white"}`}>
                    {timeLabel(slot.starts_at)}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {selectedSlot ? (
          <section className="mt-5 rounded-3xl border border-yellow-400/25 bg-yellow-400/[0.06] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-yellow-400">Confirm</p>
            <h2 className="mt-2 text-2xl font-semibold">{selectedTrainer?.full_name || "Trainer"}</h2>
            <p className="mt-2 text-zinc-300">{longDate(selectedSlot.starts_at)}</p>
            <p className="mt-1 text-xl font-semibold text-yellow-300">{timeLabel(selectedSlot.starts_at)} – {timeLabel(selectedSlot.ends_at)}</p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-zinc-400">
              Book at least 2 hours ahead. Free cancellation until 8 hours before the session. Booking does not deduct a session.
            </div>
            <button type="button" onClick={() => void confirmBooking()} disabled={booking} className="mt-4 w-full rounded-2xl bg-yellow-400 px-5 py-4 text-base font-semibold text-black disabled:opacity-50">
              {booking ? "Booking..." : "Confirm Booking"}
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
