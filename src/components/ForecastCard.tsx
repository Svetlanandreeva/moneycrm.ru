import { AlertTriangle } from 'lucide-react'

export function ForecastCard({ show }: { show: boolean }) {
  const rows = [
    { label: 'Остаток на конец месяца', value: '312 400', color: '#e4f030', icon: '📅' },
    { label: 'Минимальный остаток', value: '284 100', color: '#a3e635', icon: '📉' },
    { label: 'Крупные платежи', value: '45 000', color: '#f59e0b', icon: '⚠️' },
    { label: 'Можно потратить', value: '89 200', color: '#34d399', icon: '✅' },
  ]
  return (
    <div style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 20, padding: 16 }}>
      <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 16, fontWeight: 800, marginBottom: 12 }}>🔭 Прогноз на конец месяца</p>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2028' }}>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>{r.icon} {r.label}</p>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: r.color }}>{show ? r.value : '•••'} ₽</p>
        </div>
      ))}
      <div style={{ marginTop: 12, background: '#f59e0b15', border: '1px solid #f59e0b30', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
        <div><p style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Внимание!</p><p style={{ fontSize: 11, color: '#f59e0b80' }}>Аренда офиса 30 сен · 35 000 ₽</p></div>
      </div>
    </div>
  )
}
