import { Hono } from 'hono'
import { finanzasDb } from '../db/index.js'

export const finanzasRoutes = new Hono()

// GET /api/finanzas/health — verifies DB connectivity
finanzasRoutes.get('/health', async (c) => {
  if (!finanzasDb) return c.json({ ok: false, reason: 'FINANZAS_DB_URL no configurada' }, 503)
  try {
    await finanzasDb.query('SELECT 1')
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ ok: false, reason: err instanceof Error ? err.message : 'connection error' }, 503)
  }
})
