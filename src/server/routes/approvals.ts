import { Hono } from 'hono'
import { bitacoraDb } from '../db/index.js'
import { ACTION_REGISTRY } from '../actions/registry.js'
import { EXECUTORS } from '../actions/executors/index.js'

export const approvalsRoutes = new Hono()

// Sin identidad multiusuario real en Bitácora (una sola contraseña
// compartida, JWT sin más claim útil que 'ignacio' fijo — ver auth.ts):
// approved_by queda como marca genérica de que fue un humano desde la UI,
// no un id de usuario real.
const APPROVED_BY = 'usuario'

// GET /approvals?status=pending&sessionId=... -> lista para la UI.
// Caducidad lazy (sin cron): antes de aplicar cualquier filtro, cualquier
// fila 'pending' cuyo expires_at ya pasó se marca 'expired' aquí mismo —
// así 'pending' nunca devuelve una fila caducada.
approvalsRoutes.get('/', async (c) => {
  if (!bitacoraDb) return c.json([])

  await bitacoraDb.query(
    `UPDATE cabina_approvals SET status = 'expired' WHERE status = 'pending' AND expires_at < now()`
  )

  const status = c.req.query('status')
  const sessionId = c.req.query('sessionId')
  const conditions: string[] = []
  const params: unknown[] = []
  if (status) {
    params.push(status)
    conditions.push(`status = $${params.length}`)
  }
  if (sessionId) {
    params.push(sessionId)
    conditions.push(`session_id = $${params.length}`)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const result = await bitacoraDb.query(
    `SELECT * FROM cabina_approvals ${where} ORDER BY created_at DESC LIMIT 100`,
    params
  )
  return c.json(result.rows)
})

// Idempotencia compartida por approve/reject: si la fila ya no está
// 'pending' (aprobada/rechazada/ejecutada/... por una petición anterior),
// se devuelve el estado actual tal cual — nunca se vuelve a ejecutar ni a
// tocar. Si está 'pending' pero ya venció, se marca 'expired' aquí (misma
// caducidad lazy que en GET) y se responde 409.
async function loadPendingOrCurrent(id: string) {
  const current = await bitacoraDb!.query('SELECT * FROM cabina_approvals WHERE id = $1', [id])
  if (current.rows.length === 0) return { row: null, state: 'not_found' as const }

  const row = current.rows[0]
  if (row.status !== 'pending') return { row, state: 'not_pending' as const }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    const expired = await bitacoraDb!.query(
      `UPDATE cabina_approvals SET status = 'expired' WHERE id = $1 RETURNING *`,
      [id]
    )
    return { row: expired.rows[0], state: 'expired' as const }
  }

  return { row, state: 'pending' as const }
}

approvalsRoutes.post('/:id/approve', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const id = c.req.param('id')

  const { row, state } = await loadPendingOrCurrent(id)
  if (state === 'not_found') return c.json({ error: 'No encontrada' }, 404)
  if (state === 'not_pending') return c.json(row)
  if (state === 'expired') return c.json(row, 409)

  const entry = ACTION_REGISTRY[row.action_type]
  const executorFn = entry ? EXECUTORS[entry.executor] : undefined

  if (!executorFn) {
    const failed = await bitacoraDb.query(
      `UPDATE cabina_approvals
       SET status = 'failed', error = $2, approved_by = $3, approved_at = now()
       WHERE id = $1 RETURNING *`,
      [id, 'Tipo de acción sin executor configurado', APPROVED_BY]
    )
    return c.json(failed.rows[0])
  }

  const result = await executorFn(row.payload)
  const updated = await bitacoraDb.query(
    `UPDATE cabina_approvals
     SET status = $2, execution_mode = $3, result = $4, error = $5,
         approved_by = $6, approved_at = now(), executed_at = now()
     WHERE id = $1 RETURNING *`,
    [
      id,
      result.ok ? 'executed' : 'failed',
      result.executionMode,
      result.result != null ? JSON.stringify(result.result) : null,
      result.error ?? null,
      APPROVED_BY
    ]
  )
  return c.json(updated.rows[0])
})

approvalsRoutes.post('/:id/reject', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const id = c.req.param('id')

  const { row, state } = await loadPendingOrCurrent(id)
  if (state === 'not_found') return c.json({ error: 'No encontrada' }, 404)
  if (state === 'not_pending') return c.json(row)
  if (state === 'expired') return c.json(row, 409)

  const updated = await bitacoraDb.query(
    `UPDATE cabina_approvals
     SET status = 'rejected', approved_by = $2, approved_at = now()
     WHERE id = $1 RETURNING *`,
    [id, APPROVED_BY]
  )
  return c.json(updated.rows[0])
})
