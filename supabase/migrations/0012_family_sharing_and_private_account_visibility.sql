alter table public.profiles
  add column if not exists active_family_workspace_id uuid references public.workspaces(id) on delete set null;

update public.profiles p
set active_family_workspace_id = (
  select w.id
  from public.workspaces w
  join public.workspace_members wm on wm.workspace_id = w.id
  where w.kind = 'family' and wm.user_id = p.id
  order by w.created_at asc
  limit 1
)
where p.active_family_workspace_id is null
  and exists (
    select 1
    from public.workspaces w
    join public.workspace_members wm on wm.workspace_id = w.id
    where w.kind = 'family' and wm.user_id = p.id
  );

create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null default upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8)),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(code)
);

alter table public.family_invites enable row level security;
create policy family_invites_select_admin on public.family_invites for select using (private.is_workspace_admin(family_workspace_id));
create policy family_invites_insert_admin on public.family_invites for insert with check (
  private.is_workspace_admin(family_workspace_id) and created_by = auth.uid()
  and exists (select 1 from public.workspaces w where w.id = family_workspace_id and w.kind = 'family')
);
create policy family_invites_update_admin on public.family_invites for update using (private.is_workspace_admin(family_workspace_id)) with check (private.is_workspace_admin(family_workspace_id));
create policy family_invites_delete_admin on public.family_invites for delete using (private.is_workspace_admin(family_workspace_id));

