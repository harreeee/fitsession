import { addDays, businessDate, torontoInstant } from '../businessTime';
import { getBusyTimes } from '../googleCalendar';
import { createServiceSupabaseClient } from '../supabaseServer';
import { BookingError } from './server';
import { slotsForDay, type Window, type Interval } from './time';
export async function availability(trainerId: string, day: string, clientId?: string | null) {
  const today = businessDate();
  if (day < today || day >= addDays(today,14)) throw new BookingError('Invalid booking date.');
  const start = torontoInstant(day), end = torontoInstant(addDays(day,1));
  if (!start || !end) throw new BookingError('Invalid date.');
  const db = createServiceSupabaseClient();
  const [staff,w,blocks,bookings,busy] = await Promise.all([
    db.from('profiles').select('id').eq('id',trainerId).eq('role','trainer').maybeSingle(),
    db.from('trainer_availability').select('weekday,start_minute,end_minute').eq('trainer_id',trainerId),
    db.from('trainer_time_blocks').select('starts_at,ends_at').eq('trainer_id',trainerId).lt('starts_at',end).gt('ends_at',start),
    db.from('bookings').select('starts_at,ends_at').eq('status','booked').or(clientId?`trainer_id.eq.${trainerId},client_id.eq.${clientId}`:`trainer_id.eq.${trainerId}`).lt('starts_at',end).gt('ends_at',start),
    getBusyTimes(trainerId,start,end),
  ]);
  if (staff.error || !staff.data) throw new BookingError('Trainer not found.',404);
  if (w.error || blocks.error || bookings.error) throw new Error('Availability data unavailable.');
  return slotsForDay(day,w.data as Window[],[...blocks.data,...bookings.data,...busy.map(b=>({starts_at:b.start,ends_at:b.end}))] as Interval[]);
}
