-- FXA repair. Apply only to staging first, with the matching application build.
-- No historical payment backfill and no production data changes in this branch.
begin;
create schema if not exists fxa_private;
revoke all on schema fxa_private from public, anon, authenticated;
create table if not exists fxa_private.operations (
  actor_id uuid not null, request_id uuid not null, action text not null,
  payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key (actor_id, request_id, action)
);
alter table fxa_private.operations enable row level security;
create or replace function fxa_private.require_role(allowed text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); r text;
begin
  select role into r from public.profiles where id=u;
  if u is null or r is null or not (r=any(allowed)) then raise exception 'Access denied.' using errcode='42501'; end if;
  return u;
end $$;
create or replace function fxa_private.replay(k uuid, a text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old fxa_private.operations%rowtype;
begin
  if auth.uid() is null or k is null then raise exception 'Request key required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||k::text||a, 17));
  select * into old from fxa_private.operations where actor_id=auth.uid() and request_id=k and action=a;
  if found and old.payload is distinct from p then raise exception 'Request key was already used with different input.'; end if;
  return old.result;
end $$;
create or replace function fxa_private.remember(k uuid,a text,p jsonb,r jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into fxa_private.operations(actor_id,request_id,action,payload,result) values(auth.uid(),k,a,p,r);
  return r;
end $$;

create table if not exists public.trainer_availability (
  id uuid primary key default gen_random_uuid(), trainer_id uuid not null references public.profiles(id),
  weekday integer not null check(weekday between 0 and 6),
  start_minute integer not null check(start_minute between 0 and 1380),
  end_minute integer not null check(end_minute between 60 and 1440),
  check(end_minute-start_minute>=60), unique(trainer_id,weekday,start_minute)
);
create table if not exists public.trainer_time_blocks (
  id uuid primary key default gen_random_uuid(), trainer_id uuid not null references public.profiles(id),
  starts_at timestamptz not null, ends_at timestamptz not null, reason text,
  check(ends_at>starts_at), created_at timestamptz not null default now()
);
create index if not exists trainer_blocks_time_idx on public.trainer_time_blocks(trainer_id,starts_at,ends_at);
alter table public.trainer_availability enable row level security;
alter table public.trainer_time_blocks enable row level security;
revoke all on public.trainer_availability,public.trainer_time_blocks from anon,authenticated;
grant select on public.trainer_availability,public.trainer_time_blocks to authenticated;
grant all on public.trainer_availability,public.trainer_time_blocks to service_role;
create policy fxa_availability_read on public.trainer_availability for select to authenticated using (
 trainer_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','manager')));
create policy fxa_blocks_read on public.trainer_time_blocks for select to authenticated using (
 trainer_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','manager')));

alter table public.bookings add column if not exists package_id uuid references public.session_packages(id);
alter table public.bookings add column if not exists request_id uuid;
alter table public.bookings add column if not exists cancelled_by uuid references public.profiles(id);
alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings add column if not exists cancel_reason text;
alter table public.bookings add column if not exists google_sync_status text not null default 'pending';
alter table public.bookings add column if not exists sync_version integer not null default 1;
alter table public.bookings add column if not exists sync_lease uuid;
alter table public.bookings add column if not exists sync_locked_until timestamptz;
alter table public.bookings add column if not exists last_sync_error text;
alter table public.bookings add column if not exists updated_at timestamptz not null default now();
create unique index if not exists fxa_booking_request_idx on public.bookings(created_by,request_id) where request_id is not null;
create index if not exists fxa_booking_trainer_time_idx on public.bookings(trainer_id,starts_at,ends_at) where status='booked';
create index if not exists fxa_booking_client_time_idx on public.bookings(client_id,starts_at,ends_at) where status='booked';
create index if not exists fxa_booking_package_idx on public.bookings(package_id) where status='booked';
alter table public.session_history add column if not exists booking_id uuid references public.bookings(id);
create unique index if not exists fxa_history_booking_idx on public.session_history(booking_id) where booking_id is not null;
-- Remove all older permissive policies; writes must go through checked RPCs.
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='bookings' loop
 execute format('drop policy %I on public.bookings',p.policyname); end loop;
end $$;
alter table public.bookings enable row level security;
revoke all on public.bookings from anon,authenticated;
grant select on public.bookings to authenticated;
grant all on public.bookings to service_role;
create policy fxa_booking_read on public.bookings for select to authenticated using (
 exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','manager'))
 or (trainer_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='trainer'))
 or exists(select 1 from public.clients where id=bookings.client_id and profile_id=auth.uid())
);
-- Connection secrets are server-only; metadata is exposed by a sanitized API.
revoke all on public.trainer_google_calendar_connections,public.google_calendar_oauth_states from anon,authenticated;
grant all on public.trainer_google_calendar_connections,public.google_calendar_oauth_states to service_role;

create or replace function public.fxa_save_availability(p_windows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['trainer','admin']); w jsonb; x record;
begin
 perform pg_advisory_xact_lock(hashtextextended('trainer:'||u::text,0));
 if p_windows is null or jsonb_typeof(p_windows)<>'array' or jsonb_array_length(p_windows)>42 then raise exception 'Invalid weekly availability.'; end if;
 for w in select * from jsonb_array_elements(p_windows) loop
  if not (w ?& array['weekday','start_minute','end_minute'])
    or (w->>'weekday')::int not between 0 and 6 or (w->>'start_minute')::int not between 0 and 1380
    or (w->>'end_minute')::int not between 60 and 1440 or (w->>'end_minute')::int-(w->>'start_minute')::int<60 then
    raise exception 'Invalid weekly availability.'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_windows) with ordinality a(w,i),jsonb_array_elements(p_windows) with ordinality b(w,i)
   where a.i<b.i and a.w->>'weekday'=b.w->>'weekday' and (a.w->>'start_minute')::int<(b.w->>'end_minute')::int and (a.w->>'end_minute')::int>(b.w->>'start_minute')::int) then
   raise exception 'Availability windows overlap.'; end if;
 delete from public.trainer_availability where trainer_id=u;
 insert into public.trainer_availability(trainer_id,weekday,start_minute,end_minute)
 select u,(v->>'weekday')::int,(v->>'start_minute')::int,(v->>'end_minute')::int from jsonb_array_elements(p_windows) v;
end $$;
create or replace function public.fxa_block_time(p_starts_at timestamptz,p_ends_at timestamptz,p_reason text default '',p_delete_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['trainer','admin']); b uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('trainer:'||u::text,0));
 if p_delete_id is not null then
  delete from public.trainer_time_blocks where id=p_delete_id and trainer_id=u returning id into b;
  if b is null then raise exception 'Block not found.'; end if; return b;
 end if;
 if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at) or not isfinite(p_ends_at) or p_ends_at<=p_starts_at or p_ends_at<=now() or p_ends_at-p_starts_at>interval '31 days' then raise exception 'Invalid block time.'; end if;
 if exists(select 1 from public.bookings where trainer_id=u and status='booked' and starts_at<p_ends_at and ends_at>p_starts_at) then raise exception 'Block overlaps a confirmed booking.'; end if;
 insert into public.trainer_time_blocks(trainer_id,starts_at,ends_at,reason) values(u,p_starts_at,p_ends_at,left(p_reason,500)) returning id into b;
 return b;
