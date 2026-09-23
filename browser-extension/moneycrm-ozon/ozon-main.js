(() => {
  const TARGET_HOST_RE = /(^|\.)(finance\.ozon\.ru|xapi\.ozon\.ru)$/i
  const seen = new Map()

  function normalizeKey(value) {
    return String(value || '').replace(/[^a-z0-9а-яё]+/gi, '').toLowerCase()
  }

  function textValue(value) {
    if (value == null) return ''
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
  }

  function parseFormattedMoney(value) {
    const text = String(value || '').trim()
    if (!text) return null
    if (!/(₽|rub|руб|р\.)/i.test(text)) return null
    const match = text.match(/-?\d[\d\s\u00a0]*(?:[.,]\d{1,2})?/)
    if (!match) return null
    const number = Number(match[0].replace(/[\s\u00a0]/g, '').replace(',', '.'))
    return Number.isFinite(number) ? Math.round(number * 100) : null
  }

  function moneyMinor(value, keyHint = '') {
    if (value == null) return null
    const key = normalizeKey(keyHint)

    if (typeof value === 'string') {
      const formatted = parseFormattedMoney(value)
      if (formatted !== null) return formatted
      if (/minor|kope|коп/i.test(key) && /^-?\d+$/.test(value.trim())) return Number(value.trim())
      if (/amount|balance|limit|debt|available|fund/i.test(key) && /^-?\d+[.,]\d{1,2}$/.test(value.trim())) {
        const n = Number(value.trim().replace(',', '.'))
        return Number.isFinite(n) ? Math.round(n * 100) : null
      }
      return null
    }

    if (typeof value === 'number') {
      if (/minor|kope|коп/i.test(key) && Number.isFinite(value)) return Math.round(value)
      return null
    }

    if (typeof value !== 'object') return null

    const obj = value
    if ('units' in obj && (typeof obj.units === 'number' || typeof obj.units === 'string')) {
      const units = Number(obj.units)
      const nanos = Number(obj.nanos || 0)
      if (Number.isFinite(units) && Number.isFinite(nanos)) return Math.round(units * 100 + nanos / 1e7)
    }

    for (const [k, v] of Object.entries(obj)) {
      const formatted = parseFormattedMoney(v)
      if (formatted !== null) return formatted
      if (/minor|kope|коп/i.test(normalizeKey(k)) && (typeof v === 'number' || /^-?\d+$/.test(String(v)))) {
        const n = Number(v)
        if (Number.isFinite(n)) return Math.round(n)
      }
    }

    for (const candidateKey of ['amount', 'value', 'sum']) {
      if (!(candidateKey in obj)) continue
      const raw = obj[candidateKey]
      if (typeof raw === 'string' && /^-?\d+[.,]\d{1,2}$/.test(raw.trim())) {
        const n = Number(raw.trim().replace(',', '.'))
        if (Number.isFinite(n)) return Math.round(n * 100)
      }
    }

    return null
  }

  function flattenObject(obj, maxDepth = 3) {
    const result = []
    const visit = (value, path, depth) => {
      if (depth > maxDepth || value == null) return
      if (typeof value !== 'object') {
        result.push({ path, key: path.split('.').pop() || '', value })
        return
      }
      if (Array.isArray(value)) return
      for (const [key, child] of Object.entries(value)) {
        const nextPath = path ? `${path}.${key}` : key
        if (child != null && typeof child === 'object' && !Array.isArray(child)) visit(child, nextPath, depth + 1)
        else result.push({ path: nextPath, key, value: child })
      }
    }
    visit(obj, '', 0)
    return result
  }

  function findField(entries, patterns) {
    for (const pattern of patterns) {
      const entry = entries.find(item => pattern.test(normalizeKey(item.key)) || pattern.test(normalizeKey(item.path)))
      if (entry) return entry
    }
    return null
  }

  function findText(entries, patterns) {
    const entry = findField(entries, patterns)
    return entry ? textValue(entry.value).trim() : ''
  }

  function last4(value) {
    const digits = String(value || '').replace(/\D/g, '')
    return digits.length >= 4 ? digits.slice(-4) : null
  }

  function candidateFromObject(obj, sourceUrl) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    const entries = flattenObject(obj)
    if (!entries.length) return null

    const joinedKeys = entries.map(item => normalizeKey(item.path)).join('|')
    const joinedValues = entries.map(item => textValue(item.value).toLowerCase()).join('|')
    const hasAccountShape = /(account|card|contract|product|сч|карт)/i.test(joinedKeys + '|' + joinedValues)
    const hasFinanceShape = /(balance|fund|limit|debt|available|остат|баланс|лимит|задолж)/i.test(joinedKeys)
    if (!hasAccountShape || !hasFinanceShape) return null

    const accountId = findText(entries, [
      /^accountid$/i, /^cardid$/i, /^contractid$/i, /^productid$/i, /^walletid$/i,
      /account.*id/i, /card.*id/i, /contract.*id/i, /product.*id/i,
    ])

    const maskField = findField(entries, [/maskedpan/i, /maskedcard/i, /cardmask/i, /last4/i, /^pan$/i, /cardnumber/i, /maskednumber/i])
    const mask = maskField ? last4(maskField.value) : null
    if (!accountId && !mask) return null

    const name = findText(entries, [/accountname/i, /cardname/i, /productname/i, /^title$/i, /^name$/i, /description/i]) || 'Ozon счёт'
    const typeText = `${findText(entries, [/accounttype/i, /cardtype/i, /producttype/i, /^type$/i])} ${joinedValues}`.toLowerCase()
    const isCredit = /credit|кредит/i.test(typeText) || /creditlimit|debt|задолж/i.test(joinedKeys)

    const balanceEntry = findField(entries, [/ownfund/i, /ownmoney/i, /currentbalance/i, /^balance$/i, /accountbalance/i, /availablebalance/i, /остаток/i, /баланс/i])
    const creditLimitEntry = findField(entries, [/creditlimit/i, /^limit$/i, /общ.*лимит/i])
    const debtEntry = findField(entries, [/currentdebt/i, /^debt$/i, /usedlimit/i, /задолж/i])
    const availableEntry = findField(entries, [/availablelimit/i, /creditavailable/i, /доступ.*лимит/i])

    const currentBalanceMinor = !isCredit && balanceEntry ? moneyMinor(balanceEntry.value, balanceEntry.path) : null
    const creditLimitMinor = isCredit && creditLimitEntry ? moneyMinor(creditLimitEntry.value, creditLimitEntry.path) : null
    const creditDebtMinor = isCredit && debtEntry ? moneyMinor(debtEntry.value, debtEntry.path) : null
    const creditAvailableMinor = isCredit && availableEntry ? moneyMinor(availableEntry.value, availableEntry.path) : null

    const externalAccountId = accountId ? `ozon-api-${accountId}` : `ozon-${mask}`
    return {
      apiVerified: true,
      accountType: isCredit ? 'credit' : 'bank',
      accountName: name.slice(0, 120),
      accountMask: mask,
      externalAccountId,
      currentBalanceMinor,
      creditLimitMinor: creditLimitMinor == null ? null : Math.abs(creditLimitMinor),
      creditDebtMinor: creditDebtMinor == null ? null : Math.abs(creditDebtMinor),
      creditAvailableMinor: creditAvailableMinor == null ? null : Math.abs(creditAvailableMinor),
      sourceUrl,
    }
  }

  function mergeCandidate(candidate) {
    const key = candidate.externalAccountId || candidate.accountMask
    if (!key) return
    const previous = seen.get(key) || {}
    const merged = { ...previous }
    for (const [field, value] of Object.entries(candidate)) {
      if (value !== null && value !== undefined && value !== '') merged[field] = value
    }
    seen.set(key, merged)
  }

  function scanPayload(payload, sourceUrl) {
    let visited = 0
    const walk = value => {
      if (++visited > 30000 || value == null || typeof value !== 'object') return
      if (Array.isArray(value)) {
        for (const item of value) walk(item)
        return
      }
      const candidate = candidateFromObject(value, sourceUrl)
      if (candidate) mergeCandidate(candidate)
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') walk(child)
      }
    }
    walk(payload)
    if (seen.size) {
      window.postMessage({
        type: 'MONEYCRM_OZON_API_ACCOUNTS',
        accounts: [...seen.values()].map(({ sourceUrl: _sourceUrl, ...account }) => account),
      }, location.origin)
    }
  }

  function relevantUrl(raw) {
    try {
      const url = new URL(String(raw || ''), location.href)
      return TARGET_HOST_RE.test(url.hostname)
    } catch {
      return false
    }
  }

  const originalFetch = window.fetch
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args)
    const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url
    if (relevantUrl(requestUrl)) {
      response.clone().json().then(payload => scanPayload(payload, String(requestUrl))).catch(() => {})
    }
    return response
  }

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__moneycrmUrl = url
    return originalOpen.call(this, method, url, ...rest)
  }
  XMLHttpRequest.prototype.send = function (...args) {
    if (relevantUrl(this.__moneycrmUrl)) {
      this.addEventListener('load', () => {
        try {
          const payload = this.responseType === 'json' ? this.response : JSON.parse(this.responseText)
          scanPayload(payload, String(this.__moneycrmUrl || ''))
        } catch {}
      }, { once: true })
    }
    return originalSend.apply(this, args)
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return
    if (event.data?.type !== 'MONEYCRM_OZON_API_ACCOUNTS_REQUEST') return
    window.postMessage({
      type: 'MONEYCRM_OZON_API_ACCOUNTS',
      accounts: [...seen.values()].map(({ sourceUrl: _sourceUrl, ...account }) => account),
    }, location.origin)
  })
})()
