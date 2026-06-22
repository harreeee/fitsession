import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { toCsv } from "@/lib/csv";

function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function createSupabaseApiClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

async function requireAdmin(request: NextRequest) {
  const supabase = createSupabaseApiClient();

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      supabase,
      error: NextResponse.json(
        { error: "Unauthorized: missing bearer token" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.slice("Bearer ".length);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return {
      supabase,
      error: NextResponse.json(
        { error: `Unauthorized: ${userError?.message ?? "no user"}` },
        { status: 401 }
      ),
    };
  }

  const userEmail = user.email?.toLowerCase();

  const adminEmails =
    process.env.ADMIN_EMAILS?.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ?? [];

  if (!userEmail || !adminEmails.includes(userEmail)) {
    return {
      supabase,
      error: NextResponse.json(
        {
          error: `Forbidden: ${userEmail ?? "unknown email"} is not in ADMIN_EMAILS`,
        },
        { status: 403 }
      ),
    };
  }

  return {
    supabase,
    error: null,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, error: authError } = await requireAdmin(request);

  if (authError) {
    return authError;
  }

  const searchParams = request.nextUrl.searchParams;
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "Invalid year or month" },
      { status: 400 }
    );
  }

  const { start, end } = getMonthRange(year, month);

  const { data, error } = await supabase
    .from("purchases")
    .select(
      `
      id,
      created_at,
      package_name,
      sessions_purchased,
      amount,
      payment_method,
      status,
      notes,
      client:client_id (
        full_name,
        email
      ),
      seller:sold_by (
        full_name,
        email
      )
    `
    )
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows =
    data?.map((item: any) => ({
      Date: item.created_at,
      "Client Name": item.client?.full_name ?? "",
      "Client Email": item.client?.email ?? "",
      Package: item.package_name ?? "",
      "Sessions Purchased": item.sessions_purchased ?? 0,
      Amount: item.amount ?? 0,
      "Payment Method": item.payment_method ?? "",
      Status: item.status ?? "",
      "Sold By": item.seller?.full_name ?? "",
      Notes: item.notes ?? "",
    })) ?? [];

  const csv = toCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="FXA-Revenue-${year}-${String(
        month
      ).padStart(2, "0")}.csv"`,
    },
  });
}