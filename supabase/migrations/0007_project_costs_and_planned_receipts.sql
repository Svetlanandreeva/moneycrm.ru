-- Project costs + planned incoming payments

create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  transaction_id uuid unique references public.transactions(id) on delete set null,
  expense_type text not null default 'other' check (expense_type in ('materials','labor','contractor','logistics','packaging','fees','taxes','other')),
  amount_minor bigint not null check (amount_minor > 0),
  counterparty text,
  note text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_expected_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  payment_type text not null default 'final' check (payment_type in ('prepayment','final','full','other')),
  label text,
  amount_minor bigint not null check (amount_minor > 0),
  received_minor bigint not null default 0 check (received_minor >= 0),
  due_at timestamptz,
  status text not null default 'planned' check (status in ('planned','partial','received','cancelled')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (received_minor <= amount_minor)
);

create index if not exists project_expenses_project_idx on public.project_expenses(project_id, occurred_at desc);
create index if not exists project_expected_payments_project_idx on public.project_expected_payments(project_id, due_at);
create index if not exists project_expected_payments_status_due_idx on public.project_expected_payments(status, due_at) where status in ('planned','partial');

alter table public.project_expenses enable row level security;
alter table public.project_expected_payments enable row level security;

drop policy if exists "project_expenses_select_member" on public.project_expenses;
create policy "project_expenses_select_member" on public.project_expenses
for select using (
  exists (select 1 from public.projects p where p.id = project_expenses.project_id and private.is_workspace_member(p.workspace_id))
);

drop policy if exists "project_expenses_insert_member" on public.project_expenses;
create policy "project_expenses_insert_member" on public.project_expenses
for insert with check (
  created_by = auth.uid() and
  exists (select 1 from public.projects p where p.id = project_expenses.project_id and private.is_workspace_member(p.workspace_id))
);

drop policy if exists "project_expenses_update_member" on public.project_expenses;
create policy "project_expenses_update_member" on public.project_expenses
for update using (
  exists (select 1 from public.projects p where p.id = project_expenses.project_id and private.is_workspace_member(p.workspace_id))
) with check (
  exists (select 1 from public.projects p where p.id = project_expenses.project_id and private.is_workspace_member(p.workspace_id))
);

drop policy if exists "project_expenses_delete_admin" on public.project_expenses;
create policy "project_expenses_delete_admin" on public.project_expenses
for delete using (
  exists (select 1 from public.projects p where p.id = project_expenses.project_id and private.is_workspace_admin(p.workspace_id))
);

drop policy if exists "project_expected_payments_select_member" on public.project_expected_payments;
create policy "project_expected_payments_select_member" on public.project_expected_payments
for select using (
  exists (select 1 from public.projects p where p.id = project_expected_payments.project_id and private.is_workspace_member(p.workspace_id))
);

drop policy if exists "project_expected_payments_insert_member" on public.project_expected_payments;
create policy "project_expected_payments_insert_member" on public.project_expected_payments
for insert with check (
  created_by = auth.uid() and
  exists (select 1 from public.projects p where p.id = project_expected_payments.project_id and private.is_workspace_member(p.workspace_id))
);

drop policy if exists "project_expected_payments_update_member" on public.project_expected_payments;
create policy "project_expected_payments_update_member" on public.project_expected_payments
for update using (
  exists (select 1 from public.projects p where p.id = project_expected_payments.project_id and private.is_workspace_member(p.workspace_id))
) with check (
  exists (select 1 from public.projects p where p.id = project_expected_payments.project_id and private.is_workspace_member(p.workspace_id))
);

drop policy if exists "project_expected_payments_delete_admin" on public.project_expected_payments;
create policy "project_expected_payments_delete_admin" on public.project_expected_payments
for delete using (
  exists (select 1 from public.projects p where p.id = project_expected_payments.project_id and private.is_workspace_admin(p.workspace_id))
);

