import { supabase } from '../supabaseClient';
export async function bookingFetch<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in again.');
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}
