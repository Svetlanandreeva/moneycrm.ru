import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { ACCOUNTS as DEMO_ACCOUNTS } from '../data'
import { createAccount, getPrimaryWorkspace, listAccounts, type MoneyAccount } from '../lib/moneycrm'
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

function formatMinor(value: number, currency = 'RUB') {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100)
}

export function MoneyScreen({ show }: { show: boolean }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [accountType, setAccountType] = useState<MoneyAccount['account_type']>('bank')
  const [openingBalance, setOpeningBalance] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!isSupabaseConfigured) return
    setLoading(true)
    setError('')
    try {
      const workspace = await getPrimaryWorkspace()
      if (!workspace) {
        setWorkspaceId(null)
        setAccounts([])
        return
      }
      setWorkspaceId(workspace.id)
      setAccounts(await listAccounts(workspace.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить счета')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const totalMinor = useMemo(() => accounts.reduce((sum, account) => sum + account.balance_minor, 0), [accounts])

  async function submitAccount(event: FormEvent) {
    event.preventDefault()
    if (!workspaceId || !name.trim()) return

    const numeric = Number(openingBalance.replace(/\s/g, '').replace(',', '.'))
    const openingBalanceMinor = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0

    setSaving(true)
    setError('')
    try {
      await createAccount({
        workspaceId,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 20, padding: 16 }}>
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 16 }}>🏦 Мои счета</p>
          {DEMO_ACCOUNTS.map((a, i) => (
            <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < DEMO_ACCOUNTS.length - 1 ? '1px solid #1e2028' : 'none' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: `${a.dot}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${a.dot}40`, flexShrink: 0 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: a.dot, display: 'inline-block' }} /></div>
              <div style={{ flex: 1 }}><p style={{ fontSize: 15, fontWeight: 700 }}>{a.name}</p><p style={{ fontSize: 11, color: '#4b5563' }}>{a.type}</p></div>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700 }}>{show ? `${a.balance} ₽` : '•••'}</p>
            </div>
          ))}
          <button style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 14, border: '1.5px dashed #2a2d3a', background: 'transparent', color: '#4b5563', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={15} /> Добавить счёт</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 20, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 20, fontWeight: 800, margin: 0 }}>🏦 Мои счета</p>
            {!loading && <p style={{ color: '#555c68', fontSize: 11, margin: '4px 0 0' }}>{accounts.length} счетов · {show ? formatMinor(totalMinor) : '••••• ₽'}</p>}
          </div>
          <button onClick={() => setFormOpen(v => !v)} style={{ width: 36, height: 36, borderRadius: 11, border: '1px solid #2a2d3a', background: formOpen ? '#e4f030' : '#1c1e26', color: formOpen ? '#0c0d10' : '#9ca3af', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            {formOpen ? <X size={16} /> : <Plus size={16} />}
          </button>
        </div>

        {error && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: '#f8717112', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 11 }}>{error}</div>}

        {formOpen && (
          <form onSubmit={submitAccount} style={{ display: 'grid', gap: 10, padding: 12, marginBottom: 12, borderRadius: 14, background: '#101218', border: '1px solid #242731' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Название счёта" required style={inputStyle} />
            <input value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Банк / организация (необязательно)" style={inputStyle} />
            <select value={accountType} onChange={e => setAccountType(e.target.value as MoneyAccount['account_type'])} style={inputStyle}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} inputMode="decimal" placeholder="Начальный баланс, ₽" style={inputStyle} />
            <button disabled={saving} style={{ minHeight: 44, borderRadius: 12, border: 0, background: '#e4f030', color: '#0c0d10', fontWeight: 800, cursor: 'pointer' }}>{saving ? 'Сохраняю…' : 'Создать счёт'}</button>
          </form>
        )}

        {loading ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#555c68', fontSize: 12 }}>Загружаю счета…</div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: '30px 14px', textAlign: 'center', border: '1px dashed #2a2d3a', borderRadius: 16 }}>
            <p style={{ margin: '0 0 6px', fontWeight: 750 }}>Добавьте первый счёт</p>
            <p style={{ margin: 0, color: '#555c68', fontSize: 11 }}>Карта, наличные, накопительный или бизнес-счёт.</p>
          </div>
        ) : accounts.map((account, i) => {
          const dot = account.color || TYPE_COLORS[account.account_type]
          return (
            <div key={account.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < accounts.length - 1 ? '1px solid #1e2028' : 'none' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: `${dot}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${dot}40`, flexShrink: 0 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: dot, display: 'inline-block' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{account.name}</p>
                <p style={{ fontSize: 11, color: '#4b5563', margin: '2px 0 0' }}>{account.institution || TYPE_LABELS[account.account_type]}</p>
              </div>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 700, margin: 0 }}>{show ? formatMinor(account.balance_minor, account.currency) : '•••'}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  minHeight: 44,
  padding: '0 12px',
  borderRadius: 12,
  border: '1px solid #2a2d3a',
  outline: 0,
  background: '#14161c',
  color: '#f0f0f0',
  fontSize: 13,
} as const
