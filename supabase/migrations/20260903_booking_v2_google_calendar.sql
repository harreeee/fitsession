-- Booking V2: trainer-published availability + Google Calendar sync.
--
-- The client never chooses an arbitrary trainer. Client booking APIs derive the
-- assigned trainer from clients.assigned_trainer_id and only expose slots that
-- the trainer explicitly publishes.

create table if not exists public.trainer_booking_slots (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  service_code text not null default 'pt_1on1',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open',
  booked_by_client_id uuid references public.clients(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_booking_slots_time_check check (ends_at > starts_at),
  constraint trainer_booking_slots_status_check check (
    status in ('open', 'booked', 'closed', 'expired')
  )
);

create unique index if not exists trainer_booking_slots_exact_time_idx
  on public.trainer_booking_slots(staff_id, starts_at, ends_at);

create index if not exists trainer_booking_slots_staff_start_idx
  on public.trainer_booking_slots(staff_id, starts_at);

create index if not exists trainer_booking_slots_open_idx
  on public.trainer_booking_slots(staff_id, starts_at)
  where status = 'open';

alter table public.bookings
  add column if not exists availability_slot_id uuid references public.trainer_booking_slots(id) on delete set null;

alter table public.bookings
  add column if not exists package_id uuid references public.session_packages(id) on delete set null;

alter table public.bookings
  add column if not exists service_code text;

alter table public.bookings
  add column if not exists sync_status text;

create unique index if not exists bookings_one_active_booking_per_slot_idx
  on public.bookings(availability_slot_id)
  where availability_slot_id is not null
    and coalesce(status, 'booked') <> 'cancelled';

create index if not exists bookings_trainer_time_idx
  on public.bookings(trainer_id, starts_at, ends_at);

create index if not exists bookings_client_time_idx
  on public.bookings(client_id, starts_at, ends_at);

-- Existing OAuth state tables in production did not consistently include a
-- timestamp. Add one so stale states can be rejected.
alter table public.google_calendar_oauth_states
  add column if not exists created_at timestamptz not null default now();

create index if not exists google_calendar_oauth_states_created_at_idx
  on public.google_calendar_oauth_states(created_at);

alter table public.trainer_booking_slots enable row level security;

drop policy if exists "staff can view own booking slots"
  on public.trainer_booking_slots;
create policy "staff can view own booking slots"
  on public.trainer_booking_slots
  for select
  to authenticated
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "staff can insert own booking slots"
  on public.trainer_booking_slots;
create policy "staff can insert own booking slots"
  on public.trainer_booking_slots
  for insert
  to authenticated
  with check (
    (staff_id = auth.uid() and created_by = auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "staff can update own booking slots"
  on public.trainer_booking_slots;
create policy "staff can update own booking slots"
  on public.trainer_booking_slots
  for update
  to authenticated
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    staff_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Atomic claim prevents two clients from taking the same published slot.
-- This RPC is intentionally service-role only; the server route authenticates
-- the client, validates assignment/package/Google free-busy, then calls it.
create or replace function public.fxa_claim_booking_slot_v2(
  p_slot_id uuid,
  p_client_id uuid,
  p_package_id uuid,
  p_created_by uuid,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_notes text default null
)
returns table (
  booking_id uuid,
  staff_id uuid,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.trainer_booking_slots%rowtype;
  v_booking_id uuid;
begin
  select *
    into v_slot
  from public.trainer_booking_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'Booking slot not found.';
  end if;

  if v_slot.status <> 'open' then
    raise exception 'This booking slot is no longer available.';
  end if;

  if v_slot.starts_at <= now() then
    raise exception 'This booking slot has already started.';
  end if;

  if not exists (
    select 1 from public.clients c where c.id = p_client_id
  ) then
    raise exception 'Client not found.';
  end if;

  if exists (
    select 1
    from public.bookings b
    where coalesce(b.status, 'booked') <> 'cancelled'
      and b.trainer_id = v_slot.staff_id
      and b.starts_at < v_slot.ends_at
      and b.ends_at > v_slot.starts_at
  ) then
    raise exception 'Trainer already has a booking during this time.';
  end if;

  if exists (
    select 1
    from public.bookings b
    where coalesce(b.status, 'booked') <> 'cancelled'
      and b.client_id = p_client_id
      and b.starts_at < v_slot.ends_at
      and b.ends_at > v_slot.starts_at
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
    availability_slot_id,
    package_id,
    service_code,
    sync_status
  ) values (
    p_client_id,
    v_slot.staff_id,
    p_client_name,
    nullif(btrim(coalesce(p_client_email, '')), ''),
    nullif(btrim(coalesce(p_client_phone, '')), ''),
    v_slot.starts_at,
    v_slot.ends_at,
    'booked',
    null,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_created_by,
    v_slot.id,
    p_package_id,
    v_slot.service_code,
    'pending'
  )
  returning id into v_booking_id;

  update public.trainer_booking_slots
  set status = 'booked',
      booked_by_client_id = p_client_id,
      updated_at = now()
  where id = v_slot.id;

  return query
  select v_booking_id, v_slot.staff_id, v_slot.starts_at, v_slot.ends_at;
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

  if not found then
    raise exception 'Booking not found.';
  end if;
end;
$$;

create or replace function public.fxa_release_booking_slot_v2(
  p_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_id uuid;
begin
  delete from public.bookings
  where id = p_booking_id
    and google_event_id is null
  returning availability_slot_id into v_slot_id;

  if v_slot_id is not null then
    update public.trainer_booking_slots
    set status = 'open',
        booked_by_client_id = null,
        updated_at = now()
    where id = v_slot_id
      and status = 'booked';
  end if;
end;
$$;

revoke all on function public.fxa_claim_booking_slot_v2(uuid, uuid, uuid, uuid, text, text, text, text) from public;
revoke all on function public.fxa_claim_booking_slot_v2(uuid, uuid, uuid, uuid, text, text, text, text) from anon;
revoke all on function public.fxa_claim_booking_slot_v2(uuid, uuid, uuid, uuid, text, text, text, text) from authenticated;
grant execute on function public.fxa_claim_booking_slot_v2(uuid, uuid, uuid, uuid, text, text, text, text) to service_role;

revoke all on function public.fxa_mark_booking_synced_v2(uuid, text) from public;
revoke all on function public.fxa_mark_booking_synced_v2(uuid, text) from anon;
revoke all on function public.fxa_mark_booking_synced_v2(uuid, text) from authenticated;
grant execute on function public.fxa_mark_booking_synced_v2(uuid, text) to service_role;

revoke all on function public.fxa_release_booking_slot_v2(uuid) from public;
revoke all on function public.fxa_release_booking_slot_v2(uuid) from anon;
revoke all on function public.fxa_release_booking_slot_v2(uuid) from authenticated;
grant execute on function public.fxa_release_booking_slot_v2(uuid) to service_role;
