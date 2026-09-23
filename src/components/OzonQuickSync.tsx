import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { importOzonBridgeText } from '../lib/ozonBridgeImport'
import { listBankConnections } from '../lib/bankConnections'

type BridgeState = 'checking' | 'ready' | 'missing'
type ToastState = { kind: 'info' | 'success' | 'error'; text: string } | null

export function OzonQuickSync() {
  const [bridgeState, setBridgeState] = useState<BridgeState>('checking')
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const activeRequest = useRef<string | null>(null)

  useEffect(() => {
    let pingTimer: number | null = null

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      const payload = event.data
      if (!payload || typeof payload !== 'object') return

      if (payload.type === 'MONEYCRM_OZON_BRIDGE_PONG') {
        setBridgeState('ready')
        if (pingTimer) window.clearTimeout(pingTimer)
        return
      }

      if (payload.type === 'MONEYCRM_OZON_SYNC_RESULT') {
        if (activeRequest.current && payload.requestId && payload.requestId !== activeRequest.current) return
        void finishSync(payload)
      }
    }

    window.addEventListener('message', handleMessage)
    window.postMessage({ type: 'MONEYCRM_OZON_BRIDGE_PING' }, window.location.origin)
    pingTimer = window.setTimeout(() => setBridgeState(current => current === 'checking' ? 'missing' : current), 1400)

    return () => {
      window.removeEventListener('message', handleMessage)
      if (pingTimer) window.clearTimeout(pingTimer)
    }
  }, [])

  async function resolveWorkspaceId() {
    const state = await listBankConnections()
    const existing = state.connections.find(connection => connection.provider === 'ozon_statement' && connection.status !== 'revoked')
    if (existing) return existing.workspace_id
    const personal = state.workspaces.find(workspace => workspace.kind === 'personal')
    return personal?.id || state.workspaces[0]?.id || ''
  }

  async function finishSync(payload: any) {
    try {
      if (payload.status === 'login_required') {
        setToast({ kind: 'info', text: payload.message || 'Войдите в Ozon Банк в открывшейся вкладке и нажмите синхронизацию ещё раз.' })
        return
      }

      if (payload.status === 'needs_navigation') {
        setToast({ kind: 'info', text: payload.message || 'Откройте в Ozon историю операций и повторите синхронизацию.' })
        return
      }

      if (payload.status !== 'ok' || !payload.text) {
        throw new Error(payload.message || 'Ozon не вернул данные для синхронизации')
      }

      const workspaceId = await resolveWorkspaceId()
      if (!workspaceId) throw new Error('Не найден раздел для банковского счёта')

      const result = await importOzonBridgeText({
        workspaceId,
        text: String(payload.text),
        accountName: 'Ozon Карта',
      })

      setToast({
        kind: 'success',
        text: result.imported
          ? `Ozon обновлён: +${result.imported} операций${result.duplicates ? `, ${result.duplicates} дублей пропущено` : ''}.`
          : `Ozon уже актуален. Дублей пропущено: ${result.duplicates}.`,
      })
      window.dispatchEvent(new CustomEvent('moneycrm:bank-sync-complete', { detail: { provider: 'ozon' } }))
    } catch (error) {
      setToast({ kind: 'error', text: error instanceof Error ? error.message : 'Ошибка синхронизации Ozon Банка' })
    } finally {
      activeRequest.current = null
      setSyncing(false)
    }
  }

  async function startSync() {
    if (syncing) return
    if (bridgeState !== 'ready') {
      setToast({
        kind: 'info',
        text: 'Для синхронизации одной кнопкой нужен локальный MoneyCRM Ozon Bridge. Банковский пароль при этом остаётся только на официальном сайте Ozon.',
      })
      return
    }

    const requestId = `ozon-${Date.now()}-${Math.random().toString(36).slice(2)}`
    activeRequest.current = requestId
    setSyncing(true)
    setToast({ kind: 'info', text: 'Обновляю Ozon Банк…' })
    window.postMessage({ type: 'MONEYCRM_OZON_SYNC', requestId }, window.location.origin)

    window.setTimeout(() => {
      if (activeRequest.current !== requestId) return
      activeRequest.current = null
      setSyncing(false)
      setToast({ kind: 'error', text: 'Коннектор Ozon не ответил. Обновите страницу MoneyCRM и попробуйте ещё раз.' })
    }, 30000)
  }

  useEffect(() => {
    const interceptOzonRefresh = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest('button')
      if (!button) return
      const title = button.getAttribute('title') || ''
      if (!/выписк|ozon/i.test(title)) return
      if (bridgeState !== 'ready') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      void startSync()
    }

    document.addEventListener('click', interceptOzonRefresh, true)
    return () => document.removeEventListener('click', interceptOzonRefresh, true)
  }, [bridgeState, syncing])

  if (!toast && bridgeState !== 'ready') return null

  return (
    <div style={toastWrap}>
      {bridgeState === 'ready' && !toast && (
        <button type="button" onClick={() => void startSync()} disabled={syncing} style={quickButton} title="Синхронизировать Ozon Банк">
          {syncing ? <LoaderCircle size={14} /> : <RefreshCw size={14} />}
          Ozon
        </button>
      )}

      {toast && (
        <div style={{ ...toastBox, borderColor: toast.kind === 'error' ? '#f8717140' : toast.kind === 'success' ? '#34d39940' : '#e4f03035' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {toast.kind === 'success' ? <CheckCircle2 size={15} color="#34d399" /> : toast.kind === 'error' ? <TriangleAlert size={15} color="#f87171" /> : <RefreshCw size={15} color="#e4f030" />}
            <span style={{ flex: 1 }}>{toast.text}</span>
            <button type="button" onClick={() => setToast(null)} style={closeButton}>×</button>
          </div>
          {bridgeState === 'ready' && !syncing && toast.kind !== 'success' && (
            <button type="button" onClick={() => void startSync()} style={retryButton}>Повторить синхронизацию</button>
          )}
        </div>
      )}
    </div>
  )
}

const toastWrap = {
  position: 'fixed',
  right: 18,
  bottom: 92,
  zIndex: 1000,
  maxWidth: 320,
} as const

const quickButton = {
  minHeight: 42,
  padding: '0 14px',
  borderRadius: 14,
  border: '1px solid #e4f03044',
  background: '#171a10',
  color: '#e4f030',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 11,
  fontWeight: 850,
  boxShadow: '0 8px 30px #0008',
  cursor: 'pointer',
} as const

const toastBox = {
  width: 'min(310px, calc(100vw - 36px))',
  padding: 12,
  borderRadius: 14,
  border: '1px solid #e4f03035',
  background: '#14161cf2',
  color: '#d1d5db',
  fontSize: 10,
  lineHeight: 1.45,
  boxShadow: '0 14px 40px #000a',
  backdropFilter: 'blur(14px)',
} as const

const closeButton = {
  width: 22,
  height: 22,
  border: 0,
  background: 'transparent',
  color: '#7b8491',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
} as const

const retryButton = {
  width: '100%',
  minHeight: 34,
  marginTop: 9,
  borderRadius: 9,
  border: 0,
  background: '#e4f030',
  color: '#0c0d10',
  fontSize: 9,
  fontWeight: 850,
  cursor: 'pointer',
} as const
