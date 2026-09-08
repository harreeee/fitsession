'use client';

import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { bookingFetch } from '@/lib/booking/client';
import { BUSINESS_TIME_ZONE, businessDate, torontoInstant } from '@/lib/businessTime';
import { validWindows, type Window } from '@/lib/booking/time';

type ViewMode = 'day' | 'week' | 'month';
type Staff = { id: string; full_name: string | null; is_main?: boolean };
type Viewer = { id: string; role: string; full_name?: string | null };
type Block = { id: string; starts_at: string; ends_at: string; reason: string | null };
type Booking = {
  id: string;
  client_id: string;
  trainer_id: string;
  client_name: string;
  trainer_name?: string | null;
  trainer_email?: string | null;
  starts_at: string;
  ends_at: string;
  google_sync_status: string;
  can_cancel: boolean;
};
type Schedule = {
  windows: Window[];
  blocks: Block[];
  connection: { connected: boolean; google_email: string | null } | null;
  trainerId: string | null;
  viewer?: Viewer;
};
type Upcoming = { bookings: Booking[]; viewer: Viewer; serverTime: string };
type StaffResponse = { staff: Staff[] };

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GRID_START_HOUR = 6;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT = 78;
const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;
const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, index) => GRID_START_HOUR + index);
const field = 'rounded-xl border border-white/15 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-yellow-400';

const clock = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const minutes = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

function canViewAll(role: string | null | undefined) {
  return role === 'admin' || role === 'manager';
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isoDateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00`);
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

function addMonths(base: Date, monthsToAdd: number) {
  return new Date(base.getFullYear(), base.getMonth() + monthsToAdd, 1, 12, 0, 0, 0);
}

function monthGrid(base: Date) {
  const first = new Date(base.getFullYear(), base.getMonth(), 1, 12, 0, 0, 0);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function formatHeaderDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(date);
}

function formatRange(view: ViewMode, cursor: Date) {
  if (view === 'day') {
    return new Intl.DateTimeFormat('en-CA', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(cursor);
  }

  if (view === 'month') {
    return new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' }).format(cursor);
  }

  const start = startOfWeek(cursor);
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

function fullLabel(value: string) {
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
  const height = Math.max(34, ((endMinute - startMinute) / 60) * HOUR_HEIGHT - 6);
  return { top: `${top}px`, height: `${height}px` };
}

function windowStyle(window: Window) {
  const startMinute = Math.max(window.start_minute, GRID_START_HOUR * 60);
  const endMinute = Math.min(window.end_minute, GRID_END_HOUR * 60);
  const top = ((startMinute - GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(10, ((endMinute - startMinute) / 60) * HOUR_HEIGHT - 4);
  return { top: `${top}px`, height: `${height}px` };
}

function maskEmail(email: string | null | undefined) {
  if (!email) return 'No email on profile';
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}***@${domain}`;
}

function syncLabel(status: string) {
  if (status === 'synced') return 'Google synced';
  if (status === 'pending') return 'Google sync pending';
  return `Google: ${status}`;
}

