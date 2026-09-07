import { createServiceSupabaseClient } from './supabaseServer';
export type CalendarConnection = { id: string; trainer_id: string; google_email: string | null; access_token: string; refresh_token: string | null; token_expiry: string | null; calendar_id: string };
export function requireEnv(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing environment variable: ${name}`); return value; }
export async function googleFetch(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(8000) });
}
export function getGoogleOAuthUrl(state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: requireEnv('GOOGLE_CLIENT_ID'), redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'), response_type: 'code', access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.freebusy','https://www.googleapis.com/auth/userinfo.email'].join(' '), state }).toString();
  return url.toString();
}
export async function exchangeCodeForTokens(code: string) {
  const res = await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: requireEnv('GOOGLE_CLIENT_ID'), client_secret: requireEnv('GOOGLE_CLIENT_SECRET'), redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'), grant_type: 'authorization_code' }) });
  const data = await res.json(); if (!res.ok || !data.access_token) throw new Error('Google authorization failed. Please reconnect.'); return data as { access_token: string; refresh_token?: string; expires_in?: number };
}
export async function getGoogleEmail(token: string): Promise<string | null> {
  const res = await googleFetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null; const data = await res.json(); return typeof data.email === 'string' ? data.email : null;
}
export async function getTrainerCalendarConnection(trainerId: string): Promise<CalendarConnection | null> {
  const { data, error } = await createServiceSupabaseClient().from('trainer_google_calendar_connections').select('id,trainer_id,google_email,access_token,refresh_token,token_expiry,calendar_id').eq('trainer_id', trainerId).maybeSingle();
  if (error) throw new Error('Calendar connection unavailable.'); return data;
}
export async function refreshGoogleAccessToken(connection: CalendarConnection) {
  if (Date.parse(connection.token_expiry || '') > Date.now() + 60000) return connection.access_token;
  if (!connection.refresh_token) throw new Error('Google Calendar needs to be reconnected.');
  const res = await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: requireEnv('GOOGLE_CLIENT_ID'), client_secret: requireEnv('GOOGLE_CLIENT_SECRET'), refresh_token: connection.refresh_token, grant_type: 'refresh_token' }) });
  const data = await res.json(); if (!res.ok || !data.access_token) throw new Error('Google Calendar needs to be reconnected.');
  const { error } = await createServiceSupabaseClient().from('trainer_google_calendar_connections').update({ access_token: data.access_token, refresh_token: data.refresh_token || connection.refresh_token, token_expiry: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('id', connection.id);
  if (error) throw new Error('Could not refresh calendar connection.'); return String(data.access_token);
}
export async function getBusyTimes(trainerId: string, timeMin: string, timeMax: string): Promise<Array<{start:string;end:string}>> {
  const c = await getTrainerCalendarConnection(trainerId); if (!c) throw new Error('Trainer calendar is not connected.');
  const token = await refreshGoogleAccessToken(c);
  const res = await googleFetch('https://www.googleapis.com/calendar/v3/freeBusy', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ timeMin, timeMax, timeZone: 'America/Toronto', items: [{ id: c.calendar_id || 'primary' }] }) });
  const data = await res.json(); const calendar = data.calendars?.[c.calendar_id || 'primary'];
  if (!res.ok || !calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new Error('Cannot verify trainer calendar availability. Please retry.');
  if (calendar.busy.some((b: {start:string;end:string}) => !Number.isFinite(Date.parse(b.start)) || !Number.isFinite(Date.parse(b.end)) || Date.parse(b.end)<=Date.parse(b.start))) throw new Error('Invalid calendar response.');
  return calendar.busy;
}