create table if not exists public.family_join_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invite_code text not null,
  status text not null default 'pending' check (status in ('pending','joined')),
  family_workspace_id uuid references public.workspaces(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.family_join_requests enable row level security;
create policy family_join_requests_select_own on public.family_join_requests for select using (user_id = auth.uid());
create policy family_join_requests_insert_own on public.family_join_requests for insert with check (user_id = auth.uid());

create or replace function private.process_family_join_request()
returns trigger language plpgsql security definer set search_path = 'public','private' as $$
declare
  v_invite public.family_invites%rowtype;
  v_already_member boolean;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'Not authenticated'; end if;
  select fi.* into v_invite
  from public.family_invites fi
  join public.workspaces w on w.id = fi.family_workspace_id and w.kind = 'family'
  where upper(fi.code) = upper(trim(new.invite_code))
    and fi.revoked_at is null and fi.expires_at > now() and fi.uses < fi.max_uses
  for update;
  if v_invite.id is null then raise exception 'Код приглашения недействителен или истёк'; end if;
  select exists(select 1 from public.workspace_members wm where wm.workspace_id = v_invite.family_workspace_id and wm.user_id = new.user_id) into v_already_member;
  insert into public.workspace_members(workspace_id,user_id,role,can_see_personal_details)
  values(v_invite.family_workspace_id,new.user_id,'member',false)
  on conflict (workspace_id,user_id) do nothing;
  if not v_already_member then update public.family_invites set uses = uses + 1 where id = v_invite.id; end if;
  update public.profiles set active_family_workspace_id = v_invite.family_workspace_id, updated_at = now() where id = new.user_id;
  new.status := 'joined';
  new.family_workspace_id := v_invite.family_workspace_id;
  new.invite_code := upper(trim(new.invite_code));
  return new;
end;
$$;

create trigger family_join_requests_process_before_insert before insert on public.family_join_requests
for each row execute function private.process_family_join_request();

create table if not exists public.family_account_shares (
  id uuid primary key default gen_random_uuid(),
  family_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  personal_account_id uuid not null references public.accounts(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  account_alias text not null,
  visibility text not null default 'balance_only' check (visibility in ('balance_only','family_activity')),
  include_in_family_resources boolean not null default true,
  balance_minor bigint not null default 0,
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(family_workspace_id, personal_account_id)
);
create index if not exists family_account_shares_family_idx on public.family_account_shares(family_workspace_id);
create index if not exists family_account_shares_owner_idx on public.family_account_shares(owner_user_id);
alter table public.family_account_shares enable row level security;
create policy family_account_shares_select_family on public.family_account_shares for select using (owner_user_id = auth.uid() or private.is_workspace_member(family_workspace_id));
create policy family_account_shares_insert_owner on public.family_account_shares for insert with check (
  owner_user_id = auth.uid() and private.is_workspace_member(family_workspace_id)
  and exists (
    select 1 from public.accounts a
    join public.workspaces w on w.id = a.workspace_id and w.kind = 'personal'
    join public.workspace_members wm on wm.workspace_id = w.id and wm.user_id = auth.uid() and wm.role = 'owner'
    where a.id = personal_account_id
  )
  and exists (select 1 from public.workspaces fw where fw.id = family_workspace_id and fw.kind = 'family')
);
create policy family_account_shares_update_owner on public.family_account_shares for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid() and private.is_workspace_member(family_workspace_id));
create policy family_account_shares_delete_owner on public.family_account_shares for delete using (owner_user_id = auth.uid());

create or replace function private.prepare_family_account_share()
returns trigger language plpgsql security definer set search_path = 'public','private' as $$
declare
  v_owner uuid; v_kind text; v_currency text; v_balance bigint;
begin
  select wm.user_id, w.kind, a.currency, ab.balance_minor into v_owner, v_kind, v_currency, v_balance
  from public.accounts a
  join public.workspaces w on w.id = a.workspace_id
  join public.workspace_members wm on wm.workspace_id = w.id and wm.role = 'owner'
  left join public.account_balances ab on ab.account_id = a.id
  where a.id = new.personal_account_id and wm.user_id = new.owner_user_id limit 1;
  if v_owner is null or v_kind <> 'personal' then raise exception 'Only an owned personal account can be shared'; end if;
  if not private.is_workspace_member(new.family_workspace_id) then raise exception 'Not a family member'; end if;
  new.currency := coalesce(v_currency,'RUB');
  new.balance_minor := coalesce(v_balance,0);
  new.updated_at := now();
  return new;
end;
$$;
create trigger family_account_shares_prepare_before_write before insert or update of personal_account_id,family_workspace_id,owner_user_id,account_alias,visibility,include_in_family_resources on public.family_account_shares for each row execute function private.prepare_family_account_share();

create or replace function private.refresh_family_share_for_account(p_account_id uuid)
returns void language plpgsql security definer set search_path = 'public','private' as $$
declare v_balance bigint; v_currency text;
begin
  select ab.balance_minor, a.currency into v_balance, v_currency
  from public.accounts a left join public.account_balances ab on ab.account_id = a.id where a.id = p_account_id;
  update public.family_account_shares
  set balance_minor = coalesce(v_balance,0), currency = coalesce(v_currency,currency), updated_at = now()
  where personal_account_id = p_account_id;
end;
$$;

create or replace function private.refresh_family_share_on_transaction()
returns trigger language plpgsql security definer set search_path = 'public','private' as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.account_id is not null then perform private.refresh_family_share_for_account(old.account_id); end if;
  if tg_op in ('INSERT','UPDATE') and new.account_id is not null then perform private.refresh_family_share_for_account(new.account_id); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger transactions_refresh_family_share_after_change after insert or update or delete on public.transactions for each row execute function private.refresh_family_share_on_transaction();

create or replace function private.refresh_family_share_on_account()
returns trigger language plpgsql security definer set search_path = 'public','private' as $$
begin perform private.refresh_family_share_for_account(new.id); return new; end;
$$;
create trigger accounts_refresh_family_share_after_update after update of opening_balance_minor,currency on public.accounts for each row execute function private.refresh_family_share_on_account();

create table if not exists public.family_shared_transactions (
  id uuid primary key default gen_random_uuid(),
  family_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_transaction_id uuid not null references public.transactions(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  amount_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null,
  merchant_label text,
  category_label text,
  created_at timestamptz not null default now(),
  unique(family_workspace_id, source_transaction_id)
);
alter table public.family_shared_transactions enable row level security;
create policy family_shared_transactions_select_family on public.family_shared_transactions for select using (private.is_workspace_member(family_workspace_id));
create policy family_shared_transactions_insert_owner on public.family_shared_transactions for insert with check (owner_user_id = auth.uid() and private.is_workspace_member(family_workspace_id));
create policy family_shared_transactions_delete_owner on public.family_shared_transactions for delete using (owner_user_id = auth.uid());

create or replace function private.prepare_family_shared_transaction()
returns trigger language plpgsql security definer set search_path = 'public','private' as $$
declare v_tx public.transactions%rowtype; v_category text;
begin
  select t.* into v_tx
  from public.transactions t
  join public.workspaces w on w.id = t.workspace_id and w.kind = 'personal'
  join public.workspace_members wm on wm.workspace_id = w.id and wm.user_id = new.owner_user_id and wm.role = 'owner'
  where t.id = new.source_transaction_id;
  if v_tx.id is null then raise exception 'Only your personal transaction can be shared'; end if;
  if not private.is_workspace_member(new.family_workspace_id) then raise exception 'Not a family member'; end if;
  if not exists (
    select 1 from public.family_account_shares fas
    where fas.family_workspace_id = new.family_workspace_id and fas.personal_account_id = v_tx.account_id
      and fas.owner_user_id = new.owner_user_id and fas.visibility = 'family_activity'
  ) then raise exception 'This personal account is not enabled for family activity sharing'; end if;
  select c.name into v_category from public.categories c where c.id = v_tx.category_id;
  new.amount_minor := v_tx.amount_minor;
  new.currency := v_tx.currency;
  new.occurred_at := v_tx.occurred_at;
  new.merchant_label := coalesce(v_tx.counterparty, v_tx.note, 'Семейная операция');
  new.category_label := v_category;
  return new;
end;
$$;
create trigger family_shared_transactions_prepare_before_insert before insert on public.family_shared_transactions for each row execute function private.prepare_family_shared_transaction();

comment on table public.family_account_shares is 'Privacy-safe snapshot of a personal account optionally included in a family budget. The family never receives access to the underlying personal workspace/account.';
comment on table public.family_shared_transactions is 'Explicitly shared personal transactions for family spending analytics. Private personal transactions remain inaccessible.';
