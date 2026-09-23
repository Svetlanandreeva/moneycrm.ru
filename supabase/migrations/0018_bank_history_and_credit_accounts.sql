alter table public.bank_connections
  add column if not exists sync_from_at date;

alter table public.accounts
  add column if not exists credit_limit_minor bigint,
  add column if not exists credit_debt_minor bigint,
  add column if not exists credit_available_minor bigint,
  add column if not exists credit_min_payment_minor bigint,
  add column if not exists credit_payment_due_at date;

alter table public.accounts
  drop constraint if exists accounts_credit_limit_nonnegative,
  drop constraint if exists accounts_credit_debt_nonnegative,
  drop constraint if exists accounts_credit_available_nonnegative,
  drop constraint if exists accounts_credit_min_payment_nonnegative;

alter table public.accounts
  add constraint accounts_credit_limit_nonnegative check (credit_limit_minor is null or credit_limit_minor >= 0),
  add constraint accounts_credit_debt_nonnegative check (credit_debt_minor is null or credit_debt_minor >= 0),
  add constraint accounts_credit_available_nonnegative check (credit_available_minor is null or credit_available_minor >= 0),
  add constraint accounts_credit_min_payment_nonnegative check (credit_min_payment_minor is null or credit_min_payment_minor >= 0);

comment on column public.bank_connections.sync_from_at is
  'Earliest date the user chose to import transaction history from for this connection.';
comment on column public.accounts.credit_limit_minor is
  'Total credit limit in minor units. This is bank money and must never be counted as user capital.';
comment on column public.accounts.credit_debt_minor is
  'Current outstanding credit debt in minor units. Account balance exposes this as a negative liability.';
comment on column public.accounts.credit_available_minor is
  'Unused portion of a credit limit in minor units. Informational only; excluded from capital/free money.';

create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.workspace_id,
  a.currency,
  case
    when a.account_type = 'credit' and a.credit_debt_minor is not null
      then -a.credit_debt_minor
    else a.opening_balance_minor + coalesce(sum(t.amount_minor) filter (where t.status = 'posted'), 0)::bigint
  end as balance_minor
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by
  a.id,
  a.workspace_id,
  a.currency,
  a.account_type,
  a.credit_debt_minor,
  a.opening_balance_minor;

create or replace function public.route_bank_account_context(
  p_bank_account_link_id uuid,
  p_target_workspace_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_account_id uuid;
  v_connection_owner uuid;
  v_current_workspace uuid;
  v_target_kind text;
  v_context text;
  v_has_project_links boolean;
  v_has_recurring_links boolean;
begin
  select bal.account_id, bc.created_by, a.workspace_id
  into v_account_id, v_connection_owner, v_current_workspace
  from public.bank_account_links bal
  join public.bank_connections bc on bc.id = bal.connection_id
  join public.accounts a on a.id = bal.account_id
  where bal.id = p_bank_account_link_id;

  if v_account_id is null then
    raise exception 'Bank account link not found';
  end if;

  if v_connection_owner is distinct from auth.uid() then
    raise exception 'Only the user who connected this bank can route its accounts';
  end if;

  select kind into v_target_kind
  from public.workspaces
  where id = p_target_workspace_id;

  if v_target_kind is null then
    raise exception 'Target workspace not found';
  end if;

  if v_target_kind = 'family' then
    if not private.is_workspace_member(p_target_workspace_id) then
      raise exception 'You are not a member of this family workspace';
    end if;
  else
    if not private.is_workspace_admin(p_target_workspace_id) then
      raise exception 'You cannot manage the target workspace';
    end if;
  end if;

  if v_current_workspace = p_target_workspace_id then
    return;
  end if;

  select exists(
    select 1 from public.transactions t
    where t.account_id = v_account_id and t.project_id is not null
  ) or exists(
    select 1 from public.project_payments pp where pp.account_id = v_account_id
  ) or exists(
    select 1 from public.project_expenses pe where pe.account_id = v_account_id
  ) or exists(
    select 1 from public.project_owner_advances poa
    where poa.source_account_id = v_account_id or poa.destination_account_id = v_account_id
  ) or exists(
    select 1 from public.project_owner_advance_repayments poar
    where poar.source_account_id = v_account_id or poar.destination_account_id = v_account_id
  ) into v_has_project_links;

  if v_has_project_links then
    raise exception 'This account is already linked to a project. Change the project link before moving the account.';
  end if;

  select exists(
    select 1 from public.recurring_payments rp where rp.account_id = v_account_id and rp.is_active
  ) into v_has_recurring_links;

  if v_has_recurring_links then
    raise exception 'This account is used by an active recurring payment. Change that payment first.';
  end if;

  v_context := case v_target_kind
    when 'personal' then 'personal'
    when 'family' then 'family'
    when 'business' then 'business'
    else 'personal'
  end;

  update public.transactions
  set workspace_id = p_target_workspace_id,
      context = v_context,
      category_id = null,
      updated_at = now()
  where account_id = v_account_id;

  if v_target_kind <> 'personal' then
    delete from public.family_account_shares where personal_account_id = v_account_id;
  end if;

  update public.accounts
  set workspace_id = p_target_workspace_id,
      account_type = case
        when account_type = 'credit' then 'credit'
        when v_target_kind = 'business' then 'business'
        else 'bank'
      end,
      updated_at = now()
  where id = v_account_id;
end;
$$;

grant execute on function public.route_bank_account_context(uuid, uuid) to authenticated;
revoke execute on function public.route_bank_account_context(uuid, uuid) from anon;
