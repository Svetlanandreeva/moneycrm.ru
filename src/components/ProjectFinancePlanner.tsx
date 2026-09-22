import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarClock, CircleDollarSign, Plus, ReceiptText, TrendingUp, WalletCards, X } from 'lucide-react'
import { formatMoneyMinor, listAccountsForWorkspaces, listWorkspaces, type MoneyAccount } from '../lib/moneycrm'
import {
  addExpectedProjectPayment,
  listProjectFinanceRows,
  recordProjectExpense,
  type ExpectedPaymentType,
  type ProjectExpenseType,
  type ProjectFinanceRow,
} from '../lib/projectFinance'

const EXPENSE_LABELS: Record<ProjectExpenseType, string> = {
  materials: 'Материалы',
  labor: 'Работа',
  contractor: 'Подрядчики',
  logistics: 'Доставка / логистика',
  packaging: 'Упаковка',
  fees: 'Комиссии',
  taxes: 'Налоги',
  other: 'Другое',
}

const PAYMENT_LABELS: Record<ExpectedPaymentType, string> = {
  prepayment: 'Предоплата',
  final: 'Финальная оплата',
  full: 'Полная оплата',
  other: 'Другой платёж',
}

const inputStyle = {
  width: '100%', minHeight: 42, borderRadius: 11, border: '1px solid #2a2d3a', background: '#0d0f14',
  color: '#e5e7eb', padding: '0 11px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const,
}

function toMinor(value: string) {
  const numeric = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0
}

