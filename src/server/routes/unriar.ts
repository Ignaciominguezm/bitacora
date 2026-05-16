import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { authMiddleware } from '../middleware/auth.js'

export const unriarRoutes = new Hono()

type SSEWriter = (evt: { event?: string; data: string }) => Promise<void>
const sseClients = new Map<string, SSEWriter>()

// GET /api/unriar/stream?sessionId=xxx
// No JWT — SSE + cookies is complex. Validate sessionId format instead.
unriarRoutes.get('/stream', async (c) => {
  const sessionId = c.req.query('sessionId') ?? ''
  if (!sessionId || sessionId.length > 200 || !/^[\w-]+$/.test(sessionId)) {
    return c.json({ error: 'Invalid sessionId' }, 400)
  }

  return streamSSE(c, async (stream) => {
    sseClients.set(sessionId, (evt) => stream.writeSSE(evt))
    await stream.writeSSE({ event: 'connected', data: JSON.stringify({ sessionId }) })

    // Keepalive loop — exits when writeSSE throws (client disconnected)
    while (true) {
      await new Promise<void>((resolve) => setTimeout(resolve, 15_000))
      try {
        await stream.writeSSE({ event: 'ping', data: new Date().toISOString() })
      } catch {
        break
      }
    }

    sseClients.delete(sessionId)
  })
})

// POST /api/unriar/response — callback from n8n after processing
unriarRoutes.post('/response', async (c) => {
  const internalKey = c.req.header('x-internal-key')
  const expectedKey = process.env.UNRIAR_INTERNAL_KEY
  if (!expectedKey || internalKey !== expectedKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { jobId, sessionId, response, timestamp } = await c.req.json<{
    jobId?: string
    sessionId: string
    response: string
    timestamp?: string
  }>()

  const writer = sseClients.get(sessionId)
  let delivered = false
  if (writer) {
    try {
      await writer({
        event: 'response',
        data: JSON.stringify({
          type: 'response',
          jobId,
          response,
          timestamp: timestamp ?? new Date().toISOString()
        })
      })
      delivered = true
    } catch {
      sseClients.delete(sessionId)
    }
  }

  return c.json({ ok: true, delivered })
})

// POST /api/unriar/message — JWT-authenticated message send
unriarRoutes.post('/message', authMiddleware, async (c) => {
  const { message, sessionId } = await c.req.json<{ message: string; sessionId: string }>()
  const webhookUrl = process.env.N8N_UNRIAR_WEBHOOK

  if (!webhookUrl) {
    return c.json({ error: 'N8N_UNRIAR_WEBHOOK not configured' }, 503)
  }

  const appUrl = (process.env.APP_URL || 'https://bitacora.ignaciominguez.com').replace(/\/$/,  '')
  const callbackUrl = `${appUrl}/api/unriar/response`

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId, callbackUrl }),
      signal: AbortSignal.timeout(30_000)
    })
    const data = await res.json() as unknown
    return c.json(data)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Webhook error' }, 502)
  }
})
