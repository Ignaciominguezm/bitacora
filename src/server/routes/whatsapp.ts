import { Hono } from 'hono'
import { n8nDb, immDb } from '../db/index.js'

export const whatsappRoutes = new Hono()

interface ConversationRow {
  session_id: string
  last_id: string
  message_count: string
  last_message: string | null
  last_type: string | null
}

interface ContactRow {
  full_name: string
  phone: string
}

whatsappRoutes.get('/recent', async (c) => {
  if (!n8nDb) return c.json({ conversations: [] })

  try {
    const result = await n8nDb.query<ConversationRow>(`
      SELECT
        session_id,
        MAX(id) as last_id,
        COUNT(*) as message_count,
        (SELECT message->>'content'
         FROM unria_memory m2
         WHERE m2.session_id = m1.session_id
         ORDER BY id DESC LIMIT 1) as last_message,
        (SELECT message->>'type'
         FROM unria_memory m2
         WHERE m2.session_id = m1.session_id
         ORDER BY id DESC LIMIT 1) as last_type
      FROM unria_memory m1
      WHERE session_id NOT IN ('status@broadcast')
      GROUP BY session_id
      ORDER BY last_id DESC
      LIMIT 20
    `)

    const rows = result.rows

    // Build a last-9-digits → contact name map from imm_db
    const contactMap = new Map<string, string>()
    if (immDb && rows.length > 0) {
      const last9List = rows.map((r) => r.session_id.replace('@c.us', '').slice(-9))
      try {
        const contactResult = await immDb.query<ContactRow>(
          `SELECT full_name, phone
           FROM core_contacts
           WHERE phone IS NOT NULL
             AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 9) = ANY($1::text[])`,
          [last9List]
        )
        for (const contact of contactResult.rows) {
          const last9 = contact.phone.replace(/[^0-9]/g, '').slice(-9)
          contactMap.set(last9, contact.full_name)
        }
      } catch (err) {
        console.error('[whatsapp/recent] contact lookup error:', err)
      }
    }

    const conversations = rows.map((r) => {
      const phone = r.session_id.replace('@c.us', '')
      const last9 = phone.slice(-9)
      return {
        session_id: r.session_id,
        phone,
        full_name: contactMap.get(last9) ?? null,
        last_message: r.last_message ?? '',
        last_type: r.last_type ?? 'human',
        message_count: parseInt(r.message_count, 10),
        last_id: parseInt(r.last_id, 10)
      }
    })

    return c.json({ conversations })
  } catch (err) {
    console.error('[whatsapp/recent]', err)
    return c.json({ conversations: [] })
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
