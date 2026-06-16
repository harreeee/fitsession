import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type TrainerPayload = {
  full_name?: string;
  email?: string;
  phone?: string;
  password?: string;
};

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return { error: "Missing authorization token." };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return { error: "Invalid user session." };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    return { error: "Admin access required." };
  }

  return { error: null };
}

export async function GET(request: NextRequest) {
  const adminCheck = await verifyAdmin(request);

  if (adminCheck.error) {
    return NextResponse.json({ error: adminCheck.error }, { status: 401 });
  }

  const { data: trainers, error: trainersError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, phone, role, created_at")
    .eq("role", "trainer")
    .order("full_name", { ascending: true });

  if (trainersError) {
    return NextResponse.json(
      { error: "Could not load trainers." },
      { status: 500 }
    );
  }

  const trainerIds = (trainers || []).map((trainer) => trainer.id);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: monthlyLogs } = await supabaseAdmin
    .from("session_logs")
    .select("id, trainer_id, client_id, status, scanned_at, remaining_after")
    .in("trainer_id", trainerIds)
    .eq("status", "success")
    .gte("scanned_at", startOfMonth.toISOString());

  const { data: recentLogs } = await supabaseAdmin
    .from("session_logs")
    .select("id, trainer_id, client_id, status, message, scanned_at, remaining_after")
    .in("trainer_id", trainerIds)
    .order("scanned_at", { ascending: false })
    .limit(100);

  const clientIds = Array.from(
    new Set((recentLogs || []).map((log) => log.client_id).filter(Boolean))
  );

  const { data: clients } =
    clientIds.length > 0
      ? await supabaseAdmin
          .from("clients")
          .select("id, full_name, email, phone")
          .in("id", clientIds)
      : { data: [] };

  const clientMap = new Map((clients || []).map((client) => [client.id, client]));

  const trainersWithStats = (trainers || []).map((trainer) => {
    const trainerMonthlyLogs = (monthlyLogs || []).filter(
      (log) => log.trainer_id === trainer.id
    );

    const trainerRecentLogs = (recentLogs || [])
      .filter((log) => log.trainer_id === trainer.id)
      .slice(0, 10)
      .map((log) => {
        const client = clientMap.get(log.client_id);

        return {
          id: log.id,
          client_id: log.client_id,
          client_name: client?.full_name || "Unknown Client",
          client_email: client?.email || null,
          status: log.status,
          message: log.message,
          remaining_after: log.remaining_after,
          scanned_at: log.scanned_at,
        };
      });

    return {
      ...trainer,
      total_sessions_this_month: trainerMonthlyLogs.length,
      recent_session_history: trainerRecentLogs,
    };
  });

  return NextResponse.json({ trainers: trainersWithStats });
}

export async function POST(request: NextRequest) {
  const adminCheck = await verifyAdmin(request);

  if (adminCheck.error) {
    return NextResponse.json({ error: adminCheck.error }, { status: 401 });
  }

  const body = (await request.json()) as TrainerPayload;

  const fullName = body.full_name?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim() || null;
  const password = body.password;

  if (!fullName || !email || !password) {
    return NextResponse.json(
      { error: "Full name, email, and password are required." },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        role: "trainer",
      })
      .eq("id", existingProfile.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Could not update existing user to trainer." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  }

  const { data: createdUser, error: createUserError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "trainer",
      },
    });

  if (createUserError || !createdUser.user) {
    return NextResponse.json(
      { error: createUserError?.message || "Could not create trainer login." },
      { status: 500 }
    );
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: createdUser.user.id,
    email,
    full_name: fullName,
    phone,
    role: "trainer",
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);

    return NextResponse.json(
      { error: "Trainer auth user was created, but profile creation failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const adminCheck = await verifyAdmin(request);

  if (adminCheck.error) {
    return NextResponse.json({ error: adminCheck.error }, { status: 401 });
  }

  const trainerId = request.nextUrl.searchParams.get("id");

  if (!trainerId) {
    return NextResponse.json(
      { error: "Trainer id is required." },
      { status: 400 }
    );
  }

  const { data: trainer, error: trainerError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", trainerId)
    .single();

  if (trainerError || !trainer) {
    return NextResponse.json({ error: "Trainer not found." }, { status: 404 });
  }

  if (trainer.role !== "trainer") {
    return NextResponse.json(
      { error: "This user is not a trainer." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ role: "client" })
    .eq("id", trainerId);

  if (updateError) {
    return NextResponse.json(
      { error: "Could not remove trainer access." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}