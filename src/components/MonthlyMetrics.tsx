export function MonthlyMetrics({ show }: { show: boolean }) {
  const metrics = [
    { emoji: '📥', label: 'Доходы', value: '0 ₽', color: '#e4f030' },
    { emoji: '📤', label: 'Расходы', value: '0 ₽', color: '#f87171' },
    { emoji: '📈', label: 'Чистый поток', value: '0 ₽', color: '#34d399' },
    { emoji: '🏢', label: 'Прибыль', value: '0 ₽', color: '#c084fc' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {metrics.map(m => (
        <div key={m.label} style={{ background: '#14161c', border: '1px solid #1e2028', borderTop: `3px solid ${m.color}`, borderRadius: 16, padding: 14 }}>
          <p style={{ fontSize: 16, marginBottom: 4 }}>{m.emoji}</p>
          <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{m.label}</p>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: m.color, lineHeight: 1, marginBottom: 2 }}>{show ? m.value : '•••••'}</p>
          <p style={{ fontSize: 10, color: '#4b5563' }}>Нет данных за период</p>
        </div>
      ))}
    </div>
  )
}
