import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authentication token." },
        { status: 401 }
      );
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: "Invalid login session." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const planId = body.planId;

    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required." },
        { status: 400 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    if (profile?.role !== "client") {
      return NextResponse.json(
        { error: "Only clients can purchase memberships." },
        { status: 403 }
      );
    }

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("profile_id", authData.user.id)
      .single();

    if (!client) {
      return NextResponse.json(
        { error: "Client profile not found." },
        { status: 404 }
      );
    }

    const { data: plan } = await supabaseAdmin
      .from("membership_plans")
      .select("*")
      .eq("id", planId)
      .eq("status", "active")
      .single();

    if (!plan) {
      return NextResponse.json(
        { error: "Membership plan not found." },
        { status: 404 }
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
        payment_method: "manual",
        status: "pending",
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Purchase request created successfully.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Server error." },
      { status: 500 }
    );
  }
}