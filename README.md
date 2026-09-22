# MoneyCRM

Первый web-прототип MoneyCRM, перенесённый из Figma Make в обычный Vite/React проект.

## Стек
- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Lucide React
- Recharts

## Локальный запуск
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
npm run preview
```

## Деплой
Проект подготовлен для Vercel. После подключения GitHub-репозитория Vercel сам определит Vite и выполнит `npm run build`.

После первого деплоя подключить домен `moneycrm.ru` и `www.moneycrm.ru` в настройках проекта, затем внести DNS-записи, которые покажет хостинг, в REG.RU.

## Текущий статус
Это UI-прототип с демонстрационными данными. Следующий этап: Supabase/PostgreSQL, авторизация, счета, операции и реальные данные.
