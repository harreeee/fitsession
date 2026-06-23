import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
} from "../../../../../../lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const supabase = createServiceSupabaseClient();

    const { data, error: staffError } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["trainer", "nutrition_coach"])
      .order("full_name", { ascending: true });

    if (staffError) {
      throw staffError;
    }

    return NextResponse.json({
      staff: data || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load staff.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}