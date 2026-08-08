import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type UserRole =
  | "admin"
  | "manager"
  | "marketing_manager"
  | "trainer"
  | "nutrition_coach"
  | "client";

export type CurrentUserRoleResult = {
  user: User | null;
  role: UserRole | null;
  hasManagerAccess: boolean;
  error: string | null;
};

function isUserRole(value: unknown): value is UserRole {
  return (
    value === "admin" ||
    value === "manager" ||
    value === "marketing_manager" ||
    value === "trainer" ||
    value === "nutrition_coach" ||
    value === "client"
  );
}

export async function getCurrentUserRole(): Promise<CurrentUserRoleResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      role: null,
      hasManagerAccess: false,
      error: userError?.message || "User is not signed in.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, has_manager_access")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      user,
      role: null,
      hasManagerAccess: false,
      error: profileError.message,
    };
  }

  const role = isUserRole(profile?.role) ? profile.role : null;

  return {
    user,
    role,
    hasManagerAccess: profile?.has_manager_access === true,
    error: role ? null : "Invalid or missing user role.",
  };
}