end $$;
create or replace function public.fxa_reserve_booking(p_trainer_id uuid,p_starts_at timestamptz,p_request_id uuid,p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['client','admin']); c public.clients%rowtype; sp public.session_packages%rowtype; b public.bookings%rowtype;
 p jsonb:=jsonb_build_object('trainer',p_trainer_id,'start',p_starts_at,'client',p_client_id); old jsonb; e timestamptz:=p_starts_at+interval '1 hour'; d date; m int;
begin
 old:=fxa_private.replay(p_request_id,'booking',p); if old is not null then return old; end if;
 if p_starts_at is null or not isfinite(p_starts_at) or p_starts_at<=clock_timestamp() or date_trunc('minute',p_starts_at)<>p_starts_at then raise exception 'Invalid booking time.'; end if;
 d:=(p_starts_at at time zone 'America/Toronto')::date;
 if d >= (now() at time zone 'America/Toronto')::date+14 then raise exception 'Booking date is outside the available range.'; end if;
 if (e at time zone 'America/Toronto')-(p_starts_at at time zone 'America/Toronto')<>interval '1 hour' then raise exception 'Invalid daylight-saving time slot.'; end if;
 if p_client_id is not null then
  if not exists(select 1 from public.profiles where id=u and role='admin') then raise exception 'Access denied.'; end if;
  select * into c from public.clients where id=p_client_id;
 else
  if (select count(*) from public.clients where profile_id=u)<>1 then raise exception 'A unique linked client account is required.'; end if;
  select * into c from public.clients where profile_id=u;
 end if;
 if c.id is null or c.status<>'active' then raise exception 'Active client account required.'; end if;
 if not exists(select 1 from public.profiles where id=p_trainer_id and role='trainer') then raise exception 'Trainer not found.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('trainer:'||p_trainer_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(c.id::text,0));
 select * into c from public.clients where id=c.id for update;
 if c.id is null or c.status<>'active' or (p_client_id is null and c.profile_id is distinct from u) then raise exception 'Active linked client account required.';end if;
 perform 1 from public.profiles where id=p_trainer_id and role='trainer' for share;
 if not found then raise exception 'Trainer not found.';end if;
 m:=extract(hour from p_starts_at at time zone 'America/Toronto')::int*60+extract(minute from p_starts_at at time zone 'America/Toronto')::int;
 if not exists(select 1 from public.trainer_availability where trainer_id=p_trainer_id and weekday=extract(dow from d)::int and m>=start_minute and m+60<=end_minute and (m-start_minute)%60=0) then raise exception 'Slot is unavailable.'; end if;
 if exists(select 1 from public.trainer_time_blocks where trainer_id=p_trainer_id and starts_at<e and ends_at>p_starts_at) then raise exception 'Slot is blocked.'; end if;
 if exists(select 1 from public.bookings where status='booked' and (trainer_id=p_trainer_id or client_id=c.id) and starts_at<e and ends_at>p_starts_at) then raise exception 'Booking conflict. Choose another slot.'; end if;
 select * into sp from public.session_packages where client_id=c.id order by (status='active') desc,created_at desc nulls last limit 1 for update;
 if sp.id is null or sp.status<>'active' or (sp.starts_at is not null and sp.starts_at>p_starts_at) or (sp.expires_at is not null and sp.expires_at<d) or sp.remaining_sessions<=(select count(*) from public.bookings where package_id=sp.id and status='booked') then raise exception 'No unreserved sessions remaining in an eligible package.';end if;
 insert into public.bookings(client_id,trainer_id,client_name,client_email,client_phone,starts_at,ends_at,status,created_by,package_id,request_id)
 values(c.id,p_trainer_id,c.full_name,c.email,c.phone,p_starts_at,e,'booked',u,sp.id,p_request_id) returning * into b;
 return fxa_private.remember(p_request_id,'booking',p,jsonb_build_object('id',b.id,'starts_at',b.starts_at,'ends_at',b.ends_at,'status',b.status,'google_sync_status',b.google_sync_status));
