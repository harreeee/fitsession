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
  if (["inactive", "expired", "completed", "cancelled"].includes(String(row.status || "").toLowerCase())) {
    return false;
  }
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.expires_at) {
    const expires = new Date(row.expires_at);
    expires.setHours(23, 59, 59, 999);
    if (expires < now) return false;
  }
  return true;
}

function overlaps(
  start: Date,
  end: Date,
  busy: Array<{ start?: string; end?: string }>,
) {
  return busy.some((item) => {
    if (!item.start || !item.end) return false;
    return start < new Date(item.end) && end > new Date(item.start);
  });
}

export async function POST(request: NextRequest) {
  const supabase = createServiceSupabaseClient();
  let claimedBookingId: string | null = null;
  let googleEventId: string | null = null;
  let trainerId: string | null = null;

  try {
    const auth = await getUserFromRequest(request);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const role = await getUserRole(auth.user.id);
    if (role !== "client") {
      return NextResponse.json({ error: "Client access is required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      slotId?: string;
      trainerId?: string;
      notes?: string | null;
    };

    const slotId = body.slotId || "";
    trainerId = body.trainerId || null;
    const notes = (body.notes || "").trim();

    if (!slotId || !trainerId) {
      return NextResponse.json({ error: "Please select a trainer and booking time." }, { status: 400 });
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

    const { data: trainer, error: trainerError } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", trainerId)
      .eq("role", "trainer")
      .maybeSingle();

    if (trainerError) throw trainerError;
    if (!trainer) {
      return NextResponse.json({ error: "Selected trainer was not found." }, { status: 404 });
    }

    const { data: slot, error: slotError } = await supabase
      .from("trainer_booking_slots")
      .select("id, staff_id, service_code, starts_at, ends_at, status")
      .eq("id", slotId)
      .maybeSingle();

    if (slotError) throw slotError;
    if (!slot || slot.status !== "open" || slot.staff_id !== trainerId) {
      return NextResponse.json(
        { error: "This time is no longer available for the selected trainer." },
        { status: 409 },
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
      return NextResponse.json({ error: "This booking time is invalid." }, { status: 409 });
    }

    const { data: packageRows, error: packageError } = await supabase
      .from("session_packages")
      .select("id, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, created_at")
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

    if (overlaps(startsAt, endsAt, googleBusy)) {
      return NextResponse.json(
        { error: "This trainer is no longer available at that time." },
        { status: 409 },
      );
    }

    const { data: claimedRows, error: claimError } = await supabase.rpc(
      "fxa_claim_booking_slot_v2",
      {
        p_slot_id: slot.id,
        p_client_id: client.id,
        p_package_id: activePackage.id,
        p_created_by: auth.user.id,
        p_client_name: client.full_name || "FXA Client",
        p_client_email: client.email || auth.user.email || "",
        p_client_phone: client.phone || "",
        p_notes: notes || null,
      },
    );

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 409 });
    }

    const claimed = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
    claimedBookingId = claimed?.booking_id || null;
    if (!claimedBookingId) throw new Error("Booking could not be reserved.");

    const googleEvent = await createGoogleCalendarEvent({
      trainerId,
      clientName: client.full_name || "FXA Client",
      clientEmail: client.email || auth.user.email || "",
      clientPhone: client.phone || "",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      notes,
    });

    googleEventId = googleEvent.eventId || null;
    if (!googleEventId) throw new Error("Google Calendar did not return an event ID.");

    const { error: syncError } = await supabase.rpc("fxa_mark_booking_synced_v2", {
      p_booking_id: claimedBookingId,
      p_google_event_id: googleEventId,
    });
    if (syncError) throw syncError;

    return NextResponse.json({
      ok: true,
      bookingId: claimedBookingId,
      trainerId,
      trainerName: trainer.full_name || "Trainer",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      remainingSessions: remainingSessions(activePackage),
    });
  } catch (error) {
    if (googleEventId && trainerId) {
      try {
        await deleteGoogleCalendarEvent(trainerId, googleEventId);
      } catch (cleanupError) {
        console.error("Booking Google cleanup failed:", cleanupError);
      }
    }

    if (claimedBookingId) {
      await supabase.rpc("fxa_release_booking_slot_v2", {
        p_booking_id: claimedBookingId,
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create booking." },
      { status: 500 },
    );
  }
}
