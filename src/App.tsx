import { useState } from 'react'
import { FloatingAdd } from './components/AddSheet'
import { AppHeader } from './components/AppHeader'
import { AuthGate } from './components/AuthGate'
import { BottomNav } from './components/BottomNav'
import { MoneyScreen } from './components/MoneyScreen'
import { OverviewScreen } from './components/OverviewScreen'
import { Placeholder } from './components/Placeholder'

function MoneyCRMApp() {
  const [nav, setNav] = useState('overview')
  const [ctx, setCtx] = useState('Все')
  const [show, setShow] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div style={{ minHeight: '100vh', maxWidth: 480, margin: '0 auto', background: '#0c0d10', color: '#f0f0f0', fontFamily: 'Inter, sans-serif', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <AppHeader ctx={ctx} setCtx={setCtx} show={show} toggleShow={() => setShow(v => !v)} />
      <main style={{ flex: 1, padding: '16px 16px 100px' }}>
        {nav === 'overview' && <OverviewScreen show={show} onToggleShow={() => setShow(v => !v)} />}
        {nav === 'money' && <MoneyScreen show={show} />}
        {nav === 'projects' && <Placeholder label="Проекты" />}
        {nav === 'goals' && <Placeholder label="Цели и накопления" />}
        {nav === 'settings' && <Placeholder label="Настройки" />}
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
