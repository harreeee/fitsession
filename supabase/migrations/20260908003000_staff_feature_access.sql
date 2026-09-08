alter table public.profiles
  add column if not exists can_view_revenue boolean not null default false,
  add column if not exists can_view_clients boolean not null default false,
  add column if not exists can_view_booked_calendar boolean not null default false;

create or replace function public.fxa_guard_profile_access_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  -- Server/service-role maintenance has no authenticated end-user uid.
  if auth.uid() is null then
    return new;
  end if;

  if
    new.role is not distinct from old.role and
    new.has_manager_access is not distinct from old.has_manager_access and
    new.can_view_revenue is not distinct from old.can_view_revenue and
    new.can_view_clients is not distinct from old.can_view_clients and
    new.can_view_booked_calendar is not distinct from old.can_view_booked_calendar
  then
    return new;
  end if;

  select p.role
    into actor_role
    from public.profiles p
   where p.id = auth.uid();

  if actor_role is distinct from 'admin' then
    raise exception 'Access fields can only be changed by an administrator.';
  end if;

  return new;
end;
$$;

revoke all on function public.fxa_guard_profile_access_fields() from public;
revoke all on function public.fxa_guard_profile_access_fields() from anon;
revoke all on function public.fxa_guard_profile_access_fields() from authenticated;

drop trigger if exists profiles_guard_access_fields on public.profiles;
create trigger profiles_guard_access_fields
before update on public.profiles
for each row
execute function public.fxa_guard_profile_access_fields();

notify pgrst, 'reload schema';
