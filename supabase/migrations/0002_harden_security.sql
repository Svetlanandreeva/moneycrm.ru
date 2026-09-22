-- Keep SECURITY DEFINER helpers out of the exposed public API schema.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_workspace_member(target_workspace uuid)
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

create or replace function private.is_workspace_admin(target_workspace uuid)
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

grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_admin(uuid) to authenticated;

alter policy "workspaces_select_member" on public.workspaces
  using ((select private.is_workspace_member(id)));
alter policy "workspaces_update_admin" on public.workspaces
  using ((select private.is_workspace_admin(id)))
  with check ((select private.is_workspace_admin(id)));
alter policy "members_select_member" on public.workspace_members
  using ((select private.is_workspace_member(workspace_id)));
alter policy "members_insert_admin" on public.workspace_members
  with check ((select private.is_workspace_admin(workspace_id)));
alter policy "members_update_admin" on public.workspace_members
  using ((select private.is_workspace_admin(workspace_id)))
  with check ((select private.is_workspace_admin(workspace_id)));
alter policy "members_delete_admin" on public.workspace_members
  using ((select private.is_workspace_admin(workspace_id)));
alter policy "accounts_select_member" on public.accounts
  using ((select private.is_workspace_member(workspace_id)));
alter policy "accounts_insert_member" on public.accounts
  with check ((select private.is_workspace_member(workspace_id)) and created_by = (select auth.uid()));
alter policy "accounts_update_member" on public.accounts
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
alter policy "accounts_delete_admin" on public.accounts
  using ((select private.is_workspace_admin(workspace_id)));
alter policy "categories_select_member" on public.categories
  using ((select private.is_workspace_member(workspace_id)));
alter policy "categories_insert_member" on public.categories
  with check ((select private.is_workspace_member(workspace_id)));
alter policy "categories_update_member" on public.categories
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
alter policy "categories_delete_admin" on public.categories
  using ((select private.is_workspace_admin(workspace_id)));
alter policy "transactions_select_member" on public.transactions
  using ((select private.is_workspace_member(workspace_id)));
alter policy "transactions_insert_member" on public.transactions
  with check ((select private.is_workspace_member(workspace_id)) and created_by = (select auth.uid()));
alter policy "transactions_update_member" on public.transactions
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
alter policy "transactions_delete_member" on public.transactions
  using ((select private.is_workspace_member(workspace_id)));

create or replace function private.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function private.handle_new_user()
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

revoke all on function private.handle_new_workspace() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
after insert on public.workspaces
for each row execute procedure private.handle_new_workspace();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure private.handle_new_user();

drop function if exists public.handle_new_workspace();
drop function if exists public.handle_new_user();
drop function if exists public.is_workspace_member(uuid);
drop function if exists public.is_workspace_admin(uuid);

-- Supabase's auto-RLS event trigger helper does not need RPC access.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
