import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getCookie } from 'hono/cookie'
import jwt from 'jsonwebtoken'
import { bitacoraDb } from '../db/index.js'
import { authMiddleware } from '../middleware/auth.js'

export const notifyRoutes = new Hono()

interface NotificationRow {
  id: number
  origen: string
  tipo: string
  mensaje: string
  timestamp: string
  leida: boolean
}

type SSEWriter = (evt: { event?: string; data: string }) => Promise<void>
const sseClients = new Map<string, SSEWriter>()

async function pushToClients(notification: NotificationRow) {
  const payload = JSON.stringify(notification)
  const dead: string[] = []
  for (const [id, write] of sseClients) {
    try {
      await write({ event: 'notification', data: payload })
    } catch {
      dead.push(id)
    }
  }
  dead.forEach((id) => sseClients.delete(id))
}

async function sendTelegram(mensaje: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.log('[notify] Telegram disabled — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set')
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: mensaje }),
      signal: AbortSignal.timeout(5000)
    })
  } catch (err) {
    console.error('[notify] Telegram send failed:', err instanceof Error ? err.message : err)
  }
}

// POST /api/notify — external apps post notifications here
notifyRoutes.post('/', async (c) => {
  const notifyKey = c.req.header('x-notify-key')
  const expectedKey = process.env.NOTIFY_INTERNAL_KEY
  if (!expectedKey || notifyKey !== expectedKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!bitacoraDb) return c.json({ error: 'Database unavailable' }, 503)

  const { origen, tipo, mensaje } = await c.req.json<{
    origen: string
    tipo: string
    mensaje: string
  }>()

  if (!origen || !tipo || !mensaje) {
    return c.json({ error: 'origen, tipo and mensaje are required' }, 400)
  }

  const result = await bitacoraDb.query<NotificationRow>(
    `INSERT INTO notificaciones (origen, tipo, mensaje, timestamp, leida)
     VALUES ($1, $2, $3, NOW(), false)
     RETURNING id, origen, tipo, mensaje, timestamp, leida`,
    [origen, tipo, mensaje]
  )

  const notification = result.rows[0]

  // Non-blocking: SSE push and Telegram run after response is sent
  pushToClients(notification).catch(() => {})
  sendTelegram(`[${origen}] ${tipo}: ${mensaje}`).catch(() => {})

  return c.json(notification, 201)
})

// GET /api/notify/stream — SSE, validated via JWT cookie
notifyRoutes.get('/stream', async (c) => {
  const token = getCookie(c, 'bitacora_token')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    jwt.verify(token, process.env.JWT_SECRET!)
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }

  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return streamSSE(c, async (stream) => {
    sseClients.set(clientId, (evt) => stream.writeSSE(evt))
    await stream.writeSSE({ event: 'connected', data: JSON.stringify({ clientId }) })

    while (true) {
      await new Promise<void>((resolve) => setTimeout(resolve, 15_000))
      try {
        await stream.writeSSE({ event: 'ping', data: new Date().toISOString() })
      } catch {
        break
      }
    }

    sseClients.delete(clientId)
  })
})

// GET /api/notify/unread — JWT protected
notifyRoutes.get('/unread', authMiddleware, async (c) => {
  if (!bitacoraDb) return c.json([])
  const result = await bitacoraDb.query<NotificationRow>(
    `SELECT id, origen, tipo, mensaje, timestamp, leida
     FROM notificaciones
     WHERE leida = false
     ORDER BY timestamp DESC`
  )
  return c.json(result.rows)
})

// PATCH /api/notify/read-all — JWT protected (must be before /:id/read)
notifyRoutes.patch('/read-all', authMiddleware, async (c) => {
  if (!bitacoraDb) return c.json({ error: 'Database unavailable' }, 503)
  await bitacoraDb.query(`UPDATE notificaciones SET leida = true WHERE leida = false`)
  return c.json({ ok: true })
})

// PATCH /api/notify/:id/read — JWT protected
notifyRoutes.patch('/:id/read', authMiddleware, async (c) => {
  if (!bitacoraDb) return c.json({ error: 'Database unavailable' }, 503)
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Invalid id' }, 400)
  const result = await bitacoraDb.query<NotificationRow>(
    `UPDATE notificaciones SET leida = true WHERE id = $1
     RETURNING id, origen, tipo, mensaje, timestamp, leida`,
    [id]
  )
  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404)
  return c.json(result.rows[0])
})
