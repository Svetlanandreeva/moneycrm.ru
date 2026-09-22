import { ArrowDownRight, ArrowUpRight, Briefcase, PiggyBank, TrendingUp, Users, WalletCards } from 'lucide-react'
import { formatMoneyMinor, type FinanceContext, type FinanceSnapshot } from '../lib/moneycrm'

export function MonthlyMetrics({ show, ctx = 'Все', snapshot }: { show: boolean; ctx?: FinanceContext; snapshot: FinanceSnapshot }) {
  const income = formatMoneyMinor(snapshot.monthlyIncomeMinor)
  const expense = formatMoneyMinor(snapshot.monthlyExpenseMinor)
  const net = formatMoneyMinor(snapshot.monthlyNetMinor)
  const capital = formatMoneyMinor(snapshot.totalBalanceMinor)
  const margin = snapshot.monthlyIncomeMinor > 0 ? `${Math.round((snapshot.monthlyNetMinor / snapshot.monthlyIncomeMinor) * 100)}%` : '0%'

  const metrics = ctx === 'Личные'
    ? [
        { icon: ArrowDownRight, label: 'Личные доходы', value: income, color: '#60a5fa' },
        { icon: ArrowUpRight, label: 'Личные расходы', value: expense, color: '#f87171' },
        { icon: TrendingUp, label: 'Чистый поток', value: net, color: '#34d399' },
        { icon: WalletCards, label: 'На счетах', value: capital, color: '#e4f030' },
      ]
    : ctx === 'Семья'
      ? [
          { icon: ArrowDownRight, label: 'В бюджет', value: income, color: '#c084fc' },
          { icon: ArrowUpRight, label: 'Общие расходы', value: expense, color: '#f87171' },
          { icon: TrendingUp, label: 'Чистый поток', value: net, color: '#34d399' },
          { icon: Users, label: 'Общий бюджет', value: capital, color: '#60a5fa' },
        ]
      : ctx === 'Бизнес'
        ? [
            { icon: ArrowDownRight, label: 'Выручка', value: income, color: '#f59e0b' },
            { icon: ArrowUpRight, label: 'Расходы бизнеса', value: expense, color: '#f87171' },
            { icon: TrendingUp, label: 'Прибыль', value: net, color: '#34d399' },
            { icon: Briefcase, label: 'Маржа', value: margin, color: '#c084fc' },
          ]
        : [
            { icon: ArrowDownRight, label: 'Доходы', value: income, color: '#e4f030' },
            { icon: ArrowUpRight, label: 'Расходы', value: expense, color: '#f87171' },
            { icon: TrendingUp, label: 'Чистый поток', value: net, color: '#34d399' },
            { icon: PiggyBank, label: 'Капитал', value: capital, color: '#c084fc' },
          ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {metrics.map(({ icon: Icon, label, value, color }) => (
        <div key={label} style={{ background: '#14161c', border: '1px solid #1f222b', borderRadius: 16, padding: 13, position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: 30, height: 30, borderRadius: 10, background: `${color}12`, border: `1px solid ${color}24`, display: 'grid', placeItems: 'center', marginBottom: 10 }}>
            <Icon size={14} color={color} />
          </div>
          <p style={{ margin: '0 0 5px', fontSize: 9, color: '#646c79', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
          <p style={{ margin: '0 0 3px', fontFamily: 'JetBrains Mono, monospace', fontSize: 17, fontWeight: 800, color, lineHeight: 1 }}>{show ? value : '•••••'}</p>
          <p style={{ margin: 0, fontSize: 9, color: '#454c58' }}>Текущий месяц</p>
        </div>
      ))}
    </div>
  )
}
