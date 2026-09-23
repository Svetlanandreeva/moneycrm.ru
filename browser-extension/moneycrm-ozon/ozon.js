const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

function looksLikeLogin() {
  const href = location.href.toLowerCase()
  if (/auth|signin|login/.test(href)) return true
  const text = normalize(document.body?.innerText).toLowerCase()
  return /войти/.test(text) && /(код-парол|номер телефон|получить код|продолжить)/.test(text)
}

function findOperationsControl() {
  const labels = ['все операции', 'история операций', 'операции', 'история']
  const nodes = [...document.querySelectorAll('a,button,[role="button"]')]
    .filter(isVisible)
    .map(element => ({ element, text: normalize(element.textContent).toLowerCase() }))

  for (const label of labels) {
    const match = nodes.find(item => item.text === label || item.text.includes(label))
    if (match) return match.element
  }
  return null
}

function amountMinor(value) {
  const clean = String(value || '')
    .replace(/[₽рRUBуб.]/gi, '')
    .replace(/[\s\u00a0]/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const number = Number(clean)
  return Number.isFinite(number) ? Math.round(Math.abs(number) * 100) : null
}

function labeledAmount(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const expression = new RegExp(`${escaped}[^\\d]{0,45}(-?\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?)\\s*(?:₽|руб\\.?|р\\.?)`, 'i')
    const match = text.match(expression)
    if (match) {
      const parsed = amountMinor(match[1])
      if (parsed !== null) return match[1].trim().startsWith('-') ? -parsed : parsed
    }
  }
  return null
}

function firstOwnBalance(text) {
  const labeled = labeledAmount(text, ['текущий баланс', 'баланс', 'собственные средства', 'остаток', 'на счёте', 'на карте'])
  if (labeled !== null) return labeled

  const lines = String(text || '').split(/\r?\n/).map(normalize).filter(Boolean)
  const amountRe = /(-?\d[\d\s\u00a0]*(?:[.,]\d{1,2})?)\s*(?:₽|руб\.?|р\.?)/i
  for (const line of lines) {
    if (/лимит|задолж|доступн|минимальн|обязательн|плат[её]ж/i.test(line)) continue
    const match = line.match(amountRe)
    if (!match) continue
    const parsed = amountMinor(match[1])
    if (parsed !== null) return match[1].trim().startsWith('-') ? -parsed : parsed
  }
  return null
}

function accountNameFromText(text, isCredit) {
  if (isCredit) return 'Ozon Кредитная карта'
  const lines = String(text || '').split(/\r?\n/).map(normalize).filter(Boolean)
  const preferred = lines.find(line =>
    line.length <= 80 &&
    !/[₽]/.test(line) &&
    /(ozon\s*карта|накопительн\w*\s+сч[её]т|сч[её]т|карта)/i.test(line) &&
    !/операц|пополн|перев|оплат/i.test(line)
  )
  if (preferred) return preferred.replace(/(?:[•*]{2,}|\*{2,})\s*\d{4}.*/i, '').trim() || 'Ozon Карта'
  return 'Ozon Карта'
}

