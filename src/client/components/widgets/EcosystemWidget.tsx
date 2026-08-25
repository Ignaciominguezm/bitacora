import { useState, useEffect } from 'react'

interface ServiceStatus {
  name: string
  status: 'up' | 'degraded' | 'down'
  latency: number
}

interface ServerSummary {
  name: string
  url: string
  status: 'ok' | 'error'
  disk?: { percent: number }
}

interface PushServerSummary {
  hostname: string
  status: 'ok' | 'offline'
  seconds_since_report: number
  payload: {
    cpu_percent?: number
  }
}

interface HealthData {
  overall: 'up' | 'degraded' | 'down'
  services: ServiceStatus[]
  servers: ServerSummary[]
  push_servers: PushServerSummary[]
}

const SERVICE_LABELS: Record<string, string> = {
  horario34: 'Horario',
  coreworks: 'Coreworks',
  n8n: 'n8n',
  waha: 'WhatsApp',
  ollama: 'Ollama',
  ignaciominguez: 'Ignacio Web',
  formacion: 'Formación'
}

const STATUS_COLOR = {
  up: '#4ade80',
  degraded: '#facc15',
  down: '#f87171'
}

const STATUS_LABEL = {
  up: 'OK',
  degraded: 'Degradado',
  down: 'Caído'
}

export function EcosystemWidget() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function fetchHealth() {
    try {
      const res = await fetch('/api/health', { credentials: 'include' })
      const data: HealthData = await res.json()
      setHealth(data)
      setLastUpdated(new Date())
    } catch {
      // Keep stale data
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30_000)
    return () => clearInterval(interval)
  }, [])

  const services = health?.services ?? []
  const servers = health?.servers ?? []
  const pushServers = health?.push_servers ?? []
  const anyDown = services.some((s) => s.status === 'down')
  const allUp = services.every((s) => s.status === 'up')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(200,168,64,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#A09070', letterSpacing: '0.08em' }}>
          ECOSISTEMA
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            className="pulse-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: anyDown ? '#f87171' : allUp ? '#4ade80' : '#facc15'
            }}
          />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
            {lastUpdated ? lastUpdated.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '—'}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {loading ? (
          <div style={{ padding: '12px', color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>
            Comprobando servicios...
          </div>
        ) : (
          <>
            {/* Services list */}
            {services.map((svc) => (
              <div
                key={svc.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 12px',
                  borderBottom: '1px solid rgba(200,168,64,0.06)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[svc.status], flexShrink: 0 }} />
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>
                    {SERVICE_LABELS[svc.name] ?? svc.name}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: STATUS_COLOR[svc.status] }}>
                    {STATUS_LABEL[svc.status]}
                  </span>
                  {svc.status === 'up' && (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {svc.latency}ms
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* VPS server summary */}
            {servers.length > 0 && (
              <>
                <div style={{ padding: '6px 12px 2px', color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', letterSpacing: '0.1em' }}>
                  SERVIDORES
                </div>
                {servers.map((srv) => {
                  const diskPct = srv.disk?.percent ?? null
                  const diskAlert = diskPct !== null && diskPct > 80
                  return (
                    <div
                      key={srv.url}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 12px',
                        borderBottom: '1px solid rgba(200,168,64,0.06)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: srv.status === 'ok' ? '#4ade80' : '#f87171', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#A09070' }}>
                          {srv.name}
                        </span>
                      </div>
                      {diskPct !== null && (
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 'var(--text-xs)',
                            color: diskAlert ? '#f87171' : 'var(--color-text-muted)',
                            fontWeight: diskAlert ? 600 : 400
                          }}
                        >
                          disk {diskPct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  )
                })}
              </>
            )}

            {/* Push-based stations */}
            {pushServers.length > 0 && (
              <>
                <div style={{ padding: '6px 12px 2px', color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', letterSpacing: '0.1em' }}>
                  ESTACIONES
                </div>
                {pushServers.map((ps) => {
                  const online = ps.status === 'ok'
                  const cpu = ps.payload.cpu_percent
                  return (
                    <div
                      key={ps.hostname}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 12px',
                        borderBottom: '1px solid rgba(200,168,64,0.06)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : '#f87171', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#A09070' }}>
                          {ps.hostname}
                        </span>
                      </div>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: online ? 'var(--color-text-muted)' : '#f87171' }}>
                        {online && cpu !== undefined ? `cpu ${cpu.toFixed(0)}%` : 'offline'}
                      </span>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
