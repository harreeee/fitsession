import { NextRequest, NextResponse } from "next/server";
import { getBusyTimes } from "../../../../lib/googleCalendar";
import { getUserFromRequest } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

type BusyTime = {
  start: string;
  end: string;
};

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

function toTwoDigit(value: number) {
  return String(value).padStart(2, "0");
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const body = (await request.json()) as {
      trainerId?: string;
      date?: string;
      durationMinutes?: number;
    };

    const trainerId = body.trainerId || "";
    const date = body.date || "";
    const durationMinutes = body.durationMinutes || 60;

    if (!trainerId || !date) {
      return NextResponse.json(
        { error: "Missing trainerId or date." },
        { status: 400 }
      );
    }

    const dayStart = new Date(`${date}T06:00:00`);
    const dayEnd = new Date(`${date}T21:00:00`);

    if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }

    const busyTimes = (await getBusyTimes(
      trainerId,
      dayStart.toISOString(),
      dayEnd.toISOString()
    )) as BusyTime[];

    const slots: {
      label: string;
      startsAt: string;
      endsAt: string;
    }[] = [];

    const now = Date.now();
    const slotMs = durationMinutes * 60 * 1000;

    for (
      let slotStart = dayStart.getTime();
      slotStart + slotMs <= dayEnd.getTime();
      slotStart += 30 * 60 * 1000
    ) {
      const slotEnd = slotStart + slotMs;

      if (slotStart < now) {
        continue;
      }

      const isBusy = busyTimes.some((busy) => {
        const busyStart = new Date(busy.start).getTime();
        const busyEnd = new Date(busy.end).getTime();

        return overlaps(slotStart, slotEnd, busyStart, busyEnd);
      });

      if (!isBusy) {
        const slotDate = new Date(slotStart);

        slots.push({
          label: `${toTwoDigit(slotDate.getHours())}:${toTwoDigit(
            slotDate.getMinutes()
          )}`,
          startsAt: new Date(slotStart).toISOString(),
          endsAt: new Date(slotEnd).toISOString(),
        });
      }
    }

    return NextResponse.json({ slots });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check availability.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}