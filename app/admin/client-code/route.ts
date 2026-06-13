import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const clientId = String(body.clientId || "").trim();

    if (!clientId) {
      return NextResponse.json(
        { error: "Client ID is required." },
        { status: 400 }
      );
    }

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, email")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { error: "Client not found." },
        { status: 404 }
      );
    }

    if (!client.email) {
      return NextResponse.json(
        {
          error:
            "Client must have an email before creating a login code.",
        },
        { status: 400 }
      );
    }

    const code = generateCode();

    await supabaseAdmin
      .from("client_login_codes")
      .update({ used: true })
      .eq("client_id", client.id)
      .eq("used", false);

    const { error: insertError } = await supabaseAdmin
      .from("client_login_codes")
      .insert({
        client_id: client.id,
        email: client.email.toLowerCase(),
        code,
        used: false,
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      code,
      email: client.email,
      expiresIn: "7 days",
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}