import { ArrowDownRight, ArrowUpRight, ChevronRight, Receipt, Plus } from 'lucide-react'
import { TXS } from '../data'

export function TransactionsList({ show }: { show: boolean }) {
  return (
    <div style={{ background: '#14161c', border: '1px solid #1f222b', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 10, background: '#c084fc12', border: '1px solid #c084fc24', display: 'grid', placeItems: 'center' }}>
            <Receipt size={14} color="#c084fc" />
          </div>
          <div>
            <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 800 }}>Операции</p>
            <p style={{ margin: '2px 0 0', fontSize: 9, color: '#535b68' }}>Последние движения денег</p>
          </div>
        </div>
        {TXS.length > 0 && <button style={{ background: 'none', border: 'none', color: '#e4f030', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>Все <ChevronRight size={13} /></button>}
      </div>

      {TXS.length === 0 ? (
        <div style={{ padding: '25px 14px', textAlign: 'center', border: '1px dashed #2a2d3a', borderRadius: 16, background: '#101218' }}>
          <div style={{ width: 40, height: 40, borderRadius: 13, margin: '0 auto 10px', background: '#e4f03010', border: '1px solid #e4f03020', display: 'grid', placeItems: 'center' }}>
            <Plus size={17} color="#8b9324" />
          </div>
          <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 750 }}>Операций пока нет</p>
          <p style={{ margin: 0, color: '#555c68', fontSize: 10, lineHeight: 1.4 }}>Добавьте первый доход, расход или перевод.</p>
        </div>
      ) : TXS.map((tx, i) => (
        <div key={`${tx.name}-${tx.date}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < TXS.length - 1 ? '1px solid #1e2028' : 'none' }}>
          <div style={{ width: 42, height: 42, borderRadius: 13, background: tx.pos ? '#e4f03018' : '#f8717118', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${tx.pos ? '#e4f03030' : '#f8717130'}` }}>
            {tx.pos ? <ArrowUpRight size={18} color="#e4f030" /> : <ArrowDownRight size={18} color="#f87171" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#4b5563' }}>{tx.cat} · {tx.date}</p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: tx.pos ? '#e4f030' : '#f87171' }}>{show ? `${tx.amt} ₽` : '•••'}</p>
            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 6, background: tx.pos ? '#e4f03015' : '#f8717115', color: tx.pos ? '#e4f030' : '#f87171' }}>{tx.pos ? 'Доход' : 'Расход'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
