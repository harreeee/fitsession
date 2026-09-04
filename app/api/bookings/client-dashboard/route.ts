import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

function hoursUntil(value: string) {
  const starts = new Date(value).getTime();
  if (!Number.isFinite(starts)) return Number.NEGATIVE_INFINITY;
  return (starts - Date.now()) / (60 * 60 * 1000);
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
      return NextResponse.json(
        { error: "Your client profile is not linked correctly." },
        { status: 404 },
      );
    }

    const [{ data: trainers, error: trainersError }, { data: bookings, error: bookingsError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("role", "trainer")
          .order("full_name", { ascending: true }),
        supabase
          .from("bookings")
          .select("id, trainer_id, starts_at, ends_at, status, notes, google_event_id, sync_status")
          .eq("client_id", client.id)
          .neq("status", "cancelled")
          .gte("ends_at", new Date().toISOString())
          .order("starts_at", { ascending: true }),
      ]);

    if (trainersError) throw trainersError;
    if (bookingsError) throw bookingsError;

    const trainerIds = Array.from(
      new Set((bookings || []).map((row) => row.trainer_id).filter(Boolean)),
    ) as string[];

    let bookingTrainerMap = new Map<string, string>();
    if (trainerIds.length > 0) {
      const { data: bookingTrainers, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", trainerIds);
      if (error) throw error;
      bookingTrainerMap = new Map(
        (bookingTrainers || []).map((row) => [row.id, row.full_name || "Trainer"]),
      );
    }

    const sortedTrainers = [...(trainers || [])].sort((a, b) => {
      if (a.id === client?.assigned_trainer_id) return -1;
      if (b.id === client?.assigned_trainer_id) return 1;
      return String(a.full_name || "").localeCompare(String(b.full_name || ""));
    });

    return NextResponse.json({
      client: {
        id: client.id,
        full_name: client.full_name,
        assigned_trainer_id: client.assigned_trainer_id,
      },
      trainers: sortedTrainers.map((trainer) => ({
        ...trainer,
        is_primary: trainer.id === client?.assigned_trainer_id,
      })),
      upcoming_bookings: (bookings || []).map((booking) => ({
        ...booking,
        trainer_name: booking.trainer_id
          ? bookingTrainerMap.get(booking.trainer_id) || "Trainer"
          : "Trainer",
        can_cancel: hoursUntil(booking.starts_at) >= 8,
        hours_until: hoursUntil(booking.starts_at),
      })),
      cancellation_cutoff_hours: 8,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load booking dashboard." },
      { status: 500 },
    );
  }
}
