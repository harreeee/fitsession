import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { getBusyTimes } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

const TIME_ZONE = "America/Toronto";
const DAYS_TO_SHOW = 14;
const SLOT_MINUTES = 60;
const START_HOUR = 6;
const LAST_START_HOUR = 21;

type BusyPeriod = { start?: string; end?: string };
type SlotRow = {
  id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};
type BookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string | null;
};

function partsInZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
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

function dateKeyInZone(date: Date) {
  const p = partsInZone(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function addCalendarDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function zonedLocalToUtc(dateKey: string, hour: number, minute: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(desired);

  for (let index = 0; index < 3; index += 1) {
    const p = partsInZone(guess);
    const represented = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    const delta = desired - represented;
    if (delta === 0) break;
    guess = new Date(guess.getTime() + delta);
  }

  return guess;
}

function overlaps(startA: Date, endA: Date, startB: string, endB: string) {
  const bStart = new Date(startB);
  const bEnd = new Date(endB);
  return startA < bEnd && endA > bStart;
}

async function requireStaff(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth.user) {
    return { error: NextResponse.json({ error: auth.error }, { status: 401 }) };
  }

  const role = await getUserRole(auth.user.id);
  if (!["trainer", "nutrition_coach", "admin"].includes(role)) {
    return {
      error: NextResponse.json(
        { error: "Trainer, Nutrition Coach, or Admin access is required." },
        { status: 403 },
      ),
    };
  }

  return { user: auth.user, role };
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireStaff(request);
    if (access.error) return access.error;

    const staffId = access.user!.id;
    const supabase = createServiceSupabaseClient();
    const todayKey = dateKeyInZone(new Date());
    const rangeStart = zonedLocalToUtc(todayKey, START_HOUR, 0);
    const rangeEnd = zonedLocalToUtc(addCalendarDays(todayKey, DAYS_TO_SHOW), 0, 0);

    const [{ data: connection }, { data: slotData, error: slotError }, { data: bookingData, error: bookingError }] =
      await Promise.all([
        supabase
          .from("trainer_google_calendar_connections")
          .select("google_email, calendar_id, updated_at")
          .eq("trainer_id", staffId)
          .maybeSingle(),
        supabase
          .from("trainer_booking_slots")
          .select("id, staff_id, starts_at, ends_at, status")
          .eq("staff_id", staffId)
          .gte("starts_at", rangeStart.toISOString())
          .lt("starts_at", rangeEnd.toISOString())
          .order("starts_at"),
        supabase
          .from("bookings")
          .select("id, starts_at, ends_at, status")
          .eq("trainer_id", staffId)
          .gte("starts_at", rangeStart.toISOString())
          .lt("starts_at", rangeEnd.toISOString())
          .neq("status", "cancelled"),
      ]);

    if (slotError) throw slotError;
    if (bookingError) throw bookingError;

    const slots = (slotData || []) as SlotRow[];
    const bookings = (bookingData || []) as BookingRow[];

    let googleBusy: BusyPeriod[] = [];
    let googleError = "";

    if (connection) {
      try {
        googleBusy = (await getBusyTimes(
          staffId,
          rangeStart.toISOString(),
          rangeEnd.toISOString(),
        )) as BusyPeriod[];
      } catch (error) {
        googleError = error instanceof Error ? error.message : "Could not read Google Calendar.";
      }
    }

    const now = new Date();
    const days = Array.from({ length: DAYS_TO_SHOW }, (_, dayIndex) => {
      const dateKey = addCalendarDays(todayKey, dayIndex);
      const candidates: Array<{
        starts_at: string;
        ends_at: string;
        state: "free" | "google_busy" | "open" | "booked" | "conflict";
        slot_id: string | null;
      }> = [];

      for (let hour = START_HOUR; hour <= LAST_START_HOUR; hour += 1) {
        for (const minute of [0, 30]) {
          if (hour === LAST_START_HOUR && minute === 30) continue;

          const start = zonedLocalToUtc(dateKey, hour, minute);
          const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
          if (start <= now) continue;

          const exactSlot = slots.find(
            (slot) =>
              new Date(slot.starts_at).getTime() === start.getTime() &&
              new Date(slot.ends_at).getTime() === end.getTime(),
          );

          if (exactSlot?.status === "booked") {
            candidates.push({
              starts_at: start.toISOString(),
              ends_at: end.toISOString(),
              state: "booked",
              slot_id: exactSlot.id,
            });
            continue;
          }

          if (exactSlot?.status === "open") {
            candidates.push({
              starts_at: start.toISOString(),
              ends_at: end.toISOString(),
              state: "open",
              slot_id: exactSlot.id,
            });
            continue;
          }

          const busyOnGoogle = googleBusy.some(
            (busy) => busy.start && busy.end && overlaps(start, end, busy.start, busy.end),
          );
          if (busyOnGoogle) {
            candidates.push({
              starts_at: start.toISOString(),
              ends_at: end.toISOString(),
              state: "google_busy",
              slot_id: exactSlot?.id || null,
            });
            continue;
          }

          const bookingConflict = bookings.some((booking) =>
            overlaps(start, end, booking.starts_at, booking.ends_at),
          );
          const publishedConflict = slots.some(
            (slot) =>
              ["open", "booked"].includes(slot.status) &&
              overlaps(start, end, slot.starts_at, slot.ends_at),
          );

          candidates.push({
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            state: bookingConflict || publishedConflict ? "conflict" : "free",
            slot_id: exactSlot?.id || null,
          });
        }
      }

      return { date: dateKey, slots: candidates };
    });

    return NextResponse.json({
      connection: connection || null,
      google_error: googleError || null,
      time_zone: TIME_ZONE,
      slot_minutes: SLOT_MINUTES,
      days,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load trainer availability." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireStaff(request);
    if (access.error) return access.error;

    const staffId = access.user!.id;
    const body = (await request.json()) as { startsAt?: string; endsAt?: string };
    const start = new Date(body.startsAt || "");
    const end = new Date(body.endsAt || "");

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start <= new Date() ||
      end <= start ||
      end.getTime() - start.getTime() !== SLOT_MINUTES * 60_000
    ) {
      return NextResponse.json({ error: "Choose a valid future 60-minute slot." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const { data: connection } = await supabase
      .from("trainer_google_calendar_connections")
      .select("trainer_id")
      .eq("trainer_id", staffId)
      .maybeSingle();

    if (!connection) {
      return NextResponse.json(
        { error: "Connect Google Calendar before opening booking times." },
        { status: 409 },
      );
    }

    const busy = (await getBusyTimes(
      staffId,
      start.toISOString(),
      end.toISOString(),
    )) as BusyPeriod[];

    if (busy.some((period) => period.start && period.end && overlaps(start, end, period.start, period.end))) {
      return NextResponse.json(
        { error: "Google Calendar is busy during this time." },
        { status: 409 },
      );
    }

    const { data: existingSlots, error: existingError } = await supabase
      .from("trainer_booking_slots")
      .select("id, starts_at, ends_at, status")
      .eq("staff_id", staffId)
      .in("status", ["open", "booked"])
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString());

    if (existingError) throw existingError;
    if ((existingSlots || []).length > 0) {
      return NextResponse.json(
        { error: "This time overlaps another published booking slot." },
        { status: 409 },
      );
    }

    const { data: existingBookings, error: bookingError } = await supabase
      .from("bookings")
      .select("id")
      .eq("trainer_id", staffId)
      .neq("status", "cancelled")
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString())
      .limit(1);

    if (bookingError) throw bookingError;
    if ((existingBookings || []).length > 0) {
      return NextResponse.json({ error: "You already have a booking during this time." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("trainer_booking_slots")
      .insert({
        staff_id: staffId,
        service_code: "pt_1on1",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: "open",
        created_by: staffId,
      })
      .select("id, starts_at, ends_at, status")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, slot: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not open booking slot." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireStaff(request);
    if (access.error) return access.error;

    const staffId = access.user!.id;
    const slotId = request.nextUrl.searchParams.get("slotId") || "";
    if (!slotId) {
      return NextResponse.json({ error: "slotId is required." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const { data: slot, error: slotError } = await supabase
      .from("trainer_booking_slots")
      .select("id, staff_id, status")
      .eq("id", slotId)
      .maybeSingle();

    if (slotError) throw slotError;
    if (!slot || slot.staff_id !== staffId) {
      return NextResponse.json({ error: "Booking slot not found." }, { status: 404 });
    }
    if (slot.status !== "open") {
      return NextResponse.json({ error: "Only open slots can be closed." }, { status: 409 });
    }

    const { error } = await supabase
      .from("trainer_booking_slots")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", slotId)
      .eq("staff_id", staffId)
      .eq("status", "open");

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not close booking slot." },
      { status: 500 },
    );
  }
}