export function ProjectFinancePlanner({ onChanged }: { onChanged?: () => void }) {
  const [projects, setProjects] = useState<ProjectFinanceRow[]>([])
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [expenseProjectId, setExpenseProjectId] = useState<string | null>(null)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseType, setExpenseType] = useState<ProjectExpenseType>('materials')
  const [expenseAccountId, setExpenseAccountId] = useState('')
  const [expenseCounterparty, setExpenseCounterparty] = useState('')
  const [expenseNote, setExpenseNote] = useState('')

  const [planProjectId, setPlanProjectId] = useState<string | null>(null)
  const [plannedAmount, setPlannedAmount] = useState('')
  const [plannedType, setPlannedType] = useState<ExpectedPaymentType>('final')
  const [plannedDate, setPlannedDate] = useState('')
  const [plannedLabel, setPlannedLabel] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const workspaces = await listWorkspaces()
      const business = workspaces.find(workspace => workspace.kind === 'business')
      const [rows, nextAccounts] = await Promise.all([
        listProjectFinanceRows(),
        business ? listAccountsForWorkspaces([business.id]) : Promise.resolve([]),
      ])
      setProjects(rows)
      setAccounts(nextAccounts)
      setExpenseAccountId(current => current || nextAccounts[0]?.id || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить экономику проектов')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const totals = useMemo(() => projects.reduce((acc, project) => {
    acc.cost += project.actual_cost_minor
    acc.cash += project.project_cash_remaining_minor
    acc.profit += project.projected_profit_minor
    return acc
  }, { cost: 0, cash: 0, profit: 0 }), [projects])

  async function submitExpense(event: FormEvent) {
    event.preventDefault()
    if (!expenseProjectId || !expenseAccountId || toMinor(expenseAmount) <= 0) return
    setSaving(true)
    setError('')
    try {
      await recordProjectExpense({
        projectId: expenseProjectId,
        accountId: expenseAccountId,
        amountMinor: toMinor(expenseAmount),
        expenseType,
        counterparty: expenseCounterparty,
        note: expenseNote,
      })
      setExpenseAmount('')
      setExpenseCounterparty('')
      setExpenseNote('')
      setExpenseType('materials')
      setExpenseProjectId(null)
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить расход')
    } finally {
      setSaving(false)
    }
  }

  async function submitPlan(event: FormEvent) {
    event.preventDefault()
    if (!planProjectId || toMinor(plannedAmount) <= 0) return
    setSaving(true)
    setError('')
    try {
      await addExpectedProjectPayment({
        projectId: planProjectId,
        amountMinor: toMinor(plannedAmount),
        paymentType: plannedType,
        dueAt: plannedDate ? `${plannedDate}T12:00:00` : undefined,
        label: plannedLabel,
      })
      setPlannedAmount('')
      setPlannedDate('')
      setPlannedLabel('')
      setPlannedType('final')
      setPlanProjectId(null)
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось запланировать платёж')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 28, textAlign: 'center', color: '#59616f', fontSize: 11 }}>Загружаю экономику проектов…</div>
  if (projects.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 15 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: '#34d39912', border: '1px solid #34d39925', display: 'grid', placeItems: 'center' }}>
            <TrendingUp size={16} color="#34d399" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Экономика проектов</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#59616f' }}>Расходы уменьшают деньги проекта и будущую прибыль.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
          <SummaryCell label="Расходы" value={formatMoneyMinor(totals.cost)} color="#f87171" />
          <SummaryCell label="В проектах" value={formatMoneyMinor(totals.cash)} color="#f59e0b" />
          <SummaryCell label="Прогноз прибыли" value={formatMoneyMinor(totals.profit)} color="#34d399" />
        </div>
      </section>

      {error && <div style={{ padding: '10px 12px', borderRadius: 12, background: '#f8717110', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 11 }}>{error}</div>}

      {projects.map(project => {
        const expenseOpen = expenseProjectId === project.project_id
        const planOpen = planProjectId === project.project_id
        return (
          <section key={project.project_id} style={{ background: '#111318', border: '1px solid #20232c', borderRadius: 18, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</p>
                <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 9 }}>{project.client_name || 'Клиент не указан'}</p>
              </div>
              <span style={{ fontSize: 9, color: '#34d399', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>{formatMoneyMinor(project.projected_profit_minor)}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 7, marginTop: 11 }}>
              <ValueCell label="Фактические расходы" value={formatMoneyMinor(project.actual_cost_minor)} color="#f87171" />
              <ValueCell label="Осталось в проекте" value={formatMoneyMinor(project.project_cash_remaining_minor)} color="#f59e0b" />
              <ValueCell label="К получению" value={formatMoneyMinor(project.outstanding_minor)} color="#c084fc" />
              <ValueCell label="Вложено своих" value={formatMoneyMinor(project.owner_funded_minor)} color={project.owner_funded_minor > 0 ? '#f87171' : '#6b7280'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 10 }}>
              <button onClick={() => { setExpenseProjectId(expenseOpen ? null : project.project_id); setPlanProjectId(null) }} style={secondaryButton}>
                {expenseOpen ? <X size={13} /> : <ReceiptText size={13} />} {expenseOpen ? 'Закрыть' : 'Добавить расход'}
              </button>
              <button onClick={() => { setPlanProjectId(planOpen ? null : project.project_id); setExpenseProjectId(null); if (!plannedAmount && project.outstanding_minor > 0) setPlannedAmount(String(project.outstanding_minor / 100)) }} style={secondaryButton}>
                {planOpen ? <X size={13} /> : <CalendarClock size={13} />} {planOpen ? 'Закрыть' : 'План платежа'}
              </button>
            </div>

            {expenseOpen && (
              <form onSubmit={submitExpense} style={formBox}>
                <p style={formTitle}>Расход по проекту</p>
                <input style={inputStyle} value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} inputMode="decimal" placeholder="Сумма, ₽" required />
                <select style={inputStyle} value={expenseType} onChange={e => setExpenseType(e.target.value as ProjectExpenseType)}>
                  {Object.entries(EXPENSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select style={inputStyle} value={expenseAccountId} onChange={e => setExpenseAccountId(e.target.value)} required>
                  <option value="">С какого счёта</option>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <input style={inputStyle} value={expenseCounterparty} onChange={e => setExpenseCounterparty(e.target.value)} placeholder="Поставщик / исполнитель" />
                <input style={inputStyle} value={expenseNote} onChange={e => setExpenseNote(e.target.value)} placeholder="Комментарий" />
                <button disabled={saving || accounts.length === 0} style={primaryButton}>{saving ? 'Сохраняю…' : 'Записать расход'}</button>
              </form>
            )}

            {planOpen && (
              <form onSubmit={submitPlan} style={formBox}>
                <p style={formTitle}>Запланированное поступление</p>
                <input style={inputStyle} value={plannedAmount} onChange={e => setPlannedAmount(e.target.value)} inputMode="decimal" placeholder="Сумма, ₽" required />
                <select style={inputStyle} value={plannedType} onChange={e => setPlannedType(e.target.value as ExpectedPaymentType)}>
                  {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input style={inputStyle} type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} />
                <input style={inputStyle} value={plannedLabel} onChange={e => setPlannedLabel(e.target.value)} placeholder="Название, например: Остаток 70%" />
                <div style={{ padding: '9px 10px', borderRadius: 10, background: '#11151b', border: '1px solid #252a35', color: '#68717f', fontSize: 9, lineHeight: 1.45 }}>
                  После фактической оплаты этот план автоматически уменьшится или закроется.
                </div>
                <button disabled={saving} style={primaryButton}>{saving ? 'Сохраняю…' : 'Добавить в план'}</button>
              </form>
            )}
          </section>
        )
      })}
    </div>
  )
}

function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  return <div style={{ padding: '10px 8px', borderRadius: 11, background: '#101218', border: '1px solid #1f222b', minWidth: 0 }}><p style={{ margin: '0 0 4px', color: '#59616f', fontSize: 8, textTransform: 'uppercase' }}>{label}</p><p style={{ margin: 0, fontSize: 11, fontWeight: 800, color, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p></div>
}

function ValueCell({ label, value, color }: { label: string; value: string; color: string }) {
  return <div style={{ padding: '9px 10px', borderRadius: 10, background: '#0e1015', border: '1px solid #1d2028' }}><p style={{ margin: '0 0 4px', fontSize: 8, color: '#59616f' }}>{label}</p><p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 800, color }}>{value}</p></div>
}

const secondaryButton = { minHeight: 38, borderRadius: 10, border: '1px solid #2a2d3a', background: '#171a21', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' } as const
const primaryButton = { minHeight: 42, borderRadius: 11, border: 0, background: '#e4f030', color: '#0c0d10', fontSize: 11, fontWeight: 850, cursor: 'pointer' } as const
const formBox = { display: 'grid', gap: 8, marginTop: 10, padding: 11, borderRadius: 12, background: '#0d0f14', border: '1px solid #252a35' } as const
const formTitle = { margin: 0, fontSize: 11, fontWeight: 800, color: '#d1d5db' } as const