export default function TrainerCalendarPage() {
  const [windows, setWindows] = useState<Window[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState('all');
  const [connection, setConnection] = useState<Schedule['connection']>(null);
  const [calendarTrainerId, setCalendarTrainerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [cursorDate, setCursorDate] = useState(() => dateAtNoon(businessDate()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [blockDate, setBlockDate] = useState(businessDate());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [reason, setReason] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const lock = useRef(false);

  const managerView = canViewAll(viewer?.role);
  const activeTrainerId = managerView ? (selectedTrainerId === 'all' ? null : selectedTrainerId) : viewer?.role === 'trainer' ? viewer.id : null;
  const selectedTrainer = staff.find((trainer) => trainer.id === activeTrainerId);
  const todayKey = businessDate();

  const displayDates = useMemo(() => {
    if (viewMode === 'day') return [cursorDate];
    if (viewMode === 'month') return monthGrid(cursorDate);
    const start = startOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursorDate, viewMode]);

  const visibleBookings = useMemo(() => {
    const dateSet = new Set(displayDates.map(dateKey));
    return bookings.filter((booking) => dateSet.has(isoDateKey(booking.starts_at)));
  }, [bookings, displayDates]);

  async function load(nextTrainerId = selectedTrainerId) {
    const trainerFilter = nextTrainerId !== 'all' ? `?trainerId=${nextTrainerId}` : '';
    const [upcoming, staffList] = await Promise.all([
      bookingFetch<Upcoming>(`/api/bookings/upcoming${trainerFilter}`),
      bookingFetch<StaffResponse>('/api/bookings/staff'),
    ]);

    const nextViewer = upcoming.viewer;
    const nextManagerView = canViewAll(nextViewer.role);
    const scheduleTrainerId = nextManagerView
      ? nextTrainerId === 'all'
        ? null
        : nextTrainerId
      : nextViewer.role === 'trainer'
        ? nextViewer.id
        : null;

    let schedule: Schedule = { windows: [], blocks: [], connection: null, trainerId: null, viewer: nextViewer };
    if (scheduleTrainerId) {
      schedule = await bookingFetch<Schedule>(`/api/bookings/schedule?trainerId=${scheduleTrainerId}`);
    }

    setViewer(nextViewer);
    setStaff(staffList.staff || []);
    setBookings(upcoming.bookings || []);
    setWindows(schedule.windows || []);
    setBlocks(schedule.blocks || []);
    setConnection(schedule.connection);
    setCalendarTrainerId(schedule.trainerId);

    if (!nextManagerView && nextViewer.role === 'trainer') {
      setSelectedTrainerId(nextViewer.id);
    }
  }

  useEffect(() => {
    let alive = true;
    void Promise.resolve()
      .then(() => load('all'))
      .catch((error) => {
        if (alive) setMessage(error instanceof Error ? error.message : 'Schedule could not be loaded.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    Promise.resolve().then(() => {
      if (!alive) return;
      const params = new URLSearchParams(window.location.search);
      if (params.get('error')) setMessage(params.get('error')!);
      if (params.get('connected')) setMessage('Google Calendar connected.');
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
      await load(selectedTrainerId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function requireEditableTrainer() {
    if (!activeTrainerId) throw new Error('Choose one PT before editing availability or blocking time.');
    return activeTrainerId;
  }

  async function connect() {
    if (managerView && !activeTrainerId) {
      setMessage('Choose one PT before connecting Google Calendar.');
      return;
    }

    await action(async () => {
      const response = await bookingFetch<{ url: string }>('/api/google-calendar/connect', 'POST', {});
      window.location.assign(response.url);
    });
  }

  function editWindow(index: number, key: 'start_minute' | 'end_minute', value: string) {
    const minute = minutes(value);
    setWindows((current) =>
      current.map((window, currentIndex) =>
        currentIndex === index ? { ...window, [key]: key === 'end_minute' && minute === 0 ? 1440 : minute } : window,
      ),
    );
  }

  function moveCalendar(direction: number) {
    setCursorDate((current) => {
      if (viewMode === 'day') return addDays(current, direction);
      if (viewMode === 'month') return addMonths(current, direction);
      return addDays(current, direction * 7);
    });
  }

  function jumpToday() {
    setCursorDate(dateAtNoon(businessDate()));
  }

  function handleTrainerChange(value: string) {
    setSelectedTrainerId(value);
    setLoading(true);
    void load(value)
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Schedule could not be loaded.'))
      .finally(() => setLoading(false));
  }

  function prepareBlockFromSlot(date: Date, event: MouseEvent<HTMLDivElement>) {
    if (!activeTrainerId) {
      setMessage('Choose one PT before blocking time.');
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const rawMinute = GRID_START_HOUR * 60 + ((event.clientY - rect.top) / HOUR_HEIGHT) * 60;
    const snapped = Math.min(GRID_END_HOUR * 60 - 60, Math.max(GRID_START_HOUR * 60, Math.round(rawMinute / 30) * 30));
    setBlockDate(dateKey(date));
    setStart(clock(snapped));
    setEnd(clock(snapped + 60));
    setReason('');
    setMessage(`Prepared a block for ${dateKey(date)} ${clock(snapped)}-${clock(snapped + 60)}. Press Block Time to save.`);
  }

  function renderDayColumn(date: Date, wide = false) {
    const key = dateKey(date);
    const weekday = date.getDay();
    const dayBookings = bookings.filter((booking) => isoDateKey(booking.starts_at) === key);
    const dayBlocks = blocks.filter((block) => isoDateKey(block.starts_at) === key);
    const dayWindows = activeTrainerId ? windows.filter((window) => window.weekday === weekday) : [];

    return (
      <div
        key={key}
        onDoubleClick={(event) => prepareBlockFromSlot(date, event)}
        className={`relative border-r border-white/10 bg-[#0c0c0c] ${wide ? 'min-w-[520px]' : ''}`}
      >
        {dayWindows.map((window, index) => (
          <div
            key={`${key}-window-${index}`}
            className="absolute left-1 right-1 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06]"
            style={windowStyle(window)}
            title="Available"
          />
        ))}

        {dayBlocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={(event) => event.stopPropagation()}
            className="absolute left-1 right-1 overflow-hidden rounded-xl border border-zinc-500/30 bg-zinc-700/45 p-2 text-left text-[11px] font-bold text-zinc-200"
            style={eventStyle(block.starts_at, block.ends_at)}
            title={block.reason || 'Blocked'}
          >
            <p className="truncate">Blocked</p>
            <p className="truncate text-zinc-400">{timeOnly(block.starts_at)} - {timeOnly(block.ends_at)}</p>
          </button>
        ))}

        {dayBookings.map((booking) => (
          <button
            key={booking.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedBooking(booking);
            }}
            className="absolute left-1 right-1 overflow-hidden rounded-xl border border-yellow-300/40 bg-yellow-400 p-2 text-left text-[11px] font-black text-black shadow-xl shadow-yellow-500/10 transition hover:brightness-110"
            style={eventStyle(booking.starts_at, booking.ends_at)}
            title={`${booking.client_name} — ${booking.trainer_name || 'Trainer'}`}
          >
            <p className="truncate">{timeOnly(booking.starts_at)} {booking.client_name}</p>
            <p className="truncate text-black/65">{booking.trainer_name || 'Trainer'}</p>
          </button>
        ))}
      </div>
    );
  }

  function renderTimeGrid() {
    const dates = viewMode === 'day' ? [cursorDate] : displayDates.slice(0, 7);
    return (
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f0f0f] shadow-2xl shadow-black/40">
        <div className="overflow-x-auto">
          <div className={viewMode === 'day' ? 'min-w-[760px]' : 'min-w-[1040px]'}>
            <div
              className="grid border-b border-white/10 bg-[#151515]"
              style={{ gridTemplateColumns: viewMode === 'day' ? '72px minmax(520px, 1fr)' : '72px repeat(7, minmax(132px, 1fr))' }}
            >
              <div className="border-r border-white/10 p-3 text-xs font-bold uppercase text-zinc-500">Toronto</div>
              {dates.map((date) => {
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

            <div className="relative grid" style={{ gridTemplateColumns: viewMode === 'day' ? '72px minmax(520px, 1fr)' : '72px repeat(7, minmax(132px, 1fr))', height: GRID_HEIGHT }}>
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

              {dates.map((date) => renderDayColumn(date, viewMode === 'day'))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderMonthGrid() {
    const month = cursorDate.getMonth();
    return (
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f0f0f] shadow-2xl shadow-black/40">
        <div className="grid grid-cols-7 border-b border-white/10 bg-[#151515] text-center text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          {shortDays.map((day) => <div key={day} className="border-r border-white/10 p-3">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {displayDates.map((date) => {
            const key = dateKey(date);
            const dayBookings = bookings.filter((booking) => isoDateKey(booking.starts_at) === key);
            const muted = date.getMonth() !== month;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setCursorDate(date);
                  setViewMode('day');
                }}
                className={`min-h-[132px] border-r border-t border-white/10 p-3 text-left transition hover:bg-white/[0.04] ${muted ? 'bg-black/30 text-zinc-600' : 'bg-[#0c0c0c] text-white'}`}
              >
                <p className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${key === todayKey ? 'bg-yellow-400 text-black' : ''}`}>{date.getDate()}</p>
                <div className="space-y-1">
                  {dayBookings.slice(0, 3).map((booking) => (
                    <div key={booking.id} className="truncate rounded-md bg-yellow-400 px-2 py-1 text-[11px] font-black text-black">
                      {timeOnly(booking.starts_at)} {booking.client_name}
                    </div>
                  ))}
                  {dayBookings.length > 3 ? <p className="text-xs text-zinc-400">+{dayBookings.length - 3} more</p> : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-4 text-white md:p-6">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 text-sm text-zinc-300">Loading calendar...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-3 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-5 flex flex-col gap-4 rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">FXA FITNESS</p>
              <h1 className="text-3xl font-black tracking-tight md:text-5xl">PT Calendar</h1>
              <p className="mt-2 text-sm text-gray-400">Day, week and month scheduling. Toronto time.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/trainer/scan" className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-zinc-200 hover:border-yellow-400 hover:text-yellow-300">
                Back to Scanner
              </Link>
              <button type="button" onClick={connect} disabled={busy || !activeTrainerId} className="rounded-full border border-yellow-400/60 px-4 py-2 text-sm font-black text-yellow-300 disabled:opacity-40">
                {connection?.connected ? 'Reconnect Google' : 'Connect Google'}
              </button>
            </div>
          </header>

          {message ? <p role="status" className="mb-5 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4 text-sm text-yellow-100">{message}</p> : null}

          <section className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-4">
              <div className="flex flex-wrap items-center gap-3">
                {managerView ? (
                  <select value={selectedTrainerId} onChange={(event) => handleTrainerChange(event.target.value)} className={`${field} min-w-[220px]`}>
                    <option value="all">All PTs</option>
                    {staff.map((trainer) => (
                      <option key={trainer.id} value={trainer.id}>{trainer.full_name || 'Trainer'}</option>
                    ))}
                  </select>
                ) : null}

                <div className="flex rounded-full border border-white/10 bg-black/60 p-1">
                  {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={`rounded-full px-4 py-2 text-sm font-black capitalize ${viewMode === mode ? 'bg-yellow-400 text-black' : 'text-zinc-300 hover:text-yellow-300'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <div className="flex rounded-full border border-white/10 bg-black/60 p-1">
                  <button type="button" onClick={() => moveCalendar(-1)} className="rounded-full px-3 py-2 text-sm font-bold text-zinc-300 hover:text-yellow-300">‹</button>
                  <button type="button" onClick={jumpToday} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-black">Today</button>
                  <button type="button" onClick={() => moveCalendar(1)} className="rounded-full px-3 py-2 text-sm font-bold text-zinc-300 hover:text-yellow-300">›</button>
                </div>
              </div>

              <h2 className="mt-4 text-2xl font-black">{formatRange(viewMode, cursorDate)}</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {managerView && !activeTrainerId ? 'Admin/manager overview: showing bookings from all PTs.' : `Editing: ${selectedTrainer?.full_name || viewer?.full_name || 'My calendar'}`}
              </p>
            </div>

            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-4 lg:min-w-[320px]">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">Status</p>
              <p className="mt-2 text-sm text-gray-300">
                {activeTrainerId ? (connection?.connected ? connection.google_email || 'Google connected' : 'Google not connected') : 'Select one PT to see availability and Google status'}
              </p>
              <p className="mt-2 text-sm text-zinc-500">{visibleBookings.length} booking{visibleBookings.length === 1 ? '' : 's'} in this view</p>
            </div>
          </section>

          {viewMode === 'month' ? renderMonthGrid() : renderTimeGrid()}

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
              <details open={Boolean(activeTrainerId)}>
                <summary className="cursor-pointer text-xl font-black">Edit Availability</summary>
                {!activeTrainerId ? (
                  <p className="mt-4 rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm text-yellow-100">Choose one PT to edit weekly availability.</p>
                ) : (
                  <>
                    <p className="mt-3 text-xs text-gray-400">Repeats every week. Empty days are closed. Existing bookings are never removed by schedule edits.</p>
                    {days.map((day, dayIndex) => (
                      <div key={day} className="mt-5 border-b border-white/10 pb-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-bold">{day}</h3>
                          <button type="button" disabled={busy} onClick={() => setWindows((current) => [...current, { weekday: dayIndex, start_minute: 540, end_minute: 1020 }])} className="text-sm font-bold text-yellow-400 disabled:opacity-50">+ Add hours</button>
                        </div>
                        {windows.map((window, index) => window.weekday !== dayIndex ? null : (
                          <div key={index} className="mt-2 flex flex-wrap items-center gap-2">
                            <input aria-label={`${day} start ${index}`} type="time" step="60" className={field} value={clock(window.start_minute)} disabled={busy} onChange={(event) => editWindow(index, 'start_minute', event.target.value)} />
                            <span className="text-sm text-zinc-500">to</span>
                            <input aria-label={`${day} end ${index}`} type="time" step="60" className={field} value={clock(window.end_minute)} disabled={busy} onChange={(event) => editWindow(index, 'end_minute', event.target.value)} />
                            <button type="button" disabled={busy} onClick={() => setWindows((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="text-xs font-bold text-gray-400 disabled:opacity-50">Remove</button>
                          </div>
                        ))}
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => action(async () => {
                        const trainerId = requireEditableTrainer();
                        if (!validWindows(windows)) throw new Error('Hours must be at least 60 minutes and cannot overlap.');
                        await bookingFetch('/api/bookings/schedule', 'PUT', { trainerId, windows });
                        setMessage('Weekly availability saved.');
                      })}
                      className="mt-5 w-full rounded-2xl bg-yellow-400 p-3 font-black text-black disabled:opacity-50"
                    >
                      Save Availability
                    </button>
                  </>
                )}
              </details>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
              <h2 className="text-xl font-black">One-Time Block</h2>
              <p className="mt-2 text-xs text-zinc-500">Double-click a calendar slot to pre-fill this form.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <input aria-label="Block date" type="date" className={field} value={blockDate} min={businessDate()} onChange={(event) => setBlockDate(event.target.value)} />
                <input aria-label="Block start" type="time" className={field} value={start} onChange={(event) => setStart(event.target.value)} />
                <input aria-label="Block end" type="time" className={field} value={end} onChange={(event) => setEnd(event.target.value)} />
              </div>
              <input aria-label="Block reason" className={`${field} mt-2 w-full`} value={reason} placeholder="Reason (optional)" onChange={(event) => setReason(event.target.value)} />
              <button
                type="button"
                disabled={busy || !activeTrainerId}
                onClick={() => action(async () => {
                  const trainerId = requireEditableTrainer();
                  const startsAt = torontoInstant(blockDate, minutes(start));
                  const endsAt = torontoInstant(blockDate, minutes(end) || 1440);
                  if (!startsAt || !endsAt) throw new Error('Choose an unambiguous Toronto time.');
                  await bookingFetch('/api/bookings/schedule', 'POST', { trainerId, startsAt, endsAt, reason });
                  setMessage('Time blocked.');
                })}
                className="mt-4 w-full rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black disabled:opacity-40"
              >
                Block Time
              </button>

              <div className="mt-5 space-y-3">
                {blocks.length === 0 ? <p className="text-sm text-zinc-500">No upcoming blocks for selected PT.</p> : null}
                {blocks.slice(0, 6).map((block) => (
                  <div key={block.id} className="rounded-2xl border border-white/10 bg-black/40 p-3 text-sm">
                    <p className="font-bold text-zinc-100">{fullLabel(block.starts_at)} - {timeOnly(block.ends_at)}</p>
                    <p className="text-zinc-500">{block.reason || 'No reason'}</p>
                    <button type="button" disabled={busy} onClick={() => action(async () => {
                      const trainerId = requireEditableTrainer();
                      await bookingFetch('/api/bookings/schedule', 'DELETE', { trainerId, id: block.id });
                    })} className="mt-2 text-xs font-black text-yellow-400 disabled:opacity-40">Remove block</button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {selectedBooking ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-yellow-400/25 bg-[#111111] p-6 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-400">Booking Detail</p>
                <h2 className="mt-2 text-3xl font-black">{selectedBooking.client_name}</h2>
              </div>
              <button type="button" onClick={() => setSelectedBooking(null)} className="rounded-full border border-white/10 px-3 py-1 text-sm text-zinc-400">Close</button>
            </div>

            <div className="mt-5 space-y-3 text-sm text-zinc-300">
              <p><span className="text-zinc-500">Time:</span> {fullLabel(selectedBooking.starts_at)} - {timeOnly(selectedBooking.ends_at)}</p>
              <p><span className="text-zinc-500">PT:</span> {selectedBooking.trainer_name || 'Trainer'}</p>
              <p><span className="text-zinc-500">PT email:</span> {maskEmail(selectedBooking.trainer_email)}</p>
              <p><span className="text-zinc-500">Calendar:</span> {syncLabel(selectedBooking.google_sync_status)}</p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/trainer/scan?bookingId=${selectedBooking.id}`} className="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black text-black">Record session</Link>
              {selectedBooking.google_sync_status !== 'synced' ? (
                <button type="button" disabled={busy} onClick={() => action(async () => {
                  await bookingFetch('/api/bookings/sync', 'POST', { bookingId: selectedBooking.id });
                  setSelectedBooking(null);
                })} className="rounded-2xl border border-yellow-400/60 px-4 py-3 text-sm font-black text-yellow-300 disabled:opacity-40">Retry sync</button>
              ) : null}
              {selectedBooking.can_cancel ? (
                <button type="button" disabled={busy} onClick={() => {
                  const note = window.prompt('Reason for cancelling this session:');
                  if (note?.trim()) void action(async () => {
                    await bookingFetch('/api/bookings/cancel', 'POST', { bookingId: selectedBooking.id, reason: note });
                    setSelectedBooking(null);
                    setMessage('Session cancelled.');
                  });
                }} className="rounded-2xl border border-red-400/40 px-4 py-3 text-sm font-black text-red-300 disabled:opacity-40">Cancel</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
