import { addDays, businessDate, torontoInstant } from '../businessTime';
export type Window = { weekday: number; start_minute: number; end_minute: number };
export type Interval = { starts_at: string; ends_at: string };
export const overlaps = (a: Interval, b: Interval) => Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(a.ends_at) > Date.parse(b.starts_at);
export const canClientCancel = (startsAt: string, now = Date.now()) => Date.parse(startsAt) - now >= 8 * 3600000;
export function validWindows(windows: Window[]) {
  if (!Array.isArray(windows) || windows.length > 42) return false;
  const sorted = [...windows].sort((a, b) => a.weekday - b.weekday || a.start_minute - b.start_minute);
  return sorted.every((w, i) => [w.weekday, w.start_minute, w.end_minute].every(Number.isInteger) && w.weekday >= 0 && w.weekday <= 6 && w.start_minute >= 0 && w.end_minute <= 1440 && w.end_minute - w.start_minute >= 60 && !(i && sorted[i - 1].weekday === w.weekday && sorted[i - 1].end_minute > w.start_minute));
}
export function slotsForDay(day: string, windows: Window[], busy: Interval[], now = Date.now()): Interval[] {
  if (!validWindows(windows)) throw new Error('Invalid weekly availability.');
  if (day < businessDate(new Date(now)) || day >= addDays(businessDate(new Date(now)), 14)) return [];
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  const slots: Interval[] = [];
  for (const w of windows.filter(x => x.weekday === dow)) {
    for (let m = w.start_minute; m + 60 <= w.end_minute; m += 60) {
      const start = torontoInstant(day, m), end = torontoInstant(day, m + 60);
      if (!start || !end || Date.parse(start) <= now || Date.parse(end) - Date.parse(start) !== 3600000) continue;
      const slot = { starts_at: start, ends_at: end };
      if (!busy.some(b => overlaps(slot, b))) slots.push(slot);
    }
  }
  return slots.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
