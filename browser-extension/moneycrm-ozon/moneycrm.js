function reply(type, payload = {}) {
  window.postMessage({ type, ...payload }, window.location.origin)
}

window.addEventListener('message', event => {
  if (event.source !== window) return
  const message = event.data
  if (!message || typeof message !== 'object') return

  if (message.type === 'MONEYCRM_OZON_BRIDGE_PING') {
    chrome.runtime.sendMessage({ type: 'moneycrm:bridge-ping' }, response => {
      if (chrome.runtime.lastError || !response?.ok) return
      reply('MONEYCRM_OZON_BRIDGE_PONG', { version: response.version || 'unknown' })
    })
  }

  if (message.type === 'MONEYCRM_OZON_SYNC') {
    chrome.runtime.sendMessage({ type: 'moneycrm:ozon-sync' }, response => {
      const requestId = message.requestId || null
      if (chrome.runtime.lastError) {
        reply('MONEYCRM_OZON_SYNC_RESULT', {
          requestId,
          status: 'error',
          message: chrome.runtime.lastError.message,
        })
        return
      }
      reply('MONEYCRM_OZON_SYNC_RESULT', { requestId, ...(response || { status: 'error', message: 'Нет ответа от коннектора' }) })
    })
  }
})
