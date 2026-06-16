import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type ActivateBody = {
  email?: string;
  code?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ActivateBody;

    const email = body.email?.trim().toLowerCase();
    const code = body.code?.trim();
    const password = body.password || "";

    if (!email || !code || !password) {
      return NextResponse.json(
        { error: "Email, authorization code, and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const { data: loginCode, error: loginCodeError } = await supabaseAdmin
      .from("client_login_codes")
      .select("id, client_id, email, code, used, expires_at")
      .eq("email", email)
      .eq("code", code)
      .eq("used", false)
      .maybeSingle();

    if (loginCodeError) {
      return NextResponse.json(
        { error: loginCodeError.message },
        { status: 500 }
      );
    }

    let clientId: string | null = loginCode?.client_id || null;

    if (loginCode?.expires_at && new Date(loginCode.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This activation code has expired. Please ask admin for a new code." },
        { status: 400 }
      );
    }

    if (!clientId) {
      const { data: fallbackClient, error: fallbackError } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("email", email)
        .eq("authorization_code", code)
        .maybeSingle();

      if (fallbackError) {
        return NextResponse.json(
          { error: fallbackError.message },
          { status: 500 }
        );
      }

      clientId = fallbackClient?.id || null;
    }

    if (!clientId) {
      return NextResponse.json(
        { error: "Invalid email or authorization code." },
        { status: 404 }
      );
    }

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, profile_id, full_name, email, status")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { error: "Client not found." },
        { status: 404 }
      );
    }

    if (client.profile_id) {
      return NextResponse.json(
        { error: "This client account is already activated." },
        { status: 400 }
      );
    }

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, role")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: "A login already exists with this email." },
        { status: 400 }
      );
    }

    const { data: createdUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: client.full_name,
          role: "client",
        },
      });

    if (createUserError || !createdUser.user) {
      return NextResponse.json(
        { error: createUserError?.message || "Could not create client login." },
        { status: 500 }
      );
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: createdUser.user.id,
      email,
      full_name: client.full_name,
      role: "client",
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);

      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    const { error: updateClientError } = await supabaseAdmin
      .from("clients")
      .update({
        profile_id: createdUser.user.id,
        status: "active",
      })
      .eq("id", client.id);

    if (updateClientError) {
      await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", createdUser.user.id);

      return NextResponse.json(
        { error: updateClientError.message },
        { status: 500 }
      );
    }

    if (loginCode?.id) {
      await supabaseAdmin
        .from("client_login_codes")
        .update({ used: true })
        .eq("id", loginCode.id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Unexpected activation error." },
      { status: 500 }
    );
  }
}