create or replace function public.record_project_expense(
  p_project_id uuid,
  p_account_id uuid,
  p_amount_minor bigint,
  p_expense_type text default 'other',
  p_occurred_at timestamptz default now(),
  p_counterparty text default null,
  p_note text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_account_workspace_id uuid;
  v_currency text;
  v_transaction_id uuid;
  v_expense_id uuid;
begin
  if p_amount_minor <= 0 then raise exception 'Expense amount must be positive'; end if;
  if p_expense_type not in ('materials','labor','contractor','logistics','packaging','fees','taxes','other') then
    raise exception 'Invalid expense type';
  end if;

  select workspace_id, currency into v_workspace_id, v_currency from public.projects where id = p_project_id;
  select workspace_id into v_account_workspace_id from public.accounts where id = p_account_id and is_archived = false;

  if v_workspace_id is null or v_account_workspace_id is null or v_workspace_id <> v_account_workspace_id then
    raise exception 'Project and account must belong to the same workspace';
  end if;

  insert into public.transactions (
    workspace_id, account_id, amount_minor, currency, transaction_type,
    context, project_id, counterparty, note, occurred_at, source, status, created_by
  ) values (
    v_workspace_id, p_account_id, -p_amount_minor, v_currency, 'expense',
    'business', p_project_id, p_counterparty, coalesce(p_note, 'Расход по проекту'), p_occurred_at, 'manual', 'posted', auth.uid()
  ) returning id into v_transaction_id;

  insert into public.project_expenses (
    project_id, account_id, transaction_id, expense_type, amount_minor,
    counterparty, note, occurred_at, created_by
  ) values (
    p_project_id, p_account_id, v_transaction_id, p_expense_type, p_amount_minor,
    p_counterparty, p_note, p_occurred_at, auth.uid()
  ) returning id into v_expense_id;

  return v_expense_id;
end;
$$;

create or replace function public.add_project_expected_payment(
  p_project_id uuid,
  p_amount_minor bigint,
  p_due_at timestamptz default null,
  p_payment_type text default 'final',
  p_label text default null,
  p_note text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_amount_minor <= 0 then raise exception 'Expected amount must be positive'; end if;
  if p_payment_type not in ('prepayment','final','full','other') then raise exception 'Invalid payment type'; end if;

  insert into public.project_expected_payments(project_id, payment_type, label, amount_minor, due_at, note, created_by)
  values (p_project_id, p_payment_type, p_label, p_amount_minor, p_due_at, p_note, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_project_payment(
  p_project_id uuid,
  p_account_id uuid,
  p_amount_minor bigint,
  p_payment_type text default 'prepayment',
  p_received_at timestamptz default now(),
  p_is_non_refundable boolean default false,
  p_note text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_account_workspace_id uuid;
  v_currency text;
  v_transaction_id uuid;
  v_payment_id uuid;
  v_remaining bigint;
  v_open bigint;
  v_apply bigint;
  r record;
begin
  if p_amount_minor <= 0 then raise exception 'Payment amount must be positive'; end if;

  select workspace_id, currency into v_workspace_id, v_currency from public.projects where id = p_project_id;
  select workspace_id into v_account_workspace_id from public.accounts where id = p_account_id and is_archived = false;

  if v_workspace_id is null or v_account_workspace_id is null or v_workspace_id <> v_account_workspace_id then
    raise exception 'Project and account must belong to the same workspace';
  end if;

  insert into public.transactions (
    workspace_id, account_id, amount_minor, currency, transaction_type,
    context, project_id, note, occurred_at, source, status, created_by
  ) values (
    v_workspace_id, p_account_id, p_amount_minor, v_currency, 'income',
    'business', p_project_id, coalesce(p_note, 'Оплата по проекту'), p_received_at, 'manual', 'posted', auth.uid()
  ) returning id into v_transaction_id;

  insert into public.project_payments (
    project_id, account_id, transaction_id, payment_type, amount_minor,
    is_non_refundable, recognition_status, received_at, note, created_by
  ) values (
    p_project_id, p_account_id, v_transaction_id, p_payment_type, p_amount_minor,
    p_is_non_refundable, 'restricted', p_received_at, p_note, auth.uid()
  ) returning id into v_payment_id;

  v_remaining := p_amount_minor;
  for r in
    select id, amount_minor, received_minor
    from public.project_expected_payments
    where project_id = p_project_id and status in ('planned','partial')
    order by due_at asc nulls last, created_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_open := greatest(r.amount_minor - r.received_minor, 0);
    v_apply := least(v_remaining, v_open);
    if v_apply > 0 then
      update public.project_expected_payments
      set received_minor = received_minor + v_apply,
          status = case when received_minor + v_apply >= amount_minor then 'received' else 'partial' end,
          updated_at = now()
      where id = r.id;
      v_remaining := v_remaining - v_apply;
    end if;
  end loop;

  update public.projects
  set status = case when status in ('draft','awaiting_payment') then 'in_production' else status end,
      updated_at = now()
  where id = p_project_id;

  return v_payment_id;
end;
$$;

drop view if exists public.project_finance_summary;
create view public.project_finance_summary
with (security_invoker = true)
as
with payment_totals as (
  select
    pp.project_id,
    coalesce(sum(pp.amount_minor), 0)::bigint as gross_received_minor,
    coalesce(sum(pp.amount_minor - pp.refunded_minor), 0)::bigint as net_received_minor,
    coalesce(sum(pp.amount_minor - pp.refunded_minor) filter (where pp.recognition_status = 'restricted'), 0)::bigint as restricted_before_cost_minor,
    coalesce(sum(pp.amount_minor - pp.refunded_minor) filter (where pp.recognition_status = 'earned'), 0)::bigint as earned_minor
  from public.project_payments pp
  group by pp.project_id
), expense_totals as (
  select pe.project_id, coalesce(sum(pe.amount_minor), 0)::bigint as actual_cost_minor
  from public.project_expenses pe
  group by pe.project_id
)
select
  p.id as project_id,
  p.workspace_id,
  p.name,
  p.client_name,
  p.status,
  p.currency,
  p.contract_value_minor,
  p.start_date,
  p.production_due_at,
  p.ship_due_at,
  p.shipped_at,
  p.acceptance_term_days,
  p.acceptance_due_at,
  p.accepted_at,
  coalesce(pt.gross_received_minor, 0)::bigint as received_minor,
  greatest(coalesce(pt.restricted_before_cost_minor, 0) - coalesce(et.actual_cost_minor, 0), 0)::bigint as restricted_minor,
  coalesce(pt.earned_minor, 0)::bigint as earned_minor,
  greatest(p.contract_value_minor - coalesce(pt.net_received_minor, 0), 0)::bigint as outstanding_minor,
  coalesce(et.actual_cost_minor, 0)::bigint as actual_cost_minor,
  greatest(coalesce(pt.net_received_minor, 0) - coalesce(et.actual_cost_minor, 0), 0)::bigint as project_cash_remaining_minor,
  (coalesce(pt.earned_minor, 0) - coalesce(et.actual_cost_minor, 0))::bigint as realized_profit_minor,
  (p.contract_value_minor - coalesce(et.actual_cost_minor, 0))::bigint as projected_profit_minor,
  greatest(coalesce(et.actual_cost_minor, 0) - coalesce(pt.net_received_minor, 0), 0)::bigint as owner_funded_minor
from public.projects p
left join payment_totals pt on pt.project_id = p.id
left join expense_totals et on et.project_id = p.id;

create or replace view public.planned_project_receipts
with (security_invoker = true)
as
with explicit_open as (
  select
    pep.id as expected_payment_id,
    pep.project_id,
    p.workspace_id,
    p.name as project_name,
    p.client_name,
    p.currency,
    pep.payment_type,
    coalesce(pep.label, case pep.payment_type when 'prepayment' then 'Предоплата' when 'final' then 'Финальная оплата' when 'full' then 'Полная оплата' else 'Платёж' end) as label,
    greatest(pep.amount_minor - pep.received_minor, 0)::bigint as amount_minor,
    pep.due_at,
    pep.status,
    'schedule'::text as source
  from public.project_expected_payments pep
  join public.projects p on p.id = pep.project_id
  where pep.status in ('planned','partial') and pep.amount_minor > pep.received_minor
), fallback as (
  select
    null::uuid as expected_payment_id,
    pfs.project_id,
    pfs.workspace_id,
    pfs.name as project_name,
    pfs.client_name,
    pfs.currency,
    'final'::text as payment_type,
    'Остаток по проекту'::text as label,
    pfs.outstanding_minor::bigint as amount_minor,
    coalesce(
      pfs.acceptance_due_at,
      case when pfs.ship_due_at is not null then pfs.ship_due_at + make_interval(days => pfs.acceptance_term_days) else null end,
      pfs.ship_due_at,
      pfs.production_due_at
    ) as due_at,
    'planned'::text as status,
    'project'::text as source
  from public.project_finance_summary pfs
  where pfs.outstanding_minor > 0
    and pfs.status not in ('cancelled','closed','disputed')
    and not exists (
      select 1 from public.project_expected_payments pep
      where pep.project_id = pfs.project_id and pep.status in ('planned','partial') and pep.amount_minor > pep.received_minor
    )
)
select * from explicit_open
union all
select * from fallback;
