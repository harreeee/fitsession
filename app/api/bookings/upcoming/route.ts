import { after } from 'next/server';
import { bookingContext, fail, BookingError, uuid } from '@/lib/booking/server';
import { canClientCancel } from '@/lib/booking/time';
import { syncBooking } from '@/lib/booking/sync';

function canViewAll(role: string) {
  return role === 'admin' || role === 'manager';
}

export async function GET(request: Request) {
  try {
    const { db, admin, user, profile } = await bookingContext(request);
    const params = new URL(request.url).searchParams;
    const explicitClient = params.get('clientId');
    const explicitTrainer = params.get('trainerId');

    if (explicitClient && !canViewAll(profile.role) && profile.role !== 'admin') {
      throw new BookingError('Access denied.', 403);
    }

    let query = db
      .from('bookings')
      .select('id,client_id,trainer_id,client_name,starts_at,ends_at,status,google_sync_status')
      .eq('status', 'booked')
      .order('starts_at')
      .limit(250);

    if (explicitClient) query = query.eq('client_id', uuid(explicitClient));

    if (profile.role === 'trainer') {
      if (explicitTrainer && explicitTrainer !== user.id) throw new BookingError('Access denied.', 403);
      query = query.eq('trainer_id', user.id);
    } else if (explicitTrainer) {
      if (!canViewAll(profile.role)) throw new BookingError('Access denied.', 403);
      query = query.eq('trainer_id', uuid(explicitTrainer));
    }

    if (profile.role === 'client') {
      const { data, error } = await admin.from('clients').select('id').eq('profile_id', user.id).single();
      if (error || !data) throw new BookingError('Linked client account required.');
      query = query.eq('client_id', data.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const trainerIds = [...new Set((data || []).map((booking) => booking.trainer_id))];
    const { data: staff, error: staffError } = trainerIds.length
      ? await admin.from('profiles').select('id,full_name,email').in('id', trainerIds)
      : { data: [], error: null };
    if (staffError) throw staffError;

    const names = new Map((staff || []).map((person) => [person.id, person.full_name || 'Trainer']));
    const emails = new Map((staff || []).map((person) => [person.id, person.email || null]));
    const bookings = (data || []).map((booking) => ({
      ...booking,
      trainer_name: names.get(booking.trainer_id) || 'Trainer',
      trainer_email: emails.get(booking.trainer_id) || null,
      can_cancel:
        profile.role === 'client'
          ? canClientCancel(booking.starts_at)
          : ['admin', 'manager', 'trainer'].includes(profile.role) && Date.parse(booking.starts_at) > Date.now(),
    }));

    const pending = bookings.filter((booking) => booking.google_sync_status !== 'synced').slice(0, 3);
    after(async () => {
      for (const booking of pending) await syncBooking(booking.id);
    });

    return Response.json(
      { bookings, viewer: profile, serverTime: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return fail(error);
  }
}
