import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";
import { getBusyTimes } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const role = await getUserRole(user.id);
    if (!["admin", "trainer", "nutrition_coach"].includes(role)) {
      return NextResponse.json({ error: "Staff access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      startsAt?: string;
      endsAt?: string;
      serviceCode?: string;
      staffId?: string;
    };

    const staffId = role === "admin" ? body.staffId || user.id : user.id;
    const startsAt = body.startsAt || "";
    const endsAt = body.endsAt || "";
    const serviceCode = (body.serviceCode || "pt_1on1").trim() || "pt_1on1";

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start <= new Date() ||
      end <= start
    ) {
      return NextResponse.json({ error: "Invalid slot time." }, { status: 400 });
    }

    const busy = (await getBusyTimes(
      staffId,
      start.toISOString(),
      end.toISOString(),
    )) as Array<{ start?: string; end?: string }>;

    if (busy.length > 0) {
      return NextResponse.json(
        { error: "Google Calendar is busy during this time." },
        { status: 409 },
      );
    }

    const supabase = createServiceSupabaseClient();

    const { data: conflictingBooking, error: bookingError } = await supabase
      .from("bookings")
      .select("id")
      .eq("trainer_id", staffId)
      .neq("status", "cancelled")
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString())
      .limit(1)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (conflictingBooking) {
      return NextResponse.json(
        { error: "You already have an FXA booking during this time." },
        { status: 409 },
      );
    }

    const { data, error: insertError } = await supabase
      .from("trainer_booking_slots")
      .upsert(
        {
          staff_id: staffId,
          service_code: serviceCode,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          status: "open",
          booked_by_client_id: null,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "staff_id,starts_at,ends_at" },
      )
      .select("id, staff_id, service_code, starts_at, ends_at, status")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ slot: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not publish slot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const role = await getUserRole(user.id);
    if (!["admin", "trainer", "nutrition_coach"].includes(role)) {
      return NextResponse.json({ error: "Staff access required." }, { status: 403 });
    }

    const slotId = request.nextUrl.searchParams.get("slotId");
    if (!slotId) {
      return NextResponse.json({ error: "slotId is required." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const { data: slot, error: lookupError } = await supabase
      .from("trainer_booking_slots")
      .select("id, staff_id, status")
      .eq("id", slotId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!slot) return NextResponse.json({ error: "Slot not found." }, { status: 404 });
    if (role !== "admin" && slot.staff_id !== user.id) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }
    if (slot.status === "booked") {
      return NextResponse.json(
        { error: "Booked slots cannot be closed from availability." },
        { status: 409 },
      );
    }

    const { error: updateError } = await supabase
      .from("trainer_booking_slots")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", slotId);

    if (updateError) throw updateError;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not close slot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
