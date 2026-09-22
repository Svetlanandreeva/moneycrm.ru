import { supabase } from './supabase'
import { listWorkspaces, type Workspace, type WorkspaceKind } from './moneycrm'

export type BankProvider = {
  type: string
  code: string
  name: string
  description?: string
}

export type BankProviderState = {
  configured: boolean
  environment: 'sandbox' | 'production'
  providers: BankProvider[]
  supportedHint?: string[]
  error?: string
}

export type BankConnection = {
  id: string
  workspace_id: string
  provider: string
  provider_bank_code: string | null
  institution_name: string | null
  status: 'pending' | 'active' | 'needs_reauth' | 'paused' | 'error' | 'revoked'
  last_synced_at: string | null
  connected_at: string | null
  error_message: string | null
  linked_accounts: number
}

export type BankLinkedAccount = {
  id: string
  connection_id: string
  account_id: string
  external_name: string | null
  account_mask: string | null
  currency: string
  last_synced_at: string | null
  account_name: string
  workspace_id: string
  workspace_kind: WorkspaceKind
  institution: string | null
  account_type: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

async function accessToken() {
  const { data, error } = await client().auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  return token
}

export async function getBankProviderState(): Promise<BankProviderState> {
  const response = await fetch('/api/banks/providers')
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить список банков')
  return payload as BankProviderState
}

export async function listBankConnections(): Promise<{
  workspaces: Workspace[]
  connections: BankConnection[]
  linkedAccounts: BankLinkedAccount[]
}> {
  const workspaces = await listWorkspaces()
  if (!workspaces.length) return { workspaces, connections: [], linkedAccounts: [] }

  const workspaceIds = workspaces.map(workspace => workspace.id)
  const { data: connections, error } = await client()
    .from('bank_connections')
    .select('id,workspace_id,provider,provider_bank_code,institution_name,status,last_synced_at,connected_at,error_message')
    .in('workspace_id', workspaceIds)
    .neq('status', 'revoked')
    .order('connected_at', { ascending: false, nullsFirst: false })
  if (error) throw error

  const connectionIds = (connections ?? []).map(connection => connection.id)
  let links: Array<{
    id: string
    connection_id: string
    account_id: string
    external_name: string | null
    account_mask: string | null
    currency: string
    last_synced_at: string | null
  }> = []

  if (connectionIds.length) {
    const { data, error: linksError } = await client()
      .from('bank_account_links')
      .select('id,connection_id,account_id,external_name,account_mask,currency,last_synced_at')
      .in('connection_id', connectionIds)
    if (linksError) throw linksError
    links = data ?? []
  }

  const accountIds = links.map(link => link.account_id)
  let accountRows: Array<{
    id: string
    workspace_id: string
    name: string
    institution: string | null
    account_type: string
  }> = []

  if (accountIds.length) {
    const { data, error: accountsError } = await client()
      .from('accounts')
      .select('id,workspace_id,name,institution,account_type')
      .in('id', accountIds)
    if (accountsError) throw accountsError
    accountRows = data ?? []
  }

  const accountMap = new Map(accountRows.map(account => [account.id, account]))
  const workspaceKindMap = new Map(workspaces.map(workspace => [workspace.id, workspace.kind]))
  const counts = links.reduce(
    (map, link) => map.set(link.connection_id, (map.get(link.connection_id) ?? 0) + 1),
    new Map<string, number>(),
  )

  const linkedAccounts = links.flatMap(link => {
    const account = accountMap.get(link.account_id)
    if (!account) return []
    const kind = workspaceKindMap.get(account.workspace_id)
    if (!kind) return []
    return [{
      ...link,
      account_name: account.name,
      workspace_id: account.workspace_id,
      workspace_kind: kind,
      institution: account.institution,
      account_type: account.account_type,
    } satisfies BankLinkedAccount]
  })

  return {
    workspaces,
    connections: (connections ?? []).map(connection => ({
      ...connection,
      linked_accounts: counts.get(connection.id) ?? 0,
    })) as BankConnection[],
    linkedAccounts,
  }
}

export async function startBankConnection(workspaceId: string, bankCode: string) {
  const token = await accessToken()
  const response = await fetch('/api/banks/start', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ workspaceId, bankCode }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Не удалось начать подключение банка')
  if (!payload.authorizeUrl) throw new Error('Банк не вернул ссылку авторизации')
  window.location.assign(payload.authorizeUrl)
}

export async function syncBankConnection(connectionId: string) {
  const token = await accessToken()
  const response = await fetch('/api/banks/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ connectionId }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Не удалось синхронизировать банк')
  return payload as { imported: number; pendingStatements: number }
}

export async function routeBankAccount(linkId: string, targetWorkspaceId: string) {
  const { error } = await client().rpc('route_bank_account_context', {
    p_bank_account_link_id: linkId,
    p_target_workspace_id: targetWorkspaceId,
  })
  if (error) throw error
}

export async function disconnectBankConnection(connectionId: string) {
  const { error } = await client()
    .from('bank_connections')
    .update({ status: 'revoked', error_message: null })
    .eq('id', connectionId)
  if (error) throw error
}
