-- Keep the cleanup helper out of the exposed public API schema.

create or replace function private.cleanup_empty_workspace()
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

revoke all on function private.cleanup_empty_workspace() from public, anon, authenticated;

drop trigger if exists cleanup_workspace_after_member_delete on public.workspace_members;
create trigger cleanup_workspace_after_member_delete
after delete on public.workspace_members
for each row execute function private.cleanup_empty_workspace();

drop function if exists public.cleanup_empty_workspace();
