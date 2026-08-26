import { useState, useEffect, useCallback } from 'react'

interface ServiceStatus {
  name: string
  status: 'up' | 'degraded' | 'down'
  latency: number
}

interface ServerData {
  name: string
  url: string
  status: 'ok' | 'error'
}

interface PushServerData {
  hostname: string
  status: 'ok' | 'offline'
}

interface HealthData {
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

// El campo `overall` que devuelve /api/health solo mira `services` (los 7
// checks web) — ignora `servers` (los VPS) y `push_servers`. Un VPS caído
// no lo tocaba. Este resumen agrega las tres listas en el cliente, sin
// tocar el endpoint ni añadir comprobaciones nuevas.
function summarize(health: HealthData): { ok: boolean; problems: string[] } {
  const problems: string[] = []

  for (const svc of health.services) {
    if (svc.status === 'down') problems.push(`${SERVICE_LABELS[svc.name] ?? svc.name} (caído)`)
    else if (svc.status === 'degraded') problems.push(`${SERVICE_LABELS[svc.name] ?? svc.name} (degradado)`)
  }
  for (const srv of health.servers) {
    if (srv.status === 'error') problems.push(`${srv.name} (sin conexión)`)
  }
  for (const ps of health.push_servers) {
    if (ps.status === 'offline') problems.push(`${ps.hostname} (sin conexión)`)
  }

  return { ok: problems.length === 0, problems }
}

export function SystemHealthBanner({ onOpenSistema }: { onOpenSistema: () => void }) {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [checking, setChecking] = useState(true)
  const [fetchFailed, setFetchFailed] = useState(false)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health', { credentials: 'include' })
      if (!res.ok) throw new Error('bad response')
      const data: HealthData = await res.json()
      setHealth(data)
      setFetchFailed(false)
    } catch {
      setFetchFailed(true)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30_000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  if (checking) {
    return (
      <div
        style={{
          flexShrink: 0,
          padding: '16px 24px',
          background: '#1A1510',
          border: '1px solid rgba(200,168,64,0.15)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)'
        }}
      >
        Comprobando estado de los sistemas...
      </div>
    )
  }

  // No se pudo ni contactar con /api/health — no confundir con "infra caída"
  // (puede ser un problema del propio cliente), así que queda neutro, no rojo.
  if (fetchFailed || !health) {
    return (
      <div
        style={{
          flexShrink: 0,
          padding: '16px 24px',
          background: '#1A1510',
          border: '1px solid rgba(200,168,64,0.2)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)'
        }}
      >
        No se pudo comprobar el estado de los sistemas.
      </div>
    )
  }

  const { ok, problems } = summarize(health)

  return (
    <button
      onClick={onOpenSistema}
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '20px 28px',
        background: ok ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.14)',
        border: `1px solid ${ok ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.5)'}`,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        flexWrap: 'wrap'
      }}
      title="Ver detalle en Sistema"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: ok ? '#4ade80' : '#f87171',
            flexShrink: 0,
            boxShadow: ok ? '0 0 10px rgba(74,222,128,0.6)' : '0 0 10px rgba(248,113,113,0.6)'
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: 22,
              letterSpacing: '0.06em',
              color: ok ? '#4ade80' : '#f87171'
            }}
          >
            {ok ? 'TODO OK' : 'ATENCIÓN — ALGO CAÍDO'}
          </span>
          {!ok && (
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 'var(--text-sm)',
                color: '#E8DCC8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {problems.join(' · ')}
            </span>
          )}
        </div>
      </div>
      <span
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 'var(--text-xs)',
          color: ok ? '#4ade80' : '#f87171',
          flexShrink: 0,
          letterSpacing: '0.04em',
          marginRight: 'var(--notif-gutter)'
        }}
      >
        Ver Sistema →
      </span>
    </button>
  )
}
