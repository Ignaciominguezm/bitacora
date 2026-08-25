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

interface GpuData {
  name: string
  temp_c: number
  vram_used_mb: number
  vram_total_mb: number
  usage_percent: number
}

interface PushPayload {
  status: string
  hostname: string
  timestamp: string
  cpu_percent: number
  ram: { used_gb: number; total_gb: number; percent: number }
  disk_root: { used_percent: number }
  disk_datos: { used_percent: number }
  gpu?: GpuData
  services?: Record<string, string>
  uptime_seconds?: number
}

interface PushServerData {
  hostname: string
  status: 'ok' | 'offline'
  last_seen: string
  seconds_since_report: number
  payload: PushPayload
}

interface HealthData {
  overall: 'up' | 'degraded' | 'down'
  services: ServiceStatus[]
  servers: ServerData[]
  push_servers: PushServerData[]
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

function tempColor(c: number): string {
  if (c >= 85) return '#f87171'
  if (c >= 70) return '#facc15'
  return '#4ade80'
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

function relativeTime(seconds: number): string {
  if (seconds < 60) return `hace ${seconds}s`
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`
  return `hace ${Math.floor(seconds / 3600)} h`
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
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color }}>
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
  const pushServers = health?.push_servers ?? []

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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-xl)', color: '#C8A840', letterSpacing: '0.1em', margin: 0 }}>
            SISTEMA
          </h1>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Monitorización de infraestructura
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 'var(--notif-gutter)' }}>
          {lastUpdated && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {lastUpdated.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={fetchHealth}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 'var(--text-xs)',
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
        <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>
          Cargando...
        </div>
      ) : (
        <>
          {/* Section 1 — VPS Servers */}
          <section>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em', marginBottom: 16 }}>
              SERVIDORES VPS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {servers.map((srv) => (
                <ServerCard key={srv.url} server={srv} />
              ))}
            </div>
          </section>

          {/* Section 2 — Push-based stations */}
          {pushServers.length > 0 && (
            <section>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em', marginBottom: 16 }}>
                ESTACIONES
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
                {pushServers.map((ps) => (
                  <GuaridaCard key={ps.hostname} server={ps} />
                ))}
              </div>
            </section>
          )}

          {/* Section 3 — Services */}
          <section>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em', marginBottom: 12 }}>
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
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8' }}>
                      {SERVICE_LABELS[svc.name] ?? svc.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: SVC_STATUS_COLOR[svc.status] }}>
                      {SVC_STATUS_LABEL[svc.status]}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', minWidth: 52, textAlign: 'right' }}>
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
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-base)', color: '#C8A840', letterSpacing: '0.06em' }}>
            {srv.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {srv.uptime_seconds !== undefined && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
              ↑ {formatUptime(srv.uptime_seconds)}
            </span>
          )}
          {srv.latency_ms !== undefined && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
              {srv.latency_ms}ms
            </span>
          )}
        </div>
      </div>

      {!ok ? (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#f87171' }}>
          Sin conexión
        </span>
      ) : (
        <>
          {srv.cpu !== undefined && (
            <MetricRow label="CPU" pct={srv.cpu} detail={`${srv.cpu.toFixed(1)}%`} color={metricColor(srv.cpu)} />
          )}
          {srv.ram && (
            <MetricRow
              label="RAM"
              pct={srv.ram.percent}
              detail={`${srv.ram.used.toFixed(1)} / ${srv.ram.total.toFixed(1)} GB (${srv.ram.percent.toFixed(0)}%)`}
              color={metricColor(srv.ram.percent)}
            />
          )}
          {srv.disk && (
            <MetricRow
              label="DISK"
              pct={srv.disk.percent}
              detail={`${srv.disk.used.toFixed(1)} / ${srv.disk.total.toFixed(1)} GB (${srv.disk.percent.toFixed(0)}%)`}
              color={diskColor(srv.disk.percent)}
            />
          )}
          {srv.containers && srv.containers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
                CONTAINERS
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                {srv.containers.map((ct) => (
                  <div key={ct.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: ct.status === 'running' ? '#4ade80' : '#f87171', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
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

function GuaridaCard({ server: ps }: { server: PushServerData }) {
  const online = ps.status === 'ok'
  const p = ps.payload
  const dimmed = (color: string) => online ? color : '#3A3028'

  return (
    <div
      style={{
        background: '#13100A',
        border: `1px solid ${online ? 'rgba(200,168,64,0.15)' : 'rgba(248,113,113,0.2)'}`,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#4ade80' : '#f87171', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-base)', color: '#C8A840', letterSpacing: '0.06em' }}>
            {ps.hostname}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {p.uptime_seconds !== undefined && online && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
              ↑ {formatUptime(p.uptime_seconds)}
            </span>
          )}
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: online ? 'var(--color-text-muted)' : '#f87171' }}>
            {relativeTime(ps.seconds_since_report)}
          </span>
        </div>
      </div>

      {/* Offline banner */}
      {!online && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#f87171' }}>
          Sin conexión — último reporte {relativeTime(ps.seconds_since_report)}
        </div>
      )}

      {/* Metrics — greyed out when offline */}
      <MetricRow
        label="CPU"
        pct={p.cpu_percent ?? 0}
        detail={`${(p.cpu_percent ?? 0).toFixed(1)}%`}
        color={dimmed(metricColor(p.cpu_percent ?? 0))}
      />

      {p.ram && (
        <MetricRow
          label="RAM"
          pct={p.ram.percent}
          detail={`${p.ram.used_gb.toFixed(1)} / ${p.ram.total_gb.toFixed(1)} GB (${p.ram.percent}%)`}
          color={dimmed(metricColor(p.ram.percent))}
        />
      )}

      {p.disk_root && (
        <MetricRow
          label="DISK /"
          pct={p.disk_root.used_percent}
          detail={`${p.disk_root.used_percent}%`}
          color={dimmed(diskColor(p.disk_root.used_percent))}
        />
      )}

      {p.disk_datos && (
        <MetricRow
          label="DISK /datos"
          pct={p.disk_datos.used_percent}
          detail={`${p.disk_datos.used_percent}%`}
          color={dimmed(diskColor(p.disk_datos.used_percent))}
        />
      )}

      {/* GPU block — visually distinct with left accent */}
      {p.gpu && (
        <div
          style={{
            borderLeft: `3px solid ${online ? 'rgba(139,105,20,0.6)' : 'rgba(90,74,48,0.3)'}`,
            paddingLeft: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 2
          }}
        >
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
            GPU — {p.gpu.name}
          </span>

          <MetricRow
            label="GPU USAGE"
            pct={p.gpu.usage_percent}
            detail={`${p.gpu.usage_percent}%`}
            color={dimmed(metricColor(p.gpu.usage_percent))}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
              TEMP
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: dimmed(tempColor(p.gpu.temp_c)) }}>
              {p.gpu.temp_c}°C
            </span>
          </div>

          <MetricRow
            label="VRAM"
            pct={(p.gpu.vram_used_mb / p.gpu.vram_total_mb) * 100}
            detail={`${p.gpu.vram_used_mb} / ${p.gpu.vram_total_mb} MB`}
            color={dimmed(metricColor((p.gpu.vram_used_mb / p.gpu.vram_total_mb) * 100))}
          />
        </div>
      )}

      {/* Services */}
      {p.services && Object.keys(p.services).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
            SERVICIOS
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 2 }}>
            {Object.entries(p.services).map(([name, state]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: online ? (state === 'active' ? '#4ade80' : '#f87171') : '#3A3028',
                  flexShrink: 0
                }} />
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: online ? 'var(--color-text-muted)' : '#3A3028' }}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
