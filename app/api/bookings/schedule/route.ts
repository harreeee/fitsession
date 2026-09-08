import { bookingContext, fail, jsonBody, uuid, BookingError } from '@/lib/booking/server';
import { getTrainerCalendarConnection } from '@/lib/googleCalendar';

type ViewerProfile = { role: string };
type WindowInput = { weekday: number; start_minute: number; end_minute: number };

function canViewAll(profile: ViewerProfile) {
  return profile.role === 'admin' || profile.role === 'manager';
}

async function resolveTrainerId(input: {
  rawTrainerId: string | null;
  userId: string;
  profile: ViewerProfile;
  admin: ReturnType<typeof import('@/lib/supabaseServer').createServiceSupabaseClient>;
  requireTarget?: boolean;
}) {
  if (input.profile.role === 'trainer') {
    if (input.rawTrainerId && input.rawTrainerId !== input.userId) {
      throw new BookingError('Access denied.', 403);
    }
    return input.userId;
  }

  if (!canViewAll(input.profile)) throw new BookingError('Access denied.', 403);
  if (!input.rawTrainerId) {
    if (input.requireTarget) throw new BookingError('Choose a trainer first.');
    return null;
  }

  const trainerId = uuid(input.rawTrainerId);
  const { data, error } = await input.admin
    .from('profiles')
    .select('id, role')
    .eq('id', trainerId)
    .eq('role', 'trainer')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new BookingError('Trainer not found.', 404);
  return trainerId;
}

function normalizeWindows(value: unknown): WindowInput[] {
  if (!Array.isArray(value) || value.length > 42) {
    throw new BookingError('Invalid weekly availability.');
  }

  const windows = value.map((item) => {
    const row = item as Record<string, unknown>;
    const weekday = Number(row.weekday);
    const start = Number(row.start_minute);
    const end = Number(row.end_minute);

    if (
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6 ||
      !Number.isInteger(start) ||
      start < 0 ||
      start > 1380 ||
      !Number.isInteger(end) ||
      end < 60 ||
      end > 1440 ||
      end - start < 60
    ) {
      throw new BookingError('Invalid weekly availability.');
    }

    return { weekday, start_minute: start, end_minute: end };
  });

  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      const a = windows[i];
      const b = windows[j];
      if (a.weekday === b.weekday && a.start_minute < b.end_minute && a.end_minute > b.start_minute) {
        throw new BookingError('Availability windows overlap.');
      }
    }
  }

  return windows.sort((a, b) => a.weekday - b.weekday || a.start_minute - b.start_minute);
}

function cleanReason(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

function parseFutureDate(value: unknown, label: string) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new BookingError(`${label} is invalid.`);
  }
  return new Date(value).toISOString();
}

export async function GET(request: Request) {
  try {
    const { admin, user, profile } = await bookingContext(request, ['trainer', 'admin', 'manager']);
    const params = new URL(request.url).searchParams;
    const trainerId = await resolveTrainerId({
      rawTrainerId: params.get('trainerId'),
      userId: user.id,
      profile,
      admin,
    });

    if (!trainerId) {
      return Response.json(
        { windows: [], blocks: [], connection: null, trainerId: null, viewer: profile },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const [windowsResult, blocksResult, connection] = await Promise.all([
      admin
        .from('trainer_availability')
        .select('weekday,start_minute,end_minute')
        .eq('trainer_id', trainerId)
        .order('weekday')
        .order('start_minute'),
      admin
        .from('trainer_time_blocks')
        .select('id,starts_at,ends_at,reason')
        .eq('trainer_id', trainerId)
        .gt('ends_at', new Date().toISOString())
        .order('starts_at'),
      getTrainerCalendarConnection(trainerId),
    ]);

    if (windowsResult.error || blocksResult.error) {
      throw windowsResult.error || blocksResult.error;
    }

    return Response.json(
      {
        windows: windowsResult.data || [],
        blocks: blocksResult.data || [],
        connection: connection ? { google_email: connection.google_email, connected: true } : null,
        trainerId,
        viewer: profile,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { admin, user, profile } = await bookingContext(request, ['trainer', 'admin', 'manager']);
    const body = await jsonBody(request);
    const trainerId = await resolveTrainerId({
      rawTrainerId: typeof body.trainerId === 'string' ? body.trainerId : null,
      userId: user.id,
      profile,
      admin,
      requireTarget: true,
    });
    if (!trainerId) throw new BookingError('Choose a trainer first.');

    const windows = normalizeWindows(body.windows);
    const { error: deleteError } = await admin.from('trainer_availability').delete().eq('trainer_id', trainerId);
    if (deleteError) throw deleteError;

    if (windows.length) {
      const { error: insertError } = await admin.from('trainer_availability').insert(
        windows.map((window) => ({ ...window, trainer_id: trainerId })),
      );
      if (insertError) throw insertError;
    }

    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile } = await bookingContext(request, ['trainer', 'admin', 'manager']);
    const body = await jsonBody(request);
    const trainerId = await resolveTrainerId({
      rawTrainerId: typeof body.trainerId === 'string' ? body.trainerId : null,
      userId: user.id,
      profile,
      admin,
      requireTarget: true,
    });
    if (!trainerId) throw new BookingError('Choose a trainer first.');

    const startsAt = parseFutureDate(body.startsAt, 'Block start');
    const endsAt = parseFutureDate(body.endsAt, 'Block end');
    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);

    if (endMs <= startMs || endMs <= Date.now() || endMs - startMs > 31 * 24 * 60 * 60 * 1000) {
      throw new BookingError('Invalid block time.');
    }

    const { data: overlap, error: overlapError } = await admin
      .from('bookings')
      .select('id')
      .eq('trainer_id', trainerId)
      .eq('status', 'booked')
      .lt('starts_at', endsAt)
      .gt('ends_at', startsAt)
      .limit(1);

    if (overlapError) throw overlapError;
    if (overlap && overlap.length > 0) throw new BookingError('Block overlaps a confirmed booking.', 409);

    const { data, error } = await admin
      .from('trainer_time_blocks')
      .insert({ trainer_id: trainerId, starts_at: startsAt, ends_at: endsAt, reason: cleanReason(body.reason) })
      .select('id')
      .single();

    if (error) throw error;
    return Response.json({ id: data.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, user, profile } = await bookingContext(request, ['trainer', 'admin', 'manager']);
    const body = await jsonBody(request);
    const trainerId = await resolveTrainerId({
      rawTrainerId: typeof body.trainerId === 'string' ? body.trainerId : null,
      userId: user.id,
      profile,
      admin,
      requireTarget: true,
    });
    if (!trainerId) throw new BookingError('Choose a trainer first.');

    const blockId = uuid(body.id);
    const { data, error } = await admin
      .from('trainer_time_blocks')
      .delete()
      .eq('id', blockId)
      .eq('trainer_id', trainerId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new BookingError('Block not found.', 404);

    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return fail(error);
  }
}
