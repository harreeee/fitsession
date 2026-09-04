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

  const now = new Date();
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.expires_at) {
    const expiry = new Date(row.expires_at);
    expiry.setHours(23, 59, 59, 999);
    if (expiry < now) return false;
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
      return NextResponse.json({ error: "Client access is required." }, { status: 403 });
    }

    const trainerId = request.nextUrl.searchParams.get("trainerId") || "";
    if (!trainerId) {
      return NextResponse.json({ error: "Please select a trainer." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();

    let { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, full_name, email, phone, profile_id, assigned_trainer_id")
      .eq("profile_id", auth.user.id)
      .maybeSingle();

    if (clientError) throw clientError;

    if (!client && auth.user.email) {
      const fallback = await supabase
        .from("clients")
        .select("id, full_name, email, phone, profile_id, assigned_trainer_id")
        .ilike("email", auth.user.email)
        .limit(1)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      client = fallback.data;
    }

    if (!client) {
      return NextResponse.json({ error: "Your client profile is not linked correctly." }, { status: 404 });
    }

    const [{ data: trainer, error: trainerError }, { data: packages, error: packageError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("id", trainerId)
          .eq("role", "trainer")
          .maybeSingle(),
        supabase
          .from("session_packages")
          .select("id, package_name, total_sessions, used_sessions, remaining_sessions, starts_at, expires_at, status, created_at")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false }),
      ]);

    if (trainerError) throw trainerError;
    if (packageError) throw packageError;
    if (!trainer) {
      return NextResponse.json({ error: "Selected trainer was not found." }, { status: 404 });
    }

    const activePackage = ((packages || []) as PackageRow[]).find(isPackageUsable) || null;
    if (!activePackage) {
      return NextResponse.json({
        trainer,
        package: null,
        slots: [],
        message: "You do not have an active package with remaining sessions.",
      });
    }

    const now = new Date();
    const rangeEnd = new Date(now.getTime() + DAYS_TO_SHOW * 24 * 60 * 60 * 1000);

    const { data: connection, error: connectionError } = await supabase
      .from("trainer_google_calendar_connections")
      .select("trainer_id")
      .eq("trainer_id", trainerId)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) {
      return NextResponse.json({
        trainer,
        package: { ...activePackage, remaining_sessions: packageRemaining(activePackage) },
        slots: [],
        message: "This trainer has not connected Google Calendar yet.",
      });
    }

    const { data: slotRows, error: slotsError } = await supabase
      .from("trainer_booking_slots")
      .select("id, staff_id, starts_at, ends_at, service_code, status")
      .eq("staff_id", trainerId)
      .eq("status", "open")
      .gt("starts_at", now.toISOString())
      .lt("starts_at", rangeEnd.toISOString())
      .order("starts_at");

    if (slotsError) throw slotsError;

    const openSlots = slotRows || [];
    if (openSlots.length === 0) {
      return NextResponse.json({
        trainer,
        package: { ...activePackage, remaining_sessions: packageRemaining(activePackage) },
        slots: [],
        message: "This trainer has not opened any booking times yet.",
      });
    }

    const timeMin = openSlots[0].starts_at;
    const timeMax = openSlots.reduce(
      (latest, slot) => (new Date(slot.ends_at) > new Date(latest) ? slot.ends_at : latest),
      openSlots[0].ends_at,
    );

    const [busy, bookingResult] = await Promise.all([
      getBusyTimes(trainerId, timeMin, timeMax) as Promise<BusyPeriod[]>,
      supabase
        .from("bookings")
        .select("id, trainer_id, client_id, starts_at, ends_at, status")
        .or(`trainer_id.eq.${trainerId},client_id.eq.${client.id}`)
        .neq("status", "cancelled")
        .gt("ends_at", timeMin)
        .lt("starts_at", timeMax),
    ]);

    if (bookingResult.error) throw bookingResult.error;

    const slots = openSlots.filter((slot) => {
      const googleBusy = busy.some(
        (period) =>
          period.start &&
          period.end &&
          overlaps(slot.starts_at, slot.ends_at, period.start, period.end),
      );
      if (googleBusy) return false;

      return !(bookingResult.data || []).some((booking) =>
        overlaps(slot.starts_at, slot.ends_at, booking.starts_at, booking.ends_at),
      );
    });

    return NextResponse.json({
      trainer,
      is_primary_trainer: trainer.id === client.assigned_trainer_id,
      package: { ...activePackage, remaining_sessions: packageRemaining(activePackage) },
      slots,
      message: slots.length === 0 ? "No available times are currently open for this trainer." : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load booking availability." },
      { status: 500 },
    );
  }
}
