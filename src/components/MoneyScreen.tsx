import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Briefcase, Landmark, Layers, Plus, User, Users, WalletCards, X } from 'lucide-react'
import {
  contextToKind,
  createAccount,
  formatMoneyMinor,
  listAccountsForWorkspaces,
  listWorkspaces,
  selectWorkspacesForContext,
  type FinanceContext,
  type MoneyAccount,
  type Workspace,
  type WorkspaceKind,
} from '../lib/moneycrm'
import { isSupabaseConfigured } from '../lib/supabase'

const TYPE_LABELS: Record<MoneyAccount['account_type'], string> = {
  cash: 'Наличные',
  bank: 'Банковский счёт',
  savings: 'Накопительный',
  credit: 'Кредитный',
  investment: 'Инвестиционный',
  business: 'Бизнес-счёт',
  other: 'Другой',
}

const TYPE_COLORS: Record<MoneyAccount['account_type'], string> = {
  cash: '#34d399',
  bank: '#60a5fa',
  savings: '#e4f030',
  credit: '#f87171',
  investment: '#c084fc',
  business: '#f59e0b',
  other: '#9ca3af',
}

const KIND_META: Record<WorkspaceKind, { label: string; color: string; icon: typeof User }> = {
  personal: { label: 'Личные', color: '#60a5fa', icon: User },
  family: { label: 'Семья', color: '#c084fc', icon: Users },
  business: { label: 'Бизнес', color: '#f59e0b', icon: Briefcase },
}

const inputStyle = {
  width: '100%',
  minHeight: 44,
  borderRadius: 12,
  border: '1px solid #2a2d3a',
  background: '#0d0f14',
  color: '#e5e7eb',
  padding: '0 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box' as const,
}

function screenTitle(ctx: FinanceContext) {
  if (ctx === 'Личные') return 'Личные счета'
  if (ctx === 'Семья') return 'Семейные счета'
  if (ctx === 'Бизнес') return 'Счета бизнеса'
  return 'Все счета'
}

function screenDescription(ctx: FinanceContext) {
  if (ctx === 'Личные') return 'Карты, наличные и личные накопления.'
  if (ctx === 'Семья') return 'Только общие деньги и семейный бюджет.'
  if (ctx === 'Бизнес') return 'Расчётные счета, касса и деньги бизнеса.'
  return 'Личные, семейные и бизнес-счета в одном списке.'
}

