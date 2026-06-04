import { useState, useEffect, useCallback } from 'react'

interface ServiceStatus {
  name: string
  status: 'up' | 'degraded' | 'down'
  latency: number
}

interface Container {
  name: string
  status: string
}

interface ServerData {
  name: string
  url: string
  status: 'ok' | 'error'
  cpu?: number
  ram?: { used: number; total: number; percent: number }
  disk?: { used: number; total: number; percent: number }
  containers?: Container[]
  uptime_seconds?: number
  latency_ms?: number
}

interface HealthData {
  overall: 'up' | 'degraded' | 'down'
  services: ServiceStatus[]
  servers: ServerData[]
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

const SVC_STATUS_COLOR = { up: '#4ade80', degraded: '#facc15', down: '#f87171' }
const SVC_STATUS_LABEL = { up: 'OK', degraded: 'Degradado', down: 'Caído' }

function metricColor(pct: number, warnAt = 70, critAt = 90): string {
  if (pct >= critAt) return '#f87171'
  if (pct >= warnAt) return '#facc15'
  return '#4ade80'
}

function diskColor(pct: number): string {
  return metricColor(pct, 70, 80)
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 4, background: 'rgba(200,168,64,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.4s ease'
        }}
      />
    </div>
  )
}

function MetricRow({
  label,
  pct,
  detail,
  color
}: {
  label: string
  pct: number
  detail: string
  color: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color }}>
          {detail}
        </span>
      </div>
      <ProgressBar pct={pct} color={color} />
    </div>
  )
}

export function SistemaPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health', { credentials: 'include' })
      const data: HealthData = await res.json()
      setHealth(data)
      setLastUpdated(new Date())
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30_000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const servers = health?.servers ?? []
  const services = health?.services ?? []

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        background: '#0D0A06',
        display: 'flex',
        flexDirection: 'column',
        gap: 32
      }}
    >
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 18, color: '#C8A840', letterSpacing: '0.1em', margin: 0 }}>
            SISTEMA
          </h1>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', margin: '4px 0 0' }}>
            Monitorización de infraestructura
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
              {lastUpdated.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={fetchHealth}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              color: '#C8A840',
              background: 'rgba(200,168,64,0.08)',
              border: '1px solid rgba(200,168,64,0.25)',
              padding: '4px 12px',
              cursor: 'pointer',
              letterSpacing: '0.06em'
            }}
          >
            ↺ Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          Cargando...
        </div>
      ) : (
        <>
          {/* Section 1 — VPS Servers */}
          <section>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30', letterSpacing: '0.12em', marginBottom: 16 }}>
              SERVIDORES VPS
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {servers.map((srv) => (
                <ServerCard key={srv.url} server={srv} />
              ))}
            </div>
          </section>

          {/* Section 2 — Services */}
          <section>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30', letterSpacing: '0.12em', marginBottom: 12 }}>
              SERVICIOS
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {services.map((svc) => (
                <div
                  key={svc.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    background: '#13100A',
                    border: '1px solid rgba(200,168,64,0.08)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: SVC_STATUS_COLOR[svc.status], flexShrink: 0 }} />
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#E8DCC8' }}>
                      {SERVICE_LABELS[svc.name] ?? svc.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: SVC_STATUS_COLOR[svc.status] }}>
                      {SVC_STATUS_LABEL[svc.status]}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', minWidth: 52, textAlign: 'right' }}>
                      {svc.latency > 0 ? `${svc.latency}ms` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function ServerCard({ server: srv }: { server: ServerData }) {
  const ok = srv.status === 'ok'

  return (
    <div
      style={{
        background: '#13100A',
        border: `1px solid ${ok ? 'rgba(200,168,64,0.15)' : 'rgba(248,113,113,0.2)'}`,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}
    >
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? '#4ade80' : '#f87171', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 12, color: '#C8A840', letterSpacing: '0.06em' }}>
            {srv.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {srv.uptime_seconds !== undefined && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30' }}>
              ↑ {formatUptime(srv.uptime_seconds)}
            </span>
          )}
          {srv.latency_ms !== undefined && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30' }}>
              {srv.latency_ms}ms
            </span>
          )}
        </div>
      </div>

      {!ok ? (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#f87171' }}>
          Sin conexión
        </span>
      ) : (
        <>
          {/* CPU */}
          {srv.cpu !== undefined && (
            <MetricRow
              label="CPU"
              pct={srv.cpu}
              detail={`${srv.cpu.toFixed(1)}%`}
              color={metricColor(srv.cpu)}
            />
          )}

          {/* RAM */}
          {srv.ram && (
            <MetricRow
              label="RAM"
              pct={srv.ram.percent}
              detail={`${srv.ram.used.toFixed(1)} / ${srv.ram.total.toFixed(1)} GB (${srv.ram.percent.toFixed(0)}%)`}
              color={metricColor(srv.ram.percent)}
            />
          )}

          {/* Disk */}
          {srv.disk && (
            <MetricRow
              label="DISK"
              pct={srv.disk.percent}
              detail={`${srv.disk.used.toFixed(1)} / ${srv.disk.total.toFixed(1)} GB (${srv.disk.percent.toFixed(0)}%)`}
              color={diskColor(srv.disk.percent)}
            />
          )}

          {/* Containers */}
          {srv.containers && srv.containers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30', letterSpacing: '0.08em' }}>
                CONTAINERS
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                {srv.containers.map((ct) => (
                  <div key={ct.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: ct.status === 'running' ? '#4ade80' : '#f87171',
                        flexShrink: 0
                      }}
                    />
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#7A6A50' }}>
                      {ct.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
