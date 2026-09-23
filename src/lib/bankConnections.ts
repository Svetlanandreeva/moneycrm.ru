import { supabase } from './supabase'
import { listWorkspaces, type Workspace, type WorkspaceKind } from './moneycrm'

export type BankProvider = { type: string; code: string; name: string; description?: string }
export type BankProviderState = { configured: boolean; environment: 'sandbox' | 'production'; providers: BankProvider[]; supportedHint?: string[]; error?: string }
export type BankConnection = { id: string; workspace_id: string; provider: string; provider_bank_code: string | null; institution_name: string | null; status: 'pending' | 'active' | 'needs_reauth' | 'paused' | 'error' | 'revoked'; last_synced_at: string | null; connected_at: string | null; sync_from_at: string | null; error_message: string | null; linked_accounts: number }
export type BankLinkedAccount = { id: string; connection_id: string; account_id: string; external_name: string | null; account_mask: string | null; currency: string; last_synced_at: string | null; account_name: string; workspace_id: string; workspace_kind: WorkspaceKind; institution: string | null; account_type: string; credit_limit_minor: number | null; credit_debt_minor: number | null; credit_available_minor: number | null; credit_min_payment_minor: number | null; credit_payment_due_at: string | null }

function client() { if (!supabase) throw new Error('Supabase is not configured'); return supabase }
async function accessToken() { const { data, error } = await client().auth.getSession(); if (error) throw error; const token = data.session?.access_token; if (!token) throw new Error('Not authenticated'); return token }

export async function getBankProviderState(): Promise<BankProviderState> { const response = await fetch('/api/banks/providers'); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить список банков'); return payload as BankProviderState }

export async function listBankConnections(): Promise<{ workspaces: Workspace[]; connections: BankConnection[]; linkedAccounts: BankLinkedAccount[] }> {
  const workspaces = await listWorkspaces(); if (!workspaces.length) return { workspaces, connections: [], linkedAccounts: [] }
  const workspaceIds = workspaces.map(w => w.id)
  const { data: connections, error } = await client().from('bank_connections').select('id,workspace_id,provider,provider_bank_code,institution_name,status,last_synced_at,connected_at,sync_from_at,error_message').in('workspace_id', workspaceIds).neq('status', 'revoked').order('connected_at', { ascending: false, nullsFirst: false }); if (error) throw error
  const connectionIds = (connections ?? []).map(c => c.id); let links: any[] = []
  if (connectionIds.length) { const { data, error: e } = await client().from('bank_account_links').select('id,connection_id,account_id,external_name,account_mask,currency,last_synced_at').in('connection_id', connectionIds); if (e) throw e; links = data ?? [] }
  const accountIds = links.map(l => l.account_id); let accountRows: any[] = []
  if (accountIds.length) { const { data, error: e } = await client().from('accounts').select('id,workspace_id,name,institution,account_type,credit_limit_minor,credit_debt_minor,credit_available_minor,credit_min_payment_minor,credit_payment_due_at').in('id', accountIds); if (e) throw e; accountRows = data ?? [] }
  const accountMap = new Map(accountRows.map(a => [a.id, a])); const workspaceKindMap = new Map(workspaces.map(w => [w.id, w.kind])); const counts = links.reduce((m, l) => m.set(l.connection_id, (m.get(l.connection_id) ?? 0) + 1), new Map<string, number>())
  const linkedAccounts = links.flatMap(link => { const account = accountMap.get(link.account_id); if (!account) return []; const kind = workspaceKindMap.get(account.workspace_id); if (!kind) return []; return [{ ...link, account_name: account.name, workspace_id: account.workspace_id, workspace_kind: kind, institution: account.institution, account_type: account.account_type, credit_limit_minor: account.credit_limit_minor == null ? null : Number(account.credit_limit_minor), credit_debt_minor: account.credit_debt_minor == null ? null : Number(account.credit_debt_minor), credit_available_minor: account.credit_available_minor == null ? null : Number(account.credit_available_minor), credit_min_payment_minor: account.credit_min_payment_minor == null ? null : Number(account.credit_min_payment_minor), credit_payment_due_at: account.credit_payment_due_at ?? null } satisfies BankLinkedAccount] })
  return { workspaces, connections: (connections ?? []).map(c => ({ ...c, linked_accounts: counts.get(c.id) ?? 0 })) as BankConnection[], linkedAccounts }
}

export async function startBankConnection(workspaceId: string, bankCode: string) {
  const token = await accessToken()
  if (bankCode === 'demo') sessionStorage.setItem('moneycrm_demo_bank_token', token)
  const response = await fetch('/api/banks/start', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, bankCode }) })
  const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Не удалось начать подключение банка'); if (!payload.authorizeUrl) throw new Error('Банк не вернул ссылку авторизации'); window.location.assign(payload.authorizeUrl)
}

async function syncDemo(connectionId: string) {
  const db = client()
  const { data: connection, error: ce } = await db.from('bank_connections').select('id,provider').eq('id', connectionId).single(); if (ce) throw ce
  if (connection.provider !== 'demo') return null
  const { data: link, error: le } = await db.from('bank_account_links').select('id,account_id,currency').eq('connection_id', connectionId).limit(1).maybeSingle(); if (le) throw le
  if (!link) throw new Error('Сначала завершите подключение тестового банка')
  const { data: account, error: ae } = await db.from('accounts').select('workspace_id').eq('id', link.account_id).single(); if (ae) throw ae
  const { data: workspace, error: we } = await db.from('workspaces').select('kind').eq('id', account.workspace_id).single(); if (we) throw we
  const { data: session } = await db.auth.getUser(); const userId = session.user?.id; if (!userId) throw new Error('Not authenticated')
  const now = new Date().toISOString(); const externalId = `demo-sync-${connectionId}-${Date.now()}`
  const { data: tx, error: te } = await db.from('transactions').insert({ workspace_id: account.workspace_id, account_id: link.account_id, amount_minor: -159000, currency: link.currency || 'RUB', transaction_type: 'expense', context: workspace.kind, counterparty: 'Тестовая покупка', note: 'Новая операция после синхронизации', occurred_at: now, source: 'bank', external_id: externalId, status: 'posted', created_by: userId }).select('id').single(); if (te) throw te
  const { error: ie } = await db.from('bank_transaction_imports').insert({ bank_account_link_id: link.id, external_transaction_id: externalId, amount_minor: -159000, currency: link.currency || 'RUB', direction: 'debit', posted_at: now, description: 'Новая операция после синхронизации', merchant_name: 'Тестовая покупка', import_status: 'imported', matched_transaction_id: tx.id, raw_data: { demo: true } }); if (ie) throw ie
  await db.from('bank_account_links').update({ last_synced_at: now }).eq('id', link.id)
  await db.from('bank_connections').update({ last_synced_at: now, status: 'active', error_message: null }).eq('id', connectionId)
  return { imported: 1, pendingStatements: 0 }
}

export async function syncBankConnection(connectionId: string) {
  const demo = await syncDemo(connectionId); if (demo) return demo
  const token = await accessToken(); const response = await fetch('/api/banks/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ connectionId }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Не удалось синхронизировать банк'); return payload as { imported: number; pendingStatements: number }
}
export async function routeBankAccount(linkId: string, targetWorkspaceId: string) { const { error } = await client().rpc('route_bank_account_context', { p_bank_account_link_id: linkId, p_target_workspace_id: targetWorkspaceId }); if (error) throw error }
export async function disconnectBankConnection(connectionId: string) { const { error } = await client().from('bank_connections').update({ status: 'revoked', error_message: null }).eq('id', connectionId); if (error) throw error }
