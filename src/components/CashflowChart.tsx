import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { CHART_DATA } from '../data'

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1c1e28', border: '1px solid #2a2d3a', borderRadius: 10, padding: '8px 12px' }}>
      <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#e4f030', fontSize: 12, fontWeight: 700 }}>↑ {payload[0]?.value}к ₽</p>
      <p style={{ color: '#f87171', fontSize: 12, fontWeight: 700 }}>↓ {payload[1]?.value}к ₽</p>
    </div>
  )
}

export function CashflowChart() {
  return (
    <div style={{ background: '#14161c', border: '1px solid #1e2028', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 16, fontWeight: 800 }}>📊 Поток за 6 мес.</p>
        <div style={{ display: 'flex', gap: 10, fontSize: 11 }}><span style={{ color: '#e4f030' }}>● Доход</span><span style={{ color: '#f87171' }}>● Расход</span></div>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={CHART_DATA} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="ig2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#e4f030" stopOpacity={0.3} /><stop offset="95%" stopColor="#e4f030" stopOpacity={0} /></linearGradient>
            <linearGradient id="eg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={0.2} /><stop offset="95%" stopColor="#f87171" stopOpacity={0} /></linearGradient>
          </defs>
          <XAxis dataKey="m" tick={{ fontSize: 10, fill: '#4b5563' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTip />} />
          <Area type="monotone" dataKey="i" stroke="#e4f030" strokeWidth={2} fill="url(#ig2)" />
          <Area type="monotone" dataKey="e" stroke="#f87171" strokeWidth={2} fill="url(#eg2)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
