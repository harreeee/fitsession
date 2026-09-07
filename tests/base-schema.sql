-- Isolated compatibility fixture derived from the inspected production column contract.
-- Synthetic data only. This is NOT a complete production schema backup.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated,anon,service_role;
create table profiles(id uuid primary key,full_name text not null default 'Test',role text not null,has_manager_access boolean default false,email text);
create table clients(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),full_name text not null,email text,phone text,qr_token text not null unique,status text default 'active',client_code text unique,gender text,date_of_birth date,client_source text,client_source_other text,client_note text,assigned_trainer_id uuid,assigned_nutrition_coach_id uuid,sales_person_id uuid,created_at timestamptz default now());
create table session_packages(id uuid primary key default gen_random_uuid(),client_id uuid not null references clients(id),total_sessions int default 0,used_sessions int not null default 0,remaining_sessions int not null default 0,status text not null default 'active' check(status in ('active','completed','expired')),expires_at date,created_at timestamptz default now(),starts_at timestamptz,package_name text,package_value numeric);
create table client_purchases(id uuid primary key default gen_random_uuid(),client_id uuid not null references clients(id),plan_name text not null,session_count int default 0,price numeric default 0,amount_paid numeric,balance_due numeric,debt_deadline date,purchase_type text,status text check(status in ('paid','confirmed','pending','failed','cancelled','partial')),confirmed_by uuid,confirmed_at timestamptz,created_at timestamptz default now());
create table bookings(id uuid primary key default gen_random_uuid(),client_id uuid references clients(id),trainer_id uuid references profiles(id),client_name text not null,client_email text,client_phone text,starts_at timestamptz not null,ends_at timestamptz not null,status text not null default 'booked' check(status in ('booked','cancelled','completed')),google_event_id text,notes text,created_by uuid,created_at timestamptz default now());
create table session_history(id uuid primary key default gen_random_uuid(),client_id uuid references clients(id),trainer_id uuid references profiles(id),package_id uuid references session_packages(id),session_type text,status text default 'completed',message text,trainer_note text,remaining_after int,photo_path text,session_topic text,session_content text,created_at timestamptz default now());
create table business_transactions(id uuid primary key default gen_random_uuid(),transaction_type text not null check(transaction_type in ('income','expense','cash_adjustment')),source text,title text not null,amount numeric not null,client_id uuid,purchase_id uuid,created_by uuid,transaction_date date default current_date,accounting_month date,report_group text,account_id uuid,created_at timestamptz default now());
create table finance_accounts(id uuid primary key default gen_random_uuid(),name text,opening_balance numeric default 0);
create table leads(id uuid primary key default gen_random_uuid(),full_name text,status text,converted_client_id uuid);
create table trainer_google_calendar_connections(id uuid primary key default gen_random_uuid(),trainer_id uuid unique,google_email text,access_token text,refresh_token text,token_expiry timestamptz,calendar_id text default 'primary',updated_at timestamptz);
create table google_calendar_oauth_states(id uuid primary key default gen_random_uuid(),state text,trainer_id uuid,created_at timestamptz default now());
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
alter table leads enable row level security;
create policy lead_read on leads for select to authenticated using (true);
create function record_staff_session(p_qr_token text,p_session_type text default 'training',p_session_status text default 'success')
returns table(history_id uuid,client_id uuid,client_name text,session_type text,session_status text,remaining_after integer,nutrition_allowed integer,nutrition_used integer,nutrition_remaining integer)
language plpgsql security definer set search_path=public as $$
declare c public.clients%rowtype;sp public.session_packages%rowtype;hid uuid:=gen_random_uuid();remain int;allowed int:=0;used int:=0;r text;
begin
 select role into r from profiles where id=auth.uid();
 if auth.uid() is null or r is null or r not in ('trainer','admin','nutrition_coach') then raise exception 'Access denied';end if;
 if p_session_type='nutrition_follow_up' and r not in ('nutrition_coach','admin') then raise exception 'Access denied';end if;
 select * into c from public.clients where qr_token=p_qr_token;
 if c.id is null or c.status<>'active' then raise exception 'Invalid QR';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.id::text,0));
 if exists(select 1 from session_history sh where sh.client_id=c.id and sh.session_type=p_session_type and sh.status in ('success','no_show','late_cancel') and sh.created_at>=now()-interval '30 minutes') then raise exception 'Duplicate scan detected';end if;
 select * into sp from session_packages x where x.client_id=c.id order by (status='active') desc,created_at desc limit 1 for update;
 remain:=coalesce(sp.remaining_sessions,0);
 if p_session_type='training' then
  if sp.id is null or remain<=0 then raise exception 'No sessions remaining';end if;
  remain:=remain-1;
  update session_packages set used_sessions=used_sessions+1,remaining_sessions=remain,status=case when remain=0 then 'completed' else 'active' end where id=sp.id;
 else
  select floor(greatest(coalesce(sum(session_count),0),coalesce(sp.total_sessions,0))/6.0)::int into allowed from client_purchases x where x.client_id=c.id and purchase_type in ('new','renew','renewal');
  select count(*)::int into used from session_history sh where sh.client_id=c.id and sh.session_type='nutrition_follow_up' and sh.status='success';
  if used>=allowed then raise exception 'No nutrition credit';end if;
  used:=used+1;
 end if;
 insert into session_history(id,client_id,trainer_id,package_id,session_type,status,remaining_after) values(hid,c.id,auth.uid(),sp.id,p_session_type,p_session_status,remain);
 return query select hid,c.id,c.full_name,p_session_type,p_session_status,remain,allowed,used,greatest(allowed-used,0);
end $$;

-- Read-policy compatibility for the two tables whose write policies are hardened.
alter table session_packages enable row level security;
alter table session_history enable row level security;
create policy fixture_package_read on session_packages for select to authenticated using (exists(select 1 from profiles where id=auth.uid() and role in ('admin','manager','trainer','nutrition_coach')) or exists(select 1 from clients where clients.id=session_packages.client_id and profile_id=auth.uid()));
create policy fixture_history_read on session_history for select to authenticated using (exists(select 1 from profiles where id=auth.uid() and role in ('admin','manager','trainer','nutrition_coach')) or exists(select 1 from clients where clients.id=session_history.client_id and profile_id=auth.uid()));
grant update on clients,session_packages,session_history to authenticated;
