create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  title text not null,
  payee text,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  recurrence text not null default 'monthly' check (recurrence in ('one_time','weekly','monthly','quarterly','yearly')),
  interval_count integer not null default 1 check (interval_count between 1 and 120),
  preferred_day_of_month integer check (preferred_day_of_month between 1 and 31),
  next_due_date date not null,
  end_date date,
  reminder_days_before integer[] not null default array[7,3,1],
  category_label text,
  notes text,
  is_active boolean not null default true,
  auto_match_bank boolean not null default true,
  last_paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= next_due_date),
  check (array_length(reminder_days_before, 1) is null or reminder_days_before <@ array[0,1,2,3,5,7,10,14,21,30])
);

create index if not exists recurring_payments_workspace_due_idx
  on public.recurring_payments(workspace_id, next_due_date)
  where is_active = true;
create index if not exists recurring_payments_account_due_idx
  on public.recurring_payments(account_id, next_due_date)
  where is_active = true and account_id is not null;

alter table public.recurring_payments enable row level security;

create policy recurring_payments_select_member on public.recurring_payments
  for select using (private.is_workspace_member(workspace_id));
create policy recurring_payments_insert_member on public.recurring_payments
  for insert with check (
    private.is_workspace_member(workspace_id)
    and created_by = auth.uid()
    and (account_id is null or exists (
      select 1 from public.accounts a
      where a.id = recurring_payments.account_id and a.workspace_id = recurring_payments.workspace_id
    ))
  );
create policy recurring_payments_update_member on public.recurring_payments
  for update using (private.is_workspace_member(workspace_id))
  with check (
    private.is_workspace_member(workspace_id)
    and (account_id is null or exists (
      select 1 from public.accounts a
      where a.id = recurring_payments.account_id and a.workspace_id = recurring_payments.workspace_id
    ))
  );
create policy recurring_payments_delete_admin on public.recurring_payments
  for delete using (private.is_workspace_admin(workspace_id));

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  notification_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical','success')),
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  due_at timestamptz,
  dedupe_key text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, dedupe_key)
);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications(user_id, created_at desc)
  where read_at is null and dismissed_at is null;

alter table public.user_notifications enable row level security;
create policy user_notifications_select_own on public.user_notifications
  for select using (user_id = auth.uid());
create policy user_notifications_update_own on public.user_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_notifications_delete_own on public.user_notifications
  for delete using (user_id = auth.uid());

create or replace function public.next_recurring_payment_date(
  p_due date,
  p_recurrence text,
  p_interval_count integer,
  p_preferred_day integer default null
)
returns date
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_months integer;
  v_target_month date;
  v_last_day integer;
  v_day integer;
begin
  if p_recurrence = 'one_time' then return null; end if;
  if p_recurrence = 'weekly' then return p_due + (7 * greatest(p_interval_count, 1)); end if;

  if p_recurrence = 'monthly' then v_months := greatest(p_interval_count, 1);
  elsif p_recurrence = 'quarterly' then v_months := 3 * greatest(p_interval_count, 1);
  elsif p_recurrence = 'yearly' then v_months := 12 * greatest(p_interval_count, 1);
  else raise exception 'Unsupported recurrence';
  end if;

  v_target_month := (date_trunc('month', p_due)::date + make_interval(months => v_months))::date;
  v_last_day := extract(day from (v_target_month + interval '1 month - 1 day'))::integer;
  v_day := least(coalesce(p_preferred_day, extract(day from p_due)::integer), v_last_day);
  return (v_target_month + (v_day - 1))::date;
end;
$$;