function extractAccountMeta(text) {
  const body = normalize(text)
  const creditLimitMinor = labeledAmount(body, ['кредитный лимит', 'лимит по карте', 'общий лимит'])
  const explicitDebtMinor = labeledAmount(body, ['текущая задолженность', 'задолженность по карте', 'задолженность', 'использовано'])
  const creditAvailableMinor = labeledAmount(body, ['доступный лимит', 'доступно по карте', 'доступно'])
  const creditMinPaymentMinor = labeledAmount(body, ['минимальный платёж', 'обязательный платёж', 'платёж по кредиту'])
  const hasCreditCardLabel = /кредитн\w*\s+карт/i.test(body)
  const isCredit = hasCreditCardLabel || (creditLimitMinor !== null && (explicitDebtMinor !== null || creditAvailableMinor !== null))
  const creditDebtMinor = explicitDebtMinor ?? (
    isCredit && creditLimitMinor !== null && creditAvailableMinor !== null
      ? Math.max(creditLimitMinor - creditAvailableMinor, 0)
      : null
  )

  const mask = body.match(/(?:[•*]{2,}|\*{2,})\s*(\d{4})\b/)?.[1] ?? null
  const dueDate = body.match(/(?:оплатить до|внести до|плат[её]ж до)\s*(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/i)
  let creditPaymentDueAt = null
  if (dueDate) {
    const now = new Date()
    let year = dueDate[3] ? Number(dueDate[3]) : now.getFullYear()
    if (year < 100) year += 2000
    const candidate = new Date(Date.UTC(year, Number(dueDate[2]) - 1, Number(dueDate[1]), 12, 0, 0))
    if (!dueDate[3] && candidate.getTime() < now.getTime() - 40 * 86400000) candidate.setUTCFullYear(year + 1)
    creditPaymentDueAt = candidate.toISOString().slice(0, 10)
  }

  const currentBalanceMinor = isCredit ? null : firstOwnBalance(String(text || ''))
  const accountName = accountNameFromText(String(text || ''), isCredit)

  return {
    accountType: isCredit ? 'credit' : 'bank',
    accountName,
    accountMask: mask,
    externalAccountId: mask ? `ozon-${mask}` : isCredit ? 'ozon-credit-main' : 'ozon-main',
    currentBalanceMinor,
    creditLimitMinor: isCredit ? Math.abs(creditLimitMinor ?? 0) || null : null,
    creditDebtMinor: isCredit ? Math.abs(creditDebtMinor ?? 0) || 0 : null,
    creditAvailableMinor: isCredit ? Math.abs(creditAvailableMinor ?? 0) || null : null,
    creditMinPaymentMinor: isCredit ? Math.abs(creditMinPaymentMinor ?? 0) || null : null,
    creditPaymentDueAt: isCredit ? creditPaymentDueAt : null,
  }
}

function fallbackExternalId(meta, index) {
  if (meta.accountMask) return `ozon-${meta.accountMask}`
  const slug = normalize(meta.accountName || (meta.accountType === 'credit' ? 'credit' : 'account'))
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'account'
  return `ozon-${slug}-${index + 1}`
}

function discoverAccounts() {
  const nodes = [...document.querySelectorAll('a,button,[role="button"],[tabindex]')]
    .filter(isVisible)
  const candidates = []

  for (const element of nodes) {
    const raw = String(element.innerText || element.textContent || '')
    const text = normalize(raw)
    if (text.length < 4 || text.length > 420) continue
    if (!/(₽|руб\.?|р\.?)/i.test(text)) continue
    if (!/(карт|сч[её]т|ozon|накоп|[•*]{2,}\s*\d{4})/i.test(text)) continue
    if (/все операции|история операций|пополнить|перевести|оплатить|кэшбэк/i.test(text) && text.length < 90) continue

    const meta = extractAccountMeta(raw)
    const index = candidates.length
    if (!meta.accountMask) meta.externalAccountId = fallbackExternalId(meta, index)
    candidates.push({ meta, richness: text.length })
  }

  const byKey = new Map()
  for (const candidate of candidates) {
    const key = candidate.meta.externalAccountId || `${candidate.meta.accountName}|${candidate.meta.accountType}`
    const previous = byKey.get(key)
    if (!previous || candidate.richness < previous.richness) byKey.set(key, candidate)
  }

  return [...byKey.values()].map(item => item.meta).slice(0, 12)
}

function extractFinancialLines(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean)

  const amountRe = /(?:^|\s)[+-]?\s*\d[\d\s\u00a0]*(?:[.,]\d{2})?\s*(?:₽|руб\.?|RUB)(?:\s|$)/i
  const dateRe = /\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b|\b(?:сегодня|вчера)\b/i
  const interesting = new Set()

  for (let index = 0; index < lines.length; index += 1) {
    if (!amountRe.test(lines[index]) && !dateRe.test(lines[index])) continue
    for (let offset = -3; offset <= 3; offset += 1) {
      const candidate = index + offset
      if (candidate >= 0 && candidate < lines.length) interesting.add(candidate)
    }
  }

  return [...interesting]
    .sort((a, b) => a - b)
    .map(index => lines[index])
}

