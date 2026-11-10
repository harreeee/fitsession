-- Accounting P0 hardening: payable editing + client debt collection into finance accounts.
-- Admin-only SECURITY DEFINER RPCs keep multi-table finance writes atomic.

create or replace function public.update_business_payable_v2(
  p_payable_id uuid,
  p_category_id uuid,
  p_trainer_id uuid,
  p_counterparty text,
  p_title text,
  p_total_amount numeric,
  p_accounting_month date,
  p_due_date date,
  p_notes text,
  p_edit_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  v_admin_id := public.fxa_require_admin();

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
$$;

revoke all on function public.update_business_payable_v2(uuid, uuid, uuid, text, text, numeric, date, date, text, text) from public;
revoke all on function public.update_business_payable_v2(uuid, uuid, uuid, text, text, numeric, date, date, text, text) from anon;
grant execute on function public.update_business_payable_v2(uuid, uuid, uuid, text, text, numeric, date, date, text, text) to authenticated;

create or replace function public.record_client_debt_payment_v2(
  p_purchase_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_account_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  v_admin_id := public.fxa_require_admin();

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
$$;

revoke all on function public.record_client_debt_payment_v2(uuid, numeric, date, uuid, text) from public;
revoke all on function public.record_client_debt_payment_v2(uuid, numeric, date, uuid, text) from anon;
grant execute on function public.record_client_debt_payment_v2(uuid, numeric, date, uuid, text) to authenticated;
