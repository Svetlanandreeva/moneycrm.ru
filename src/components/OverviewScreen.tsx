import { CashflowChart } from './CashflowChart'
import { ForecastCard } from './ForecastCard'
import { HeroBalance } from './HeroBalance'
import { MonthlyMetrics } from './MonthlyMetrics'
import { QuickActions } from './QuickActions'
import { TransactionsList } from './TransactionsList'

export function OverviewScreen({ show, onToggleShow }: { show: boolean; onToggleShow: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <HeroBalance show={show} onToggleShow={onToggleShow} />
      <QuickActions />
      <MonthlyMetrics show={show} />
      <CashflowChart />
      <ForecastCard show={show} />
      <TransactionsList show={show} />
    </div>
  )
}