end $$;
-- Google conflict validation is done by the authenticated API immediately before
-- this RPC. The RPC is service-only: clients cannot bypass that validation.
-- A separate checked actor is used via signed user context by the API; see grants below.

create or replace function public.fxa_cancel_booking(p_booking_id uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['client','trainer','admin']); b public.bookings%rowtype; r text;
begin
 select * into b from public.bookings where id=p_booking_id;
 select role into r from public.profiles where id=u;
 if b.id is null then raise exception 'Booking not found.'; end if;
 if r='client' and not exists(select 1 from public.clients where id=b.client_id and profile_id=u) then raise exception 'Access denied.'; end if;
 if r='trainer' and b.trainer_id is distinct from u then raise exception 'Access denied.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('trainer:'||b.trainer_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(b.client_id::text,0));
 select * into b from public.bookings where id=p_booking_id for update;
 if b.status='cancelled' then return jsonb_build_object('id',b.id,'status',b.status); end if;
 if b.status<>'booked' or b.starts_at<=clock_timestamp() then raise exception 'Only future booked sessions can be cancelled.'; end if;
 if r='client' and b.starts_at-clock_timestamp()<interval '8 hours' then raise exception 'Cancellation requires at least 8 hours notice.'; end if;
 if r in ('admin','trainer') and btrim(coalesce(p_reason,''))='' then raise exception 'Cancellation reason required.'; end if;
 update public.bookings set status='cancelled',cancelled_by=u,cancelled_at=clock_timestamp(),cancel_reason=left(p_reason,1000),google_sync_status='pending',sync_version=sync_version+1,updated_at=now() where id=b.id;
 return jsonb_build_object('id',b.id,'status','cancelled');
