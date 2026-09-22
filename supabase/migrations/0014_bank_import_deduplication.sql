create unique index if not exists transactions_bank_external_uidx
  on public.transactions(account_id, external_id)
  where external_id is not null and source = 'bank';
