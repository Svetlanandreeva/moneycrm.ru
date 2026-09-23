import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from './supabase'

GlobalWorkerOptions.workerSrc = pdfWorker

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
  const operations = parseOperationLines(lines)
  if (!operations.length) {
    throw new Error('Не удалось распознать операции в выписке. Пришлите мне этот файл — подстроим парсер под формат Ozon.')
  }
  return {
    operations,
    openingBalanceMinor: findBalance(text, 'opening'),
    closingBalanceMinor: findBalance(text, 'closing'),
  }
}

async function digest(input: string) {
  const bytes = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
}

export async function importOzonStatement(input: { workspaceId: string; file: File; accountName?: string }) {
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

  let { data: connection, error: connectionError } = await auth
    .from('bank_connections')
    .select('id,status')
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
      created_by: user.id,
    }).select('id,status').single()
    if (created.error) throw created.error
    connection = created.data
  }

  let { data: link, error: linkError } = await auth
    .from('bank_account_links')
    .select('id,account_id')
    .eq('connection_id', connection.id)
    .eq('external_account_id', 'ozon-main')
    .maybeSingle()
  if (linkError) throw linkError

  if (!link) {
    const sumOperations = parsed.operations.reduce((sum, operation) => sum + operation.amountMinor, 0)
    const openingBalance = parsed.openingBalanceMinor
      ?? (parsed.closingBalanceMinor !== null ? parsed.closingBalanceMinor - sumOperations : 0)
    const accountType = workspace.kind === 'business' ? 'business' : 'bank'
    const account = await auth.from('accounts').insert({
      workspace_id: input.workspaceId,
      name: input.accountName?.trim() || 'Ozon Карта',
      account_type: accountType,
      currency: 'RUB',
      opening_balance_minor: openingBalance,
      institution: 'Ozon Банк',
      created_by: user.id,
    }).select('id').single()
    if (account.error) throw account.error

    const linked = await auth.from('bank_account_links').insert({
      connection_id: connection.id,
      account_id: account.data.id,
      external_account_id: 'ozon-main',
      external_name: input.accountName?.trim() || 'Ozon Карта',
      account_mask: null,
      currency: 'RUB',
      last_synced_at: now,
    }).select('id,account_id').single()
    if (linked.error) throw linked.error
    link = linked.data
  }

  let imported = 0
  let duplicates = 0
  const occurrence = new Map<string, number>()

  for (const operation of parsed.operations) {
    const base = `${operation.occurredAt}|${operation.amountMinor}|${operation.description}`
    const index = (occurrence.get(base) ?? 0) + 1
    occurrence.set(base, index)
    const externalId = `ozon-${await digest(`${base}|${index}`)}`

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
      raw_data: { source: 'ozon_statement', row: operation.raw, filename: input.file.name },
    }).select('id').single()
    if (staged.error) throw staged.error

    const transaction = await auth.from('transactions').insert({
      workspace_id: input.workspaceId,
      account_id: link.account_id,
      amount_minor: operation.amountMinor,
      currency: 'RUB',
      transaction_type: operation.amountMinor > 0 ? 'income' : 'expense',
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
    auth.from('bank_connections').update({ status: 'active', connected_at: now, last_synced_at: now, error_message: null }).eq('id', connection.id),
  ])

  return { imported, duplicates, total: parsed.operations.length }
}
