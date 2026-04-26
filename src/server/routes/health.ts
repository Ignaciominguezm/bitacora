import { Hono } from 'hono'

export const healthRoutes = new Hono()

const SERVICES = [
  { name: 'horario34', url: 'https://horario34.ignaciominguez.com/api/health' },
  { name: 'coreworks', url: 'https://coreworks.ignaciominguez.com/api/health' },
  { name: 'vacaciones38', url: 'https://vacaciones38.ignaciominguez.com/api/health' },
  { name: 'n8n', url: 'https://n8n.ignaciominguez.com/healthz' },
  { name: 'waha', url: 'https://waha.ignaciominguez.com/api/health' },
  { name: 'ollama', url: `${process.env.OLLAMA_URL || 'http://172.17.0.1:11434'}/api/tags` }
]

healthRoutes.get('/', async (c) => {
  const results = await Promise.allSettled(
    SERVICES.map(async (svc) => {
      const start = Date.now()
      try {
        const res = await fetch(svc.url, { signal: AbortSignal.timeout(5000) })
        return { name: svc.name, status: res.ok ? 'up' : 'degraded', latency: Date.now() - start }
      } catch {
        return { name: svc.name, status: 'down', latency: Date.now() - start }
      }
    })
  )

  return c.json(
    results.map((r) => (r.status === 'fulfilled' ? r.value : { name: 'unknown', status: 'down', latency: 0 }))
  )
})