end $$;
-- Only the server can mint a short-lived Google-checked slot grant. An opaque
-- single-use grant closes the direct-RPC bypass while keeping auth.uid() genuine.
create table if not exists fxa_private.slot_grants (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null,trainer_id uuid not null,starts_at timestamptz not null,expires_at timestamptz not null
);
alter table fxa_private.slot_grants enable row level security;
create or replace function public.fxa_issue_slot_grant(p_actor uuid,p_trainer uuid,p_start timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k uuid;
begin
 insert into fxa_private.slot_grants(actor_id,trainer_id,starts_at,expires_at) values(p_actor,p_trainer,p_start,clock_timestamp()+interval '20 seconds') returning id into k;
 delete from fxa_private.slot_grants where expires_at<now()-interval '1 hour'; return k;
end $$;
-- Keep the reservation implementation private; the public gateway requires a grant.
alter function public.fxa_reserve_booking(uuid,timestamptz,uuid,uuid) set schema fxa_private;
create or replace function public.fxa_reserve_booking(p_trainer_id uuid,p_starts_at timestamptz,p_request_id uuid,p_grant_id uuid,p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid; old jsonb; u uuid:=fxa_private.require_role(array['client','admin']);
begin
 old:=fxa_private.replay(p_request_id,'booking',jsonb_build_object('trainer',p_trainer_id,'start',p_starts_at,'client',p_client_id));
 if old is not null then return old; end if;
 delete from fxa_private.slot_grants where id=p_grant_id and actor_id=u and trainer_id=p_trainer_id and starts_at=p_starts_at and expires_at>=clock_timestamp() returning id into g;
 if g is null then raise exception 'Slot verification expired. Refresh availability.'; end if;
 return fxa_private.fxa_reserve_booking(p_trainer_id,p_starts_at,p_request_id,p_client_id);
end $$;
create or replace function public.fxa_claim_booking_sync(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; k uuid:=gen_random_uuid();
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if b.id is null or b.google_sync_status='synced' or b.sync_locked_until>clock_timestamp() then return null; end if;
 update public.bookings set sync_lease=k,sync_locked_until=clock_timestamp()+interval '60 seconds' where id=b.id;
 return to_jsonb(b)||jsonb_build_object('lease',k);
end $$;
create or replace function public.fxa_finish_booking_sync(p_booking_id uuid,p_lease uuid,p_version int,p_event_id text,p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.bookings set google_sync_status=case when sync_version<>p_version then 'pending' when p_error is null then 'synced' else 'error' end,
 google_event_id=coalesce(p_event_id,google_event_id),last_sync_error=left(p_error,300),sync_lease=null,sync_locked_until=null,updated_at=now()
 where id=p_booking_id and sync_lease=p_lease;
end $$;

-- Prepare scans without charging. Finalize notes + deduction together below.
create or replace function public.fxa_preview_session(p_qr_token text,p_session_type text default 'training',p_session_status text default 'success')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['admin','trainer','nutrition_coach']); c public.clients%rowtype; sp public.session_packages%rowtype;
begin
 if p_session_type is null or p_session_status is null or p_session_type not in ('training','nutrition_follow_up') or p_session_status not in ('success','no_show','late_cancel') then raise exception 'Invalid session type or status.'; end if;
 if p_session_type='nutrition_follow_up' then perform fxa_private.require_role(array['admin','nutrition_coach']); end if;
 select * into c from public.clients where qr_token=btrim(p_qr_token);
 if c.id is null or c.status<>'active' then raise exception 'Invalid or inactive client QR code.'; end if;
 select * into sp from public.session_packages where client_id=c.id order by (status='active') desc,created_at desc limit 1;
 if p_session_type='training' and (sp.id is null or sp.status<>'active' or sp.remaining_sessions<=0 or (sp.starts_at is not null and sp.starts_at>now()) or (sp.expires_at is not null and sp.expires_at<(now() at time zone 'America/Toronto')::date)) then raise exception 'No active training package remaining.'; end if;
 return jsonb_build_object('client_id',c.id,'client_name',c.full_name,'remaining_after',coalesce(sp.remaining_sessions,0),'session_type',p_session_type,'session_status',p_session_status);
end $$;
create or replace function public.fxa_finalize_session(p_request_id uuid,p_qr_token text,p_session_type text,p_session_status text,p_topic text,p_content text,p_note text default null,p_photo_path text default null,p_booking_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['admin','trainer','nutrition_coach']); p jsonb; old jsonb; result jsonb; rec record; c uuid; b public.bookings%rowtype; sp public.session_packages%rowtype;
begin
 if btrim(coalesce(p_topic,''))='' or btrim(coalesce(p_content,''))='' or length(p_topic)>500 or length(p_content)>20000 or length(coalesce(p_note,''))>10000 then raise exception 'Valid Topic and Content are required.'; end if;
 if p_photo_path is not null and (p_photo_path not like u::text||'/'||p_request_id::text||'/%' or p_photo_path like '%..%') then raise exception 'Invalid photo path.'; end if;
 p:=jsonb_build_object('qr',p_qr_token,'type',p_session_type,'status',p_session_status,'topic',btrim(p_topic),'content',btrim(p_content),'note',p_note,'booking',p_booking_id);
 old:=fxa_private.replay(p_request_id,'session',p); if old is not null then return old; end if;
 perform public.fxa_preview_session(p_qr_token,p_session_type,p_session_status);
 select id into c from public.clients where qr_token=btrim(p_qr_token);
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 perform 1 from public.clients where id=c for update;
 perform public.fxa_preview_session(p_qr_token,p_session_type,p_session_status);
 if p_booking_id is not null then
  select * into b from public.bookings where id=p_booking_id for update;
  if b.id is null or b.client_id<>c or b.status<>'booked' or p_session_type<>'training' or b.starts_at>clock_timestamp()+interval '15 minutes' then raise exception 'Invalid session booking.'; end if;
  if b.trainer_id<>u and not exists(select 1 from public.profiles where id=u and role='admin') then raise exception 'Access denied.'; end if;
 else
  select * into b from public.bookings where client_id=c and trainer_id=u and status='booked' and p_session_type='training' and starts_at between now()-interval '2 hours' and now()+interval '15 minutes' order by abs(extract(epoch from starts_at-now())) limit 1 for update;
 end if;
 -- The legacy function selects the active package. Do not silently charge a
 -- different package from the reservation in a multi-package account.
 select * into sp from public.session_packages where client_id=c order by (status='active') desc,created_at desc nulls last limit 1 for update;
 if b.id is not null and b.package_id is not null and b.package_id is distinct from sp.id then raise exception 'Reserved package differs from current package. Admin review required.'; end if;
 if p_session_type='training' and b.id is null and sp.remaining_sessions <= (select count(*) from public.bookings where package_id=sp.id and status='booked') then raise exception 'All remaining sessions are reserved. Open the corresponding booking first.'; end if;
 select * into rec from public.record_staff_session(p_qr_token,p_session_type,p_session_status);
 update public.session_history set session_topic=btrim(p_topic),session_content=btrim(p_content),trainer_note=nullif(btrim(p_note),''),photo_path=p_photo_path,booking_id=b.id where id=rec.history_id;
 if b.id is not null then update public.bookings set status='completed',updated_at=now() where id=b.id; end if;
 result:=to_jsonb(rec)||jsonb_build_object('session_topic',btrim(p_topic),'session_content',btrim(p_content),'photo_path',p_photo_path);
 return fxa_private.remember(p_request_id,'session',p,result);
end $$;
-- No client can call the old charge-first RPC after the new build is enabled.
revoke execute on function public.record_staff_session(text,text,text) from public,anon,authenticated;

-- Finance primitives shared by client creation, renewal and debt collection.
create or replace function fxa_private.payment_state(price numeric,paid numeric)
returns text language plpgsql immutable set search_path = '' as $$
begin
 if price is null or paid is null or price<0 or paid<0 or paid>price or price::text in ('NaN','Infinity','-Infinity') or paid::text in ('NaN','Infinity','-Infinity') or price<>round(price,2) or paid<>round(paid,2) then raise exception 'Invalid payment amounts.'; end if;
 return case when paid=price then 'paid' when paid>0 then 'partial' else 'pending' end;
end $$;
create or replace function public.fxa_create_client(p_request_id uuid,p_client jsonb,p_package jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['admin','manager']); p jsonb:=jsonb_build_object('client',p_client,'package',p_package); old jsonb; c uuid; cp uuid; n int:=coalesce((p_package->>'sessions')::int,0); price numeric:=coalesce((p_package->>'value')::numeric,0); paid numeric:=coalesce((p_package->>'paid')::numeric,0); state text;
begin
 old:=fxa_private.replay(p_request_id,'create_client',p); if old is not null then return (old->>'id')::uuid; end if;
 if btrim(coalesce(p_client->>'full_name',''))='' or n<0 or n>10000 then raise exception 'Valid client name and sessions required.'; end if;
 state:=fxa_private.payment_state(price,paid);
 if n=0 and (price<>0 or paid<>0) then raise exception 'A package requires at least one session.'; end if;
 if nullif(p_package->>'expires_at','')::date < nullif(p_package->>'starts_at','')::date then raise exception 'Expiry precedes start date.'; end if;
 insert into public.clients(client_code,full_name,email,phone,gender,date_of_birth,client_source,client_source_other,qr_token,status)
 values(nullif(btrim(p_client->>'client_code'),''),btrim(p_client->>'full_name'),nullif(lower(btrim(p_client->>'email')),''),nullif(btrim(p_client->>'phone'),''),nullif(p_client->>'gender',''),nullif(p_client->>'date_of_birth','')::date,nullif(p_client->>'client_source',''),nullif(p_client->>'client_source_other',''),gen_random_uuid()::text,'active') returning id into c;
 if n>0 then
  insert into public.session_packages(client_id,package_name,total_sessions,used_sessions,remaining_sessions,package_value,starts_at,expires_at,status)
  values(c,coalesce(nullif(p_package->>'name',''),'New Package'),n,0,n,price,(nullif(p_package->>'starts_at','')::date)::timestamp at time zone 'America/Toronto',nullif(p_package->>'expires_at','')::date,'active');
  insert into public.client_purchases(client_id,plan_name,session_count,price,amount_paid,balance_due,debt_deadline,purchase_type,status,confirmed_by,confirmed_at)
  values(c,coalesce(nullif(p_package->>'name',''),'New Package'),n,price,paid,price-paid,case when price>paid then nullif(p_package->>'expires_at','')::date end,coalesce(nullif(p_package->>'purchase_type',''),'new'),state,u,now()) returning id into cp;
  if paid>0 then insert into public.business_transactions(transaction_type,source,title,amount,client_id,purchase_id,created_by,transaction_date,accounting_month,report_group)
   values('income','package_payment','Initial package payment',paid,c,cp,u,(now() at time zone 'America/Toronto')::date,date_trunc('month',now() at time zone 'America/Toronto')::date,'sales_revenue'); end if;
 end if;
 perform fxa_private.remember(p_request_id,'create_client',p,jsonb_build_object('id',c)); return c;
end $$;
create or replace function public.fxa_renew_package(p_request_id uuid,p_client_id uuid,p_package jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['admin']); p jsonb:=jsonb_build_object('client',p_client_id,'package',p_package); old jsonb; sp public.session_packages%rowtype; cp uuid; n int:=(p_package->>'sessions')::int; price numeric:=(p_package->>'value')::numeric; paid numeric:=(p_package->>'paid')::numeric; state text;
begin
 old:=fxa_private.replay(p_request_id,'renew',p); if old is not null then return (old->>'id')::uuid; end if;
 if n is null or n<=0 or n>10000 then raise exception 'Valid session count required.'; end if;
 state:=fxa_private.payment_state(price,paid);
 if nullif(p_package->>'expires_at','')::date < nullif(p_package->>'starts_at','')::date then raise exception 'Expiry precedes start date.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,0));
 perform 1 from public.clients where id=p_client_id for update; if not found then raise exception 'Client not found.'; end if;
 select * into sp from public.session_packages where client_id=p_client_id order by (status='active') desc,created_at desc limit 1 for update;
 if sp.id is null then
  insert into public.session_packages(client_id,package_name,total_sessions,remaining_sessions,used_sessions,package_value,status,starts_at,expires_at)
  values(p_client_id,coalesce(nullif(p_package->>'name',''),'Renew Package'),n,n,0,price,'active',(nullif(p_package->>'starts_at','')::date)::timestamp at time zone 'America/Toronto',nullif(p_package->>'expires_at','')::date);
 else
  update public.session_packages set total_sessions=coalesce(total_sessions,0)+n,remaining_sessions=remaining_sessions+n,package_value=coalesce(package_value,0)+price,status='active',
  package_name=coalesce(nullif(p_package->>'name',''),package_name),starts_at=coalesce((nullif(p_package->>'starts_at','')::date)::timestamp at time zone 'America/Toronto',starts_at),expires_at=coalesce(nullif(p_package->>'expires_at','')::date,expires_at) where id=sp.id;
 end if;
 insert into public.client_purchases(client_id,plan_name,session_count,price,amount_paid,balance_due,debt_deadline,purchase_type,status,confirmed_by,confirmed_at)
 values(p_client_id,coalesce(nullif(p_package->>'name',''),'Renew Package'),n,price,paid,price-paid,case when price>paid then nullif(p_package->>'expires_at','')::date end,'renew',state,u,now()) returning id into cp;
 if paid>0 then insert into public.business_transactions(transaction_type,source,title,amount,client_id,purchase_id,created_by,transaction_date,accounting_month,report_group)
 values('income','package_payment','Renewal payment',paid,p_client_id,cp,u,(now() at time zone 'America/Toronto')::date,date_trunc('month',now() at time zone 'America/Toronto')::date,'sales_revenue'); end if;
 perform fxa_private.remember(p_request_id,'renew',p,jsonb_build_object('id',cp)); return cp;
end $$;
create or replace function public.fxa_record_debt_payment(p_request_id uuid,p_purchase_id uuid,p_amount numeric,p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['admin']); cp public.client_purchases%rowtype; p jsonb:=jsonb_build_object('purchase',p_purchase_id,'amount',p_amount,'date',p_date); old jsonb;
begin
 old:=fxa_private.replay(p_request_id,'debt_payment',p); if old is not null then return old; end if;
 select * into cp from public.client_purchases where id=p_purchase_id for update;
 if cp.id is null then raise exception 'Purchase not found.'; end if;
 if p_amount is null or p_amount<=0 or p_amount>coalesce(cp.balance_due,0) or p_amount<>round(p_amount,2) or p_date is null or not isfinite(p_date) then raise exception 'Invalid payment amount or date.'; end if;
 update public.client_purchases set amount_paid=coalesce(amount_paid,0)+p_amount,balance_due=balance_due-p_amount,status=case when balance_due-p_amount=0 then 'paid' else 'partial' end where id=cp.id;
 insert into public.business_transactions(transaction_type,source,title,amount,client_id,purchase_id,created_by,transaction_date,accounting_month,report_group)
 values('income','debt_payment','Client debt payment',p_amount,cp.client_id,cp.id,u,p_date,date_trunc('month',p_date)::date,'sales_revenue');
 return fxa_private.remember(p_request_id,'debt_payment',p,jsonb_build_object('id',cp.id,'balance_due',cp.balance_due-p_amount));
end $$;
create or replace function public.fxa_finance_balances()
returns table(id uuid,balance numeric) language plpgsql security definer set search_path = '' as $$
begin
 perform fxa_private.require_role(array['admin','manager']);
 return query select a.id,coalesce(a.opening_balance,0)+coalesce(sum(case when t.transaction_type='income' then abs(t.amount) when t.transaction_type='expense' then -abs(t.amount) else t.amount end),0)
 from public.finance_accounts a left join public.business_transactions t on t.account_id=a.id group by a.id;
end $$;

grant select,insert,update on public.leads to authenticated;
-- Marketing staff may manage leads; conversion to a paying client remains admin/manager.
create policy fxa_marketing_leads_insert on public.leads for insert to authenticated with check(exists(select 1 from public.profiles where id=auth.uid() and role='marketing_manager') and converted_client_id is null and status<>'converted');
create policy fxa_marketing_leads_update on public.leads for update to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and role='marketing_manager') and converted_client_id is null and status<>'converted') with check(exists(select 1 from public.profiles where id=auth.uid() and role='marketing_manager') and converted_client_id is null and status<>'converted');
-- Return-row verification in the UI avoids zero-row success messages. Manager
-- basic-info writes are handled by the checked server API, not a broad RLS grant.

do $$ declare f record; begin
 for f in select n.nspname,p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='fxa_private') or (n.nspname='public' and p.proname like 'fxa_%' and p.proname in ('fxa_save_availability','fxa_block_time','fxa_reserve_booking','fxa_cancel_booking','fxa_issue_slot_grant','fxa_claim_booking_sync','fxa_finish_booking_sync','fxa_preview_session','fxa_finalize_session','fxa_create_client','fxa_renew_package','fxa_record_debt_payment','fxa_finance_balances')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
revoke all on function public.fxa_issue_slot_grant(uuid,uuid,timestamptz),public.fxa_claim_booking_sync(uuid),public.fxa_finish_booking_sync(uuid,uuid,int,text,text) from authenticated;
grant execute on function public.fxa_issue_slot_grant(uuid,uuid,timestamptz),public.fxa_claim_booking_sync(uuid),public.fxa_finish_booking_sync(uuid,uuid,int,text,text) to service_role;
alter table public.session_history add column if not exists charge_units integer;
create or replace function public.fxa_adjust_sessions(p_request_id uuid,p_client_id uuid,p_action text,p_value integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['admin']); sp public.session_packages%rowtype; old jsonb; result jsonb; p jsonb:=jsonb_build_object('client',p_client_id,'action',p_action,'value',p_value); nt int; nr int; nu int;
begin
 old:=fxa_private.replay(p_request_id,'adjust_sessions',p);if old is not null then return old;end if;
 if p_value is null or p_value<0 or p_value>10000 or p_action is null or p_action not in ('add','subtract','fixRemaining','fixTotal') or (p_action in ('add','subtract') and p_value=0) then raise exception 'Invalid session adjustment.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,0));
 select * into sp from public.session_packages where client_id=p_client_id order by (status='active') desc,created_at desc limit 1 for update;
 if sp.id is null then raise exception 'Package not found.';end if;
 nt:=sp.total_sessions;nr:=sp.remaining_sessions;nu:=sp.used_sessions;
 case p_action
 when 'add' then nt:=nt+p_value;nr:=nr+p_value;
 when 'subtract' then nr:=nr-p_value;nu:=nu+p_value;
 when 'fixRemaining' then nr:=p_value;nt:=nu+nr;
 when 'fixTotal' then nt:=p_value;nr:=nt-nu;
 end case;
 if nr<0 or nu<0 or nt<>nr+nu then raise exception 'Invalid package balance.';end if;
 if nr<(select count(*) from public.bookings where package_id=sp.id and status='booked') then raise exception 'Adjustment would remove reserved sessions.';end if;
 update public.session_packages set total_sessions=nt,remaining_sessions=nr,used_sessions=nu,status=case when nr=0 then 'completed' else 'active' end where id=sp.id;
 insert into public.session_history(client_id,trainer_id,package_id,session_type,status,message,remaining_after,charge_units)
 values(p_client_id,u,sp.id,'training',case when p_action='subtract' then 'manual_subtract' else 'manual_adjust' end,'Admin session adjustment: '||p_action||' '||p_value::text,nr,case when p_action='subtract' then p_value else 0 end);
 result:=jsonb_build_object('id',sp.id,'total',nt,'used',nu,'remaining',nr,'old_total',sp.total_sessions,'old_remaining',sp.remaining_sessions);
 return fxa_private.remember(p_request_id,'adjust_sessions',p,result);
end $$;
create or replace function public.fxa_edit_session_history(p_history_id uuid,p_client_id uuid,p_trainer_id uuid,p_status text,p_created_at timestamptz,p_message text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['admin']); h public.session_history%rowtype; sp public.session_packages%rowtype; old_units int:=0; new_units int:=0; delta int:=0;
begin
 if p_status is null or p_status not in ('success','completed','no_show','late_cancel','failed','cancelled','reversed','manual_subtract','manual_adjust') or p_created_at is null or not isfinite(p_created_at) then raise exception 'Invalid session edit.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,0));
 select * into h from public.session_history where id=p_history_id and client_id=p_client_id for update;
 if h.id is null then raise exception 'Session not found.';end if;
 if p_trainer_id is not null and not exists(select 1 from public.profiles where id=p_trainer_id and role in ('trainer','admin','nutrition_coach')) then raise exception 'Trainer not found.';end if;
 if coalesce(h.session_type,'training')='training' then
  old_units:=case when h.status in ('success','completed','no_show','late_cancel','manual_subtract') then coalesce(h.charge_units,1) else 0 end;
  new_units:=case when p_status in ('success','completed','no_show','late_cancel','manual_subtract') then greatest(coalesce(h.charge_units,1),1) else 0 end;delta:=new_units-old_units;
 end if;
 if delta<>0 then
  select * into sp from public.session_packages where id=h.package_id and client_id=p_client_id for update;
  if sp.id is null then raise exception 'Original package not found. Cannot change balance safely.';end if;
  if sp.remaining_sessions-delta<(select count(*) from public.bookings where package_id=sp.id and status='booked') or sp.used_sessions+delta<0 then raise exception 'Insufficient package balance.';end if;
  update public.session_packages set used_sessions=used_sessions+delta,remaining_sessions=remaining_sessions-delta,status=case when remaining_sessions-delta=0 then 'completed' else 'active' end where id=sp.id;
 end if;
 update public.session_history set trainer_id=p_trainer_id,status=p_status,created_at=p_created_at,message=p_message,trainer_note=p_note,charge_units=greatest(coalesce(h.charge_units,old_units),new_units),
 remaining_after=case when delta<>0 then sp.remaining_sessions-delta else remaining_after end where id=h.id;
end $$;
alter table public.session_history enable row level security;
alter table public.session_packages enable row level security;
-- Restrict legacy direct writes. Checked SECURITY DEFINER RPCs retain the required
-- business privileges; the browser cannot bypass their transaction rules.
do $$ declare p record;begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('session_packages','session_history') and cmd in ('INSERT','UPDATE') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);end loop;
end $$;
create policy fxa_history_admin_insert on public.session_history for insert to authenticated with check(exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy fxa_history_admin_update on public.session_history for update to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and role='admin')) with check(exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy fxa_packages_admin_update on public.session_packages for update to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and role='admin')) with check(exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
revoke all on function public.fxa_adjust_sessions(uuid,uuid,text,integer),public.fxa_edit_session_history(uuid,uuid,uuid,text,timestamptz,text,text) from public,anon;
grant execute on function public.fxa_adjust_sessions(uuid,uuid,text,integer),public.fxa_edit_session_history(uuid,uuid,uuid,text,timestamptz,text,text) to authenticated;

create or replace function public.fxa_set_debt(p_request_id uuid,p_client_id uuid,p_purchase_id uuid,p_new_balance numeric,p_deadline date,p_record_income boolean,p_income_date date,p_expected_balance numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=fxa_private.require_role(array['admin']);cp public.client_purchases%rowtype;delta numeric:=0;old jsonb;p jsonb:=jsonb_build_object('client',p_client_id,'purchase',p_purchase_id,'balance',p_new_balance,'deadline',p_deadline,'income',p_record_income,'date',p_income_date,'expected',p_expected_balance);id uuid;
begin
 old:=fxa_private.replay(p_request_id,'debt_fix',p);if old is not null then return old;end if;
 if p_new_balance is null or p_new_balance<0 or p_new_balance::text in ('NaN','Infinity','-Infinity') or p_new_balance<>round(p_new_balance,2) or (p_new_balance>0 and p_deadline is null) then raise exception 'Invalid debt balance or deadline.';end if;
 if p_purchase_id is null then
 insert into public.client_purchases(client_id,plan_name,session_count,price,amount_paid,balance_due,debt_deadline,purchase_type,status)
 values(p_client_id,'Debt - Manual Debt',0,p_new_balance,0,p_new_balance,p_deadline,'debt',case when p_new_balance=0 then 'paid' else 'confirmed' end) returning public.client_purchases.id into id;
 else
 select * into cp from public.client_purchases where public.client_purchases.id=p_purchase_id and client_id=p_client_id for update;
 if cp.id is null then raise exception 'Purchase not found.';end if;
 if coalesce(cp.balance_due,0) is distinct from p_expected_balance then raise exception 'Debt changed. Refresh before editing.';end if;
 if p_record_income then delta:=greatest(coalesce(cp.balance_due,0)-p_new_balance,0);end if;
 if delta>0 and p_income_date is null then raise exception 'Income date required.';end if;
 update public.client_purchases set amount_paid=coalesce(amount_paid,0)+delta,balance_due=p_new_balance,debt_deadline=case when p_new_balance>0 then p_deadline end,status=case when p_new_balance=0 then 'paid' when coalesce(amount_paid,0)+delta>0 then 'partial' else 'confirmed' end where public.client_purchases.id=cp.id;
 id:=cp.id;
 if delta>0 then insert into public.business_transactions(transaction_type,source,title,amount,client_id,purchase_id,created_by,transaction_date,accounting_month,report_group)
 values('income','debt_payment','Debt correction payment',delta,p_client_id,id,u,p_income_date,date_trunc('month',p_income_date)::date,'sales_revenue');end if;
 end if;
 return fxa_private.remember(p_request_id,'debt_fix',p,jsonb_build_object('id',id,'old_balance',cp.balance_due,'balance_due',p_new_balance,'income_added',delta));
end $$;
revoke all on function public.fxa_set_debt(uuid,uuid,uuid,numeric,date,boolean,date,numeric) from public,anon;
grant execute on function public.fxa_set_debt(uuid,uuid,uuid,numeric,date,boolean,date,numeric) to authenticated;

-- A row policy named "note only" does not restrict which columns can change.
-- Keep existing staff note access, but block direct edits to identity/assignments.
create or replace function public.fxa_guard_client_staff_updates()
returns trigger language plpgsql set search_path = '' as $$
declare r text;
begin
 if current_user='authenticated' then
  select role into r from public.profiles where id=auth.uid();
  if r in ('trainer','nutrition_coach') and (to_jsonb(new)-'client_note') is distinct from (to_jsonb(old)-'client_note') then
   raise exception 'Staff may only update client notes directly.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.fxa_guard_client_staff_updates() from public,anon,authenticated;
create trigger fxa_client_staff_update_guard before update on public.clients for each row execute function public.fxa_guard_client_staff_updates();
notify pgrst,'reload schema';
commit;
