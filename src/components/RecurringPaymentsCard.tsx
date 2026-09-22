import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Check, CircleDollarSign, Plus, Repeat2, WalletCards, X } from 'lucide-react'
import { formatMoneyMinor, type FinanceContext } from '../lib/moneycrm'
import {
  createRecurringPayment,
  listRecurringPayments,
  markRecurringPaymentPaid,
  recurrenceLabel,
  type Recurrence,
  type RecurringPayment,
  type RecurringPaymentsBundle,
} from '../lib/recurringPayments'

const EMPTY: RecurringPaymentsBundle = { workspaces: [], accounts: [], payments: [] }

const inputStyle = {
  width: '100%', minHeight: 42, borderRadius: 11, border: '1px solid #2a2d3a', background: '#0d0f14',
  color: '#e5e7eb', padding: '0 11px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const,
}

const CATEGORIES = ['Аренда', 'Подписки', 'Налоги', 'Зарплаты', 'Кредит', 'Связь', 'Коммунальные', 'Логистика', 'Другое']

function toMinor(value: string) {
  const numeric = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0
}

function daysUntil(date: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${date}T12:00:00`)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

function dueLabel(date: string) {
  const days = daysUntil(date)
  const formatted = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`))
  if (days < 0) return `${formatted} · просрочено ${Math.abs(days)} дн.`
  if (days === 0) return `${formatted} · сегодня`
  if (days === 1) return `${formatted} · завтра`
  return `${formatted} · через ${days} дн.`
}

