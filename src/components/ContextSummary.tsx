import { Briefcase, ChevronRight, Layers, User, Users } from 'lucide-react'
import { formatMoneyMinor, type FinanceContext, type FinanceSnapshot } from '../lib/moneycrm'

const CONFIG = {
  'Все': {
    icon: Layers,
    eyebrow: 'ЕДИНЫЙ ОБЗОР',
    title: 'Все деньги в одной системе',
    description: 'Личные, семейные и бизнес-финансы без смешивания контекстов.',
    accent: '#e4f030',
    action: 'Настроить пространства',
  },
  'Личные': {
    icon: User,
    eyebrow: 'ЛИЧНЫЕ ФИНАНСЫ',
    title: 'Ваши деньги',
    description: 'Повседневные расходы, личные накопления, обязательства и финансовая подушка.',
    accent: '#60a5fa',
    action: 'Добавить личный счёт',
  },
  'Семья': {
    icon: Users,
    eyebrow: 'СЕМЕЙНЫЙ БЮДЖЕТ',
    title: 'Финансы семьи',
    description: 'Общий бюджет, совместные цели и обязательные платежи — отдельно от личных денег.',
    accent: '#c084fc',
    action: 'Настроить семейный бюджет',
  },
  'Бизнес': {
    icon: Briefcase,
    eyebrow: 'БИЗНЕС',
    title: 'Деньги бизнеса',
    description: 'Счета, проекты, прибыль, обязательства и деньги к получению в одном контуре.',
    accent: '#f59e0b',
    action: 'Добавить бизнес-счёт',
  },
} as const

function statsForContext(ctx: FinanceContext, snapshot: FinanceSnapshot) {
  if (ctx === 'Все') {
    return [
      ['Личные', formatMoneyMinor(snapshot.balancesByKind.personal)],
      ['Семья', formatMoneyMinor(snapshot.balancesByKind.family)],
      ['Бизнес', formatMoneyMinor(snapshot.balancesByKind.business)],
    ]
  }

  if (ctx === 'Личные') {
    return [
      ['На счетах', formatMoneyMinor(snapshot.totalBalanceMinor)],
      ['Счетов', String(snapshot.accountCount)],
      ['В резерве', '0 ₽'],
    ]
  }

  if (ctx === 'Семья') {
    return [
      ['Общий бюджет', formatMoneyMinor(snapshot.totalBalanceMinor)],
      ['Счетов', String(snapshot.accountCount)],
      ['Общие цели', '0 ₽'],
    ]
  }

  return [
    ['На счетах', formatMoneyMinor(snapshot.totalBalanceMinor)],
    ['Счетов', String(snapshot.accountCount)],
    ['К получению', '0 ₽'],
  ]
}

export function ContextSummary({ ctx, snapshot }: { ctx: FinanceContext; snapshot: FinanceSnapshot }) {
  const config = CONFIG[ctx] || CONFIG['Все']
  const Icon = config.icon
  const stats = statsForContext(ctx, snapshot)

  return (
    <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 22, padding: 17, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', right: -50, top: -55, background: `${config.accent}10`, border: `1px solid ${config.accent}12` }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
        <div style={{ width: 42, height: 42, borderRadius: 13, background: `${config.accent}14`, border: `1px solid ${config.accent}32`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={19} color={config.accent} strokeWidth={2.1} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 800, letterSpacing: '0.11em', color: config.accent }}>{config.eyebrow}</p>
          <h2 style={{ margin: '4px 0 4px', fontFamily: 'DM Sans, sans-serif', fontSize: 20, lineHeight: 1.1, letterSpacing: '-0.025em' }}>{config.title}</h2>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: '#6b7280', maxWidth: 350 }}>{config.description}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 15 }}>
        {stats.map(([label, value]) => (
          <div key={label} style={{ minWidth: 0, padding: '10px 9px', borderRadius: 12, background: '#101218', border: '1px solid #1e222b' }}>
            <p style={{ margin: '0 0 4px', fontSize: 8, color: '#59616f', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#e5e7eb', fontFamily: value.includes('₽') ? 'JetBrains Mono, monospace' : 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p>
          </div>
        ))}
      </div>

      <button style={{ width: '100%', minHeight: 39, marginTop: 10, borderRadius: 12, border: '1px solid #252a35', background: '#181b22', color: '#aab1bd', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
        <span>{config.action}</span>
        <ChevronRight size={14} color="#6b7280" />
      </button>
    </section>
  )
}
