import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();
    const password = String(body.password || "");

    if (!email || !code || !password) {
      return NextResponse.json(
        {
          error:
            "Email, authorization code, and password are required.",
        },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const { data: codeRow, error: codeError } = await supabaseAdmin
      .from("client_login_codes")
      .select(`
        id,
        client_id,
        email,
        code,
        used,
        expires_at,
        clients (
          id,
          full_name,
          email
        )
      `)
      .eq("email", email)
      .eq("code", code)
      .eq("used", false)
      .maybeSingle();

    if (codeError || !codeRow) {
      return NextResponse.json(
        { error: "Invalid authorization code." },
        { status: 400 }
      );
    }

    if (new Date(codeRow.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This authorization code has expired." },
        { status: 400 }
      );
    }

    const clientRelation = codeRow.clients as
      | { full_name?: string | null }
      | { full_name?: string | null }[]
      | null;

    const clientName = Array.isArray(clientRelation)
      ? clientRelation[0]?.full_name || "Client"
      : clientRelation?.full_name || "Client";

    const { data: newUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: clientName,
          role: "client",
        },
      });

    if (createUserError || !newUser.user) {
      return NextResponse.json(
        {
          error:
            createUserError?.message ||
            "Could not create client login account.",
        },
        { status: 400 }
      );
    }

    const userId = newUser.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        full_name: clientName,
        role: "client",
      });

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 }
      );
    }

    const { error: clientUpdateError } = await supabaseAdmin
      .from("clients")
      .update({ profile_id: userId })
      .eq("id", codeRow.client_id);

    if (clientUpdateError) {
      return NextResponse.json(
        { error: clientUpdateError.message },
        { status: 400 }
      );
    }

    const { error: usedError } = await supabaseAdmin
      .from("client_login_codes")
      .update({ used: true })
      .eq("id", codeRow.id);

    if (usedError) {
      return NextResponse.json(
        { error: usedError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Client login created successfully.",
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}