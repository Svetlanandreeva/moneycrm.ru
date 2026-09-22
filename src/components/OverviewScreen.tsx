import { useEffect, useState } from 'react'
import { CashflowChart } from './CashflowChart'
import { ContextSummary } from './ContextSummary'
import { ForecastCard } from './ForecastCard'
import { HeroBalance } from './HeroBalance'
import { MonthlyMetrics } from './MonthlyMetrics'
import { QuickActions } from './QuickActions'
import { TransactionsList } from './TransactionsList'
import { getFinanceSnapshot, type FinanceContext, type FinanceSnapshot } from '../lib/moneycrm'
import { isSupabaseConfigured } from '../lib/supabase'

const EMPTY_SNAPSHOT: FinanceSnapshot = {
  totalBalanceMinor: 0,
  accountCount: 0,
  monthlyIncomeMinor: 0,
  monthlyExpenseMinor: 0,
  monthlyNetMinor: 0,
  balancesByKind: { personal: 0, family: 0, business: 0 },
  accountCountByKind: { personal: 0, family: 0, business: 0 },
}

export function OverviewScreen({ show, onToggleShow, ctx }: { show: boolean; onToggleShow: () => void; ctx: FinanceContext }) {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot>(EMPTY_SNAPSHOT)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    let active = true

    async function load() {
      if (!isSupabaseConfigured) {
        setSnapshot(EMPTY_SNAPSHOT)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const next = await getFinanceSnapshot(ctx)
        if (active) setSnapshot(next)
      } catch {
        if (active) setSnapshot(EMPTY_SNAPSHOT)
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [ctx])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: loading ? 0.78 : 1, transition: 'opacity 160ms ease' }}>
      <ContextSummary ctx={ctx} snapshot={snapshot} />
      <HeroBalance show={show} onToggleShow={onToggleShow} ctx={ctx} snapshot={snapshot} />
      <QuickActions />
      <MonthlyMetrics show={show} ctx={ctx} snapshot={snapshot} />
      <CashflowChart />
      <ForecastCard show={show} />
      <TransactionsList show={show} />
    </div>
  )
}
