"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

type StaffRow = {
  id: string;
  full_name: string | null;
  role: string;
};

type SlotRow = {
  label: string;
  startsAt: string;
  endsAt: string;
};

function todayInputValue() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatSlot(startsAt: string) {
  const date = new Date(startsAt);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ClientBookPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [trainerId, setTrainerId] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotRow | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [loadingStaff, setLoadingStaff] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState("");

  const selectedTrainer = useMemo(() => {
    return staff.find((trainer) => trainer.id === trainerId) || null;
  }, [staff, trainerId]);

  useEffect(() => {
    async function protectPage() {
      const { user } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      setClientEmail(user.email || "");
      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  useEffect(() => {
    async function loadStaff() {
      setLoadingStaff(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/login");
        return;
      }

      const response = await fetch("/api/bookings/staff", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await response.json();

      if (!response.ok) {
        setMessage(json.error || "Failed to load trainers.");
        setLoadingStaff(false);
        return;
      }

      const nextStaff = (json.staff || []) as StaffRow[];

      setStaff(nextStaff);

      if (nextStaff.length > 0) {
        setTrainerId(nextStaff[0].id);
      }

      setLoadingStaff(false);
    }

    if (!checkingRole) {
      loadStaff();
    }
  }, [checkingRole, router]);

  async function loadAvailability() {
    setMessage("");
    setSelectedSlot(null);
    setSlots([]);

    if (!trainerId || !date) {
      setMessage("Choose trainer and date first.");
      return;
    }

    setLoadingSlots(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/bookings/availability", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trainerId,
        date,
        durationMinutes: 60,
      }),
    });

    const json = await response.json();

    if (!response.ok) {
      setMessage(json.error || "Failed to check availability.");
      setLoadingSlots(false);
      return;
    }

    setSlots((json.slots || []) as SlotRow[]);
    setLoadingSlots(false);
  }

  async function createBooking() {
    setMessage("");

    if (!trainerId || !selectedSlot) {
      setMessage("Choose a time first.");
      return;
    }

    if (!clientName.trim()) {
      setMessage("Enter your name.");
      return;
    }

    setBooking(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/bookings/create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trainerId,
        clientName,
        clientEmail,
        clientPhone,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
        notes,
      }),
    });

    const json = await response.json();

    if (!response.ok) {
      setMessage(json.error || "Booking failed.");
      setBooking(false);
      return;
    }

    setMessage("Booking confirmed. The trainer calendar has been updated.");
    setBooking(false);
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="font-black text-yellow-400">Checking access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <header className="mb-8">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
              FXA FITNESS
            </p>

            <h1 className="text-4xl font-black tracking-tight md:text-6xl">
              Book Session
            </h1>

            <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
              Choose a trainer, find an available time, and book your session.
            </p>
          </header>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-widest text-gray-400">
                  Trainer
                </label>

                <select
                  value={trainerId}
                  onChange={(event) => {
                    setTrainerId(event.target.value);
                    setSlots([]);
                    setSelectedSlot(null);
                  }}
                  disabled={loadingStaff}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                >
                  {staff.map((trainer) => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.full_name || trainer.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-widest text-gray-400">
                  Date
                </label>

                <input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setSlots([]);
                    setSelectedSlot(null);
                  }}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={loadAvailability}
              disabled={loadingSlots || !trainerId}
              className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:opacity-60"
            >
              {loadingSlots ? "Checking..." : "Check Available Times"}
            </button>
          </section>

          {slots.length > 0 ? (
            <section className="mt-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur">
              <h2 className="mb-4 text-2xl font-black">Available Times</h2>

              <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
                {slots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-2xl px-4 py-3 text-sm font-black uppercase transition ${
                      selectedSlot?.startsAt === slot.startsAt
                        ? "bg-yellow-400 text-black"
                        : "border border-yellow-500/30 bg-black/40 text-yellow-400 hover:bg-yellow-400 hover:text-black"
                    }`}
                  >
                    {formatSlot(slot.startsAt)}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur">
            <h2 className="mb-4 text-2xl font-black">Your Details</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-widest text-gray-400">
                  Name
                </label>

                <input
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-widest text-gray-400">
                  Email
                </label>

                <input
                  value={clientEmail}
                  onChange={(event) => setClientEmail(event.target.value)}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-widest text-gray-400">
                  Phone
                </label>

                <input
                  value={clientPhone}
                  onChange={(event) => setClientPhone(event.target.value)}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-widest text-gray-400">
                  Selected
                </label>

                <div className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-yellow-400">
                  {selectedTrainer?.full_name || "Trainer"}{" "}
                  {selectedSlot ? `at ${formatSlot(selectedSlot.startsAt)}` : "-"}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-black uppercase tracking-widest text-gray-400">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
              />
            </div>

            <button
              type="button"
              onClick={createBooking}
              disabled={booking || !selectedSlot}
              className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:opacity-60"
            >
              {booking ? "Booking..." : "Confirm Booking"}
            </button>

            {message ? (
              <p className="mt-5 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4 font-bold text-yellow-300">
                {message}
              </p>
            ) : null}
          </section>

          <div className="mt-6">
            <Link
              href="/client"
              className="block rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Back to Client Dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}