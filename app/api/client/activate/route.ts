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

    const { data: clients, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, profile_id, full_name, email, qr_token, authorization_code, status")
      .eq("email", email);

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 });
    }

    const client = (clients || []).find((item) => {
      return item.authorization_code === code || item.qr_token === code;
    });

    if (!client) {
      return NextResponse.json(
        { error: "Invalid email or authorization code." },
        { status: 404 }
      );
    }

    if (client.profile_id) {
      return NextResponse.json(
        { error: "This client account is already activated." },
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
      await supabaseAdmin.from("profiles").delete().eq("id", createdUser.user.id);

      return NextResponse.json(
        { error: updateClientError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Unexpected activation error." },
      { status: 500 }
    );
  }
}