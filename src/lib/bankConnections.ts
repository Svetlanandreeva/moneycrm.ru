import { supabase } from './supabase'
import { listWorkspaces, type Workspace } from './moneycrm'

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

export async function listBankConnections(): Promise<{ workspaces: Workspace[]; connections: BankConnection[] }> {
  const workspaces = await listWorkspaces()
  if (!workspaces.length) return { workspaces, connections: [] }

  const workspaceIds = workspaces.map(workspace => workspace.id)
  const { data: connections, error } = await client()
    .from('bank_connections')
    .select('id,workspace_id,provider,provider_bank_code,institution_name,status,last_synced_at,connected_at,error_message')
    .in('workspace_id', workspaceIds)
    .neq('status', 'revoked')
    .order('connected_at', { ascending: false, nullsFirst: false })
  if (error) throw error

  const connectionIds = (connections ?? []).map(connection => connection.id)
  let links: { connection_id: string }[] = []
  if (connectionIds.length) {
    const { data, error: linksError } = await client()
      .from('bank_account_links')
      .select('connection_id')
      .in('connection_id', connectionIds)
    if (linksError) throw linksError
    links = data ?? []
  }
  const counts = links.reduce((map, link) => map.set(link.connection_id, (map.get(link.connection_id) ?? 0) + 1), new Map<string, number>())

  return {
    workspaces,
    connections: (connections ?? []).map(connection => ({
      ...connection,
      linked_accounts: counts.get(connection.id) ?? 0,
    })) as BankConnection[],
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

export async function disconnectBankConnection(connectionId: string) {
  const { error } = await client()
    .from('bank_connections')
    .update({ status: 'revoked', error_message: null })
    .eq('id', connectionId)
  if (error) throw error
}
