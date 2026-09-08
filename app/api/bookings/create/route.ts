import { after } from 'next/server';
import { bookingContext, fail, uuid, jsonBody, BookingError } from '@/lib/booking/server';
import { availability } from '@/lib/booking/availability';
import { businessDate } from '@/lib/businessTime';
import { sendTrainerBookingEmail } from '@/lib/booking/notifications';
import { syncBooking } from '@/lib/booking/sync';

export const runtime = 'nodejs';

function runAfterExistingBooking(id: string) {
  after(() => syncBooking(id));
}

function runAfterNewBooking(id: string) {
  after(async () => {
    const outcomes = await Promise.allSettled([
      syncBooking(id),
      sendTrainerBookingEmail(id),
    ]);

    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        console.error('[booking-create] after-booking task failed:', outcome.reason);
      }
    }
  });
}

export async function POST(request: Request) {
  try {
    const { db, admin, user, profile } = await bookingContext(request, [
      'client',
      'admin',
    ]);
    const body = await jsonBody(request);
    const trainerId = uuid(body.trainerId);
    const requestId = uuid(body.requestId);

    if (
      typeof body.startsAt !== 'string' ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(body.startsAt) ||
      !Number.isFinite(Date.parse(body.startsAt))
    ) {
      throw new BookingError('Invalid booking time.');
    }

    const startsAt = new Date(body.startsAt).toISOString();
    const explicitClient = body.clientId ? uuid(body.clientId) : null;

    if (explicitClient && profile.role !== 'admin') {
      throw new BookingError('Access denied.', 403);
    }

    const { data: previous, error: previousError } = await admin
      .from('bookings')
      .select('id, trainer_id, starts_at, status, ends_at, google_sync_status, client_id')
      .eq('created_by', user.id)
      .eq('request_id', requestId)
      .maybeSingle();

    if (previousError) throw previousError;

    if (previous) {
      if (
        previous.trainer_id !== trainerId ||
        Date.parse(previous.starts_at) !== Date.parse(startsAt) ||
        (explicitClient && previous.client_id !== explicitClient)
      ) {
        throw new BookingError('Request key already used.', 409);
      }

      runAfterExistingBooking(previous.id);
      return Response.json({ ok: true, booking: previous });
    }

    let clientId = explicitClient;

    if (!clientId) {
      const { data, error } = await admin
        .from('clients')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (error || !data) throw new BookingError('Linked client account required.');
      clientId = data.id;
    }

    const slots = await availability(trainerId, businessDate(startsAt), clientId);

    if (!slots.some((slot) => slot.starts_at === startsAt)) {
      throw new BookingError('Slot is no longer available. Please choose another.', 409);
    }

    const grant = await admin.rpc('fxa_issue_slot_grant', {
      p_actor: user.id,
      p_trainer: trainerId,
      p_start: startsAt,
    });
    if (grant.error) throw grant.error;

    const { data, error } = await db.rpc('fxa_reserve_booking', {
      p_trainer_id: trainerId,
      p_starts_at: startsAt,
      p_request_id: requestId,
      p_grant_id: grant.data,
      p_client_id: explicitClient,
    });
    if (error) throw error;
    if (!data?.id) throw new BookingError('Booking could not be confirmed.', 500);

    runAfterNewBooking(data.id);

    return Response.json({ ok: true, booking: data }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
