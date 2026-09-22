import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  Plus,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react'
import {
  acceptProject,
  createProject,
  formatMoneyMinor,
  listAccountsForWorkspaces,
  listProjects,
  listWorkspaces,
  markProjectShipped,
  recordProjectPayment,
  type MoneyAccount,
  type ProjectStatus,
  type ProjectSummary,
} from '../lib/moneycrm'

const STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  draft: { label: 'Черновик', color: '#6b7280' },
  awaiting_payment: { label: 'Ждём оплату', color: '#f59e0b' },
  in_production: { label: 'В производстве', color: '#60a5fa' },
  ready_to_ship: { label: 'Готов к отправке', color: '#c084fc' },
  shipped: { label: 'Отправлен', color: '#a78bfa' },
  awaiting_acceptance: { label: 'Ждём приёмку', color: '#f59e0b' },
  accepted: { label: 'Принят', color: '#34d399' },
  revision: { label: 'Доработка', color: '#fb7185' },
  disputed: { label: 'Спор', color: '#f87171' },
  cancelled: { label: 'Отменён', color: '#6b7280' },
  closed: { label: 'Закрыт', color: '#34d399' },
}

const inputStyle = {
  width: '100%',
  minHeight: 44,
  borderRadius: 12,
  border: '1px solid #2a2d3a',
  background: '#0d0f14',
  color: '#e5e7eb',
  padding: '0 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box' as const,
}

function toMinor(value: string) {
  const numeric = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0
}

