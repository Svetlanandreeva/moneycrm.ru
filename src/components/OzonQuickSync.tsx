import { useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { importOzonBridgeText } from '../lib/ozonBridgeImport'
import { listBankConnections, type BankConnection } from '../lib/bankConnections'

type BridgeState = 'checking' | 'ready' | 'missing'
type ToastState = { kind: 'info' | 'success' | 'error'; text: string } | null

function dateDaysAgo(days: number) {
  const value = new Date()
  value.setDate(value.getDate() - days)
  return value.toISOString().slice(0, 10)
}

const TODAY = new Date().toISOString().slice(0, 10)
const DEFAULT_FROM_DATE = dateDaysAgo(90)

export function OzonQuickSync() {
  const [bridgeState, setBridgeState] = useState<BridgeState>('checking')
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [fromDate, setFromDate] = useState(DEFAULT_FROM_DATE)
  const activeRequest = useRef<string | null>(null)
  const pendingFromDate = useRef<string | null>(null)
  const requestedWorkspaceId = useRef<string | null>(null)

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

  async function resolveTarget(): Promise<{ workspaceId: string; connection: BankConnection | null }> {
    const state = await listBankConnections()
    const existing = state.connections.find(connection => connection.provider === 'ozon_statement' && connection.status !== 'revoked') ?? null
    if (existing) return { workspaceId: existing.workspace_id, connection: existing }

    const requested = requestedWorkspaceId.current
      ? state.workspaces.find(workspace => workspace.id === requestedWorkspaceId.current)
      : null
    if (requested) return { workspaceId: requested.id, connection: null }

    const personal = state.workspaces.find(workspace => workspace.kind === 'personal')
    return { workspaceId: personal?.id || state.workspaces[0]?.id || '', connection: null }
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

      const target = await resolveTarget()
      if (!target.workspaceId) throw new Error('Не найден раздел для банковского счёта')

      const syncFrom = pendingFromDate.current || payload.fromDate || target.connection?.sync_from_at || null
      const accountMeta = payload.accountMeta && typeof payload.accountMeta === 'object' ? payload.accountMeta : null
      const isCredit = accountMeta?.accountType === 'credit'

      const result = await importOzonBridgeText({
        workspaceId: target.workspaceId,
        text: String(payload.text),
        accountName: accountMeta?.accountName || (isCredit ? 'Ozon Кредитная карта' : 'Ozon Карта'),
        fromDate: syncFrom,
        accountMeta,
      })

      const creditNote = result.accountType === 'credit'
        ? ' Кредитная карта учтена как долг банку, её лимит не входит в ваш капитал.'
        : ''
      setToast({
        kind: 'success',
        text: result.imported
          ? `Ozon обновлён: +${result.imported} операций${result.duplicates ? `, ${result.duplicates} дублей пропущено` : ''}.${creditNote}`
          : `Ozon уже актуален. Дублей пропущено: ${result.duplicates}.${creditNote}`,
      })
      requestedWorkspaceId.current = null
      window.dispatchEvent(new CustomEvent('moneycrm:bank-sync-complete', { detail: { provider: 'ozon' } }))
    } catch (error) {
      setToast({ kind: 'error', text: error instanceof Error ? error.message : 'Ошибка синхронизации Ozon Банка' })
    } finally {
      activeRequest.current = null
      setSyncing(false)
    }
  }

  async function launchSync(chosenFromDate?: string | null) {
    if (syncing) return
    if (bridgeState !== 'ready') {
      setToast({
        kind: 'info',
        text: 'Для синхронизации Ozon на компьютере установите MoneyCRM Ozon Bridge в Chrome. На телефоне уже синхронизированные данные отображаются автоматически.',
      })
      return
    }

    const target = await resolveTarget()
    const savedStart = target.connection?.sync_from_at || null
    const syncFrom = chosenFromDate || pendingFromDate.current || savedStart

    if (!syncFrom) {
      setFromDate(DEFAULT_FROM_DATE)
      setSetupOpen(true)
      setToast(null)
      return
    }

    pendingFromDate.current = syncFrom
    setSetupOpen(false)
    const requestId = `ozon-${Date.now()}-${Math.random().toString(36).slice(2)}`
    activeRequest.current = requestId
    setSyncing(true)
    setToast({ kind: 'info', text: `Обновляю Ozon Банк · история с ${new Intl.DateTimeFormat('ru-RU').format(new Date(`${syncFrom}T12:00:00`))}…` })
    window.postMessage({ type: 'MONEYCRM_OZON_SYNC', requestId, fromDate: syncFrom }, window.location.origin)

    window.setTimeout(() => {
      if (activeRequest.current !== requestId) return
      activeRequest.current = null
      setSyncing(false)
      setToast({ kind: 'error', text: 'Коннектор Ozon не ответил. Обновите страницу MoneyCRM и попробуйте ещё раз.' })
    }, 70000)
  }

  useEffect(() => {
    const requestSync = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail
      requestedWorkspaceId.current = detail?.workspaceId || null
      void launchSync()
    }

    window.addEventListener('moneycrm:ozon-sync-request', requestSync as EventListener)
    return () => window.removeEventListener('moneycrm:ozon-sync-request', requestSync as EventListener)
  }, [bridgeState, syncing])

  useEffect(() => {
    const interceptOzonRefresh = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest('button')
      if (!button) return
      const title = button.getAttribute('title') || ''
      if (!/ozon/i.test(title)) return
      if (bridgeState !== 'ready') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      void launchSync()
    }

    document.addEventListener('click', interceptOzonRefresh, true)
    return () => document.removeEventListener('click', interceptOzonRefresh, true)
  }, [bridgeState, syncing])

  if (!toast && bridgeState !== 'ready' && !setupOpen) return null

  return (
    <>
      {setupOpen && (
        <div style={setupOverlay}>
          <div style={setupCard}>
            <div style={setupIcon}><CalendarDays size={19} /></div>
            <p style={setupTitle}>С какой даты загрузить Ozon?</p>
            <p style={setupText}>
              Это спрашивается только при первом подключении. Дальше MoneyCRM будет добавлять только новые операции одной кнопкой.
            </p>
            <input
              type="date"
              value={fromDate}
              max={TODAY}
              onChange={event => setFromDate(event.target.value)}
              style={dateInput}
            />
            <div style={quickDates}>
              <button type="button" onClick={() => setFromDate(dateDaysAgo(30))} style={dateChip}>30 дней</button>
              <button type="button" onClick={() => setFromDate(dateDaysAgo(90))} style={dateChip}>3 месяца</button>
              <button type="button" onClick={() => setFromDate(dateDaysAgo(365))} style={dateChip}>1 год</button>
            </div>
            <div style={creditHint}>
              Кредитку MoneyCRM определит отдельно: кредитный лимит — деньги банка, а использованная сумма — ваш долг. Лимит не попадёт в «Общий капитал».
            </div>
            <button type="button" disabled={!fromDate} onClick={() => void launchSync(fromDate)} style={setupPrimary}>
              Подключить и загрузить
            </button>
            <button type="button" onClick={() => setSetupOpen(false)} style={setupCancel}>Отмена</button>
          </div>
        </div>
      )}

      <div style={toastWrap}>
        {bridgeState === 'ready' && !toast && !setupOpen && (
          <button type="button" onClick={() => void launchSync()} disabled={syncing} style={quickButton} title="Синхронизировать Ozon Банк">
            {syncing ? <LoaderCircle size={14} /> : <RefreshCw size={14} />}
            Ozon
          </button>
        )}

        {toast && !setupOpen && (
          <div style={{ ...toastBox, borderColor: toast.kind === 'error' ? '#f8717140' : toast.kind === 'success' ? '#34d39940' : '#e4f03035' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {toast.kind === 'success' ? <CheckCircle2 size={15} color="#34d399" /> : toast.kind === 'error' ? <TriangleAlert size={15} color="#f87171" /> : <RefreshCw size={15} color="#e4f030" />}
              <span style={{ flex: 1 }}>{toast.text}</span>
              <button type="button" onClick={() => setToast(null)} style={closeButton}>×</button>
            </div>
            {bridgeState === 'ready' && !syncing && toast.kind !== 'success' && (
              <button type="button" onClick={() => void launchSync()} style={retryButton}>Повторить синхронизацию</button>
            )}
          </div>
        )}
      </div>
    </>
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

const setupOverlay = {
  position: 'fixed',
  inset: 0,
  zIndex: 1200,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  background: '#08090ccf',
  backdropFilter: 'blur(10px)',
} as const

const setupCard = {
  width: 'min(390px, calc(100vw - 36px))',
  padding: 20,
  borderRadius: 22,
  background: '#14161c',
  border: '1px solid #2b2f39',
  boxShadow: '0 24px 80px #000c',
} as const

const setupIcon = {
  width: 42,
  height: 42,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 13,
  color: '#e4f030',
  background: '#e4f03010',
  border: '1px solid #e4f03033',
} as const

const setupTitle = {
  margin: '14px 0 5px',
  fontSize: 19,
  fontWeight: 850,
  color: '#f3f4f6',
} as const

const setupText = {
  margin: '0 0 15px',
  color: '#747d8b',
  fontSize: 11,
  lineHeight: 1.5,
} as const

const dateInput = {
  width: '100%',
  minHeight: 46,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 12,
  border: '1px solid #303440',
  background: '#0d0f14',
  color: '#f3f4f6',
  colorScheme: 'dark',
  fontSize: 13,
  outline: 'none',
} as const

const quickDates = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 7,
  marginTop: 8,
} as const

const dateChip = {
  minHeight: 34,
  borderRadius: 9,
  border: '1px solid #2a2e38',
  background: '#101218',
  color: '#9ca3af',
  fontSize: 9,
  fontWeight: 750,
  cursor: 'pointer',
} as const

const creditHint = {
  marginTop: 13,
  padding: '10px 11px',
  borderRadius: 11,
  background: '#f871710b',
  border: '1px solid #f8717124',
  color: '#b9bec7',
  fontSize: 9,
  lineHeight: 1.5,
} as const

const setupPrimary = {
  width: '100%',
  minHeight: 44,
  marginTop: 14,
  border: 0,
  borderRadius: 12,
  background: '#e4f030',
  color: '#0b0c0e',
  fontSize: 11,
  fontWeight: 900,
  cursor: 'pointer',
} as const

const setupCancel = {
  width: '100%',
  minHeight: 36,
  marginTop: 6,
  border: 0,
  background: 'transparent',
  color: '#6b7280',
  fontSize: 10,
  cursor: 'pointer',
} as const