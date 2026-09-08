import { createServiceSupabaseClient, getUserFromRequest } from "@/lib/supabaseServer";
import { isNutritionRole } from "@/lib/nutrition";

export class NutritionAccessError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function getNutritionAccessContext(request: Request) {
  const { user } = await getUserFromRequest(request);

  if (!user) {
    throw new NutritionAccessError("Please sign in again.", 401);
  }

  const admin = createServiceSupabaseClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("id", user.id)
    .single();

  if (error || !profile || !isNutritionRole(profile.role)) {
    throw new NutritionAccessError("Nutrition access denied.", 403);
  }

  return {
    user,
    admin,
    profile: {
      id: profile.id as string,
      role: String(profile.role || ""),
      fullName: String(profile.full_name || profile.email || "Staff"),
    },
  };
}

export function canManageNutritionAssignments(role: string) {
  return role === "admin" || role === "manager";
}

export function canEditNutritionRequirement(role: string) {
  return role === "admin" || role === "manager";
}

export function canRecordNutritionFollow(role: string) {
  return role === "admin" || role === "manager" || role === "nutrition_coach";
}

export function nutritionFail(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  const status = error instanceof NutritionAccessError ? error.status : 500;

  console.error("[nutrition]", status, message);

  return Response.json(
    { error: status >= 500 ? "The service is temporarily unavailable." : message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
