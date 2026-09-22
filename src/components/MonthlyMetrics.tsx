import { ArrowDownRight, ArrowUpRight, Briefcase, PiggyBank, TrendingUp, Users, WalletCards } from 'lucide-react'

const CONFIG = {
  'Все': [
    { icon: ArrowDownRight, label: 'Доходы', value: '0 ₽', color: '#e4f030' },
    { icon: ArrowUpRight, label: 'Расходы', value: '0 ₽', color: '#f87171' },
    { icon: TrendingUp, label: 'Чистый поток', value: '0 ₽', color: '#34d399' },
    { icon: Briefcase, label: 'Прибыль', value: '0 ₽', color: '#c084fc' },
  ],
  'Личные': [
    { icon: ArrowDownRight, label: 'Личные доходы', value: '0 ₽', color: '#60a5fa' },
    { icon: ArrowUpRight, label: 'Личные расходы', value: '0 ₽', color: '#f87171' },
    { icon: PiggyBank, label: 'Накоплено', value: '0 ₽', color: '#34d399' },
    { icon: WalletCards, label: 'Свободно', value: '0 ₽', color: '#e4f030' },
  ],
  'Семья': [
    { icon: ArrowDownRight, label: 'В бюджет', value: '0 ₽', color: '#c084fc' },
    { icon: ArrowUpRight, label: 'Общие расходы', value: '0 ₽', color: '#f87171' },
    { icon: PiggyBank, label: 'Общие накопления', value: '0 ₽', color: '#34d399' },
    { icon: Users, label: 'Совместные цели', value: '0 ₽', color: '#60a5fa' },
  ],
  'Бизнес': [
    { icon: ArrowDownRight, label: 'Выручка', value: '0 ₽', color: '#f59e0b' },
    { icon: ArrowUpRight, label: 'Расходы бизнеса', value: '0 ₽', color: '#f87171' },
    { icon: TrendingUp, label: 'Прибыль', value: '0 ₽', color: '#34d399' },
    { icon: Briefcase, label: 'Маржа', value: '0%', color: '#c084fc' },
  ],
} as const

export function MonthlyMetrics({ show, ctx = 'Все' }: { show: boolean; ctx?: string }) {
  const metrics = CONFIG[ctx as keyof typeof CONFIG] || CONFIG['Все']

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {metrics.map(({ icon: Icon, label, value, color }) => (
        <div key={label} style={{ background: '#14161c', border: '1px solid #1f222b', borderRadius: 16, padding: 13, position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: 30, height: 30, borderRadius: 10, background: `${color}12`, border: `1px solid ${color}24`, display: 'grid', placeItems: 'center', marginBottom: 10 }}>
            <Icon size={14} color={color} />
          </div>
          <p style={{ margin: '0 0 5px', fontSize: 9, color: '#646c79', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
          <p style={{ margin: '0 0 3px', fontFamily: 'JetBrains Mono, monospace', fontSize: 17, fontWeight: 800, color, lineHeight: 1 }}>{show ? value : '•••••'}</p>
          <p style={{ margin: 0, fontSize: 9, color: '#454c58' }}>Нет данных за период</p>
        </div>
      ))}
    </div>
  )
}