function toEndOfDayIso(value: string) {
  return value ? `${value}T23:59:59` : undefined
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function deadlineText(value: string | null, noun: string) {
  if (!value) return `Срок ${noun} не задан`
  const now = new Date()
  const target = new Date(value)
  const days = Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
  if (days > 1) return `${days} дн. до ${noun}`
  if (days === 1) return `1 день до ${noun}`
  if (days === 0) return `${noun} сегодня`
  const late = Math.abs(days)
  return `Просрочено на ${late} дн.`
}

export function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [businessAccounts, setBusinessAccounts] = useState<MoneyAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [paymentProjectId, setPaymentProjectId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [productionDue, setProductionDue] = useState('')
  const [shipDue, setShipDue] = useState('')
  const [acceptanceDays, setAcceptanceDays] = useState('3')

  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentType, setPaymentType] = useState<'prepayment' | 'final' | 'full' | 'other'>('prepayment')
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [nonRefundable, setNonRefundable] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const workspaces = await listWorkspaces()
      const business = workspaces.find(workspace => workspace.kind === 'business')
      const [nextProjects, accounts] = await Promise.all([
        listProjects(),
        business ? listAccountsForWorkspaces([business.id]) : Promise.resolve([]),
      ])
      setProjects(nextProjects)
      setBusinessAccounts(accounts)
      setPaymentAccountId(current => current || accounts[0]?.id || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить проекты')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const totals = useMemo(() => projects.reduce((acc, project) => {
    acc.received += project.received_minor
    acc.restricted += project.restricted_minor
    acc.earned += project.earned_minor
    acc.outstanding += project.outstanding_minor
    return acc
  }, { received: 0, restricted: 0, earned: 0, outstanding: 0 }), [projects])

  async function submitProject(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await createProject({
        name,
        clientName,
        contractValueMinor: toMinor(contractValue),
        startDate: startDate || undefined,
        productionDueAt: toEndOfDayIso(productionDue),
        shipDueAt: toEndOfDayIso(shipDue),
        acceptanceTermDays: Math.max(0, Number(acceptanceDays) || 0),
      })
      setName('')
      setClientName('')
      setContractValue('')
      setStartDate('')
      setProductionDue('')
      setShipDue('')
      setAcceptanceDays('3')
      setCreateOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать проект')
    } finally {
      setSaving(false)
    }
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault()
    if (!paymentProjectId || !paymentAccountId || toMinor(paymentAmount) <= 0) return
    setSaving(true)
    setError('')
    try {
      await recordProjectPayment({
        projectId: paymentProjectId,
        accountId: paymentAccountId,
        amountMinor: toMinor(paymentAmount),
        paymentType,
        isNonRefundable: nonRefundable,
      })
      setPaymentAmount('')
      setPaymentType('prepayment')
      setNonRefundable(true)
      setPaymentProjectId(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось записать оплату')
    } finally {
      setSaving(false)
    }
  }

  async function ship(projectId: string) {
    setSaving(true)
    setError('')
    try {
      await markProjectShipped(projectId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отметить отправку')
    } finally {
      setSaving(false)
    }
  }

  async function accept(projectId: string) {
    setSaving(true)
    setError('')
    try {
      await acceptProject(projectId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось принять проект')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 22, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: '#f59e0b12', border: '1px solid #f59e0b28', display: 'grid', placeItems: 'center' }}>
              <BriefcaseBusiness size={19} color="#f59e0b" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 850, fontFamily: 'DM Sans, sans-serif' }}>Проекты</p>
              <p style={{ margin: '4px 0 0', color: '#626a77', fontSize: 11, lineHeight: 1.4 }}>Сроки, оплаты, отправка и момент, когда деньги становятся вашими.</p>
            </div>
          </div>
          <button onClick={() => setCreateOpen(value => !value)} style={{ width: 36, height: 36, borderRadius: 11, border: '1px solid #2a2d3a', background: createOpen ? '#e4f030' : '#1c1e26', color: createOpen ? '#0c0d10' : '#9ca3af', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            {createOpen ? <X size={16} /> : <Plus size={16} />}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <MiniStat label="Получено" value={formatMoneyMinor(totals.received)} icon={Banknote} color="#60a5fa" />
          <MiniStat label="До приёмки" value={formatMoneyMinor(totals.restricted)} icon={ShieldCheck} color="#f59e0b" />
          <MiniStat label="Уже заработано" value={formatMoneyMinor(totals.earned)} icon={Check} color="#34d399" />
          <MiniStat label="К получению" value={formatMoneyMinor(totals.outstanding)} icon={CircleDollarSign} color="#c084fc" />
        </div>
      </section>

      {error && <div style={{ padding: '11px 12px', borderRadius: 13, background: '#f8717110', border: '1px solid #f8717130', color: '#fca5a5', fontSize: 11 }}>{error}</div>}

      {createOpen && (
        <form onSubmit={submitProject} style={{ display: 'grid', gap: 10, background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>Новый проект</p>
          <input style={inputStyle} value={name} onChange={event => setName(event.target.value)} placeholder="Название проекта / заказа" required />
          <input style={inputStyle} value={clientName} onChange={event => setClientName(event.target.value)} placeholder="Клиент" />
          <input style={inputStyle} value={contractValue} onChange={event => setContractValue(event.target.value)} inputMode="decimal" placeholder="Сумма договора, ₽" />
          <label style={labelStyle}>Дата старта<input style={inputStyle} type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={labelStyle}>Готовность<input style={inputStyle} type="date" value={productionDue} onChange={event => setProductionDue(event.target.value)} /></label>
            <label style={labelStyle}>Отправить до<input style={inputStyle} type="date" value={shipDue} onChange={event => setShipDue(event.target.value)} /></label>
          </div>
          <label style={labelStyle}>Срок приёмки после отправки, дней<input style={inputStyle} type="number" min="0" max="365" value={acceptanceDays} onChange={event => setAcceptanceDays(event.target.value)} /></label>
          <div style={{ padding: '10px 11px', borderRadius: 12, background: '#0f1510', border: '1px solid #273127', fontSize: 10, lineHeight: 1.45, color: '#7c8a7c' }}>
            Полученная предоплата попадёт на банковский счёт, но останется в «деньгах клиента» до отметки «Клиент принял».
          </div>
          <button disabled={saving} style={primaryButton}>{saving ? 'Сохраняю…' : 'Создать проект'}</button>
        </form>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#59616f', fontSize: 12 }}>Загружаю проекты…</div>
      ) : projects.length === 0 ? (
        <div style={{ padding: '42px 18px', textAlign: 'center', border: '1px dashed #2a2d3a', borderRadius: 20, color: '#59616f' }}>
          <BriefcaseBusiness size={25} style={{ marginBottom: 10 }} />
          <p style={{ margin: '0 0 5px', color: '#d1d5db', fontWeight: 750 }}>Проектов пока нет</p>
          <p style={{ margin: 0, fontSize: 11 }}>Создайте первый заказ и задайте сроки производства, отправки и приёмки.</p>
        </div>
      ) : projects.map(project => {
        const status = STATUS_META[project.status]
        const paymentOpen = paymentProjectId === project.project_id
        const expectedRelease = project.accepted_at || project.acceptance_due_at
        return (
          <section key={project.project_id} style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</p>
                <p style={{ margin: '4px 0 0', color: '#59616f', fontSize: 10 }}>{project.client_name || 'Клиент не указан'}</p>
              </div>
              <span style={{ flexShrink: 0, padding: '5px 8px', borderRadius: 8, background: `${status.color}12`, border: `1px solid ${status.color}28`, color: status.color, fontSize: 9, fontWeight: 800 }}>{status.label}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7, marginTop: 13 }}>
              <ValueBox label="Договор" value={formatMoneyMinor(project.contract_value_minor)} />
              <ValueBox label="Получено" value={formatMoneyMinor(project.received_minor)} />
              <ValueBox label="Деньги клиента" value={formatMoneyMinor(project.restricted_minor)} accent="#f59e0b" />
              <ValueBox label="Заработано" value={formatMoneyMinor(project.earned_minor)} accent="#34d399" />
            </div>

            <div style={{ display: 'grid', gap: 7, marginTop: 11 }}>
              <TimelineRow icon={Clock3} label="Производство" value={project.production_due_at ? `${formatDate(project.production_due_at)} · ${deadlineText(project.production_due_at, 'готовности')}` : 'Срок не задан'} />
              <TimelineRow icon={Truck} label="Отправка" value={project.shipped_at ? `Отправлен ${formatDate(project.shipped_at)}` : project.ship_due_at ? `${formatDate(project.ship_due_at)} · ${deadlineText(project.ship_due_at, 'отправки')}` : 'Срок не задан'} />
              <TimelineRow icon={PackageCheck} label="Приёмка" value={project.accepted_at ? `Принят ${formatDate(project.accepted_at)}` : project.shipped_at ? project.acceptance_due_at ? `Ожидаемо до ${formatDate(project.acceptance_due_at)} · ${deadlineText(project.acceptance_due_at, 'приёмки')}` : 'Ждём подтверждение клиента' : `После отправки · ${project.acceptance_term_days} дн.`} />
              {project.restricted_minor > 0 && (
                <TimelineRow icon={CalendarClock} label="Когда станут свободными" value={project.accepted_at ? 'Уже освобождены' : expectedRelease ? `Ожидаемо ${formatDate(expectedRelease)}, фактически — после приёмки` : 'После подтверждённой приёмки клиентом'} accent="#e4f030" />
              )}
            </div>

            <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
              {project.status !== 'accepted' && project.status !== 'closed' && (
                <button onClick={() => setPaymentProjectId(paymentOpen ? null : project.project_id)} style={smallButton}><Banknote size={13} /> Оплата</button>
              )}
              {!project.shipped_at && project.status !== 'accepted' && project.status !== 'closed' && (
                <button disabled={saving} onClick={() => void ship(project.project_id)} style={smallButton}><Truck size={13} /> Отправлен</button>
              )}
              {project.shipped_at && !project.accepted_at && (
                <button disabled={saving} onClick={() => void accept(project.project_id)} style={{ ...smallButton, borderColor: '#34d39935', color: '#34d399' }}><Check size={13} /> Клиент принял</button>
              )}
            </div>

            {paymentOpen && (
              <form onSubmit={submitPayment} style={{ display: 'grid', gap: 9, marginTop: 12, padding: 11, borderRadius: 13, background: '#101218', border: '1px solid #242731' }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800 }}>Полученная оплата</p>
                {businessAccounts.length === 0 ? (
                  <div style={{ color: '#f59e0b', fontSize: 10, lineHeight: 1.45 }}>Сначала добавьте бизнес-счёт в разделе «Деньги → Бизнес». Оплата должна реально попасть на счёт.</div>
                ) : (
                  <>
                    <select style={inputStyle} value={paymentAccountId} onChange={event => setPaymentAccountId(event.target.value)}>
                      {businessAccounts.map(account => <option value={account.id} key={account.id}>{account.name} · {formatMoneyMinor(account.balance_minor, account.currency)}</option>)}
                    </select>
                    <input style={inputStyle} value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} inputMode="decimal" placeholder="Сумма, ₽" required />
                    <select style={inputStyle} value={paymentType} onChange={event => setPaymentType(event.target.value as typeof paymentType)}>
                      <option value="prepayment">Предоплата</option>
                      <option value="final">Постоплата / остаток</option>
                      <option value="full">Полная оплата сразу</option>
                      <option value="other">Другая оплата</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#7d8592' }}>
                      <input type="checkbox" checked={nonRefundable} onChange={event => setNonRefundable(event.target.checked)} />
                      Предоплата невозвратная по условиям договора
                    </label>
                    <button disabled={saving} style={primaryButton}>{saving ? 'Записываю…' : 'Зачислить как деньги проекта'}</button>
                  </>
                )}
              </form>
            )}
          </section>
        )
      })}
    </div>
  )
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Banknote; color: string }) {
  return (
    <div style={{ padding: 11, borderRadius: 13, background: '#101218', border: '1px solid #1f222b' }}>
      <Icon size={14} color={color} style={{ marginBottom: 8 }} />
      <p style={{ margin: '0 0 4px', fontSize: 8, color: '#59616f', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color }}>{value}</p>
    </div>
  )
}

