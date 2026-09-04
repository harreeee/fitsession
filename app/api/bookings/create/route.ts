import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getBusyTimes,
} from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

type PackageRow = {
  id: string;
  package_name: string | null;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

function hasOverlap(
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

function remainingSessions(row: PackageRow) {
  if (row.remaining_sessions !== null && row.remaining_sessions !== undefined) {
    return Number(row.remaining_sessions);
  }
  return Math.max(Number(row.total_sessions || 0) - Number(row.used_sessions || 0), 0);
}

function packageIsUsable(row: PackageRow) {
  const now = new Date();
  const status = String(row.status || "").toLowerCase();
  if (remainingSessions(row) <= 0) return false;
  if (["inactive", "expired", "completed", "cancelled"].includes(status)) return false;

  if (row.starts_at) {
    const starts = new Date(row.starts_at);
    if (!Number.isNaN(starts.getTime()) && starts > now) return false;
  }

  if (row.expires_at) {
    const expires = new Date(row.expires_at);
    if (!Number.isNaN(expires.getTime())) {
      expires.setHours(23, 59, 59, 999);
      if (expires < now) return false;
    }
  }

  return true;
}

export async function POST(request: NextRequest) {
  const supabase = createServiceSupabaseClient();
  let claimedBookingId: string | null = null;
  let googleEventId: string | null = null;
  let trainerId: string | null = null;

  try {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const role = await getUserRole(user.id);
    if (role !== "client") {
      return NextResponse.json({ error: "Client access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      slotId?: string;
      notes?: string;
    };

    const slotId = body.slotId || "";
    const notes = (body.notes || "").trim();

    if (!slotId) {
      return NextResponse.json({ error: "Please select a booking time." }, { status: 400 });
    }

    let { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, full_name, email, phone, assigned_trainer_id, assigned_nutrition_coach_id, status, profile_id",
      )
      .eq("profile_id", user.id)
      .maybeSingle();

    if (clientError) throw clientError;

    if (!client && user.email) {
      const fallback = await supabase
        .from("clients")
        .select(
          "id, full_name, email, phone, assigned_trainer_id, assigned_nutrition_coach_id, status, profile_id",
        )
        .ilike("email", user.email)
        .limit(1)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      client = fallback.data;
    }

    if (!client) {
      return NextResponse.json(
        { error: "Your client profile is not linked correctly." },
        { status: 404 },
      );
    }

    if (!client.assigned_trainer_id) {
      return NextResponse.json(
        { error: "No trainer has been assigned to your account yet." },
        { status: 409 },
      );
    }

    trainerId = client.assigned_trainer_id;

    const { data: slot, error: slotError } = await supabase
      .from("trainer_booking_slots")
      .select("id, staff_id, service_code, starts_at, ends_at, status")
      .eq("id", slotId)
      .maybeSingle();

    if (slotError) throw slotError;
    if (!slot || slot.status !== "open") {
      return NextResponse.json(
        { error: "This time is no longer available. Please choose another slot." },
        { status: 409 },
      );
    }

    if (slot.staff_id !== trainerId) {
      return NextResponse.json(
        { error: "This slot is not from your assigned trainer." },
        { status: 403 },
      );
    }

    const startsAt = new Date(slot.starts_at);
    const endsAt = new Date(slot.ends_at);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      startsAt <= new Date() ||
      endsAt <= startsAt
    ) {
      return NextResponse.json(
        { error: "This booking time is invalid or has already started." },
        { status: 409 },
      );
    }

    const { data: packageRows, error: packageError } = await supabase
      .from("session_packages")
      .select(
        "id, package_name, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, created_at",
      )
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    if (packageError) throw packageError;

    const activePackage = ((packageRows || []) as PackageRow[]).find(packageIsUsable);

    if (!activePackage) {
      return NextResponse.json(
        { error: "You do not have an active package with remaining sessions." },
        { status: 409 },
      );
    }

    const googleBusy = (await getBusyTimes(
      trainerId,
      startsAt.toISOString(),
      endsAt.toISOString(),
    )) as Array<{ start?: string; end?: string }>;

    if (hasOverlap(startsAt, endsAt, googleBusy)) {
      return NextResponse.json(
        { error: "Your trainer is no longer available at this time." },
        { status: 409 },
      );
    }

    const { data: claimedRows, error: claimError } = await supabase.rpc(
      "fxa_claim_booking_slot_v2",
      {
        p_slot_id: slot.id,
        p_client_id: client.id,
        p_package_id: activePackage.id,
        p_created_by: user.id,
        p_client_name: client.full_name || "FXA Client",
        p_client_email: client.email || user.email || "",
        p_client_phone: client.phone || "",
        p_notes: notes || null,
      },
    );

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 409 });
    }

    const claimed = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
    claimedBookingId = claimed?.booking_id || null;

    if (!claimedBookingId) {
      throw new Error("Booking could not be reserved.");
    }

    const googleEvent = await createGoogleCalendarEvent({
      trainerId,
      clientName: client.full_name || "FXA Client",
      clientEmail: client.email || user.email || "",
      clientPhone: client.phone || "",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      notes,
    });

    googleEventId = googleEvent.eventId || null;

    if (!googleEventId) {
      throw new Error("Google Calendar did not return an event ID.");
    }

    const { error: syncError } = await supabase.rpc("fxa_mark_booking_synced_v2", {
      p_booking_id: claimedBookingId,
      p_google_event_id: googleEventId,
    });

    if (syncError) throw syncError;

    return NextResponse.json({
      ok: true,
      bookingId: claimedBookingId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      trainerId,
      googleEventId,
      remainingSessions: remainingSessions(activePackage),
    });
  } catch (error) {
    if (googleEventId && trainerId) {
      try {
        await deleteGoogleCalendarEvent(trainerId, googleEventId);
      } catch (cleanupError) {
        console.error("Booking Google event cleanup failed:", cleanupError);
      }
    }

    if (claimedBookingId) {
      await supabase.rpc("fxa_release_booking_slot_v2", {
        p_booking_id: claimedBookingId,
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to create booking.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
