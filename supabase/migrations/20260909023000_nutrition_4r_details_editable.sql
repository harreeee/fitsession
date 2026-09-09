alter table public.nutrition_follow_logs
  add column if not exists result_4r_detail text,
  add column if not exists review_4r_detail text,
  add column if not exists refer_4r_detail text,
  add column if not exists renew_4r_detail text,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.nutrition_follow_logs.result_4r_detail is 'Required description when Result 4R is achieved.';
comment on column public.nutrition_follow_logs.review_4r_detail is 'Required description when Review 4R is achieved.';
comment on column public.nutrition_follow_logs.refer_4r_detail is 'Required description when Refer 4R is achieved.';
comment on column public.nutrition_follow_logs.renew_4r_detail is 'Required description when Renew 4R is achieved.';

notify pgrst, 'reload schema';
