alter table public.bank_connections
  add column if not exists provider_bank_code text,
  add column if not exists connected_at timestamptz,
  add column if not exists last_sync_started_at timestamptz;

create table if not exists public.bank_connection_tokens (
  connection_id uuid primary key references public.bank_connections(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  expires_at timestamptz,
  token_type text not null default 'Bearer',
  updated_at timestamptz not null default now()
);

alter table public.bank_connection_tokens enable row level security;

comment on table public.bank_connection_tokens is
  'Server-only encrypted OAuth tokens for bank providers. No client RLS policies are intentionally defined; access is reserved for service-role server functions.';

create unique index if not exists bank_connections_workspace_provider_bank_uidx
  on public.bank_connections(workspace_id, provider, provider_bank_code)
  where status <> 'revoked' and provider_bank_code is not null;

create index if not exists bank_connections_created_by_idx
  on public.bank_connections(created_by);

create index if not exists bank_account_links_account_idx
  on public.bank_account_links(account_id);

create index if not exists bank_transaction_imports_matched_idx
  on public.bank_transaction_imports(matched_transaction_id)
  where matched_transaction_id is not null;
