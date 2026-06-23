import { createServiceSupabaseClient } from "./supabaseServer";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
};

type CalendarConnection = {
  id: string;
  trainer_id: string;
  google_email: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  calendar_id: string;
};

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getGoogleOAuthUrl(state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requireEnv("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set(
    "scope",
    [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.freebusy",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" ")
  );
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeCodeForTokens(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });

  const json = (await response.json()) as TokenResponse;

  if (!response.ok || json.error) {
    throw new Error(json.error_description || json.error || "Google token exchange failed.");
  }

  return json;
}

export async function getGoogleEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as GoogleUserInfo;

  return json.email || null;
}

export async function refreshGoogleAccessToken(connection: CalendarConnection) {
  if (!connection.refresh_token) {
    return connection.access_token;
  }

  const expiryTime = connection.token_expiry
    ? new Date(connection.token_expiry).getTime()
    : 0;

  const oneMinuteFromNow = Date.now() + 60_000;

  if (expiryTime > oneMinuteFromNow) {
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

  const json = (await response.json()) as TokenResponse;

  if (!response.ok || json.error || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google token refresh failed.");
  }

  const tokenExpiry = new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString();

  const supabase = createServiceSupabaseClient();

  await supabase
    .from("trainer_google_calendar_connections")
    .update({
      access_token: json.access_token,
      token_expiry: tokenExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return json.access_token;
}

export async function getTrainerCalendarConnection(trainerId: string) {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("trainer_google_calendar_connections")
    .select("id, trainer_id, google_email, access_token, refresh_token, token_expiry, calendar_id")
    .eq("trainer_id", trainerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as CalendarConnection | null;
}

export async function getBusyTimes(trainerId: string, timeMin: string, timeMax: string) {
  const connection = await getTrainerCalendarConnection(trainerId);

  if (!connection) {
    throw new Error("Trainer has not connected Google Calendar.");
  }

  const accessToken = await refreshGoogleAccessToken(connection);

  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [
        {
          id: connection.calendar_id || "primary",
        },
      ],
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof json?.error?.message === "string"
        ? json.error.message
        : "Google Calendar free/busy check failed."
    );
  }

  const calendar = json.calendars?.[connection.calendar_id || "primary"];

  return Array.isArray(calendar?.busy) ? calendar.busy : [];
}

export async function createGoogleCalendarEvent(input: {
  trainerId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  startsAt: string;
  endsAt: string;
  notes: string;
}) {
  const connection = await getTrainerCalendarConnection(input.trainerId);

  if (!connection) {
    throw new Error("Trainer has not connected Google Calendar.");
  }

  const accessToken = await refreshGoogleAccessToken(connection);

  const attendees = input.clientEmail
    ? [
        {
          email: input.clientEmail,
        },
      ]
    : [];

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      connection.calendar_id || "primary"
    )}/events?sendUpdates=all`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `FXA Session - ${input.clientName}`,
        description: [
          `Client: ${input.clientName}`,
          input.clientEmail ? `Email: ${input.clientEmail}` : "",
          input.clientPhone ? `Phone: ${input.clientPhone}` : "",
          input.notes ? `Notes: ${input.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        start: {
          dateTime: input.startsAt,
        },
        end: {
          dateTime: input.endsAt,
        },
        attendees,
      }),
    }
  );

  const json = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof json?.error?.message === "string"
        ? json.error.message
        : "Google Calendar event creation failed."
    );
  }

  return {
    eventId: String(json.id || ""),
  };
}