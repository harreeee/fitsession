import { supabase } from "./supabaseClient";
import { normalizeRole, type AppRole } from "./role";

type CurrentUserRoleResult = {
  user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
  role: AppRole | null;
};

export async function getCurrentUserRole(): Promise<CurrentUserRoleResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      role: null,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error("Profile role fetch failed:", profileError);
    return {
      user,
      role: null,
    };
  }

  return {
    user,
    role: normalizeRole(profile.role),
  };
}