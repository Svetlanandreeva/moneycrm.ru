import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarClock, HandCoins, ReceiptText, RotateCcw, TrendingUp, X } from 'lucide-react'
import { formatMoneyMinor, listAccountsForWorkspaces, listWorkspaces, type MoneyAccount } from '../lib/moneycrm'
import {
  addExpectedProjectPayment,
  listProjectFinanceRows,
  listProjectOwnerAdvances,
  recordProjectExpense,
  repayProjectOwnerAdvance,
  takeProjectOwnerAdvance,
  type ExpectedPaymentType,
  type ProjectExpenseType,
  type ProjectFinanceRow,
  type ProjectOwnerAdvance,
} from '../lib/projectFinance'

const EXPENSE_LABELS: Record<ProjectExpenseType, string> = {
  materials: 'Материалы', labor: 'Работа', contractor: 'Подрядчики', logistics: 'Доставка / логистика',
  packaging: 'Упаковка', fees: 'Комиссии', taxes: 'Налоги', other: 'Другое',
}
const PAYMENT_LABELS: Record<ExpectedPaymentType, string> = {
  prepayment: 'Предоплата', final: 'Финальная оплата', full: 'Полная оплата', other: 'Другой платёж',
}
const inputStyle = { width: '100%', minHeight: 42, borderRadius: 11, border: '1px solid #2a2d3a', background: '#0d0f14', color: '#e5e7eb', padding: '0 11px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }
const secondaryButton = { minHeight: 38, borderRadius: 10, border: '1px solid #2a2d3a', background: '#171a21', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 9, fontWeight: 700, cursor: 'pointer' } as const
const primaryButton = { minHeight: 42, borderRadius: 11, border: 0, background: '#e4f030', color: '#0c0d10', fontSize: 11, fontWeight: 850, cursor: 'pointer' } as const
const formBox = { display: 'grid', gap: 8, marginTop: 10, padding: 11, borderRadius: 12, background: '#0d0f14', border: '1px solid #252a35' } as const

function toMinor(value: string) {
  const numeric = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0
}

export function ProjectFinancePlanner({ onChanged }: { onChanged?: () => void }) {
  const [projects, setProjects] = useState<ProjectFinanceRow[]>([])
  const [advances, setAdvances] = useState<ProjectOwnerAdvance[]>([])
  const [businessAccounts, setBusinessAccounts] = useState<MoneyAccount[]>([])
  const [personalAccounts, setPersonalAccounts] = useState<MoneyAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<{ projectId: string; mode: 'expense' | 'plan' | 'advance' } | null>(null)

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [expenseType, setExpenseType] = useState<ProjectExpenseType>('materials')
  const [businessAccountId, setBusinessAccountId] = useState('')
  const [personalAccountId, setPersonalAccountId] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [plannedType, setPlannedType] = useState<ExpectedPaymentType>('final')
  const [plannedDate, setPlannedDate] = useState('')
  const [plannedLabel, setPlannedLabel] = useState('')
  const [repayAdvanceId, setRepayAdvanceId] = useState<string | null>(null)
  const [repayAmount, setRepayAmount] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const workspaces = await listWorkspaces()
      const business = workspaces.find(workspace => workspace.kind === 'business')
      const personal = workspaces.find(workspace => workspace.kind === 'personal')
      const [rows, nextAdvances, businessAcc, personalAcc] = await Promise.all([
        listProjectFinanceRows(), listProjectOwnerAdvances(),
        business ? listAccountsForWorkspaces([business.id]) : Promise.resolve([]),
        personal ? listAccountsForWorkspaces([personal.id]) : Promise.resolve([]),
      ])
      setProjects(rows); setAdvances(nextAdvances); setBusinessAccounts(businessAcc); setPersonalAccounts(personalAcc)
      setBusinessAccountId(current => current || businessAcc[0]?.id || '')
      setPersonalAccountId(current => current || personalAcc[0]?.id || '')
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить экономику проектов') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const totals = useMemo(() => projects.reduce((acc, p) => {
    acc.cost += p.actual_cost_minor; acc.cash += p.project_cash_remaining_minor; acc.profit += p.projected_profit_minor; acc.advance += p.owner_advance_outstanding_minor
    return acc
  }, { cost: 0, cash: 0, profit: 0, advance: 0 }), [projects])

  function resetForm() {
    setAmount(''); setNote(''); setCounterparty(''); setExpenseType('materials'); setPlannedDate(''); setPlannedLabel(''); setPlannedType('final')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!open || toMinor(amount) <= 0) return
    setSaving(true); setError('')
    try {
      if (open.mode === 'expense') {
        if (!businessAccountId) return
        await recordProjectExpense({ projectId: open.projectId, accountId: businessAccountId, amountMinor: toMinor(amount), expenseType, counterparty, note })
      }
      if (open.mode === 'plan') {
        await addExpectedProjectPayment({ projectId: open.projectId, amountMinor: toMinor(amount), paymentType: plannedType, dueAt: plannedDate ? `${plannedDate}T12:00:00` : undefined, label: plannedLabel, note })
      }
      if (open.mode === 'advance') {
        if (!businessAccountId || !personalAccountId) return
        await takeProjectOwnerAdvance({ projectId: open.projectId, sourceAccountId: businessAccountId, destinationAccountId: personalAccountId, amountMinor: toMinor(amount), note })
      }
      resetForm(); setOpen(null); await load(); onChanged?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить') }
    finally { setSaving(false) }
  }

  async function repay(advance: ProjectOwnerAdvance) {
    const value = toMinor(repayAmount)
    if (!businessAccountId || !personalAccountId || value <= 0) return
    setSaving(true); setError('')
    try {
      await repayProjectOwnerAdvance({ advanceId: advance.id, sourceAccountId: personalAccountId, destinationAccountId: businessAccountId, amountMinor: value })
      setRepayAdvanceId(null); setRepayAmount(''); await load(); onChanged?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось вернуть деньги в проект') }
    finally { setSaving(false) }
  }

  if (loading) return <div style={{ padding: 28, textAlign: 'center', color: '#59616f', fontSize: 11 }}>Загружаю экономику проектов…</div>
  if (projects.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 15 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: '#34d39912', border: '1px solid #34d39925', display: 'grid', placeItems: 'center' }}><TrendingUp size={16} color="#34d399" /></div>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Экономика проектов</p><p style={{ margin: '2px 0 0', fontSize: 10, color: '#59616f' }}>Расходы, деньги проекта и временные авансы себе.</p></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 7 }}>
          <SummaryCell label="Расходы" value={formatMoneyMinor(totals.cost)} color="#f87171" />
          <SummaryCell label="Осталось в проектах" value={formatMoneyMinor(totals.cash)} color="#f59e0b" />
          <SummaryCell label="Взято себе до приёмки" value={formatMoneyMinor(totals.advance)} color={totals.advance ? '#fb7185' : '#6b7280'} />
          <SummaryCell label="Прогноз прибыли" value={formatMoneyMinor(totals.profit)} color="#34d399" />
        </div>
      </section>

      {error && <div style={{ padding: '10px 12px', borderRadius: 12, background: '#f8717110', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 11 }}>{error}</div>}

      {projects.map(project => {
        const active = open?.projectId === project.project_id ? open.mode : null
        const projectAdvances = advances.filter(a => a.project_id === project.project_id && (a.status === 'outstanding' || a.status === 'partially_repaid'))
        const risky = project.status === 'disputed' || project.status === 'cancelled' || project.status === 'revision'
        return (
          <section key={project.project_id} style={{ background: '#111318', border: `1px solid ${risky && project.owner_advance_outstanding_minor ? '#f8717140' : '#20232c'}`, borderRadius: 18, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}><p style={{ margin: 0, fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</p><p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 9 }}>{project.client_name || 'Клиент не указан'}</p></div>
              <span style={{ fontSize: 9, color: '#34d399', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>{formatMoneyMinor(project.projected_profit_minor)}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 7, marginTop: 11 }}>
              <ValueCell label="Фактические расходы" value={formatMoneyMinor(project.actual_cost_minor)} color="#f87171" />
              <ValueCell label="Осталось в проекте" value={formatMoneyMinor(project.project_cash_remaining_minor)} color="#f59e0b" />
              <ValueCell label="К получению" value={formatMoneyMinor(project.outstanding_minor)} color="#c084fc" />
              <ValueCell label="Взято себе / долг проекту" value={formatMoneyMinor(project.owner_advance_outstanding_minor)} color={project.owner_advance_outstanding_minor ? '#fb7185' : '#6b7280'} />
            </div>

            {project.owner_advance_outstanding_minor > 0 && (
              <div style={{ marginTop: 9, padding: '9px 10px', borderRadius: 10, background: risky ? '#f8717110' : '#f59e0b0c', border: `1px solid ${risky ? '#f8717135' : '#f59e0b25'}`, color: risky ? '#fca5a5' : '#a8a29e', fontSize: 8, lineHeight: 1.45 }}>
                {risky ? `Нужно быть готовой вернуть ${formatMoneyMinor(project.owner_advance_outstanding_minor)} в проект.` : 'Эти деньги уже на личном счёте, но до приёмки они считаются долгом проекту. После приёмки долг закроется автоматически.'}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 10 }}>
              <button onClick={() => { setOpen(active === 'expense' ? null : { projectId: project.project_id, mode: 'expense' }); resetForm() }} style={secondaryButton}>{active === 'expense' ? <X size={12} /> : <ReceiptText size={12} />} Расход</button>
              <button onClick={() => { setOpen(active === 'advance' ? null : { projectId: project.project_id, mode: 'advance' }); resetForm(); setAmount(project.project_cash_remaining_minor > 0 ? String(Math.min(project.project_cash_remaining_minor, 10000 * 100) / 100) : '') }} style={secondaryButton}>{active === 'advance' ? <X size={12} /> : <HandCoins size={12} />} Себе</button>
              <button onClick={() => { setOpen(active === 'plan' ? null : { projectId: project.project_id, mode: 'plan' }); resetForm(); if (project.outstanding_minor > 0) setAmount(String(project.outstanding_minor / 100)) }} style={secondaryButton}>{active === 'plan' ? <X size={12} /> : <CalendarClock size={12} />} План</button>
            </div>

            {active && (
              <form onSubmit={submit} style={formBox}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800 }}>{active === 'expense' ? 'Расход по проекту' : active === 'plan' ? 'Запланированное поступление' : 'Временно взять себе из проекта'}</p>
                <input style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="Сумма, ₽" required />

                {active === 'expense' && <>
                  <select style={inputStyle} value={expenseType} onChange={e => setExpenseType(e.target.value as ProjectExpenseType)}>{Object.entries(EXPENSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <select style={inputStyle} value={businessAccountId} onChange={e => setBusinessAccountId(e.target.value)} required><option value="">С какого бизнес-счёта</option>{businessAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                  <input style={inputStyle} value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="Поставщик / исполнитель" />
                </>}

                {active === 'advance' && <>
                  <select style={inputStyle} value={businessAccountId} onChange={e => setBusinessAccountId(e.target.value)} required><option value="">С какого счёта проекта</option>{businessAccounts.map(a => <option key={a.id} value={a.id}>{a.name} · {formatMoneyMinor(a.balance_minor)}</option>)}</select>
                  <select style={inputStyle} value={personalAccountId} onChange={e => setPersonalAccountId(e.target.value)} required><option value="">На какой личный счёт</option>{personalAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                  <div style={{ padding: '9px 10px', borderRadius: 10, background: '#f59e0b0b', border: '1px solid #f59e0b25', color: '#8c8790', fontSize: 8, lineHeight: 1.45 }}>Это не расход и не прибыль. MoneyCRM отметит сумму как долг проекту до приёмки. При принятии заказа она автоматически станет частью заработанных денег.</div>
                </>}

                {active === 'plan' && <>
                  <select style={inputStyle} value={plannedType} onChange={e => setPlannedType(e.target.value as ExpectedPaymentType)}>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <input style={inputStyle} type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} />
                  <input style={inputStyle} value={plannedLabel} onChange={e => setPlannedLabel(e.target.value)} placeholder="Например: остаток 70%" />
                </>}
                <input style={inputStyle} value={note} onChange={e => setNote(e.target.value)} placeholder="Комментарий" />
                <button disabled={saving} style={primaryButton}>{saving ? 'Сохраняю…' : active === 'advance' ? 'Перевести себе и отметить долг' : 'Сохранить'}</button>
              </form>
            )}

            {projectAdvances.length > 0 && (
              <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                {projectAdvances.map(advance => {
                  const remaining = advance.amount_minor - advance.repaid_minor
                  const repayOpen = repayAdvanceId === advance.id
                  return <div key={advance.id} style={{ padding: '9px 10px', borderRadius: 10, background: '#0e1015', border: '1px solid #242833' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div><p style={{ margin: 0, fontSize: 9, fontWeight: 750 }}>Аванс себе · осталось вернуть</p><p style={{ margin: '3px 0 0', color: '#fb7185', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>{formatMoneyMinor(remaining)}</p></div>
                      <button onClick={() => { setRepayAdvanceId(repayOpen ? null : advance.id); setRepayAmount(String(remaining / 100)); setBusinessAccountId(advance.source_account_id); setPersonalAccountId(advance.destination_account_id) }} style={{ ...secondaryButton, padding: '0 10px' }}>{repayOpen ? <X size={11} /> : <RotateCcw size={11} />} Вернуть</button>
                    </div>
                    {repayOpen && <div style={{ display: 'grid', gap: 7, marginTop: 8 }}>
                      <input style={inputStyle} value={repayAmount} onChange={e => setRepayAmount(e.target.value)} inputMode="decimal" placeholder="Сумма возврата, ₽" />
                      <select style={inputStyle} value={personalAccountId} onChange={e => setPersonalAccountId(e.target.value)}>{personalAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                      <select style={inputStyle} value={businessAccountId} onChange={e => setBusinessAccountId(e.target.value)}>{businessAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                      <button disabled={saving} onClick={() => void repay(advance)} type="button" style={primaryButton}>Вернуть в проект</button>
                    </div>}
                  </div>
                })}
              </div>
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