export function RecurringPaymentsCard({ ctx, show }: { ctx: FinanceContext; show: boolean }) {
  const [bundle, setBundle] = useState<RecurringPaymentsBundle>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [workspaceId, setWorkspaceId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [title, setTitle] = useState('')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('monthly')
  const [category, setCategory] = useState('Аренда')
  const [reminders, setReminders] = useState<number[]>([7, 3, 1])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const next = await listRecurringPayments(ctx)
      setBundle(next)
      setWorkspaceId(current => {
        if (current && next.workspaces.some(workspace => workspace.id === current)) return current
        return next.workspaces[0]?.id || ''
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить обязательные платежи')
      setBundle(EMPTY)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [ctx])

  const accountMap = useMemo(() => new Map(bundle.accounts.map(account => [account.id, account])), [bundle.accounts])
  const workspaceMap = useMemo(() => new Map(bundle.workspaces.map(workspace => [workspace.id, workspace])), [bundle.workspaces])
  const formAccounts = bundle.accounts.filter(account => account.workspace_id === workspaceId)

  const projected = useMemo(() => {
    const balances = new Map(bundle.accounts.map(account => [account.id, account.balance_minor]))
    const committed = new Map<string, number>()
    return [...bundle.payments].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date) || a.id.localeCompare(b.id)).map(payment => {
      let shortage = 0
      let availableBefore: number | null = null
      if (payment.account_id) {
        const balance = balances.get(payment.account_id) ?? 0
        const prior = committed.get(payment.account_id) ?? 0
        availableBefore = balance - prior
        shortage = Math.max(payment.amount_minor - availableBefore, 0)
        committed.set(payment.account_id, prior + payment.amount_minor)
      }
      return { payment, shortage, availableBefore }
    })
  }, [bundle])

  const next30Total = projected
    .filter(item => daysUntil(item.payment.next_due_date) >= 0 && daysUntil(item.payment.next_due_date) <= 30)
    .reduce((sum, item) => sum + item.payment.amount_minor, 0)
  const shortageCount = projected.filter(item => item.shortage > 0 && daysUntil(item.payment.next_due_date) <= 30).length

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!workspaceId || !title.trim() || !dueDate || toMinor(amount) <= 0) return
    setSaving(true)
    setError('')
    try {
      await createRecurringPayment({
        workspaceId,
        accountId: accountId || undefined,
        title,
        payee,
        amountMinor: toMinor(amount),
        recurrence,
        nextDueDate: dueDate,
        reminderDaysBefore: reminders,
        categoryLabel: category,
      })
      setTitle('')
      setPayee('')
      setAmount('')
      setDueDate('')
      setRecurrence('monthly')
      setCategory('Аренда')
      setReminders([7, 3, 1])
      setAccountId('')
      setOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать платёж')
    } finally {
      setSaving(false)
    }
  }

  async function markPaid(payment: RecurringPayment) {
    setSaving(true)
    setError('')
    try {
      await markRecurringPaymentPaid(payment.id, Boolean(payment.account_id))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отметить платёж')
    } finally {
      setSaving(false)
    }
  }

  function toggleReminder(days: number) {
    setReminders(current => current.includes(days) ? current.filter(value => value !== days) : [...current, days].sort((a, b) => b - a))
  }

  return (
    <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: '#f59e0b12', border: '1px solid #f59e0b25', display: 'grid', placeItems: 'center' }}>
            <CalendarClock size={16} color="#f59e0b" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Обязательные платежи</p>
            <p style={{ margin: '3px 0 0', fontSize: 9, color: '#59616f' }}>Что, когда, сколько и с какого счёта.</p>
          </div>
        </div>
        <button onClick={() => setOpen(value => !value)} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #2a2d3a', background: open ? '#e4f030' : '#191c23', color: open ? '#0c0d10' : '#9ca3af', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          {open ? <X size={15} /> : <Plus size={15} />}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 13 }}>
        <div style={summaryStyle}>
          <p style={summaryLabel}>Следующие 30 дней</p>
          <p style={{ ...summaryValue, color: '#f59e0b' }}>{show ? formatMoneyMinor(next30Total) : '•••• ₽'}</p>
        </div>
        <div style={summaryStyle}>
          <p style={summaryLabel}>Риск нехватки</p>
          <p style={{ ...summaryValue, color: shortageCount ? '#f87171' : '#34d399' }}>{shortageCount ? `${shortageCount} плат.` : 'Нет'}</p>
        </div>
      </div>

      {error && <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 11, background: '#f8717110', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 10 }}>{error}</div>}

      {open && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 8, marginTop: 12, padding: 11, borderRadius: 13, background: '#0d0f14', border: '1px solid #252a35' }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800 }}>Новый постоянный расход</p>
          {bundle.workspaces.length > 1 && (
            <select style={inputStyle} value={workspaceId} onChange={e => { setWorkspaceId(e.target.value); setAccountId('') }} required>
              {bundle.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          )}
          <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Название: аренда офиса" required />
          <input style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="Сумма, ₽" required />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <input style={inputStyle} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
            <select style={inputStyle} value={recurrence} onChange={e => setRecurrence(e.target.value as Recurrence)}>
              <option value="monthly">Каждый месяц</option>
              <option value="weekly">Каждую неделю</option>
              <option value="quarterly">Каждый квартал</option>
              <option value="yearly">Каждый год</option>
              <option value="one_time">Один раз</option>
            </select>
          </div>
          <select style={inputStyle} value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">Счёт пока не выбран</option>
            {formAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {formatMoneyMinor(account.balance_minor, account.currency)}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <input style={inputStyle} value={payee} onChange={e => setPayee(e.target.value)} placeholder="Кому платим" />
          </div>
          <div>
            <p style={{ margin: '1px 0 6px', fontSize: 9, color: '#68717f' }}>Напомнить заранее</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {[7, 3, 1].map(days => {
                const active = reminders.includes(days)
                return <button type="button" key={days} onClick={() => toggleReminder(days)} style={{ flex: 1, minHeight: 32, borderRadius: 9, border: active ? '1px solid #e4f03070' : '1px solid #2a2d3a', background: active ? '#e4f03012' : '#14161c', color: active ? '#e4f030' : '#6b7280', fontSize: 9, fontWeight: 750, cursor: 'pointer' }}>за {days} дн.</button>
              })}
            </div>
          </div>
          <button disabled={saving} style={{ minHeight: 41, borderRadius: 11, border: 0, background: '#e4f030', color: '#0c0d10', fontWeight: 850, fontSize: 11, cursor: 'pointer' }}>{saving ? 'Сохраняю…' : 'Добавить платёж'}</button>
        </form>
      )}

      {loading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: '#59616f', fontSize: 10 }}>Загружаю платежи…</div>
      ) : projected.length === 0 ? (
        <div style={{ marginTop: 12, padding: '18px 12px', border: '1px dashed #2a2d3a', borderRadius: 13, textAlign: 'center' }}>
          <Repeat2 size={20} color="#59616f" style={{ marginBottom: 7 }} />
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 750 }}>Постоянных платежей пока нет</p>
          <p style={{ margin: 0, color: '#59616f', fontSize: 9, lineHeight: 1.4 }}>Добавьте аренду, налоги, кредиты, подписки и другие обязательные расходы.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {projected.slice(0, 6).map(({ payment, shortage }) => {
            const account = payment.account_id ? accountMap.get(payment.account_id) : undefined
            const workspace = workspaceMap.get(payment.workspace_id)
            const overdue = daysUntil(payment.next_due_date) < 0
            return (
              <div key={payment.id} style={{ padding: '10px 11px', borderRadius: 12, background: '#101218', border: `1px solid ${shortage > 0 || overdue ? '#f8717130' : '#1f222b'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: shortage > 0 || overdue ? '#f8717110' : '#f59e0b10', border: `1px solid ${shortage > 0 || overdue ? '#f8717125' : '#f59e0b22'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {shortage > 0 || overdue ? <AlertTriangle size={14} color="#f87171" /> : <CircleDollarSign size={14} color="#f59e0b" />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 780, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{payment.title}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 8, color: overdue ? '#f87171' : '#68717f' }}>{dueLabel(payment.next_due_date)} · {recurrenceLabel(payment.recurrence)}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 8, color: '#4f5663', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ctx === 'Все' && workspace ? `${workspace.name} · ` : ''}{account ? account.name : 'счёт не выбран'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 850 }}>{show ? formatMoneyMinor(payment.amount_minor, payment.currency) : '••• ₽'}</p>
                    {shortage > 0 && <p style={{ margin: '3px 0 0', fontSize: 8, color: '#f87171', fontWeight: 700 }}>не хватает {show ? formatMoneyMinor(shortage, payment.currency) : '••• ₽'}</p>}
                  </div>
                </div>
                <button disabled={saving} onClick={() => void markPaid(payment)} style={{ width: '100%', minHeight: 31, marginTop: 8, borderRadius: 9, border: '1px solid #28302a', background: '#121813', color: '#70a979', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 9, fontWeight: 750, cursor: 'pointer' }}>
                  <Check size={11} /> Оплачено
                </button>
              </div>
            )
          })}
        </div>
      )}

      {projected.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#525a67', fontSize: 9 }}>
          <WalletCards size={12} /> Нехватка считается по текущему остатку и обязательным платежам до этой даты.
        </div>
      )}
    </section>
  )
}

const summaryStyle = { padding: '10px 11px', borderRadius: 11, background: '#101218', border: '1px solid #1f222b' } as const
const summaryLabel = { margin: '0 0 4px', color: '#59616f', fontSize: 8, textTransform: 'uppercase' } as const
const summaryValue = { margin: 0, fontSize: 12, fontWeight: 850, fontFamily: 'JetBrains Mono, monospace' } as const
