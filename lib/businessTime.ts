/** All business dates are Toronto dates, independent of browser/server TZ. */
export const BUSINESS_TIME_ZONE = 'America/Toronto';
export function businessDate(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date.');
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function addDays(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid calendar date.');
  const d = new Date(date + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date.');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
/** Reject nonexistent AND ambiguous wall times instead of silently shifting DST. */
export function torontoInstant(day: string, minute = 0): string | null {
  addDays(day, 0);
  if (!Number.isInteger(minute) || minute < 0 || minute > 1440) return null;
  if (minute === 1440) return torontoInstant(addDays(day, 1), 0);
  const naive = new Date(`${day}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00Z`).getTime();
  const candidates = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = new Date(naive + delta);
    const p = localParts(probe);
    const offset = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - probe.getTime();
    const candidate = naive - offset;
    const q = localParts(new Date(candidate));
    if (`${q.year}-${q.month}-${q.day}` === day && Number(q.hour) * 60 + Number(q.minute) === minute) candidates.add(candidate);
  }
  return candidates.size === 1 ? new Date([...candidates][0]).toISOString() : null;
}
export function businessMonthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month.');
  const start = `${month}-01`;
  const next = new Date(start + 'T12:00:00Z'); next.setUTCMonth(next.getUTCMonth() + 1);
  return { reportDate: start, startIso: torontoInstant(start)!, endIso: torontoInstant(next.toISOString().slice(0, 10))! };
}
export function paymentStatus(price: number, paid: number): 'paid' | 'partial' | 'pending' {
  if (![price, paid].every(Number.isFinite) || price < 0 || paid < 0 || paid > price) throw new Error('Invalid payment amounts.');
  return paid === price ? 'paid' : paid > 0 ? 'partial' : 'pending';
}
export const isChargeableStatus = (status: string | null) => ['success', 'completed', 'no_show', 'late_cancel', 'manual_subtract'].includes(status || '');
export function currentPackage<T extends { status: string | null; created_at?: string | null }>(rows: T[]): T | null {
  return [...rows].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || Date.parse(b.created_at || '1970-01-01') - Date.parse(a.created_at || '1970-01-01'))[0] || null;
}
