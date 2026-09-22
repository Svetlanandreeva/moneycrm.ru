import { Bell, Eye, EyeOff } from 'lucide-react'
import { CTX_TABS } from '../data'

export function AppHeader({ ctx, setCtx, show, toggleShow }: { ctx: string; setCtx: (v: string) => void; show: boolean; toggleShow: () => void }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, background: '#0c0d10', borderBottom: '1px solid #1e2028', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 30, height: 30, borderRadius: 9, background: '#e4f030', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 900, fontSize: 14, color: '#0c0d10' }}>M</span></div><span style={{ fontWeight: 700, fontSize: 15 }}>MoneyCRM</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={toggleShow} style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 9, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>{show ? <Eye size={14} color="#6b7280" /> : <EyeOff size={14} color="#6b7280" />}</button>
          <button style={{ position: 'relative', width: 34, height: 34, borderRadius: 9, background: '#14161c', border: '1px solid #1e2028', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Bell size={15} color="#6b7280" /><span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', border: '2px solid #0c0d10' }} /></button>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1c1e28', border: '2px solid #e4f03060', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 12, fontWeight: 700, color: '#e4f030' }}>А</span></div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
        {CTX_TABS.map(c => <button key={c} onClick={() => setCtx(c)} style={{ padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0, background: ctx === c ? '#e4f030' : '#1c1e28', color: ctx === c ? '#0c0d10' : '#6b7280' }}>{c === 'Все' ? 'Все деньги' : c}</button>)}
      </div>
    </header>
  )
}
