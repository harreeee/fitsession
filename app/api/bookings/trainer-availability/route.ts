import { NextRequest, NextResponse } from "next/server";
import { GET as getTrainerSlots } from "../trainer-slots/route";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const response = await getTrainerSlots(request);

  if (!response.ok) {
    return response;
  }

  const result = await response.json();
  const days = Array.isArray(result?.days) ? result.days : [];

  const candidates = result?.google_error
    ? []
    : days.flatMap((day: { slots?: Array<Record<string, unknown>> }) =>
        (day.slots || [])
          .filter((slot) => slot.state === "free")
          .map((slot) => ({
            starts_at: String(slot.starts_at || ""),
            ends_at: String(slot.ends_at || ""),
          })),
      );

  const published = days.flatMap(
    (day: { slots?: Array<Record<string, unknown>> }) =>
      (day.slots || [])
        .filter((slot) => slot.state === "open" || slot.state === "booked")
        .map((slot) => ({
          id: String(slot.slot_id || ""),
          starts_at: String(slot.starts_at || ""),
          ends_at: String(slot.ends_at || ""),
          status: slot.state === "booked" ? "booked" : "open",
          service_code: "pt_1on1",
        })),
  );

  return NextResponse.json({
    trainerId: null,
    candidates,
    published,
    connection: result?.connection || null,
    google_error: result?.google_error || null,
    time_zone: result?.time_zone || "America/Toronto",
  });
}
