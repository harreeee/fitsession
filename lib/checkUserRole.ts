import { supabase } from "./supabaseClient";

export async function getCurrentUserRole() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("getCurrentUserRole auth error:", userError.message);
    return { user: null, role: null };
  }

  if (!user) {
    console.error("getCurrentUserRole: no logged-in user");
    return { user: null, role: null };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("getCurrentUserRole profile error:", profileError.message);
    return { user, role: null };
  }

  if (!profile) {
    console.error("getCurrentUserRole: no profile row for user id:", user.id);
    return { user, role: null };
  }

  if (!profile.role) {
    console.error("getCurrentUserRole: profile exists but role is empty:", profile);
    return { user, role: null };
  }

  return { user, role: profile.role };
}