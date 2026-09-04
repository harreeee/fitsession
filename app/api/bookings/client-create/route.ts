import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { createGoogleCalendarEvent, getBusyTimes } from "../../../../lib/googleCalendar";
import {
  MIN_BOOKING_NOTICE_HOURS,
  SLOT_MINUTES,
  isSlotInsideWeeklyRules,
  overlaps,
  type AvailabilityRule,
  type BusyPeriod,
} from "../../../../lib/bookingAvailability";

export const runtime = "nodejs";

type PackageRow = {
  id: string;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

function remainingSessions(row: PackageRow) {
  if (row.remaining_sessions !== null && row.remaining_sessions !== undefined) {
    return Number(row.remaining_sessions);
  }
  return Math.max(Number(row.total_sessions || 0) - Number(row.used_sessions || 0), 0);
}

function packageIsUsable(row: PackageRow) {
  const now = new Date();
  if (remainingSessions(row) <= 0) return false;
  if (["inactive", "expired", "completed", "cancelled"].includes(String(row.status || "").toLowerCase())) return false;
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.expires_at && new Date(`${row.expires_at.slice(0, 10)}T23:59:59`) < now) return false;
  return true;
}

export async function POST(request: NextRequest) {
  const supabase = createServiceSupabaseClient();

  try {
    const auth = await getUserFromRequest(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: 401 });

    const role = await getUserRole(auth.user.id);
    if (role !== "client") {
      return NextResponse.json({ error: "Client access is required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      slotId?: string;
      trainerId?: string;
      startsAt?: string;
      endsAt?: string;
      notes?: string | null;
    };

    const trainerId = body.trainerId || "";
    const rawStart = body.startsAt || body.slotId || "";
    const startsAt = new Date(rawStart);
    const endsAt = body.endsAt
      ? new Date(body.endsAt)
      : new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
    const notes = (body.notes || "").trim();

    if (
      !trainerId ||
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() - startsAt.getTime() !== SLOT_MINUTES * 60 * 1000
    ) {
      return NextResponse.json({ error: "Please select a valid trainer and time." }, { status: 400 });
    }

    if (startsAt.getTime() - Date.now() < MIN_BOOKING_NOTICE_HOURS * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: `Sessions must be booked at least ${MIN_BOOKING_NOTICE_HOURS} hours in advance.` },
        { status: 409 },
      );
    }

    let { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, full_name, email, phone, profile_id")
      .eq("profile_id", auth.user.id)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client && auth.user.email) {
      const fallback = await supabase
        .from("clients")
        .select("id, full_name, email, phone, profile_id")
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
      supabase.from("profiles").select("id, role, full_name").eq("id", trainerId).eq("role", "trainer").maybeSingle(),
      supabase
        .from("session_packages")
        .select("id, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("trainer_availability_rules")
        .select("id, weekday, start_time, end_time, is_active")
        .eq("trainer_id", trainerId)
        .eq("is_active", true),
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
    if (!connectionResult.data) {
      return NextResponse.json({ error: "This trainer has not connected Google Calendar yet." }, { status: 409 });
    }

    const rules = (ruleResult.data || []) as AvailabilityRule[];
    if (!isSlotInsideWeeklyRules(startsAt.toISOString(), endsAt.toISOString(), rules)) {
      return NextResponse.json({ error: "This time is outside the trainer's availability." }, { status: 409 });
    }

    const activePackage = ((packageResult.data || []) as PackageRow[]).find(packageIsUsable);
    if (!activePackage) {
      return NextResponse.json({ error: "You do not have an active package with remaining sessions." }, { status: 409 });
    }

    const googleBusy = (await getBusyTimes(
      trainerId,
      startsAt.toISOString(),
      endsAt.toISOString(),
    )) as BusyPeriod[];

    if (
      googleBusy.some(
        (item) => item.start && item.end && overlaps(startsAt, endsAt, item.start, item.end),
      )
    ) {
      return NextResponse.json({ error: "This trainer is no longer available at that time." }, { status: 409 });
    }

    const [trainerConflict, clientConflict] = await Promise.all([
      supabase
        .from("bookings")
        .select("id")
        .eq("trainer_id", trainerId)
        .neq("status", "cancelled")
        .lt("starts_at", endsAt.toISOString())
        .gt("ends_at", startsAt.toISOString())
        .limit(1),
      supabase
        .from("bookings")
        .select("id")
        .eq("client_id", client.id)
        .neq("status", "cancelled")
        .lt("starts_at", endsAt.toISOString())
        .gt("ends_at", startsAt.toISOString())
        .limit(1),
    ]);

    if (trainerConflict.error) throw trainerConflict.error;
    if (clientConflict.error) throw clientConflict.error;
    if ((trainerConflict.data || []).length > 0) {
      return NextResponse.json({ error: "This trainer already has a booking during that time." }, { status: 409 });
    }
    if ((clientConflict.data || []).length > 0) {
      return NextResponse.json({ error: "You already have another booking during that time." }, { status: 409 });
    }

    const { data: bookingId, error: bookingError } = await supabase.rpc("fxa_create_booking_v2", {
      p_client_id: client.id,
      p_trainer_id: trainerId,
      p_package_id: activePackage.id,
      p_created_by: auth.user.id,
      p_client_name: client.full_name || "FXA Client",
      p_client_email: client.email || auth.user.email || "",
      p_client_phone: client.phone || "",
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt.toISOString(),
      p_notes: notes || null,
    });

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 409 });
    }

    let googleSynced = false;
    try {
      const googleEvent = await createGoogleCalendarEvent({
        trainerId,
        clientName: client.full_name || "FXA Client",
        clientEmail: client.email || auth.user.email || "",
        clientPhone: client.phone || "",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes,
      });

      if (googleEvent.eventId) {
        const { error: syncError } = await supabase.rpc("fxa_mark_booking_synced_v2", {
          p_booking_id: bookingId,
          p_google_event_id: googleEvent.eventId,
        });
        if (syncError) throw syncError;
        googleSynced = true;
      }
    } catch (googleError) {
      console.error("FXA booking saved but Google Calendar sync failed:", googleError);
      await supabase.rpc("fxa_mark_booking_google_pending_v2", { p_booking_id: bookingId });
    }

    return NextResponse.json({
      ok: true,
      bookingId,
      trainerId,
      trainerName: trainer.full_name || "Trainer",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      remainingSessions: remainingSessions(activePackage),
      googleSynced,
      warning: googleSynced ? null : "Booking confirmed. Google Calendar sync is pending.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create booking." },
      { status: 500 },
    );
  }
}
