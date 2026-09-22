import { CalendarDays, CircleCheckBig, Clock3, Gauge, ScanLine } from 'lucide-react'

export function ForecastCard({ show }: { show: boolean }) {
  const rows = [
    { label: 'Остаток на конец месяца', value: '0', color: '#e4f030', icon: CalendarDays },
    { label: 'Минимальный остаток', value: '0', color: '#a3e635', icon: Gauge },
    { label: 'Крупные платежи', value: '0', color: '#f59e0b', icon: Clock3 },
    { label: 'Можно потратить', value: '0', color: '#34d399', icon: CircleCheckBig },
  ]

  return (
    <div style={{ background: '#14161c', border: '1px solid #1f222b', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 10, background: '#60a5fa12', border: '1px solid #60a5fa24', display: 'grid', placeItems: 'center' }}>
          <ScanLine size={14} color="#60a5fa" />
        </div>
        <div>
          <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 800 }}>Прогноз</p>
          <p style={{ margin: '2px 0 0', fontSize: 9, color: '#535b68' }}>До конца месяца</p>
        </div>
      </div>

      {rows.map((row, index) => {
        const Icon = row.icon
        return (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: index < rows.length - 1 ? '1px solid #1e2028' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Icon size={14} color="#6b7280" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 11, color: '#8d95a2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.label}</p>
            </div>
            <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: row.color, flexShrink: 0 }}>{show ? row.value : '•••'} ₽</p>
          </div>
        )
      })}

      <div style={{ marginTop: 12, background: '#101218', border: '1px dashed #2a2d3a', borderRadius: 13, padding: '12px 13px' }}>
        <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 750, color: '#9ca3af' }}>Прогноз появится автоматически</p>
        <p style={{ margin: 0, fontSize: 10, lineHeight: 1.4, color: '#505866' }}>Добавьте счета, операции и будущие платежи — MoneyCRM рассчитает свободный остаток.</p>
      </div>
    </div>
  )
}
