-- MoneyCRM core schema
-- Monetary values are stored in minor units (kopecks/cents) as BIGINT.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency text not null default 'RUB' check (base_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'personal' check (kind in ('personal', 'family', 'business')),
  base_currency text not null default 'RUB' check (base_currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  can_see_personal_details boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  account_type text not null default 'bank' check (account_type in ('cash', 'bank', 'savings', 'credit', 'investment', 'business', 'other')),
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  opening_balance_minor bigint not null default 0,
  institution text,
  color text,
  is_archived boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  category_type text not null check (category_type in ('income', 'expense')),
  icon text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, name, category_type)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  amount_minor bigint not null check (amount_minor <> 0),
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  transaction_type text not null default 'expense' check (transaction_type in ('income', 'expense', 'transfer', 'refund', 'adjustment', 'reserve', 'unreserve')),
  context text not null default 'personal' check (context in ('personal', 'family', 'business')),
  category_id uuid references public.categories(id) on delete set null,
  transfer_group_id uuid,
  counterparty text,
  note text,
  occurred_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'import', 'bank', 'crm')),
  external_id text,
  status text not null default 'posted' check (status in ('pending', 'posted', 'void')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_workspace_idx on public.accounts(workspace_id);
create index if not exists transactions_workspace_occurred_idx on public.transactions(workspace_id, occurred_at desc);
create index if not exists transactions_account_occurred_idx on public.transactions(account_id, occurred_at desc);
create index if not exists transactions_transfer_group_idx on public.transactions(transfer_group_id) where transfer_group_id is not null;

-- Access helpers. SECURITY DEFINER avoids recursive RLS checks on membership.
create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  );
$$;

-- New account bootstrap: profile + personal workspace + owner membership + defaults.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.workspaces (name, kind, base_currency, created_by)
  values ('Личные деньги', 'personal', 'RUB', new.id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  insert into public.categories (workspace_id, name, category_type, is_system)
  values
    (new_workspace_id, 'Зарплата', 'income', true),
    (new_workspace_id, 'Другой доход', 'income', true),
    (new_workspace_id, 'Продукты', 'expense', true),
    (new_workspace_id, 'Транспорт', 'expense', true),
    (new_workspace_id, 'Жильё', 'expense', true),
    (new_workspace_id, 'Подписки', 'expense', true),
    (new_workspace_id, 'Покупки', 'expense', true),
    (new_workspace_id, 'Бизнес', 'expense', true),
    (new_workspace_id, 'Другое', 'expense', true)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy "profiles_select_own" on public.profiles
for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "workspaces_select_member" on public.workspaces
for select using (public.is_workspace_member(id));
create policy "workspaces_insert_own" on public.workspaces
for insert with check (created_by = auth.uid());
create policy "workspaces_update_admin" on public.workspaces
for update using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));
create policy "workspaces_delete_owner" on public.workspaces
for delete using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = id and wm.user_id = auth.uid() and wm.role = 'owner'
  )
);

create policy "members_select_member" on public.workspace_members
for select using (public.is_workspace_member(workspace_id));
create policy "members_insert_admin" on public.workspace_members
for insert with check (public.is_workspace_admin(workspace_id));
create policy "members_update_admin" on public.workspace_members
for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "members_delete_admin" on public.workspace_members
for delete using (public.is_workspace_admin(workspace_id));

create policy "accounts_select_member" on public.accounts
for select using (public.is_workspace_member(workspace_id));
create policy "accounts_insert_member" on public.accounts
for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "accounts_update_member" on public.accounts
for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "accounts_delete_admin" on public.accounts
for delete using (public.is_workspace_admin(workspace_id));

create policy "categories_select_member" on public.categories
for select using (public.is_workspace_member(workspace_id));
create policy "categories_insert_member" on public.categories
for insert with check (public.is_workspace_member(workspace_id));
create policy "categories_update_member" on public.categories
for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "categories_delete_admin" on public.categories
for delete using (public.is_workspace_admin(workspace_id));

create policy "transactions_select_member" on public.transactions
for select using (public.is_workspace_member(workspace_id));
create policy "transactions_insert_member" on public.transactions
for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "transactions_update_member" on public.transactions
for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "transactions_delete_member" on public.transactions
for delete using (public.is_workspace_member(workspace_id));

-- Account balance is derived from opening balance + posted transactions.
create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.workspace_id,
  a.currency,
  a.opening_balance_minor + coalesce(sum(t.amount_minor) filter (where t.status = 'posted'), 0)::bigint as balance_minor
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id, a.workspace_id, a.currency, a.opening_balance_minor;
