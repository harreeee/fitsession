-- Session balance guard. Does not alter historical client/package values.
-- Admin can explicitly choose whether to keep Total or Remaining (using existing fixTotal/fixRemaining RPC).
CREATE OR REPLACE FUNCTION public.fxa_adjust_sessions(p_request_id uuid, p_client_id uuid, p_action text, p_value integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=fxa_private.require_role(array['admin']); sp public.session_packages%rowtype; old jsonb; result jsonb; p jsonb:=jsonb_build_object('client',p_client_id,'action',p_action,'value',p_value); nt int; nr int; nu int;
begin
 old:=fxa_private.replay(p_request_id,'adjust_sessions',p);if old is not null then return old;end if;
 if p_value is null or p_value<0 or p_value>10000 or p_action is null or p_action not in ('add','subtract','fixRemaining','fixTotal') or (p_action in ('add','subtract') and p_value=0) then raise exception 'Invalid session adjustment.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,0));
 select * into sp from public.session_packages where client_id=p_client_id order by (status='active') desc,created_at desc limit 1 for update;
 if sp.id is null then raise exception 'Package not found.';end if;
 if sp.total_sessions is null or sp.remaining_sessions is null or sp.used_sessions is null then
  raise exception 'Package balance has missing values. Admin must reconcile package first.';
 end if;
 if sp.total_sessions <> sp.used_sessions + sp.remaining_sessions and p_action in ('add','subtract') then
  raise exception 'Package balance mismatch: Total %, Used %, Left %. Admin must choose Fix Total or Fix Remaining first.',
    sp.total_sessions, sp.used_sessions, sp.remaining_sessions;
 end if;
 nt:=sp.total_sessions;nr:=sp.remaining_sessions;nu:=sp.used_sessions;
 case p_action
 when 'add' then nt:=nt+p_value;nr:=nr+p_value;
 when 'subtract' then nr:=nr-p_value;nu:=nu+p_value;
 when 'fixRemaining' then nr:=p_value;nt:=nu+nr;
 when 'fixTotal' then nt:=p_value;nr:=nt-nu;
 end case;
 if nr<0 or nu<0 or nt<0 or nt<>nr+nu then raise exception 'Invalid package balance. Reconcile Total = Used + Remaining in Clients.';end if;
 if nr<(select count(*) from public.bookings where package_id=sp.id and status='booked') then raise exception 'Adjustment would remove reserved sessions.';end if;
 update public.session_packages set total_sessions=nt,remaining_sessions=nr,used_sessions=nu,status=case when nr=0 then 'completed' else 'active' end where id=sp.id;
 insert into public.session_history(client_id,trainer_id,package_id,session_type,status,message,remaining_after,charge_units)
 values(p_client_id,u,sp.id,'training',case when p_action='subtract' then 'manual_subtract' else 'manual_adjust' end,'Admin session adjustment: '||p_action||' '||p_value::text,nr,case when p_action='subtract' then p_value else 0 end);
 result:=jsonb_build_object('id',sp.id,'total',nt,'used',nu,'remaining',nr,'old_total',sp.total_sessions,'old_remaining',sp.remaining_sessions);
 return fxa_private.remember(p_request_id,'adjust_sessions',p,result);
end $function$

CREATE OR REPLACE FUNCTION public.fxa_preview_session(p_qr_token text, p_session_type text DEFAULT 'training'::text, p_session_status text DEFAULT 'success'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid := fxa_private.require_role(array['admin','trainer','nutrition_coach']);
  c public.clients%rowtype;
  sp public.session_packages%rowtype;
  today_toronto date := (now() at time zone 'America/Toronto')::date;
begin
  if p_session_type is null
     or p_session_status is null
     or p_session_type not in ('training','nutrition_follow_up')
     or p_session_status not in ('success','no_show','late_cancel') then
    raise exception 'Invalid session type or status.';
  end if;

  if p_session_type = 'nutrition_follow_up' then
    perform fxa_private.require_role(array['admin','nutrition_coach']);
  end if;

  select * into c
    from public.clients
   where qr_token = btrim(p_qr_token);

  if c.id is null or c.status <> 'active' then
    raise exception 'Invalid or inactive client QR code.';
  end if;

  select * into sp
    from public.session_packages
   where client_id = c.id
   order by (status = 'active') desc, created_at desc
   limit 1;

  if p_session_type = 'training' then
    if sp.id is null then
      raise exception 'No training package found for this client.';
    end if;

    if sp.status <> 'active' then
      raise exception 'Training package is not active.';
    end if;

    if sp.total_sessions is null or sp.used_sessions is null or sp.remaining_sessions is null
      or sp.total_sessions <> sp.used_sessions + sp.remaining_sessions then
      raise exception 'Package balance mismatch: Total %, Used %, Left %. Admin must reconcile in Clients before scanning.',
       sp.total_sessions, sp.used_sessions, sp.remaining_sessions;
    end if;
    if sp.remaining_sessions <= 0 then
      raise exception 'No training sessions remaining.';
    end if;

    if sp.starts_at is not null and sp.starts_at > now() then
      raise exception 'Training package has not started yet. Start date: %.', (sp.starts_at at time zone 'America/Toronto')::date;
    end if;

    if sp.expires_at is not null and sp.expires_at < today_toronto then
      raise exception 'Training package expired on % with % session(s) remaining. Admin must update the package expiry date.', sp.expires_at, sp.remaining_sessions;
    end if;
  end if;

  return jsonb_build_object(
    'client_id', c.id,
    'client_name', c.full_name,
    'remaining_after', coalesce(sp.remaining_sessions, 0),
    'session_type', p_session_type,
    'session_status', p_session_status
  );
end;
$function$
