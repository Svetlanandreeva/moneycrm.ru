export function Placeholder({ label }: { label: string }) {
  return (
    <div style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 20, padding: 40, textAlign: 'center' }}>
      <p style={{ fontSize: 32, marginBottom: 12 }}>🚧</p>
      <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 13, color: '#4b5563' }}>Скоро здесь появится контент</p>
    </div>
  )
}
