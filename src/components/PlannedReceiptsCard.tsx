import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CircleDollarSign, Clock3 } from 'lucide-react'
import { formatMoneyMinor, type FinanceContext } from '../lib/moneycrm'
import { listPlannedProjectReceipts, type PlannedProjectReceipt } from '../lib/projectFinance'

function dateLabel(value: string | null) {
  if (!value) return 'Дата не задана'
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value))
}

function daysLabel(value: string | null) {
  if (!value) return 'без даты'
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(value)
  target.setHours(0, 0, 0, 0)
  const days = Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
  if (days > 1) return `через ${days} дн.`
  if (days === 1) return 'завтра'
  if (days === 0) return 'сегодня'
  return `просрочено ${Math.abs(days)} дн.`
}

export function PlannedReceiptsCard({ ctx, show }: { ctx: FinanceContext; show: boolean }) {
  const [items, setItems] = useState<PlannedProjectReceipt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      if (ctx !== 'Все' && ctx !== 'Бизнес') {
        if (active) { setItems([]); setLoading(false) }
        return
      }
      setLoading(true)
      try {
        const rows = await listPlannedProjectReceipts(6)
        if (active) setItems(rows)
      } catch {
        if (active) setItems([])
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [ctx])

  const total = useMemo(() => items.reduce((sum, item) => sum + item.amount_minor, 0), [items])

  if (ctx !== 'Все' && ctx !== 'Бизнес') return null

  return (
    <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: '#c084fc12', border: '1px solid #c084fc25', display: 'grid', placeItems: 'center' }}>
            <CalendarClock size={16} color="#c084fc" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Запланированные поступления</p>
            <p style={{ margin: '3px 0 0', fontSize: 9, color: '#59616f' }}>Автоматически из проектов и плана оплат.</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '0 0 3px', fontSize: 8, color: '#59616f', textTransform: 'uppercase' }}>Всего</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 850, color: '#c084fc', fontFamily: 'JetBrains Mono, monospace' }}>{show ? formatMoneyMinor(total) : '•••• ₽'}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: '#59616f', fontSize: 10 }}>Загружаю план…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '18px 12px', border: '1px dashed #2a2d3a', borderRadius: 13, textAlign: 'center' }}>
          <CircleDollarSign size={20} color="#59616f" style={{ marginBottom: 7 }} />
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 750 }}>Поступлений пока не запланировано</p>
          <p style={{ margin: 0, color: '#59616f', fontSize: 9, lineHeight: 1.4 }}>Создайте проект с суммой договора или добавьте план платежа внутри проекта.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((item, index) => {
            const overdue = item.due_at ? new Date(item.due_at).getTime() < new Date().setHours(0, 0, 0, 0) : false
            return (
              <div key={`${item.expected_payment_id ?? item.project_id}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 12, background: '#101218', border: '1px solid #1f222b' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: overdue ? '#f8717110' : '#c084fc10', border: `1px solid ${overdue ? '#f8717125' : '#c084fc25'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Clock3 size={14} color={overdue ? '#f87171' : '#c084fc'} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.project_name}</p>
                  <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.client_name || 'Клиент'} · {item.label}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 850, color: '#e5e7eb', fontFamily: 'JetBrains Mono, monospace' }}>{show ? formatMoneyMinor(item.amount_minor, item.currency) : '••• ₽'}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 8, color: overdue ? '#f87171' : '#6b7280' }}>{dateLabel(item.due_at)} · {daysLabel(item.due_at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
