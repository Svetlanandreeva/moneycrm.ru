create policy user_notifications_insert_own on public.user_notifications
  for insert with check (
    user_id = auth.uid()
    and (workspace_id is null or private.is_workspace_member(workspace_id))
  );

alter function public.mark_recurring_payment_paid(uuid,timestamptz,boolean) security invoker;
alter function public.refresh_my_payment_notifications() security invoker;

revoke execute on function public.mark_recurring_payment_paid(uuid,timestamptz,boolean) from anon;
revoke execute on function public.refresh_my_payment_notifications() from anon;
grant execute on function public.mark_recurring_payment_paid(uuid,timestamptz,boolean) to authenticated;
grant execute on function public.refresh_my_payment_notifications() to authenticated;
