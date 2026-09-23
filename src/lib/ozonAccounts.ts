import { supabase } from './supabase'
import type { OzonAccountMeta } from './ozonStatement'

export type OzonDiscoveredAccountMeta = OzonAccountMeta & {
  currentBalanceMinor?: number | null
}

function db() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

function normalizeMask(value?: string | null) {
  return value?.replace(/\D/g, '').slice(-4) || null
}

function stableExternalId(meta: OzonDiscoveredAccountMeta, index: number) {
  const explicit = meta.externalAccountId?.trim()
  if (explicit) return explicit
  const mask = normalizeMask(meta.accountMask)
  if (mask) return `ozon-${mask}`
  const name = (meta.accountName || (meta.accountType === 'credit' ? 'credit' : 'account'))
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'account'
  return `ozon-${name}-${index + 1}`
}

export async function syncOzonAccountMetadata(input: {
  workspaceId: string
  accounts: OzonDiscoveredAccountMeta[]
  fromDate?: string | null
}) {
  const auth = db()
  const cleanAccounts = input.accounts.filter(Boolean)
  if (!cleanAccounts.length) return { synced: 0 }

  const [{ data: userData, error: userError }, { data: workspace, error: workspaceError }] = await Promise.all([
    auth.auth.getUser(),
    auth.from('workspaces').select('id,kind').eq('id', input.workspaceId).single(),
  ])
  if (userError) throw userError
  if (workspaceError) throw workspaceError
  if (!userData.user) throw new Error('Not authenticated')

  let { data: connection, error: connectionError } = await auth
    .from('bank_connections')
    .select('id,sync_from_at')
    .eq('workspace_id', input.workspaceId)
    .eq('provider', 'ozon_statement')
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (connectionError) throw connectionError

  const now = new Date().toISOString()
  if (!connection) {
    const created = await auth.from('bank_connections').insert({
      workspace_id: input.workspaceId,
      provider: 'ozon_statement',
      provider_connection_id: `ozon-${userData.user.id}-${input.workspaceId}`,
      institution_name: 'Ozon Банк',
      status: 'active',
      connected_at: now,
      last_synced_at: now,
      sync_from_at: input.fromDate || null,
      created_by: userData.user.id,
    }).select('id,sync_from_at').single()
    if (created.error) throw created.error
    connection = created.data
  }

  const seen = new Set<string>()
  let synced = 0

  for (let index = 0; index < cleanAccounts.length; index += 1) {
    const meta = cleanAccounts[index]
    const externalAccountId = stableExternalId(meta, index)
    if (seen.has(externalAccountId)) continue
    seen.add(externalAccountId)

    const isCredit = meta.accountType === 'credit'
    const accountMask = normalizeMask(meta.accountMask)
    const accountName = meta.accountName?.trim() || (isCredit ? 'Ozon Кредитная карта' : 'Ozon Карта')
    const limit = meta.creditLimitMinor == null ? null : Math.max(0, Number(meta.creditLimitMinor))
    const available = meta.creditAvailableMinor == null ? null : Math.max(0, Number(meta.creditAvailableMinor))
    const debt = meta.creditDebtMinor == null
      ? (limit !== null && available !== null ? Math.max(limit - available, 0) : null)
      : Math.max(0, Number(meta.creditDebtMinor))
    const currentBalance = meta.currentBalanceMinor == null ? null : Number(meta.currentBalanceMinor)

    let { data: link, error: linkError } = await auth
      .from('bank_account_links')
      .select('id,account_id')
      .eq('connection_id', connection.id)
      .eq('external_account_id', externalAccountId)
      .maybeSingle()
    if (linkError) throw linkError

    const accountPatch = {
      name: accountName,
      account_type: isCredit ? 'credit' : workspace.kind === 'business' ? 'business' : 'bank',
      institution: 'Ozon Банк',
      bank_synced_balance_minor: isCredit ? null : currentBalance,
      bank_synced_balance_at: currentBalance !== null ? now : null,
      credit_limit_minor: isCredit ? limit : null,
      credit_debt_minor: isCredit ? debt : null,
      credit_available_minor: isCredit ? available : null,
      credit_min_payment_minor: isCredit && meta.creditMinPaymentMinor != null ? Math.max(0, Number(meta.creditMinPaymentMinor)) : null,
      credit_payment_due_at: isCredit ? meta.creditPaymentDueAt ?? null : null,
      updated_at: now,
    }

    if (!link) {
      const account = await auth.from('accounts').insert({
        workspace_id: input.workspaceId,
        name: accountName,
        account_type: accountPatch.account_type,
        currency: 'RUB',
        opening_balance_minor: 0,
        institution: 'Ozon Банк',
        bank_synced_balance_minor: accountPatch.bank_synced_balance_minor,
        bank_synced_balance_at: accountPatch.bank_synced_balance_at,
        credit_limit_minor: accountPatch.credit_limit_minor,
        credit_debt_minor: accountPatch.credit_debt_minor,
        credit_available_minor: accountPatch.credit_available_minor,
        credit_min_payment_minor: accountPatch.credit_min_payment_minor,
        credit_payment_due_at: accountPatch.credit_payment_due_at,
        created_by: userData.user.id,
      }).select('id').single()
      if (account.error) throw account.error

      const linked = await auth.from('bank_account_links').insert({
        connection_id: connection.id,
        account_id: account.data.id,
        external_account_id: externalAccountId,
        external_name: accountName,
        account_mask: accountMask,
        currency: 'RUB',
        last_synced_at: now,
      }).select('id,account_id').single()
      if (linked.error) throw linked.error
      link = linked.data
    } else {
      const { error: accountError } = await auth.from('accounts').update(accountPatch).eq('id', link.account_id)
      if (accountError) throw accountError
      const { error: linkedError } = await auth.from('bank_account_links').update({
        external_name: accountName,
        account_mask: accountMask,
        last_synced_at: now,
      }).eq('id', link.id)
      if (linkedError) throw linkedError
    }

    synced += 1
  }

  const { error: connectionUpdateError } = await auth.from('bank_connections').update({
    status: 'active',
    connected_at: now,
    last_synced_at: now,
    sync_from_at: input.fromDate || connection.sync_from_at || null,
    error_message: null,
  }).eq('id', connection.id)
  if (connectionUpdateError) throw connectionUpdateError

  return { synced }
}
