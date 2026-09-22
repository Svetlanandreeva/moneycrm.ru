import { useEffect, useMemo, useState } from 'react'
import { Building2, CheckCircle2, Landmark, Link2, LoaderCircle, RefreshCw, Search, ShieldCheck, Unplug, X } from 'lucide-react'
import {
  disconnectBankConnection,
  getBankProviderState,
  listBankConnections,
  startBankConnection,
  syncBankConnection,
  type BankConnection,
  type BankProviderState,
} from '../lib/bankConnections'
import { type FinanceContext, type Workspace, type WorkspaceKind } from '../lib/moneycrm'

const KIND_LABEL: Record<WorkspaceKind, string> = {
  personal: 'Личные',
  family: 'Семья',
  business: 'Бизнес',
}

function kindForContext(ctx: FinanceContext) {
  if (ctx === 'Личные') return 'personal'
  if (ctx === 'Семья') return 'family'
  if (ctx === 'Бизнес') return 'business'
  return null
}

function dateLabel(value: string | null) {
  if (!value) return 'ещё не синхронизирован'
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function BankConnectionsCard({ ctx, onChanged }: { ctx: FinanceContext; onChanged?: () => void }) {
  const [providerState, setProviderState] = useState<BankProviderState | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [providers, state] = await Promise.all([getBankProviderState(), listBankConnections()])
      setProviderState(providers)
      setWorkspaces(state.workspaces)
      setConnections(state.connections)
      const fixed = kindForContext(ctx)
      const preferred = fixed ? state.workspaces.find(workspace => workspace.kind === fixed) : state.workspaces[0]
      setWorkspaceId(current => current && state.workspaces.some(workspace => workspace.id === current) ? current : preferred?.id || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить банки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [ctx])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('bank')
    if (status === 'connected') {
      setMessage('Банк подключён. Счета добавлены в MoneyCRM.')
      window.history.replaceState({}, '', window.location.pathname)
      void load()
    }
    if (status === 'error') {
      setError(params.get('reason') || 'Не удалось подключить банк')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const fixedKind = kindForContext(ctx)
  const visibleWorkspaces = fixedKind ? workspaces.filter(workspace => workspace.kind === fixedKind) : workspaces
  const visibleWorkspaceIds = new Set(visibleWorkspaces.map(workspace => workspace.id))
  const visibleConnections = connections.filter(connection => visibleWorkspaceIds.has(connection.workspace_id))
  const workspaceMap = useMemo(() => new Map(workspaces.map(workspace => [workspace.id, workspace])), [workspaces])

  const providers = (providerState?.providers ?? []).filter(provider => {
    const q = search.trim().toLowerCase()
    return !q || provider.name.toLowerCase().includes(q) || provider.code.toLowerCase().includes(q)
  })

  async function connect(bankCode: string) {
    if (!workspaceId) return
    setSaving(true)
    setError('')
    try {
      await startBankConnection(workspaceId, bankCode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подключить банк')
      setSaving(false)
    }
  }

  async function sync(connection: BankConnection) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await syncBankConnection(connection.id)
      setMessage(result.pendingStatements
        ? 'Банк готовит выписку. Нажмите синхронизацию ещё раз через минуту.'
        : result.imported
          ? `Загружено новых операций: ${result.imported}.`
          : 'Новых операций нет.')
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка синхронизации')
    } finally {
      setSaving(false)
    }
  }

  async function disconnect(connection: BankConnection) {
    setSaving(true)
    setError('')
    try {
      await disconnectBankConnection(connection.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отключить банк')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#60a5fa12', border: '1px solid #60a5fa25' }}>
            <Landmark size={17} color="#60a5fa" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 850 }}>Подключённые банки</p>
            <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 9 }}>Баланс и покупки загружаются автоматически.</p>
          </div>
        </div>
        <button onClick={() => setOpen(value => !value)} style={{ minHeight: 34, padding: '0 11px', borderRadius: 10, border: '1px solid #2a2d3a', background: open ? '#e4f030' : '#191c23', color: open ? '#0c0d10' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}>
          {open ? <X size={13} /> : <Link2 size={13} />} {open ? 'Закрыть' : 'Подключить'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 11, padding: '9px 10px', borderRadius: 11, background: '#0f1116', border: '1px solid #20232b' }}>
        <ShieldCheck size={14} color="#34d399" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, color: '#6c7582', fontSize: 8, lineHeight: 1.45 }}>MoneyCRM не просит пароль от банка. Авторизация проходит на стороне банка, а доступ можно отозвать.</p>
      </div>

      {providerState && !providerState.configured && (
        <div style={{ marginTop: 10, padding: '10px 11px', borderRadius: 11, background: '#f59e0b0d', border: '1px solid #f59e0b28' }}>
          <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, color: '#f59e0b' }}>Open Banking слой готов · нужен ключ провайдера</p>
          <p style={{ margin: 0, color: '#707886', fontSize: 8, lineHeight: 1.45 }}>После добавления API-доступа список банков и кнопка авторизации включатся автоматически. Сейчас MoneyCRM не хранит банковские логины или пароли.</p>
        </div>
      )}

      {message && <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 10, background: '#34d3990d', border: '1px solid #34d39925', color: '#86efac', fontSize: 9 }}>{message}</div>}
      {error && <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 10, background: '#f8717110', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 9 }}>{error}</div>}

      {open && (
        <div style={{ marginTop: 12, padding: 11, borderRadius: 13, background: '#0d0f14', border: '1px solid #252a35' }}>
          {!fixedKind && (
            <div style={{ marginBottom: 9 }}>
              <p style={{ margin: '0 0 5px', color: '#68717f', fontSize: 8, fontWeight: 750, textTransform: 'uppercase' }}>Куда подключить счета</p>
              <select value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} style={inputStyle}>
                {visibleWorkspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{KIND_LABEL[workspace.kind]} · {workspace.name}</option>)}
              </select>
            </div>
          )}

          {providerState?.configured ? (
            <>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search size={13} color="#59616f" style={{ position: 'absolute', left: 11, top: 12 }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти банк" style={{ ...inputStyle, paddingLeft: 32 }} />
              </div>
              <p style={{ margin: '0 0 8px', color: '#59616f', fontSize: 8 }}>{providerState.environment === 'sandbox' ? 'Сейчас включена песочница — данные тестовые.' : 'Авторизация откроется на защищённой странице банка.'}</p>
              <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {providers.map(provider => (
                  <button key={provider.code} disabled={saving} onClick={() => void connect(provider.code)} style={{ minHeight: 46, padding: '0 11px', borderRadius: 11, border: '1px solid #232731', background: '#12151b', color: '#d1d5db', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: '#60a5fa10', border: '1px solid #60a5fa20', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Building2 size={13} color="#60a5fa" /></div>
                    <div style={{ minWidth: 0, flex: 1 }}><p style={{ margin: 0, fontSize: 10, fontWeight: 800 }}>{provider.name}</p>{provider.description && <p style={{ margin: '2px 0 0', color: '#59616f', fontSize: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{provider.description}</p>}</div>
                    <Link2 size={12} color="#59616f" />
                  </button>
                ))}
                {!providers.length && <p style={{ margin: 0, padding: 12, textAlign: 'center', color: '#59616f', fontSize: 9 }}>Банки по запросу не найдены.</p>}
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {(providerState?.supportedHint ?? ['Сбер', 'Т-Банк', 'Альфа-Банк', 'Точка', 'Модульбанк']).map(name => (
                <div key={name} style={{ minHeight: 42, padding: '0 11px', borderRadius: 10, border: '1px solid #20232b', background: '#111318', color: '#626b78', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={13} /> <span style={{ fontSize: 9, fontWeight: 700 }}>{name}</span><span style={{ marginLeft: 'auto', fontSize: 7 }}>после активации API</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '18px 0', display: 'flex', justifyContent: 'center' }}><LoaderCircle size={17} color="#59616f" /></div>
      ) : visibleConnections.length === 0 ? (
        <div style={{ marginTop: 12, padding: '16px 12px', borderRadius: 13, border: '1px dashed #2a2d3a', textAlign: 'center' }}>
          <Landmark size={19} color="#59616f" style={{ marginBottom: 7 }} />
          <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 750 }}>Банки ещё не подключены</p>
          <p style={{ margin: 0, color: '#59616f', fontSize: 8 }}>После подключения карты и счета появятся здесь автоматически.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
          {visibleConnections.map(connection => {
            const workspace = workspaceMap.get(connection.workspace_id)
            const active = connection.status === 'active'
            return (
              <div key={connection.id} style={{ padding: '10px 11px', borderRadius: 12, background: '#101218', border: `1px solid ${active ? '#34d39922' : '#f59e0b28'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: active ? '#34d39910' : '#f59e0b10', border: `1px solid ${active ? '#34d39925' : '#f59e0b25'}`, display: 'grid', placeItems: 'center' }}>
                    {active ? <CheckCircle2 size={14} color="#34d399" /> : <Landmark size={14} color="#f59e0b" />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 800 }}>{connection.institution_name || connection.provider_bank_code || 'Банк'}</p>
                    <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 8 }}>{workspace ? KIND_LABEL[workspace.kind] : 'Счета'} · {connection.linked_accounts} сч. · {dateLabel(connection.last_synced_at)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button disabled={saving || !active} onClick={() => void sync(connection)} title="Синхронизировать" style={iconButton}><RefreshCw size={12} /></button>
                    <button disabled={saving} onClick={() => void disconnect(connection)} title="Отключить" style={iconButton}><Unplug size={12} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

const inputStyle = { width: '100%', minHeight: 38, borderRadius: 10, border: '1px solid #2a2d3a', background: '#111318', color: '#e5e7eb', padding: '0 10px', fontSize: 10, outline: 'none', boxSizing: 'border-box' as const } as const
const iconButton = { width: 30, height: 30, borderRadius: 9, border: '1px solid #262a34', background: '#171a21', color: '#808896', display: 'grid', placeItems: 'center', cursor: 'pointer' } as const
