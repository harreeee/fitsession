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

    const { error: updatePurchaseError } = await supabaseAdmin
      .from("client_purchases")
      .update({
        status: "paid",
        confirmed_by: userData.user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", purchase.id);

    if (updatePurchaseError) {
      return NextResponse.json(
        { error: updatePurchaseError.message },
        { status: 400 }
      );
    }

    if (purchase.session_count > 0) {
      const { data: activePackage } = await supabaseAdmin
        .from("session_packages")
        .select("*")
        .eq("client_id", purchase.client_id)
        .eq("status", "active")
        .maybeSingle();

      if (activePackage) {
        const { error: packageUpdateError } = await supabaseAdmin
          .from("session_packages")
          .update({
            total_sessions:
              activePackage.total_sessions + purchase.session_count,
            remaining_sessions:
              activePackage.remaining_sessions + purchase.session_count,
          })
          .eq("id", activePackage.id);

        if (packageUpdateError) {
          return NextResponse.json(
            { error: packageUpdateError.message },
            { status: 400 }
          );
        }
      } else {
        const { error: packageInsertError } = await supabaseAdmin
          .from("session_packages")
          .insert({
            client_id: purchase.client_id,
            total_sessions: purchase.session_count,
            used_sessions: 0,
            remaining_sessions: purchase.session_count,
            status: "active",
          });

        if (packageInsertError) {
          return NextResponse.json(
            { error: packageInsertError.message },
            { status: 400 }
          );
        }
      }
    }

    const { error: transactionError } = await supabaseAdmin
      .from("business_transactions")
      .insert({
        transaction_type: "income",
        source: "purchase",
        title: purchase.plan_name,
        amount: purchase.price,
        notes: "Membership purchase confirmed by admin.",
        client_id: purchase.client_id,
        purchase_id: purchase.id,
        created_by: userData.user.id,
        transaction_date: new Date().toISOString().slice(0, 10),
      });

    if (transactionError) {
      return NextResponse.json(
        { error: transactionError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Purchase confirmed and sessions updated.",
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}