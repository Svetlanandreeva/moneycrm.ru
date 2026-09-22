import { Briefcase, Eye, EyeOff, Layers, User, Users } from 'lucide-react'
import { CTX_TABS } from '../data'
import { NotificationsBell } from './NotificationsBell'

const CONTEXT_ICONS = {
  'Все': Layers,
  'Личные': User,
  'Семья': Users,
  'Бизнес': Briefcase,
} as const

export function AppHeader({ ctx, setCtx, show, toggleShow }: { ctx: string; setCtx: (v: string) => void; show: boolean; toggleShow: () => void }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(12,13,16,0.96)', backdropFilter: 'blur(18px)', borderBottom: '1px solid #1e2028', padding: '12px 16px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 31, height: 31, borderRadius: 10, background: '#e4f030', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 22px #e4f03018' }}>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 900, fontSize: 14, color: '#0c0d10' }}>M</span>
          </div>
          <div>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>MoneyCRM</span>
            <span style={{ display: 'block', fontSize: 9, color: '#4b5563', marginTop: 1 }}>финансовая система</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <button aria-label={show ? 'Скрыть суммы' : 'Показать суммы'} onClick={toggleShow} style={{ width: 34, height: 34, background: '#14161c', border: '1px solid #232630', borderRadius: 11, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            {show ? <Eye size={15} color="#737b88" /> : <EyeOff size={15} color="#737b88" />}
          </button>
          <NotificationsBell />
          <div style={{ width: 33, height: 33, borderRadius: '50%', background: '#171a21', border: '1px solid #343946', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#e4f030' }}>А</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 1 }}>
        {CTX_TABS.map(c => {
          const Icon = CONTEXT_ICONS[c as keyof typeof CONTEXT_ICONS] || Layers
          const active = ctx === c
          return (
            <button key={c} onClick={() => setCtx(c)} style={{ minHeight: 34, padding: '0 13px', borderRadius: 12, border: active ? '1px solid #e4f030' : '1px solid #232630', cursor: 'pointer', fontSize: 11, fontWeight: 700, flexShrink: 0, background: active ? '#e4f030' : '#15171d', color: active ? '#0c0d10' : '#747c89', display: 'flex', alignItems: 'center', gap: 6, transition: '160ms ease' }}>
              <Icon size={13} strokeWidth={2.2} />
              {c === 'Все' ? 'Все деньги' : c}
            </button>
          )
        })}
      </div>
    </header>
  )
}
