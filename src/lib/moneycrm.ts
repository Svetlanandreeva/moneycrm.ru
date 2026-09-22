import { supabase } from './supabase'

export type Workspace = {
  id: string
  name: string
  kind: 'personal' | 'family' | 'business'
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

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function getPrimaryWorkspace(): Promise<Workspace | null> {
  const { data, error } = await client()
    .from('workspaces')
    .select('id,name,kind,base_currency')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as Workspace | null
}

export async function listAccounts(workspaceId: string): Promise<MoneyAccount[]> {
  const [{ data: accounts, error: accountsError }, { data: balances, error: balancesError }] = await Promise.all([
    client()
      .from('accounts')
      .select('id,workspace_id,name,account_type,currency,institution,color,opening_balance_minor')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .order('created_at', { ascending: true }),
    client()
      .from('account_balances')
      .select('account_id,balance_minor')
      .eq('workspace_id', workspaceId),
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
