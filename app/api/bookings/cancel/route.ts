import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { deleteGoogleCalendarEvent } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = await getUserFromRequest(request);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const role = await getUserRole(auth.user.id);
    if (role !== "client") {
      return NextResponse.json({ error: "Client access is required." }, { status: 403 });
    }

    const body = (await request.json()) as { bookingId?: string };
    const bookingId = body.bookingId || "";
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();

    let { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, profile_id, email")
      .eq("profile_id", auth.user.id)
      .maybeSingle();

    if (clientError) throw clientError;

    if (!client && auth.user.email) {
      const fallback = await supabase
        .from("clients")
        .select("id, profile_id, email")
        .ilike("email", auth.user.email)
        .limit(1)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      client = fallback.data;
    }

    if (!client) {
      return NextResponse.json({ error: "Client profile not found." }, { status: 404 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, client_id, trainer_id, starts_at, status, google_event_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking || booking.client_id !== client.id) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const hoursUntil =
      (new Date(booking.starts_at).getTime() - Date.now()) / (60 * 60 * 1000);

    if (hoursUntil < 8) {
      return NextResponse.json(
        { error: "Sessions cannot be cancelled less than 8 hours before the start time." },
        { status: 409 },
      );
    }

    if (booking.status === "cancelled") {
      return NextResponse.json({ error: "This booking is already cancelled." }, { status: 409 });
    }

    const { error: cancelError } = await supabase.rpc("fxa_cancel_client_booking_v2", {
      p_booking_id: booking.id,
      p_client_id: client.id,
    });
    if (cancelError) {
      return NextResponse.json({ error: cancelError.message }, { status: 409 });
    }

    if (booking.google_event_id && booking.trainer_id) {
      try {
        await deleteGoogleCalendarEvent(booking.trainer_id, booking.google_event_id);
      } catch (googleError) {
        console.error("Booking cancelled in FXA but Google cleanup failed:", googleError);
        await supabase
          .from("bookings")
          .update({ sync_status: "cancelled_google_cleanup_failed" })
          .eq("id", booking.id);

        return NextResponse.json({
          ok: true,
          warning: "Booking was cancelled in FXA, but Google Calendar cleanup needs attention.",
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not cancel booking." },
      { status: 500 },
    );
  }
}
