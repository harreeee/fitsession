-- Finance role: Admin manages clients/sessions; Accountant owns money, journal, and closing.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in
 ('admin','manager','marketing_manager','trainer','nutrition_coach','client','accountant'));

create or replace function public.fxa_require_accountant() returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='accountant')
 then raise exception 'Accountant permission required'; end if;
 return auth.uid();
end $$;
revoke all on function public.fxa_require_accountant() from public;
grant execute on function public.fxa_require_accountant() to authenticated;

create policy "accountant read clients" on public.clients for select to authenticated
 using (public.current_user_role()='accountant');
create policy "accountant read client purchases" on public.client_purchases for select to authenticated
 using (public.current_user_role()='accountant');
create policy "accountant read finance accounts" on public.finance_accounts for select to authenticated
 using (public.current_user_role()='accountant');
create policy "accountant read finance categories" on public.finance_categories for select to authenticated
 using (public.current_user_role()='accountant');
create policy "accountant read business transactions" on public.business_transactions for select to authenticated
 using (public.current_user_role()='accountant');
create policy "accountant read business payables" on public.business_payables for select to authenticated
 using (public.current_user_role()='accountant');
create policy "accountant read finance edit history" on public.finance_edit_audit for select to authenticated
 using (public.current_user_role()='accountant');

-- Admin retains finance SELECT for oversight, loses direct write access.
drop policy if exists "Admin can manage business transactions" on public.business_transactions;
drop policy if exists "business_transactions_admin_all" on public.business_transactions;
-- Journal writes are only via the privileged RPCs, which validate Accountant role and links.
-- Do not grant direct UPDATE/DELETE through PostgREST, even to Accountant:
-- they would bypass the obligatory audit reason and purchase reconciliation.

drop policy if exists "admin manage finance accounts" on public.finance_accounts;
create policy "accountant manage finance accounts" on public.finance_accounts for all to authenticated
 using (public.current_user_role()='accountant')
 with check (public.current_user_role()='accountant');

drop policy if exists "admin manage custom finance categories" on public.finance_categories;
create policy "accountant manage custom finance categories" on public.finance_categories for all to authenticated
 using (not is_system and public.current_user_role()='accountant')
 with check (not is_system and public.current_user_role()='accountant');

drop policy if exists "admin can delete unpaid business payables" on public.business_payables;
drop policy if exists "admin can insert business payables" on public.business_payables;
drop policy if exists "admin can update business payables" on public.business_payables;
create policy "accountant manage payables" on public.business_payables for all to authenticated
 using (public.current_user_role()='accountant')
 with check (public.current_user_role()='accountant');

-- Finance figures in client_purchases may ONLY be changed by the accountant.
-- DML triggers see the signed-in user in auth.uid even for security definer RPCs.
create or replace function public.fxa_guard_client_purchase_amounts()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 select role into v_role from public.profiles where id=auth.uid();
 if v_role='admin' or v_role='manager' or v_role='client' then
  if tg_op='INSERT' and
      (coalesce(new.price,0)<>0 or coalesce(new.amount_paid,0)<>0 or coalesce(new.balance_due,0)<>0) then
   raise exception 'Only Accountant enters contract amounts and debt figures.';
  end if;
  if tg_op='UPDATE' and
      (new.price is distinct from old.price or new.amount_paid is distinct from old.amount_paid or new.balance_due is distinct from old.balance_due
      or new.payment_method is distinct from old.payment_method) then
   raise exception 'Only Accountant edits financial amounts; use the Finance desk.';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists fxa_guard_client_purchase_amounts on public.client_purchases;
create trigger fxa_guard_client_purchase_amounts
before insert or update on public.client_purchases for each row execute function public.fxa_guard_client_purchase_amounts();

-- Prevent deleting finance-linked purchases/clients, preserving ledger references.
create or replace function public.fxa_prevent_linked_purchase_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.business_transactions where purchase_id=old.id) then
   raise exception 'Purchase has financial receipts. Keep its history and mark client inactive.';
 end if;
 return old;
end $$;
drop trigger if exists fxa_prevent_linked_purchase_delete on public.client_purchases;
create trigger fxa_prevent_linked_purchase_delete before delete on public.client_purchases
for each row execute function public.fxa_prevent_linked_purchase_delete();

