import { Settings2 } from 'lucide-react'
import { BankConnectionsCard } from './BankConnectionsCard'
import type { FinanceContext } from '../lib/moneycrm'

function subtitle(ctx: FinanceContext) {
  if (ctx === 'Личные') return 'Настройки личных счетов и банков.'
  if (ctx === 'Семья') return 'Общие банковские счета и их распределение в семье.'
  if (ctx === 'Бизнес') return 'Банки и расчётные счета бизнеса.'
  return 'Подключения и распределение счетов между всеми пространствами.'
}

export function SettingsScreen({ ctx }: { ctx: FinanceContext }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: '#e4f03010', border: '1px solid #e4f03022', display: 'grid', placeItems: 'center' }}>
            <Settings2 size={17} color="#e4f030" />
          </div>
          <div>
            <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 18, fontWeight: 850 }}>Настройки</p>
            <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 9, lineHeight: 1.4 }}>{subtitle(ctx)}</p>
          </div>
        </div>
      </section>

      <BankConnectionsCard ctx={ctx} />
    </div>
  )
}
