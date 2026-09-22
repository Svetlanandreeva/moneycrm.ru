import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarRange, TriangleAlert } from 'lucide-react'
import { formatMoneyMinor, type FinanceContext } from '../lib/moneycrm'
import { listPlannedProjectReceipts } from '../lib/projectFinance'
import { listRecurringPayments, type Recurrence } from '../lib/recurringPayments'

type CalendarEvent = {
  id: string
  date: string
  title: string
  subtitle: string
  amountMinor: number
  kind: 'income' | 'expense'
}

function dayStart(value: Date) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

function addOccurrence(date: Date, recurrence: Recurrence) {
  const next = new Date(date)
  if (recurrence === 'weekly') next.setDate(next.getDate() + 7)
  if (recurrence === 'monthly') next.setMonth(next.getMonth() + 1)
  if (recurrence === 'quarterly') next.setMonth(next.getMonth() + 3)
  if (recurrence === 'yearly') next.setFullYear(next.getFullYear() + 1)
  return next
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', weekday: 'short' }).format(new Date(`${value}T12:00:00`))
}

export function CashCalendarCard({ ctx, show, startingBalanceMinor }: { ctx: FinanceContext; show: boolean; startingBalanceMinor: number }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const today = dayStart(new Date())
        const horizon = new Date(today)
        horizon.setDate(horizon.getDate() + 30)

        const recurringBundle = await listRecurringPayments(ctx)
        const nextEvents: CalendarEvent[] = []

        for (const payment of recurringBundle.payments) {
          let due = dayStart(new Date(`${payment.next_due_date}T12:00:00`))
          let guard = 0
          while (due <= horizon && guard < 40) {
            if (due >= today) {
              nextEvents.push({
                id: `${payment.id}-${dateKey(due)}`,
                date: dateKey(due),
                title: payment.title,
                subtitle: payment.payee || payment.category_label || 'Обязательный платёж',
                amountMinor: -Math.abs(payment.amount_minor),
                kind: 'expense',
              })
            }
            if (payment.recurrence === 'one_time') break
            due = addOccurrence(due, payment.recurrence)
            guard += 1
          }
        }

        if (ctx === 'Все' || ctx === 'Бизнес') {
          const receipts = await listPlannedProjectReceipts(100)
          for (const receipt of receipts) {
            if (!receipt.due_at) continue
            const due = dayStart(new Date(receipt.due_at))
            if (due < today || due > horizon) continue
            nextEvents.push({
              id: `project-${receipt.expected_payment_id ?? receipt.project_id}-${dateKey(due)}`,
              date: dateKey(due),
              title: receipt.project_name,
              subtitle: receipt.client_name ? `${receipt.client_name} · ${receipt.label}` : receipt.label,
              amountMinor: Math.abs(receipt.amount_minor),
              kind: 'income',
            })
          }
        }

        nextEvents.sort((a, b) => a.date.localeCompare(b.date) || b.amountMinor - a.amountMinor)
        if (active) setEvents(nextEvents)
      } catch {
        if (active) setEvents([])
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [ctx])

  const projection = useMemo(() => {
    let running = startingBalanceMinor
    let minimum = running
    let firstGapDate: string | null = null
    const rows = events.map(event => {
      running += event.amountMinor
      if (running < minimum) minimum = running
      if (running < 0 && !firstGapDate) firstGapDate = event.date
      return { ...event, projectedBalanceMinor: running }
    })
    return { rows, end: running, minimum, firstGapDate }
  }, [events, startingBalanceMinor])

  return (
    <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: '#60a5fa12', border: '1px solid #60a5fa25', display: 'grid', placeItems: 'center' }}>
            <CalendarRange size={16} color="#60a5fa" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 850 }}>Денежный календарь</p>
            <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 9 }}>Поступления и обязательные платежи · 30 дней</p>
          </div>
        </div>
        {projection.firstGapDate && <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f87171', fontSize: 8, fontWeight: 800 }}><TriangleAlert size={12} /> кассовый разрыв</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginTop: 13 }}>
        <Metric label="Сейчас свободно" value={startingBalanceMinor} show={show} color="#e4f030" />
        <Metric label="Минимум" value={projection.minimum} show={show} color={projection.minimum < 0 ? '#f87171' : '#f59e0b'} />
        <Metric label="Через 30 дней" value={projection.end} show={show} color={projection.end < 0 ? '#f87171' : '#34d399'} />
      </div>

      {loading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: '#59616f', fontSize: 10 }}>Строю календарь…</div>
      ) : projection.rows.length === 0 ? (
        <div style={{ marginTop: 12, padding: '18px 12px', border: '1px dashed #2a2d3a', borderRadius: 13, textAlign: 'center', color: '#59616f', fontSize: 9 }}>
          Здесь появятся платежи и поступления, когда вы добавите обязательные расходы или проекты.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
          {projection.rows.slice(0, 10).map(row => {
            const positive = row.kind === 'income'
            const color = positive ? '#34d399' : '#f87171'
            const Icon = positive ? ArrowDownRight : ArrowUpRight
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '58px 1fr auto', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 11, background: '#101218', border: `1px solid ${row.projectedBalanceMinor < 0 ? '#f8717135' : '#1f222b'}` }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 8, textTransform: 'capitalize' }}>{formatDate(row.date)}</p>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 760, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</p>
                  <p style={{ margin: '2px 0 0', color: '#59616f', fontSize: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.subtitle}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 850, color }}><Icon size={11} />{show ? formatMoneyMinor(Math.abs(row.amountMinor)) : '••• ₽'}</p>
                  <p style={{ margin: '3px 0 0', color: row.projectedBalanceMinor < 0 ? '#f87171' : '#59616f', fontSize: 8 }}>{show ? `остаток ${formatMoneyMinor(row.projectedBalanceMinor)}` : 'остаток •••'}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Metric({ label, value, show, color }: { label: string; value: number; show: boolean; color: string }) {
  return <div style={{ minWidth: 0, padding: '9px 8px', borderRadius: 11, background: '#101218', border: '1px solid #1f222b' }}><p style={{ margin: '0 0 4px', color: '#59616f', fontSize: 7, textTransform: 'uppercase' }}>{label}</p><p style={{ margin: 0, color, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{show ? formatMoneyMinor(value) : '••• ₽'}</p></div>
}
