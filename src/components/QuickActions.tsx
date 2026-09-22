import { ArrowDownRight, ArrowUpRight, FolderKanban, RefreshCw, Target, Timer, Zap } from 'lucide-react'

export function QuickActions() {
  const actions = [
    { label: 'Доход', icon: ArrowDownRight, color: '#e4f030', text: '#0c0d10' },
    { label: 'Расход', icon: ArrowUpRight, color: '#f87171', text: '#fff' },
    { label: 'Перевод', icon: RefreshCw, color: '#60a5fa', text: '#fff' },
    { label: 'Отложить', icon: Target, color: '#c084fc', text: '#fff' },
    { label: 'Проект', icon: FolderKanban, color: '#f59e0b', text: '#fff' },
    { label: 'Таймер', icon: Timer, color: '#34d399', text: '#fff' },
  ]

  return (
    <div style={{ background: '#14161c', border: '1px solid #1f222b', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <Zap size={13} color="#e4f030" />
        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: '#626a77', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Быстрые действия</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {actions.map(({ label, icon: Icon, color, text }) => (
          <button key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '13px 7px 12px', borderRadius: 14, border: `1px solid ${color}22`, background: `${color}0d`, cursor: 'pointer' }}>
            <div style={{ width: 37, height: 37, borderRadius: 12, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 18px ${color}12` }}>
              <Icon size={17} color={text} strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#d4d7dc' }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
