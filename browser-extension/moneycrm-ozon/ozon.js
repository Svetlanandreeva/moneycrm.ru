const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const apiAccounts = new Map()
let apiDiagnostics = { payloadCount: 0, identityCount: 0, financialCount: 0 }

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

function mergeApiAccounts(accounts) {
  if (!Array.isArray(accounts)) return
  for (const account of accounts) {
    if (!account || account.apiVerified !== true) continue
    const key = account.externalAccountId || account.accountMask
    if (!key) continue
    const previous = apiAccounts.get(key) || {}
    const merged = { ...previous }
    for (const [field, value] of Object.entries(account)) {
      if (value !== null && value !== undefined && value !== '') merged[field] = value
    }
    merged.apiVerified = true
    apiAccounts.set(key, merged)
  }
}

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin) return
  if (event.data?.type !== 'MONEYCRM_OZON_API_ACCOUNTS') return
  mergeApiAccounts(event.data.accounts)
  if (event.data.diagnostics && typeof event.data.diagnostics === 'object') {
    apiDiagnostics = { ...apiDiagnostics, ...event.data.diagnostics }
  }
})

function requestApiAccounts() {
  window.postMessage({ type: 'MONEYCRM_OZON_API_ACCOUNTS_REQUEST' }, location.origin)
}

async function waitForApiAccounts(timeoutMs = 4500) {
  requestApiAccounts()
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (apiAccounts.size) {
      await sleep(250)
      requestApiAccounts()
      return [...apiAccounts.values()]
    }
    await sleep(150)
    requestApiAccounts()
  }
  return [...apiAccounts.values()]
}

function hasFinancialData(account) {
  if (!account || account.apiVerified !== true) return false
  if (account.hasFinancialData === true) return true
  return [account.currentBalanceMinor, account.creditLimitMinor, account.creditDebtMinor, account.creditAvailableMinor, account.creditMinPaymentMinor]
    .some(value => value !== null && value !== undefined)
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

function extractFinancialLines(text) {
  const lines = String(text || '').split(/\r?\n/).map(normalize).filter(Boolean)
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
  return [...interesting].sort((a, b) => a - b).map(index => lines[index])
}

function scrollStepsFor(fromDate) {
  if (!fromDate) return 16
  const start = Date.parse(`${fromDate}T00:00:00`)
  if (!Number.isFinite(start)) return 16
  const days = Math.max(0, Math.ceil((Date.now() - start) / 86400000))
  return Math.min(70, Math.max(16, 10 + Math.ceil(days / 12)))
}

function masksOnPage() {
  const text = String(document.body?.innerText || '')
  return [...new Set([...text.matchAll(/(?:[•*]{2,}|\*{2,})\s*(\d{4})\b/g)].map(match => match[1]))]
}

async function collectOperationText(fromDate) {
  const snapshots = []
  const control = findOperationsControl()
  if (control) {
    control.click()
    await sleep(1200)
  }
  const originalY = window.scrollY
  const maxSteps = scrollStepsFor(fromDate)
  let previousHeight = 0
  let stagnantRounds = 0
  for (let step = 0; step < maxSteps; step += 1) {
    snapshots.push(document.body?.innerText || '')
    const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0)
    window.scrollTo({ top: height, behavior: 'auto' })
    await sleep(400)
    const nextHeight = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0)
    if (step > 2 && nextHeight <= previousHeight + 2) stagnantRounds += 1
    else stagnantRounds = 0
    if (stagnantRounds >= 3) break
    previousHeight = nextHeight
  }
  snapshots.push(document.body?.innerText || '')
  window.scrollTo({ top: originalY, behavior: 'auto' })
  const unique = []
  const seen = new Set()
  for (const line of snapshots.flatMap(extractFinancialLines)) {
    const key = normalize(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(key)
  }
  return unique.join('\n')
}

function currentVerifiedAccount(accounts) {
  if (accounts.length === 1) return accounts[0]
  const masks = masksOnPage()
  const matches = accounts.filter(account => account.accountMask && masks.includes(account.accountMask))
  return matches.length === 1 ? matches[0] : null
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'moneycrm:ozon-collect') return false
  ;(async () => {
    if (looksLikeLogin()) {
      sendResponse({ status: 'login_required', message: 'Войдите в официальный кабинет Ozon Банка. MoneyCRM не получает ваш логин, код-пароль или SMS-коды.' })
      return
    }

    const allAccounts = await waitForApiAccounts()
    if (!allAccounts.length) {
      sendResponse({ status: 'needs_api_refresh', message: 'Кабинет Ozon открыт, но ответы со счетами ещё не пойманы. MoneyCRM перезагрузит вкладку Ozon и попробует ещё раз.', diagnostics: apiDiagnostics })
      return
    }

    const financialAccounts = allAccounts.filter(hasFinancialData)
    if (!financialAccounts.length) {
      sendResponse({
        status: 'needs_balance_refresh',
        message: 'Карты Ozon найдены, но ответ с балансами ещё не пришёл. MoneyCRM откроет главную Ozon Банка и повторит синхронизацию автоматически.',
        diagnostics: { ...apiDiagnostics, identityCount: allAccounts.length, financialCount: 0 },
      })
      return
    }

    const text = await collectOperationText(message.fromDate || null)
    const current = currentVerifiedAccount(financialAccounts)
    sendResponse({
      status: 'ok',
      text: text || 'Ozon API sync',
      accountMeta: current ? { ...current, accounts: financialAccounts } : { accounts: financialAccounts },
      fromDate: message.fromDate || null,
      pageUrl: location.href,
      pageTitle: document.title,
      diagnostics: { ...apiDiagnostics, identityCount: allAccounts.length, financialCount: financialAccounts.length },
    })
  })().catch(error => sendResponse({ status: 'error', message: error instanceof Error ? error.message : String(error) }))
  return true
})
