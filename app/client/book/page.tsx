"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type Slot = {
  id: string;
  staff_id: string;
  service_code: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type Trainer = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type Package = {
  id: string;
  package_name: string | null;
  remaining_sessions: number | null;
  expires_at: string | null;
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
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [activePackage, setActivePackage] = useState<Package | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

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

  async function loadAvailability() {
    const token = await getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    const response = await fetch("/api/bookings/client-availability", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setTrainer(null);
      setActivePackage(null);
      setSlots([]);
      setMessage(result?.error || "Could not load available sessions.");
      setLoading(false);
      return;
    }

    setTrainer(result?.trainer || null);
    setActivePackage(result?.package || null);
    setSlots(result?.slots || []);
    setMessage(result?.message || "");

    const firstSlot = result?.slots?.[0];
    if (firstSlot) setSelectedDay(dayKey(firstSlot.starts_at));
    setLoading(false);
  }

  useEffect(() => {
    if (!checkingRole) void loadAvailability();
  }, [checkingRole]);

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
    if (!selectedSlot) return;
    const token = await getToken();
    if (!token) return;

    setBooking(true);
    setMessage("");

    const response = await fetch("/api/bookings/create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slotId: selectedSlot.id,
        notes: notes.trim() || null,
      }),
    });
    const result = await response.json().catch(() => null);
    setBooking(false);

    if (!response.ok) {
      setMessage(result?.error || "Could not book this session.");
      setSelectedSlot(null);
      await loadAvailability();
      return;
    }

    setSuccess(true);
  }

  if (checkingRole) {
    return <main className="min-h-screen bg-black p-6 text-yellow-400">Checking access...</main>;
  }

  if (success && selectedSlot) {
    return (
      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-lg">
          <section className="rounded-[2rem] border border-emerald-400/25 bg-white/[0.06] p-7 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-3xl">✓</div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.3em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-3 text-3xl font-semibold">Session booked</h1>
            <p className="mt-3 text-zinc-400">Your trainer&apos;s Google Calendar has been updated.</p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5 text-left">
              <p className="text-sm text-zinc-500">Trainer</p>
              <p className="mt-1 font-semibold">{trainer?.full_name || "Your trainer"}</p>
              <p className="mt-4 text-sm text-zinc-500">Date</p>
              <p className="mt-1 font-semibold">{dayLong(selectedSlot.starts_at)}</p>
              <p className="mt-4 text-sm text-zinc-500">Time</p>
              <p className="mt-1 text-xl font-semibold text-yellow-300">{timeLabel(selectedSlot.starts_at)} – {timeLabel(selectedSlot.ends_at)}</p>
            </div>
            <Link href="/client" className="mt-6 block rounded-2xl bg-yellow-400 px-5 py-3 font-semibold text-black">Back to Client Portal</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Book Session</h1>
            <p className="mt-2 text-sm text-zinc-500">Only times opened by your assigned trainer are shown.</p>
          </div>
          <Link href="/client" className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-zinc-300">Back</Link>
        </header>

        {message ? <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">{message}</div> : null}

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Your trainer</p>
              <p className="mt-1 text-xl font-semibold">{trainer?.full_name || (loading ? "Loading..." : "Not assigned")}</p>
            </div>
            {activePackage ? (
              <div className="rounded-2xl bg-yellow-400 px-4 py-3 text-right text-black">
                <p className="text-[10px] uppercase tracking-wider">Sessions left</p>
                <p className="text-2xl font-semibold">{activePackage.remaining_sessions ?? 0}</p>
              </div>
            ) : null}
          </div>
          {activePackage ? <p className="mt-3 text-sm text-zinc-500">{activePackage.package_name || "Active package"}{activePackage.expires_at ? ` · expires ${new Date(activePackage.expires_at).toLocaleDateString("en-CA")}` : ""}</p> : null}
        </section>

        {loading ? (
          <div className="mt-5 rounded-3xl border border-white/10 p-8 text-center text-yellow-400">Loading available times...</div>
        ) : slots.length > 0 ? (
          <>
            <section className="mt-5">
              <p className="mb-3 text-sm font-semibold text-zinc-300">1. Choose a day</p>
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
            </section>

            <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-zinc-300">2. Choose a time</p>
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

            {selectedSlot ? (
              <section className="mt-5 rounded-3xl border border-yellow-400/25 bg-yellow-400/[0.06] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-yellow-400">Confirm booking</p>
                <h2 className="mt-2 text-2xl font-semibold">{dayLong(selectedSlot.starts_at)}</h2>
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
                <p className="mt-3 text-center text-xs text-zinc-500">Booking does not deduct a session. Sessions are deducted only when your coach records the completed session.</p>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
