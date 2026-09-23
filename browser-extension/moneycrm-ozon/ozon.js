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
    const expression = new RegExp(`${escaped}[^\\d]{0,45}(\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?)\\s*(?:₽|руб\\.?|р\\.?)`, 'i')
    const match = text.match(expression)
    if (match) {
      const parsed = amountMinor(match[1])
      if (parsed !== null) return parsed
    }
  }
  return null
}

function extractAccountMeta(text) {
  const body = normalize(text)
  const creditLimitMinor = labeledAmount(body, ['кредитный лимит', 'лимит по карте', 'общий лимит'])
  const explicitDebtMinor = labeledAmount(body, ['текущая задолженность', 'задолженность по карте', 'задолженность', 'использовано'])
  const creditAvailableMinor = labeledAmount(body, ['доступный лимит', 'доступно по карте', 'доступно'])
  const creditMinPaymentMinor = labeledAmount(body, ['минимальный платёж', 'обязательный платёж', 'платёж по кредиту'])
  const isCredit = creditLimitMinor !== null || explicitDebtMinor !== null
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

  return {
    accountType: isCredit ? 'credit' : 'bank',
    accountName: isCredit ? 'Ozon Кредитная карта' : 'Ozon Карта',
    accountMask: mask,
    externalAccountId: mask ? `ozon-${mask}` : isCredit ? 'ozon-credit-main' : 'ozon-main',
    creditLimitMinor: isCredit ? creditLimitMinor : null,
    creditDebtMinor: isCredit ? creditDebtMinor : null,
    creditAvailableMinor: isCredit ? creditAvailableMinor : null,
    creditMinPaymentMinor: isCredit ? creditMinPaymentMinor : null,
    creditPaymentDueAt: isCredit ? creditPaymentDueAt : null,
  }
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

  const allPageText = snapshots.join('\n')
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
    accountMeta: extractAccountMeta(allPageText),
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
      sendResponse({
        status: 'needs_navigation',
        message: 'Не нашла историю операций автоматически. В открывшемся Ozon Банке перейдите в историю операций и затем нажмите синхронизацию в MoneyCRM ещё раз.',
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
