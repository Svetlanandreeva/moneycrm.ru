create or replace function private.seed_workspace_categories(target_workspace uuid, target_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_kind = 'personal' then
    insert into public.categories (workspace_id, name, category_type, is_system)
    values
      (target_workspace, 'Зарплата', 'income', true),
      (target_workspace, 'Другой доход', 'income', true),
      (target_workspace, 'Продукты', 'expense', true),
      (target_workspace, 'Транспорт', 'expense', true),
      (target_workspace, 'Жильё', 'expense', true),
      (target_workspace, 'Подписки', 'expense', true),
      (target_workspace, 'Покупки', 'expense', true),
      (target_workspace, 'Здоровье', 'expense', true),
      (target_workspace, 'Другое', 'expense', true)
    on conflict do nothing;
  elsif target_kind = 'family' then
    insert into public.categories (workspace_id, name, category_type, is_system)
    values
      (target_workspace, 'Взносы в бюджет', 'income', true),
      (target_workspace, 'Другой доход', 'income', true),
      (target_workspace, 'Продукты', 'expense', true),
      (target_workspace, 'Дом', 'expense', true),
      (target_workspace, 'Дети', 'expense', true),
      (target_workspace, 'Транспорт', 'expense', true),
      (target_workspace, 'Совместный досуг', 'expense', true),
      (target_workspace, 'Обязательные платежи', 'expense', true),
      (target_workspace, 'Другое', 'expense', true)
    on conflict do nothing;
  elsif target_kind = 'business' then
    insert into public.categories (workspace_id, name, category_type, is_system)
    values
      (target_workspace, 'Оплата клиентов', 'income', true),
      (target_workspace, 'Другой доход', 'income', true),
      (target_workspace, 'Материалы', 'expense', true),
      (target_workspace, 'Подрядчики', 'expense', true),
      (target_workspace, 'Логистика', 'expense', true),
      (target_workspace, 'Упаковка', 'expense', true),
      (target_workspace, 'Комиссии', 'expense', true),
      (target_workspace, 'Налоги', 'expense', true),
      (target_workspace, 'Другое', 'expense', true)
    on conflict do nothing;
  end if;
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
  workspace_kind text;
  workspace_name text;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  for workspace_kind, workspace_name in
    select * from (values
      ('personal'::text, 'Личные деньги'::text),
      ('family'::text, 'Семья'::text),
      ('business'::text, 'Бизнес'::text)
    ) as defaults(kind, name)
  loop
    insert into public.workspaces (name, kind, base_currency, created_by)
    values (workspace_name, workspace_kind, 'RUB', new.id)
    returning id into new_workspace_id;

    perform private.seed_workspace_categories(new_workspace_id, workspace_kind);
  end loop;

  return new;
end;
$$;

do $$
declare
  user_row record;
  new_workspace_id uuid;
begin
  for user_row in select id from auth.users loop
    if not exists (
      select 1 from public.workspaces
      where created_by = user_row.id and kind = 'personal'
    ) then
      insert into public.workspaces (name, kind, base_currency, created_by)
      values ('Личные деньги', 'personal', 'RUB', user_row.id)
      returning id into new_workspace_id;
      perform private.seed_workspace_categories(new_workspace_id, 'personal');
    end if;

    if not exists (
      select 1 from public.workspaces
      where created_by = user_row.id and kind = 'family'
    ) then
      insert into public.workspaces (name, kind, base_currency, created_by)
      values ('Семья', 'family', 'RUB', user_row.id)
      returning id into new_workspace_id;
      perform private.seed_workspace_categories(new_workspace_id, 'family');
    end if;

    if not exists (
      select 1 from public.workspaces
      where created_by = user_row.id and kind = 'business'
    ) then
      insert into public.workspaces (name, kind, base_currency, created_by)
      values ('Бизнес', 'business', 'RUB', user_row.id)
      returning id into new_workspace_id;
      perform private.seed_workspace_categories(new_workspace_id, 'business');
    end if;
  end loop;
end;
$$;
