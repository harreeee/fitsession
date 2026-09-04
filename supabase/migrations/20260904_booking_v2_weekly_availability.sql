-- Booking V2 weekly availability model.
-- FXA stores recurring trainer working windows and derives bookable times at request time.
-- Google Calendar remains the external busy/free source, while FXA bookings remain the booking source of truth.

create table if not exists public.trainer_availability_rules (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  weekday integer not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_availability_rules_weekday_check check (weekday between 0 and 6),
  constraint trainer_availability_rules_time_check check (end_time > start_time)
);

create index if not exists trainer_availability_rules_trainer_weekday_idx
  on public.trainer_availability_rules(trainer_id, weekday)
  where is_active = true;

alter table public.trainer_availability_rules enable row level security;

drop policy if exists "trainer can read own availability" on public.trainer_availability_rules;
create policy "trainer can read own availability"
  on public.trainer_availability_rules
  for select
  to authenticated
  using (
    trainer_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "trainer can insert own availability" on public.trainer_availability_rules;
create policy "trainer can insert own availability"
  on public.trainer_availability_rules
  for insert
  to authenticated
  with check (
    trainer_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "trainer can update own availability" on public.trainer_availability_rules;
create policy "trainer can update own availability"
  on public.trainer_availability_rules
  for update
  to authenticated
  using (
    trainer_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    trainer_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "trainer can delete own availability" on public.trainer_availability_rules;
create policy "trainer can delete own availability"
  on public.trainer_availability_rules
  for delete
  to authenticated
  using (
    trainer_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

alter table public.bookings
  add column if not exists package_id uuid references public.session_packages(id) on delete set null;

alter table public.bookings
  add column if not exists service_code text;

alter table public.bookings
  add column if not exists sync_status text;

create index if not exists bookings_trainer_time_idx
  on public.bookings(trainer_id, starts_at, ends_at);

create index if not exists bookings_client_time_idx
  on public.bookings(client_id, starts_at, ends_at);

-- OAuth state must expire; older deployments did not always include this column.
alter table public.google_calendar_oauth_states
  add column if not exists created_at timestamptz not null default now();

create index if not exists google_calendar_oauth_states_created_at_idx
  on public.google_calendar_oauth_states(created_at);

create or replace function public.fxa_create_booking_v2(
  p_client_id uuid,
  p_trainer_id uuid,
  p_package_id uuid,
  p_created_by uuid,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
begin
  if p_starts_at < now() + interval '2 hours' then
    raise exception 'Sessions must be booked at least 2 hours in advance.';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'Invalid booking time.';
  end if;

  -- Serialize attempts for the same trainer/start to prevent double booking races.
  perform pg_advisory_xact_lock(hashtext(p_trainer_id::text || '|' || p_starts_at::text));

  if exists (
    select 1 from public.bookings b
    where coalesce(b.status, 'booked') <> 'cancelled'
      and b.trainer_id = p_trainer_id
      and b.starts_at < p_ends_at
      and b.ends_at > p_starts_at
  ) then
    raise exception 'Trainer already has a booking during this time.';
  end if;

  if exists (
    select 1 from public.bookings b
    where coalesce(b.status, 'booked') <> 'cancelled'
      and b.client_id = p_client_id
      and b.starts_at < p_ends_at
      and b.ends_at > p_starts_at
  ) then
    raise exception 'You already have another booking during this time.';
  end if;

  insert into public.bookings (
    client_id,
    trainer_id,
    client_name,
    client_email,
    client_phone,
    starts_at,
    ends_at,
    status,
    google_event_id,
    notes,
    created_by,
    package_id,
    service_code,
    sync_status
  ) values (
    p_client_id,
    p_trainer_id,
    p_client_name,
    nullif(btrim(coalesce(p_client_email, '')), ''),
    nullif(btrim(coalesce(p_client_phone, '')), ''),
    p_starts_at,
    p_ends_at,
    'booked',
    null,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_created_by,
    p_package_id,
    'pt_1on1',
    'pending_google_sync'
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

create or replace function public.fxa_mark_booking_synced_v2(
  p_booking_id uuid,
  p_google_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
  set google_event_id = p_google_event_id,
      sync_status = 'synced'
  where id = p_booking_id;

  if not found then raise exception 'Booking not found.'; end if;
end;
$$;

create or replace function public.fxa_mark_booking_google_pending_v2(
  p_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
  set sync_status = 'pending_google_sync'
  where id = p_booking_id;
end;
$$;

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
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then raise exception 'Booking not found.'; end if;
  if v_booking.client_id is distinct from p_client_id then
    raise exception 'This booking does not belong to this client.';
  end if;
  if coalesce(v_booking.status, 'booked') = 'cancelled' then
    raise exception 'This booking is already cancelled.';
  end if;
  if now() > v_booking.starts_at - interval '8 hours' then
    raise exception 'Sessions cannot be cancelled less than 8 hours before the start time.';
  end if;

  update public.bookings
  set status = 'cancelled',
      sync_status = case
        when google_event_id is null then 'cancelled'
        else 'cancel_pending_google_cleanup'
      end
  where id = p_booking_id;
end;
$$;

revoke all on function public.fxa_create_booking_v2(uuid, uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.fxa_create_booking_v2(uuid, uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, text) to service_role;

revoke all on function public.fxa_mark_booking_synced_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.fxa_mark_booking_synced_v2(uuid, text) to service_role;

revoke all on function public.fxa_mark_booking_google_pending_v2(uuid) from public, anon, authenticated;
grant execute on function public.fxa_mark_booking_google_pending_v2(uuid) to service_role;

revoke all on function public.fxa_cancel_client_booking_v2(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fxa_cancel_client_booking_v2(uuid, uuid) to service_role;
