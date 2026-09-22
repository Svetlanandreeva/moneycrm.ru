import { Plus } from 'lucide-react'
import { ACCOUNTS } from '../data'

export function MoneyScreen({ show }: { show: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 20, padding: 16 }}>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 16 }}>🏦 Мои счета</p>
        {ACCOUNTS.map((a, i) => (
          <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < ACCOUNTS.length - 1 ? '1px solid #1e2028' : 'none' }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: `${a.dot}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${a.dot}40`, flexShrink: 0 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: a.dot, display: 'inline-block' }} /></div>
            <div style={{ flex: 1 }}><p style={{ fontSize: 15, fontWeight: 700 }}>{a.name}</p><p style={{ fontSize: 11, color: '#4b5563' }}>{a.type}</p></div>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700 }}>{show ? `${a.balance} ₽` : '•••'}</p>
          </div>
        ))}
        <button style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 14, border: '1.5px dashed #2a2d3a', background: 'transparent', color: '#4b5563', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={15} /> Добавить счёт</button>
      </div>
    </div>
  )
}
