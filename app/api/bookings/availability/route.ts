import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { getBusyTimes } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

const DAYS_TO_SHOW = 14;
const TIME_ZONE = "America/Toronto";

type BusyPeriod = { start?: string; end?: string };
type BookingSlot = {
  id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  service_code: string | null;
  status: string;
};
type PackageRow = {
  id: string;
  package_name: string | null;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  starts_at: string | null;
  expires_at: string | null;
  status: string | null;
  created_at: string | null;
};

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

function packageRemaining(row: PackageRow) {
  if (row.remaining_sessions !== null && row.remaining_sessions !== undefined) {
    return Number(row.remaining_sessions);
  }
  return Math.max(Number(row.total_sessions || 0) - Number(row.used_sessions || 0), 0);
}

function isPackageUsable(row: PackageRow) {
  if (packageRemaining(row) <= 0) return false;
  if (["inactive", "cancelled", "expired", "completed"].includes(String(row.status || "").toLowerCase())) {
    return false;
  }

  if (row.starts_at && new Date(row.starts_at) > new Date()) return false;
  if (row.expires_at) {
    const expiry = new Date(row.expires_at);
    expiry.setHours(23, 59, 59, 999);
    if (expiry < new Date()) return false;
  }

  return true;
}

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

function slotLabel(value: Date) {
  return value.toLocaleTimeString("en-CA", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getUserFromRequest(request);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const role = await getUserRole(auth.user.id);
    if (role !== "client") {
      return NextResponse.json(
        { error: "Client access is required to load booking availability." },
        { status: 403 },
      );
    }

    const supabase = createServiceSupabaseClient();

    let { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, full_name, email, phone, profile_id, assigned_trainer_id, assigned_nutrition_coach_id",
      )
      .eq("profile_id", auth.user.id)
      .maybeSingle();

    if (clientError) throw clientError;

    if (!client && auth.user.email) {
      const fallback = await supabase
        .from("clients")
        .select(
          "id, full_name, email, phone, profile_id, assigned_trainer_id, assigned_nutrition_coach_id",
        )
        .ilike("email", auth.user.email)
        .limit(1)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      client = fallback.data;
    }

    if (!client) {
      return NextResponse.json(
        { error: "Your client profile is not linked correctly. Please contact FXA." },
        { status: 404 },
      );
    }

    if (!client.assigned_trainer_id) {
      return NextResponse.json({
        availability: [],
        slots: [],
        client,
        trainer: null,
        package: null,
        message: "No trainer is assigned to your profile yet.",
      });
    }

    const [{ data: trainer, error: trainerError }, { data: packageRows, error: packageError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("id", client.assigned_trainer_id)
          .maybeSingle(),
        supabase
          .from("session_packages")
          .select(
            "id, package_name, total_sessions, used_sessions, remaining_sessions, starts_at, expires_at, status, created_at",
          )
          .eq("client_id", client.id)
          .order("created_at", { ascending: false }),
      ]);

    if (trainerError) throw trainerError;
    if (packageError) throw packageError;

    const activePackage = ((packageRows || []) as PackageRow[]).find(isPackageUsable) || null;

    if (!activePackage) {
      return NextResponse.json({
        availability: [],
        slots: [],
        client,
        trainer,
        package: null,
        message: "You do not have an active package with remaining sessions.",
      });
    }

    const now = new Date();
    const rangeEnd = new Date(now.getTime() + DAYS_TO_SHOW * 24 * 60 * 60 * 1000);

    const { data: connection, error: connectionError } = await supabase
      .from("trainer_google_calendar_connections")
      .select("trainer_id, google_email, calendar_id")
      .eq("trainer_id", client.assigned_trainer_id)
      .maybeSingle();

    if (connectionError) throw connectionError;

    if (!connection) {
      return NextResponse.json({
        availability: [],
        slots: [],
        client,
        trainer,
        package: {
          ...activePackage,
          remaining_sessions: packageRemaining(activePackage),
        },
        message: "Your trainer has not connected Google Calendar yet.",
      });
    }

    const { data: slotRows, error: slotsError } = await supabase
      .from("trainer_booking_slots")
      .select("id, staff_id, starts_at, ends_at, service_code, status")
      .eq("staff_id", client.assigned_trainer_id)
      .eq("status", "open")
      .gt("starts_at", now.toISOString())
      .lt("starts_at", rangeEnd.toISOString())
      .order("starts_at");

    if (slotsError) throw slotsError;

    const openSlots = (slotRows || []) as BookingSlot[];
    if (openSlots.length === 0) {
      return NextResponse.json({
        availability: [],
        slots: [],
        client,
        trainer,
        package: {
          ...activePackage,
          remaining_sessions: packageRemaining(activePackage),
        },
        message: "Your trainer has not opened any booking times yet.",
      });
    }

    const timeMin = openSlots[0].starts_at;
    const timeMax = openSlots.reduce(
      (latest, slot) => (new Date(slot.ends_at) > new Date(latest) ? slot.ends_at : latest),
      openSlots[0].ends_at,
    );

    const busy = (await getBusyTimes(
      client.assigned_trainer_id,
      timeMin,
      timeMax,
    )) as BusyPeriod[];

    const { data: existingBookings, error: bookingError } = await supabase
      .from("bookings")
      .select("id, trainer_id, client_id, starts_at, ends_at, status")
      .or(`trainer_id.eq.${client.assigned_trainer_id},client_id.eq.${client.id}`)
      .neq("status", "cancelled")
      .gt("ends_at", timeMin)
      .lt("starts_at", timeMax);

    if (bookingError) throw bookingError;

    const visibleSlots = openSlots.filter((slot) => {
      const googleBusy = busy.some(
        (period) =>
          period.start &&
          period.end &&
          overlaps(slot.starts_at, slot.ends_at, period.start, period.end),
      );
      if (googleBusy) return false;

      return !(existingBookings || []).some((booking) =>
        overlaps(slot.starts_at, slot.ends_at, booking.starts_at, booking.ends_at),
      );
    });

    return NextResponse.json({
      availability: visibleSlots,
      slots: visibleSlots,
      client: {
        id: client.id,
        full_name: client.full_name,
      },
      trainer: trainer || null,
      package: {
        ...activePackage,
        remaining_sessions: packageRemaining(activePackage),
      },
      time_zone: TIME_ZONE,
      message: visibleSlots.length === 0 ? "No available times are currently open." : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load booking availability." },
      { status: 500 },
    );
  }
}

// Compatibility path for the existing Admin manual-booking page. Clients cannot
// call this endpoint to browse arbitrary trainers.
export async function POST(request: NextRequest) {
  try {
    const auth = await getUserFromRequest(request);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const role = await getUserRole(auth.user.id);
    if (role !== "admin") {
      return NextResponse.json(
        { error: "Admin access is required for manual trainer availability." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      trainerId?: string;
      date?: string;
      durationMinutes?: number;
    };

    const trainerId = body.trainerId || "";
    const dateKey = body.date || "";
    const durationMinutes = Number(body.durationMinutes || 60);

    if (!trainerId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json(
        { error: "Trainer and date are required." },
        { status: 400 },
      );
    }

    if (durationMinutes !== 60) {
      return NextResponse.json(
        { error: "Booking V2 currently supports 60-minute sessions." },
        { status: 400 },
      );
    }

    const supabase = createServiceSupabaseClient();
    const { data: trainer, error: trainerError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", trainerId)
      .maybeSingle();

    if (trainerError) throw trainerError;
    if (!trainer || !["trainer", "nutrition_coach", "admin"].includes(String(trainer.role))) {
      return NextResponse.json({ error: "Selected trainer was not found." }, { status: 404 });
    }

    const rangeStart = zonedLocalToUtc(dateKey, 7, 0);
    const rangeEnd = zonedLocalToUtc(dateKey, 22, 0);

    const [busy, bookingResult] = await Promise.all([
      getBusyTimes(trainerId, rangeStart.toISOString(), rangeEnd.toISOString()) as Promise<BusyPeriod[]>,
      supabase
        .from("bookings")
        .select("id, starts_at, ends_at, status")
        .eq("trainer_id", trainerId)
        .neq("status", "cancelled")
        .gt("ends_at", rangeStart.toISOString())
        .lt("starts_at", rangeEnd.toISOString()),
    ]);

    if (bookingResult.error) throw bookingResult.error;

    const now = new Date();
    const slots: Array<{ label: string; startsAt: string; endsAt: string }> = [];

    for (let hour = 7; hour <= 20; hour += 1) {
      const start = zonedLocalToUtc(dateKey, hour, 0);
      const end = new Date(start.getTime() + durationMinutes * 60_000);
      if (start <= now) continue;

      const googleBusy = busy.some(
        (period) =>
          period.start &&
          period.end &&
          overlaps(start.toISOString(), end.toISOString(), period.start, period.end),
      );
      if (googleBusy) continue;

      const fxaBusy = (bookingResult.data || []).some((booking) =>
        overlaps(start.toISOString(), end.toISOString(), booking.starts_at, booking.ends_at),
      );
      if (fxaBusy) continue;

      slots.push({
        label: slotLabel(start),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
    }

    return NextResponse.json({ slots, time_zone: TIME_ZONE });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load manual booking availability." },
      { status: 500 },
    );
  }
}
