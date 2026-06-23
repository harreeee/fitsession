import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../../../../lib/supabaseServer";
import { getGoogleOAuthUrl } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing Supabase access token." },
        { status: 401 }
      );
    }

    const supabase = createServiceSupabaseClient();

    const { data: userData, error: userError } = await supabase.auth.getUser(
      token
    );

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: userError?.message || "Invalid Supabase access token." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (
      profile?.role !== "admin" &&
      profile?.role !== "trainer" &&
      profile?.role !== "nutrition_coach"
    ) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const state = crypto.randomUUID();

    const { error: stateError } = await supabase
      .from("google_calendar_oauth_states")
      .insert({
        state,
        trainer_id: userData.user.id,
      });

    if (stateError) {
      throw stateError;
    }

    return NextResponse.redirect(getGoogleOAuthUrl(state));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Calendar connect failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}