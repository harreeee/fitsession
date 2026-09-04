import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { getBusyTimes } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

const SLOT_MINUTES = 60;
const DAYS_TO_SHOW = 14;
const START_HOUR = 7;
const END_HOUR = 20;

function overlaps(
  start: Date,
  end: Date,
  busy: Array<{ start?: string; end?: string }>,
) {
  return busy.some((item) => {
    const busyStart = new Date(item.start || "");
    const busyEnd = new Date(item.end || "");
    if (
      Number.isNaN(busyStart.getTime()) ||
      Number.isNaN(busyEnd.getTime())
    ) {
      return false;
    }
    return start < busyEnd && end > busyStart;
  });
}

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const role = await getUserRole(user.id);
    if (!["admin", "trainer", "nutrition_coach"].includes(role)) {
      return NextResponse.json({ error: "Staff access required." }, { status: 403 });
    }

    const trainerId =
      role === "admin"
        ? request.nextUrl.searchParams.get("trainerId") || user.id
        : user.id;

    const rangeStart = new Date();
    rangeStart.setMinutes(0, 0, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + DAYS_TO_SHOW + 1);

    const busy = (await getBusyTimes(
      trainerId,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
    )) as Array<{ start?: string; end?: string }>;

    const supabase = createServiceSupabaseClient();

    const [{ data: bookings, error: bookingError }, { data: published, error: slotError }] =
      await Promise.all([
        supabase
          .from("bookings")
          .select("id, starts_at, ends_at, status")
          .eq("trainer_id", trainerId)
          .gte("starts_at", rangeStart.toISOString())
          .lt("starts_at", rangeEnd.toISOString())
          .neq("status", "cancelled"),
        supabase
          .from("trainer_booking_slots")
          .select("id, starts_at, ends_at, status, service_code")
          .eq("staff_id", trainerId)
          .gte("starts_at", rangeStart.toISOString())
          .lt("starts_at", rangeEnd.toISOString())
          .order("starts_at", { ascending: true }),
      ]);

    if (bookingError) throw bookingError;
    if (slotError) throw slotError;

    const bookingBusy = (bookings || []).map((row) => ({
      start: row.starts_at,
      end: row.ends_at,
    }));

    const candidates: Array<{ starts_at: string; ends_at: string }> = [];
    const now = new Date();

    for (let dayOffset = 0; dayOffset < DAYS_TO_SHOW; dayOffset += 1) {
      const day = new Date(rangeStart);
      day.setDate(day.getDate() + dayOffset);
      day.setHours(0, 0, 0, 0);

      if (day.getDay() === 0) continue;

      for (let hour = START_HOUR; hour <= END_HOUR; hour += 1) {
        const start = new Date(day);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);

        if (start <= now) continue;
        if (overlaps(start, end, busy)) continue;
        if (overlaps(start, end, bookingBusy)) continue;

        candidates.push({
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
        });
      }
    }

    return NextResponse.json({
      trainerId,
      candidates,
      published: published || [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load trainer availability.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
