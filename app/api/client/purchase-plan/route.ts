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

    const body = await request.json();
    const planId = String(body.planId || "").trim();

    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required." },
        { status: 400 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profile?.role !== "client") {
      return NextResponse.json(
        { error: "Only clients can purchase packages." },
        { status: 403 }
      );
    }

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, full_name")
      .eq("profile_id", userData.user.id)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { error: "Client profile not found." },
        { status: 404 }
      );
    }

    const { data: plan, error: planError } = await supabaseAdmin
      .from("membership_plans")
      .select("*")
      .eq("id", planId)
      .eq("status", "active")
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: "Membership plan not found." },
        { status: 404 }
      );
    }

    const { data: existingPending } = await supabaseAdmin
      .from("client_purchases")
      .select("id")
      .eq("client_id", client.id)
      .eq("plan_id", plan.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPending) {
      return NextResponse.json(
        {
          error:
            "You already have a pending purchase for this package. Please contact admin.",
        },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("client_purchases")
      .insert({
        client_id: client.id,
        plan_id: plan.id,
        plan_name: plan.name,
        session_count: plan.session_count,
        price: plan.price,
        status: "pending",
        payment_method: "manual",
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Purchase request created.",
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}