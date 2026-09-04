export const BOOKING_TIME_ZONE = "America/Toronto";
export const BOOKING_HORIZON_DAYS = 30;
export const TRAINER_SCHEDULE_DAYS = 14;
export const SLOT_MINUTES = 60;
export const SLOT_STEP_MINUTES = 30;
export const MIN_BOOKING_NOTICE_HOURS = 2;
export const CANCELLATION_CUTOFF_HOURS = 8;

export type AvailabilityRule = {
  id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
};

export type BusyPeriod = {
  start?: string;
  end?: string;
};

export type CandidateSlot = {
  starts_at: string;
  ends_at: string;
};

export function partsInBookingZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function dateKeyInBookingZone(date: Date) {
  const parts = partsInBookingZone(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function addCalendarDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

export function weekdayForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
  return hour * 60 + minute;
}

export function minutesToTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function zonedLocalToUtc(dateKey: string, hour: number, minute: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(desired);

  for (let index = 0; index < 4; index += 1) {
    const representedParts = partsInBookingZone(guess);
    const represented = Date.UTC(
      representedParts.year,
      representedParts.month - 1,
      representedParts.day,
      representedParts.hour,
      representedParts.minute,
      representedParts.second,
    );
    const delta = desired - represented;
    if (delta === 0) break;
    guess = new Date(guess.getTime() + delta);
  }

  return guess;
}

export function overlaps(
  startA: string | Date,
  endA: string | Date,
  startB: string | Date,
  endB: string | Date,
) {
  const aStart = startA instanceof Date ? startA : new Date(startA);
  const aEnd = endA instanceof Date ? endA : new Date(endA);
  const bStart = startB instanceof Date ? startB : new Date(startB);
  const bEnd = endB instanceof Date ? endB : new Date(endB);
  return aStart < bEnd && aEnd > bStart;
}

export function overlapsAny(
  startsAt: string,
  endsAt: string,
  ranges: Array<{ starts_at?: string; ends_at?: string; start?: string; end?: string }>,
) {
  return ranges.some((range) => {
    const rangeStart = range.starts_at || range.start;
    const rangeEnd = range.ends_at || range.end;
    return Boolean(rangeStart && rangeEnd && overlaps(startsAt, endsAt, rangeStart!, rangeEnd!));
  });
}

export function buildCandidateSlots(
  rules: AvailabilityRule[],
  options?: {
    days?: number;
    now?: Date;
    minimumNoticeHours?: number;
  },
) {
  const now = options?.now || new Date();
  const days = options?.days ?? BOOKING_HORIZON_DAYS;
  const minimumNoticeHours = options?.minimumNoticeHours ?? MIN_BOOKING_NOTICE_HOURS;
  const minimumStart = new Date(now.getTime() + minimumNoticeHours * 60 * 60 * 1000);
  const todayKey = dateKeyInBookingZone(now);
  const unique = new Map<string, CandidateSlot>();

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const dateKey = addCalendarDays(todayKey, dayIndex);
    const weekday = weekdayForDateKey(dateKey);
    const dayRules = rules.filter(
      (rule) => rule.weekday === weekday && rule.is_active !== false,
    );

    for (const rule of dayRules) {
      const startMinutes = timeToMinutes(rule.start_time);
      const endMinutes = timeToMinutes(rule.end_time);
      if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) continue;

      for (
        let localStart = startMinutes;
        localStart + SLOT_MINUTES <= endMinutes;
        localStart += SLOT_STEP_MINUTES
      ) {
        const hour = Math.floor(localStart / 60);
        const minute = localStart % 60;
        const startsAt = zonedLocalToUtc(dateKey, hour, minute);
        const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000);

        if (startsAt < minimumStart) continue;

        const slot = {
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        };
        unique.set(`${slot.starts_at}|${slot.ends_at}`, slot);
      }
    }
  }

  return Array.from(unique.values()).sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

export function isSlotInsideWeeklyRules(
  startsAt: string,
  endsAt: string,
  rules: AvailabilityRule[],
) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end.getTime() - start.getTime() !== SLOT_MINUTES * 60 * 1000
  ) {
    return false;
  }

  const startParts = partsInBookingZone(start);
  const endParts = partsInBookingZone(end);
  if (
    startParts.year !== endParts.year ||
    startParts.month !== endParts.month ||
    startParts.day !== endParts.day
  ) {
    return false;
  }

  const dateKey = `${startParts.year}-${String(startParts.month).padStart(2, "0")}-${String(startParts.day).padStart(2, "0")}`;
  const weekday = weekdayForDateKey(dateKey);
  const startMinutes = startParts.hour * 60 + startParts.minute;
  const endMinutes = endParts.hour * 60 + endParts.minute;

  return rules.some((rule) => {
    if (rule.weekday !== weekday || rule.is_active === false) return false;
    const ruleStart = timeToMinutes(rule.start_time);
    const ruleEnd = timeToMinutes(rule.end_time);
    return startMinutes >= ruleStart && endMinutes <= ruleEnd;
  });
}
