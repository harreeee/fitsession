import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function createServiceSupabaseClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function getUserFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return {
      user: null,
      token: null,
      error: "Missing authorization token.",
    };
  }

  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return {
      user: null,
      token,
      error: error?.message || "Invalid authorization token.",
    };
  }

  return {
    user: data.user,
    token,
    error: null,
  };
}

export async function getUserRole(userId: string) {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return typeof data?.role === "string" ? data.role : "";
}