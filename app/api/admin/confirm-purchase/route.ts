import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing login token." },
        { status: 401 }
      );
    }

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Invalid login session." },
        { status: 401 }
      );
    }

    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (adminProfile?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const purchaseId = String(body.purchaseId || "").trim();

    if (!purchaseId) {
      return NextResponse.json(
        { error: "Purchase ID is required." },
        { status: 400 }
      );
    }

    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from("client_purchases")
      .select("*")
      .eq("id", purchaseId)
      .single();

    if (purchaseError || !purchase) {
      return NextResponse.json(
        { error: "Purchase not found." },
        { status: 404 }
      );
    }

    if (purchase.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending purchases can be confirmed." },
        { status: 400 }
      );
    }

    // Confirm service administration only. Never mark cash paid here.
    // Client creation/renewal already provisions sessions; adding them again would double grant.
    const { data: confirmed, error: updateError } = await supabaseAdmin
      .from("client_purchases")
      .update({
        status: "confirmed",
        confirmed_by: userData.user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", purchase.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    if (!confirmed) {
      return NextResponse.json({ error: "Already confirmed or changed. Refresh." }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      message: "Purchase administratively confirmed. Accountant must enter monetary figures in Revenue.",
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}