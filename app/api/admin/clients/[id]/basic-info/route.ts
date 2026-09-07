import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AllowedClientUpdate = {
  assigned_nutrition_coach_id?: string | null;
  assigned_trainer_id?: string | null;
  sales_person_id?: string | null;
  client_note?: string | null;
  client_code?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  client_source?: string | null;
  client_source_other?: string | null;
  status?: string | null;
};

const allowedFields = new Set<keyof AllowedClientUpdate>([
  "assigned_nutrition_coach_id",
  "assigned_trainer_id",
  "sales_person_id",
  "client_note",
  "client_code",
  "full_name",
  "email",
  "phone",
  "gender",
  "date_of_birth",
  "client_source",
  "client_source_other",
  "status",
]);

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getSupabaseUserClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase client environment variables.");
  }

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing client id." },
        { status: 400 }
      );
    }

    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const accessToken = authorization.replace("Bearer ", "").trim();

    const userClient = getSupabaseUserClient(accessToken);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, has_manager_access")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found." },
        { status: 403 }
      );
    }

    if (profile.role !== "admin" && profile.role !== "manager" && !(profile.role === "trainer" && profile.has_manager_access)) {
      return NextResponse.json(
        { error: "You do not have permission to edit client information." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updatePayload: AllowedClientUpdate = {};

    for (const [key, value] of Object.entries(body)) {
      if (!allowedFields.has(key as keyof AllowedClientUpdate)) {
        return NextResponse.json(
          { error: `Field "${key}" cannot be edited here.` },
          { status: 400 }
        );
      }

      if (value !== null && typeof value !== "string") {
        return NextResponse.json(
          { error: `Field "${key}" must be a string or null.` },
          { status: 400 }
        );
      }

      updatePayload[key as keyof AllowedClientUpdate] = value;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided." },
        { status: 400 }
      );
    }

    if(profile.role!=="admin" && Object.hasOwn(updatePayload,"client_code"))return NextResponse.json({error:"Only admins may edit client codes."},{status:403});
    if(updatePayload.full_name!==undefined && !updatePayload.full_name?.trim())return NextResponse.json({error:"Client name is required."},{status:400});
    for(const [key,roles] of [["assigned_trainer_id",["trainer"]],["assigned_nutrition_coach_id",["nutrition_coach"]],["sales_person_id",["trainer","nutrition_coach","admin"]]] as const){
      const value=updatePayload[key];if(value){const result=await supabaseAdmin.from("profiles").select("id").eq("id",value).in("role",[...roles]).single();if(result.error)return NextResponse.json({error:"Selected staff member is invalid."},{status:400});}
    }
    const { data: updatedClient, error: updateError } = await supabaseAdmin
      .from("clients")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      client: updatedClient,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}