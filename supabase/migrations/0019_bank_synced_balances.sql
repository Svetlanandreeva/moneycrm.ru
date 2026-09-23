alter table public.accounts
  add column if not exists bank_synced_balance_minor bigint,
  add column if not exists bank_synced_balance_at timestamptz;

comment on column public.accounts.bank_synced_balance_minor is
  'Latest exact balance reported by a connected bank. When present this is authoritative for bank accounts instead of reconstructing the current balance from imported history.';

comment on column public.accounts.bank_synced_balance_at is
  'Timestamp when bank_synced_balance_minor was last refreshed from the bank.';

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
    when a.bank_synced_balance_minor is not null
      then a.bank_synced_balance_minor
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
  a.bank_synced_balance_minor,
  a.opening_balance_minor;
