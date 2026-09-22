import { useEffect, useRef, useState } from 'react'
import { FloatingAdd } from './components/AddSheet'
import { AppHeader } from './components/AppHeader'
import { AuthGate } from './components/AuthGate'
import { BottomNav } from './components/BottomNav'
import { MoneyScreen } from './components/MoneyScreen'
import { OverviewScreen } from './components/OverviewScreen'
import { Placeholder } from './components/Placeholder'
import { ProjectsHub } from './components/ProjectsHub'
import { SettingsScreen } from './components/SettingsScreen'
import { syncStaleBankConnections } from './lib/autoBankSync'
import type { FinanceContext } from './lib/moneycrm'

function MoneyCRMApp() {
  const [nav, setNav] = useState(() => new URLSearchParams(window.location.search).has('bank') ? 'settings' : 'overview')
  const [ctx, setCtx] = useState<FinanceContext>('Все')
  const [show, setShow] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [dataRevision, setDataRevision] = useState(0)
  const syncingRef = useRef(false)

  useEffect(() => {
    let alive = true

    async function refreshBanks() {
      if (syncingRef.current || !navigator.onLine || document.visibilityState === 'hidden') return
      syncingRef.current = true
      try {
        const result = await syncStaleBankConnections()
        if (alive && result.synced > 0) setDataRevision(value => value + 1)
      } catch {
        // Bank sync must never block the rest of MoneyCRM.
      } finally {
        syncingRef.current = false
      }
    }

    const initial = window.setTimeout(() => void refreshBanks(), 700)
    const interval = window.setInterval(() => void refreshBanks(), 5 * 60 * 1000)
    const onFocus = () => void refreshBanks()
    const onOnline = () => void refreshBanks()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshBanks()
    }

    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      alive = false
      window.clearTimeout(initial)
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', maxWidth: 480, margin: '0 auto', background: '#0c0d10', color: '#f0f0f0', fontFamily: 'Inter, sans-serif', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <AppHeader ctx={ctx} setCtx={value => setCtx(value as FinanceContext)} show={show} toggleShow={() => setShow(value => !value)} />
      <main style={{ flex: 1, padding: '16px 16px 100px' }}>
        {nav === 'overview' && <OverviewScreen key={`overview-${ctx}-${dataRevision}`} show={show} onToggleShow={() => setShow(value => !value)} ctx={ctx} />}
        {nav === 'money' && <MoneyScreen key={`money-${ctx}-${dataRevision}`} show={show} ctx={ctx} />}
        {nav === 'projects' && <ProjectsHub key={`projects-${dataRevision}`} />}
        {nav === 'goals' && <Placeholder label="Цели и накопления" />}
        {nav === 'settings' && <SettingsScreen key={`settings-${ctx}-${dataRevision}`} ctx={ctx} />}
      </main>
      <FloatingAdd open={addOpen} setOpen={setAddOpen} />
      <BottomNav nav={nav} setNav={setNav} />
    </div>
  )
}

export default function App() {
  return (
    <AuthGate>
      <MoneyCRMApp />
    </AuthGate>
  )
}
