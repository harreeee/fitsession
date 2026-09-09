alter table public.nutrition_follow_logs
  add column if not exists source_session_history_id uuid references public.session_history(id) on delete set null;

create unique index if not exists nutrition_follow_logs_source_session_uidx
  on public.nutrition_follow_logs (source_session_history_id)
  where source_session_history_id is not null;

create or replace function public.sync_nutrition_scan_to_follow_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.session_type <> 'nutrition_follow_up'
     or new.client_id is null
     or new.trainer_id is null
     or btrim(coalesce(new.session_topic, '')) = ''
     or btrim(coalesce(new.session_content, '')) = '' then
    return new;
  end if;

  insert into public.nutrition_follow_logs (
    client_id, nutrition_coach_id, follow_date, method, client_responded,
    nutrition_summary, current_issue, action_taken, follow_result, next_action,
    next_follow_at, outcome, result_4r, review_4r, refer_4r, renew_4r,
    created_by, updated_by, updated_at, source_session_history_id
  ) values (
    new.client_id,
    new.trainer_id,
    coalesce(new.created_at, now()),
    'in_person',
    true,
    new.session_content,
    new.session_topic,
    case
      when nullif(btrim(coalesce(new.trainer_note, '')), '') is not null
       and btrim(new.trainer_note) is distinct from btrim(new.session_content)
      then btrim(new.trainer_note)
      else null
    end,
    null, null, null,
    'complete',
    false, false, false, false,
    new.trainer_id,
    new.trainer_id,
    now(),
    new.id
  )
  on conflict (source_session_history_id) where source_session_history_id is not null
  do update set
    client_id = excluded.client_id,
    nutrition_coach_id = excluded.nutrition_coach_id,
    follow_date = excluded.follow_date,
    method = excluded.method,
    client_responded = excluded.client_responded,
    nutrition_summary = excluded.nutrition_summary,
    current_issue = excluded.current_issue,
    action_taken = excluded.action_taken,
    updated_by = excluded.updated_by,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_nutrition_scan_to_follow_report on public.session_history;
create trigger trg_sync_nutrition_scan_to_follow_report
after insert or update of session_type, session_topic, session_content, trainer_note
on public.session_history
for each row
when (new.session_type = 'nutrition_follow_up')
execute function public.sync_nutrition_scan_to_follow_report();

insert into public.nutrition_follow_logs (
  client_id, nutrition_coach_id, follow_date, method, client_responded,
  nutrition_summary, current_issue, action_taken, follow_result, next_action,
  next_follow_at, outcome, result_4r, review_4r, refer_4r, renew_4r,
  created_by, updated_by, updated_at, source_session_history_id
)
select
  sh.client_id,
  sh.trainer_id,
  coalesce(sh.created_at, now()),
  'in_person',
  true,
  sh.session_content,
  sh.session_topic,
  case
    when nullif(btrim(coalesce(sh.trainer_note, '')), '') is not null
     and btrim(sh.trainer_note) is distinct from btrim(sh.session_content)
    then btrim(sh.trainer_note)
    else null
  end,
  null, null, null,
  'complete',
  false, false, false, false,
  sh.trainer_id,
  sh.trainer_id,
  now(),
  sh.id
from public.session_history sh
where sh.session_type = 'nutrition_follow_up'
  and sh.client_id is not null
  and sh.trainer_id is not null
  and btrim(coalesce(sh.session_topic, '')) <> ''
  and btrim(coalesce(sh.session_content, '')) <> ''
  and not exists (
    select 1 from public.nutrition_follow_logs nfl
    where nfl.source_session_history_id = sh.id
  )
on conflict (source_session_history_id) where source_session_history_id is not null
do nothing;

notify pgrst, 'reload schema';
