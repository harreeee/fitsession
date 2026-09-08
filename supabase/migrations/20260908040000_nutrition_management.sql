create table if not exists public.nutrition_client_status (
  client_id uuid primary key references public.clients(id) on delete cascade,
  follow_requirement text not null default 'unreviewed'
    check (follow_requirement in ('unreviewed','need_follow','no_follow','monitor','paused')),
  follow_reason text,
  workflow_status text not null default 'not_started'
    check (workflow_status in ('not_started','in_progress','waiting_client','waiting_pt','followed','follow_again','escalate')),
  priority text
    check (priority is null or priority in ('p1','p2','p3')),
  nutrition_coach_id uuid references public.profiles(id) on delete set null,
  next_follow_at date,
  admin_note text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists nutrition_client_status_requirement_idx
  on public.nutrition_client_status (follow_requirement, workflow_status, priority);

create index if not exists nutrition_client_status_coach_idx
  on public.nutrition_client_status (nutrition_coach_id);

create index if not exists nutrition_client_status_next_follow_idx
  on public.nutrition_client_status (next_follow_at);

create table if not exists public.nutrition_follow_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nutrition_coach_id uuid not null references public.profiles(id) on delete restrict,
  follow_date timestamptz not null default now(),
  method text not null default 'chat'
    check (method in ('chat','call','in_person','pt_support')),
  client_responded boolean,
  nutrition_summary text,
  body_comp text,
  activity text,
  current_issue text,
  action_taken text,
  follow_result text,
  next_action text,
  next_follow_at date,
  outcome text not null default 'complete'
    check (outcome in ('complete','needs_follow_again','waiting_client','waiting_pt','escalate')),
  result_4r boolean not null default false,
  review_4r boolean not null default false,
  refer_4r boolean not null default false,
  renew_4r boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_follow_logs_client_date_idx
  on public.nutrition_follow_logs (client_id, follow_date desc);

create index if not exists nutrition_follow_logs_coach_date_idx
  on public.nutrition_follow_logs (nutrition_coach_id, follow_date desc);

alter table public.nutrition_client_status enable row level security;
alter table public.nutrition_follow_logs enable row level security;

revoke all on table public.nutrition_client_status from anon, authenticated;
revoke all on table public.nutrition_follow_logs from anon, authenticated;

grant select, insert, update, delete on table public.nutrition_client_status to service_role;
grant select, insert, update, delete on table public.nutrition_follow_logs to service_role;

notify pgrst, 'reload schema';
