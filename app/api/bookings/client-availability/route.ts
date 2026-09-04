import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { getBusyTimes } from "../../../../lib/googleCalendar";
import {
  BOOKING_HORIZON_DAYS,
  MIN_BOOKING_NOTICE_HOURS,
  buildCandidateSlots,
  overlapsAny,
  type AvailabilityRule,
  type BusyPeriod,
} from "../../../../lib/bookingAvailability";

export const runtime = "nodejs";

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
  if (row.expires_at && new Date(`${row.expires_at.slice(0, 10)}T23:59:59`) < now) return false;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getUserFromRequest(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: 401 });

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

    const [trainerResult, packageResult, ruleResult, connectionResult] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role").eq("id", trainerId).eq("role", "trainer").maybeSingle(),
      supabase
        .from("session_packages")
        .select("id, package_name, total_sessions, used_sessions, remaining_sessions, starts_at, expires_at, status, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("trainer_availability_rules")
        .select("id, weekday, start_time, end_time, is_active")
        .eq("trainer_id", trainerId)
        .eq("is_active", true)
        .order("weekday")
        .order("start_time"),
      supabase
        .from("trainer_google_calendar_connections")
        .select("trainer_id")
        .eq("trainer_id", trainerId)
        .maybeSingle(),
    ]);

    if (trainerResult.error) throw trainerResult.error;
    if (packageResult.error) throw packageResult.error;
    if (ruleResult.error) throw ruleResult.error;
    if (connectionResult.error) throw connectionResult.error;

    const trainer = trainerResult.data;
    if (!trainer) return NextResponse.json({ error: "Selected trainer was not found." }, { status: 404 });

    const activePackage = ((packageResult.data || []) as PackageRow[]).find(isPackageUsable) || null;
    if (!activePackage) {
      return NextResponse.json({ trainer, package: null, slots: [], message: "You do not have an active package with remaining sessions." });
    }

    const rules = (ruleResult.data || []) as AvailabilityRule[];
    if (rules.length === 0) {
      return NextResponse.json({
        trainer,
        is_primary_trainer: trainer.id === client.assigned_trainer_id,
        package: { ...activePackage, remaining_sessions: packageRemaining(activePackage) },
        slots: [],
        message: "This trainer has not set weekly availability yet.",
      });
    }

    if (!connectionResult.data) {
      return NextResponse.json({
        trainer,
        is_primary_trainer: trainer.id === client.assigned_trainer_id,
        package: { ...activePackage, remaining_sessions: packageRemaining(activePackage) },
        slots: [],
        message: "This trainer has not connected Google Calendar yet.",
      });
    }

    const candidates = buildCandidateSlots(rules, {
      days: BOOKING_HORIZON_DAYS,
      minimumNoticeHours: MIN_BOOKING_NOTICE_HOURS,
    });

    if (candidates.length === 0) {
      return NextResponse.json({
        trainer,
        is_primary_trainer: trainer.id === client.assigned_trainer_id,
        package: { ...activePackage, remaining_sessions: packageRemaining(activePackage) },
        slots: [],
        message: "No available times are currently open for this trainer.",
      });
    }

    const timeMin = candidates[0].starts_at;
    const timeMax = candidates[candidates.length - 1].ends_at;
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

    const slots = candidates
      .filter((slot) => !overlapsAny(slot.starts_at, slot.ends_at, busy))
      .filter((slot) => !overlapsAny(slot.starts_at, slot.ends_at, bookingResult.data || []))
      .map((slot) => ({
        id: slot.starts_at,
        staff_id: trainerId,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        service_code: "pt_1on1",
        status: "open",
      }));

    return NextResponse.json({
      trainer,
      is_primary_trainer: trainer.id === client.assigned_trainer_id,
      package: { ...activePackage, remaining_sessions: packageRemaining(activePackage) },
      slots,
      minimum_booking_notice_hours: MIN_BOOKING_NOTICE_HOURS,
      message: slots.length === 0 ? "No available times are currently open for this trainer." : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load booking availability." },
      { status: 500 },
    );
  }
}
