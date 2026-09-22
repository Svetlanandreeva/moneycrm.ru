import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, CircleAlert, X } from 'lucide-react'
import { listMyNotifications, markNotificationRead, refreshMyPaymentNotifications, type UserNotification } from '../lib/recurringPayments'

const COLOR = {
  info: '#60a5fa',
  warning: '#f59e0b',
  critical: '#f87171',
  success: '#34d399',
} as const

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<UserNotification[]>([])

  async function load() {
    try {
      await refreshMyPaymentNotifications()
      const next = await listMyNotifications(20)
      setItems(next)
    } catch {
      // Notification UI should never block the rest of the app.
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const unread = useMemo(() => items.filter(item => !item.read_at).length, [items])

  async function read(item: UserNotification) {
    if (!item.read_at) {
      try {
        await markNotificationRead(item.id)
        setItems(current => current.map(row => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row))
      } catch {
        // Keep the panel usable even if marking read fails.
      }
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button aria-label="Уведомления" onClick={() => { setOpen(value => !value); if (!open) void load() }} style={{ position: 'relative', width: 34, height: 34, borderRadius: 11, background: '#14161c', border: '1px solid #232630', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <Bell size={15} color="#737b88" />
        {unread > 0 && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: '#f87171', color: '#0c0d10', fontSize: 8, fontWeight: 900, display: 'grid', placeItems: 'center', border: '2px solid #0c0d10' }}>{Math.min(unread, 9)}{unread > 9 ? '+' : ''}</span>}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 42, width: 'min(360px, calc(100vw - 28px))', maxHeight: 460, overflowY: 'auto', background: '#111318', border: '1px solid #272b35', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.45)', padding: 10, zIndex: 80 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 9px' }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 850 }}>Уведомления</p>
              <p style={{ margin: '2px 0 0', fontSize: 9, color: '#59616f' }}>{unread ? `${unread} непрочитанных` : 'Всё просмотрено'}</p>
            </div>
            <button onClick={() => setOpen(false)} style={{ width: 28, height: 28, borderRadius: 9, border: '1px solid #252a35', background: '#171a21', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={13} color="#6b7280" /></button>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '28px 14px', textAlign: 'center', color: '#59616f' }}>
              <CheckCircle2 size={22} style={{ marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 10 }}>Сейчас нет предупреждений.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 7 }}>
              {items.map(item => {
                const color = COLOR[item.severity]
                const Icon = item.severity === 'critical' ? AlertTriangle : CircleAlert
                return (
                  <button key={item.id} onClick={() => void read(item)} style={{ textAlign: 'left', width: '100%', borderRadius: 12, border: `1px solid ${item.read_at ? '#20232b' : `${color}35`}`, background: item.read_at ? '#0f1116' : `${color}08`, padding: 10, display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: `${color}12`, border: `1px solid ${color}25`, display: 'grid', placeItems: 'center' }}><Icon size={13} color={color} /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, color: item.read_at ? '#8b93a0' : '#e5e7eb', fontSize: 10, fontWeight: 780 }}>{item.title}</p>
                      {item.body && <p style={{ margin: '4px 0 0', color: '#626a77', fontSize: 9, lineHeight: 1.4 }}>{item.body}</p>}
                    </div>
                    {!item.read_at && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
