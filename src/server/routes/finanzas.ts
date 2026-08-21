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

// GET /api/finanzas/ambitos — read-only, validates finanzas_user can read real tables
finanzasRoutes.get('/ambitos', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  try {
    const result = await finanzasDb.query(
      'SELECT id, nombre, slug, created_at FROM ambitos ORDER BY id'
    )
    return c.json({ ambitos: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})
