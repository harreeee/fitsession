import { supabase } from "./supabaseClient";

export async function getCurrentUserRole() {
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return {
      user: null,
      role: null,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  return {
    user: userData.user,
    role: profile?.role || null,
  };
}