create or replace function public.mark_recurring_payment_paid(
  p_recurring_payment_id uuid,
  p_paid_at timestamptz default now(),
  p_create_transaction boolean default true
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.recurring_payments%rowtype;
  v_tx_id uuid;
  v_next date;
  v_context text;
begin
  select * into v_row from public.recurring_payments where id = p_recurring_payment_id;
  if v_row.id is null then raise exception 'Recurring payment not found'; end if;
  if not private.is_workspace_member(v_row.workspace_id) then raise exception 'Not authorized'; end if;

  select case w.kind when 'personal' then 'personal' when 'family' then 'family' else 'business' end
    into v_context from public.workspaces w where w.id = v_row.workspace_id;

  if p_create_transaction and v_row.account_id is not null then
    insert into public.transactions (
      workspace_id, account_id, amount_minor, currency, transaction_type, context,
      counterparty, note, occurred_at, source, status, created_by
    ) values (
      v_row.workspace_id, v_row.account_id, -v_row.amount_minor, v_row.currency, 'expense', v_context,
      v_row.payee, coalesce(v_row.notes, v_row.title), p_paid_at, 'manual', 'posted', auth.uid()
    ) returning id into v_tx_id;
  end if;

  v_next := public.next_recurring_payment_date(
    v_row.next_due_date, v_row.recurrence, v_row.interval_count, v_row.preferred_day_of_month
  );

  update public.recurring_payments
  set last_paid_at = p_paid_at,
      next_due_date = coalesce(v_next, next_due_date),
      is_active = case
        when v_row.recurrence = 'one_time' then false
        when v_row.end_date is not null and v_next is not null and v_next > v_row.end_date then false
        else true
      end,
      updated_at = now()
  where id = v_row.id;

  return v_tx_id;
end;
$$;

create or replace function public.refresh_my_payment_notifications()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_user uuid := auth.uid();
  v_balance bigint;
  v_prior bigint;
  v_available bigint;
  v_shortage bigint;
  v_days integer;
  v_inserted integer := 0;
  v_max_reminder integer;
begin
  if v_user is null then return 0; end if;

  for r in
    select rp.*
    from public.recurring_payments rp
    where rp.is_active
      and private.is_workspace_member(rp.workspace_id)
      and (rp.end_date is null or rp.next_due_date <= rp.end_date)
    order by rp.next_due_date, rp.id
  loop
    v_days := r.next_due_date - current_date;
    select coalesce(max(x), 0) into v_max_reminder from unnest(r.reminder_days_before) x;

    if v_days < 0 then
      insert into public.user_notifications(user_id, workspace_id, notification_type, severity, title, body, entity_type, entity_id, due_at, dedupe_key)
      values (
        v_user, r.workspace_id, 'recurring_payment_overdue', 'critical',
        'Платёж просрочен: ' || r.title,
        'Сумма ' || trim(to_char(r.amount_minor / 100.0, 'FM999999999990D00')) || ' ' || r.currency || '. Просрочено на ' || abs(v_days) || ' дн.',
        'recurring_payment', r.id, r.next_due_date::timestamptz,
        'recurring:' || r.id || ':' || r.next_due_date || ':overdue'
      ) on conflict do nothing;
      if found then v_inserted := v_inserted + 1; end if;
    elsif v_days <= v_max_reminder then
      insert into public.user_notifications(user_id, workspace_id, notification_type, severity, title, body, entity_type, entity_id, due_at, dedupe_key)
      values (
        v_user, r.workspace_id, 'recurring_payment_upcoming', case when v_days <= 1 then 'warning' else 'info' end,
        case when v_days = 0 then 'Сегодня платёж: ' else 'Скоро платёж: ' end || r.title,
        'Через ' || v_days || ' дн. потребуется ' || trim(to_char(r.amount_minor / 100.0, 'FM999999999990D00')) || ' ' || r.currency || '.',
        'recurring_payment', r.id, r.next_due_date::timestamptz,
        'recurring:' || r.id || ':' || r.next_due_date || ':upcoming'
      ) on conflict do nothing;
      if found then v_inserted := v_inserted + 1; end if;
    end if;

    if r.account_id is not null and v_days >= 0 then
      select coalesce(ab.balance_minor, 0) into v_balance
      from public.account_balances ab where ab.account_id = r.account_id;

      select coalesce(sum(rp2.amount_minor), 0)::bigint into v_prior
      from public.recurring_payments rp2
      where rp2.is_active
        and rp2.account_id = r.account_id
        and (rp2.end_date is null or rp2.next_due_date <= rp2.end_date)
        and (
          rp2.next_due_date < r.next_due_date
          or (rp2.next_due_date = r.next_due_date and rp2.id::text < r.id::text)
        )
        and rp2.next_due_date >= current_date;

      v_available := coalesce(v_balance, 0) - coalesce(v_prior, 0);
      v_shortage := r.amount_minor - v_available;

      if v_shortage > 0 and v_days <= greatest(v_max_reminder, 7) then
        insert into public.user_notifications(user_id, workspace_id, notification_type, severity, title, body, entity_type, entity_id, due_at, dedupe_key)
        values (
          v_user, r.workspace_id, 'recurring_payment_insufficient', 'critical',
          'Не хватает денег на ' || r.title,
          'По текущему остатку и платежам до этой даты не хватает ' || trim(to_char(v_shortage / 100.0, 'FM999999999990D00')) || ' ' || r.currency || '.',
          'recurring_payment', r.id, r.next_due_date::timestamptz,
          'recurring:' || r.id || ':' || r.next_due_date || ':insufficient'
        ) on conflict do nothing;
        if found then v_inserted := v_inserted + 1; end if;
      end if;
    end if;
  end loop;

  return v_inserted;
end;
$$;

grant execute on function public.mark_recurring_payment_paid(uuid,timestamptz,boolean) to authenticated;
grant execute on function public.refresh_my_payment_notifications() to authenticated;
grant execute on function public.next_recurring_payment_date(date,text,integer,integer) to authenticated;

comment on table public.recurring_payments is 'Recurring and one-time mandatory payments used by the MoneyCRM cash forecast.';
comment on table public.user_notifications is 'Per-user in-app notification inbox; future push/email delivery can reuse these records.';