-- Admin-only numeric correction tools for the Revenue workspace.
--
-- Design goals:
-- 1. Only profiles.role = 'admin' can execute corrections.
-- 2. Every numeric correction requires a reason and is written to an audit log.
-- 3. Derived dashboard numbers are never edited directly; they recalculate from
--    the corrected source records.
-- 4. Transfer corrections update their linked ledger rows together.
-- 5. Current account balance corrections are recorded as cash adjustments
--    instead of rewriting historical transactions.

create table if not exists public.finance_edit_audit (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  field_name text not null,
  old_value numeric,
  new_value numeric,
  reason text not null,
  edited_by uuid not null references public.profiles(id),
  edited_at timestamptz not null default now()
);

create index if not exists finance_edit_audit_record_idx
  on public.finance_edit_audit(table_name, record_id, edited_at desc);

create index if not exists finance_edit_audit_edited_at_idx
  on public.finance_edit_audit(edited_at desc);

alter table public.finance_edit_audit enable row level security;

drop policy if exists "admin can view finance edit audit"
  on public.finance_edit_audit;

create policy "admin can view finance edit audit"
  on public.finance_edit_audit
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

create or replace function public.fxa_require_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'admin'
  ) then
    raise exception 'Admin access required.';
  end if;

  return v_user_id;
end;
$$;

revoke all on function public.fxa_require_admin() from public;
grant execute on function public.fxa_require_admin() to authenticated;

create or replace function public.admin_edit_finance_transaction_amount(
  p_transaction_id uuid,
  p_new_amount numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.admin_edit_finance_transfer_amount(
  p_transfer_id uuid,
  p_new_amount numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_row public.finance_transfers%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_admin_id := public.fxa_require_admin();

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
$$;

create or replace function public.admin_edit_finance_account_opening_balance(
  p_account_id uuid,
  p_new_opening_balance numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_row public.finance_accounts%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_admin_id := public.fxa_require_admin();

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
$$;

create or replace function public.admin_set_finance_account_current_balance(
  p_account_id uuid,
  p_new_balance numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_account public.finance_accounts%rowtype;
  v_current_balance numeric := 0;
  v_delta numeric := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_admin_id := public.fxa_require_admin();

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
$$;

create or replace function public.admin_edit_business_payable_numbers(
  p_payable_id uuid,
  p_new_total_amount numeric,
  p_new_paid_amount numeric,
  p_adjustment_account_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_row public.business_payables%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_paid_delta numeric := 0;
  v_account_id uuid;
  v_new_status text;
begin
  v_admin_id := public.fxa_require_admin();

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
$$;

create or replace function public.admin_edit_client_purchase_numbers(
  p_purchase_id uuid,
  p_new_price numeric,
  p_new_amount_paid numeric,
  p_new_balance_due numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_row public.client_purchases%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_admin_id := public.fxa_require_admin();

  if v_reason = '' then
    raise exception 'Edit reason is required.';
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
$$;

revoke all on function public.admin_edit_finance_transaction_amount(uuid, numeric, text) from public;
revoke all on function public.admin_edit_finance_transfer_amount(uuid, numeric, text) from public;
revoke all on function public.admin_edit_finance_account_opening_balance(uuid, numeric, text) from public;
revoke all on function public.admin_set_finance_account_current_balance(uuid, numeric, text) from public;
revoke all on function public.admin_edit_business_payable_numbers(uuid, numeric, numeric, uuid, text) from public;
revoke all on function public.admin_edit_client_purchase_numbers(uuid, numeric, numeric, numeric, text) from public;

grant execute on function public.admin_edit_finance_transaction_amount(uuid, numeric, text) to authenticated;
grant execute on function public.admin_edit_finance_transfer_amount(uuid, numeric, text) to authenticated;
grant execute on function public.admin_edit_finance_account_opening_balance(uuid, numeric, text) to authenticated;
grant execute on function public.admin_set_finance_account_current_balance(uuid, numeric, text) to authenticated;
grant execute on function public.admin_edit_business_payable_numbers(uuid, numeric, numeric, uuid, text) to authenticated;
grant execute on function public.admin_edit_client_purchase_numbers(uuid, numeric, numeric, numeric, text) to authenticated;