-- Existing numeric editor bypass is unsafe; users must use controlled accountant functions.
create or replace function public.admin_edit_client_purchase_numbers(
 p_purchase_id uuid,p_new_price numeric,p_new_amount_paid numeric,p_new_balance_due numeric,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 raise exception 'This editor has been retired. Accountant must edit contract value or recorded receipts in Finance.';
end $$;

CREATE OR REPLACE FUNCTION public.fxa_create_client(p_request_id uuid, p_client jsonb, p_package jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=fxa_private.require_role(array['admin']); p jsonb:=jsonb_build_object('client',p_client,'package',p_package); old jsonb; c uuid; cp uuid; n int:=coalesce((p_package->>'sessions')::int,0); price numeric:=0; paid numeric:=0; state text;
begin
 old:=fxa_private.replay(p_request_id,'create_client',p); if old is not null then return (old->>'id')::uuid; end if;
 if btrim(coalesce(p_client->>'full_name',''))='' or n<0 or n>10000 then raise exception 'Valid client name and sessions required.'; end if;
 if coalesce((p_package->>'value')::numeric,0) <> 0 or coalesce((p_package->>'paid')::numeric,0) <> 0 then
  raise exception 'Admin registers the package only. Accountant enters contract value and records receipts in Finance.';
 end if;
 state:='pending';
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
end $function$

CREATE OR REPLACE FUNCTION public.fxa_renew_package(p_request_id uuid, p_client_id uuid, p_package jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=fxa_private.require_role(array['admin']); p jsonb:=jsonb_build_object('client',p_client_id,'package',p_package); old jsonb; sp public.session_packages%rowtype; cp uuid; n int:=(p_package->>'sessions')::int; price numeric:=0; paid numeric:=0; state text;
begin
 old:=fxa_private.replay(p_request_id,'renew',p); if old is not null then return (old->>'id')::uuid; end if;
 if n is null or n<=0 or n>10000 then raise exception 'Valid session count required.'; end if;
 if coalesce((p_package->>'value')::numeric,0) <> 0 or coalesce((p_package->>'paid')::numeric,0) <> 0 then
  raise exception 'Admin renews sessions only. Accountant enters contract value and records receipts.';
 end if;
 state:='pending';
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
end $function$

-- Change commercial terms only. No new cash is created.
create or replace function public.fxa_accountant_set_contract(
 p_purchase_id uuid,p_new_price numeric,p_debt_deadline date,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.fxa_require_accountant(); v_old public.client_purchases%rowtype; v_balance numeric;
begin
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'A specific reason (minimum 5 characters) is required.';end if;
 if p_new_price is null or p_new_price<0 or p_new_price<>round(p_new_price,2) then raise exception 'Invalid CAD contract value';end if;
 select * into v_old from public.client_purchases where id=p_purchase_id for update;
 if not found then raise exception 'Purchase not found';end if;
 if p_new_price<coalesce(v_old.amount_paid,0) then
   raise exception 'Contract value cannot be below cash already received. Correct the receipt separately.';
 end if;
 v_balance:=p_new_price-coalesce(v_old.amount_paid,0);
 update public.client_purchases set price=p_new_price,balance_due=v_balance,debt_deadline=p_debt_deadline,
 status=case when p_new_price=0 then 'pending' when v_balance=0 then 'paid' when coalesce(v_old.amount_paid,0)>0 then 'partial' else 'confirmed' end
 where id=p_purchase_id;
 -- Existing renewal RPC accumulates package_value into the most recent session_package.
 -- Apply the contract delta, not the entire new price, so renewals are never double-counted.
 if v_old.session_count>0 and v_old.price is distinct from p_new_price then
  update public.session_packages sp set package_value=coalesce(sp.package_value,0)+(p_new_price-v_old.price)
  where sp.id=(select id from public.session_packages where client_id=v_old.client_id order by (status='active') desc,created_at desc limit 1);
 end if;
 if v_old.price is distinct from p_new_price then
   insert into public.finance_edit_audit(table_name,record_id,field_name,old_value,new_value,reason,edited_by,old_value_json,new_value_json)
    values('client_purchases',p_purchase_id,'price',v_old.price,p_new_price,p_reason,v_actor,to_jsonb(v_old.price),to_jsonb(p_new_price));
 end if;
 if v_old.balance_due is distinct from v_balance then
   insert into public.finance_edit_audit(table_name,record_id,field_name,old_value,new_value,reason,edited_by,old_value_json,new_value_json)
    values('client_purchases',p_purchase_id,'balance_due',v_old.balance_due,v_balance,p_reason,v_actor,to_jsonb(v_old.balance_due),to_jsonb(v_balance));
 end if;
 return jsonb_build_object('purchase_id',p_purchase_id,'price',p_new_price,'paid',v_old.amount_paid,'debt',v_balance);
end $$;
revoke all on function public.fxa_accountant_set_contract(uuid,numeric,date,text) from public;
grant execute on function public.fxa_accountant_set_contract(uuid,numeric,date,text) to authenticated;

-- Accountant may record an initial or subsequent payment. Atomically update Clients + Journal.
create or replace function public.fxa_accountant_record_receipt(
 p_request_id uuid,p_purchase_id uuid,p_amount numeric,p_payment_date date,p_account_id uuid,p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.fxa_require_accountant();v_purchase public.client_purchases%rowtype;
 v_name text;v_account public.finance_accounts%rowtype;v_category public.finance_categories%rowtype;
 v_source text;v_title text;v_id uuid;v_payload jsonb;v_old jsonb;
begin
 if p_request_id is null then raise exception 'Request id is required for duplicate-payment protection';end if;
 v_payload:=jsonb_build_object('purchase',p_purchase_id,'amount',p_amount,'date',p_payment_date,'account',p_account_id,'note',p_notes);
 v_old:=fxa_private.replay(p_request_id,'accountant_receipt',v_payload);if v_old is not null then return v_old;end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_payment_date is null
   or extract(year from p_payment_date) not between 2000 and 2100 then raise exception 'Invalid receipt date or amount';end if;
 select * into v_purchase from public.client_purchases where id=p_purchase_id for update;
 if not found or v_purchase.status in ('cancelled','failed') then raise exception 'Purchase is not collectible';end if;
 if coalesce(v_purchase.price,0)<=0 then raise exception 'Accountant must set contract amount before receipt';end if;
 if p_amount>coalesce(v_purchase.balance_due,0) then raise exception 'Payment exceeds balance due';end if;
 select * into v_account from public.finance_accounts where id=p_account_id and is_active and name<>'Số dư chưa phân bổ';
 if not found then raise exception 'Select an active bank/cash source';end if;
 select full_name into v_name from public.clients where id=v_purchase.client_id;
 if v_name is null then raise exception 'Client not found';end if;
 v_source:=case when v_purchase.purchase_type='debt' or coalesce(v_purchase.amount_paid,0)>0 then 'debt_payment' else 'package_payment' end;
 select * into v_category from public.finance_categories
  where system_key=case when v_source='debt_payment' then 'client_debt_collection' else 'sales_service_revenue' end and is_active=true limit 1;
 if not found then raise exception 'Required finance income category is missing';end if;
 v_title:=case when v_source='debt_payment' then 'Thu công nợ' when v_purchase.purchase_type='renew' then 'Thu gia hạn gói' else 'Thu tiền gói mới' end
          ||' - '||v_name||' - '||v_purchase.plan_name;
 insert into public.business_transactions
  (transaction_type,source,title,amount,notes,client_id,purchase_id,created_by,transaction_date,accounting_month,
   report_group,counterparty,account_id,category_id)
 values ('income',v_source,v_title,p_amount,nullif(btrim(coalesce(p_notes,'')),''),v_purchase.client_id,v_purchase.id,v_actor,
  p_payment_date,date_trunc('month',p_payment_date)::date,v_category.report_group,v_name,v_account.id,v_category.id)
 returning id into v_id;
 update public.client_purchases set amount_paid=coalesce(amount_paid,0)+p_amount,
 balance_due=balance_due-p_amount,
 status=case when balance_due-p_amount=0 then 'paid' else 'partial' end where id=v_purchase.id;
 return fxa_private.remember(p_request_id,'accountant_receipt',v_payload,
  jsonb_build_object('transaction_id',v_id,'purchase_id',v_purchase.id,'amount',p_amount,'remaining',v_purchase.balance_due-p_amount));
end $$;
revoke all on function public.fxa_accountant_record_receipt(uuid,uuid,numeric,date,uuid,text) from public;
grant execute on function public.fxa_accountant_record_receipt(uuid,uuid,numeric,date,uuid,text) to authenticated;

-- Read-only shared finance reconciliation for both dashboards.
create or replace view public.fxa_client_finance_reconciliation with (security_invoker=true) as
select p.id purchase_id,p.client_id,c.full_name client_name,p.plan_name,p.purchase_type,p.created_at,p.price,p.amount_paid,p.balance_due,
 (coalesce(p.price,0)-coalesce(p.amount_paid,0)-coalesce(p.balance_due,0)) numeric_gap,
 coalesce(t.journal_cash,0) linked_journal_cash,coalesce(t.unallocated_receipts,0) unallocated_receipts,
 coalesce(t.receipts_count,0) receipts_count
from public.client_purchases p join public.clients c on c.id=p.client_id
left join lateral(
  select sum(case when bt.transaction_type='income' then bt.amount else -bt.amount end) journal_cash,
         count(*) filter(where bt.account_id is null) unallocated_receipts,count(*) receipts_count
  from public.business_transactions bt where bt.purchase_id=p.id
) t on true;
grant select on public.fxa_client_finance_reconciliation to authenticated;

-- Month-end closing snapshot. Closing is an explicit Accountant action; historical data is not restated.
create table if not exists public.fxa_month_end_closings(
 month_start date primary key, cash_in numeric(14,2) not null, cash_out numeric(14,2) not null,
 cash_adjustment numeric(14,2) not null, accounts_total numeric(14,2) not null,
 receivables_snapshot numeric(14,2) not null,payables_snapshot numeric(14,2) not null,
 note text not null,closed_by uuid not null references public.profiles(id),closed_at timestamptz not null default now(),
 constraint fxa_close_month_first check (date_trunc('month',month_start)::date=month_start)
);
alter table public.fxa_month_end_closings enable row level security;
create policy "financial staff read closings" on public.fxa_month_end_closings for select to authenticated
 using (public.current_user_role() in ('admin','manager','accountant'));
-- Only new open months can be closed using RPC. No direct client-side writes.
create or replace function public.fxa_close_month(p_month date,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.fxa_require_accountant();v_cash_in numeric;v_cash_out numeric;v_adj numeric;v_accounts numeric;
 v_receivable numeric;v_payable numeric;v_unallocated int;v_invalid int;
begin
 if p_month is null or date_trunc('month',p_month)::date<>p_month then raise exception 'Use the first day of month';end if;
 if p_month<>date_trunc('month',current_date - interval '1 month')::date then raise exception 'Only the most recent completed month may be closed; legacy months require historical reconciliation.';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Closing note is required';end if;
 if exists(select 1 from public.fxa_month_end_closings where month_start=p_month) then raise exception 'Month already closed. No silent overwriting.';end if;
 select count(*) filter(where account_id is null),
 count(*) filter(where extract(year from transaction_date) not between 2000 and 2100)
 into v_unallocated,v_invalid from public.business_transactions
 where transaction_date>=p_month and transaction_date<(p_month+interval '1 month')::date;
 if v_unallocated>0 or v_invalid>0 then raise exception 'Unallocated or invalid journal rows must be reconciled first';end if;
 select coalesce(sum(amount) filter(where transaction_type='income'),0),coalesce(sum(amount) filter(where transaction_type='expense'),0),coalesce(sum(amount) filter(where transaction_type='cash_adjustment'),0)
 into v_cash_in,v_cash_out,v_adj from public.business_transactions
 where transaction_date>=p_month and transaction_date<(p_month+interval '1 month')::date;
 select coalesce(sum(coalesce(a.opening_balance,0)+coalesce(t.net,0)),0) into v_accounts
 from public.finance_accounts a left join lateral
  (select sum(case when bt.transaction_type='income' then abs(bt.amount) when bt.transaction_type='expense' then -abs(bt.amount) else bt.amount end) net
   from public.business_transactions bt where bt.account_id=a.id) t on true;
 select coalesce(sum(balance_due),0) into v_receivable from public.client_purchases where status not in ('cancelled','failed');
 select coalesce(sum(greatest(total_amount-paid_amount,0)),0) into v_payable from public.business_payables where status<>'cancelled';
 insert into public.fxa_month_end_closings(month_start,cash_in,cash_out,cash_adjustment,accounts_total,receivables_snapshot,payables_snapshot,note,closed_by)
 values(p_month,v_cash_in,v_cash_out,v_adj,v_accounts,v_receivable,v_payable,p_note,v_actor);
 return jsonb_build_object('month',p_month,'in',v_cash_in,'out',v_cash_out,'net',v_cash_in-v_cash_out+v_adj,'receivables_snapshot',v_receivable);
end $$;
revoke all on function public.fxa_close_month(date,text) from public;
grant execute on function public.fxa_close_month(date,text) to authenticated;

-- Finance RPCs are restricted to Accountant (replaced from legacy admin authorizers).
-- create_finance_transaction
CREATE OR REPLACE FUNCTION public.create_finance_transaction(p_transaction_type text, p_account_id uuid, p_category_id uuid, p_source text, p_title text, p_amount numeric, p_transaction_date date, p_accounting_month date, p_counterparty text DEFAULT NULL::text, p_document_no text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_trainer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_account public.finance_accounts%rowtype;
  v_category public.finance_categories%rowtype;
  v_balance numeric(14, 2);
  v_transaction_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'accountant'
  ) then
    raise exception 'Only accountant can create finance transactions.';
  end if;

  if p_transaction_type not in ('income', 'expense') then
    raise exception 'Transaction type must be income or expense.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Transaction title is required.';
  end if;

  select * into v_account
  from public.finance_accounts
  where id = p_account_id
  for update;

  if not found or not v_account.is_active then
    raise exception 'Payment account is missing or inactive.';
  end if;

  select * into v_category
  from public.finance_categories
  where id = p_category_id and is_active = true;

  if not found then
    raise exception 'Category is missing or inactive.';
  end if;

  if v_category.category_kind <> p_transaction_type then
    raise exception 'Category does not match transaction type.';
  end if;

  if v_category.system_key = 'salary' and p_trainer_id is null then
    raise exception 'Salary expense must identify the trainer/PT.';
  end if;

  if p_transaction_type = 'expense' and not v_account.allow_negative then
    v_balance := public.get_finance_account_balance(v_account.id);
    if p_amount > v_balance then
      raise exception 'Insufficient account balance. Current balance: %', v_balance;
    end if;
  end if;

  insert into public.business_transactions (
    transaction_type,
    source,
    title,
    amount,
    notes,
    created_by,
    transaction_date,
    accounting_month,
    report_group,
    counterparty,
    document_no,
    account_id,
    category_id,
    trainer_id
  )
  values (
    p_transaction_type,
    coalesce(nullif(trim(p_source), ''), 'manual'),
    trim(p_title),
    p_amount,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    coalesce(p_transaction_date, current_date),
    date_trunc('month', coalesce(p_accounting_month, p_transaction_date, current_date))::date,
    v_category.report_group,
    nullif(trim(coalesce(p_counterparty, '')), ''),
    nullif(trim(coalesce(p_document_no, '')), ''),
    v_account.id,
    v_category.id,
    p_trainer_id
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$function$


-- create_finance_transfer
CREATE OR REPLACE FUNCTION public.create_finance_transfer(p_from_account_id uuid, p_to_account_id uuid, p_amount numeric, p_transfer_date date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from public.finance_accounts%rowtype;
  v_to public.finance_accounts%rowtype;
  v_balance numeric(14, 2);
  v_transfer_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'accountant'
  ) then
    raise exception 'Only accountant can transfer money between accounts.';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'Source and destination accounts must be different.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be greater than zero.';
  end if;

  select * into v_from from public.finance_accounts
  where id = p_from_account_id for update;
  select * into v_to from public.finance_accounts
  where id = p_to_account_id for update;

  if v_from.id is null or v_to.id is null or not v_from.is_active or not v_to.is_active then
    raise exception 'One or both accounts are missing or inactive.';
  end if;

  if not v_from.allow_negative then
    v_balance := public.get_finance_account_balance(v_from.id);
    if p_amount > v_balance then
      raise exception 'Insufficient source account balance. Current balance: %', v_balance;
    end if;
  end if;

  insert into public.finance_transfers (
    from_account_id, to_account_id, amount, transfer_date, notes, created_by
  )
  values (
    v_from.id, v_to.id, p_amount, coalesce(p_transfer_date, current_date),
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  )
  returning id into v_transfer_id;

  insert into public.business_transactions (
    transaction_type, source, title, amount, notes, created_by,
    transaction_date, accounting_month, report_group, counterparty,
    account_id, transfer_id
  )
  values
  (
    'cash_adjustment', 'account_transfer',
    'Chuyển tiền sang ' || v_to.name,
    -p_amount,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(), coalesce(p_transfer_date, current_date),
    date_trunc('month', coalesce(p_transfer_date, current_date))::date,
    'cash_only', v_to.name, v_from.id, v_transfer_id
  ),
  (
    'cash_adjustment', 'account_transfer',
    'Nhận tiền từ ' || v_from.name,
    p_amount,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(), coalesce(p_transfer_date, current_date),
    date_trunc('month', coalesce(p_transfer_date, current_date))::date,
    'cash_only', v_from.name, v_to.id, v_transfer_id
  );

  return v_transfer_id;
end;
$function$


-- pay_business_payable_v2
CREATE OR REPLACE FUNCTION public.pay_business_payable_v2(p_payable_id uuid, p_amount numeric, p_payment_date date, p_account_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payable public.business_payables%rowtype;
  v_account public.finance_accounts%rowtype;
  v_remaining numeric(14, 2);
  v_balance numeric(14, 2);
  v_transaction_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'accountant'
  ) then
    raise exception 'Only accountant can pay a business payable.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  select * into v_payable from public.business_payables
  where id = p_payable_id for update;

  if not found then
    raise exception 'Payable not found.';
  end if;

  if v_payable.status = 'cancelled' then
    raise exception 'Cancelled payable cannot be paid.';
  end if;

  if v_payable.payable_type = 'salary' and v_payable.trainer_id is null then
    raise exception 'Salary payable must identify the trainer/PT before payment.';
  end if;

  select * into v_account from public.finance_accounts
  where id = p_account_id for update;

  if not found or not v_account.is_active then
    raise exception 'Payment account is missing or inactive.';
  end if;

  v_remaining := v_payable.total_amount - v_payable.paid_amount;
  if p_amount > v_remaining then
    raise exception 'Payment exceeds remaining payable balance.';
  end if;

  if not v_account.allow_negative then
    v_balance := public.get_finance_account_balance(v_account.id);
    if p_amount > v_balance then
      raise exception 'Insufficient account balance. Current balance: %', v_balance;
    end if;
  end if;

  insert into public.business_transactions (
    transaction_type, source, title, amount, notes, created_by,
    transaction_date, accounting_month, report_group, counterparty,
    payable_id, account_id, category_id, trainer_id
  )
  values (
    'expense', 'payable_payment',
    case
      when v_payable.payable_type = 'salary' then 'Thanh toán lương - ' || v_payable.counterparty
      else 'Thanh toán công nợ - ' || v_payable.title
    end,
    p_amount,
    nullif(concat_ws(' | ', 'Công nợ: ' || v_payable.title, p_notes), ''),
    auth.uid(), coalesce(p_payment_date, current_date),
    v_payable.accounting_month, 'cash_only', v_payable.counterparty,
    v_payable.id, v_account.id, v_payable.category_id, v_payable.trainer_id
  )
  returning id into v_transaction_id;

  update public.business_payables
  set
    paid_amount = paid_amount + p_amount,
    status = case
      when paid_amount + p_amount >= total_amount then 'paid'
      else 'partial'
    end,
    updated_at = now()
  where id = v_payable.id;

  return v_transaction_id;
end;
$function$


-- update_business_payable_v2
CREATE OR REPLACE FUNCTION public.update_business_payable_v2(p_payable_id uuid, p_category_id uuid, p_trainer_id uuid, p_counterparty text, p_title text, p_total_amount numeric, p_accounting_month date, p_due_date date, p_notes text, p_edit_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin_id uuid;
  v_row public.business_payables%rowtype;
  v_category public.finance_categories%rowtype;
  v_trainer_name text;
  v_reason text := btrim(coalesce(p_edit_reason, ''));
  v_counterparty text := btrim(coalesce(p_counterparty, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_payable_type text;
begin
  v_admin_id := public.fxa_require_accountant();

  if v_reason = '' then
    raise exception 'Edit reason is required.';
  end if;
  if v_title = '' then
    raise exception 'Payable title is required.';
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Total amount must be greater than zero.';
  end if;
  if p_accounting_month is null then
    raise exception 'Accounting month is required.';
  end if;

  select * into v_row
  from public.business_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'Payable not found.';
  end if;

  if p_total_amount < coalesce(v_row.paid_amount, 0) then
    raise exception 'Total amount cannot be lower than the amount already paid.';
  end if;

  select * into v_category
  from public.finance_categories
  where id = p_category_id
    and category_kind = 'expense'
    and is_active = true;

  if not found then
    raise exception 'Expense category is missing or inactive.';
  end if;

  v_payable_type := case v_category.system_key
    when 'salary' then 'salary'
    when 'rent' then 'rent'
    when 'utilities' then 'utilities'
    when 'internet' then 'internet'
    when 'insurance' then 'insurance'
    when 'tax' then 'tax'
    when 'credit_expense' then 'loan'
    when 'marketing' then 'marketing'
    when 'capital_investment' then 'equipment'
    when 'depreciation' then 'depreciation'
    else 'other'
  end;

  if v_category.system_key = 'salary' then
    if p_trainer_id is null then
      raise exception 'Salary payable must identify the trainer/PT.';
    end if;

    select coalesce(nullif(btrim(full_name), ''), email)
      into v_trainer_name
    from public.profiles
    where id = p_trainer_id
      and role in ('trainer', 'nutrition_coach');

    if v_trainer_name is null then
      raise exception 'Trainer/PT not found.';
    end if;
    v_counterparty := v_trainer_name;
  elsif v_counterparty = '' then
    raise exception 'Counterparty is required.';
  end if;

  update public.business_payables
  set category_id = v_category.id,
      trainer_id = case when v_category.system_key = 'salary' then p_trainer_id else null end,
      payable_type = v_payable_type,
      counterparty = v_counterparty,
      title = v_title,
      total_amount = p_total_amount,
      accounting_month = date_trunc('month', p_accounting_month)::date,
      due_date = p_due_date,
      expense_group = v_category.report_group,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      status = case
        when v_row.status = 'cancelled' then 'cancelled'
        when coalesce(v_row.paid_amount, 0) <= 0 then 'unpaid'
        when coalesce(v_row.paid_amount, 0) >= p_total_amount then 'paid'
        else 'partial'
      end,
      updated_at = now()
  where id = v_row.id;

  insert into public.finance_edit_audit(
    table_name, record_id, field_name, old_value, new_value, reason, edited_by
  ) values (
    'business_payables', v_row.id, 'payable_details', null, null, v_reason, v_admin_id
  );

  if v_row.total_amount is distinct from p_total_amount then
    insert into public.finance_edit_audit(
      table_name, record_id, field_name, old_value, new_value, reason, edited_by
    ) values (
      'business_payables', v_row.id, 'total_amount',
      v_row.total_amount, p_total_amount, v_reason, v_admin_id
    );
  end if;

  return v_row.id;
end;
$function$


-- admin_edit_business_payable_numbers
CREATE OR REPLACE FUNCTION public.admin_edit_business_payable_numbers(p_payable_id uuid, p_new_total_amount numeric, p_new_paid_amount numeric, p_adjustment_account_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_id uuid;
  v_row public.business_payables%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_paid_delta numeric := 0;
  v_account_id uuid;
  v_new_status text;
begin
  v_admin_id := public.fxa_require_accountant();

  if v_reason = '' then
    raise exception 'Edit reason is required.';
  end if;

  if p_new_total_amount is null or p_new_total_amount < 0 then
    raise exception 'Total amount must be 0 or greater.';
  end if;

  if p_new_paid_amount is null or p_new_paid_amount < 0 then
    raise exception 'Paid amount must be 0 or greater.';
  end if;

  if p_new_paid_amount > p_new_total_amount then
    raise exception 'Paid amount cannot be greater than total amount.';
  end if;

  select *
  into v_row
  from public.business_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'Payable not found.';
  end if;

  v_paid_delta := p_new_paid_amount - coalesce(v_row.paid_amount, 0);

  if v_paid_delta <> 0 then
    v_account_id := p_adjustment_account_id;

    if v_account_id is null then
      select t.account_id
      into v_account_id
      from public.business_transactions t
      where t.payable_id = p_payable_id
        and t.account_id is not null
      order by t.transaction_date desc, t.created_at desc
      limit 1;
    end if;

    if v_account_id is null then
      raise exception 'Choose a finance account when changing the paid amount.';
    end if;

    if not exists (
      select 1
      from public.finance_accounts a
      where a.id = v_account_id
    ) then
      raise exception 'Finance account not found.';
    end if;

    -- Paid amount correction affects cash, but not P&L. A positive paid delta
    -- means additional cash left the account, therefore the adjustment is negative.
    insert into public.business_transactions(
      transaction_type,
      source,
      title,
      amount,
      notes,
      transaction_date,
      accounting_month,
      report_group,
      payable_id,
      account_id,
      trainer_id,
      created_by
    ) values (
      'cash_adjustment',
      'admin_payable_paid_correction',
      'Admin paid amount correction - ' || coalesce(v_row.title, 'Payable'),
      -v_paid_delta,
      v_reason,
      current_date,
      date_trunc('month', current_date)::date,
      'cash_only',
      p_payable_id,
      v_account_id,
      v_row.trainer_id,
      v_admin_id
    );
  end if;

  v_new_status := case
    when v_row.status = 'cancelled' then 'cancelled'
    when p_new_total_amount = 0 then 'paid'
    when p_new_paid_amount <= 0 then 'unpaid'
    when p_new_paid_amount >= p_new_total_amount then 'paid'
    else 'partial'
  end;

  update public.business_payables
  set total_amount = p_new_total_amount,
      paid_amount = p_new_paid_amount,
      status = v_new_status,
      updated_at = now()
  where id = p_payable_id;

  if v_row.total_amount is distinct from p_new_total_amount then
    insert into public.finance_edit_audit(
      table_name, record_id, field_name, old_value, new_value, reason, edited_by
    ) values (
      'business_payables', p_payable_id, 'total_amount',
      v_row.total_amount, p_new_total_amount, v_reason, v_admin_id
    );
  end if;

  if v_row.paid_amount is distinct from p_new_paid_amount then
    insert into public.finance_edit_audit(
      table_name, record_id, field_name, old_value, new_value, reason, edited_by
    ) values (
      'business_payables', p_payable_id, 'paid_amount',
      v_row.paid_amount, p_new_paid_amount, v_reason, v_admin_id
    );
  end if;
end;
$function$


-- admin_edit_finance_transfer_amount
CREATE OR REPLACE FUNCTION public.admin_edit_finance_transfer_amount(p_transfer_id uuid, p_new_amount numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_id uuid;
  v_row public.finance_transfers%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_admin_id := public.fxa_require_accountant();

  if v_reason = '' then
    raise exception 'Edit reason is required.';
  end if;

  if p_new_amount is null or p_new_amount <= 0 then
    raise exception 'Transfer amount must be greater than 0.';
  end if;

  select *
  into v_row
  from public.finance_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found.';
  end if;

  if v_row.amount is not distinct from p_new_amount then
    return;
  end if;

  update public.finance_transfers
  set amount = p_new_amount
  where id = p_transfer_id;

  -- Transfer RPCs in this project write two linked cash-adjustment ledger rows.
  -- Preserve the original sign of each side while changing the magnitude.
  update public.business_transactions
  set amount = case
    when amount < 0 then -abs(p_new_amount)
    else abs(p_new_amount)
  end
  where transfer_id = p_transfer_id;

  insert into public.finance_edit_audit(
    table_name,
    record_id,
    field_name,
    old_value,
    new_value,
    reason,
    edited_by
  ) values (
    'finance_transfers',
    p_transfer_id,
    'amount',
    v_row.amount,
    p_new_amount,
    v_reason,
    v_admin_id
  );
end;
$function$


-- admin_edit_finance_account_opening_balance
CREATE OR REPLACE FUNCTION public.admin_edit_finance_account_opening_balance(p_account_id uuid, p_new_opening_balance numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_id uuid;
  v_row public.finance_accounts%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_admin_id := public.fxa_require_accountant();

  if v_reason = '' then
    raise exception 'Edit reason is required.';
  end if;

  if p_new_opening_balance is null then
    raise exception 'New opening balance is required.';
  end if;

  select *
  into v_row
  from public.finance_accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'Finance account not found.';
  end if;

  if v_row.opening_balance is not distinct from p_new_opening_balance then
    return;
  end if;

  update public.finance_accounts
  set opening_balance = p_new_opening_balance
  where id = p_account_id;

  insert into public.finance_edit_audit(
    table_name,
    record_id,
    field_name,
    old_value,
    new_value,
    reason,
    edited_by
  ) values (
    'finance_accounts',
    p_account_id,
    'opening_balance',
    v_row.opening_balance,
    p_new_opening_balance,
    v_reason,
    v_admin_id
  );
end;
$function$


-- admin_set_finance_account_current_balance
CREATE OR REPLACE FUNCTION public.admin_set_finance_account_current_balance(p_account_id uuid, p_new_balance numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_id uuid;
  v_account public.finance_accounts%rowtype;
  v_current_balance numeric := 0;
  v_delta numeric := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_admin_id := public.fxa_require_accountant();

  if v_reason = '' then
    raise exception 'Edit reason is required.';
  end if;

  if p_new_balance is null then
    raise exception 'New balance is required.';
  end if;

  select *
  into v_account
  from public.finance_accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'Finance account not found.';
  end if;

  select
    coalesce(v_account.opening_balance, 0)
    + coalesce(sum(
        case
          when t.transaction_type = 'income' then abs(coalesce(t.amount, 0))
          when t.transaction_type = 'expense' then -abs(coalesce(t.amount, 0))
          else coalesce(t.amount, 0)
        end
      ), 0)
  into v_current_balance
  from public.business_transactions t
  where t.account_id = p_account_id;

  v_delta := p_new_balance - v_current_balance;

  if v_delta = 0 then
    return;
  end if;

  insert into public.business_transactions(
    transaction_type,
    source,
    title,
    amount,
    notes,
    transaction_date,
    accounting_month,
    report_group,
    account_id,
    created_by
  ) values (
    'cash_adjustment',
    'admin_balance_correction',
    'Admin balance correction - ' || coalesce(v_account.name, 'Finance account'),
    v_delta,
    v_reason,
    current_date,
    date_trunc('month', current_date)::date,
    'cash_only',
    p_account_id,
    v_admin_id
  );

  insert into public.finance_edit_audit(
    table_name,
    record_id,
    field_name,
    old_value,
    new_value,
    reason,
    edited_by
  ) values (
    'finance_accounts',
    p_account_id,
    'current_balance',
    v_current_balance,
    p_new_balance,
    v_reason,
    v_admin_id
  );
end;
$function$


-- admin_edit_finance_transaction_amount
CREATE OR REPLACE FUNCTION public.admin_edit_finance_transaction_amount(p_transaction_id uuid, p_new_amount numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_id uuid;
  v_row public.business_transactions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_admin_id := public.fxa_require_accountant();

  if v_reason = '' then
    raise exception 'Edit reason is required.';
  end if;

  select *
  into v_row
  from public.business_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found.';
  end if;

  if v_row.transfer_id is not null then
    raise exception 'This transaction belongs to a transfer. Edit the transfer amount instead.';
  end if;

  if v_row.payable_id is not null then
    raise exception 'This transaction belongs to a payable. Edit the payable numbers instead.';
  end if;

  if p_new_amount is null then
    raise exception 'New amount is required.';
  end if;

  if v_row.transaction_type in ('income', 'expense') and p_new_amount <= 0 then
    raise exception 'Income and expense amounts must be greater than 0.';
  end if;

  if v_row.amount is not distinct from p_new_amount then
    return;
  end if;

  update public.business_transactions
  set amount = p_new_amount
  where id = p_transaction_id;

  insert into public.finance_edit_audit(
    table_name,
    record_id,
    field_name,
    old_value,
    new_value,
    reason,
    edited_by
  ) values (
    'business_transactions',
    p_transaction_id,
    'amount',
    v_row.amount,
    p_new_amount,
    v_reason,
    v_admin_id
  );
end;
$function$


-- record_client_debt_payment_v2
CREATE OR REPLACE FUNCTION public.record_client_debt_payment_v2(p_purchase_id uuid, p_amount numeric, p_payment_date date, p_account_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin_id uuid;
  v_purchase public.client_purchases%rowtype;
  v_account public.finance_accounts%rowtype;
  v_category public.finance_categories%rowtype;
  v_client_name text;
  v_remaining numeric(14,2);
  v_transaction_id uuid;
  v_accounting_month date;
begin
  v_admin_id := public.fxa_require_accountant();

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Payment amount must be a positive CAD amount with at most 2 decimals.';
  end if;
  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  select * into v_purchase
  from public.client_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'Client purchase not found.';
  end if;

  v_remaining := greatest(coalesce(v_purchase.balance_due, 0), 0);
  if v_remaining <= 0 then
    raise exception 'This purchase has no open balance.';
  end if;
  if p_amount > v_remaining then
    raise exception 'Payment exceeds the remaining client debt.';
  end if;

  select * into v_account
  from public.finance_accounts
  where id = p_account_id
  for update;

  if not found or not v_account.is_active then
    raise exception 'Receiving account is missing or inactive.';
  end if;

  select * into v_category
  from public.finance_categories
  where system_key = 'sales_service_revenue'
    and category_kind = 'income'
    and is_active = true
  order by is_system desc, sort_order asc
  limit 1;

  if not found then
    raise exception 'Sales revenue category is missing or inactive.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), client_code, 'Client')
    into v_client_name
  from public.clients
  where id = v_purchase.client_id;

  v_accounting_month := date_trunc(
    'month',
    coalesce(v_purchase.debt_month, v_purchase.created_at::date, p_payment_date)
  )::date;

  insert into public.business_transactions(
    transaction_type,
    source,
    title,
    amount,
    notes,
    client_id,
    purchase_id,
    created_by,
    transaction_date,
    accounting_month,
    report_group,
    counterparty,
    account_id,
    category_id
  ) values (
    'income',
    'debt_payment',
    'Thu công nợ - ' || coalesce(v_client_name, 'Client') || ' - ' || coalesce(v_purchase.plan_name, 'Package'),
    p_amount,
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_purchase.client_id,
    v_purchase.id,
    v_admin_id,
    p_payment_date,
    v_accounting_month,
    v_category.report_group,
    v_client_name,
    v_account.id,
    v_category.id
  ) returning id into v_transaction_id;

  update public.client_purchases
  set amount_paid = coalesce(amount_paid, 0) + p_amount,
      balance_due = greatest(coalesce(balance_due, 0) - p_amount, 0),
      status = case
        when greatest(coalesce(balance_due, 0) - p_amount, 0) = 0 then 'paid'
        else 'partial'
      end
  where id = v_purchase.id;

  return v_transaction_id;
end;
$function$


-- adjust_finance_account_balance
CREATE OR REPLACE FUNCTION public.adjust_finance_account_balance(p_account_id uuid, p_new_balance numeric, p_adjustment_date date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_account public.finance_accounts%rowtype;
  v_current numeric(14, 2);
  v_difference numeric(14, 2);
  v_transaction_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'accountant'
  ) then
    raise exception 'Only accountant can adjust account balances.';
  end if;

  if p_new_balance is null then
    raise exception 'New balance is required.';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Adjustment reason is required.';
  end if;

  select * into v_account from public.finance_accounts
  where id = p_account_id for update;

  if not found then
    raise exception 'Account not found.';
  end if;

  v_current := public.get_finance_account_balance(v_account.id);
  v_difference := p_new_balance - v_current;

  if v_difference = 0 then
    raise exception 'New balance is already equal to the current balance.';
  end if;

  insert into public.business_transactions (
    transaction_type, source, title, amount, notes, created_by,
    transaction_date, accounting_month, report_group, account_id
  )
  values (
    'cash_adjustment', 'balance_adjustment',
    'Điều chỉnh số dư - ' || v_account.name,
    v_difference,
    trim(p_reason), auth.uid(), coalesce(p_adjustment_date, current_date),
    date_trunc('month', coalesce(p_adjustment_date, current_date))::date,
    'cash_only', v_account.id
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$function$

-- Previously drafted full transaction editor is also Accountant-only.

-- Complete the separation: Accountant owns the generic transaction editor.
create or replace function public.admin_edit_finance_transaction_details(
 p_transaction_id uuid, p_changes jsonb, p_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare
 v_admin uuid;
 v_reason text:=btrim(coalesce(p_reason,''));
 v_old public.business_transactions%rowtype;
 v_new public.business_transactions%rowtype;
 v_purchase public.client_purchases%rowtype;
 v_account public.finance_accounts%rowtype;
 v_category public.finance_categories%rowtype;
 v_doc jsonb;
 v_before jsonb;
 v_after jsonb;
 v_type text;
 v_source text;
 v_title text;
 v_amount numeric;
 v_date date;
 v_month date;
 v_account_id uuid;
 v_category_id uuid;
 v_trainer_id uuid;
 v_delta numeric;
 v_field text;
 v_old_value jsonb;
 v_new_value jsonb;
 v_fields text[]:=array['transaction_type','source','title','amount','notes','transaction_date','accounting_month','counterparty','document_no','account_id','category_id','trainer_id','report_group'];
begin
 v_admin:=public.fxa_require_accountant();
 if length(v_reason)<5 then raise exception 'Lý do sửa phải có ít nhất 5 ký tự.'; end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'object' then raise exception 'Invalid finance changes.'; end if;
 if exists(select 1 from jsonb_object_keys(p_changes) k where k<>all(v_fields)) then
  raise exception 'A protected system field cannot be edited.';
 end if;
 select * into v_old from public.business_transactions where id=p_transaction_id for update;
 if not found then raise exception 'Transaction not found.'; end if;
 if v_old.transfer_id is not null then raise exception 'Edit this transaction through Transfers to preserve both ledger entries.'; end if;
 if v_old.payable_id is not null then raise exception 'Edit this transaction through Payables to preserve payable balances.'; end if;
 v_doc:=to_jsonb(v_old)||p_changes;
 v_type:=v_doc->>'transaction_type';
 v_source:=btrim(coalesce(v_doc->>'source',''));
 v_title:=btrim(coalesce(v_doc->>'title',''));
 v_amount:=nullif(v_doc->>'amount','')::numeric;
 v_date:=nullif(v_doc->>'transaction_date','')::date;
 v_month:=nullif(v_doc->>'accounting_month','')::date;
 v_account_id:=nullif(v_doc->>'account_id','')::uuid;
 v_category_id:=nullif(v_doc->>'category_id','')::uuid;
 v_trainer_id:=nullif(v_doc->>'trainer_id','')::uuid;
 if v_type not in ('income','expense','cash_adjustment') or v_amount is null or v_amount<>round(v_amount,2) or v_date is null or v_month is null then
  raise exception 'Invalid type, amount, payment date or accounting month.';
 end if;
 if date_trunc('month',v_month)::date <> v_month then raise exception 'Accounting month must be the first day of the month.'; end if;
 if v_type in ('income','expense') and v_amount<=0 then raise exception 'Income/expense must be greater than zero.'; end if;
 if v_title='' or v_source='' then raise exception 'Transaction description and origin are required.'; end if;
 select * into v_account from public.finance_accounts where id=v_account_id;
 if not found or not v_account.is_active then raise exception 'Select an active financial account.'; end if;
 if v_type<>'cash_adjustment' then
  select * into v_category from public.finance_categories where id=v_category_id;
  if not found or not v_category.is_active or v_category.category_kind<>v_type then
   raise exception 'Category must be active and match transaction type.';
  end if;
  if v_category.system_key='salary' and v_trainer_id is null then raise exception 'Salary transactions require a trainer.'; end if;
 end if;
 if v_old.purchase_id is not null then
  if v_type<>v_old.transaction_type or v_source<>v_old.source or v_type<>'income' then
   raise exception 'Client payment source and type cannot be changed. Edit the client purchase instead.';
  end if;
  if (v_source='debt_payment' and v_category.system_key<>'client_debt_collection')
    or (v_source='package_payment' and v_category.system_key<>'sales_service_revenue') then
   raise exception 'Client payments must retain the appropriate ledger category.';
  end if;
 elsif v_source in ('debt_payment','package_payment') and v_source<>v_old.source then
  raise exception 'Client-payment source is assigned only by Clients.';
 end if;
 if v_amount<>v_old.amount and v_old.purchase_id is not null then
  select * into v_purchase from public.client_purchases where id=v_old.purchase_id for update;
  if not found then raise exception 'Linked purchase is missing.'; end if;
  -- Payment amount corrections preserve the existing price-paid-debt difference,
  -- including legacy records. No historic amount is silently normalized.
  v_delta:=v_amount-v_old.amount;
  if coalesce(v_purchase.amount_paid,0)+v_delta<0 or coalesce(v_purchase.balance_due,0)-v_delta<0 then
   raise exception 'Payment correction would make paid/debt negative.';
  end if;
  update public.client_purchases set
   amount_paid=coalesce(amount_paid,0)+v_delta, balance_due=coalesce(balance_due,0)-v_delta,
   status=case when coalesce(balance_due,0)-v_delta=0 then 'paid'
               when coalesce(amount_paid,0)+v_delta>0 then 'partial' else 'confirmed' end
   where id=v_purchase.id;
  insert into public.finance_edit_audit(table_name,record_id,field_name,old_value,new_value,old_value_json,new_value_json,reason,edited_by)
   values('client_purchases',v_purchase.id,'amount_paid',v_purchase.amount_paid,v_purchase.amount_paid+v_delta,to_jsonb(v_purchase.amount_paid),to_jsonb(v_purchase.amount_paid+v_delta),v_reason,v_admin),
         ('client_purchases',v_purchase.id,'balance_due',v_purchase.balance_due,v_purchase.balance_due-v_delta,to_jsonb(v_purchase.balance_due),to_jsonb(v_purchase.balance_due-v_delta),v_reason,v_admin);
 end if;
 v_before:=to_jsonb(v_old);
 update public.business_transactions set
  transaction_type=v_type,source=v_source,title=v_title,amount=v_amount,
  notes=nullif(btrim(coalesce(v_doc->>'notes','')),''),
  transaction_date=v_date,accounting_month=v_month,
  report_group=case when v_type='cash_adjustment' then 'cash_only' else v_category.report_group end,
  counterparty=nullif(btrim(coalesce(v_doc->>'counterparty','')),''),
  document_no=nullif(btrim(coalesce(v_doc->>'document_no','')),''),
  account_id=v_account_id,
  category_id=case when v_type='cash_adjustment' then null else v_category_id end,
  trainer_id=v_trainer_id
 where id=p_transaction_id returning * into v_new;
 v_after:=to_jsonb(v_new);
 foreach v_field in array v_fields loop
  v_old_value:=v_before->v_field; v_new_value:=v_after->v_field;
  if v_old_value is distinct from v_new_value then
   insert into public.finance_edit_audit(table_name,record_id,field_name,old_value,new_value,old_value_json,new_value_json,reason,edited_by)
   values('business_transactions',p_transaction_id,v_field,
    case when jsonb_typeof(v_old_value)='number' then (v_old_value#>>'{}')::numeric else null end,
    case when jsonb_typeof(v_new_value)='number' then (v_new_value#>>'{}')::numeric else null end,
    v_old_value,v_new_value,v_reason,v_admin);
  end if;
 end loop;
 if v_old.account_id is not null and v_old.account_id<>v_account_id and
  exists(select 1 from public.finance_accounts a where a.id=v_old.account_id and not a.allow_negative) and
  public.get_finance_account_balance(v_old.account_id)<0 then
  raise exception 'Edit would overdraw the original account.';
 end if;
 if not v_account.allow_negative and public.get_finance_account_balance(v_account_id)<0 then
  raise exception 'Edit would overdraw the receiving/payment account.';
 end if;
end $$;

-- Original Admin receipt RPC endpoints remain callable by old clients unless explicitly retired.
create or replace function public.fxa_record_debt_payment(
 p_request_id uuid,p_purchase_id uuid,p_amount numeric,p_date date)
 returns jsonb language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Payment entry moved to Accountant / Revenue / Client Receivables.';
end $$;
create or replace function public.fxa_record_debt_payment_v3(
 p_request_id uuid,p_purchase_id uuid,p_amount numeric,p_date date,p_account_id uuid,p_notes text default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Payment entry moved to Accountant / Revenue / Client Receivables.';
end $$;
create or replace function public.fxa_set_debt(
 p_request_id uuid,p_client_id uuid,p_purchase_id uuid,p_new_balance numeric,p_deadline date,
 p_record_income boolean,p_income_date date,p_expected_balance numeric)
 returns jsonb language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Debt amount corrections moved to Accountant / Revenue / Client Receivables.';
end $$;
create policy "accountant read transfers" on public.finance_transfers for select to authenticated
 using (public.current_user_role()='accountant');
create policy "accountant read legacy debts" on public.client_debts for select to authenticated
 using (public.current_user_role()='accountant');
-- Important: legacy P&L is cash-based; cash collection is not automatic accrual revenue.

-- Account balance functions must permit the Accountant role; otherwise payables
-- and the inline financial editor cannot read balances.
create or replace function public.fxa_finance_balances()
returns table(id uuid,balance numeric) language plpgsql security definer set search_path='' as $$
begin
 perform fxa_private.require_role(array['admin','manager','accountant']);
 return query select a.id, coalesce(a.opening_balance,0)+coalesce(sum(
 case when t.transaction_type='income' then abs(t.amount)
 when t.transaction_type='expense' then -abs(t.amount) else t.amount end),0)
 from public.finance_accounts a left join public.business_transactions t on t.account_id=a.id
 group by a.id;
end $$;
create or replace function public.get_finance_account_balance(p_account_id uuid)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_balance numeric;
begin
 perform fxa_private.require_role(array['admin','manager','accountant']);
 select coalesce(a.opening_balance,0)+coalesce(sum(case when t.transaction_type='income' then abs(t.amount)
 when t.transaction_type='expense' then -abs(t.amount) else t.amount end),0)
 into v_balance from public.finance_accounts a
 left join public.business_transactions t on t.account_id=a.id
 where a.id=p_account_id group by a.opening_balance;
 return coalesce(v_balance,0);
end $$;

-- Protect closing periods from changes after a sign-off. Audit changes require reopening through a future review flow.
-- Do not back-date historical receivables into a current-time snapshot.

-- Prevent Admin manually overwriting aggregate package monetary totals.
create or replace function public.fxa_guard_session_package_value()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 select role into v_role from public.profiles where id=auth.uid();
 if v_role in ('admin','manager','trainer','nutrition_coach','client') then
  if tg_op='INSERT' and coalesce(new.package_value,0)<>0 then
   raise exception 'Only Accountant sets the package contract value.';
  elsif tg_op='UPDATE' and new.package_value is distinct from old.package_value then
   raise exception 'Only Accountant sets the package contract value.';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists fxa_guard_session_package_value on public.session_packages;
create trigger fxa_guard_session_package_value before insert or update on public.session_packages
for each row execute function public.fxa_guard_session_package_value();

-- Accountant can create a standalone manual debt record with a reason and audit.
create or replace function public.fxa_accountant_add_manual_debt(
 p_client_id uuid,p_amount numeric,p_deadline date,p_note text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.fxa_require_accountant(); v_id uuid;
begin
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Reason must have at least 5 characters';end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Invalid debt amount';end if;
 if p_deadline is null then raise exception 'Debt deadline is required';end if;
 if not exists(select 1 from public.clients where id=p_client_id) then raise exception 'Client not found';end if;
 insert into public.client_purchases(client_id,plan_name,session_count,price,amount_paid,balance_due,debt_deadline,purchase_type,status)
 values(p_client_id,'Debt - '||coalesce(nullif(btrim(p_note),''),'Manual Debt'),0,p_amount,0,p_amount,p_deadline,'debt','confirmed')
 returning id into v_id;
 insert into public.finance_edit_audit(table_name,record_id,field_name,old_value,new_value,old_value_json,new_value_json,reason,edited_by)
 values('client_purchases',v_id,'manual_debt_created',null,p_amount,null,to_jsonb(p_amount),p_reason,v_actor);
 return v_id;
end $$;
revoke all on function public.fxa_accountant_add_manual_debt(uuid,numeric,date,text,text) from public;
grant execute on function public.fxa_accountant_add_manual_debt(uuid,numeric,date,text,text) to authenticated;
