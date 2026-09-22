create or replace function public.link_transaction_to_project_expense(
  p_transaction_id uuid,
  p_project_id uuid,
  p_expense_type text default 'other'
)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_tx_workspace_id uuid;
  v_project_workspace_id uuid;
  v_account_id uuid;
  v_amount_minor bigint;
  v_transaction_type text;
  v_counterparty text;
  v_note text;
  v_occurred_at timestamptz;
  v_expense_id uuid;
begin
  if p_expense_type not in ('materials','labor','contractor','logistics','packaging','fees','taxes','other') then
    raise exception 'Unsupported project expense type';
  end if;

  select workspace_id, account_id, abs(amount_minor), transaction_type, counterparty, note, occurred_at
    into v_tx_workspace_id, v_account_id, v_amount_minor, v_transaction_type, v_counterparty, v_note, v_occurred_at
  from public.transactions
  where id = p_transaction_id;

  if v_tx_workspace_id is null then
    raise exception 'Transaction not found';
  end if;

  if v_transaction_type <> 'expense' then
    raise exception 'Only expense transactions can be assigned to project costs';
  end if;

  select workspace_id into v_project_workspace_id
  from public.projects
  where id = p_project_id;

  if v_project_workspace_id is null then
    raise exception 'Project not found';
  end if;

  if v_project_workspace_id <> v_tx_workspace_id then
    raise exception 'Transaction and project must belong to the same workspace';
  end if;

  if not private.is_workspace_member(v_tx_workspace_id) then
    raise exception 'Not authorized for workspace';
  end if;

  update public.transactions
  set project_id = p_project_id,
      context = 'business',
      updated_at = now()
  where id = p_transaction_id;

  insert into public.project_expenses (
    project_id,
    account_id,
    transaction_id,
    expense_type,
    amount_minor,
    counterparty,
    note,
    occurred_at,
    created_by
  ) values (
    p_project_id,
    v_account_id,
    p_transaction_id,
    p_expense_type,
    v_amount_minor,
    v_counterparty,
    v_note,
    v_occurred_at,
    auth.uid()
  )
  on conflict (transaction_id) do update
  set project_id = excluded.project_id,
      account_id = excluded.account_id,
      expense_type = excluded.expense_type,
      amount_minor = excluded.amount_minor,
      counterparty = excluded.counterparty,
      note = excluded.note,
      occurred_at = excluded.occurred_at,
      updated_at = now()
  returning id into v_expense_id;

  return v_expense_id;
end;
$$;

comment on function public.link_transaction_to_project_expense(uuid,uuid,text) is
  'Assigns an existing expense transaction, including a future bank-imported purchase, to a project cost without creating a duplicate transaction.';
