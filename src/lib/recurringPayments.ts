import { supabase } from './supabase'
import { listAccountsForWorkspaces, listWorkspaces, selectWorkspacesForContext, type FinanceContext, type MoneyAccount, type Workspace } from './moneycrm'

export type Recurrence = 'one_time' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export type RecurringPayment = {
  id: string
  workspace_id: string
  account_id: string | null
  title: string
  payee: string | null
  amount_minor: number
  currency: string
  recurrence: Recurrence
  interval_count: number
  preferred_day_of_month: number | null
  next_due_date: string
  end_date: string | null
  reminder_days_before: number[]
  category_label: string | null
  notes: string | null
  is_active: boolean
  auto_match_bank: boolean
  last_paid_at: string | null
}

export type UserNotification = {
  id: string
  workspace_id: string | null
  notification_type: string
  severity: 'info' | 'warning' | 'critical' | 'success'
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  due_at: string | null
  read_at: string | null
  created_at: string
}

export type RecurringPaymentsBundle = {
  workspaces: Workspace[]
  accounts: MoneyAccount[]
  payments: RecurringPayment[]
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function listRecurringPayments(context: FinanceContext): Promise<RecurringPaymentsBundle> {
  const workspaces = await listWorkspaces()
  const selected = selectWorkspacesForContext(workspaces, context)
  const workspaceIds = selected.map(workspace => workspace.id)

  if (workspaceIds.length === 0) return { workspaces: selected, accounts: [], payments: [] }

  const [{ data, error }, accounts] = await Promise.all([
    client()
      .from('recurring_payments')
      .select('id,workspace_id,account_id,title,payee,amount_minor,currency,recurrence,interval_count,preferred_day_of_month,next_due_date,end_date,reminder_days_before,category_label,notes,is_active,auto_match_bank,last_paid_at')
      .in('workspace_id', workspaceIds)
      .eq('is_active', true)
      .order('next_due_date', { ascending: true }),
    listAccountsForWorkspaces(workspaceIds),
  ])

  if (error) throw error

  return {
    workspaces: selected,
    accounts,
    payments: (data ?? []).map(row => ({
      ...row,
      amount_minor: Number(row.amount_minor ?? 0),
      interval_count: Number(row.interval_count ?? 1),
      preferred_day_of_month: row.preferred_day_of_month == null ? null : Number(row.preferred_day_of_month),
      reminder_days_before: Array.isArray(row.reminder_days_before) ? row.reminder_days_before.map(Number) : [7, 3, 1],
    })) as RecurringPayment[],
  }
}

export async function createRecurringPayment(input: {
  workspaceId: string
  accountId?: string
  title: string
  payee?: string
  amountMinor: number
  currency?: string
  recurrence: Recurrence
  nextDueDate: string
  reminderDaysBefore?: number[]
  categoryLabel?: string
  notes?: string
}) {
  const auth = client()
  const { data: userData, error: userError } = await auth.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error('Not authenticated')

  const dueDay = new Date(`${input.nextDueDate}T12:00:00`).getDate()
  const { data, error } = await auth
    .from('recurring_payments')
    .insert({
      workspace_id: input.workspaceId,
      account_id: input.accountId || null,
      title: input.title.trim(),
      payee: input.payee?.trim() || null,
      amount_minor: input.amountMinor,
      currency: input.currency ?? 'RUB',
      recurrence: input.recurrence,
      interval_count: 1,
      preferred_day_of_month: input.recurrence === 'monthly' || input.recurrence === 'quarterly' || input.recurrence === 'yearly' ? dueDay : null,
      next_due_date: input.nextDueDate,
      reminder_days_before: input.reminderDaysBefore?.length ? input.reminderDaysBefore : [7, 3, 1],
      category_label: input.categoryLabel?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: userData.user.id,
    })
    .select('id')
    .single()

  if (error) throw error
  await refreshMyPaymentNotifications()
  return data
}

export async function markRecurringPaymentPaid(paymentId: string, createTransaction = true) {
  const { data, error } = await client().rpc('mark_recurring_payment_paid', {
    p_recurring_payment_id: paymentId,
    p_paid_at: new Date().toISOString(),
    p_create_transaction: createTransaction,
  })
  if (error) throw error
  await refreshMyPaymentNotifications()
  return data as string | null
}

export async function refreshMyPaymentNotifications() {
  const { data, error } = await client().rpc('refresh_my_payment_notifications')
  if (error) throw error
  return Number(data ?? 0)
}

export async function listMyNotifications(limit = 20): Promise<UserNotification[]> {
  const { data, error } = await client()
    .from('user_notifications')
    .select('id,workspace_id,notification_type,severity,title,body,entity_type,entity_id,due_at,read_at,created_at')
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as UserNotification[]
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await client()
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
  if (error) throw error
}

export function recurrenceLabel(value: Recurrence) {
  return {
    one_time: 'Один раз',
    weekly: 'Каждую неделю',
    monthly: 'Каждый месяц',
    quarterly: 'Каждый квартал',
    yearly: 'Каждый год',
  }[value]
}
