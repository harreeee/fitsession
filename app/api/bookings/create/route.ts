import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
} from "../../../../lib/supabaseServer";
import { createGoogleCalendarEvent } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const body = (await request.json()) as {
      trainerId?: string;
      clientName?: string;
      clientEmail?: string;
      clientPhone?: string;
      startsAt?: string;
      endsAt?: string;
      notes?: string;
    };

    const trainerId = body.trainerId || "";
    const clientName = (body.clientName || "").trim();
    const clientEmail = (body.clientEmail || "").trim();
    const clientPhone = (body.clientPhone || "").trim();
    const startsAt = body.startsAt || "";
    const endsAt = body.endsAt || "";
    const notes = (body.notes || "").trim();

    if (!trainerId || !clientName || !startsAt || !endsAt) {
      return NextResponse.json(
        { error: "Missing required booking information." },
        { status: 400 }
      );
    }

    const startsAtDate = new Date(startsAt);
    const endsAtDate = new Date(endsAt);

    if (
      Number.isNaN(startsAtDate.getTime()) ||
      Number.isNaN(endsAtDate.getTime()) ||
      endsAtDate <= startsAtDate
    ) {
      return NextResponse.json(
        { error: "Invalid booking time." },
        { status: 400 }
      );
    }

    const googleEvent = await createGoogleCalendarEvent({
      trainerId,
      clientName,
      clientEmail,
      clientPhone,
      startsAt,
      endsAt,
      notes,
    });

    const supabase = createServiceSupabaseClient();

    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .ilike("email", clientEmail)
      .limit(1)
      .maybeSingle();

    const { error: bookingError } = await supabase.from("bookings").insert({
      client_id: existingClient?.id || null,
      trainer_id: trainerId,
      client_name: clientName,
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "booked",
      google_event_id: googleEvent.eventId || null,
      notes: notes || null,
      created_by: user.id,
    });

    if (bookingError) {
      throw bookingError;
    }

    return NextResponse.json({
      ok: true,
      googleEventId: googleEvent.eventId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create booking.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}