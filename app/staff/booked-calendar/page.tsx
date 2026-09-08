"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { staffFetch } from "@/lib/staffFetch";

type Booking = {
  id: string;
  client_name: string;
  trainer_name: string;
  starts_at: string;
  ends_at: string;
  google_sync_status: string | null;
};
type ResponseData = { weekStart: string; weekEnd: string; bookings: Booking[] };

const dateKey = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const dayLabel = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "short", day: "numeric" });
const timeLabel = (value: string) => new Date(value).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });

export default function BookedCalendarPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [trainer, setTrainer] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    void staffFetch<ResponseData>("/api/staff/booked-calendar")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load bookings."));
  }, []);

  const trainers = useMemo(() => Array.from(new Set((data?.bookings || []).map((b) => b.trainer_name))).sort(), [data]);
  const filtered = useMemo(() => (data?.bookings || []).filter((b) => trainer === "all" || b.trainer_name === trainer), [data, trainer]);
  const grouped = useMemo(() => {
    const map = new Map<string, Booking[]>();
    filtered.forEach((booking) => {
      const key = dateKey(booking.starts_at);
      map.set(key, [...(map.get(key) || []), booking]);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-5 md:p-8">
        <div className="mx-auto max-w-6xl pt-20 md:pt-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.4em] text-yellow-400">Toronto · Read only</p><h1 className="mt-2 text-4xl font-black md:text-6xl">Booked Calendar</h1><p className="mt-2 text-sm text-gray-400">All booked sessions for this week.</p></div><Link href="/staff" className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-sm font-bold text-yellow-400">Staff Tools</Link></div>
          {data ? <div className="mt-5 flex flex-wrap items-center gap-3"><p className="text-sm text-gray-400">Week {data.weekStart} → {data.weekEnd}</p><select value={trainer} onChange={(e) => setTrainer(e.target.value)} className="rounded-xl border border-white/15 bg-white px-3 py-2 text-sm text-black"><option value="all">All trainers</option>{trainers.map((name) => <option key={name} value={name}>{name}</option>)}</select></div> : null}
          {error ? <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</p> : null}
          {!data && !error ? <p className="mt-6 text-gray-400">Loading bookings...</p> : null}
          <div className="mt-5 grid gap-4 md:grid-cols-2">{grouped.map(([day, bookings]) => <section key={day} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5"><h2 className="text-xl font-black text-yellow-400">{dayLabel(bookings[0].starts_at)}</h2><div className="mt-3 space-y-3">{bookings.map((booking) => <article key={booking.id} className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="font-black">{timeLabel(booking.starts_at)} – {timeLabel(booking.ends_at)}</p><p className="mt-1 text-lg">{booking.client_name}</p><p className="mt-1 text-sm text-gray-400">PT: {booking.trainer_name}</p><p className="mt-2 text-[11px] uppercase text-gray-600">{booking.google_sync_status === "synced" ? "Calendar synced" : "Sync pending"}</p></article>)}</div></section>)}</div>
          {data && filtered.length === 0 ? <p className="mt-6 text-gray-400">No booked sessions for this filter.</p> : null}
        </div>
      </div>
    </main>
  );
}
