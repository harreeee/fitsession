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

type BookingBody = {
  slotId?: string;
  notes?: string | null;
  trainerId?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  startsAt?: string;
  endsAt?: string;
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

async function createAdminManualBooking(
  userId: string,
  body: BookingBody,
) {
  const supabase = createServiceSupabaseClient();
  const trainerId = body.trainerId || "";
  const clientName = (body.clientName || "").trim();
  const clientEmail = (body.clientEmail || "").trim();
  const clientPhone = (body.clientPhone || "").trim();
  const notes = (body.notes || "").trim();
  const startsAt = new Date(body.startsAt || "");
  const endsAt = new Date(body.endsAt || "");

  if (!trainerId || !clientName) {
    return NextResponse.json(
      { error: "Trainer and client name are required." },
      { status: 400 },
    );
  }

  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    startsAt <= new Date() ||
    endsAt <= startsAt ||
    endsAt.getTime() - startsAt.getTime() !== 60 * 60_000
  ) {
    return NextResponse.json(
      { error: "Choose a valid future 60-minute booking time." },
      { status: 400 },
    );
  }

  const { data: trainer, error: trainerError } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", trainerId)
    .maybeSingle();

  if (trainerError) throw trainerError;
  if (!trainer || !["trainer", "nutrition_coach", "admin"].includes(String(trainer.role))) {
    return NextResponse.json({ error: "Selected trainer was not found." }, { status: 404 });
  }

  const googleBusy = (await getBusyTimes(
    trainerId,
    startsAt.toISOString(),
    endsAt.toISOString(),
  )) as Array<{ start?: string; end?: string }>;

  if (hasOverlap(startsAt, endsAt, googleBusy)) {
    return NextResponse.json(
      { error: "Google Calendar is busy during this time." },
      { status: 409 },
    );
  }

  const { data: trainerConflict, error: trainerConflictError } = await supabase
    .from("bookings")
    .select("id")
    .eq("trainer_id", trainerId)
    .neq("status", "cancelled")
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1)
    .maybeSingle();

  if (trainerConflictError) throw trainerConflictError;
  if (trainerConflict) {
    return NextResponse.json(
      { error: "This trainer already has an FXA booking during this time." },
      { status: 409 },
    );
  }

  let existingClient: { id: string } | null = null;
  if (clientEmail) {
    const clientLookup = await supabase
      .from("clients")
      .select("id")
      .ilike("email", clientEmail)
      .limit(1)
      .maybeSingle();
    if (clientLookup.error) throw clientLookup.error;
    existingClient = clientLookup.data;
  }

  if (existingClient) {
    const { data: clientConflict, error: clientConflictError } = await supabase
      .from("bookings")
      .select("id")
      .eq("client_id", existingClient.id)
      .neq("status", "cancelled")
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString())
      .limit(1)
      .maybeSingle();

    if (clientConflictError) throw clientConflictError;
    if (clientConflict) {
      return NextResponse.json(
        { error: "This client already has another booking during this time." },
        { status: 409 },
      );
    }
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      client_id: existingClient?.id || null,
      trainer_id: trainerId,
      client_name: clientName,
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "booked",
      google_event_id: null,
      notes: notes || null,
      created_by: userId,
      availability_slot_id: null,
      package_id: null,
      service_code: "pt_1on1",
      sync_status: "pending",
    })
    .select("id")
    .single();

  if (bookingError) throw bookingError;

  let googleEventId = "";
  try {
    const googleEvent = await createGoogleCalendarEvent({
      trainerId,
      clientName,
      clientEmail,
      clientPhone,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      notes,
    });

    googleEventId = googleEvent.eventId || "";
    if (!googleEventId) {
      throw new Error("Google Calendar did not return an event ID.");
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        google_event_id: googleEventId,
        sync_status: "synced",
      })
      .eq("id", booking.id);

    if (updateError) throw updateError;
  } catch (error) {
    if (googleEventId) {
      try {
        await deleteGoogleCalendarEvent(trainerId, googleEventId);
      } catch (cleanupError) {
        console.error("Admin booking Google cleanup failed:", cleanupError);
      }
    }

    await supabase.from("bookings").delete().eq("id", booking.id);
    throw error;
  }

  return NextResponse.json({
    ok: true,
    bookingId: booking.id,
    trainerId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    googleEventId,
  });
}

async function createClientPublishedSlotBooking(
  user: { id: string; email?: string | null },
  body: BookingBody,
) {
  const supabase = createServiceSupabaseClient();
  let claimedBookingId: string | null = null;
  let googleEventId: string | null = null;
  let trainerId: string | null = null;

  try {
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

    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const role = await getUserRole(user.id);
    const body = (await request.json()) as BookingBody;

    if (role === "admin") {
      return await createAdminManualBooking(user.id, body);
    }

    if (role === "client") {
      return await createClientPublishedSlotBooking(user, body);
    }

    return NextResponse.json(
      { error: "Only Admin or Client can create bookings from this endpoint." },
      { status: 403 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create booking.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
