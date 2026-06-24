import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  email?: string;
};

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function redirectToCalendar(path: string) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return NextResponse.redirect(`${siteUrl}${path}`);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return redirectToCalendar(
        `/trainer/calendar?error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      return redirectToCalendar(
        "/trainer/calendar?error=Missing Google authorization code or state."
      );
    }

    const supabase = createServiceSupabaseClient();

    const { data: stateRow, error: stateError } = await supabase
      .from("google_calendar_oauth_states")
      .select("id, state, trainer_id")
      .eq("state", state)
      .maybeSingle();

    if (stateError) {
      return redirectToCalendar(
        `/trainer/calendar?error=${encodeURIComponent(stateError.message)}`
      );
    }

    if (!stateRow) {
      return redirectToCalendar(
        "/trainer/calendar?error=Invalid or expired Google connection state."
      );
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
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

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenResponse.ok || !tokenData.access_token) {
      return redirectToCalendar(
        `/trainer/calendar?error=${encodeURIComponent(
          tokenData.error_description ||
            tokenData.error ||
            "Could not connect Google Calendar."
        )}`
      );
    }

    let googleEmail: string | null = null;

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    if (userInfoResponse.ok) {
      const userInfo =
        (await userInfoResponse.json()) as GoogleUserInfoResponse;
      googleEmail = userInfo.email || null;
    }

    const tokenExpiry = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const { error: upsertError } = await supabase
      .from("trainer_google_calendar_connections")
      .upsert(
        {
          trainer_id: stateRow.trainer_id,
          google_email: googleEmail,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          token_expiry: tokenExpiry,
          calendar_id: "primary",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "trainer_id",
        }
      );

    if (upsertError) {
      return redirectToCalendar(
        `/trainer/calendar?error=${encodeURIComponent(upsertError.message)}`
      );
    }

    await supabase
      .from("google_calendar_oauth_states")
      .delete()
      .eq("id", stateRow.id);

    return redirectToCalendar("/trainer/calendar?connected=1");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Google Calendar connection failed.";

    return redirectToCalendar(
      `/trainer/calendar?error=${encodeURIComponent(message)}`
    );
  }
}