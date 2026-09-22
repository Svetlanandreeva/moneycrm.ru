import { Eye, EyeOff } from 'lucide-react'

export function HeroBalance({ show, onToggleShow }: { show: boolean; onToggleShow: () => void }) {
  const secondary = [['Резервы', '0 ₽'], ['Проекты', '0 ₽'], ['Накопления', '0 ₽']]
  const deductions = [['❗ Обязательства', '0 ₽'], ['💳 Долги / кредиты', '0 ₽']]

  return (
    <>
      <div style={{ background: '#e4f030', borderRadius: 24, padding: '24px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>💰 Общий капитал</p>
          <button onClick={onToggleShow} style={{ background: 'rgba(0,0,0,0.12)', border: 'none', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            {show ? <Eye size={13} color="rgba(0,0,0,0.5)" /> : <EyeOff size={13} color="rgba(0,0,0,0.5)" />}
            <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(0,0,0,0.4)' }}>{show ? 'Скрыть' : 'Показать'}</span>
          </button>
        </div>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 42, fontWeight: 900, color: '#0c0d10', lineHeight: 1, marginBottom: 20, letterSpacing: '-0.02em' }}>{show ? '0 ₽' : '•••• ₽'}</p>
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.08)', borderRadius: 14, overflow: 'hidden' }}>
          {secondary.map(([label, value], i, arr) => (
            <div key={label} style={{ flex: 1, padding: '10px 0', textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none' }}>
              <p style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</p>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#0c0d10', fontFamily: 'JetBrains Mono, monospace' }}>{show ? value : '•••'}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#0f1a0f', border: '2px solid #e4f03030', borderRadius: 20, padding: '18px 20px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4b7a4b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>✅ Свободно прямо сейчас</p>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 36, fontWeight: 900, color: '#e4f030', lineHeight: 1, marginBottom: 4, letterSpacing: '-0.02em' }}>{show ? '0 ₽' : '•••• ₽'}</p>
        <p style={{ fontSize: 11, color: '#4b5563', marginBottom: 12 }}>Счета − резервы − обязательства</p>
        <div style={{ display: 'flex', gap: 12 }}>
          {deductions.map(([label, value]) => (
            <div key={label} style={{ flex: 1, background: '#f8717115', borderRadius: 10, padding: '8px 12px' }}>
              <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{label}</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>{show ? value : '•••'}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
