import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const clientId = params.id;

    if (!clientId) {
      return NextResponse.json(
        { error: "Missing client ID." },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
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
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    const { data: activePackage, error: packageError } = await supabaseAdmin
      .from("session_packages")
      .select("id, used_sessions, remaining_sessions, status")
      .eq("client_id", clientId)
      .eq("status", "active")
      .gt("remaining_sessions", 0)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (packageError || !activePackage) {
      return NextResponse.json(
        { error: "No active package with remaining sessions found." },
        { status: 400 }
      );
    }

    const currentUsedSessions = activePackage.used_sessions ?? 0;
    const currentRemainingSessions = activePackage.remaining_sessions ?? 0;

    if (currentRemainingSessions <= 0) {
      return NextResponse.json(
        { error: "Client has no remaining sessions." },
        { status: 400 }
      );
    }

    const newUsedSessions = currentUsedSessions + 1;
    const newRemainingSessions = currentRemainingSessions - 1;

    const { error: updateError } = await supabaseAdmin
      .from("session_packages")
      .update({
        used_sessions: newUsedSessions,
        remaining_sessions: newRemainingSessions,
        status: newRemainingSessions <= 0 ? "completed" : "active",
      })
      .eq("id", activePackage.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to deduct session." },
        { status: 500 }
      );
    }

    const { error: logError } = await supabaseAdmin.from("session_logs").insert({
      client_id: clientId,
      trainer_id: null,
      package_id: activePackage.id,
      status: "no_show",
      message: "Client no-show. Session deducted by admin.",
      remaining_after: newRemainingSessions,
      scanned_at: new Date().toISOString(),
    });

    if (logError) {
      return NextResponse.json(
        {
          error: "Session deducted, but failed to create no-show history log.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "No-show recorded. 1 session deducted.",
      remaining_sessions: newRemainingSessions,
    });
  } catch (error) {
    console.error("No-show deduction error:", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}