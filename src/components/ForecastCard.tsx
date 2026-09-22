export function ForecastCard({ show }: { show: boolean }) {
  const rows = [
    { label: 'Остаток на конец месяца', value: '0', color: '#e4f030', icon: '📅' },
    { label: 'Минимальный остаток', value: '0', color: '#a3e635', icon: '📉' },
    { label: 'Крупные платежи', value: '0', color: '#f59e0b', icon: '⚠️' },
    { label: 'Можно потратить', value: '0', color: '#34d399', icon: '✅' },
  ]

  return (
    <div style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 20, padding: 16 }}>
      <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 16, fontWeight: 800, marginBottom: 12 }}>🔭 Прогноз на конец месяца</p>
      {rows.map((r, index) => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: index < rows.length - 1 ? '1px solid #1e2028' : 'none' }}>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>{r.icon} {r.label}</p>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: r.color }}>{show ? r.value : '•••'} ₽</p>
        </div>
      ))}
      <div style={{ marginTop: 12, background: '#101218', border: '1px dashed #2a2d3a', borderRadius: 12, padding: '12px 14px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 3 }}>Пока нечего прогнозировать</p>
        <p style={{ fontSize: 11, color: '#555c68' }}>Добавьте счета, операции и будущие платежи.</p>
      </div>
    </div>
  )
}
