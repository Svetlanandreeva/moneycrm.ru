import { ArrowDownRight, ArrowUpRight, Clock, FolderKanban, Plus, RefreshCw, Target } from 'lucide-react'

const ACTIONS = [
  { label: 'Получил деньги', sub: 'Доход', icon: ArrowUpRight, color: '#e4f030', text: '#0c0d10' },
  { label: 'Потратил деньги', sub: 'Расход', icon: ArrowDownRight, color: '#f87171', text: '#fff' },
  { label: 'Перевод', sub: 'Между счетами', icon: RefreshCw, color: '#60a5fa', text: '#fff' },
  { label: 'В копилку', sub: 'Резерв / цель', icon: Target, color: '#c084fc', text: '#fff' },
  { label: 'Новый проект', sub: 'Бизнес', icon: FolderKanban, color: '#f59e0b', text: '#fff' },
  { label: 'Запустить таймер', sub: 'Учёт времени', icon: Clock, color: '#34d399', text: '#fff' },
]

export function FloatingAdd({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <>
      <button onClick={() => setOpen(!open)} style={{ position: 'fixed', bottom: 80, right: 20, width: 56, height: 56, borderRadius: '50%', background: '#e4f030', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 24px rgba(228,240,48,0.35)', zIndex: 50 }}><Plus size={24} color="#0c0d10" strokeWidth={2.5} style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} /></button>
      {open && <><div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 48 }} /><div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#14161c', borderRadius: '24px 24px 0 0', padding: '20px 20px 40px', zIndex: 49, border: '1px solid #1e2028' }}><div style={{ width: 40, height: 4, borderRadius: 2, background: '#2a2d3a', margin: '0 auto 20px' }} /><p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 18, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>Что хотите добавить?</p><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{ACTIONS.map(({ label, sub, icon: Icon, color, text }) => <button key={label} onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, border: `1.5px solid ${color}25`, background: `${color}12`, cursor: 'pointer', textAlign: 'left' }}><div style={{ width: 42, height: 42, borderRadius: 13, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={20} color={text} /></div><div><p style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f0' }}>{label}</p><p style={{ fontSize: 10, color: '#4b5563' }}>{sub}</p></div></button>)}</div></div></>}
    </>
  )
}
