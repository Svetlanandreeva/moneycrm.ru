import { useEffect, useMemo, useState } from 'react'
import { Copy, KeyRound, LockKeyhole, ShieldCheck, Unlink, UserRoundPlus, Users, WalletCards } from 'lucide-react'
import { formatMoneyMinor } from '../lib/moneycrm'
import {
  createFamilyInvite,
  joinFamilyByCode,
  loadFamilySharingState,
  setActiveFamilyWorkspace,
  sharePersonalAccount,
  stopSharingPersonalAccount,
  type FamilyAccountShare,
  type FamilyShareVisibility,
  type FamilySharingState,
} from '../lib/familySharing'

export function FamilyAccessCard({ show }: { show: boolean }) {
  const [state, setState] = useState<FamilySharingState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setState(await loadFamilySharingState())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить семейный доступ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const myShares = useMemo(() => new Map((state?.shares ?? []).filter(share => share.owner_user_id === state?.currentUserId).map(share => [share.personal_account_id, share])), [state])
  const sharedTotal = useMemo(() => (state?.shares ?? []).filter(share => share.include_in_family_resources).reduce((sum, share) => sum + share.balance_minor, 0), [state])
  const canInvite = state?.currentRole === 'owner' || state?.currentRole === 'admin'

  async function invite() {
    if (!state?.activeFamily) return
    setSaving(true); setError('')
    try {
      await createFamilyInvite(state.activeFamily.id)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать код') }
    finally { setSaving(false) }
  }

  async function join() {
    if (!joinCode.trim()) return
    setSaving(true); setError('')
    try {
      const joined = await joinFamilyByCode(joinCode)
      await setActiveFamilyWorkspace(joined.family_workspace_id)
      setJoinCode('')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось присоединиться') }
    finally { setSaving(false) }
  }

  async function changeShare(accountId: string, accountName: string, value: 'private' | FamilyShareVisibility) {
    if (!state?.activeFamily) return
    setSaving(true); setError('')
    try {
      const existing = myShares.get(accountId)
      if (value === 'private') {
        if (existing) await stopSharingPersonalAccount(existing.id)
      } else {
        await sharePersonalAccount({
          familyWorkspaceId: state.activeFamily.id,
          personalAccountId: accountId,
          alias: accountName,
          visibility: value,
          includeInResources: true,
        })
      }
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось изменить приватность') }
    finally { setSaving(false) }
  }

  if (loading) return <section style={cardStyle}><p style={muted}>Загружаю семейный доступ…</p></section>

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={iconBox}><Users size={17} color="#c084fc" /></div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 850 }}>Семейное пространство</p>
            <p style={{ margin: '3px 0 0', fontSize: 9, color: '#59616f' }}>{state?.activeFamily?.name ?? 'Семья'} · {state?.members.length ?? 0} участ.</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '0 0 3px', color: '#59616f', fontSize: 8, textTransform: 'uppercase' }}>Личные ресурсы семьи</p>
          <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 850, color: '#c084fc' }}>{show ? formatMoneyMinor(sharedTotal) : '•••• ₽'}</p>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: '#0f1116', border: '1px solid #22252e', display: 'flex', gap: 9 }}>
        <ShieldCheck size={15} color="#34d399" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, color: '#76808d', fontSize: 9, lineHeight: 1.45 }}>
          Личные счета остаются приватными. Семья получает только тот срез, который владелец разрешил: баланс или баланс + операции, отдельно отмеченные как семейные.
        </p>
      </div>

      {error && <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 10, background: '#f8717110', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 10 }}>{error}</div>}

      {state && state.familyWorkspaces.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <p style={sectionLabel}>Активная семья</p>
          <select
            value={state.activeFamily?.id ?? ''}
            onChange={async e => { await setActiveFamilyWorkspace(e.target.value); await load() }}
            style={inputStyle}
          >
            {state.familyWorkspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, marginTop: 13 }}>
        <p style={sectionLabel}>Мои личные счета → что видит семья</p>
        {state?.personalAccounts.length ? state.personalAccounts.map(account => {
          const share = myShares.get(account.id)
          const mode = share?.visibility ?? 'private'
          return (
            <div key={account.id} style={{ padding: '10px 11px', borderRadius: 12, background: '#101218', border: '1px solid #20232b' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 780, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{account.name}</p>
                  <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 9 }}>{show ? formatMoneyMinor(account.balance_minor, account.currency) : '•••• ₽'}</p>
                </div>
                <select disabled={saving} value={mode} onChange={e => void changeShare(account.id, account.name, e.target.value as 'private' | FamilyShareVisibility)} style={{ ...inputStyle, width: 155, minHeight: 36, fontSize: 9 }}>
                  <option value="private">Только мне</option>
                  <option value="balance_only">Семье: баланс</option>
                  <option value="family_activity">Баланс + семейные траты</option>
                </select>
              </div>
              {mode === 'private' && <p style={hint}><LockKeyhole size={10} /> Муж/другой участник не видит этот счёт и его операции.</p>}
              {mode === 'family_activity' && <p style={hint}><WalletCards size={10} /> Личные покупки всё равно скрыты. Видны только операции, которые отмечены как семейные.</p>}
            </div>
          )
        }) : <p style={muted}>Сначала добавьте личный счёт во вкладке «Деньги».</p>}
      </div>

      {!!state?.shares.length && (
        <div style={{ marginTop: 13 }}>
          <p style={sectionLabel}>Ресурсы, которые семья учитывает</p>
          <div style={{ display: 'grid', gap: 7 }}>
            {state.shares.filter(share => share.include_in_family_resources).map(share => (
              <div key={share.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 10px', borderRadius: 10, background: '#0f1116' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 750 }}>{share.account_alias}</p>
                  <p style={{ margin: '2px 0 0', color: '#59616f', fontSize: 8 }}>{share.visibility === 'balance_only' ? 'Только баланс' : 'Баланс + семейные операции'}</p>
                </div>
                <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 800 }}>{show ? formatMoneyMinor(share.balance_minor, share.currency) : '••• ₽'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 13, display: 'grid', gap: 8 }}>
        <p style={sectionLabel}>Подключить другого человека</p>
        {canInvite && (
          <div style={{ display: 'flex', gap: 7 }}>
            <button disabled={saving} onClick={() => void invite()} style={secondaryButton}><UserRoundPlus size={13} /> Создать код</button>
            {state?.invites[0] && (
              <button onClick={() => navigator.clipboard?.writeText(state.invites[0].code)} style={{ ...secondaryButton, flex: 0, padding: '0 12px', fontFamily: 'JetBrains Mono, monospace', color: '#e4f030' }}>
                {state.invites[0].code} <Copy size={12} />
              </button>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 7 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <KeyRound size={13} color="#59616f" style={{ position: 'absolute', left: 11, top: 12 }} />
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Код семьи" style={{ ...inputStyle, paddingLeft: 32, textTransform: 'uppercase', letterSpacing: '0.08em' }} />
          </div>
          <button disabled={saving || !joinCode.trim()} onClick={() => void join()} style={{ ...secondaryButton, flex: 0, padding: '0 13px' }}>Войти</button>
        </div>
      </div>
    </section>
  )
}

const cardStyle = { background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 16 } as const
const iconBox = { width: 36, height: 36, borderRadius: 11, background: '#c084fc12', border: '1px solid #c084fc25', display: 'grid', placeItems: 'center' } as const
const sectionLabel = { margin: '0 0 6px', fontSize: 9, color: '#68717f', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.05em' } as const
const muted = { margin: 0, color: '#59616f', fontSize: 10 } as const
const hint = { margin: '7px 0 0', color: '#59616f', fontSize: 8, lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 4 } as const
const inputStyle = { width: '100%', minHeight: 40, borderRadius: 10, border: '1px solid #2a2d3a', background: '#0d0f14', color: '#e5e7eb', padding: '0 10px', fontSize: 10, outline: 'none', boxSizing: 'border-box' as const } as const
const secondaryButton = { minHeight: 38, borderRadius: 10, border: '1px solid #2a2d3a', background: '#171a21', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 10, fontWeight: 750, cursor: 'pointer', flex: 1 } as const