function ValueBox({ label, value, accent = '#e5e7eb' }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: '9px 10px', borderRadius: 11, background: '#101218', border: '1px solid #1e222b' }}>
      <p style={{ margin: '0 0 4px', color: '#59616f', fontSize: 8, textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: 0, color: accent, fontSize: 12, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{value}</p>
    </div>
  )
}

function TimelineRow({ icon: Icon, label, value, accent = '#9ca3af' }: { icon: typeof Clock3; label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 10, background: '#101218' }}>
      <Icon size={13} color={accent} style={{ flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: '0 0 2px', fontSize: 8, color: '#59616f', textTransform: 'uppercase' }}>{label}</p>
        <p style={{ margin: 0, fontSize: 10, color: accent, lineHeight: 1.35 }}>{value}</p>
      </div>
    </div>
  )
}

const labelStyle = { display: 'grid', gap: 6, fontSize: 9, color: '#646c79', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const primaryButton = { minHeight: 44, borderRadius: 12, border: 0, background: '#e4f030', color: '#0c0d10', fontWeight: 850, cursor: 'pointer' }
const smallButton = { minHeight: 34, borderRadius: 10, border: '1px solid #2a2d3a', background: '#181b22', color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 10px', fontSize: 10, fontWeight: 750, cursor: 'pointer' }
