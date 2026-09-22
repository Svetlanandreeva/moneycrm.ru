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

export type ProjectStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'in_production'
  | 'ready_to_ship'
  | 'shipped'
  | 'awaiting_acceptance'
  | 'accepted'
  | 'revision'
  | 'disputed'
  | 'cancelled'
  | 'closed'

export type ProjectSummary = {
  project_id: string
  workspace_id: string
  name: string
  client_name: string | null
  status: ProjectStatus
  currency: string
  contract_value_minor: number
  start_date: string | null
  production_due_at: string | null
  ship_due_at: string | null
  shipped_at: string | null
  acceptance_term_days: number
  acceptance_due_at: string | null
  accepted_at: string | null
  received_minor: number
  restricted_minor: number
  earned_minor: number
  outstanding_minor: number
}

export type FinanceSnapshot = {
  totalBalanceMinor: number
  freeBalanceMinor: number
  restrictedProjectMinor: number
  earnedProjectMinor: number
  outstandingProjectMinor: number
  projectCount: number
  accountCount: number
  monthlyIncomeMinor: number
  monthlyCashInMinor: number
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

export async function listProjects(): Promise<ProjectSummary[]> {
  const { data, error } = await client()
    .from('project_finance_summary')
    .select('*')
    .order('ship_due_at', { ascending: true, nullsFirst: false })

  if (error) throw error
  return (data ?? []).map(project => ({
    ...project,
    contract_value_minor: Number(project.contract_value_minor ?? 0),
    acceptance_term_days: Number(project.acceptance_term_days ?? 0),
    received_minor: Number(project.received_minor ?? 0),
    restricted_minor: Number(project.restricted_minor ?? 0),
    earned_minor: Number(project.earned_minor ?? 0),
    outstanding_minor: Number(project.outstanding_minor ?? 0),
  })) as ProjectSummary[]
}

export async function createProject(input: {
  name: string
  clientName?: string
  contractValueMinor?: number
  startDate?: string
  productionDueAt?: string
  shipDueAt?: string
  acceptanceTermDays?: number
  notes?: string
}) {
  const auth = client()
  const [{ data: userData, error: userError }, workspaces] = await Promise.all([
    auth.auth.getUser(),
    listWorkspaces(),
  ])
  if (userError) throw userError
  if (!userData.user) throw new Error('Not authenticated')

  const businessWorkspace = workspaces.find(workspace => workspace.kind === 'business')
  if (!businessWorkspace) throw new Error('Business workspace not found')

  const { data, error } = await auth
    .from('projects')
    .insert({
      workspace_id: businessWorkspace.id,
      name: input.name.trim(),
      client_name: input.clientName?.trim() || null,
      status: 'draft',
      contract_value_minor: input.contractValueMinor ?? 0,
      start_date: input.startDate || null,
      production_due_at: input.productionDueAt || null,
      ship_due_at: input.shipDueAt || null,
      acceptance_term_days: input.acceptanceTermDays ?? 0,
      notes: input.notes?.trim() || null,
      created_by: userData.user.id,
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}

export async function recordProjectPayment(input: {
  projectId: string
  accountId: string
  amountMinor: number
  paymentType: 'prepayment' | 'final' | 'full' | 'other'
  isNonRefundable?: boolean
  note?: string
}) {
  const { data, error } = await client().rpc('record_project_payment', {
    p_project_id: input.projectId,
    p_account_id: input.accountId,
    p_amount_minor: input.amountMinor,
    p_payment_type: input.paymentType,
    p_is_non_refundable: input.isNonRefundable ?? false,
    p_note: input.note ?? null,
  })
  if (error) throw error
  return data as string
}

export async function markProjectShipped(projectId: string) {
  const { error } = await client().rpc('mark_project_shipped', { p_project_id: projectId })
  if (error) throw error
}

export async function acceptProject(projectId: string, note?: string) {
  const { error } = await client().rpc('accept_project', {
    p_project_id: projectId,
    p_note: note ?? null,
  })
  if (error) throw error
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
  let monthlyCashInMinor = 0
  let monthlyExpenseMinor = 0
  let restrictedProjectMinor = 0
  let earnedProjectMinor = 0
  let outstandingProjectMinor = 0
  let projectCount = 0

  if (workspaceIds.length > 0) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const [{ data: transactions, error: txError }, { data: projects, error: projectError }] = await Promise.all([
      client()
        .from('transactions')
        .select('amount_minor,transaction_type,project_id')
        .in('workspace_id', workspaceIds)
        .eq('status', 'posted')
        .gte('occurred_at', monthStart),
      client()
        .from('project_finance_summary')
        .select('project_id,restricted_minor,earned_minor,outstanding_minor')
        .in('workspace_id', workspaceIds),
    ])

    if (txError) throw txError
    if (projectError) throw projectError

    const projectIds = (projects ?? []).map(project => project.project_id)
    projectCount = projectIds.length

    for (const project of projects ?? []) {
      restrictedProjectMinor += Number(project.restricted_minor ?? 0)
      earnedProjectMinor += Number(project.earned_minor ?? 0)
      outstandingProjectMinor += Number(project.outstanding_minor ?? 0)
    }

    for (const transaction of transactions ?? []) {
      const amount = Math.abs(Number(transaction.amount_minor))
      if (transaction.transaction_type === 'income' || transaction.transaction_type === 'refund') {
        monthlyCashInMinor += amount
        if (!transaction.project_id) monthlyIncomeMinor += amount
      }
      if (transaction.transaction_type === 'expense') monthlyExpenseMinor += amount
    }

    if (projectIds.length > 0) {
      const { data: releasedPayments, error: releasedError } = await client()
        .from('project_payments')
        .select('amount_minor,refunded_minor')
        .in('project_id', projectIds)
        .eq('recognition_status', 'earned')
        .gte('released_at', monthStart)

      if (releasedError) throw releasedError
      for (const payment of releasedPayments ?? []) {
        monthlyIncomeMinor += Number(payment.amount_minor ?? 0) - Number(payment.refunded_minor ?? 0)
      }
    }
  }

  const totalBalanceMinor = accounts.reduce((sum, account) => sum + account.balance_minor, 0)
  const freeBalanceMinor = Math.max(totalBalanceMinor - restrictedProjectMinor, 0)

  return {
    totalBalanceMinor,
    freeBalanceMinor,
    restrictedProjectMinor,
    earnedProjectMinor,
    outstandingProjectMinor,
    projectCount,
    accountCount: accounts.length,
    monthlyIncomeMinor,
    monthlyCashInMinor,
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
