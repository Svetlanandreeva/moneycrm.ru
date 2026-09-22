import { ArrowDownRight, ArrowUpRight, FolderKanban, RefreshCw, Target, Zap } from 'lucide-react'

export function QuickActions() {
  const actions = [
    { label: 'Доход', icon: ArrowUpRight, color: '#e4f030', text: '#0c0d10' },
    { label: 'Расход', icon: ArrowDownRight, color: '#f87171', text: '#fff' },
    { label: 'Перевод', icon: RefreshCw, color: '#60a5fa', text: '#fff' },
    { label: 'Отложить', icon: Target, color: '#c084fc', text: '#fff' },
    { label: 'Проект', icon: FolderKanban, color: '#f59e0b', text: '#fff' },
    { label: 'Таймер', icon: Zap, color: '#34d399', text: '#fff' },
  ]

  return (
    <div style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 20, padding: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>⚡ Быстрые действия</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {actions.map(({ label, icon: Icon, color, text }) => (
          <button key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px', borderRadius: 14, border: `1.5px solid ${color}25`, background: `${color}12`, cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={text} /></div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#e0e0e0' }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
