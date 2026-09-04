import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  getUserFromRequest,
  getUserRole,
} from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

type RuleInput = {
  weekday?: number;
  start_time?: string;
  end_time?: string;
};

async function requireTrainer(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth.user) {
    return { error: NextResponse.json({ error: auth.error }, { status: 401 }) };
  }

  const role = await getUserRole(auth.user.id);
  if (!["trainer", "nutrition_coach", "admin"].includes(role)) {
    return {
      error: NextResponse.json({ error: "Trainer access is required." }, { status: 403 }),
    };
  }

  return { user: auth.user };
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireTrainer(request);
    if (access.error) return access.error;

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("trainer_availability_rules")
      .select("id, trainer_id, weekday, start_time, end_time, is_active")
      .eq("trainer_id", access.user!.id)
      .eq("is_active", true)
      .order("weekday")
      .order("start_time");

    if (error) throw error;
    return NextResponse.json({ rules: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load weekly availability." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await requireTrainer(request);
    if (access.error) return access.error;

    const body = (await request.json()) as { rules?: RuleInput[] };
    const rules = Array.isArray(body.rules) ? body.rules : [];

    for (const rule of rules) {
      const weekday = Number(rule.weekday);
      const start = String(rule.start_time || "").slice(0, 5);
      const end = String(rule.end_time || "").slice(0, 5);
      if (
        !Number.isInteger(weekday) ||
        weekday < 0 ||
        weekday > 6 ||
        !/^\d{2}:\d{2}$/.test(start) ||
        !/^\d{2}:\d{2}$/.test(end) ||
        start >= end
      ) {
        return NextResponse.json({ error: "One or more availability windows are invalid." }, { status: 400 });
      }
    }

    const supabase = createServiceSupabaseClient();
    const trainerId = access.user!.id;

    const { error: deleteError } = await supabase
      .from("trainer_availability_rules")
      .delete()
      .eq("trainer_id", trainerId);

    if (deleteError) throw deleteError;

    if (rules.length > 0) {
      const { error: insertError } = await supabase
        .from("trainer_availability_rules")
        .insert(
          rules.map((rule) => ({
            trainer_id: trainerId,
            weekday: Number(rule.weekday),
            start_time: String(rule.start_time).slice(0, 5),
            end_time: String(rule.end_time).slice(0, 5),
            is_active: true,
          })),
        );
      if (insertError) throw insertError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save weekly availability." },
      { status: 500 },
    );
  }
}
