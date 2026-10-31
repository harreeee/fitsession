-- FXA Fitness finance reliability / audit update.
-- SAFETY: run on a staging clone first. Never rewrite historical amounts without receipt reconciliation.
-- The SQL RPCs enforce admin role server-side; finance updates are atomic within each function.
insert into public.finance_categories
  (name,category_kind,system_key,report_group,is_system,is_active,sort_order)
select 'Thu công nợ','income','client_debt_collection','sales_revenue',true,true,110
where not exists(select 1 from public.finance_categories where system_key='client_debt_collection');

alter table public.finance_edit_audit
  add column if not exists old_value_json jsonb,
  add column if not exists new_value_json jsonb;

-- Keep original numeric audit columns intact; JSONB captures dates, labels, bank accounts, and notes.
update public.finance_edit_audit
set old_value_json=to_jsonb(old_value), new_value_json=to_jsonb(new_value)
where old_value_json is null and new_value_json is null and (old_value is not null or new_value is not null);

create or replace function public.fxa_record_debt_payment_v3(
 p_request_id uuid, p_purchase_id uuid, p_amount numeric, p_date date, p_account_id uuid, p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_admin uuid:=fxa_private.require_role(array['admin']);
 v_purchase public.client_purchases%rowtype;
 v_client_name text;
 v_account public.finance_accounts%rowtype;
 v_category public.finance_categories%rowtype;
 v_transaction_id uuid;
 v_payload jsonb:=jsonb_build_object('purchase_id',p_purchase_id,'amount',p_amount,'date',p_date,'account_id',p_account_id,'notes',p_notes);
 v_old jsonb;
 v_balance numeric;
begin
 if p_request_id is null then raise exception 'Idempotency request ID is required.'; end if;
 v_old:=fxa_private.replay(p_request_id,'debt_payment_v3',v_payload);
 if v_old is not null then return v_old; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_date is null or not isfinite(p_date) then
  raise exception 'Enter a positive payment with two decimals and a valid date.';
 end if;
 select * into v_purchase from public.client_purchases where id=p_purchase_id for update;
 if not found then raise exception 'Client debt record not found.'; end if;
 v_balance:=coalesce(v_purchase.balance_due,0);
 if p_amount>v_balance or v_balance<=0 then raise exception 'Payment exceeds the outstanding debt.'; end if;
 select * into v_account from public.finance_accounts where id=p_account_id and is_active=true and name<>'Số dư chưa phân bổ' for update;
 if not found then raise exception 'Select an active real receiving account (CIBC, TD, Cash...).'; end if;
 select * into v_category from public.finance_categories where system_key='client_debt_collection' and category_kind='income' and is_active=true limit 1;
 if not found then raise exception 'Missing Thu công nợ category. Apply the finance migration.'; end if;
 select full_name into v_client_name from public.clients where id=v_purchase.client_id;
 if v_client_name is null then raise exception 'Linked client not found.'; end if;
 -- Legacy imports may contain a pre-existing price/paid/debt discrepancy.
 -- An actual receipt reduces debt and increases paid by the same amount; it must not
 -- silently block the user or change the pre-existing discrepancy.
 -- The admin should separately reconcile the historical record with an audit reason.
 insert into public.business_transactions(transaction_type,source,title,amount,notes,client_id,purchase_id,created_by,transaction_date,accounting_month,report_group,counterparty,account_id,category_id)
 values('income','debt_payment','Thu công nợ - '||v_client_name||' - '||v_purchase.plan_name,p_amount,
   nullif(btrim(coalesce(p_notes,'')),''),v_purchase.client_id,v_purchase.id,v_admin,
   p_date,date_trunc('month',p_date)::date,v_category.report_group,v_client_name,v_account.id,v_category.id)
 returning id into v_transaction_id;
 update public.client_purchases set
 amount_paid=coalesce(amount_paid,0)+p_amount, balance_due=balance_due-p_amount,
 status=case when balance_due-p_amount=0 then 'paid' else 'partial' end
 where id=v_purchase.id;
 return fxa_private.remember(p_request_id,'debt_payment_v3',v_payload,
  jsonb_build_object('transaction_id',v_transaction_id,'purchase_id',v_purchase.id,'amount_received',p_amount,'balance_due',v_balance-p_amount));
end $$;
revoke all on function public.fxa_record_debt_payment_v3(uuid,uuid,numeric,date,uuid,text) from public;
grant execute on function public.fxa_record_debt_payment_v3(uuid,uuid,numeric,date,uuid,text) to authenticated;

-- Existing package workflows: keep their source-record logic, add payment account and descriptive journal records.
CREATE OR REPLACE FUNCTION public.fxa_create_client(p_request_id uuid, p_client jsonb, p_package jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=fxa_private.require_role(array['admin','manager']); p jsonb:=jsonb_build_object('client',p_client,'package',p_package); old jsonb; c uuid; cp uuid; n int:=coalesce((p_package->>'sessions')::int,0); price numeric:=coalesce((p_package->>'value')::numeric,0); paid numeric:=coalesce((p_package->>'paid')::numeric,0); state text; v_account_id uuid; v_category_id uuid; v_plan_name text;
begin
 old:=fxa_private.replay(p_request_id,'create_client',p); if old is not null then return (old->>'id')::uuid; end if;
 if btrim(coalesce(p_client->>'full_name',''))='' or n<0 or n>10000 then raise exception 'Valid client name and sessions required.'; end if;
 state:=fxa_private.payment_state(price,paid);
 v_plan_name:=coalesce(nullif(btrim(p_package->>'name'),''),'New Package');
 if paid>0 then
  v_account_id:=nullif(p_package->>'account_id','')::uuid;
  if v_account_id is null or not exists(select 1 from public.finance_accounts where id=v_account_id and is_active=true and name<>'Số dư chưa phân bổ') then
   raise exception 'Choose a valid receiving account (CIBC, TD, cash...) before recording a payment.';
  end if;
  select id into v_category_id from public.finance_categories
   where system_key='sales_service_revenue' and category_kind='income' and is_active=true limit 1;
  if v_category_id is null then raise exception 'Service revenue category is missing.'; end if;
 end if;
 if n=0 and (price<>0 or paid<>0) then raise exception 'A package requires at least one session.'; end if;
 if nullif(p_package->>'expires_at','')::date < nullif(p_package->>'starts_at','')::date then raise exception 'Expiry precedes start date.'; end if;
 insert into public.clients(client_code,full_name,email,phone,gender,date_of_birth,client_source,client_source_other,qr_token,status)
 values(nullif(btrim(p_client->>'client_code'),''),btrim(p_client->>'full_name'),nullif(lower(btrim(p_client->>'email')),''),nullif(btrim(p_client->>'phone'),''),nullif(p_client->>'gender',''),nullif(p_client->>'date_of_birth','')::date,nullif(p_client->>'client_source',''),nullif(p_client->>'client_source_other',''),gen_random_uuid()::text,'active') returning id into c;
 if n>0 then
  insert into public.session_packages(client_id,package_name,total_sessions,used_sessions,remaining_sessions,package_value,starts_at,expires_at,status)
  values(c,coalesce(nullif(p_package->>'name',''),'New Package'),n,0,n,price,(nullif(p_package->>'starts_at','')::date)::timestamp at time zone 'America/Toronto',nullif(p_package->>'expires_at','')::date,'active');
  insert into public.client_purchases(client_id,plan_name,session_count,price,amount_paid,balance_due,debt_deadline,purchase_type,status,confirmed_by,confirmed_at)
  values(c,coalesce(nullif(p_package->>'name',''),'New Package'),n,price,paid,price-paid,case when price>paid then nullif(p_package->>'expires_at','')::date end,coalesce(nullif(p_package->>'purchase_type',''),'new'),state,u,now()) returning id into cp;
  if paid>0 then
   insert into public.business_transactions(transaction_type,source,title,amount,client_id,purchase_id,created_by,transaction_date,accounting_month,report_group,counterparty,account_id,category_id)
   values('income','package_payment','Thu tiền gói mới - '||btrim(p_client->>'full_name')||' - '||v_plan_name,paid,c,cp,u,(now() at time zone 'America/Toronto')::date,date_trunc('month',now() at time zone 'America/Toronto')::date,'sales_revenue',btrim(p_client->>'full_name'),v_account_id,v_category_id);
  end if;
 end if;
 perform fxa_private.remember(p_request_id,'create_client',p,jsonb_build_object('id',c)); return c;
end $function$

CREATE OR REPLACE FUNCTION public.fxa_renew_package(p_request_id uuid, p_client_id uuid, p_package jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=fxa_private.require_role(array['admin']); p jsonb:=jsonb_build_object('client',p_client_id,'package',p_package); old jsonb; sp public.session_packages%rowtype; cp uuid; n int:=(p_package->>'sessions')::int; price numeric:=(p_package->>'value')::numeric; paid numeric:=(p_package->>'paid')::numeric; state text; v_account_id uuid; v_category_id uuid; v_client_name text; v_plan_name text;
begin
 old:=fxa_private.replay(p_request_id,'renew',p); if old is not null then return (old->>'id')::uuid; end if;
 if n is null or n<=0 or n>10000 then raise exception 'Valid session count required.'; end if;
 state:=fxa_private.payment_state(price,paid);
 v_plan_name:=coalesce(nullif(btrim(p_package->>'name'),''),'Renew Package');
 select full_name into v_client_name from public.clients where id=p_client_id;
 if v_client_name is null then raise exception 'Client not found.'; end if;
 if paid>0 then
  v_account_id:=nullif(p_package->>'account_id','')::uuid;
  if v_account_id is null or not exists(select 1 from public.finance_accounts where id=v_account_id and is_active=true and name<>'Số dư chưa phân bổ') then
   raise exception 'Choose a valid receiving account before recording a renewal payment.';
  end if;
  select id into v_category_id from public.finance_categories where system_key='sales_service_revenue' and category_kind='income' and is_active=true limit 1;
  if v_category_id is null then raise exception 'Service revenue category is missing.'; end if;
 end if;
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
 if paid>0 then
 insert into public.business_transactions(transaction_type,source,title,amount,client_id,purchase_id,created_by,transaction_date,accounting_month,report_group,counterparty,account_id,category_id)
 values('income','package_payment','Thu gia hạn gói - '||v_client_name||' - '||v_plan_name,paid,p_client_id,cp,u,(now() at time zone 'America/Toronto')::date,date_trunc('month',now() at time zone 'America/Toronto')::date,'sales_revenue',v_client_name,v_account_id,v_category_id);
 end if;
 perform fxa_private.remember(p_request_id,'renew',p,jsonb_build_object('id',cp)); return cp;
end $function$

CREATE OR REPLACE FUNCTION public.fxa_set_debt(p_request_id uuid, p_client_id uuid, p_purchase_id uuid, p_new_balance numeric, p_deadline date, p_record_income boolean, p_income_date date, p_expected_balance numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=fxa_private.require_role(array['admin']);cp public.client_purchases%rowtype;delta numeric:=0;old jsonb;p jsonb:=jsonb_build_object('client',p_client_id,'purchase',p_purchase_id,'balance',p_new_balance,'deadline',p_deadline,'income',p_record_income,'date',p_income_date,'expected',p_expected_balance);id uuid;
begin
 if coalesce(p_record_income,false) then
  raise exception 'Chỉnh sửa công nợ không phải thu tiền. Dùng Add Payment để ghi nhận thực thu và chọn nguồn tiền.';
 end if;
 old:=fxa_private.replay(p_request_id,'debt_fix',p);if old is not null then return old;end if;
 if p_new_balance is null or p_new_balance<0 or p_new_balance::text in ('NaN','Infinity','-Infinity') or p_new_balance<>round(p_new_balance,2) or (p_new_balance>0 and p_deadline is null) then raise exception 'Invalid debt balance or deadline.';end if;
 if p_purchase_id is null then
 insert into public.client_purchases(client_id,plan_name,session_count,price,amount_paid,balance_due,debt_deadline,purchase_type,status)
 values(p_client_id,'Debt - Manual Debt',0,p_new_balance,0,p_new_balance,p_deadline,'debt',case when p_new_balance=0 then 'paid' else 'confirmed' end) returning public.client_purchases.id into id;
 else
 select * into cp from public.client_purchases where public.client_purchases.id=p_purchase_id and client_id=p_client_id for update;
 if cp.id is null then raise exception 'Purchase not found.';end if;
 if coalesce(cp.balance_due,0) is distinct from p_expected_balance then raise exception 'Debt changed. Refresh before editing.';end if;
 if p_record_income then delta:=greatest(coalesce(cp.balance_due,0)-p_new_balance,0);end if;
 if delta>0 and p_income_date is null then raise exception 'Income date required.';end if;
 update public.client_purchases set price=coalesce(amount_paid,0)+p_new_balance,amount_paid=coalesce(amount_paid,0)+delta,balance_due=p_new_balance,debt_deadline=case when p_new_balance>0 then p_deadline end,status=case when p_new_balance=0 then 'paid' when coalesce(amount_paid,0)+delta>0 then 'partial' else 'confirmed' end where public.client_purchases.id=cp.id;
 id:=cp.id;
 if delta>0 then insert into public.business_transactions(transaction_type,source,title,amount,client_id,purchase_id,created_by,transaction_date,accounting_month,report_group)
 values('income','debt_payment','Debt correction payment',delta,p_client_id,id,u,p_income_date,date_trunc('month',p_income_date)::date,'sales_revenue');end if;
 end if;
 return fxa_private.remember(p_request_id,'debt_fix',p,jsonb_build_object('id',id,'old_balance',cp.balance_due,'balance_due',p_new_balance,'income_added',delta));
end $function$

CREATE OR REPLACE FUNCTION public.admin_edit_client_purchase_numbers(p_purchase_id uuid, p_new_price numeric, p_new_amount_paid numeric, p_new_balance_due numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_id uuid;
  v_row public.client_purchases%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_admin_id := public.fxa_require_admin();

  if v_reason = '' then
    raise exception 'Edit reason is required.';
  end if;

  if p_new_price is distinct from round(p_new_price,2) or p_new_amount_paid is distinct from round(p_new_amount_paid,2) or p_new_balance_due is distinct from round(p_new_balance_due,2) then
    raise exception 'Only amounts with up to two decimal places are accepted.';
  end if;
  if p_new_price is not null and p_new_amount_paid is not null and p_new_balance_due is not null
     and p_new_price <> p_new_amount_paid + p_new_balance_due then
    raise exception 'Package price must equal amount paid + balance due.';
  end if;
  if p_new_price is null or p_new_price < 0 then
    raise exception 'Price must be 0 or greater.';
  end if;

  if p_new_amount_paid is null or p_new_amount_paid < 0 then
    raise exception 'Amount paid must be 0 or greater.';
  end if;

  if p_new_balance_due is null or p_new_balance_due < 0 then
    raise exception 'Balance due must be 0 or greater.';
  end if;

  select *
  into v_row
  from public.client_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'Client purchase not found.';
  end if;

  update public.client_purchases
  set price = p_new_price,
      amount_paid = p_new_amount_paid,
      balance_due = p_new_balance_due
  where id = p_purchase_id;

  if v_row.price is distinct from p_new_price then
    insert into public.finance_edit_audit(
      table_name, record_id, field_name, old_value, new_value, reason, edited_by
    ) values (
      'client_purchases', p_purchase_id, 'price',
      v_row.price, p_new_price, v_reason, v_admin_id
    );
  end if;

  if v_row.amount_paid is distinct from p_new_amount_paid then
    insert into public.finance_edit_audit(
      table_name, record_id, field_name, old_value, new_value, reason, edited_by
    ) values (
      'client_purchases', p_purchase_id, 'amount_paid',
      v_row.amount_paid, p_new_amount_paid, v_reason, v_admin_id
    );
  end if;

  if v_row.balance_due is distinct from p_new_balance_due then
    insert into public.finance_edit_audit(
      table_name, record_id, field_name, old_value, new_value, reason, edited_by
    ) values (
      'client_purchases', p_purchase_id, 'balance_due',
      v_row.balance_due, p_new_balance_due, v_reason, v_admin_id
    );
  end if;
end;
$function$

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
  v_admin_id := public.fxa_require_admin();

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

  if v_row.purchase_id is not null then
    raise exception 'Client-linked payments must use the full transaction editor so the client balance is updated atomically.';
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

-- Full transaction edit: editable commercial fields, while system-generated relationship IDs remain immutable.
-- Every changed value is stored in finance_edit_audit with the authenticated editor.
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
 v_admin:=public.fxa_require_admin();
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
revoke all on function public.admin_edit_finance_transaction_details(uuid,jsonb,text) from public;
grant execute on function public.admin_edit_finance_transaction_details(uuid,jsonb,text) to authenticated;

-- Revoke direct deletion of client-linked receipts from authenticated users.
-- A linked receipt must be corrected through the audited editor, not silently removed.
create or replace function public.fxa_guard_client_receipt_delete()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.purchase_id is not null then
  raise exception 'Cannot delete a client-linked receipt directly. Use audited Revenue editing.';
 end if;
 return old;
end $$;
drop trigger if exists fxa_guard_client_receipt_delete on public.business_transactions;
create trigger fxa_guard_client_receipt_delete
before delete on public.business_transactions for each row
execute function public.fxa_guard_client_receipt_delete();
