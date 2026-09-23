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

async function collectPageText() {
  const snapshots = []
  const control = findOperationsControl()
  if (control) {
    control.click()
    await sleep(1300)
  }

  const originalY = window.scrollY
  let previousHeight = 0
  for (let step = 0; step < 12; step += 1) {
    snapshots.push(document.body?.innerText || '')
    const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0)
    window.scrollTo({ top: height, behavior: 'auto' })
    await sleep(400)
    const nextHeight = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0)
    if (step > 2 && nextHeight === previousHeight) break
    previousHeight = nextHeight
  }
  snapshots.push(document.body?.innerText || '')
  window.scrollTo({ top: originalY, behavior: 'auto' })

  const allLines = snapshots.flatMap(extractFinancialLines)
  const unique = []
  const seen = new Set()
  for (const line of allLines) {
    const key = normalize(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(key)
  }
  return unique.join('\n')
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

    const text = await collectPageText()
    if (!text || text.length < 20) {
      sendResponse({
        status: 'needs_navigation',
        message: 'Не нашла историю операций автоматически. В открывшемся Ozon Банке перейдите в историю операций и затем нажмите синхронизацию в MoneyCRM ещё раз.',
      })
      return
    }

    sendResponse({
      status: 'ok',
      text,
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
