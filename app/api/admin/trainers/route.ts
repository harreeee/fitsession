import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type StaffRole =
  | "trainer"
  | "nutrition_coach"
  | "manager"
  | "marketing_manager";

type CreateStaffBody = {
  full_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  password?: string;
};

type DeleteStaffBody = {
  staff_id?: string;
};

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isValidStaffRole(role: string): role is StaffRole {
  return (
    role === "trainer" ||
    role === "nutrition_coach" ||
    role === "manager" ||
    role === "marketing_manager"
  );
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice(7).trim() || null;
}

async function requireAdmin(request: NextRequest) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 },
      ),
    };
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Invalid or expired login session." },
        { status: 401 },
      ),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: `Could not verify admin access: ${profileError.message}` },
        { status: 500 },
      ),
    };
  }

  if (profile?.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Admin access is required." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    supabaseAdmin,
    adminUserId: user.id,
  };
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);

    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as CreateStaffBody;

    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;
    const role = body.role?.trim();
    const password = body.password?.trim() || "FxaFitness123!";

    if (!fullName || !email || !role) {
      return NextResponse.json(
        { error: "Full name, email, and role are required." },
        { status: 400 },
      );
    }

    if (!isValidStaffRole(role)) {
      return NextResponse.json(
        { error: `Invalid staff role: ${role}` },
        { status: 400 },
      );
    }

    const { supabaseAdmin } = adminCheck;

    const { data: existingUsers, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      return NextResponse.json(
        { error: `Auth check failed: ${listError.message}` },
        { status: 500 },
      );
    }

    const existingUser = existingUsers.users.find(
      (user) => user.email?.toLowerCase() === email,
    );

    let userId = existingUser?.id;

    if (!userId) {
      const { data: createdUser, error: createUserError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            phone,
            role,
          },
        });

      if (createUserError) {
        return NextResponse.json(
          { error: `Create auth user failed: ${createUserError.message}` },
          { status: 500 },
        );
      }

      userId = createdUser.user.id;
    } else {
      const { error: updateAuthError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            full_name: fullName,
            phone,
            role,
          },
        });

      if (updateAuthError) {
        return NextResponse.json(
          { error: `Update auth user failed: ${updateAuthError.message}` },
          { status: 500 },
        );
      }
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name: fullName,
          phone,
          role,
        },
        {
          onConflict: "id",
        },
      );

    if (profileError) {
      return NextResponse.json(
        { error: `Create profile failed: ${profileError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      email,
      role,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);

    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as DeleteStaffBody;
    const staffId = body.staff_id?.trim();

    if (!staffId) {
      return NextResponse.json(
        { error: "staff_id is required." },
        { status: 400 },
      );
    }

    const { supabaseAdmin, adminUserId } = adminCheck;

    if (staffId === adminUserId) {
      return NextResponse.json(
        { error: "You cannot delete your own Admin account from this page." },
        { status: 400 },
      );
    }

    const { data: targetProfile, error: targetProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("id", staffId)
        .maybeSingle();

    if (targetProfileError) {
      return NextResponse.json(
        { error: `Could not read staff profile: ${targetProfileError.message}` },
        { status: 500 },
      );
    }

    if (!targetProfile) {
      return NextResponse.json(
        { error: "Staff profile was not found." },
        { status: 404 },
      );
    }

    if (!isValidStaffRole(String(targetProfile.role || ""))) {
      return NextResponse.json(
        { error: "This account is not a removable staff role." },
        { status: 400 },
      );
    }

    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(staffId);

    if (authDeleteError) {
      return NextResponse.json(
        {
          error: `Delete Supabase Auth account failed: ${authDeleteError.message}`,
        },
        { status: 500 },
      );
    }

    // If profiles.id has ON DELETE CASCADE from auth.users, this row may
    // already be gone. Running this cleanup is safe either way.
    const { error: profileDeleteError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", staffId);

    if (profileDeleteError) {
      return NextResponse.json(
        {
          success: true,
          warning: `Auth account was deleted, but profile cleanup failed: ${profileDeleteError.message}`,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      success: true,
      deleted_user_id: staffId,
      deleted_email: targetProfile.email,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}