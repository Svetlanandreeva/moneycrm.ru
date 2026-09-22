import { Activity } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { CHART_DATA } from '../data'

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1c1e28', border: '1px solid #2a2d3a', borderRadius: 10, padding: '8px 12px' }}>
      <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#e4f030', fontSize: 12, fontWeight: 700 }}>Доход {payload[0]?.value}к ₽</p>
      <p style={{ color: '#f87171', fontSize: 12, fontWeight: 700 }}>Расход {payload[1]?.value}к ₽</p>
    </div>
  )
}

export function CashflowChart() {
  return (
    <div style={{ background: '#14161c', border: '1px solid #1f222b', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 10, background: '#34d39912', border: '1px solid #34d39924', display: 'grid', placeItems: 'center' }}>
            <Activity size={14} color="#34d399" />
          </div>
          <div>
            <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 800 }}>Денежный поток</p>
            <p style={{ margin: '2px 0 0', fontSize: 9, color: '#535b68' }}>Последние 6 месяцев</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, paddingTop: 3, fontSize: 9 }}>
          <span style={{ color: '#8c9430' }}>● Доход</span>
          <span style={{ color: '#9a5b5b' }}>● Расход</span>
        </div>
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
