import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  FileUp,
  Landmark,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  X,
} from 'lucide-react'
import {
  disconnectBankConnection,
  getBankProviderState,
  listBankConnections,
  routeBankAccount,
  startBankConnection,
  syncBankConnection,
  type BankConnection,
  type BankLinkedAccount,
  type BankProviderState,
} from '../lib/bankConnections'
import { importOzonStatement } from '../lib/ozonStatement'
import { type FinanceContext, type Workspace, type WorkspaceKind } from '../lib/moneycrm'

const KIND_LABEL: Record<WorkspaceKind, string> = {
  personal: 'Личные',
  family: 'Семья',
  business: 'Бизнес',
}

const KIND_COLOR: Record<WorkspaceKind, string> = {
  personal: '#60a5fa',
  family: '#c084fc',
  business: '#f59e0b',
}

function kindForContext(ctx: FinanceContext): WorkspaceKind | null {
  if (ctx === 'Личные') return 'personal'
  if (ctx === 'Семья') return 'family'
  if (ctx === 'Бизнес') return 'business'
  return null
}

function dateLabel(value: string | null) {
  if (!value) return 'ещё не синхронизирован'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function BankConnectionsCard({ ctx, onChanged }: { ctx: FinanceContext; onChanged?: () => void }) {
  const [providerState, setProviderState] = useState<BankProviderState | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [linkedAccounts, setLinkedAccounts] = useState<BankLinkedAccount[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [search, setSearch] = useState('')
  const [ozonOpen, setOzonOpen] = useState(false)
  const [ozonFile, setOzonFile] = useState<File | null>(null)
  const [ozonAccountName, setOzonAccountName] = useState('Ozon Карта')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [providers, state] = await Promise.all([getBankProviderState(), listBankConnections()])
      setProviderState(providers)
      setWorkspaces(state.workspaces)
      setConnections(state.connections)
      setLinkedAccounts(state.linkedAccounts)

      const fixed = kindForContext(ctx)
      const preferred = fixed
        ? state.workspaces.find(workspace => workspace.kind === fixed)
        : state.workspaces.find(workspace => workspace.kind === 'personal') ?? state.workspaces[0]

      setWorkspaceId(current => {
        if (fixed) return preferred?.id || ''
        return current && state.workspaces.some(workspace => workspace.id === current)
          ? current
          : preferred?.id || ''
      })
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
      setMessage('Банк подключён. Теперь распределите его счета по Личным, Семье или Бизнесу.')
      setOpen(false)
      window.history.replaceState({}, '', window.location.pathname)
      void load()
    }
    if (status === 'error') {
      setError(params.get('reason') || 'Не удалось подключить банк')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const fixedKind = kindForContext(ctx)
  const visibleWorkspaces = fixedKind
    ? workspaces.filter(workspace => workspace.kind === fixedKind)
    : workspaces

  const workspaceMap = useMemo(
    () => new Map(workspaces.map(workspace => [workspace.id, workspace])),
    [workspaces],
  )

  const visibleLinks = fixedKind
    ? linkedAccounts.filter(link => link.workspace_kind === fixedKind)
    : linkedAccounts

  const visibleConnectionIds = new Set(visibleLinks.map(link => link.connection_id))
  const visibleConnections = fixedKind
    ? connections.filter(connection => {
        if (visibleConnectionIds.has(connection.id)) return true
        const originalWorkspace = workspaceMap.get(connection.workspace_id)
        return connection.linked_accounts === 0 && originalWorkspace?.kind === fixedKind
      })
    : connections

  const providers = (providerState?.providers ?? []).filter(provider => {
    const q = search.trim().toLowerCase()
    return !q || provider.name.toLowerCase().includes(q) || provider.code.toLowerCase().includes(q)
  })

  async function connect(bankCode: string) {
    if (!workspaceId) return
    setError('')
    setMessage('')
    if (bankCode === 'ozon_statement') {
      setOzonOpen(true)
      return
    }
    setSaving(true)
    try {
      await startBankConnection(workspaceId, bankCode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подключить банк')
      setSaving(false)
    }
  }

  async function importOzon() {
    if (!workspaceId) return
    if (!ozonFile) {
      setError('Сначала выберите выписку Ozon Банка.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await importOzonStatement({
        workspaceId,
        file: ozonFile,
        accountName: ozonAccountName,
      })
      setMessage(result.imported
        ? `Ozon Банк подключён: загружено ${result.imported} операций${result.duplicates ? `, дублей пропущено ${result.duplicates}` : ''}.`
        : `Новых операций нет. Дублей пропущено: ${result.duplicates}.`)
      setOzonFile(null)
      setOzonOpen(false)
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось импортировать выписку Ozon Банка')
    } finally {
      setSaving(false)
    }
  }

  async function sync(connection: BankConnection) {
    if (connection.provider === 'ozon_statement') {
      setWorkspaceId(connection.workspace_id)
      setOpen(true)
      setOzonOpen(true)
      setMessage('Для Ozon Банка загрузите свежую выписку — уже импортированные операции автоматически пропустятся.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await syncBankConnection(connection.id)
      setMessage(result.pendingStatements
        ? 'Банк готовит выписку. Повторите синхронизацию через минуту.'
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

  async function route(link: BankLinkedAccount, targetWorkspaceId: string) {
    if (!targetWorkspaceId || targetWorkspaceId === link.workspace_id) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await routeBankAccount(link.id, targetWorkspaceId)
      const target = workspaces.find(workspace => workspace.id === targetWorkspaceId)
      setMessage(`${link.account_name} → ${target ? KIND_LABEL[target.kind] : 'новый раздел'}.`)
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить назначение счёта')
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
    <section style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={bankIconBox}><Landmark size={17} color="#60a5fa" /></div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 850 }}>Банки и счета</p>
            <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 9 }}>Подключение, синхронизация и назначение каждого счёта.</p>
          </div>
        </div>
        <button onClick={() => setOpen(value => !value)} style={{ ...smallButton, background: open ? '#e4f030' : '#191c23', color: open ? '#0c0d10' : '#9ca3af' }}>
          {open ? <X size={13} /> : <Link2 size={13} />} {open ? 'Закрыть' : 'Подключить'}
        </button>
      </div>

      <div style={safeBox}>
        <ShieldCheck size={14} color="#34d399" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, color: '#6c7582', fontSize: 8, lineHeight: 1.45 }}>
          Банк подключается один раз. После этого каждую карту или счёт можно отдельно отнести к Личным, Семье или Бизнесу.
        </p>
      </div>

      {message && <div style={successBox}>{message}</div>}
      {error && <div style={errorBox}>{error}</div>}

      {open && (
        <div style={connectBox}>
          {!fixedKind && (
            <div style={{ marginBottom: 9 }}>
              <p style={fieldLabel}>Куда временно положить новые счета</p>
              <select value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} style={inputStyle}>
                {workspaces.map(workspace => (
                  <option key={workspace.id} value={workspace.id}>{KIND_LABEL[workspace.kind]} · {workspace.name}</option>
                ))}
              </select>
              <p style={{ margin: '5px 0 0', color: '#59616f', fontSize: 7, lineHeight: 1.35 }}>
                После подключения назначение можно поменять отдельно для каждой карты.
              </p>
            </div>
          )}

          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={13} color="#59616f" style={{ position: 'absolute', left: 11, top: 12 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти банк" style={{ ...inputStyle, paddingLeft: 32 }} />
          </div>
          <p style={{ margin: '0 0 8px', color: '#59616f', fontSize: 8, lineHeight: 1.45 }}>
            Ozon Банк уже работает с реальными выписками. Тестовый банк нужен только для проверки автоматической синхронизации.
          </p>
          <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {providers.map(provider => (
              <button key={provider.code} disabled={saving} onClick={() => void connect(provider.code)} style={providerButton}>
                <div style={providerIcon}><Building2 size={13} color={provider.code === 'ozon_statement' ? '#e4f030' : '#60a5fa'} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 800 }}>{provider.name}</p>
                  {provider.description && <p style={{ margin: '2px 0 0', color: '#59616f', fontSize: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{provider.description}</p>}
                </div>
                {provider.code === 'ozon_statement' ? <FileUp size={12} color="#e4f030" /> : <Link2 size={12} color="#59616f" />}
              </button>
            ))}
            {!providers.length && <p style={emptyText}>Банки по запросу не найдены.</p>}
          </div>

          {ozonOpen && (
            <div style={ozonBox}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 850 }}>Ozon Банк</p>
                  <p style={{ margin: '3px 0 0', color: '#68717f', fontSize: 8, lineHeight: 1.4 }}>MoneyCRM не получает логин или код-пароль Ozon.</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.open('https://finance.ozon.ru/apps/auth/signin?redirect=%2Flk', '_blank', 'noopener,noreferrer')}
                  style={outlineButton}
                >
                  <ExternalLink size={11} /> Открыть Ozon
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                <p style={fieldLabel}>Название счёта</p>
                <input value={ozonAccountName} onChange={e => setOzonAccountName(e.target.value)} style={inputStyle} placeholder="Ozon Карта" />
              </div>

              <div style={{ marginTop: 9 }}>
                <p style={fieldLabel}>Выписка</p>
                <label style={fileDrop}>
                  <FileUp size={16} color="#e4f030" />
                  <span style={{ fontSize: 9, fontWeight: 750 }}>{ozonFile ? ozonFile.name : 'Выбрать PDF / CSV / TXT'}</span>
                  <input
                    type="file"
                    accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
                    onChange={e => setOzonFile(e.target.files?.[0] ?? null)}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              <p style={{ margin: '8px 0 0', color: '#59616f', fontSize: 7, lineHeight: 1.45 }}>
                В Ozon откройте нужный счёт → справки/выписки → сформируйте выписку. Повторная загрузка безопасна: уже импортированные операции пропускаются.
              </p>

              <button type="button" disabled={saving || !ozonFile} onClick={() => void importOzon()} style={importButton}>
                {saving ? <LoaderCircle size={13} /> : <FileUp size={13} />} Импортировать в MoneyCRM
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}><LoaderCircle size={17} color="#59616f" /></div>
      ) : visibleConnections.length === 0 ? (
        <div style={emptyBox}>
          <Landmark size={19} color="#59616f" style={{ marginBottom: 7 }} />
          <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 750 }}>В этом разделе банковских счетов пока нет</p>
          <p style={{ margin: 0, color: '#59616f', fontSize: 8 }}>Подключите банк или переключите раздел сверху.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
          {visibleConnections.map(connection => {
            const active = connection.status === 'active'
            const connectionLinks = visibleLinks.filter(link => link.connection_id === connection.id)
            return (
              <div key={connection.id} style={connectionBox(active)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={statusIcon(active)}>
                    {active ? <CheckCircle2 size={14} color="#34d399" /> : <Landmark size={14} color="#f59e0b" />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 800 }}>{connection.institution_name || connection.provider_bank_code || 'Банк'}</p>
                    <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 8 }}>{connection.linked_accounts} сч. · {dateLabel(connection.last_synced_at)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button disabled={saving || !active} onClick={() => void sync(connection)} title={connection.provider === 'ozon_statement' ? 'Загрузить свежую выписку' : 'Синхронизировать'} style={iconButton}>
                      {connection.provider === 'ozon_statement' ? <FileUp size={12} /> : <RefreshCw size={12} />}
                    </button>
                    <button disabled={saving} onClick={() => void disconnect(connection)} title="Отключить" style={iconButton}><Unplug size={12} /></button>
                  </div>
                </div>

                {connectionLinks.length > 0 && (
                  <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                    {connectionLinks.map(link => {
                      const color = KIND_COLOR[link.workspace_kind]
                      return (
                        <div key={link.id} style={accountRow}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 10, fontWeight: 780, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.account_name}</p>
                            <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 8 }}>
                              {link.account_mask ? `•• ${link.account_mask}` : link.external_name || 'Банковский счёт'}
                            </p>
                          </div>
                          <div style={{ width: 128 }}>
                            <p style={{ margin: '0 0 4px', color, fontSize: 7, fontWeight: 800 }}>{KIND_LABEL[link.workspace_kind]}</p>
                            <select
                              disabled={saving}
                              value={link.workspace_id}
                              onChange={e => void route(link, e.target.value)}
                              style={{ ...inputStyle, minHeight: 34, fontSize: 9, padding: '0 8px' }}
                            >
                              {workspaces.map(workspace => (
                                <option key={workspace.id} value={workspace.id}>{KIND_LABEL[workspace.kind]}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

const cardStyle = { background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 16 } as const
const bankIconBox = { width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#60a5fa12', border: '1px solid #60a5fa25' } as const
const smallButton = { minHeight: 34, padding: '0 11px', borderRadius: 10, border: '1px solid #2a2d3a', display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 800, cursor: 'pointer' } as const
const safeBox = { display: 'flex', gap: 8, marginTop: 11, padding: '9px 10px', borderRadius: 11, background: '#0f1116', border: '1px solid #20232b' } as const
const successBox = { marginTop: 10, padding: '9px 10px', borderRadius: 10, background: '#34d3990d', border: '1px solid #34d39925', color: '#86efac', fontSize: 9 } as const
const errorBox = { marginTop: 10, padding: '9px 10px', borderRadius: 10, background: '#f8717110', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 9 } as const
const connectBox = { marginTop: 12, padding: 11, borderRadius: 13, background: '#0d0f14', border: '1px solid #252a35' } as const
const ozonBox = { marginTop: 10, padding: 11, borderRadius: 13, background: '#11140d', border: '1px solid #e4f03030' } as const
const fieldLabel = { margin: '0 0 5px', color: '#68717f', fontSize: 8, fontWeight: 750, textTransform: 'uppercase' } as const
const inputStyle = { width: '100%', minHeight: 40, borderRadius: 10, border: '1px solid #2a2d3a', background: '#0d0f14', color: '#e5e7eb', padding: '0 10px', fontSize: 10, outline: 'none', boxSizing: 'border-box' as const } as const
const providerButton = { minHeight: 46, padding: '0 11px', borderRadius: 11, border: '1px solid #232731', background: '#12151b', color: '#d1d5db', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', textAlign: 'left' as const } as const
const providerIcon = { width: 30, height: 30, borderRadius: 9, background: '#60a5fa10', border: '1px solid #60a5fa20', display: 'grid', placeItems: 'center', flexShrink: 0 } as const
const emptyText = { margin: 0, padding: 12, textAlign: 'center', color: '#59616f', fontSize: 9 } as const
const emptyBox = { marginTop: 12, padding: '16px 12px', borderRadius: 13, border: '1px dashed #2a2d3a', textAlign: 'center' as const } as const
const accountRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, background: '#0d0f14', border: '1px solid #20232b' } as const
const iconButton = { width: 30, height: 30, borderRadius: 9, border: '1px solid #282c36', background: '#15181f', color: '#7b8491', display: 'grid', placeItems: 'center', cursor: 'pointer' } as const
const outlineButton = { minHeight: 32, padding: '0 9px', borderRadius: 9, border: '1px solid #343924', background: '#171a10', color: '#cfd86a', display: 'flex', alignItems: 'center', gap: 5, fontSize: 8, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' as const } as const
const fileDrop = { minHeight: 44, borderRadius: 10, border: '1px dashed #444a28', background: '#0d0f0a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#d1d5db', cursor: 'pointer', padding: '8px 10px' } as const
const importButton = { width: '100%', minHeight: 40, marginTop: 10, borderRadius: 10, border: 0, background: '#e4f030', color: '#0c0d10', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 9, fontWeight: 900, cursor: 'pointer' } as const
const connectionBox = (active: boolean) => ({ padding: '10px 11px', borderRadius: 12, background: '#101218', border: `1px solid ${active ? '#34d39922' : '#f59e0b28'}` }) as const
const statusIcon = (active: boolean) => ({ width: 32, height: 32, borderRadius: 10, background: active ? '#34d39910' : '#f59e0b10', border: `1px solid ${active ? '#34d39925' : '#f59e0b25'}`, display: 'grid', placeItems: 'center' }) as const
