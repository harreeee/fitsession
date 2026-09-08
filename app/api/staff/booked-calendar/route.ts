import { addDays, businessDate, torontoInstant } from "@/lib/businessTime";
import { requireStaffFeature, staffAccessFail } from "@/lib/staffAccessServer";

function getTorontoWeekRange() {
  const today = businessDate();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = addDays(today, -daysSinceMonday);
  const nextMonday = addDays(monday, 7);
  const startsAt = torontoInstant(monday, 0);
  const endsAt = torontoInstant(nextMonday, 0);

  if (!startsAt || !endsAt) {
    throw new Error("Could not resolve Toronto week boundaries.");
  }

  return {
    weekStart: monday,
    weekEnd: nextMonday,
    startsAt,
    endsAt,
  };
}

export async function GET(request: Request) {
  try {
    const { admin } = await requireStaffFeature(request, "booked_calendar");
    const range = getTorontoWeekRange();

    const { data, error } = await admin
      .from("bookings")
      .select("id, client_name, trainer_id, starts_at, ends_at, status, google_sync_status")
      .eq("status", "booked")
      .gte("starts_at", range.startsAt)
      .lt("starts_at", range.endsAt)
      .order("starts_at")
      .limit(500);

    if (error) throw error;

    const trainerIds = Array.from(
      new Set((data || []).map((booking) => booking.trainer_id).filter(Boolean)),
    );
    const { data: staff, error: staffError } = trainerIds.length
      ? await admin.from("profiles").select("id, full_name").in("id", trainerIds)
      : { data: [], error: null };

    if (staffError) throw staffError;

    const trainerNames = new Map(
      (staff || []).map((person) => [person.id, person.full_name]),
    );

    return Response.json(
      {
        weekStart: range.weekStart,
        weekEnd: range.weekEnd,
        bookings: (data || []).map((booking) => ({
          ...booking,
          trainer_name: trainerNames.get(booking.trainer_id) || "Trainer",
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return staffAccessFail(error);
  }
}
