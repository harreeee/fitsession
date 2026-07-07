import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: activePackage, error: packageError } = await supabaseAdmin
      .from("session_packages")
      .select("id, used_sessions, remaining_sessions, status")
      .eq("client_id", clientId)
      .in("status", ["active", "pending"])
      .gt("remaining_sessions", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (packageError) {
      return NextResponse.json({ error: packageError.message }, { status: 500 });
    }

    if (!activePackage) {
      return NextResponse.json(
        { error: "No active package with remaining sessions found." },
        { status: 404 }
      );
    }

    const newUsedSessions = Number(activePackage.used_sessions || 0) + 1;
    const newRemainingSessions =
      Number(activePackage.remaining_sessions || 0) - 1;

    const { error: updateError } = await supabaseAdmin
      .from("session_packages")
      .update({
        used_sessions: newUsedSessions,
        remaining_sessions: newRemainingSessions,
        status: newRemainingSessions <= 0 ? "completed" : activePackage.status,
      })
      .eq("id", activePackage.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: logError } = await supabaseAdmin.from("session_history").insert({
      client_id: clientId,
      trainer_id: null,
      package_id: activePackage.id,
      status: "manual_subtract",
      message: "Session manually subtracted by admin.",
      remaining_after: newRemainingSessions,
      scanned_at: new Date().toISOString(),
    });

    if (logError) {
      return NextResponse.json(
        {
          error:
            "Session was deducted, but history log failed: " + logError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "1 session subtracted successfully.",
      remaining_sessions: newRemainingSessions,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}