import { CircleAlert, CreditCard, Eye, EyeOff, FolderKanban, PiggyBank, ShieldCheck, WalletCards } from 'lucide-react'

const CONFIG = {
  'Все': {
    capital: 'Общий капитал',
    free: 'Свободно прямо сейчас',
    secondary: [['Резервы', ShieldCheck], ['Проекты', FolderKanban], ['Накопления', PiggyBank]],
    deductions: [['Обязательства', CircleAlert], ['Долги / кредиты', CreditCard]],
  },
  'Личные': {
    capital: 'Личный капитал',
    free: 'Можно потратить лично',
    secondary: [['Резерв', ShieldCheck], ['Личные цели', FolderKanban], ['Накопления', PiggyBank]],
    deductions: [['Обязательства', CircleAlert], ['Кредиты', CreditCard]],
  },
  'Семья': {
    capital: 'Семейный капитал',
    free: 'Свободно для семьи',
    secondary: [['Общий бюджет', WalletCards], ['Общие цели', FolderKanban], ['Резерв', ShieldCheck]],
    deductions: [['Общие платежи', CircleAlert], ['Семейные долги', CreditCard]],
  },
  'Бизнес': {
    capital: 'Капитал бизнеса',
    free: 'Свободно в бизнесе',
    secondary: [['В проектах', FolderKanban], ['Резерв', ShieldCheck], ['Налоги', PiggyBank]],
    deductions: [['К оплате', CircleAlert], ['Налоги', CreditCard]],
  },
} as const

export function HeroBalance({ show, onToggleShow, ctx = 'Все' }: { show: boolean; onToggleShow: () => void; ctx?: string }) {
  const config = CONFIG[ctx as keyof typeof CONFIG] || CONFIG['Все']

  return (
    <>
      <div style={{ background: '#e4f030', borderRadius: 24, padding: '22px 20px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -44, right: -42, width: 155, height: 155, borderRadius: '50%', background: 'rgba(0,0,0,0.055)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <WalletCards size={15} color="rgba(0,0,0,0.48)" strokeWidth={2.2} />
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{config.capital}</p>
          </div>
          <button aria-label={show ? 'Скрыть суммы' : 'Показать суммы'} onClick={onToggleShow} style={{ background: 'rgba(0,0,0,0.11)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 9, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            {show ? <Eye size={13} color="rgba(0,0,0,0.52)" /> : <EyeOff size={13} color="rgba(0,0,0,0.52)" />}
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(0,0,0,0.44)' }}>{show ? 'Скрыть' : 'Показать'}</span>
          </button>
        </div>

        <p style={{ position: 'relative', fontFamily: 'DM Sans, sans-serif', fontSize: 42, fontWeight: 900, color: '#0c0d10', lineHeight: 1, margin: '0 0 20px', letterSpacing: '-0.035em' }}>{show ? '0 ₽' : '•••• ₽'}</p>

        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.075)', borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
          {config.secondary.map(([label, Icon], i, arr) => (
            <div key={label} style={{ flex: 1, padding: '10px 6px', textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.09)' : 'none' }}>
              <Icon size={13} color="rgba(0,0,0,0.38)" style={{ marginBottom: 3 }} />
              <p style={{ margin: '0 0 2px', fontSize: 8, color: 'rgba(0,0,0,0.42)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0c0d10', fontFamily: 'JetBrains Mono, monospace' }}>{show ? '0 ₽' : '•••'}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#101810', border: '1px solid #e4f03030', borderRadius: 20, padding: '17px 19px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <ShieldCheck size={14} color="#6b9a55" />
          <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: '#5d8a50', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{config.free}</p>
        </div>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 35, fontWeight: 900, color: '#e4f030', lineHeight: 1, margin: '0 0 5px', letterSpacing: '-0.025em' }}>{show ? '0 ₽' : '•••• ₽'}</p>
        <p style={{ fontSize: 10, color: '#4b5563', margin: '0 0 12px' }}>Счета − резервы − обязательства</p>

        <div style={{ display: 'flex', gap: 9 }}>
          {config.deductions.map(([label, Icon]) => (
            <div key={label} style={{ flex: 1, background: '#f871710d', border: '1px solid #f8717118', borderRadius: 11, padding: '9px 10px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <Icon size={12} color="#8b5b5b" />
                <p style={{ margin: 0, fontSize: 9, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
              </div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>{show ? '0 ₽' : '•••'}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
