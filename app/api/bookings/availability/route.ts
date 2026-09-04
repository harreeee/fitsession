import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { getBusyTimes } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

const DAYS_TO_SHOW = 14;

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
  if (["inactive", "cancelled", "expired"].includes(String(row.status || "").toLowerCase())) {
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
      time_zone: "America/Toronto",
      message: visibleSlots.length === 0 ? "No available times are currently open." : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load booking availability." },
      { status: 500 },
    );
  }
}
