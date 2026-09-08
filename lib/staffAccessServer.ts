import { createServiceSupabaseClient, getUserFromRequest } from "./supabaseServer";
import {
  canUseStaffFeature,
  toStaffAccessSnapshot,
  type StaffAccessProfile,
  type StaffFeature,
} from "./staffAccess";

export class StaffAccessError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function getStaffAccessContext(request: Request) {
  const { user } = await getUserFromRequest(request);

  if (!user) {
    throw new StaffAccessError("Please sign in again.", 401);
  }

  const admin = createServiceSupabaseClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, role, full_name, can_view_revenue, can_view_clients, can_view_booked_calendar",
    )
    .eq("id", user.id)
    .single();

  if (error || !data) {
    throw new StaffAccessError("Could not verify staff access.", 403);
  }

  return {
    user,
    admin,
    profile: data as StaffAccessProfile,
    access: toStaffAccessSnapshot(data as StaffAccessProfile),
  };
}

export async function requireStaffFeature(
  request: Request,
  feature: StaffFeature,
) {
  const context = await getStaffAccessContext(request);

  if (!canUseStaffFeature(context.profile, feature)) {
    throw new StaffAccessError("Access denied.", 403);
  }

  return context;
}

export async function requireAdminAccess(request: Request) {
  const context = await getStaffAccessContext(request);

  if (context.profile.role !== "admin") {
    throw new StaffAccessError("Admin access is required.", 403);
  }

  return context;
}

export function staffAccessFail(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  const status = error instanceof StaffAccessError ? error.status : 500;

  console.error("[staff-access]", status, message);

  return Response.json(
    { error: status >= 500 ? "The service is temporarily unavailable." : message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
