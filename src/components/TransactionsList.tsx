import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, Receipt, Users } from 'lucide-react'
import { formatMoneyMinor, type FinanceContext } from '../lib/moneycrm'
import { listRecentTransactions, shareTransactionWithFamily, unshareTransactionWithFamily, type FeedTransaction } from '../lib/transactions'

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value))
}

export function TransactionsList({ show, ctx }: { show: boolean; ctx: FinanceContext }) {
  const [items, setItems] = useState<FeedTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setItems(await listRecentTransactions(ctx, 12))
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : 'Не удалось загрузить операции')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [ctx])

  async function toggleFamily(tx: FeedTransaction) {
    setSavingId(tx.id)
    setError('')
    try {
      if (tx.shared_family) await unshareTransactionWithFamily(tx.id)
      else await shareTransactionWithFamily(tx.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить семейную отметку')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ background: '#14161c', border: '1px solid #1f222b', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 10, background: '#c084fc12', border: '1px solid #c084fc24', display: 'grid', placeItems: 'center' }}>
          <Receipt size={14} color="#c084fc" />
        </div>
        <div>
          <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 800 }}>Операции</p>
          <p style={{ margin: '2px 0 0', fontSize: 9, color: '#535b68' }}>{ctx === 'Семья' ? 'Общие + личные операции, разрешённые семье' : 'Последние движения денег'}</p>
        </div>
      </div>

      {error && <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 10, background: '#f8717110', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 9 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#59616f', fontSize: 10 }}>Загружаю операции…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '25px 14px', textAlign: 'center', border: '1px dashed #2a2d3a', borderRadius: 16, background: '#101218' }}>
          <Receipt size={20} color="#59616f" style={{ marginBottom: 8 }} />
          <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 750 }}>Операций пока нет</p>
          <p style={{ margin: 0, color: '#555c68', fontSize: 10, lineHeight: 1.4 }}>Здесь появятся ручные и банковские операции.</p>
        </div>
      ) : items.map((tx, i) => {
        const positive = tx.amount_minor > 0 || tx.transaction_type === 'income' || tx.transaction_type === 'refund'
        return (
          <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid #1e2028' : 'none' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: positive ? '#34d39912' : '#f8717112', display: 'grid', placeItems: 'center', flexShrink: 0, border: `1px solid ${positive ? '#34d3992d' : '#f871712d'}` }}>
              {positive ? <ArrowDownRight size={17} color="#34d399" /> : <ArrowUpRight size={17} color="#f87171" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.counterparty || tx.note || (positive ? 'Поступление' : 'Расход')}</p>
              <p style={{ margin: '3px 0 0', fontSize: 9, color: '#59616f' }}>{tx.category_label || tx.transaction_type} · {dateLabel(tx.occurred_at)}</p>
              {tx.source_kind === 'family_shared' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 5, padding: '2px 5px', borderRadius: 6, background: '#c084fc10', border: '1px solid #c084fc20', color: '#c084fc', fontSize: 7, fontWeight: 800 }}><Users size={8} /> личная → семья</span>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 800, color: positive ? '#34d399' : '#f87171' }}>{show ? `${positive ? '+' : '−'}${formatMoneyMinor(Math.abs(tx.amount_minor), tx.currency)}` : '••• ₽'}</p>
              {ctx === 'Личные' && tx.can_share_family && (
                <button disabled={savingId === tx.id} onClick={() => void toggleFamily(tx)} style={{ marginTop: 5, minHeight: 24, padding: '0 7px', borderRadius: 7, border: `1px solid ${tx.shared_family ? '#34d39935' : '#c084fc28'}`, background: tx.shared_family ? '#34d39910' : '#c084fc0c', color: tx.shared_family ? '#34d399' : '#c084fc', fontSize: 7, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {tx.shared_family ? <Check size={9} /> : <Users size={9} />}{tx.shared_family ? 'Семейная' : 'В семью'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
