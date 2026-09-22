create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  client_name text,
  status text not null default 'draft' check (status in (
    'draft','awaiting_payment','in_production','ready_to_ship','shipped',
    'awaiting_acceptance','accepted','revision','disputed','cancelled','closed'
  )),
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  contract_value_minor bigint not null default 0 check (contract_value_minor >= 0),
  start_date date,
  production_due_at timestamptz,
  ship_due_at timestamptz,
  shipped_at timestamptz,
  acceptance_term_days integer not null default 0 check (acceptance_term_days >= 0 and acceptance_term_days <= 365),
  acceptance_due_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  dispute_opened_at timestamptz,
  closed_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  transaction_id uuid unique references public.transactions(id) on delete set null,
  payment_type text not null default 'prepayment' check (payment_type in ('prepayment','final','full','other')),
  amount_minor bigint not null check (amount_minor > 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0 and refunded_minor <= amount_minor),
  is_non_refundable boolean not null default false,
  recognition_status text not null default 'restricted' check (recognition_status in ('restricted','earned','refunded','partially_refunded')),
  received_at timestamptz not null default now(),
  released_at timestamptz,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_acceptance_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null check (event_type in ('sent','accepted','rejected','revision_requested','dispute_opened','dispute_resolved','note')),
  happened_at timestamptz not null default now(),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists projects_workspace_status_idx on public.projects(workspace_id, status);
create index if not exists projects_due_idx on public.projects(ship_due_at, acceptance_due_at);
create index if not exists project_payments_project_idx on public.project_payments(project_id, received_at desc);
create index if not exists project_payments_recognition_idx on public.project_payments(recognition_status);
create index if not exists project_acceptance_events_project_idx on public.project_acceptance_events(project_id, happened_at desc);
create index if not exists transactions_project_idx on public.transactions(project_id) where project_id is not null;

alter table public.projects enable row level security;
alter table public.project_payments enable row level security;
alter table public.project_acceptance_events enable row level security;

create policy "projects_select_member" on public.projects
for select using (private.is_workspace_member(workspace_id));

create policy "projects_insert_member" on public.projects
for insert with check (
  private.is_workspace_member(workspace_id)
  and created_by = auth.uid()
  and exists (select 1 from public.workspaces w where w.id = workspace_id and w.kind = 'business')
);

create policy "projects_update_member" on public.projects
for update using (private.is_workspace_member(workspace_id))
with check (private.is_workspace_member(workspace_id));

create policy "projects_delete_admin" on public.projects
for delete using (private.is_workspace_admin(workspace_id));

create policy "project_payments_select_member" on public.project_payments
for select using (
  exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_member(p.workspace_id))
);

create policy "project_payments_insert_member" on public.project_payments
for insert with check (
  created_by = auth.uid()
  and exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_member(p.workspace_id))
);

create policy "project_payments_update_member" on public.project_payments
for update using (
  exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_member(p.workspace_id))
)
with check (
  exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_member(p.workspace_id))
);

create policy "project_payments_delete_admin" on public.project_payments
for delete using (
  exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_admin(p.workspace_id))
);

create policy "project_acceptance_events_select_member" on public.project_acceptance_events
for select using (
  exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_member(p.workspace_id))
);

create policy "project_acceptance_events_insert_member" on public.project_acceptance_events
for insert with check (
  created_by = auth.uid()
  and exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_member(p.workspace_id))
);

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
security invoker
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_account_workspace_id uuid;
  v_currency text;
  v_transaction_id uuid;
  v_payment_id uuid;
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

  update public.projects
  set status = case when status in ('draft','awaiting_payment') then 'in_production' else status end,
      updated_at = now()
  where id = p_project_id;

  return v_payment_id;
end;
$$;

create or replace function public.mark_project_shipped(
  p_project_id uuid,
  p_shipped_at timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_term integer;
begin
  select acceptance_term_days into v_term from public.projects where id = p_project_id;
  if v_term is null then raise exception 'Project not found'; end if;

  update public.projects
  set shipped_at = p_shipped_at,
      acceptance_due_at = case when v_term > 0 then p_shipped_at + make_interval(days => v_term) else null end,
      status = 'awaiting_acceptance',
      updated_at = now()
  where id = p_project_id;

  insert into public.project_acceptance_events(project_id, event_type, happened_at, created_by)
  values (p_project_id, 'sent', p_shipped_at, auth.uid());
end;
$$;

create or replace function public.accept_project(
  p_project_id uuid,
  p_accepted_at timestamptz default now(),
  p_note text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.projects
  set accepted_at = p_accepted_at,
      status = 'accepted',
      updated_at = now()
  where id = p_project_id;

  if not found then raise exception 'Project not found'; end if;

  update public.project_payments
  set recognition_status = case
        when refunded_minor >= amount_minor then 'refunded'
        when refunded_minor > 0 then 'partially_refunded'
        else 'earned'
      end,
      released_at = p_accepted_at,
      updated_at = now()
  where project_id = p_project_id
    and recognition_status = 'restricted';

  insert into public.project_acceptance_events(project_id, event_type, happened_at, note, created_by)
  values (p_project_id, 'accepted', p_accepted_at, p_note, auth.uid());
end;
$$;

create or replace view public.project_finance_summary
with (security_invoker = true)
as
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
  coalesce(sum(pp.amount_minor), 0)::bigint as received_minor,
  coalesce(sum(pp.amount_minor - pp.refunded_minor) filter (where pp.recognition_status = 'restricted'), 0)::bigint as restricted_minor,
  coalesce(sum(pp.amount_minor - pp.refunded_minor) filter (where pp.recognition_status = 'earned'), 0)::bigint as earned_minor,
  greatest(p.contract_value_minor - coalesce(sum(pp.amount_minor), 0)::bigint, 0)::bigint as outstanding_minor
from public.projects p
left join public.project_payments pp on pp.project_id = p.id
group by p.id;
