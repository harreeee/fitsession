import { requireStaffFeature, staffAccessFail } from "@/lib/staffAccessServer";

function getTorontoWeekRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  const weekday = value("weekday");
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const noon = new Date(`${date}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() - Math.max(index, 0));
  const monday = noon.toISOString().slice(0, 10);
  noon.setUTCDate(noon.getUTCDate() + 7);
  const nextMonday = noon.toISOString().slice(0, 10);

  // Offsets are intentionally resolved by the runtime for the current Toronto week.
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(`${monday}T12:00:00Z`))
    .find((part) => part.type === "timeZoneName")?.value.replace("GMT", "") || "-04:00";

  return {
    weekStart: monday,
    weekEnd: nextMonday,
    startsAt: `${monday}T00:00:00${offset}`,
    endsAt: `${nextMonday}T00:00:00${offset}`,
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
