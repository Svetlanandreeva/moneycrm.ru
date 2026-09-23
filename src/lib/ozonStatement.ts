import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from './supabase'

GlobalWorkerOptions.workerSrc = pdfWorker

export type OzonAccountMeta = {
  accountType?: 'bank' | 'credit'
  accountName?: string | null
  accountMask?: string | null
  externalAccountId?: string | null
  creditLimitMinor?: number | null
  creditDebtMinor?: number | null
  creditAvailableMinor?: number | null
  creditMinPaymentMinor?: number | null
  creditPaymentDueAt?: string | null
}

type ParsedOperation = {
  occurredAt: string
  amountMinor: number
  description: string
  merchant: string
  raw: string
}

type ParsedStatement = {
  operations: ParsedOperation[]
  openingBalanceMinor: number | null
  closingBalanceMinor: number | null
}

function db() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

function moneyMinor(value: string) {
  const clean = value
    .replace(/(?:RUB|руб\.?|₽)/gi, '')
    .replace(/[\s\u00a0]/g, '')
    .replace(',', '.')
    .replace(/[^\d+\-.]/g, '')
  const number = Number(clean)
  return Number.isFinite(number) ? Math.round(number * 100) : null
}

function dateIso(day: string, month: string, year: string) {
  const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year)
  return new Date(Date.UTC(fullYear, Number(month) - 1, Number(day), 12, 0, 0)).toISOString()
}

function inferSign(description: string) {
  const text = description.toLowerCase()
  if (/пополн|зачисл|возврат|кэшбэк|кешбэк|процент|перевод от|входящ|начисл/.test(text)) return 1
  return -1
}