function scrollStepsFor(fromDate) {
  if (!fromDate) return 18
  const start = Date.parse(`${fromDate}T00:00:00`)
  if (!Number.isFinite(start)) return 18
  const days = Math.max(0, Math.ceil((Date.now() - start) / 86400000))
  return Math.min(90, Math.max(18, 12 + Math.ceil(days / 10)))
}

async function collectPageText(fromDate) {
  const snapshots = []
  const initialText = document.body?.innerText || ''
  const discoveredAccounts = discoverAccounts()
  const control = findOperationsControl()
  if (control) {
    control.click()
    await sleep(1300)
  }

  const originalY = window.scrollY
  const maxSteps = scrollStepsFor(fromDate)
  let previousHeight = 0
  let stagnantRounds = 0
  for (let step = 0; step < maxSteps; step += 1) {
    snapshots.push(document.body?.innerText || '')
    const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0)
    window.scrollTo({ top: height, behavior: 'auto' })
    await sleep(450)
    const nextHeight = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0)
    if (step > 2 && nextHeight <= previousHeight + 2) stagnantRounds += 1
    else stagnantRounds = 0
    if (stagnantRounds >= 3) break
    previousHeight = nextHeight
  }
  snapshots.push(document.body?.innerText || '')
  window.scrollTo({ top: originalY, behavior: 'auto' })

  const detailText = snapshots.join('\n')
  const detailMeta = extractAccountMeta(detailText || initialText)
  const match = discoveredAccounts.find(account =>
    (detailMeta.accountMask && account.accountMask === detailMeta.accountMask) ||
    account.externalAccountId === detailMeta.externalAccountId
  )
  if (match) {
    detailMeta.currentBalanceMinor = match.currentBalanceMinor
    detailMeta.accountName = match.accountName || detailMeta.accountName
    detailMeta.externalAccountId = match.externalAccountId || detailMeta.externalAccountId
  }

  if (!discoveredAccounts.some(account => account.externalAccountId === detailMeta.externalAccountId)) {
    discoveredAccounts.push(detailMeta)
  }

  const allLines = snapshots.flatMap(extractFinancialLines)
  const unique = []
  const seen = new Set()
  for (const line of allLines) {
    const key = normalize(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(key)
  }

  return {
    text: unique.join('\n'),
    accountMeta: {
      ...detailMeta,
      accounts: discoveredAccounts,
    },
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'moneycrm:ozon-collect') return false

  ;(async () => {
    if (looksLikeLogin()) {
      sendResponse({
        status: 'login_required',
        message: 'Войдите в официальный кабинет Ozon Банка. MoneyCRM не получает ваш логин, код-пароль или SMS-коды.',
      })
      return
    }

    const collected = await collectPageText(message.fromDate || null)
    if (!collected.text || collected.text.length < 20) {
      const accounts = collected.accountMeta?.accounts || []
      if (accounts.length) {
        sendResponse({
          status: 'ok',
          text: '',
          accountMeta: collected.accountMeta,
          fromDate: message.fromDate || null,
          pageUrl: location.href,
          pageTitle: document.title,
        })
        return
      }
      sendResponse({
        status: 'needs_navigation',
        message: 'Не нашла счета или историю операций автоматически. Откройте главную страницу Ozon Банка и повторите синхронизацию.',
      })
      return
    }

    sendResponse({
      status: 'ok',
      text: collected.text,
      accountMeta: collected.accountMeta,
      fromDate: message.fromDate || null,
      pageUrl: location.href,
      pageTitle: document.title,
    })
  })().catch(error => {
    sendResponse({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  })

  return true
})
