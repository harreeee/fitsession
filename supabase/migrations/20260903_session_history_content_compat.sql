-- Temporary compatibility migration for session history pages that still read
-- trainer_note while the scanner now stores the required workout details in
-- session_topic + session_content.
--
-- Safe behavior:
-- - Never overwrites a real trainer_note.
-- - Backfills only rows where trainer_note is blank and session_content exists.
-- - Keeps future rows readable by legacy history views until all pages have
--   been migrated to render session_content directly.

update public.session_history
set trainer_note = session_content
where nullif(btrim(coalesce(trainer_note, '')), '') is null
  and nullif(btrim(coalesce(session_content, '')), '') is not null;

create or replace function public.fxa_session_history_legacy_note_compat()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(new.trainer_note, '')), '') is null
     and nullif(btrim(coalesce(new.session_content, '')), '') is not null then
    new.trainer_note := new.session_content;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fxa_session_history_legacy_note_compat
on public.session_history;

create trigger trg_fxa_session_history_legacy_note_compat
before insert or update of session_content, trainer_note
on public.session_history
for each row
execute function public.fxa_session_history_legacy_note_compat();
