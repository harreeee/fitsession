begin;

create table if not exists public.fxa_package_expiry_audit (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.session_packages(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  old_expires_at date,
  new_expires_at date not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index if not exists fxa_package_expiry_audit_client_changed_idx
  on public.fxa_package_expiry_audit(client_id, changed_at desc);

create index if not exists fxa_package_expiry_audit_package_changed_idx
  on public.fxa_package_expiry_audit(package_id, changed_at desc);

alter table public.fxa_package_expiry_audit enable row level security;
revoke all on public.fxa_package_expiry_audit from public, anon, authenticated;

create or replace function public.fxa_update_package_expiry(
  p_package_id uuid,
  p_expected_expiry date,
  p_new_expiry date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := fxa_private.require_role(array['admin']);
  sp public.session_packages%rowtype;
  start_date date;
  clean_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_package_id is null then raise exception 'Package is required.'; end if;
  if p_new_expiry is null then raise exception 'New expiry date is required.'; end if;
  if char_length(clean_reason) < 3 or char_length(clean_reason) > 500 then raise exception 'Reason must be between 3 and 500 characters.'; end if;

  select * into sp from public.session_packages where id = p_package_id for update;
  if sp.id is null then raise exception 'Package not found.'; end if;
  if sp.status <> 'active' then raise exception 'Only the active package can have its expiry changed.'; end if;
  if sp.expires_at is distinct from p_expected_expiry then raise exception 'Package expiry changed since this page was loaded. Refresh and try again.'; end if;

  if sp.starts_at is not null then
    start_date := (sp.starts_at at time zone 'America/Toronto')::date;
    if p_new_expiry < start_date then raise exception 'Expiry date cannot be before the package start date (%).', start_date; end if;
  end if;

  if sp.expires_at is not distinct from p_new_expiry then
    return jsonb_build_object('changed', false, 'package_id', sp.id, 'client_id', sp.client_id, 'old_expiry', sp.expires_at, 'new_expiry', sp.expires_at, 'remaining_sessions', sp.remaining_sessions);
  end if;

  update public.session_packages set expires_at = p_new_expiry where id = sp.id;

  insert into public.fxa_package_expiry_audit(package_id, client_id, old_expires_at, new_expires_at, reason, changed_by)
  values (sp.id, sp.client_id, sp.expires_at, p_new_expiry, clean_reason, u);

  return jsonb_build_object('changed', true, 'package_id', sp.id, 'client_id', sp.client_id, 'old_expiry', sp.expires_at, 'new_expiry', p_new_expiry, 'remaining_sessions', sp.remaining_sessions);
end;
$$;

revoke all on function public.fxa_update_package_expiry(uuid,date,date,text) from public, anon;
grant execute on function public.fxa_update_package_expiry(uuid,date,date,text) to authenticated;

create or replace function public.fxa_package_expiry_history(p_client_id uuid default null, p_limit integer default 50)
returns table(audit_id uuid, package_id uuid, client_id uuid, client_code text, client_name text, old_expiry date, new_expiry date, reason text, changed_by uuid, changed_by_name text, changed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  perform fxa_private.require_role(array['admin','manager']);
  return query
  select a.id, a.package_id, a.client_id, c.client_code, c.full_name, a.old_expires_at, a.new_expires_at, a.reason, a.changed_by,
         coalesce(p.full_name, p.email, 'Admin'), a.changed_at
  from public.fxa_package_expiry_audit a
  join public.clients c on c.id = a.client_id
  left join public.profiles p on p.id = a.changed_by
  where p_client_id is null or a.client_id = p_client_id
  order by a.changed_at desc
  limit safe_limit;
end;
$$;

revoke all on function public.fxa_package_expiry_history(uuid,integer) from public, anon;
grant execute on function public.fxa_package_expiry_history(uuid,integer) to authenticated;

create or replace function public.fxa_preview_session(p_qr_token text,p_session_type text default 'training',p_session_status text default 'success')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid:=fxa_private.require_role(array['admin','trainer','nutrition_coach']);
  c public.clients%rowtype;
  sp public.session_packages%rowtype;
  today_toronto date := (now() at time zone 'America/Toronto')::date;
begin
  if p_session_type is null or p_session_status is null or p_session_type not in ('training','nutrition_follow_up') or p_session_status not in ('success','no_show','late_cancel') then raise exception 'Invalid session type or status.'; end if;
  if p_session_type='nutrition_follow_up' then perform fxa_private.require_role(array['admin','nutrition_coach']); end if;
  select * into c from public.clients where qr_token=btrim(p_qr_token);
  if c.id is null or c.status<>'active' then raise exception 'Invalid or inactive client QR code.'; end if;
  select * into sp from public.session_packages where client_id=c.id order by (status='active') desc,created_at desc limit 1;
  if p_session_type='training' then
    if sp.id is null then raise exception 'No training package found for this client.'; end if;
    if sp.status<>'active' then raise exception 'Training package is not active.'; end if;
    if sp.remaining_sessions<=0 then raise exception 'No training sessions remaining.'; end if;
    if sp.starts_at is not null and sp.starts_at>now() then raise exception 'Training package has not started yet. Start date: %.', (sp.starts_at at time zone 'America/Toronto')::date; end if;
    if sp.expires_at is not null and sp.expires_at<today_toronto then raise exception 'Training package expired on % with % session(s) remaining. Admin must update the package expiry date.', sp.expires_at, sp.remaining_sessions; end if;
  end if;
  return jsonb_build_object('client_id',c.id,'client_name',c.full_name,'remaining_after',coalesce(sp.remaining_sessions,0),'session_type',p_session_type,'session_status',p_session_status);
end $$;

revoke all on function public.fxa_preview_session(text,text,text) from public, anon;
grant execute on function public.fxa_preview_session(text,text,text) to authenticated;

commit;
