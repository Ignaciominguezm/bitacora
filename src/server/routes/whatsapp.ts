import { Hono } from 'hono'
import { n8nDb } from '../db/index.js'

export const whatsappRoutes = new Hono()

whatsappRoutes.get('/recent', async (c) => {
  if (!n8nDb) return c.json([])

  try {
    const result = await n8nDb.query(
      `SELECT DISTINCT ON (session_id) *
       FROM unria_memory
       ORDER BY session_id, id DESC
       LIMIT 20`
    )
    return c.json(result.rows)
  } catch {
    return c.json([])
  }
})

whatsappRoutes.post('/send', async (c) => {
  const { chatId, text, session } = await c.req.json<{
    chatId: string
    text: string
    session?: string
  }>()

  const wahaUrl = process.env.WAHA_URL || 'https://waha.ignaciominguez.com'
  const apiKey = process.env.WAHA_API_KEY
  const wahaSession = session || process.env.WAHA_SESSION || 'default'

  const response = await fetch(`${wahaUrl}/api/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-Api-Key': apiKey } : {})
    },
    body: JSON.stringify({ chatId, text, session: wahaSession })
  })

  const data = await response.json()
  return c.json(data)
})
