import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { getBusyTimes } from "../../../../lib/googleCalendar";
import {
  BOOKING_TIME_ZONE,
  TRAINER_SCHEDULE_DAYS,
  buildCandidateSlots,
  overlapsAny,
  type AvailabilityRule,
  type BusyPeriod,
} from "../../../../lib/bookingAvailability";

export const runtime = "nodejs";

async function requireStaff(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth.user) {
    return { error: NextResponse.json({ error: auth.error }, { status: 401 }) };
  }

  const role = await getUserRole(auth.user.id);
  if (!["trainer", "nutrition_coach", "admin"].includes(role)) {
    return {
      error: NextResponse.json({ error: "Trainer access is required." }, { status: 403 }),
    };
  }

  return { user: auth.user };
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireStaff(request);
    if (access.error) return access.error;

    const trainerId = access.user!.id;
    const supabase = createServiceSupabaseClient();

    const [{ data: rules, error: ruleError }, { data: connection, error: connectionError }] =
      await Promise.all([
        supabase
          .from("trainer_availability_rules")
          .select("id, weekday, start_time, end_time, is_active")
          .eq("trainer_id", trainerId)
          .eq("is_active", true)
          .order("weekday")
          .order("start_time"),
        supabase
          .from("trainer_google_calendar_connections")
          .select("google_email, calendar_id, updated_at")
          .eq("trainer_id", trainerId)
          .maybeSingle(),
      ]);

    if (ruleError) throw ruleError;
    if (connectionError) throw connectionError;

    const candidateSlots = buildCandidateSlots((rules || []) as AvailabilityRule[], {
      days: TRAINER_SCHEDULE_DAYS,
      minimumNoticeHours: 0,
    });

    const rangeStart = candidateSlots[0]?.starts_at || new Date().toISOString();
    const rangeEnd = candidateSlots[candidateSlots.length - 1]?.ends_at || new Date().toISOString();

    const bookingResult = candidateSlots.length
      ? await supabase
          .from("bookings")
          .select("id, client_name, starts_at, ends_at, status, sync_status")
          .eq("trainer_id", trainerId)
          .neq("status", "cancelled")
          .gt("ends_at", rangeStart)
          .lt("starts_at", rangeEnd)
          .order("starts_at")
      : { data: [], error: null };

    if (bookingResult.error) throw bookingResult.error;

    let googleBusy: BusyPeriod[] = [];
    let googleError: string | null = null;

    if (connection && candidateSlots.length > 0) {
      try {
        googleBusy = (await getBusyTimes(trainerId, rangeStart, rangeEnd)) as BusyPeriod[];
      } catch (error) {
        googleError = error instanceof Error ? error.message : "Could not read Google Calendar.";
      }
    }

    const bookings = bookingResult.data || [];
    const slots = candidateSlots.map((slot) => {
      const booking = bookings.find((row) =>
        overlapsAny(slot.starts_at, slot.ends_at, [
          { starts_at: row.starts_at, ends_at: row.ends_at },
        ]),
      );
      const googleBusyNow = overlapsAny(slot.starts_at, slot.ends_at, googleBusy);

      return {
        ...slot,
        state: booking ? "booked" : googleBusyNow ? "google_busy" : "available",
        booking: booking || null,
      };
    });

    return NextResponse.json({
      rules: rules || [],
      connection: connection || null,
      slots,
      google_error: googleError,
      time_zone: BOOKING_TIME_ZONE,
      horizon_days: TRAINER_SCHEDULE_DAYS,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load trainer availability." },
      { status: 500 },
    );
  }
}
