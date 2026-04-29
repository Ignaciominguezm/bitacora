import { Hono } from 'hono'
import { n8nDb } from '../db/index.js'

export const whatsappRoutes = new Hono()

type LangChainContentBlock = { type: string; text?: string }
type LangChainMessage = {
  type?: string
  content?: string | LangChainContentBlock[]
  [key: string]: unknown
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    // Array of LangChain messages — take the last one
    if (value.length === 0) return ''
    return extractText(value[value.length - 1])
  }

  if (value !== null && typeof value === 'object') {
    const msg = value as LangChainMessage
    if ('content' in msg) {
      const content = msg.content
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        const textBlock = content.find((b) => b.type === 'text')
        return textBlock?.text ?? content.map((b) => b.text ?? '').join(' ')
      }
    }
  }

  return ''
}

function transformRow(row: Record<string, unknown>) {
  // Identify whichever column holds the LangChain messages
  const raw = row.messages ?? row.message ?? row.last_message ?? null
  let lastMessage = ''

  if (raw !== null) {
    let parsed: unknown = raw
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw) } catch { parsed = raw }
    }
    lastMessage = extractText(parsed).trim().slice(0, 200)
  }

  return {
    id: row.id,
    session_id: row.session_id,
    display_name: (row.display_name as string | null) ?? (row.session_id as string) ?? String(row.id),
    last_message: lastMessage,
    updated_at: row.updated_at ?? row.created_at ?? row.timestamp ?? null,
  }
}

whatsappRoutes.get('/recent', async (c) => {
  if (!n8nDb) return c.json([])

  try {
    const result = await n8nDb.query(
      `SELECT DISTINCT ON (session_id) *
       FROM unria_memory
       ORDER BY session_id, id DESC
       LIMIT 20`
    )
    return c.json(result.rows.map(transformRow))
  } catch (error) {
    console.error('[whatsapp] GET /recent error:', error)
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
