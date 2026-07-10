import { Hono } from 'hono'
import { bitacoraDb } from '../db/index.js'

export const serversRoutes = new Hono()

// Extend this map to add future push nodes — each hostname has its own revocable token
const SERVER_TOKENS: Record<string, string | undefined> = {
  'imm-guarida': process.env.GUARIDA_TOKEN
}

// POST /api/servers/:hostname/report — Bearer token auth, no JWT cookie required
serversRoutes.post('/:hostname/report', async (c) => {
  const hostname = c.req.param('hostname')
  const expectedToken = SERVER_TOKENS[hostname]

  if (!expectedToken) return c.json({ error: 'Unknown host' }, 401)

  const auth = c.req.header('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (token !== expectedToken) return c.json({ error: 'Unauthorized' }, 401)

  if (!bitacoraDb) return c.json({ error: 'Database unavailable' }, 503)

  const payload = await c.req.json()

  await bitacoraDb.query(
    `INSERT INTO server_reports (hostname, payload, received_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (hostname) DO UPDATE SET payload = EXCLUDED.payload, received_at = NOW()`,
    [hostname, JSON.stringify(payload)]
  )

  return c.json({ ok: true })
})
