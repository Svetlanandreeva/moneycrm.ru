create table if not exists public.project_owner_advances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_account_id uuid not null references public.accounts(id) on delete restrict,
  destination_account_id uuid not null references public.accounts(id) on delete restrict,
  source_transaction_id uuid unique references public.transactions(id) on delete set null,
  destination_transaction_id uuid unique references public.transactions(id) on delete set null,
  transfer_group_id uuid not null unique default gen_random_uuid(),
  amount_minor bigint not null check (amount_minor > 0),
  repaid_minor bigint not null default 0 check (repaid_minor >= 0 and repaid_minor <= amount_minor),
  status text not null default 'outstanding' check (status in ('outstanding','partially_repaid','repaid','settled_on_acceptance')),
  taken_at timestamptz not null default now(),
  settled_at timestamptz,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_owner_advance_repayments (
  id uuid primary key default gen_random_uuid(),
  advance_id uuid not null references public.project_owner_advances(id) on delete cascade,
  source_account_id uuid not null references public.accounts(id) on delete restrict,
  destination_account_id uuid not null references public.accounts(id) on delete restrict,
  source_transaction_id uuid unique references public.transactions(id) on delete set null,
  destination_transaction_id uuid unique references public.transactions(id) on delete set null,
  transfer_group_id uuid not null unique default gen_random_uuid(),
  amount_minor bigint not null check (amount_minor > 0),
  repaid_at timestamptz not null default now(),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_owner_advances_project_idx on public.project_owner_advances(project_id, taken_at desc);
create index if not exists project_owner_advances_destination_idx on public.project_owner_advances(destination_account_id) where status in ('outstanding','partially_repaid');
create index if not exists project_owner_advance_repayments_advance_idx on public.project_owner_advance_repayments(advance_id, repaid_at desc);

alter table public.project_owner_advances enable row level security;
alter table public.project_owner_advance_repayments enable row level security;

create policy project_owner_advances_select_member on public.project_owner_advances
for select using (
  exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_member(p.workspace_id))
  or created_by = auth.uid()
);
create policy project_owner_advances_insert_owner on public.project_owner_advances for insert with check (created_by = auth.uid());
create policy project_owner_advances_update_owner on public.project_owner_advances for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy project_owner_advance_repayments_select_owner on public.project_owner_advance_repayments
for select using (
  created_by = auth.uid()
  or exists (
    select 1 from public.project_owner_advances poa
    join public.projects p on p.id = poa.project_id
    where poa.id = advance_id and private.is_workspace_member(p.workspace_id)
  )
);
create policy project_owner_advance_repayments_insert_owner on public.project_owner_advance_repayments for insert with check (created_by = auth.uid());

create or replace view public.project_finance_summary
with (security_invoker = true)
as
with payment_totals as (
  select pp.project_id,
    coalesce(sum(pp.amount_minor), 0)::bigint as gross_received_minor,
    coalesce(sum(pp.amount_minor - pp.refunded_minor), 0)::bigint as net_received_minor,
    coalesce(sum(pp.amount_minor - pp.refunded_minor) filter (where pp.recognition_status = 'restricted'), 0)::bigint as restricted_before_cost_minor,
    coalesce(sum(pp.amount_minor - pp.refunded_minor) filter (where pp.recognition_status = 'earned'), 0)::bigint as earned_minor
  from public.project_payments pp group by pp.project_id
), expense_totals as (
  select pe.project_id, coalesce(sum(pe.amount_minor), 0)::bigint as actual_cost_minor
  from public.project_expenses pe group by pe.project_id
), advance_totals as (
  select poa.project_id,
    coalesce(sum(poa.amount_minor),0)::bigint as owner_advance_taken_minor,
    coalesce(sum(poa.repaid_minor),0)::bigint as owner_advance_repaid_minor,
    coalesce(sum(poa.amount_minor - poa.repaid_minor) filter (where poa.status in ('outstanding','partially_repaid')),0)::bigint as owner_advance_outstanding_minor
  from public.project_owner_advances poa group by poa.project_id
)
select
  p.id as project_id, p.workspace_id, p.name, p.client_name, p.status, p.currency,
  p.contract_value_minor, p.start_date, p.production_due_at, p.ship_due_at, p.shipped_at,
  p.acceptance_term_days, p.acceptance_due_at, p.accepted_at,
  coalesce(pt.gross_received_minor, 0)::bigint as received_minor,
  greatest(coalesce(pt.restricted_before_cost_minor, 0) - coalesce(et.actual_cost_minor, 0), 0)::bigint as restricted_minor,
  coalesce(pt.earned_minor, 0)::bigint as earned_minor,
  greatest(p.contract_value_minor - coalesce(pt.net_received_minor, 0), 0)::bigint as outstanding_minor,
  coalesce(et.actual_cost_minor, 0)::bigint as actual_cost_minor,
  greatest(coalesce(pt.net_received_minor, 0) - coalesce(et.actual_cost_minor, 0) - coalesce(at.owner_advance_outstanding_minor,0), 0)::bigint as project_cash_remaining_minor,
  (coalesce(pt.earned_minor, 0) - coalesce(et.actual_cost_minor, 0))::bigint as realized_profit_minor,
  (p.contract_value_minor - coalesce(et.actual_cost_minor, 0))::bigint as projected_profit_minor,
  greatest(coalesce(et.actual_cost_minor, 0) - coalesce(pt.net_received_minor, 0), 0)::bigint as owner_funded_minor,
  coalesce(at.owner_advance_taken_minor,0)::bigint as owner_advance_taken_minor,
  coalesce(at.owner_advance_repaid_minor,0)::bigint as owner_advance_repaid_minor,
  coalesce(at.owner_advance_outstanding_minor,0)::bigint as owner_advance_outstanding_minor
