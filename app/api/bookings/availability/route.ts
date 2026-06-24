import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type BookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string | null;
};

type AvailabilitySlot = {
  starts_at: string;
  ends_at: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SLOT_LENGTH_MINUTES = 60;
const DAYS_TO_SHOW = 14;

const DAILY_TIMES = [
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
];

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildDateTime(date: Date, timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map(Number);

  const slotDate = new Date(date);
  slotDate.setHours(hours, minutes, 0, 0);

  return slotDate;
}

function isSunday(date: Date) {
  return date.getDay() === 0;
}

function slotsOverlap(slotStart: Date, slotEnd: Date, booking: BookingRow) {
  const bookingStart = new Date(booking.starts_at);
  const bookingEnd = new Date(booking.ends_at);

  if (
    Number.isNaN(bookingStart.getTime()) ||
    Number.isNaN(bookingEnd.getTime())
  ) {
    return false;
  }

  return slotStart < bookingEnd && slotEnd > bookingStart;
}

function generateAvailabilityFromBookings(bookings: BookingRow[]) {
  const slots: AvailabilitySlot[] = [];
  const now = new Date();

  for (let dayOffset = 0; dayOffset < DAYS_TO_SHOW; dayOffset += 1) {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + dayOffset);
    currentDate.setHours(0, 0, 0, 0);

    if (isSunday(currentDate)) {
      continue;
    }

    for (const timeValue of DAILY_TIMES) {
      const slotStart = buildDateTime(currentDate, timeValue);
      const slotEnd = addMinutes(slotStart, SLOT_LENGTH_MINUTES);

      if (slotStart <= now) {
        continue;
      }

      const alreadyBooked = bookings.some((booking) => {
        if (booking.status === "cancelled") return false;

        return slotsOverlap(slotStart, slotEnd, booking);
      });

      if (!alreadyBooked) {
        slots.push({
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
        });
      }
    }
  }

  return slots;
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase environment variables." },
        { status: 500 }
      );
    }

    const trainerId = request.nextUrl.searchParams.get("trainerId");

    if (!trainerId) {
      return NextResponse.json(
        { error: "trainerId is required." },
        { status: 400 }
      );
    }

    const authorizationHeader = request.headers.get("authorization");
    const accessToken = authorizationHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    if (
      !profile ||
      !["client", "admin", "trainer", "nutrition_coach"].includes(
        String(profile.role)
      )
    ) {
      return NextResponse.json(
        { error: "You do not have permission to check availability." },
        { status: 403 }
      );
    }

    const { data: staffProfile, error: staffError } = await adminSupabase
      .from("profiles")
      .select("id, role, full_name, email")
      .eq("id", trainerId)
      .maybeSingle();

    if (staffError) {
      return NextResponse.json(
        { error: staffError.message },
        { status: 500 }
      );
    }

    if (
      !staffProfile ||
      !["trainer", "nutrition_coach", "admin"].includes(
        String(staffProfile.role)
      )
    ) {
      return NextResponse.json(
        { error: "Selected staff member was not found." },
        { status: 404 }
      );
    }

    const rangeStart = new Date();
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + DAYS_TO_SHOW + 1);

    const { data: bookings, error: bookingsError } = await adminSupabase
      .from("bookings")
      .select("id, starts_at, ends_at, status")
      .eq("trainer_id", trainerId)
      .gte("starts_at", rangeStart.toISOString())
      .lte("starts_at", rangeEnd.toISOString())
      .neq("status", "cancelled");

    if (bookingsError) {
      return NextResponse.json(
        { error: bookingsError.message },
        { status: 500 }
      );
    }

    const availability = generateAvailabilityFromBookings(
      (bookings || []) as BookingRow[]
    );

    return NextResponse.json({
      availability,
      slots: availability,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not load availability.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}