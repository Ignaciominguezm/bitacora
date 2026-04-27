import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { bitacoraDb } from '../db/index.js'

export const chatRoutes = new Hono()

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

async function proxyWebhookAsSSE(
  webhookUrl: string,
  body: unknown,
  stream: { writeSSE: (opts: { data: string }) => Promise<void> }
) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  })

  const rawText = await response.text()
  let content = rawText

  // n8n AI Agent returns { "output": "..." }. Also handle arrays and
  // other common field names so the code survives workflow changes.
  try {
    const json = JSON.parse(rawText) as unknown
    const record = Array.isArray(json) ? (json as unknown[])[0] : json
    if (record !== null && typeof record === 'object') {
      const r = record as Record<string, unknown>
      const out = r.output ?? r.message ?? r.text ?? r.response
      if (typeof out === 'string') content = out
    }
  } catch {
    // Not JSON — forward the raw text as-is
  }

  // SSE data fields cannot contain raw newlines (they would break the frame).
  // Encode \n as the two-character sequence \n so the client can restore them.
  await stream.writeSSE({ data: content.replace(/\n/g, '\\n') })
}

chatRoutes.post('/unriar', async (c) => {
  const { message, sessionId } = await c.req.json<{ message: string; sessionId?: string }>()
  const webhookUrl = process.env.N8N_UNRIAR_WEBHOOK

  return streamSSE(c, async (stream) => {
    if (!webhookUrl) {
      await stream.writeSSE({ data: 'Error: N8N_UNRIAR_WEBHOOK not configured' })
    } else {
      try {
        await proxyWebhookAsSSE(webhookUrl, { message, sessionId }, stream)
      } catch (err) {
        await stream.writeSSE({ data: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` })
      }
    }
    await stream.writeSSE({ data: '[DONE]' })
  })
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
        await proxyWebhookAsSSE(webhookUrl, { message, sessionId }, stream)
      } catch (err) {
        await stream.writeSSE({ data: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` })
      }
    }
    await stream.writeSSE({ data: '[DONE]' })
  })
})
