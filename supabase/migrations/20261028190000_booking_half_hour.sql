-- FXA: 60-minute sessions with :00 or :30 starting times.
-- Only the existing private function is replaced; all grants,
-- authentication, package accounting, and overlap locks are preserved.
create or replace function fxa_private.fxa_reserve_booking(p_trainer_id uuid,p_starts_at timestamptz,p_request_id uuid,p_client_id uuid default null)
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
 if not exists(select 1 from public.trainer_availability where trainer_id=p_trainer_id and weekday=extract(dow from d)::int and m>=start_minute and m+60<=end_minute and m%30=0) then raise exception 'Slot is unavailable.'; end if;
 if exists(select 1 from public.trainer_time_blocks where trainer_id=p_trainer_id and starts_at<e and ends_at>p_starts_at) then raise exception 'Slot is blocked.'; end if;
 if exists(select 1 from public.bookings where status='booked' and (trainer_id=p_trainer_id or client_id=c.id) and starts_at<e and ends_at>p_starts_at) then raise exception 'Booking conflict. Choose another slot.'; end if;
 select * into sp from public.session_packages where client_id=c.id order by (status='active') desc,created_at desc nulls last limit 1 for update;
 if sp.id is null or sp.status<>'active' or (sp.starts_at is not null and sp.starts_at>p_starts_at) or (sp.expires_at is not null and sp.expires_at<d) or sp.remaining_sessions<=(select count(*) from public.bookings where package_id=sp.id and status='booked') then raise exception 'No unreserved sessions remaining in an eligible package.';end if;
 insert into public.bookings(client_id,trainer_id,client_name,client_email,client_phone,starts_at,ends_at,status,created_by,package_id,request_id)
 values(c.id,p_trainer_id,c.full_name,c.email,c.phone,p_starts_at,e,'booked',u,sp.id,p_request_id) returning * into b;
 return fxa_private.remember(p_request_id,'booking',p,jsonb_build_object('id',b.id,'starts_at',b.starts_at,'ends_at',b.ends_at,'status',b.status,'google_sync_status',b.google_sync_status));
end $$;
