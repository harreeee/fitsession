-- Booking V2 follow-up: client cancellation protection.
-- Clients may choose any trainer who has published availability, while their
-- assigned/primary trainer is only used for sorting and presentation.

create or replace function public.fxa_cancel_client_booking_v2(
  p_booking_id uuid,
  p_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_cutoff timestamptz;
begin
  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found.';
  end if;

  if v_booking.client_id is distinct from p_client_id then
    raise exception 'This booking does not belong to this client.';
  end if;

  if coalesce(v_booking.status, 'booked') = 'cancelled' then
    raise exception 'This booking is already cancelled.';
  end if;

  if v_booking.starts_at <= now() then
    raise exception 'A session that has already started cannot be cancelled.';
  end if;

  v_cutoff := v_booking.starts_at - interval '8 hours';

  if now() > v_cutoff then
    raise exception 'Sessions cannot be cancelled less than 8 hours before the start time.';
  end if;

  update public.bookings
  set status = 'cancelled',
      sync_status = 'cancelled'
  where id = p_booking_id;

  if v_booking.availability_slot_id is not null then
    update public.trainer_booking_slots
    set status = 'open',
        booked_by_client_id = null,
        updated_at = now()
    where id = v_booking.availability_slot_id
      and starts_at > now();
  end if;
end;
$$;

revoke all on function public.fxa_cancel_client_booking_v2(uuid, uuid) from public;
revoke all on function public.fxa_cancel_client_booking_v2(uuid, uuid) from anon;
revoke all on function public.fxa_cancel_client_booking_v2(uuid, uuid) from authenticated;
grant execute on function public.fxa_cancel_client_booking_v2(uuid, uuid) to service_role;
