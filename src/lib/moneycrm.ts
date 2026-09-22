import { supabase } from './supabase'

export type FinanceContext = 'Все' | 'Личные' | 'Семья' | 'Бизнес'
export type WorkspaceKind = 'personal' | 'family' | 'business'

export type Workspace = {
  id: string
  name: string
  kind: WorkspaceKind
  base_currency: string
}

export type MoneyAccount = {
  id: string
  workspace_id: string
  name: string
  account_type: 'cash' | 'bank' | 'savings' | 'credit' | 'investment' | 'business' | 'other'
  currency: string
  institution: string | null
  color: string | null
  balance_minor: number
}

export type FinanceSnapshot = {
  totalBalanceMinor: number
  accountCount: number
  monthlyIncomeMinor: number
  monthlyExpenseMinor: number
  monthlyNetMinor: number
  balancesByKind: Record<WorkspaceKind, number>
  accountCountByKind: Record<WorkspaceKind, number>
}

const CONTEXT_KIND: Record<Exclude<FinanceContext, 'Все'>, WorkspaceKind> = {
  'Личные': 'personal',
  'Семья': 'family',
  'Бизнес': 'business',
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export function contextToKind(context: FinanceContext | string): WorkspaceKind | null {
  return CONTEXT_KIND[context as Exclude<FinanceContext, 'Все'>] ?? null
}

export function formatMoneyMinor(value: number, currency = 'RUB') {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100)
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await client()
    .from('workspaces')
    .select('id,name,kind,base_currency')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Workspace[]
}

export async function getPrimaryWorkspace(): Promise<Workspace | null> {
  const workspaces = await listWorkspaces()
  return workspaces.find(workspace => workspace.kind === 'personal') ?? workspaces[0] ?? null
}

export function selectWorkspacesForContext(workspaces: Workspace[], context: FinanceContext | string) {
  const kind = contextToKind(context)
  return kind ? workspaces.filter(workspace => workspace.kind === kind) : workspaces
}

export async function listAccountsForWorkspaces(workspaceIds: string[]): Promise<MoneyAccount[]> {
  if (workspaceIds.length === 0) return []

  const [{ data: accounts, error: accountsError }, { data: balances, error: balancesError }] = await Promise.all([
    client()
      .from('accounts')
      .select('id,workspace_id,name,account_type,currency,institution,color,opening_balance_minor')
      .in('workspace_id', workspaceIds)
      .eq('is_archived', false)
      .order('created_at', { ascending: true }),
    client()
      .from('account_balances')
      .select('account_id,workspace_id,balance_minor')
      .in('workspace_id', workspaceIds),
  ])

  if (accountsError) throw accountsError
  if (balancesError) throw balancesError

  const balanceMap = new Map((balances ?? []).map(row => [row.account_id, Number(row.balance_minor)]))

  return (accounts ?? []).map(account => ({
    id: account.id,
    workspace_id: account.workspace_id,
    name: account.name,
    account_type: account.account_type,
    currency: account.currency,
    institution: account.institution,
    color: account.color,
    balance_minor: balanceMap.get(account.id) ?? Number(account.opening_balance_minor),
  })) as MoneyAccount[]
}

export async function listAccounts(workspaceId: string): Promise<MoneyAccount[]> {
  return listAccountsForWorkspaces([workspaceId])
}

export async function getFinanceSnapshot(context: FinanceContext | string): Promise<FinanceSnapshot> {
  const workspaces = await listWorkspaces()
  const selected = selectWorkspacesForContext(workspaces, context)
  const workspaceIds = selected.map(workspace => workspace.id)
  const accounts = await listAccountsForWorkspaces(workspaceIds)

  const workspaceKindById = new Map(workspaces.map(workspace => [workspace.id, workspace.kind]))
  const balancesByKind: Record<WorkspaceKind, number> = { personal: 0, family: 0, business: 0 }
  const accountCountByKind: Record<WorkspaceKind, number> = { personal: 0, family: 0, business: 0 }

  for (const account of accounts) {
    const kind = workspaceKindById.get(account.workspace_id)
    if (!kind) continue
    balancesByKind[kind] += account.balance_minor
    accountCountByKind[kind] += 1
  }

  let monthlyIncomeMinor = 0
  let monthlyExpenseMinor = 0

  if (workspaceIds.length > 0) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { data: transactions, error } = await client()
      .from('transactions')
      .select('amount_minor,transaction_type')
      .in('workspace_id', workspaceIds)
      .eq('status', 'posted')
      .gte('occurred_at', monthStart)

    if (error) throw error

    for (const transaction of transactions ?? []) {
      const amount = Math.abs(Number(transaction.amount_minor))
      if (transaction.transaction_type === 'income' || transaction.transaction_type === 'refund') {
        monthlyIncomeMinor += amount
      }
      if (transaction.transaction_type === 'expense') {
        monthlyExpenseMinor += amount
      }
    }
  }

  const totalBalanceMinor = accounts.reduce((sum, account) => sum + account.balance_minor, 0)

  return {
    totalBalanceMinor,
    accountCount: accounts.length,
    monthlyIncomeMinor,
    monthlyExpenseMinor,
    monthlyNetMinor: monthlyIncomeMinor - monthlyExpenseMinor,
    balancesByKind,
    accountCountByKind,
  }
}

export async function createAccount(input: {
  workspaceId: string
  name: string
  accountType: MoneyAccount['account_type']
  currency?: string
  openingBalanceMinor?: number
  institution?: string
}) {
  const auth = client()
  const { data: userData, error: userError } = await auth.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error('Not authenticated')

  const { data, error } = await auth
    .from('accounts')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name.trim(),
      account_type: input.accountType,
      currency: input.currency ?? 'RUB',
      opening_balance_minor: input.openingBalanceMinor ?? 0,
      institution: input.institution?.trim() || null,
      created_by: userData.user.id,
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}
