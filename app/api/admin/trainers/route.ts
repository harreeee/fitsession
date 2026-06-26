import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CreateStaffBody = {
  full_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  password?: string;
};

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isValidStaffRole(role: string) {
  return role === "trainer" || role === "nutrition_coach" || role === "manager";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateStaffBody;

    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;
    const role = body.role?.trim();
    const password = body.password?.trim() || "FxaFitness123!";

    if (!fullName || !email || !role) {
      return NextResponse.json(
        { error: "Full name, email, and role are required." },
        { status: 400 }
      );
    }

    if (!isValidStaffRole(role)) {
      return NextResponse.json(
        { error: "Invalid staff role." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();

    const { data: existingUsers, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      return NextResponse.json(
        { error: `Auth check failed: ${listError.message}` },
        { status: 500 }
      );
    }

    const existingUser = existingUsers.users.find(
      (user) => user.email?.toLowerCase() === email
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
          { status: 500 }
        );
      }

      userId = createdUser.user.id;
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        phone,
        role,
      },
      {
        onConflict: "id",
      }
    );

    if (profileError) {
      return NextResponse.json(
        { error: `Create profile failed: ${profileError.message}` },
        { status: 500 }
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