'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { bookingFetch } from '@/lib/booking/client';
import { BUSINESS_TIME_ZONE, businessDate, torontoInstant } from '@/lib/businessTime';
import { validWindows, type Window } from '@/lib/booking/time';

type Block = { id: string; starts_at: string; ends_at: string; reason: string };
type Booking = {
  id: string;
  client_name: string;
  starts_at: string;
  ends_at: string;
  google_sync_status: string;
  can_cancel: boolean;
};
type Schedule = {
  windows: Window[];
  blocks: Block[];
  connection: { connected: boolean; google_email: string | null } | null;
};

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GRID_START_HOUR = 6;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT = 76;
const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;
const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => GRID_START_HOUR + i);
const field = 'rounded-xl border border-white/20 bg-black p-3 text-sm text-white';

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutes = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoDateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function startOfWeek(base: Date) {
  const next = new Date(base);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(base: Date, daysToAdd: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + daysToAdd);
  return next;
}

function formatHeaderDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  return `${formatHeaderDate(start)} - ${formatHeaderDate(end)}, ${end.getFullYear()}`;
}

function minuteOfDay(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));

  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0') % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  return hour * 60 + minute;
}

function label(value: string) {
  return new Date(value).toLocaleString('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeOnly(value: string) {
  return new Date(value).toLocaleTimeString('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function eventStyle(startsAt: string, endsAt: string) {
  const startMinute = Math.max(minuteOfDay(startsAt), GRID_START_HOUR * 60);
  const endMinute = Math.min(minuteOfDay(endsAt), GRID_END_HOUR * 60);
  const top = ((startMinute - GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(30, ((endMinute - startMinute) / 60) * HOUR_HEIGHT - 6);
  return { top: `${top}px`, height: `${height}px` };
}

function windowStyle(window: Window) {
  const startMinute = Math.max(window.start_minute, GRID_START_HOUR * 60);
  const endMinute = Math.min(window.end_minute, GRID_END_HOUR * 60);
  const top = ((startMinute - GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(8, ((endMinute - startMinute) / 60) * HOUR_HEIGHT - 4);
  return { top: `${top}px`, height: `${height}px` };
}

export default function TrainerCalendarPage() {
  const [windows, setWindows] = useState<Window[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [connection, setConnection] = useState<Schedule['connection']>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [blockDate, setBlockDate] = useState(businessDate());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [reason, setReason] = useState('');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(`${businessDate()}T12:00:00`)));
  const lock = useRef(false);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const todayKey = businessDate();

  async function load() {
    const [schedule, upcoming] = await Promise.all([
      bookingFetch<Schedule>('/api/bookings/schedule'),
      bookingFetch<{ bookings: Booking[] }>('/api/bookings/upcoming'),
    ]);
    setWindows(schedule.windows);
    setBlocks(schedule.blocks);
    setConnection(schedule.connection);
    setBookings(upcoming.bookings);
  }

  useEffect(() => {
    let alive = true;
    void Promise.resolve()
      .then(load)
      .catch((error) => {
        if (alive) setMessage(error instanceof Error ? error.message : 'Schedule could not be loaded.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    Promise.resolve().then(() => {
      if (!alive) return;
      const q = new URLSearchParams(window.location.search);
      if (q.get('error')) setMessage(q.get('error')!);
      if (q.get('connected')) setMessage('Google Calendar connected.');
    });

    return () => {
      alive = false;
    };
  }, []);

  async function action(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await fn();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function connect() {
    await action(async () => {
      const response = await bookingFetch<{ url: string }>('/api/google-calendar/connect', 'POST', {});
      window.location.assign(response.url);
    });
  }

  function edit(i: number, key: 'start_minute' | 'end_minute', value: string) {
    const minute = minutes(value);
    setWindows((current) =>
      current.map((window, n) =>
        n === i ? { ...window, [key]: key === 'end_minute' && minute === 0 ? 1440 : minute } : window,
      ),
    );
  }

  const weekBookings = bookings.filter((booking) => weekDates.some((date) => dateKey(date) === isoDateKey(booking.starts_at)));

  return (
    <main className="min-h-screen bg-black p-3 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-6 flex flex-col gap-4 rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">FXA FITNESS</p>
              <h1 className="text-3xl font-black tracking-tight md:text-5xl">PT Calendar</h1>
              <p className="mt-2 text-sm text-gray-400">Google-style weekly schedule. Toronto time.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/trainer/scan" className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-zinc-200 hover:border-yellow-400 hover:text-yellow-300">
                Back to Scanner
              </Link>
              <button type="button" onClick={connect} disabled={busy} className="rounded-full border border-yellow-400/60 px-4 py-2 text-sm font-black text-yellow-300 disabled:opacity-50">
                {connection?.connected ? 'Reconnect Google' : 'Connect Google'}
              </button>
            </div>
          </header>

          {message && <p role="status" className="mb-5 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4 text-sm text-yellow-100">{message}</p>}

          {loading ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 text-gray-300">Loading schedule...</p>
          ) : (
            <>
              <section className="mb-5 grid gap-4 md:grid-cols-[1.4fr_1fr]">
                <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">Week View</p>
                      <h2 className="mt-1 text-2xl font-black">{formatWeekRange(weekStart)}</h2>
                    </div>
                    <div className="flex rounded-full border border-white/10 bg-black/60 p-1">
                      <button type="button" onClick={() => setWeekStart((date) => addDays(date, -7))} className="rounded-full px-3 py-2 text-sm font-bold text-zinc-300 hover:text-yellow-300">‹</button>
                      <button type="button" onClick={() => setWeekStart(startOfWeek(new Date(`${businessDate()}T12:00:00`)))} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-black">Today</button>
                      <button type="button" onClick={() => setWeekStart((date) => addDays(date, 7))} className="rounded-full px-3 py-2 text-sm font-bold text-zinc-300 hover:text-yellow-300">›</button>
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">Google Calendar</p>
                  <p className="mt-2 text-sm text-gray-300">{connection?.connected ? connection.google_email || 'Connected' : 'Not connected. Clients cannot book until your calendar is connected.'}</p>
                  <p className="mt-3 text-sm text-zinc-500">{weekBookings.length} booking{weekBookings.length === 1 ? '' : 's'} this week</p>
                </div>
              </section>

              <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f0f0f] shadow-2xl shadow-black/40">
                <div className="overflow-x-auto">
                  <div className="min-w-[980px]">
                    <div className="grid border-b border-white/10 bg-[#151515]" style={{ gridTemplateColumns: '72px repeat(7, minmax(120px, 1fr))' }}>
                      <div className="border-r border-white/10 p-3 text-xs font-bold uppercase text-zinc-500">GMT-5</div>
                      {weekDates.map((date) => {
                        const key = dateKey(date);
                        const isToday = key === todayKey;
                        return (
                          <div key={key} className={`border-r border-white/10 p-3 text-center ${isToday ? 'bg-yellow-400/10' : ''}`}>
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{shortDays[date.getDay()]}</p>
                            <p className={`mx-auto mt-1 flex h-9 w-9 items-center justify-center rounded-full text-lg font-black ${isToday ? 'bg-yellow-400 text-black' : 'text-white'}`}>{date.getDate()}</p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="relative grid" style={{ gridTemplateColumns: '72px repeat(7, minmax(120px, 1fr))', height: GRID_HEIGHT }}>
                      {hours.map((hour) => (
                        <div key={hour} className="pointer-events-none absolute left-0 right-0 border-t border-white/[0.07]" style={{ top: `${(hour - GRID_START_HOUR) * HOUR_HEIGHT}px` }} />
                      ))}

                      <div className="relative border-r border-white/10 bg-[#111111]">
                        {hours.map((hour) => (
                          <div key={hour} className="absolute right-2 -translate-y-2 text-xs text-zinc-500" style={{ top: `${(hour - GRID_START_HOUR) * HOUR_HEIGHT}px` }}>
                            {hour}:00
                          </div>
                        ))}
                      </div>

                      {weekDates.map((date) => {
                        const key = dateKey(date);
                        const weekday = date.getDay();
                        const dayBookings = bookings.filter((booking) => isoDateKey(booking.starts_at) === key);
                        const dayBlocks = blocks.filter((block) => isoDateKey(block.starts_at) === key);
                        const dayWindows = windows.filter((window) => window.weekday === weekday);
                        return (
                          <div key={key} className="relative border-r border-white/10 bg-[#0c0c0c]">
                            {dayWindows.map((window, index) => (
                              <div key={`${key}-window-${index}`} className="absolute left-1 right-1 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06]" style={windowStyle(window)} title="Available" />
                            ))}
                            {dayBlocks.map((block) => (
                              <div key={block.id} className="absolute left-1 right-1 rounded-xl border border-zinc-500/30 bg-zinc-700/40 p-2 text-[11px] font-bold text-zinc-200" style={eventStyle(block.starts_at, block.ends_at)}>
                                <p className="truncate">Blocked</p>
                                <p className="truncate text-zinc-400">{timeOnly(block.starts_at)} - {timeOnly(block.ends_at)}</p>
                              </div>
                            ))}
                            {dayBookings.map((booking) => (
                              <article key={booking.id} className="absolute left-1 right-1 overflow-hidden rounded-xl border border-yellow-300/40 bg-yellow-400 p-2 text-black shadow-lg shadow-yellow-500/10" style={eventStyle(booking.starts_at, booking.ends_at)}>
                                <p className="truncate text-xs font-black">{booking.client_name}</p>
                                <p className="truncate text-[11px] font-bold opacity-80">{timeOnly(booking.starts_at)} - {timeOnly(booking.ends_at)}</p>
                                <p className="truncate text-[10px] font-black uppercase opacity-70">{booking.google_sync_status === 'synced' ? 'Synced' : 'Sync pending'}</p>
                              </article>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="rounded-[2rem] border border-white/15 bg-white/[0.07] p-6">
                  <details>
                    <summary className="cursor-pointer text-xl font-black">Edit Availability</summary>
                    <p className="mt-3 text-xs text-gray-400">Repeats every week. Empty days are closed. Existing bookings are never removed by schedule edits.</p>
                    {days.map((day, d) => (
                      <div key={day} className="mt-5 border-b border-white/10 pb-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold">{day}</h3>
                          <button type="button" disabled={busy} onClick={() => setWindows((current) => [...current, { weekday: d, start_minute: 540, end_minute: 1020 }])} className="text-sm text-yellow-400">
                            + Add hours
                          </button>
                        </div>
                        {windows.map((window, i) =>
                          window.weekday !== d ? null : (
                            <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
                              <input aria-label={`${day} start ${i}`} type="time" step="60" className={field} value={clock(window.start_minute)} disabled={busy} onChange={(e) => edit(i, 'start_minute', e.target.value)} />
                              <span>to</span>
                              <input aria-label={`${day} end ${i}`} type="time" step="60" className={field} value={clock(window.end_minute)} disabled={busy} onChange={(e) => edit(i, 'end_minute', e.target.value)} />
                              <button type="button" disabled={busy} onClick={() => setWindows((current) => current.filter((_, n) => n !== i))} className="text-xs text-gray-400">
                                Remove
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    ))}
                    <button type="button" disabled={busy} onClick={() => action(async () => { if (!validWindows(windows)) throw new Error('Hours must be at least 60 minutes and cannot overlap.'); await bookingFetch('/api/bookings/schedule', 'PUT', { windows }); setMessage('Weekly availability saved.'); })} className="mt-5 w-full rounded-2xl bg-yellow-400 p-3 font-black text-black disabled:opacity-50">
                      Save Availability
                    </button>
                  </details>
                </div>

                <div className="rounded-[2rem] border border-white/15 bg-white/[0.07] p-6">
                  <details>
                    <summary className="cursor-pointer text-xl font-black">One-Time Block</summary>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <input aria-label="Block date" type="date" className={field} value={blockDate} min={businessDate()} onChange={(e) => setBlockDate(e.target.value)} />
                      <input aria-label="Block start" type="time" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
                      <input aria-label="Block end" type="time" className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
                      <input aria-label="Block reason" className={`${field} w-full`} value={reason} placeholder="Reason (optional)" onChange={(e) => setReason(e.target.value)} />
                    </div>
                    <button type="button" disabled={busy} onClick={() => action(async () => { const a = torontoInstant(blockDate, minutes(start)); const b = torontoInstant(blockDate, minutes(end) || 1440); if (!a || !b) throw new Error('Choose an unambiguous Toronto time.'); await bookingFetch('/api/bookings/schedule', 'POST', { startsAt: a, endsAt: b, reason }); setMessage('Time blocked.'); })} className="mt-4 rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black disabled:opacity-50">
                      Block Time
                    </button>
                  </details>
                  {blocks.map((block) => (
                    <div key={block.id} className="mt-4 border-t border-white/10 pt-3 text-sm">
                      <p>{label(block.starts_at)} - {label(block.ends_at)}</p>
                      <p className="text-gray-500">{block.reason}</p>
                      <button type="button" disabled={busy} onClick={() => action(async () => { await bookingFetch('/api/bookings/schedule', 'DELETE', { id: block.id }); })} className="mt-2 text-yellow-400">
                        Remove block
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-5 rounded-[2rem] border border-white/15 bg-white/[0.07] p-6">
                <h2 className="text-xl font-black">Client Bookings</h2>
                {!bookings.length && <p className="mt-4 text-gray-400">No bookings.</p>}
                {bookings.map((booking) => (
                  <article key={booking.id} className="mt-4 rounded-2xl border border-white/10 p-4">
                    <p className="font-bold text-yellow-400">{label(booking.starts_at)}</p>
                    <p className="mt-1 font-bold">{booking.client_name}</p>
                    <p className="mt-2 text-xs text-gray-400">{booking.google_sync_status === 'synced' ? 'Calendar synced' : 'Calendar sync pending'}</p>
                    <div className="mt-3 flex flex-wrap gap-4">
                      <Link href={`/trainer/scan?bookingId=${booking.id}`} className="text-sm text-yellow-400">Record session</Link>
                      {booking.google_sync_status !== 'synced' && <button type="button" disabled={busy} onClick={() => action(async () => { await bookingFetch('/api/bookings/sync', 'POST', { bookingId: booking.id }); })} className="text-sm text-yellow-400">Retry calendar sync</button>}
                      {booking.can_cancel && <button type="button" disabled={busy} onClick={() => { const note = window.prompt('Reason for cancelling this session:'); if (note?.trim()) void action(async () => { await bookingFetch('/api/bookings/cancel', 'POST', { bookingId: booking.id, reason: note }); setMessage('Session cancelled.'); }); }} className="text-sm text-gray-400">Cancel</button>}
                    </div>
                  </article>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
