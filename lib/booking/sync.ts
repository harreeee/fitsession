import { createServiceSupabaseClient } from '../supabaseServer';
import { getTrainerCalendarConnection, googleFetch, refreshGoogleAccessToken } from '../googleCalendar';
export const googleEventId = (id: string) => 'fa' + id.replaceAll('-', '').toLowerCase();
/** Persistent lease + deterministic Google event ID: retry without duplicate events. */
export async function syncBooking(id: string): Promise<void> {
  const db = createServiceSupabaseClient();
  const { data: b, error } = await db.rpc('fxa_claim_booking_sync', { p_booking_id: id });
  if (error || !b) return;
  let eventId: string | null = b.google_event_id || null; let problem: string | null = null;
  try {
    const c = await getTrainerCalendarConnection(b.trainer_id); if (!c) throw new Error('Reconnect Google Calendar.');
    const token = await refreshGoogleAccessToken(c);
    eventId = eventId || googleEventId(b.id);
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.calendar_id || 'primary')}/events`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (b.status === 'cancelled') {
      const res = await googleFetch(`${base}/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: 'DELETE', headers });
      if (!res.ok && ![404,410].includes(res.status)) throw new Error('Calendar cancellation pending.');
    } else {
      // Previously-created bookings have Google IDs but no FXA private property.
      // Verify the linked event rather than attempting to re-create it.
      if(b.google_event_id){
        const linked=await googleFetch(`${base}/${encodeURIComponent(eventId)}`,{headers});
        if(linked.ok){const existing=await linked.json();
          if(existing.status==='cancelled'||Date.parse(existing.start?.dateTime)!==Date.parse(b.starts_at)||Date.parse(existing.end?.dateTime)!==Date.parse(b.ends_at))throw new Error('Calendar event differs from FXA. Admin review required.');
          await db.rpc('fxa_finish_booking_sync',{p_booking_id:b.id,p_lease:b.lease,p_version:b.sync_version,p_event_id:eventId,p_error:null});
          const {data:latest}=await db.from('bookings').select('sync_version,google_sync_status').eq('id',id).maybeSingle();
          if(latest&&latest.sync_version!==b.sync_version&&latest.google_sync_status==='pending')await syncBooking(id);
          return;
        }
        if(linked.status!==404)throw new Error('Calendar event requires admin review.');
      }
      const res = await googleFetch(`${base}?sendUpdates=all`, { method: 'POST', headers, body: JSON.stringify({ id: eventId, summary: `FXA Session - ${b.client_name}`, description: `FXA training session. Manage bookings and cancellations in your FXA account.`, start: { dateTime: b.starts_at, timeZone: 'America/Toronto' }, end: { dateTime: b.ends_at, timeZone: 'America/Toronto' }, attendees: b.client_email ? [{email:b.client_email}] : [], extendedProperties: { private: { fxaBookingId: b.id } } }) });
      if (res.status === 409) {
        const existing = await googleFetch(`${base}/${encodeURIComponent(eventId)}`, { headers });
        const record = await existing.json();
        if (!existing.ok || record.status==='cancelled' || record.extendedProperties?.private?.fxaBookingId!==b.id) throw new Error('Calendar event requires admin review.');
      } else if (!res.ok) throw new Error('Calendar invitation pending.');
    }
  } catch (e) { problem = e instanceof Error ? e.message : 'Calendar sync pending.'; }
  const finished = await db.rpc('fxa_finish_booking_sync', { p_booking_id: b.id, p_lease: b.lease, p_version: b.sync_version, p_event_id: eventId, p_error: problem });
  if (finished.error) console.error('[booking-sync] could not persist sync outcome');
  // If cancellation arrived while a create was in flight, process the new version.
  const { data: current } = await db.from('bookings').select('sync_version,google_sync_status').eq('id',id).maybeSingle();
  if (current && current.sync_version !== b.sync_version && current.google_sync_status==='pending') await syncBooking(id);
}
