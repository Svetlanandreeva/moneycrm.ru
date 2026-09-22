-- Allow auth users to be deleted without breaking shared financial data.
-- Preserve creator references as NULL and remove a workspace only when it has no members.

alter table public.workspaces
  alter column created_by drop not null;

alter table public.accounts
  alter column created_by drop not null;

alter table public.transactions
  alter column created_by drop not null;

alter table public.workspaces
  drop constraint if exists workspaces_created_by_fkey,
  add constraint workspaces_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.accounts
  drop constraint if exists accounts_created_by_fkey,
  add constraint accounts_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.transactions
  drop constraint if exists transactions_created_by_fkey,
  add constraint transactions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

create or replace function public.cleanup_empty_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = old.workspace_id
  ) then
    delete from public.workspaces where id = old.workspace_id;
  end if;
  return old;
end;
$$;

revoke all on function public.cleanup_empty_workspace() from public, anon, authenticated;

drop trigger if exists cleanup_workspace_after_member_delete on public.workspace_members;
create trigger cleanup_workspace_after_member_delete
after delete on public.workspace_members
for each row execute function public.cleanup_empty_workspace();
