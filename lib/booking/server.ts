import { createClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient, getUserFromRequest } from '../supabaseServer';
export class BookingError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function bookingContext(request: Request, roles = ['admin', 'manager', 'trainer', 'client']) {
  const { user, token } = await getUserFromRequest(request);
  if (!user || !token) throw new BookingError('Please sign in again.', 401);
  const admin = createServiceSupabaseClient();
  const { data: profile, error } = await admin.from('profiles').select('id,role,full_name').eq('id', user.id).single();
  if (error || !profile || !roles.includes(profile.role)) throw new BookingError('Access denied.', 403);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  return { user, profile, db, admin };
}
export function fail(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Request failed.';
  const status = error instanceof BookingError ? error.status : /conflict|already booked|remaining|8 hours|overlap|request key/i.test(message) ? 409 : /permission|access denied|not allowed/i.test(message) ? 403 : /invalid|required|not found|unavailable|expired/i.test(message) ? 400 : 503;
  console.error('[booking]', status, message.replace(/Bearer\s+\S+/g, 'Bearer [redacted]'));
  return Response.json({ error: status === 503 ? 'The service is temporarily unavailable. Please retry.' : message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BookingError('Invalid ID.');
  return value;
}
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length') || 0) > 32000) throw new BookingError('Request too large.', 413);
  try { const body = await request.json(); if (!body || Array.isArray(body) || typeof body !== 'object') throw 0; return body; }
  catch { throw new BookingError('Invalid request.'); }
}
