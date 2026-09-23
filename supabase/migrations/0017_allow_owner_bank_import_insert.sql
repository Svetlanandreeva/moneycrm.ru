create policy bank_transaction_imports_insert_admin
on public.bank_transaction_imports
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bank_account_links bal
    join public.bank_connections bc on bc.id = bal.connection_id
    where bal.id = bank_transaction_imports.bank_account_link_id
      and private.is_workspace_admin(bc.workspace_id)
      and bc.created_by = auth.uid()
  )
);
