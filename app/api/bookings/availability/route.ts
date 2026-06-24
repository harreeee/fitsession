import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

type CalendarConnection = {
  id: string;
  trainer_id: string;
  google_email: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  calendar_id: string;
};

type GoogleFreeBusyResponse = {
  calendars?: Record<
    string,
    {
      busy?: {
        start: string;
        end: string;
      }[];
    }
  >;
  error?: {
    message?: string;
  };
};

type AvailabilitySlot = {
  starts_at: string;
  ends_at: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function overlaps(
  slotStart: Date,
  slotEnd: Date,
  busyStart: Date,
  busyEnd: Date
) {
  return slotStart < busyEnd && slotEnd > busyStart;
}

function isTokenExpired(tokenExpiry: string | null) {
  if (!tokenExpiry) return false;

  const expiryTime = new Date(tokenExpiry).getTime();

  if (Number.isNaN(expiryTime)) return false;

  return Date.now() > expiryTime - 5 * 60 * 1000;
}

async function refreshGoogleAccessToken(connection: CalendarConnection) {
  if (!connection.refresh_token) {
    return connection.access_token;
  }

  if (!isTokenExpired(connection.token_expiry)) {
    return connection.access_token;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Could not refresh Google token."
    );
  }

  const tokenExpiry = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  const supabase = createServiceSupabaseClient();

  await supabase
    .from("trainer_google_calendar_connections")
    .update({
      access_token: data.access_token,
      token_expiry: tokenExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return data.access_token;
}

function generateAvailabilitySlots(busyTimes: { start: string; end: string }[]) {
  const slots: AvailabilitySlot[] = [];
  const now = new Date();

  const busyRanges = busyTimes.map((busy) => ({
    start: new Date(busy.start),
    end: new Date(busy.end),
  }));

  for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) {
    const day = new Date();
    day.setDate(now.getDate() + dayOffset);
    day.setHours(8, 0, 0, 0);

    const endOfDay = new Date(day);
    endOfDay.setHours(20, 0, 0, 0);

    let slotStart = new Date(day);

    while (slotStart < endOfDay) {
      const slotEnd = addMinutes(slotStart, 60);

      const hasConflict = busyRanges.some((busy) =>
        overlaps(slotStart, slotEnd, busy.start, busy.end)
      );

      if (!hasConflict) {
        slots.push({
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
        });
      }

      slotStart = addMinutes(slotStart, 60);
    }
  }

  return slots.slice(0, 30);
}

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);

    if (error || !user) {
      return jsonError(error || "Unauthorized.", 401);
    }

    const role = await getUserRole(user.id);

    if (
      role !== "admin" &&
      role !== "trainer" &&
      role !== "nutrition_coach" &&
      role !== "client"
    ) {
      return jsonError("You do not have permission to view availability.", 403);
    }

    const url = new URL(request.url);
    const trainerId = url.searchParams.get("trainerId");

    if (!trainerId) {
      return jsonError("Missing trainerId.");
    }

    const supabase = createServiceSupabaseClient();

    const { data: connectionData, error: connectionError } = await supabase
      .from("trainer_google_calendar_connections")
      .select(
        "id, trainer_id, google_email, access_token, refresh_token, token_expiry, calendar_id"
      )
      .eq("trainer_id", trainerId)
      .maybeSingle();

    if (connectionError) {
      return jsonError(connectionError.message, 500);
    }

    const connection = connectionData as CalendarConnection | null;

    if (!connection) {
      return NextResponse.json({
        availability: [],
        error:
          "This trainer has not connected Google Calendar yet. Please ask the trainer to connect Google Calendar first.",
      });
    }

    const accessToken = await refreshGoogleAccessToken(connection);

    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() + 1);
    timeMin.setHours(0, 0, 0, 0);

    const timeMax = new Date(timeMin);
    timeMax.setDate(timeMin.getDate() + 8);
    timeMax.setHours(23, 59, 59, 999);

    const calendarId = connection.calendar_id || "primary";

    const freeBusyResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: [{ id: calendarId }],
        }),
      }
    );

    const freeBusyData =
      (await freeBusyResponse.json()) as GoogleFreeBusyResponse;

    if (!freeBusyResponse.ok) {
      return jsonError(
        freeBusyData.error?.message || "Could not load Google availability.",
        500
      );
    }

    const busyTimes = freeBusyData.calendars?.[calendarId]?.busy || [];
    const availability = generateAvailabilitySlots(busyTimes);

    return NextResponse.json({
      availability,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load availability.";

    return jsonError(message, 500);
  }
}