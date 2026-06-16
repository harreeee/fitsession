import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) return null;

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(token);

  return user;
}

export async function PATCH(request: NextRequest) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();

  const fullName = String(body.full_name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["trainer", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Trainer access required." }, { status: 403 });
  }

  const profileUpdates: {
    full_name?: string;
    phone?: string | null;
    email?: string;
  } = {};

  if (fullName) profileUpdates.full_name = fullName;
  profileUpdates.phone = phone || null;

  const authUpdates: {
    email?: string;
    password?: string;
  } = {};

  if (email && email !== user.email) {
    authUpdates.email = email;
    profileUpdates.email = email;
  }

  if (password) {
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    authUpdates.password = password;
  }

  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      authUpdates
    );

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update(profileUpdates)
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}