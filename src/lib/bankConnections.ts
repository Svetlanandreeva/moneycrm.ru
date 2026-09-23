import { supabase } from './supabase'
import { listWorkspaces, type Workspace, type WorkspaceKind } from './moneycrm'

export type BankProvider = { type: string; code: string; name: string; description?: string }
export type BankProviderState = { configured: boolean; environment: 'sandbox' | 'production'; providers: BankProvider[]; supportedHint?: string[]; error?: string }
export type BankConnection = { id: string; workspace_id: string; provider: string; provider_bank_code: string | null; institution_name: string | null; status: 'pending' | 'active' | 'needs_reauth' | 'paused' | 'error' | 'revoked'; last_synced_at: string | null; connected_at: string | null; error_message: string | null; linked_accounts: number }
export type BankLinkedAccount = { id: string; connection_id: string; account_id: string; external_name: string | null; account_mask: string | null; currency: string; last_synced_at: string | null; account_name: string; workspace_id: string; workspace_kind: WorkspaceKind; institution: string | null; account_type: string }

function client() { if (!supabase) throw new Error('Supabase is not configured'); return supabase }
async function accessToken() { const { data, error } = await client().auth.getSession(); if (error) throw error; const token = data.session?.access_token; if (!token) throw new Error('Not authenticated'); return token }

export async function getBankProviderState(): Promise<BankProviderState> { const response = await fetch('/api/banks/providers'); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить список банков'); return payload as BankProviderState }

export async function listBankConnections(): Promise<{ workspaces: Workspace[]; connections: BankConnection[]; linkedAccounts: BankLinkedAccount[] }> {
  const workspaces = await listWorkspaces(); if (!workspaces.length) return { workspaces, connections: [], linkedAccounts: [] }
  const workspaceIds = workspaces.map(w => w.id)
  const { data: connections, error } = await client().from('bank_connections').select('id,workspace_id,provider,provider_bank_code,institution_name,status,last_synced_at,connected_at,error_message').in('workspace_id', workspaceIds).neq('status', 'revoked').order('connected_at', { ascending: false, nullsFirst: false }); if (error) throw error
  const connectionIds = (connections ?? []).map(c => c.id)
  let links: any[] = []
  if (connectionIds.length) { const { data, error: e } = await client().from('bank_account_links').select('id,connection_id,account_id,external_name,account_mask,currency,last_synced_at').in('connection_id', connectionIds); if (e) throw e; links = data ?? [] }
  const accountIds = links.map(l => l.account_id); let accountRows: any[] = []
  if (accountIds.length) { const { data, error: e } = await client().from('accounts').select('id,workspace_id,name,institution,account_type').in('id', accountIds); if (e) throw e; accountRows = data ?? [] }
  const accountMap = new Map(accountRows.map(a => [a.id, a])); const workspaceKindMap = new Map(workspaces.map(w => [w.id, w.kind])); const counts = links.reduce((m, l) => m.set(l.connection_id, (m.get(l.connection_id) ?? 0) + 1), new Map<string, number>())
  const linkedAccounts = links.flatMap(link => { const account = accountMap.get(link.account_id); if (!account) return []; const kind = workspaceKindMap.get(account.workspace_id); if (!kind) return []; return [{ ...link, account_name: account.name, workspace_id: account.workspace_id, workspace_kind: kind, institution: account.institution, account_type: account.account_type } satisfies BankLinkedAccount] })
  return { workspaces, connections: (connections ?? []).map(c => ({ ...c, linked_accounts: counts.get(c.id) ?? 0 })) as BankConnection[], linkedAccounts }
}

export async function startBankConnection(workspaceId: string, bankCode: string) {
  const token = await accessToken()
  if (bankCode === 'demo') sessionStorage.setItem('moneycrm_demo_bank_token', token)
  const response = await fetch('/api/banks/start', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, bankCode }) })
  const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Не удалось начать подключение банка'); if (!payload.authorizeUrl) throw new Error('Банк не вернул ссылку авторизации'); window.location.assign(payload.authorizeUrl)
}

export async function syncBankConnection(connectionId: string) { const token = await accessToken(); const response = await fetch('/api/banks/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ connectionId }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Не удалось синхронизировать банк'); return payload as { imported: number; pendingStatements: number } }
export async function routeBankAccount(linkId: string, targetWorkspaceId: string) { const { error } = await client().rpc('route_bank_account_context', { p_bank_account_link_id: linkId, p_target_workspace_id: targetWorkspaceId }); if (error) throw error }
export async function disconnectBankConnection(connectionId: string) { const { error } = await client().from('bank_connections').update({ status: 'revoked', error_message: null }).eq('id', connectionId); if (error) throw error }
