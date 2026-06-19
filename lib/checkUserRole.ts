import { supabase } from "./supabaseClient";

export type UserRole = "admin" | "trainer" | "nutrition_coach" | "client" | null;

export async function getCurrentUserRole(): Promise<{
  user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
  role: UserRole;
}> {
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
    return {
      user,
      role: null,
    };
  }

  const role = profile.role;

  if (
    role === "admin" ||
    role === "trainer" ||
    role === "nutrition_coach" ||
    role === "client"
  ) {
    return {
      user,
      role,
    };
  }

  return {
    user,
    role: null,
  };
}