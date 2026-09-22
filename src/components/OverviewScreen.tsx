import { CashflowChart } from './CashflowChart'
import { ContextSummary } from './ContextSummary'
import { ForecastCard } from './ForecastCard'
import { HeroBalance } from './HeroBalance'
import { MonthlyMetrics } from './MonthlyMetrics'
import { QuickActions } from './QuickActions'
import { TransactionsList } from './TransactionsList'

export function OverviewScreen({ show, onToggleShow, ctx }: { show: boolean; onToggleShow: () => void; ctx: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ContextSummary ctx={ctx} />
      <HeroBalance show={show} onToggleShow={onToggleShow} ctx={ctx} />
      <QuickActions />
      <MonthlyMetrics show={show} ctx={ctx} />
      <CashflowChart />
      <ForecastCard show={show} />
      <TransactionsList show={show} />
    </div>
  )
}
