create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  institution_name text,
  provider_connection_id text,
  status text not null default 'pending' check (status in ('pending','active','needs_reauth','paused','error','revoked')),
  last_synced_at timestamptz,
  sync_cursor text,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bank_connections_provider_external_uidx
  on public.bank_connections(provider, provider_connection_id)
  where provider_connection_id is not null;
create index if not exists bank_connections_workspace_idx on public.bank_connections(workspace_id);

create table if not exists public.bank_account_links (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  external_account_id text not null,
  external_name text,
  account_mask text,
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, external_account_id),
  unique(account_id)
);

create index if not exists bank_account_links_connection_idx on public.bank_account_links(connection_id);

create table if not exists public.bank_transaction_imports (
  id uuid primary key default gen_random_uuid(),
  bank_account_link_id uuid not null references public.bank_account_links(id) on delete cascade,
  external_transaction_id text not null,
  amount_minor bigint not null check (amount_minor <> 0),
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  direction text not null check (direction in ('credit','debit')),
  posted_at timestamptz not null,
  authorized_at timestamptz,
  description text,
  merchant_name text,
  import_status text not null default 'new' check (import_status in ('new','imported','needs_review','ignored','duplicate')),
  matched_transaction_id uuid references public.transactions(id) on delete set null,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bank_account_link_id, external_transaction_id)
);

create index if not exists bank_transaction_imports_link_posted_idx
  on public.bank_transaction_imports(bank_account_link_id, posted_at desc);
create index if not exists bank_transaction_imports_status_idx
  on public.bank_transaction_imports(import_status);

alter table public.bank_connections enable row level security;
alter table public.bank_account_links enable row level security;
alter table public.bank_transaction_imports enable row level security;

create policy bank_connections_select_member on public.bank_connections
  for select using (private.is_workspace_member(workspace_id));
create policy bank_connections_insert_admin on public.bank_connections
  for insert with check (private.is_workspace_admin(workspace_id) and created_by = auth.uid());
create policy bank_connections_update_admin on public.bank_connections
  for update using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));
create policy bank_connections_delete_admin on public.bank_connections
  for delete using (private.is_workspace_admin(workspace_id));

create policy bank_account_links_select_member on public.bank_account_links
  for select using (
    exists (
      select 1 from public.bank_connections bc
      where bc.id = bank_account_links.connection_id
        and private.is_workspace_member(bc.workspace_id)
    )
  );
create policy bank_account_links_insert_admin on public.bank_account_links
  for insert with check (
    exists (
      select 1
      from public.bank_connections bc
      join public.accounts a on a.id = bank_account_links.account_id
      where bc.id = bank_account_links.connection_id
        and a.workspace_id = bc.workspace_id
        and private.is_workspace_admin(bc.workspace_id)
    )
  );
create policy bank_account_links_update_admin on public.bank_account_links
  for update using (
    exists (
      select 1 from public.bank_connections bc
      where bc.id = bank_account_links.connection_id
        and private.is_workspace_admin(bc.workspace_id)
    )
  ) with check (
    exists (
      select 1
      from public.bank_connections bc
      join public.accounts a on a.id = bank_account_links.account_id
      where bc.id = bank_account_links.connection_id
        and a.workspace_id = bc.workspace_id
        and private.is_workspace_admin(bc.workspace_id)
    )
  );
create policy bank_account_links_delete_admin on public.bank_account_links
  for delete using (
    exists (
      select 1 from public.bank_connections bc
      where bc.id = bank_account_links.connection_id
        and private.is_workspace_admin(bc.workspace_id)
    )
  );

create policy bank_transaction_imports_select_member on public.bank_transaction_imports
  for select using (
    exists (
      select 1
      from public.bank_account_links bal
      join public.bank_connections bc on bc.id = bal.connection_id
      where bal.id = bank_transaction_imports.bank_account_link_id
        and private.is_workspace_member(bc.workspace_id)
    )
  );
create policy bank_transaction_imports_update_member on public.bank_transaction_imports
  for update using (
    exists (
      select 1
      from public.bank_account_links bal
      join public.bank_connections bc on bc.id = bal.connection_id
      where bal.id = bank_transaction_imports.bank_account_link_id
        and private.is_workspace_member(bc.workspace_id)
    )
  ) with check (
    exists (
      select 1
      from public.bank_account_links bal
      join public.bank_connections bc on bc.id = bal.connection_id
      where bal.id = bank_transaction_imports.bank_account_link_id
        and private.is_workspace_member(bc.workspace_id)
    )
  );

comment on table public.bank_connections is 'Bank/Open Banking connection metadata. Provider credentials/tokens must live only in secure server-side storage, never in this table or the browser.';
comment on table public.bank_transaction_imports is 'Staging ledger for transactions received from a bank provider before/while they become normal MoneyCRM transactions.';
