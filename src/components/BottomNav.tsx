import { FolderKanban, LayoutDashboard, Settings, Target, Wallet } from 'lucide-react'

const ITEMS = [
  { icon: LayoutDashboard, label: 'Главная', id: 'overview' },
  { icon: Wallet, label: 'Деньги', id: 'money' },
  { icon: FolderKanban, label: 'Проекты', id: 'projects' },
  { icon: Target, label: 'Цели', id: 'goals' },
  { icon: Settings, label: 'Настройки', id: 'settings' },
]

export function BottomNav({ nav, setNav }: { nav: string; setNav: (v: string) => void }) {
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#111318', borderTop: '1px solid #1e2028', display: 'flex', zIndex: 40, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {ITEMS.map(({ icon: Icon, label, id }) => {
        const active = nav === id
        return <button key={id} onClick={() => setNav(id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}><div style={{ width: 32, height: 32, borderRadius: 10, background: active ? '#e4f030' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={active ? '#0c0d10' : '#4b5563'} /></div><span style={{ fontSize: 10, fontWeight: 600, color: active ? '#e4f030' : '#4b5563' }}>{label}</span></button>
      })}
    </nav>
  )
}
