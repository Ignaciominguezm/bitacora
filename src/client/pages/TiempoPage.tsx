import { useState, useEffect, useCallback } from 'react'

type Period = 'today' | 'week' | 'month'
type UserFilter = 'all' | '1' | '2'
type Tab = 'user' | 'client'

interface TaskAgg {
  task_title: string
  total_minutes: number
  running: boolean
  suspicious: boolean
}

interface ByClientInUser {
  client_name: string
  total_minutes: number
  tasks: TaskAgg[]
}

interface ByUserAgg {
  user_id: number
  user_name: string
  total_minutes: number
  by_client: ByClientInUser[]
}

interface ByUserInClient {
  user_id: number
  user_name: string
  total_minutes: number
  tasks: TaskAgg[]
}

interface ByClientAgg {
  client_name: string
  total_minutes: number
  by_user: ByUserInClient[]
  tasks: TaskAgg[]
}

interface SummaryData {
  by_user: ByUserAgg[]
  by_client: ByClientAgg[]
  total_minutes: number
  period: string
  period_start: string
  period_end: string
}

const DQ_CUTOFF = '2026-07-01T00:00:00'
const DQ_BANNER_KEY = 'bitacora-tiempo-dq-banner-dismissed'

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' }
]

const USER_OPTIONS: { id: UserFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: '1', label: 'Ignacio' },
  { id: '2', label: 'Eva' }
]

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function todayISODate(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function dateInputStyle(): React.CSSProperties {
  return {
    padding: '5px 8px',
    background: '#13100A',
    border: '1px solid rgba(200,168,64,0.2)',
    color: '#E8DCC8',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 'var(--text-sm)',
    outline: 'none',
    colorScheme: 'dark'
  }
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 16px',
    background: active ? 'rgba(200,168,64,0.32)' : 'transparent',
    border: active ? '1px solid #C8A840' : '1px solid rgba(200,168,64,0.15)',
    color: active ? '#C8A840' : 'var(--color-text-muted)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 'var(--text-sm)',
    letterSpacing: '0.06em',
    cursor: 'pointer',
    transition: 'all 0.15s'
  }
}

