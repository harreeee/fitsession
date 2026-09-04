import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { getBusyTimes } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

function overlapsBusy(
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

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const role = await getUserRole(user.id);
    if (role !== "client") {
      return NextResponse.json({ error: "Client access required." }, { status: 403 });
    }

    const supabase = createServiceSupabaseClient();

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, full_name, email, phone, assigned_trainer_id, status")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return NextResponse.json(
        { error: "Your client profile is not linked correctly." },
        { status: 404 },
      );
    }

    if (!client.assigned_trainer_id) {
      return NextResponse.json({
        client: { id: client.id, full_name: client.full_name },
        trainer: null,
        package: null,
        slots: [],
        message: "No trainer has been assigned to your account yet.",
      });
    }

    const { data: trainer, error: trainerError } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", client.assigned_trainer_id)
      .maybeSingle();

    if (trainerError) throw trainerError;
    if (!trainer) {
      return NextResponse.json(
        { error: "Assigned trainer could not be found." },
        { status: 404 },
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

    const now = new Date();
    const activePackage = (packageRows || []).find((row) => {
      const remaining = Number(row.remaining_sessions ?? 0);
      const status = String(row.status || "").toLowerCase();
      const startsAt = row.starts_at ? new Date(row.starts_at) : null;
      const expiresAt = row.expires_at ? new Date(row.expires_at) : null;

      return (
        remaining > 0 &&
        !["inactive", "expired", "completed", "cancelled"].includes(status) &&
        (!startsAt || Number.isNaN(startsAt.getTime()) || startsAt <= now) &&
        (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt >= now)
      );
    });

    if (!activePackage) {
      return NextResponse.json({
        client: { id: client.id, full_name: client.full_name },
        trainer,
        package: null,
        slots: [],
        message: "You do not have an active package with remaining sessions.",
      });
    }

    const rangeStart = new Date();
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 15);

    const [{ data: slots, error: slotError }, { data: bookings, error: bookingError }] =
      await Promise.all([
        supabase
          .from("trainer_booking_slots")
          .select("id, staff_id, service_code, starts_at, ends_at, status")
          .eq("staff_id", client.assigned_trainer_id)
          .eq("status", "open")
          .gte("starts_at", rangeStart.toISOString())
          .lt("starts_at", rangeEnd.toISOString())
          .order("starts_at", { ascending: true }),
        supabase
          .from("bookings")
          .select("id, starts_at, ends_at, status")
          .eq("trainer_id", client.assigned_trainer_id)
          .neq("status", "cancelled")
          .gte("starts_at", rangeStart.toISOString())
          .lt("starts_at", rangeEnd.toISOString()),
      ]);

    if (slotError) throw slotError;
    if (bookingError) throw bookingError;

    let googleBusy: Array<{ start?: string; end?: string }> = [];
    try {
      googleBusy = (await getBusyTimes(
        client.assigned_trainer_id,
        rangeStart.toISOString(),
        rangeEnd.toISOString(),
      )) as Array<{ start?: string; end?: string }>;
    } catch {
      // If Google is temporarily unavailable, do not expose slots as bookable.
      return NextResponse.json({
        client: { id: client.id, full_name: client.full_name },
        trainer,
        package: activePackage,
        slots: [],
        message: "Trainer calendar is temporarily unavailable. Please try again shortly.",
      });
    }

    const bookingBusy = (bookings || []).map((booking) => ({
      start: booking.starts_at,
      end: booking.ends_at,
    }));

    const safeSlots = (slots || []).filter((slot) => {
      const start = new Date(slot.starts_at);
      const end = new Date(slot.ends_at);
      return (
        start > now &&
        !overlapsBusy(start, end, googleBusy) &&
        !overlapsBusy(start, end, bookingBusy)
      );
    });

    return NextResponse.json({
      client: {
        id: client.id,
        full_name: client.full_name,
      },
      trainer,
      package: activePackage,
      slots: safeSlots,
      message: safeSlots.length ? null : "No published times are available right now.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load booking times.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
