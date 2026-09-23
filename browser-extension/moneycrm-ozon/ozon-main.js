(() => {
  const TARGET_HOST_RE = /(^|\.)(finance\.ozon\.ru|xapi\.ozon\.ru)$/i
  const seen = new Map()
  const aliasToKey = new Map()
  let payloadCount = 0

  const normalizeKey = value => String(value || '').replace(/[^a-z0-9а-яё]+/gi, '').toLowerCase()
  const textValue = value => (value == null ? '' : ['string','number','boolean'].includes(typeof value) ? String(value) : '')
  const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

  function safeId(value) {
    const text = String(value ?? '').trim()
    if (!text || text.length < 8 || text.length > 160) return null
    if (!/[a-z]/i.test(text) && /^\d+$/.test(text) && text.length < 12) return null
    return /^[a-z0-9:_-]+$/i.test(text) ? text : null
  }

  function last4(value) {
    const digits = String(value || '').replace(/\D/g, '')
    return digits.length >= 4 ? digits.slice(-4) : null
  }

  function parseFormattedMoney(value) {
    const text = String(value || '').trim()
    if (!text || !/(₽|rub|руб|р\.)/i.test(text)) return null
    const match = text.match(/-?\d[\d\s\u00a0]*(?:[.,]\d{1,2})?/)
    if (!match) return null
    const number = Number(match[0].replace(/[\s\u00a0]/g, '').replace(',', '.'))
    return Number.isFinite(number) ? Math.round(number * 100) : null
  }

  function moneyMinor(value, keyHint = '', parent = null) {
    if (value == null) return null
    const key = normalizeKey(keyHint)

    if (isObject(value)) {
      const obj = value
      if ('units' in obj && (typeof obj.units === 'number' || typeof obj.units === 'string')) {
        const units = Number(obj.units)
        const nanos = Number(obj.nanos || 0)
        if (Number.isFinite(units) && Number.isFinite(nanos)) return Math.round(units * 100 + nanos / 1e7)
      }
      const minorKeys = ['minor','minorUnits','minorValue','kopecks','kopeks','cents','amountMinor','valueMinor']
      for (const mk of minorKeys) {
        if (!(mk in obj)) continue
        const n = Number(obj[mk])
        if (Number.isFinite(n)) return Math.round(n)
      }
      for (const [k, v] of Object.entries(obj)) {
        const formatted = parseFormattedMoney(v)
        if (formatted !== null) return formatted
        if (/minor|kope|коп|cent/i.test(normalizeKey(k))) {
          const n = Number(v)
          if (Number.isFinite(n)) return Math.round(n)
        }
      }
      for (const candidateKey of ['amount','value','sum','balance']) {
        if (!(candidateKey in obj)) continue
        const parsed = moneyMinor(obj[candidateKey], `${keyHint}.${candidateKey}`, obj)
        if (parsed !== null) return parsed
      }
      return null
    }

    if (typeof value === 'string') {
      const formatted = parseFormattedMoney(value)
      if (formatted !== null) return formatted
      const raw = value.trim().replace(',', '.')
      if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null
      const n = Number(raw)
      if (!Number.isFinite(n)) return null
      if (/minor|kope|коп|cent/i.test(key)) return Math.round(n)
      if (/rub|ruble|руб|major|unit/i.test(key)) return Math.round(n * 100)
      if (!Number.isInteger(n)) return Math.round(n * 100)
      if (/(balance|fund|amount|money|limit|debt|available|остат|баланс|лимит|задолж)/i.test(key)) return Math.round(n)
      return null
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null
      if (/minor|kope|коп|cent/i.test(key)) return Math.round(value)
      if (/rub|ruble|руб|major|unit/i.test(key)) return Math.round(value * 100)
      if (!Number.isInteger(value)) return Math.round(value * 100)
      if (/(balance|fund|amount|money|limit|debt|available|остат|баланс|лимит|задолж)/i.test(key)) return Math.round(value)
    }
    return null
  }

  function flattenObject(obj, maxDepth = 5) {
    const result = []
    const visit = (value, path, depth, parent) => {
      if (depth > maxDepth || value == null) return
      if (Array.isArray(value)) {
        value.slice(0, 30).forEach((child, index) => visit(child, `${path}[${index}]`, depth + 1, value))
        return
      }
      if (!isObject(value)) {
        result.push({ path, key: path.split('.').pop() || '', value, parent })
        return
      }
      for (const [key, child] of Object.entries(value)) {
        const nextPath = path ? `${path}.${key}` : key
        if (child != null && (isObject(child) || Array.isArray(child))) visit(child, nextPath, depth + 1, value)
        else result.push({ path: nextPath, key, value: child, parent: value })
      }
    }
    visit(obj, '', 0, null)
    return result
  }

  function findField(entries, patterns, excludes = []) {
    for (const pattern of patterns) {
      const entry = entries.find(item => {
        const key = normalizeKey(item.key)
        const path = normalizeKey(item.path)
        if (excludes.some(ex => ex.test(key) || ex.test(path))) return false
        return pattern.test(key) || pattern.test(path)
      })
      if (entry) return entry
    }
    return null
  }

  function findText(entries, patterns) {
    const entry = findField(entries, patterns)
    return entry ? textValue(entry.value).trim() : ''
  }

  function identityFromObject(obj) {
    if (!isObject(obj)) return null
    const entries = flattenObject(obj, 4)
    if (!entries.length) return null

    const accountIdRaw = findText(entries, [/^accountid$/i, /bankaccountid/i, /account.*id/i, /^contractid$/i, /contract.*id/i, /^walletid$/i, /wallet.*id/i])
    const cardIdRaw = findText(entries, [/^cardid$/i, /card.*id/i])
    const accountId = safeId(accountIdRaw)
    const cardId = safeId(cardIdRaw)
    const maskEntry = findField(entries, [/maskedpan/i, /maskedcard/i, /cardmask/i, /last4/i, /maskednumber/i, /panmask/i])
    const mask = maskEntry ? last4(maskEntry.value) : null
    const name = findText(entries, [/accountname/i, /cardname/i, /^displayname$/i, /productname/i, /^title$/i, /^name$/i])

    if (!accountId && !cardId && !mask) return null
    if (!accountId && !mask && cardId && !/(card|карт)/i.test(name)) return null

    const aliases = [accountId, cardId, mask].filter(Boolean)
    let key = aliases.map(alias => aliasToKey.get(alias)).find(Boolean) || null
    if (!key) {
      if (accountId) key = `ozon-api-${accountId}`
      else if (mask) key = `ozon-${mask}`
      else if (cardId) key = `ozon-card-${cardId}`
    }
    if (!key) return null

    const oldKeys = [...new Set(aliases.map(alias => aliasToKey.get(alias)).filter(Boolean))]
    let merged = seen.get(key) || {}
    for (const oldKey of oldKeys) {
      if (oldKey === key) continue
      merged = { ...seen.get(oldKey), ...merged }
      seen.delete(oldKey)
      for (const [alias, mapped] of aliasToKey.entries()) if (mapped === oldKey) aliasToKey.set(alias, key)
    }
    for (const alias of aliases) aliasToKey.set(alias, key)

    const previous = seen.get(key) || {}
    seen.set(key, {
      ...previous,
      ...merged,
      apiVerified: true,
      externalAccountId: key,
      accountMask: mask || previous.accountMask || null,
      accountName: name || previous.accountName || (mask ? `Ozon •••• ${mask}` : 'Ozon счёт'),
    })
    return { key, entries, accountId, cardId, mask }
  }

  function relationKeyForObject(obj) {
    if (!isObject(obj)) return null
    const entries = flattenObject(obj, 4)
    const strongIds = [
      findText(entries, [/^accountid$/i, /bankaccountid/i, /account.*id/i, /^contractid$/i, /contract.*id/i, /^walletid$/i, /wallet.*id/i]),
      findText(entries, [/^cardid$/i, /card.*id/i]),
    ].map(safeId).filter(Boolean)
    for (const id of strongIds) if (aliasToKey.has(id)) return aliasToKey.get(id)

    const maskEntry = findField(entries, [/maskedpan/i, /maskedcard/i, /cardmask/i, /last4/i, /maskednumber/i, /panmask/i])
    const mask = maskEntry ? last4(maskEntry.value) : null
    if (mask && aliasToKey.has(mask)) return aliasToKey.get(mask)

    for (const entry of entries) {
      const raw = textValue(entry.value).trim()
      if (raw && aliasToKey.has(raw)) return aliasToKey.get(raw)
    }
    return null
  }

  function financialDataFromObject(obj) {
    const entries = flattenObject(obj, 5)
    if (!entries.length) return null
    const excludedBalance = [/cashback/i, /bonus/i, /reward/i, /hold/i, /blocked/i, /limit/i, /debt/i, /credit/i, /fee/i, /commission/i]

    const balanceEntry = findField(entries, [
      /ownfund/i, /ownmoney/i, /ownbalance/i, /currentbalance/i, /totalbalance/i, /^balance$/i,
      /accountbalance/i, /availablebalance/i, /availablefund/i, /availablemoney/i, /spendable/i,
      /остаток/i, /баланс/i,
    ], excludedBalance)
    const creditLimitEntry = findField(entries, [/creditlimit/i, /totallimit/i, /approvedlimit/i, /кредит.*лимит/i, /общ.*лимит/i])
    const debtEntry = findField(entries, [/currentdebt/i, /totaldebt/i, /^debt$/i, /usedlimit/i, /usedcredit/i, /задолж/i])
    const availableEntry = findField(entries, [/availablelimit/i, /availablecredit/i, /creditavailable/i, /доступ.*лимит/i])
    const minPaymentEntry = findField(entries, [/minimumpayment/i, /minpayment/i, /mandatorypayment/i, /минималь.*плат/i, /обязательн.*плат/i])

    const currentBalanceMinor = balanceEntry ? moneyMinor(balanceEntry.value, balanceEntry.path, balanceEntry.parent) : null
    const creditLimitMinor = creditLimitEntry ? moneyMinor(creditLimitEntry.value, creditLimitEntry.path, creditLimitEntry.parent) : null
    const creditDebtMinor = debtEntry ? moneyMinor(debtEntry.value, debtEntry.path, debtEntry.parent) : null
    const creditAvailableMinor = availableEntry ? moneyMinor(availableEntry.value, availableEntry.path, availableEntry.parent) : null
    const creditMinPaymentMinor = minPaymentEntry ? moneyMinor(minPaymentEntry.value, minPaymentEntry.path, minPaymentEntry.parent) : null

    const hasCreditKeys = Boolean(creditLimitEntry || debtEntry || availableEntry || minPaymentEntry)
    const hasFinancialData = [currentBalanceMinor, creditLimitMinor, creditDebtMinor, creditAvailableMinor, creditMinPaymentMinor].some(value => value !== null)
    if (!hasFinancialData) return null

    return {
      accountType: hasCreditKeys ? 'credit' : 'bank',
      currentBalanceMinor: hasCreditKeys ? null : currentBalanceMinor,
      creditLimitMinor: creditLimitMinor == null ? null : Math.abs(creditLimitMinor),
      creditDebtMinor: creditDebtMinor == null ? null : Math.abs(creditDebtMinor),
      creditAvailableMinor: creditAvailableMinor == null ? null : Math.abs(creditAvailableMinor),
      creditMinPaymentMinor: creditMinPaymentMinor == null ? null : Math.abs(creditMinPaymentMinor),
      hasFinancialData: true,
    }
  }

  function mergeFinancial(key, financial) {
    if (!key || !financial) return
    const previous = seen.get(key) || { apiVerified: true, externalAccountId: key }
    const next = { ...previous }
    for (const [field, value] of Object.entries(financial)) {
      if (value !== null && value !== undefined) next[field] = value
    }
    next.apiVerified = true
    next.hasFinancialData = true
    seen.set(key, next)
  }

  function collectObjects(payload) {
    const objects = []
    let visited = 0
    const walk = value => {
      if (++visited > 50000 || value == null || typeof value !== 'object') return
      if (Array.isArray(value)) {
        for (const item of value) walk(item)
        return
      }
      objects.push(value)
      for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child)
    }
    walk(payload)
    return objects
  }

  function postState() {
    const accounts = [...seen.values()].map(account => ({ ...account }))
    const financialCount = accounts.filter(account => account.hasFinancialData === true).length
    window.postMessage({
      type: 'MONEYCRM_OZON_API_ACCOUNTS',
      accounts,
      diagnostics: { payloadCount, identityCount: accounts.length, financialCount },
    }, location.origin)
  }

  function scanPayload(payload) {
    payloadCount += 1
    const objects = collectObjects(payload)
    for (const obj of objects) identityFromObject(obj)
    for (const obj of objects) {
      let key = relationKeyForObject(obj)
      const financial = financialDataFromObject(obj)
      if (!financial) continue
      if (!key) {
        const identity = identityFromObject(obj)
        key = identity?.key || null
      }
      if (key) mergeFinancial(key, financial)
    }
    postState()
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
    if (relevantUrl(requestUrl)) response.clone().json().then(scanPayload).catch(() => {})
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
          scanPayload(payload)
        } catch {}
      }, { once: true })
    }
    return originalSend.apply(this, args)
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return
    if (event.data?.type !== 'MONEYCRM_OZON_API_ACCOUNTS_REQUEST') return
    postState()
  })
})()
