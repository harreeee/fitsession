import { supabase } from "./supabaseClient";

export type UserRole =
  | "admin"
  | "manager"
  | "trainer"
  | "client"
  | "nutrition_coach"
  | null;

export async function getCurrentUserRole(): Promise<{
  user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
  role: UserRole;
}> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    return {
      user: null,
      role: null,
    };
  }

  const user = session.user;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("getCurrentUserRole profile error:", profileError.message);

    return {
      user,
      role: null,
    };
  }

  return {
    user,
    role: (profile?.role as UserRole) || null,
  };
}