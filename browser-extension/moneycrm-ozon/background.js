const OZON_HOME = 'https://finance.ozon.ru/'

async function findOrOpenOzonTab() {
  const tabs = await chrome.tabs.query({ url: 'https://finance.ozon.ru/*' })
  if (tabs.length) return { tab: tabs[0], created: false }
  const tab = await chrome.tabs.create({ url: OZON_HOME, active: true })
  return { tab, created: true }
}

async function waitForTabReady(tabId, timeoutMs = 15000) {
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

async function reloadForBridge(tabId) {
  await chrome.tabs.reload(tabId)
  await waitForTabReady(tabId)
  await new Promise(resolve => setTimeout(resolve, 2200))
}

async function sendToOzon(tabId, message, allowReload = true) {
  let lastError = null
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message)
    } catch (error) {
      lastError = error
      if (allowReload && isMissingReceiver(error)) {
        await reloadForBridge(tabId)
        allowReload = false
        continue
      }
      await new Promise(resolve => setTimeout(resolve, 450))
    }
  }
  throw lastError || new Error('Ozon connector is not ready')
}

async function handleSync(options = {}) {
  const { tab, created } = await findOrOpenOzonTab()
  if (!tab.id) throw new Error('Не удалось открыть Ozon Банк')

  await waitForTabReady(tab.id)
  let result = await sendToOzon(tab.id, {
    type: 'moneycrm:ozon-collect',
    fromDate: options.fromDate || null,
  })

  if (result?.status === 'needs_api_refresh') {
    await reloadForBridge(tab.id)
    result = await sendToOzon(tab.id, {
      type: 'moneycrm:ozon-collect',
      fromDate: options.fromDate || null,
    }, false)
  }

  if (!result || result.status === 'login_required' || result.status === 'needs_navigation' || result.status === 'needs_api_refresh') {
    await chrome.tabs.update(tab.id, { active: true })
  }

  if (created && (!result || result.status !== 'ok')) {
    return {
      status: 'login_required',
      message: 'Ozon открыт. Войдите в официальный кабинет один раз, затем вернитесь в MoneyCRM и нажмите синхронизацию снова.',
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
