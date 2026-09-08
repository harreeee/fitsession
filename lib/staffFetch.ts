import { supabase } from "./supabaseClient";

export async function staffFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your login session has expired. Please sign in again.");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok || !data) {
    throw new Error(data?.error || `Request failed with ${response.status}.`);
  }

  return data;
}
