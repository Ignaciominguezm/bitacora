import { useState, useEffect } from 'react'

interface ServiceStatus {
  name: string
  status: 'up' | 'degraded' | 'down'
  latency: number
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
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function fetchHealth() {
    try {
      const res = await fetch('/api/health', { credentials: 'include' })
      const data: ServiceStatus[] = await res.json()
      setServices(data)
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

  const allUp = services.every((s) => s.status === 'up')
  const anyDown = services.some((s) => s.status === 'down')

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
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 11, color: '#A09070', letterSpacing: '0.08em' }}>
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
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30' }}>
            {lastUpdated ? lastUpdated.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '—'}
          </span>
        </div>
      </div>

      {/* Services list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {loading ? (
          <div style={{ padding: '12px', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Comprobando servicios...
          </div>
        ) : (
          services.map((svc) => (
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
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: STATUS_COLOR[svc.status],
                    flexShrink: 0
                  }}
                />
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#E8DCC8' }}>
                  {svc.name}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10,
                    color: STATUS_COLOR[svc.status]
                  }}
                >
                  {STATUS_LABEL[svc.status]}
                </span>
                {svc.status === 'up' && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
                    {svc.latency}ms
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