from public.projects p
left join payment_totals pt on pt.project_id = p.id
left join expense_totals et on et.project_id = p.id
left join advance_totals at on at.project_id = p.id;

create or replace function public.take_project_owner_advance(
  p_project_id uuid, p_source_account_id uuid, p_destination_account_id uuid,
  p_amount_minor bigint, p_taken_at timestamptz default now(), p_note text default null
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_project_workspace uuid; v_project_currency text; v_project_status text;
  v_source_workspace uuid; v_source_currency text; v_destination_workspace uuid;
  v_destination_currency text; v_destination_kind text; v_source_balance bigint;
  v_available bigint; v_transfer_group uuid := gen_random_uuid();
  v_source_tx uuid; v_destination_tx uuid; v_advance_id uuid;
begin
  if p_amount_minor <= 0 then raise exception 'Advance amount must be positive'; end if;
  select workspace_id, currency, status into v_project_workspace, v_project_currency, v_project_status from public.projects where id = p_project_id;
  if v_project_workspace is null then raise exception 'Project not found'; end if;
  if not private.is_workspace_member(v_project_workspace) then raise exception 'Not authorized for project'; end if;
  if v_project_status in ('accepted','closed','cancelled') then raise exception 'Project is already finalized'; end if;

  select a.workspace_id, a.currency, ab.balance_minor into v_source_workspace, v_source_currency, v_source_balance
  from public.accounts a left join public.account_balances ab on ab.account_id = a.id
  where a.id = p_source_account_id and not a.is_archived;

  select a.workspace_id, a.currency, w.kind into v_destination_workspace, v_destination_currency, v_destination_kind
  from public.accounts a
  join public.workspaces w on w.id = a.workspace_id
  join public.workspace_members wm on wm.workspace_id = w.id and wm.user_id = auth.uid() and wm.role = 'owner'
  where a.id = p_destination_account_id and not a.is_archived;

  if v_source_workspace <> v_project_workspace then raise exception 'Source account must belong to project business workspace'; end if;
  if v_destination_workspace is null or v_destination_kind <> 'personal' then raise exception 'Destination must be your personal account'; end if;
  if v_source_currency <> v_destination_currency or v_source_currency <> v_project_currency then raise exception 'Account currencies must match project currency'; end if;
  if coalesce(v_source_balance,0) < p_amount_minor then raise exception 'Not enough money on source account'; end if;

  select project_cash_remaining_minor into v_available from public.project_finance_summary where project_id = p_project_id;
  if coalesce(v_available,0) < p_amount_minor then raise exception 'Not enough unspent project cash. Available: %', coalesce(v_available,0); end if;

  insert into public.transactions(workspace_id,account_id,amount_minor,currency,transaction_type,context,project_id,transfer_group_id,counterparty,note,occurred_at,source,status,created_by)
  values(v_project_workspace,p_source_account_id,-p_amount_minor,v_project_currency,'transfer','business',p_project_id,v_transfer_group,'Личные средства',coalesce(p_note,'Аванс себе из проекта'),p_taken_at,'manual','posted',auth.uid()) returning id into v_source_tx;

  insert into public.transactions(workspace_id,account_id,amount_minor,currency,transaction_type,context,project_id,transfer_group_id,counterparty,note,occurred_at,source,status,created_by)
  values(v_destination_workspace,p_destination_account_id,p_amount_minor,v_project_currency,'transfer','personal',p_project_id,v_transfer_group,'Проект',coalesce(p_note,'Временно взято из проекта до приёмки'),p_taken_at,'manual','posted',auth.uid()) returning id into v_destination_tx;

  insert into public.project_owner_advances(project_id,source_account_id,destination_account_id,source_transaction_id,destination_transaction_id,transfer_group_id,amount_minor,taken_at,note,created_by)
  values(p_project_id,p_source_account_id,p_destination_account_id,v_source_tx,v_destination_tx,v_transfer_group,p_amount_minor,p_taken_at,p_note,auth.uid()) returning id into v_advance_id;
  return v_advance_id;
end;
$$;

create or replace function public.repay_project_owner_advance(
  p_advance_id uuid, p_source_account_id uuid, p_destination_account_id uuid,
  p_amount_minor bigint, p_repaid_at timestamptz default now(), p_note text default null
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_advance public.project_owner_advances%rowtype; v_project_workspace uuid; v_currency text;
  v_source_workspace uuid; v_source_kind text; v_source_currency text; v_destination_workspace uuid;
  v_destination_currency text; v_source_balance bigint; v_remaining bigint;
  v_transfer_group uuid := gen_random_uuid(); v_source_tx uuid; v_destination_tx uuid; v_repayment_id uuid;
begin
  if p_amount_minor <= 0 then raise exception 'Repayment amount must be positive'; end if;
  select * into v_advance from public.project_owner_advances where id = p_advance_id for update;
  if v_advance.id is null then raise exception 'Advance not found'; end if;
  if v_advance.created_by <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_advance.status not in ('outstanding','partially_repaid') then raise exception 'Advance is already settled'; end if;

  select p.workspace_id, p.currency into v_project_workspace, v_currency from public.projects p where p.id = v_advance.project_id;
  select a.workspace_id, w.kind, a.currency, ab.balance_minor into v_source_workspace, v_source_kind, v_source_currency, v_source_balance
  from public.accounts a join public.workspaces w on w.id = a.workspace_id
  join public.workspace_members wm on wm.workspace_id = w.id and wm.user_id = auth.uid() and wm.role = 'owner'
  left join public.account_balances ab on ab.account_id = a.id
  where a.id = p_source_account_id and not a.is_archived;
  select a.workspace_id, a.currency into v_destination_workspace, v_destination_currency from public.accounts a where a.id = p_destination_account_id and not a.is_archived;

  if v_source_workspace is null or v_source_kind <> 'personal' then raise exception 'Repayment source must be your personal account'; end if;
  if v_destination_workspace <> v_project_workspace then raise exception 'Repayment destination must belong to project workspace'; end if;
  if v_source_currency <> v_currency or v_destination_currency <> v_currency then raise exception 'Account currencies must match project currency'; end if;
  if coalesce(v_source_balance,0) < p_amount_minor then raise exception 'Not enough money on personal account'; end if;

  v_remaining := v_advance.amount_minor - v_advance.repaid_minor;
  if p_amount_minor > v_remaining then raise exception 'Repayment exceeds outstanding advance'; end if;

  insert into public.transactions(workspace_id,account_id,amount_minor,currency,transaction_type,context,project_id,transfer_group_id,counterparty,note,occurred_at,source,status,created_by)
  values(v_source_workspace,p_source_account_id,-p_amount_minor,v_currency,'transfer','personal',v_advance.project_id,v_transfer_group,'Проект',coalesce(p_note,'Возврат аванса в проект'),p_repaid_at,'manual','posted',auth.uid()) returning id into v_source_tx;
  insert into public.transactions(workspace_id,account_id,amount_minor,currency,transaction_type,context,project_id,transfer_group_id,counterparty,note,occurred_at,source,status,created_by)
  values(v_project_workspace,p_destination_account_id,p_amount_minor,v_currency,'transfer','business',v_advance.project_id,v_transfer_group,'Личные средства',coalesce(p_note,'Возврат аванса в проект'),p_repaid_at,'manual','posted',auth.uid()) returning id into v_destination_tx;

  insert into public.project_owner_advance_repayments(advance_id,source_account_id,destination_account_id,source_transaction_id,destination_transaction_id,transfer_group_id,amount_minor,repaid_at,note,created_by)
  values(p_advance_id,p_source_account_id,p_destination_account_id,v_source_tx,v_destination_tx,v_transfer_group,p_amount_minor,p_repaid_at,p_note,auth.uid()) returning id into v_repayment_id;

  update public.project_owner_advances
  set repaid_minor = repaid_minor + p_amount_minor,
      status = case when repaid_minor + p_amount_minor >= amount_minor then 'repaid' else 'partially_repaid' end,
      settled_at = case when repaid_minor + p_amount_minor >= amount_minor then p_repaid_at else settled_at end,
      updated_at = now()
  where id = p_advance_id;
  return v_repayment_id;
end;
$$;

create or replace function public.accept_project(p_project_id uuid, p_accepted_at timestamptz default now(), p_note text default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.projects set accepted_at = p_accepted_at, status = 'accepted', updated_at = now() where id = p_project_id;
  if not found then raise exception 'Project not found'; end if;
  update public.project_payments
  set recognition_status = case when refunded_minor >= amount_minor then 'refunded' when refunded_minor > 0 then 'partially_refunded' else 'earned' end,
      released_at = p_accepted_at, updated_at = now()
  where project_id = p_project_id and recognition_status = 'restricted';
  update public.project_owner_advances set status = 'settled_on_acceptance', settled_at = p_accepted_at, updated_at = now()
  where project_id = p_project_id and status in ('outstanding','partially_repaid');
  insert into public.project_acceptance_events(project_id, event_type, happened_at, note, created_by)
  values (p_project_id, 'accepted', p_accepted_at, p_note, auth.uid());
end;
$$;

create or replace function private.refresh_family_share_for_account(p_account_id uuid)
returns void language plpgsql security definer set search_path = 'public','private' as $$
declare v_balance bigint; v_currency text; v_project_advance bigint;
begin
  select ab.balance_minor, a.currency into v_balance, v_currency
  from public.accounts a left join public.account_balances ab on ab.account_id = a.id where a.id = p_account_id;
  select coalesce(sum(poa.amount_minor - poa.repaid_minor),0)::bigint into v_project_advance
  from public.project_owner_advances poa where poa.destination_account_id = p_account_id and poa.status in ('outstanding','partially_repaid');
  update public.family_account_shares
  set balance_minor = greatest(coalesce(v_balance,0) - coalesce(v_project_advance,0),0), currency = coalesce(v_currency,currency), updated_at = now()
  where personal_account_id = p_account_id;
end;
$$;

create or replace function private.prepare_family_account_share()
returns trigger language plpgsql security definer set search_path = 'public','private' as $$
declare v_owner uuid; v_kind text; v_currency text; v_balance bigint; v_project_advance bigint;
begin
  select wm.user_id, w.kind, a.currency, ab.balance_minor into v_owner, v_kind, v_currency, v_balance
  from public.accounts a join public.workspaces w on w.id = a.workspace_id
  join public.workspace_members wm on wm.workspace_id = w.id and wm.role = 'owner'
  left join public.account_balances ab on ab.account_id = a.id
  where a.id = new.personal_account_id and wm.user_id = new.owner_user_id limit 1;
  if v_owner is null or v_kind <> 'personal' then raise exception 'Only an owned personal account can be shared'; end if;
  if not private.is_workspace_member(new.family_workspace_id) then raise exception 'Not a family member'; end if;
  select coalesce(sum(poa.amount_minor - poa.repaid_minor),0)::bigint into v_project_advance
  from public.project_owner_advances poa where poa.destination_account_id = new.personal_account_id and poa.status in ('outstanding','partially_repaid');
  new.currency := coalesce(v_currency,'RUB');
  new.balance_minor := greatest(coalesce(v_balance,0) - coalesce(v_project_advance,0),0);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.refresh_family_share_on_project_advance()
returns trigger language plpgsql security definer set search_path = 'public','private' as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform private.refresh_family_share_for_account(old.destination_account_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform private.refresh_family_share_for_account(new.destination_account_id); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists project_owner_advances_refresh_family_share on public.project_owner_advances;
create trigger project_owner_advances_refresh_family_share after insert or update or delete on public.project_owner_advances
for each row execute function private.refresh_family_share_on_project_advance();

comment on table public.project_owner_advances is 'Temporary owner draw from restricted project cash. It is a liability to the project until repaid or automatically settled when the client accepts the project.';
comment on table public.project_owner_advance_repayments is 'Audit trail of money returned from personal funds back into a project before acceptance.';