function findBalance(text: string, kind: 'opening' | 'closing') {
  const labels = kind === 'opening'
    ? ['остаток на начало', 'входящий остаток', 'начальный остаток']
    : ['остаток на конец', 'исходящий остаток', 'конечный остаток']
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}[^\\d+-]{0,40}([+-]?\\d[\\d\\s\\u00a0]*(?:[.,]\\d{2})?)`, 'i'))
    if (match) {
      const value = moneyMinor(match[1])
      if (value !== null) return value
    }
  }
  return null
}

function parseOperationLines(lines: string[]) {
  const dateRe = /\b(\d{2})[.\/-](\d{2})[.\/-](\d{2,4})\b/
  const amountRe = /[+-]?\s*\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d{2})(?:\s*(?:₽|руб\.?|RUB))?|[+-]?\s*\d+(?:[.,]\d{2})\s*(?:₽|руб\.?|RUB)/gi
  const skipRe = /остаток|итого|всего операций|выписка|номер сч[её]та|период выписки/i
  const result: ParsedOperation[] = []

  for (let i = 0; i < lines.length; i += 1) {
    let candidate = lines[i].replace(/\s+/g, ' ').trim()
    const date = candidate.match(dateRe)
    if (!date || skipRe.test(candidate)) continue

    let amounts = [...candidate.matchAll(amountRe)]
    if (!amounts.length && i + 1 < lines.length) {
      candidate = `${candidate} ${lines[i + 1].replace(/\s+/g, ' ').trim()}`
      amounts = [...candidate.matchAll(amountRe)]
    }
    if (!amounts.length && i + 2 < lines.length) {
      candidate = `${candidate} ${lines[i + 2].replace(/\s+/g, ' ').trim()}`
      amounts = [...candidate.matchAll(amountRe)]
    }
    if (!amounts.length) continue

    const signed = amounts.find(match => /^[+-]/.test(match[0].trim())) ?? amounts[0]
    const parsed = moneyMinor(signed[0])
    if (parsed === null || parsed === 0) continue

    let description = candidate
      .replace(dateRe, ' ')
      .replace(amountRe, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!description) description = 'Операция Ozon Банка'

    const explicitSign = signed[0].trim().startsWith('-') ? -1 : signed[0].trim().startsWith('+') ? 1 : null
    const sign = explicitSign ?? inferSign(description)
    const amountMinor = Math.abs(parsed) * sign
    const merchant = description.split(/[|·]/)[0]?.trim().slice(0, 120) || 'Ozon Банк'

    result.push({
      occurredAt: dateIso(date[1], date[2], date[3]),
      amountMinor,
      description: description.slice(0, 500),
      merchant,
      raw: candidate.slice(0, 1000),
    })
  }

  return result
}

async function pdfLines(file: File) {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const lines: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const text = await page.getTextContent()
    const items = (text.items as any[])
      .filter(item => typeof item?.str === 'string' && item.str.trim())
      .map(item => ({ text: String(item.str), x: Number(item.transform?.[4] ?? 0), y: Number(item.transform?.[5] ?? 0) }))
      .sort((a, b) => Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x)

    let currentY: number | null = null
    let current: string[] = []
    const flush = () => {
      if (current.length) lines.push(current.join(' ').replace(/\s+/g, ' ').trim())
      current = []
    }

    for (const item of items) {
      if (currentY === null || Math.abs(item.y - currentY) <= 2.5) {
        current.push(item.text)
        currentY = currentY === null ? item.y : currentY
      } else {
        flush()
        currentY = item.y
        current.push(item.text)
      }
    }
    flush()
  }

  return lines
}

async function statementLines(file: File) {
  if (/pdf/i.test(file.type) || file.name.toLowerCase().endsWith('.pdf')) return pdfLines(file)
  const text = await file.text()
  return text.split(/\r?\n/).map(line => line.replace(/[;\t]+/g, ' ').trim()).filter(Boolean)
}

export async function parseOzonStatement(file: File): Promise<ParsedStatement> {
  const lines = await statementLines(file)
  const text = lines.join('\n')
  return {
    operations: parseOperationLines(lines),
    openingBalanceMinor: findBalance(text, 'opening'),
    closingBalanceMinor: findBalance(text, 'closing'),
  }
}

async function digest(input: string) {
  const bytes = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
}

function filteredByStartDate(operations: ParsedOperation[], fromDate?: string | null) {
  if (!fromDate) return operations
  const start = Date.parse(`${fromDate}T00:00:00.000Z`)
  if (!Number.isFinite(start)) return operations
  return operations.filter(operation => Date.parse(operation.occurredAt) >= start)
}

function normalizedCreditMeta(meta?: OzonAccountMeta | null) {
  if (!meta) return null
  const limit = meta.creditLimitMinor == null ? null : Math.max(0, Number(meta.creditLimitMinor))
  const available = meta.creditAvailableMinor == null ? null : Math.max(0, Number(meta.creditAvailableMinor))
  const explicitDebt = meta.creditDebtMinor == null ? null : Math.max(0, Number(meta.creditDebtMinor))
  const inferredDebt = explicitDebt ?? (limit !== null && available !== null ? Math.max(limit - available, 0) : null)
  return {
    ...meta,
    creditLimitMinor: limit,
    creditAvailableMinor: available,
    creditDebtMinor: inferredDebt,
    creditMinPaymentMinor: meta.creditMinPaymentMinor == null ? null : Math.max(0, Number(meta.creditMinPaymentMinor)),
  }
}

function transactionTypeFor(accountType: string, operation: ParsedOperation) {
  if (accountType !== 'credit') return operation.amountMinor > 0 ? 'income' : 'expense'
  if (operation.amountMinor < 0) return 'expense'
  if (/возврат|кэшбэк|кешбэк|refund/i.test(operation.description)) return 'refund'
  return 'transfer'
}

export async function importOzonStatement(input: {
  workspaceId: string
  file: File
  accountName?: string
  fromDate?: string | null
  accountMeta?: OzonAccountMeta | null
}) {
  const auth = db()
  const [{ data: userData, error: userError }, { data: workspace, error: workspaceError }, parsed] = await Promise.all([
    auth.auth.getUser(),
    auth.from('workspaces').select('id,kind').eq('id', input.workspaceId).single(),
    parseOzonStatement(input.file),
  ])
  if (userError) throw userError
  if (workspaceError) throw workspaceError
  const user = userData.user
  if (!user) throw new Error('Not authenticated')

  const meta = normalizedCreditMeta(input.accountMeta)
  const operations = filteredByStartDate(parsed.operations, input.fromDate)
  if (!parsed.operations.length && !meta) {
    throw new Error('Не удалось распознать операции в выписке. Пришлите мне этот файл — подстроим парсер под формат Ozon.')
  }

  let { data: connection, error: connectionError } = await auth
    .from('bank_connections')
    .select('id,status,sync_from_at')
    .eq('workspace_id', input.workspaceId)
    .eq('provider', 'ozon_statement')
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (connectionError) throw connectionError

  const now = new Date().toISOString()
  if (!connection) {
    const externalConnectionId = `ozon-${user.id}-${input.workspaceId}`
    const created = await auth.from('bank_connections').insert({
      workspace_id: input.workspaceId,
      provider: 'ozon_statement',
      provider_connection_id: externalConnectionId,
      institution_name: 'Ozon Банк',
      status: 'active',
      connected_at: now,
      last_synced_at: now,
      sync_from_at: input.fromDate || null,
      created_by: user.id,
    }).select('id,status,sync_from_at').single()
    if (created.error) throw created.error
    connection = created.data
  }

  const isCredit = meta?.accountType === 'credit'
  const accountMask = meta?.accountMask?.replace(/\D/g, '').slice(-4) || null
  const externalAccountId = meta?.externalAccountId?.trim()
    || (accountMask ? `ozon-${accountMask}` : isCredit ? 'ozon-credit-main' : 'ozon-main')
  const detectedAccountName = meta?.accountName?.trim()
    || input.accountName?.trim()
    || (isCredit ? 'Ozon Кредитная карта' : 'Ozon Карта')

  let { data: link, error: linkError } = await auth
    .from('bank_account_links')
    .select('id,account_id')
    .eq('connection_id', connection.id)
    .eq('external_account_id', externalAccountId)
    .maybeSingle()
  if (linkError) throw linkError

  if (!link) {
    const sumOperations = operations.reduce((sum, operation) => sum + operation.amountMinor, 0)
    const openingBalance = isCredit
      ? 0
      : parsed.openingBalanceMinor ?? (parsed.closingBalanceMinor !== null ? parsed.closingBalanceMinor - sumOperations : 0)
    const accountType = isCredit ? 'credit' : workspace.kind === 'business' ? 'business' : 'bank'
    const account = await auth.from('accounts').insert({
      workspace_id: input.workspaceId,
      name: detectedAccountName,
      account_type: accountType,
      currency: 'RUB',
      opening_balance_minor: openingBalance,
      institution: 'Ozon Банк',
      credit_limit_minor: isCredit ? meta?.creditLimitMinor ?? null : null,
      credit_debt_minor: isCredit ? meta?.creditDebtMinor ?? null : null,
      credit_available_minor: isCredit ? meta?.creditAvailableMinor ?? null : null,
      credit_min_payment_minor: isCredit ? meta?.creditMinPaymentMinor ?? null : null,
      credit_payment_due_at: isCredit ? meta?.creditPaymentDueAt ?? null : null,
      created_by: user.id,
    }).select('id').single()
    if (account.error) throw account.error

    const linked = await auth.from('bank_account_links').insert({
      connection_id: connection.id,
      account_id: account.data.id,
      external_account_id: externalAccountId,
      external_name: detectedAccountName,
      account_mask: accountMask,
      currency: 'RUB',
      last_synced_at: now,
    }).select('id,account_id').single()
    if (linked.error) throw linked.error
    link = linked.data
  } else if (meta) {
    const accountPatch: Record<string, unknown> = {
      name: detectedAccountName,
      updated_at: now,
    }
    if (isCredit) {
      accountPatch.account_type = 'credit'
      accountPatch.credit_limit_minor = meta.creditLimitMinor ?? null
      accountPatch.credit_debt_minor = meta.creditDebtMinor ?? null
      accountPatch.credit_available_minor = meta.creditAvailableMinor ?? null
      accountPatch.credit_min_payment_minor = meta.creditMinPaymentMinor ?? null
      accountPatch.credit_payment_due_at = meta.creditPaymentDueAt ?? null
    }
    const { error: accountUpdateError } = await auth.from('accounts').update(accountPatch).eq('id', link.account_id)
    if (accountUpdateError) throw accountUpdateError
    const { error: linkUpdateError } = await auth.from('bank_account_links').update({
      external_name: detectedAccountName,
      account_mask: accountMask,
      last_synced_at: now,
    }).eq('id', link.id)
    if (linkUpdateError) throw linkUpdateError
  }

  const { data: linkedAccount, error: linkedAccountError } = await auth
    .from('accounts')
    .select('account_type')
    .eq('id', link.account_id)
    .single()
  if (linkedAccountError) throw linkedAccountError
  const effectiveAccountType = String(linkedAccount.account_type || 'bank')

  let imported = 0
  let duplicates = 0
  const occurrence = new Map<string, number>()

  for (const operation of operations) {
    const base = `${operation.occurredAt}|${operation.amountMinor}|${operation.description}`
    const index = (occurrence.get(base) ?? 0) + 1
    occurrence.set(base, index)
    const externalId = `ozon-${externalAccountId}-${await digest(`${base}|${index}`)}`

    const { data: exists, error: existsError } = await auth
      .from('bank_transaction_imports')
      .select('id')
      .eq('bank_account_link_id', link.id)
      .eq('external_transaction_id', externalId)
      .maybeSingle()
    if (existsError) throw existsError
    if (exists) {
      duplicates += 1
      continue
    }

    const staged = await auth.from('bank_transaction_imports').insert({
      bank_account_link_id: link.id,
      external_transaction_id: externalId,
      amount_minor: operation.amountMinor,
      currency: 'RUB',
      direction: operation.amountMinor > 0 ? 'credit' : 'debit',
      posted_at: operation.occurredAt,
      description: operation.description,
      merchant_name: operation.merchant,
      import_status: 'new',
      raw_data: {
        source: 'ozon_statement',
        row: operation.raw,
        filename: input.file.name,
        sync_from_at: input.fromDate || connection.sync_from_at || null,
        account_type: effectiveAccountType,
      },
    }).select('id').single()
    if (staged.error) throw staged.error

    const transactionType = transactionTypeFor(effectiveAccountType, operation)
    const transaction = await auth.from('transactions').insert({
      workspace_id: input.workspaceId,
      account_id: link.account_id,
      amount_minor: operation.amountMinor,
      currency: 'RUB',
      transaction_type: transactionType,
      context: workspace.kind,
      counterparty: operation.merchant,
      note: operation.description,
      occurred_at: operation.occurredAt,
      source: 'bank',
      external_id: externalId,
      status: 'posted',
      created_by: user.id,
    }).select('id').single()
    if (transaction.error) {
      await auth.from('bank_transaction_imports').update({ import_status: 'needs_review' }).eq('id', staged.data.id)
      throw transaction.error
    }

    const { error: updateImportError } = await auth.from('bank_transaction_imports').update({
      import_status: 'imported',
      matched_transaction_id: transaction.data.id,
    }).eq('id', staged.data.id)
    if (updateImportError) throw updateImportError
    imported += 1
  }

  await Promise.all([
    auth.from('bank_account_links').update({ last_synced_at: now }).eq('id', link.id),
    auth.from('bank_connections').update({
      status: 'active',
      connected_at: now,
      last_synced_at: now,
      sync_from_at: input.fromDate || connection.sync_from_at || null,
      error_message: null,
    }).eq('id', connection.id),
  ])

  return {
    imported,
    duplicates,
    total: operations.length,
    accountType: effectiveAccountType,
    accountName: detectedAccountName,
  }
}
