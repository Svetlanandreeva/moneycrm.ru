const OZON_HOME = 'https://finance.ozon.ru/'

async function findOrOpenOzonTab() {
  const tabs = await chrome.tabs.query({ url: 'https://finance.ozon.ru/*' })
  if (tabs.length) return { tab: tabs[0], created: false }
  const tab = await chrome.tabs.create({ url: OZON_HOME, active: true })
  return { tab, created: true }
}

async function waitForTabReady(tabId, timeoutMs = 18000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    if (tab?.status === 'complete') return true
    await new Promise(resolve => setTimeout(resolve, 350))
  }
  return false
}

function isMissingReceiver(error) {
  return /receiving end does not exist|could not establish connection/i.test(String(error?.message || error || ''))
}

async function reloadForBridge(tabId, delay = 2600) {
  await chrome.tabs.reload(tabId)
  await waitForTabReady(tabId)
  await new Promise(resolve => setTimeout(resolve, delay))
}

async function openHomeForBalances(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  const current = String(tab?.url || '')
  if (!/^https:\/\/finance\.ozon\.ru\/?(?:[?#].*)?$/i.test(current)) {
    await chrome.tabs.update(tabId, { url: OZON_HOME })
    await waitForTabReady(tabId)
    await new Promise(resolve => setTimeout(resolve, 3500))
  } else {
    await reloadForBridge(tabId, 3500)
  }
}

async function sendToOzon(tabId, message, allowReload = true) {
  let lastError = null
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message)
    } catch (error) {
      lastError = error
      if (allowReload && isMissingReceiver(error)) {
        await reloadForBridge(tabId)
        allowReload = false
        continue
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  throw lastError || new Error('Ozon connector is not ready')
}

async function collect(tabId, fromDate, allowReload = true) {
  return sendToOzon(tabId, { type: 'moneycrm:ozon-collect', fromDate: fromDate || null }, allowReload)
}

async function handleSync(options = {}) {
  const { tab, created } = await findOrOpenOzonTab()
  if (!tab.id) throw new Error('Не удалось открыть Ozon Банк')

  await waitForTabReady(tab.id)
  let result = await collect(tab.id, options.fromDate)

  if (result?.status === 'needs_api_refresh') {
    await reloadForBridge(tab.id, 3000)
    result = await collect(tab.id, options.fromDate, false)
  }

  if (result?.status === 'needs_balance_refresh') {
    await openHomeForBalances(tab.id)
    result = await collect(tab.id, options.fromDate, false)
  }

  if (!result || ['login_required','needs_navigation','needs_api_refresh','needs_balance_refresh'].includes(result.status)) {
    await chrome.tabs.update(tab.id, { active: true })
  }

  if (created && (!result || result.status !== 'ok')) {
    return {
      status: 'login_required',
      message: 'Ozon открыт. Войдите в официальный кабинет один раз, затем вернитесь в MoneyCRM и нажмите синхронизацию снова.',
    }
  }

  if (result?.status === 'needs_balance_refresh') {
    return {
      ...result,
      message: 'MoneyCRM уже нашёл банковские карты, но Ozon не отдал баланс в загруженных ответах. Оставьте открытую главную страницу Ozon Банка и повторите синхронизацию — пустые счета при этом не создаются.',
    }
  }

  return result
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'moneycrm:bridge-ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version })
    return false
  }

  if (message?.type === 'moneycrm:ozon-sync') {
    handleSync({ fromDate: message.fromDate || null })
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, status: 'error', message: error instanceof Error ? error.message : String(error) }))
    return true
  }

  return false
})