export function MoneyScreen({ show, ctx = 'Все' }: { show: boolean; ctx?: FinanceContext }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [accountType, setAccountType] = useState<MoneyAccount['account_type']>('bank')
  const [openingBalance, setOpeningBalance] = useState('')
  const [targetKind, setTargetKind] = useState<WorkspaceKind>('personal')
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!isSupabaseConfigured) return
    setLoading(true)
    setError('')
    try {
      const nextWorkspaces = await listWorkspaces()
      const selected = selectWorkspacesForContext(nextWorkspaces, ctx)
      setWorkspaces(nextWorkspaces)
      setAccounts(await listAccountsForWorkspaces(selected.map(workspace => workspace.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить счета')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const fixedKind = contextToKind(ctx)
    if (fixedKind) setTargetKind(fixedKind)
    void load()
  }, [ctx])

  const totalMinor = useMemo(() => accounts.reduce((sum, account) => sum + account.balance_minor, 0), [accounts])
  const workspaceById = useMemo(() => new Map(workspaces.map(workspace => [workspace.id, workspace])), [workspaces])
  const selectedWorkspace = workspaces.find(workspace => workspace.kind === targetKind) ?? null

  async function submitAccount(event: FormEvent) {
    event.preventDefault()
    if (!selectedWorkspace || !name.trim()) return

    const numeric = Number(openingBalance.replace(/\s/g, '').replace(',', '.'))
    const openingBalanceMinor = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0

    setSaving(true)
    setError('')
    try {
      await createAccount({
        workspaceId: selectedWorkspace.id,
        name,
        institution,
        accountType,
        openingBalanceMinor,
      })
      setName('')
      setInstitution('')
      setOpeningBalance('')
      setAccountType('bank')
      setFormOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать счёт')
    } finally {
      setSaving(false)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div style={{ padding: 20, borderRadius: 18, background: '#14161c', border: '1px solid #1e2028', color: '#9ca3af', fontSize: 12 }}>
        Подключение к базе не настроено.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 20, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <div style={{ width: 40, height: 40, borderRadius: 13, background: '#e4f03012', border: '1px solid #e4f03028', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <WalletCards size={18} color="#e4f030" />
            </div>
            <div>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 20, fontWeight: 800, margin: 0 }}>{screenTitle(ctx)}</p>
              <p style={{ color: '#555c68', fontSize: 11, margin: '4px 0 0', lineHeight: 1.4 }}>{screenDescription(ctx)}</p>
            </div>
          </div>
          <button onClick={() => setFormOpen(value => !value)} style={{ width: 36, height: 36, borderRadius: 11, border: '1px solid #2a2d3a', background: formOpen ? '#e4f030' : '#1c1e26', color: formOpen ? '#0c0d10' : '#9ca3af', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
            {formOpen ? <X size={16} /> : <Plus size={16} />}
          </button>
        </div>

        {!loading && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 12px', marginBottom: 12, borderRadius: 13, background: '#101218', border: '1px solid #1f222b' }}>
            <div>
              <p style={{ margin: '0 0 3px', color: '#59616f', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Счетов</p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{accounts.length}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: '0 0 3px', color: '#59616f', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>На счетах</p>
              <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 800, color: '#e4f030' }}>{show ? formatMoneyMinor(totalMinor) : '••••• ₽'}</p>
            </div>
          </div>
        )}

        {error && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: '#f8717112', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 11 }}>{error}</div>}

        {formOpen && (
          <form onSubmit={submitAccount} style={{ display: 'grid', gap: 10, padding: 12, marginBottom: 14, borderRadius: 14, background: '#101218', border: '1px solid #242731' }}>
            {ctx === 'Все' && (
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 10, color: '#6b7280', fontWeight: 700 }}>Куда добавить счёт</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                  {(Object.keys(KIND_META) as WorkspaceKind[]).map(kind => {
                    const meta = KIND_META[kind]
                    const Icon = meta.icon
                    const active = targetKind === kind
                    return (
                      <button type="button" key={kind} onClick={() => setTargetKind(kind)} style={{ minHeight: 48, borderRadius: 11, border: `1px solid ${active ? `${meta.color}55` : '#252a35'}`, background: active ? `${meta.color}12` : '#0d0f14', color: active ? meta.color : '#707886', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                        <Icon size={13} /> {meta.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <input value={name} onChange={event => setName(event.target.value)} placeholder="Название счёта" required style={inputStyle} />
            <input value={institution} onChange={event => setInstitution(event.target.value)} placeholder="Банк / организация (необязательно)" style={inputStyle} />
            <select value={accountType} onChange={event => setAccountType(event.target.value as MoneyAccount['account_type'])} style={inputStyle}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={openingBalance} onChange={event => setOpeningBalance(event.target.value)} inputMode="decimal" placeholder="Начальный баланс, ₽" style={inputStyle} />
            <button disabled={saving || !selectedWorkspace} style={{ minHeight: 44, borderRadius: 12, border: 0, background: '#e4f030', color: '#0c0d10', fontWeight: 800, cursor: 'pointer', opacity: saving || !selectedWorkspace ? 0.55 : 1 }}>{saving ? 'Сохраняю…' : 'Создать счёт'}</button>
          </form>
        )}

        {loading ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#555c68', fontSize: 12 }}>Загружаю счета…</div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: '30px 14px', textAlign: 'center', border: '1px dashed #2a2d3a', borderRadius: 16 }}>
            <Landmark size={22} color="#59616f" style={{ marginBottom: 9 }} />
            <p style={{ margin: '0 0 6px', fontWeight: 750 }}>Здесь пока нет счетов</p>
            <p style={{ margin: 0, color: '#555c68', fontSize: 11 }}>Нажмите + и добавьте первый счёт в этот контекст.</p>
          </div>
        ) : accounts.map((account, index) => {
          const dot = account.color || TYPE_COLORS[account.account_type]
          const workspace = workspaceById.get(account.workspace_id)
          const meta = workspace ? KIND_META[workspace.kind] : null
          const MetaIcon = meta?.icon ?? Layers
          return (
            <div key={account.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderBottom: index < accounts.length - 1 ? '1px solid #1e2028' : 'none' }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: `${dot}16`, display: 'grid', placeItems: 'center', border: `1px solid ${dot}35`, flexShrink: 0 }}>
                <Landmark size={17} color={dot} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: '#555c68' }}>{account.institution || TYPE_LABELS[account.account_type]}</span>
                  {ctx === 'Все' && meta && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, fontWeight: 700, color: meta.color, background: `${meta.color}10`, border: `1px solid ${meta.color}20`, padding: '2px 5px', borderRadius: 6 }}>
                      <MetaIcon size={9} /> {meta.label}
                    </span>
                  )}
                </div>
              </div>
              <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 800 }}>{show ? formatMoneyMinor(account.balance_minor, account.currency) : '•••'}</p>
            </div>
          )
        })}
      </section>
    </div>
  )
}
