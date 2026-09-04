import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
} from "../../../../lib/supabaseServer";
import { getGoogleOAuthUrl } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

async function buildGoogleConnectUrl(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);

  if (!user) {
    return { error: error || "You must be logged in.", status: 401 as const };
  }

  const supabase = createServiceSupabaseClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  if (
    profile?.role !== "admin" &&
    profile?.role !== "trainer" &&
    profile?.role !== "nutrition_coach"
  ) {
    return { error: "Not allowed.", status: 403 as const };
  }

  const state = crypto.randomUUID();

  const { error: stateError } = await supabase
    .from("google_calendar_oauth_states")
    .insert({
      state,
      trainer_id: user.id,
      created_at: new Date().toISOString(),
    });

  if (stateError) throw stateError;

  return { url: getGoogleOAuthUrl(state), status: 200 as const };
}

export async function POST(request: NextRequest) {
  try {
    const result = await buildGoogleConnectUrl(request);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ url: result.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Calendar connect failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Keep GET for old bookmarked flows, but no access token is accepted in the URL.
export async function GET() {
  return NextResponse.json(
    {
      error:
        "Google Calendar connection now starts from the authenticated Calendar page.",
    },
    { status: 405 },
  );
}
