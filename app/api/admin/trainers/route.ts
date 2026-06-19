import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type StaffRole = "trainer" | "nutrition_coach";

type StaffPayload = {
  full_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: string;
};

function normalizeStaffRole(role: unknown): StaffRole {
  return role === "nutrition_coach" ? "nutrition_coach" : "trainer";
}

function getRoleLabel(role: string | null) {
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "trainer") return "Trainer";
  return "Staff";
}

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

  const { data: staffMembers, error: staffError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, phone, role, created_at")
    .in("role", ["trainer", "nutrition_coach"])
    .order("full_name", { ascending: true });

  if (staffError) {
    return NextResponse.json(
      { error: "Could not load staff members." },
      { status: 500 }
    );
  }

  const staffIds = (staffMembers || []).map((staff) => staff.id);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: monthlyLogs } =
    staffIds.length > 0
      ? await supabaseAdmin
          .from("session_logs")
          .select("id, trainer_id, client_id, status, scanned_at, remaining_after")
          .in("trainer_id", staffIds)
          .eq("status", "success")
          .gte("scanned_at", startOfMonth.toISOString())
      : { data: [] };

  const { data: recentLogs } =
    staffIds.length > 0
      ? await supabaseAdmin
          .from("session_logs")
          .select(
            "id, trainer_id, client_id, status, message, scanned_at, remaining_after"
          )
          .in("trainer_id", staffIds)
          .order("scanned_at", { ascending: false })
          .limit(100)
      : { data: [] };

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

  const clientMap = new Map(
    (clients || []).map((client) => [client.id, client])
  );

  const staffWithStats = (staffMembers || []).map((staff) => {
    const staffMonthlyLogs = (monthlyLogs || []).filter(
      (log) => log.trainer_id === staff.id
    );

    const staffRecentLogs = (recentLogs || [])
      .filter((log) => log.trainer_id === staff.id)
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
      ...staff,
      total_sessions_this_month: staffMonthlyLogs.length,
      recent_session_history: staffRecentLogs,
    };
  });

  return NextResponse.json({ trainers: staffWithStats });
}

export async function POST(request: NextRequest) {
  const adminCheck = await verifyAdmin(request);

  if (adminCheck.error) {
    return NextResponse.json({ error: adminCheck.error }, { status: 401 });
  }

  const body = (await request.json()) as StaffPayload;

  const fullName = body.full_name?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim() || null;
  const password = body.password;
  const role = normalizeStaffRole(body.role);

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
        role,
      })
      .eq("id", existingProfile.id);

    if (updateError) {
      return NextResponse.json(
        { error: `Could not update existing user to ${getRoleLabel(role)}.` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, role });
  }

  const { data: createdUser, error: createUserError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
      },
    });

  if (createUserError || !createdUser.user) {
    return NextResponse.json(
      {
        error:
          createUserError?.message ||
          `Could not create ${getRoleLabel(role)} login.`,
      },
      { status: 500 }
    );
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: createdUser.user.id,
    email,
    full_name: fullName,
    phone,
    role,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);

    return NextResponse.json(
      {
        error: `${getRoleLabel(
          role
        )} auth user was created, but profile creation failed.`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, role });
}

export async function DELETE(request: NextRequest) {
  const adminCheck = await verifyAdmin(request);

  if (adminCheck.error) {
    return NextResponse.json({ error: adminCheck.error }, { status: 401 });
  }

  const staffId = request.nextUrl.searchParams.get("id");

  if (!staffId) {
    return NextResponse.json(
      { error: "Staff id is required." },
      { status: 400 }
    );
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", staffId)
    .single();

  if (staffError || !staff) {
    return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }

  if (!["trainer", "nutrition_coach"].includes(staff.role)) {
    return NextResponse.json(
      { error: "This user is not a trainer or nutrition coach." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ role: "client" })
    .eq("id", staffId);

  if (updateError) {
    return NextResponse.json(
      { error: "Could not remove staff access." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}