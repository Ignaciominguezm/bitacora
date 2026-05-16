import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { bitacoraDb } from '../db/index.js'

export const chatRoutes = new Hono()

// Mapa de conexiones SSE activas — sessionId → función push
const sseClients = new Map<string, (data: string) => Promise<void>>()

chatRoutes.get('/history', async (c) => {
  if (!bitacoraDb) return c.json([])
  const result = await bitacoraDb.query(
    `SELECT id, agent, session_id, title, created_at, updated_at
     FROM chat_history ORDER BY updated_at DESC LIMIT 50`
  )
  return c.json(result.rows)
})

chatRoutes.get('/session/:id', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const id = c.req.param('id')
  const result = await bitacoraDb.query('SELECT * FROM chat_history WHERE session_id = $1', [id])
  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404)
  return c.json(result.rows[0])
})

chatRoutes.post('/session', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const { agent, title } = await c.req.json<{ agent: string; title?: string }>()
  const result = await bitacoraDb.query(
    `INSERT INTO chat_history (agent, session_id, messages, title)
     VALUES ($1, gen_random_uuid(), '[]', $2)
     RETURNING *`,
    [agent, title || 'Nueva conversación']
  )
  return c.json(result.rows[0])
})

chatRoutes.patch('/session/:id', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const id = c.req.param('id')
  const { messages, title } = await c.req.json<{ messages: unknown[]; title?: string }>()
  const result = await bitacoraDb.query(
    `UPDATE chat_history SET messages = $1, title = $2, updated_at = NOW()
     WHERE session_id = $3 RETURNING *`,
    [JSON.stringify(messages), title, id]
  )
  return c.json(result.rows[0])
})

// SSE — el frontend escucha aquí esperando la respuesta de Unriar
chatRoutes.get('/unriar/stream', async (c) => {
  const sessionId = c.req.query('sessionId') || 'bitacora-ignacio'

  return streamSSE(c, async (stream) => {
    // Registrar esta conexión SSE
    sseClients.set(sessionId, async (data: string) => {
      await stream.writeSSE({ data })
      await stream.writeSSE({ data: '[DONE]' })
    })

    // Mantener abierto hasta 5 minutos
    await new Promise(resolve => setTimeout(resolve, 300_000))

    // Limpiar si no hubo respuesta
    sseClients.delete(sessionId)
  })
})

// Callback — n8n llama aquí cuando el agente termina
chatRoutes.post('/unriar/callback', async (c) => {
  const internalKey = c.req.header('x-internal-key')
  if (internalKey !== process.env.UNRIAR_INTERNAL_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { response, sessionId } = await c.req.json<{ response: string; sessionId: string }>()
  const push = sseClients.get(sessionId || 'bitacora-ignacio')

  if (push) {
    await push(response)
    sseClients.delete(sessionId || 'bitacora-ignacio')
  }

  return c.json({ ok: true })
})

// POST — fire and forget, no espera respuesta de n8n
chatRoutes.post('/unriar', async (c) => {
  const { message, sessionId } = await c.req.json<{ message: string; sessionId?: string }>()
  const webhookUrl = process.env.N8N_UNRIAR_AGENTE_WEBHOOK

  if (!webhookUrl) {
    return c.json({ error: 'N8N_UNRIAR_AGENTE_WEBHOOK not configured' }, 503)
  }

  // Lanzar sin await — n8n responderá por callback
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId: sessionId || 'bitacora-ignacio'
    })
  }).catch(() => {})

  return c.json({ status: 'processing' })
})

chatRoutes.post('/kinnareth', async (c) => {
  const { message, sessionId } = await c.req.json<{ message: string; sessionId?: string }>()
  const webhookUrl = process.env.N8N_KINNARETH_WEBHOOK

  return streamSSE(c, async (stream) => {
    if (!webhookUrl) {
      const mock = 'Kinnareth en modo prueba — el webhook no está configurado. Configura N8N_KINNARETH_WEBHOOK para activar este agente.'
      for (const char of mock) {
        await stream.writeSSE({ data: char })
        await new Promise((r) => setTimeout(r, 25))
      }
    } else {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, sessionId }),
          signal: AbortSignal.timeout(120_000)
        })
        const rawText = await response.text()
        let content = rawText
        try {
          const json = JSON.parse(rawText) as unknown
          const record = Array.isArray(json) ? (json as unknown[])[0] : json
          if (record !== null && typeof record === 'object') {
            const r = record as Record<string, unknown>
            const out = r.output ?? r.message ?? r.text ?? r.response
            if (typeof out === 'string') content = out
          }
        } catch { /* raw text */ }
        await stream.writeSSE({ data: content })
      } catch (err) {
        await stream.writeSSE({ data: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` })
      }
    }
    await stream.writeSSE({ data: '[DONE]' })
  })
})