export function TiempoPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [useCustomRange, setUseCustomRange] = useState(false)
  const [userFilter, setUserFilter] = useState<UserFilter>('all')
  const [tab, setTab] = useState<Tab>('user')
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedTop, setExpandedTop] = useState<Set<string>>(new Set())
  const [expandedMid, setExpandedMid] = useState<Set<string>>(new Set())
  const [bannerDismissed, setBannerDismissed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(DQ_BANNER_KEY) === '1'
  )

  function selectPeriod(p: Period) {
    setPeriod(p)
    setUseCustomRange(false)
    setCustomFrom('')
    setCustomTo('')
  }

  function selectJulyPreset() {
    setCustomFrom('2026-07-01')
    setCustomTo(todayISODate())
    setUseCustomRange(true)
  }

  function dismissBanner() {
    setBannerDismissed(true)
    window.localStorage.setItem(DQ_BANNER_KEY, '1')
  }

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ userId: userFilter })
      if (useCustomRange) {
        if (customFrom) qs.set('from', customFrom)
        if (customTo) qs.set('to', customTo)
      } else {
        qs.set('period', period)
      }
      const res = await fetch(`/api/time/summary?${qs.toString()}`, { credentials: 'include' })
      const json: SummaryData = await res.json()
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period, userFilter, useCustomRange, customFrom, customTo])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  const showDqBanner = !bannerDismissed && !!data?.period_start && new Date(data.period_start) < new Date(DQ_CUTOFF)

  function toggle(set: Set<string>, setFn: (s: Set<string>) => void, key: string) {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setFn(next)
  }

  const totalMinutes = data?.total_minutes ?? 0

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#0D0A06', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Data quality banner */}
      {showDqBanner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 16px',
            background: '#92400E',
            border: '1px solid #F59E0B',
            color: '#FEF3C7'
          }}
        >
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-base)', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: '#FCD34D', flexShrink: 0 }}>⚠</span>
            Los registros anteriores al 1 de julio de 2026 pueden contener datos de prueba o entradas incompletas.
            Se recomienda usar datos desde julio 2026 para facturación.
          </span>
          <button
            onClick={dismissBanner}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FEF3C7',
              fontSize: 'var(--text-lg)',
              cursor: 'pointer',
              flexShrink: 0,
              lineHeight: 1
            }}
            title="Descartar"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-xl)', color: '#C8A840', letterSpacing: '0.1em', margin: 0 }}>
          TIEMPO
        </h1>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          Reporte interno de horas trabajadas
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {PERIOD_OPTIONS.map((opt, i) => (
            <button
              key={opt.id}
              onClick={() => selectPeriod(opt.id)}
              style={{
                ...pillStyle(!useCustomRange && period === opt.id),
                borderRadius: i === 0 ? '3px 0 0 3px' : i === PERIOD_OPTIONS.length - 1 ? '0 3px 3px 0' : 0,
                marginLeft: i === 0 ? 0 : -1
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Desde</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setUseCustomRange(true) }}
            style={dateInputStyle()}
          />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Hasta</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setUseCustomRange(true) }}
            style={dateInputStyle()}
          />
        </div>

        <button onClick={selectJulyPreset} style={pillStyle(useCustomRange && customFrom === '2026-07-01')}>
          Julio 2026 →
        </button>

        <div style={{ display: 'flex', gap: 0 }}>
          {USER_OPTIONS.map((opt, i) => (
            <button
              key={opt.id}
              onClick={() => setUserFilter(opt.id)}
              style={{
                ...pillStyle(userFilter === opt.id),
                borderRadius: i === 0 ? '3px 0 0 3px' : i === USER_OPTIONS.length - 1 ? '0 3px 3px 0' : 0,
                marginLeft: i === 0 ? 0 : -1
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Total summary */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 32, color: '#C8A840' }}>
            {loading ? '…' : `${fmtDuration(totalMinutes)} total`}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(200,168,64,0.12)' }}>
        <button
          onClick={() => setTab('user')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: tab === 'user' ? '2px solid #C8A840' : '2px solid transparent',
            color: tab === 'user' ? '#C8A840' : 'var(--color-text-muted)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.06em',
            cursor: 'pointer'
          }}
        >
          Por usuario
        </button>
        <button
          onClick={() => setTab('client')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: tab === 'client' ? '2px solid #C8A840' : '2px solid transparent',
            color: tab === 'client' ? '#C8A840' : 'var(--color-text-muted)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.06em',
            cursor: 'pointer'
          }}
        >
          Por cliente
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>Cargando...</div>
      ) : tab === 'user' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(data?.by_user ?? []).length === 0 && (
            <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>Sin registros</div>
          )}
          {data?.by_user.map((u) => {
            const topKey = `u-${u.user_id}`
            const open = expandedTop.has(topKey)
            return (
              <div key={topKey} style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
                <div
                  onClick={() => toggle(expandedTop, setExpandedTop, topKey)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }}
                >
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-md)', color: '#E8DCC8', letterSpacing: '0.04em' }}>
                    {open ? '▾' : '▸'} {u.user_name}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-md)', color: '#C8A840' }}>
                    {fmtDuration(u.total_minutes)}
                  </span>
                </div>
                {open && (
                  <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {u.by_client.map((bc) => {
                      const midKey = `${topKey}-c-${bc.client_name}`
                      const midOpen = expandedMid.has(midKey)
                      return (
                        <div key={midKey} style={{ borderLeft: '1px solid rgba(200,168,64,0.1)', paddingLeft: 10 }}>
                          <div
                            onClick={() => toggle(expandedMid, setExpandedMid, midKey)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
                          >
                            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-base)', color: '#A09070' }}>
                              {midOpen ? '▾' : '▸'} {bc.client_name}
                            </span>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#A09070' }}>
                              {fmtDuration(bc.total_minutes)}
                            </span>
                          </div>
                          {midOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12, paddingBottom: 6 }}>
                              {bc.tasks.map((t) => (
                                <div
                                  key={t.task_title}
                                  title={t.suspicious ? 'Registro posiblemente incompleto' : undefined}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    borderLeft: t.suspicious ? '2px solid #facc15' : '2px solid transparent',
                                    paddingLeft: 6
                                  }}
                                >
                                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{t.task_title}</span>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {t.running && (
                                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#4ade80', letterSpacing: '0.04em' }}>
                                        En curso
                                      </span>
                                    )}
                                    {t.suspicious && (
                                      <span style={{ fontSize: 'var(--text-sm)', color: '#facc15' }}>⚠</span>
                                    )}
                                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{fmtDuration(t.total_minutes)}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(data?.by_client ?? []).length === 0 && (
            <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>Sin registros</div>
          )}
          {data?.by_client.map((cl) => {
            const topKey = `c-${cl.client_name}`
            const open = expandedTop.has(topKey)
            return (
              <div key={topKey} style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
                <div
                  onClick={() => toggle(expandedTop, setExpandedTop, topKey)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }}
                >
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-md)', color: '#E8DCC8', letterSpacing: '0.04em' }}>
                    {open ? '▾' : '▸'} {cl.client_name}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-md)', color: '#C8A840' }}>
                    {fmtDuration(cl.total_minutes)}
                  </span>
                </div>
                {open && (
                  <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cl.by_user.map((bu) => {
                      const midKey = `${topKey}-u-${bu.user_id}`
                      const midOpen = expandedMid.has(midKey)
                      return (
                        <div key={midKey} style={{ borderLeft: '1px solid rgba(200,168,64,0.1)', paddingLeft: 10 }}>
                          <div
                            onClick={() => toggle(expandedMid, setExpandedMid, midKey)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
                          >
                            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-base)', color: '#A09070' }}>
                              {midOpen ? '▾' : '▸'} {bu.user_name}
                            </span>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#A09070' }}>
                              {fmtDuration(bu.total_minutes)}
                            </span>
                          </div>
                          {midOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12, paddingBottom: 6 }}>
                              {bu.tasks.map((t) => (
                                <div
                                  key={t.task_title}
                                  title={t.suspicious ? 'Registro posiblemente incompleto' : undefined}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    borderLeft: t.suspicious ? '2px solid #facc15' : '2px solid transparent',
                                    paddingLeft: 6
                                  }}
                                >
                                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{t.task_title}</span>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {t.running && (
                                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#4ade80', letterSpacing: '0.04em' }}>
                                        En curso
                                      </span>
                                    )}
                                    {t.suspicious && (
                                      <span style={{ fontSize: 'var(--text-sm)', color: '#facc15' }}>⚠</span>
                                    )}
                                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{fmtDuration(t.total_minutes)}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
