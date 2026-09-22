import { supabase } from './supabase'
import { listWorkspaces, selectWorkspacesForContext, type FinanceContext } from './moneycrm'
import { getActiveFamilyWorkspaceId } from './familySharing'

export type FeedTransaction = {
  id: string
  workspace_id: string
  account_id: string | null
  amount_minor: number
  currency: string
  transaction_type: string
  counterparty: string | null
  note: string | null
  occurred_at: string
  category_label: string | null
  source_kind: 'direct' | 'family_shared'
  can_share_family: boolean
  shared_family: boolean
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function listRecentTransactions(context: FinanceContext, limit = 12): Promise<FeedTransaction[]> {
  const auth = client()
  const [{ data: userData, error: userError }, workspaces] = await Promise.all([
    auth.auth.getUser(),
    listWorkspaces(),
  ])
  if (userError) throw userError
  if (!userData.user) throw new Error('Not authenticated')

  const selected = selectWorkspacesForContext(workspaces, context)
  const workspaceIds = selected.map(workspace => workspace.id)
  const activeFamilyId = await getActiveFamilyWorkspaceId()

  const { data: rows, error } = workspaceIds.length
    ? await auth
        .from('transactions')
        .select('id,workspace_id,account_id,amount_minor,currency,transaction_type,counterparty,note,occurred_at,category_id')
        .in('workspace_id', workspaceIds)
        .eq('status', 'posted')
        .order('occurred_at', { ascending: false })
        .limit(limit)
    : { data: [], error: null }
  if (error) throw error

  const categoryIds = [...new Set((rows ?? []).map(row => row.category_id).filter(Boolean))] as string[]
  const categoryMap = new Map<string, string>()
  if (categoryIds.length) {
    const { data: categories, error: categoryError } = await auth.from('categories').select('id,name').in('id', categoryIds)
    if (categoryError) throw categoryError
    for (const category of categories ?? []) categoryMap.set(category.id, category.name)
  }

  let shareableAccountIds = new Set<string>()
  let sharedTransactionIds = new Set<string>()
  if (context === 'Личные' && activeFamilyId) {
    const [{ data: shares, error: sharesError }, { data: shared, error: sharedError }] = await Promise.all([
      auth
        .from('family_account_shares')
        .select('personal_account_id')
        .eq('family_workspace_id', activeFamilyId)
        .eq('owner_user_id', userData.user.id)
        .eq('visibility', 'family_activity'),
      auth
        .from('family_shared_transactions')
        .select('source_transaction_id')
        .eq('family_workspace_id', activeFamilyId)
        .eq('owner_user_id', userData.user.id),
    ])
    if (sharesError) throw sharesError
    if (sharedError) throw sharedError
    shareableAccountIds = new Set((shares ?? []).map(row => row.personal_account_id))
    sharedTransactionIds = new Set((shared ?? []).map(row => row.source_transaction_id))
  }

  const direct: FeedTransaction[] = (rows ?? []).map(row => ({
    id: row.id,
    workspace_id: row.workspace_id,
    account_id: row.account_id,
    amount_minor: Number(row.amount_minor ?? 0),
    currency: row.currency,
    transaction_type: row.transaction_type,
    counterparty: row.counterparty,
    note: row.note,
    occurred_at: row.occurred_at,
    category_label: row.category_id ? categoryMap.get(row.category_id) ?? null : null,
    source_kind: 'direct',
    can_share_family: Boolean(row.account_id && shareableAccountIds.has(row.account_id)),
    shared_family: sharedTransactionIds.has(row.id),
  }))

  if (context !== 'Семья' || !activeFamilyId) return direct

  const { data: sharedRows, error: familyError } = await auth
    .from('family_shared_transactions')
    .select('id,family_workspace_id,source_transaction_id,amount_minor,currency,occurred_at,merchant_label,category_label')
    .eq('family_workspace_id', activeFamilyId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (familyError) throw familyError

  const sharedFeed: FeedTransaction[] = (sharedRows ?? []).map(row => ({
    id: `family-${row.id}`,
    workspace_id: row.family_workspace_id,
    account_id: null,
    amount_minor: Number(row.amount_minor ?? 0),
    currency: row.currency,
    transaction_type: Number(row.amount_minor ?? 0) < 0 ? 'expense' : 'income',
    counterparty: row.merchant_label,
    note: 'Личная операция, отмеченная как семейная',
    occurred_at: row.occurred_at,
    category_label: row.category_label,
    source_kind: 'family_shared',
    can_share_family: false,
    shared_family: true,
  }))

  return [...direct, ...sharedFeed]
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, limit)
}

export async function shareTransactionWithFamily(transactionId: string) {
  const auth = client()
  const [{ data: userData, error: userError }, familyWorkspaceId] = await Promise.all([
    auth.auth.getUser(),
    getActiveFamilyWorkspaceId(),
  ])
  if (userError) throw userError
  if (!userData.user || !familyWorkspaceId) throw new Error('Семейное пространство не выбрано')
  const { error } = await auth.from('family_shared_transactions').insert({
    family_workspace_id: familyWorkspaceId,
    source_transaction_id: transactionId,
    owner_user_id: userData.user.id,
    amount_minor: 1,
    currency: 'RUB',
    occurred_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function unshareTransactionWithFamily(transactionId: string) {
  const familyWorkspaceId = await getActiveFamilyWorkspaceId()
  if (!familyWorkspaceId) return
  const { error } = await client()
    .from('family_shared_transactions')
    .delete()
    .eq('family_workspace_id', familyWorkspaceId)
    .eq('source_transaction_id', transactionId)
  if (error) throw error
}
