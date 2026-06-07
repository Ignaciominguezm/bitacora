import { Hono } from 'hono'

export const healthRoutes = new Hono()

const SERVICES = [
  { name: 'horario34', url: 'https://horario34.ignaciominguez.com/api/health' },
  { name: 'coreworks', url: 'https://coreworks.ignaciominguez.com/api/health' },
  { name: 'n8n', url: 'https://n8n.ignaciominguez.com/healthz' },
  {
    name: 'waha',
    url: 'https://waha.ignaciominguez.com/api/sessions/default',
    headers: () => ({ 'X-Api-Key': process.env.WAHA_API_KEY || '' })
  },
  { name: 'ollama', url: `${process.env.OLLAMA_URL || 'http://172.17.0.1:11434'}/api/tags` },
  { name: 'ignaciominguez', url: 'https://ignaciominguez.com' },
  { name: 'formacion', url: 'https://formacion.ignaciominguez.com' }
]

const VPS_SERVERS = [
  { name: 'Ecosistema Ignacio', url: 'http://host.docker.internal:9100' },
  { name: 'IMM CORE SYSTEM SL', url: 'http://51.77.223.83:9100' },
  { name: 'Dipinsur', url: 'http://51.77.150.95:9100' },
  { name: 'Nati Paladini', url: 'http://152.228.216.197:9100' }
]

interface VpsAgentData {
  cpu?: number
  ram?: { used: number; total: number; percent: number }
  disk?: { used: number; total: number; percent: number }
  containers?: Array<{ name: string; status: string }>
  uptime_seconds?: number
}

healthRoutes.get('/', async (c) => {
  const [serviceResults, serverResults] = await Promise.all([
    Promise.allSettled(
      SERVICES.map(async (svc) => {
        const start = Date.now()
        try {
          const res = await fetch(svc.url, {
            signal: AbortSignal.timeout(5000),
            headers: svc.headers ? svc.headers() : undefined
          })
          return { name: svc.name, status: res.ok ? 'up' : 'degraded', latency: Date.now() - start }
        } catch {
          return { name: svc.name, status: 'down', latency: Date.now() - start }
        }
      })
    ),
    Promise.allSettled(
      VPS_SERVERS.map(async (srv) => {
        const start = Date.now()
        try {
          const res = await fetch(srv.url, { signal: AbortSignal.timeout(5000) })
          const latency_ms = Date.now() - start
          if (!res.ok) return { name: srv.name, url: srv.url, status: 'error', latency_ms }
          const data = (await res.json()) as VpsAgentData
          return {
            name: srv.name,
            url: srv.url,
            status: 'ok',
            latency_ms,
            cpu: data.cpu,
            ram: data.ram,
            disk: data.disk,
            containers: data.containers,
            uptime_seconds: data.uptime_seconds
          }
        } catch {
          return { name: srv.name, url: srv.url, status: 'error', latency_ms: Date.now() - start }
        }
      })
    )
  ])

  const services = serviceResults.map((r) =>
    r.status === 'fulfilled' ? r.value : { name: 'unknown', status: 'down', latency: 0 }
  )
  const servers = serverResults.map((r) =>
    r.status === 'fulfilled' ? r.value : { name: 'unknown', url: '', status: 'error', latency_ms: 0 }
  )

  const anyDown = services.some((s) => s.status === 'down')
  const anyDegraded = services.some((s) => s.status === 'degraded')
  const overall = anyDown ? 'down' : anyDegraded ? 'degraded' : 'up'

  return c.json({ overall, services, servers })
})
