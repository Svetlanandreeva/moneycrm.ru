import { FolderKanban, House, SlidersHorizontal, Target, WalletCards } from 'lucide-react'

const ITEMS = [
  { icon: House, label: 'Главная', id: 'overview' },
  { icon: WalletCards, label: 'Деньги', id: 'money' },
  { icon: FolderKanban, label: 'Проекты', id: 'projects' },
  { icon: Target, label: 'Цели', id: 'goals' },
  { icon: SlidersHorizontal, label: 'Настройки', id: 'settings' },
]

export function BottomNav({ nav, setNav }: { nav: string; setNav: (v: string) => void }) {
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: 'rgba(17,19,24,0.97)', backdropFilter: 'blur(18px)', borderTop: '1px solid #20232c', display: 'flex', zIndex: 40, padding: '5px 6px max(5px, env(safe-area-inset-bottom))' }}>
      {ITEMS.map(({ icon: Icon, label, id }) => {
        const active = nav === id
        return (
          <button key={id} onClick={() => setNav(id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 2px 4px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <div style={{ minWidth: 34, height: 28, padding: '0 8px', borderRadius: 10, background: active ? '#e4f030' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '160ms ease' }}>
              <Icon size={17} strokeWidth={active ? 2.4 : 2} color={active ? '#0c0d10' : '#59616e'} />
            </div>
            <span style={{ fontSize: 9, fontWeight: active ? 800 : 650, color: active ? '#e4f030' : '#59616e' }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
