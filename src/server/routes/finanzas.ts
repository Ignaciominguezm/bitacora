import { Hono } from 'hono'
import { finanzasDb } from '../db/index.js'

export const finanzasRoutes = new Hono()

const TIPOS_CUENTA = ['banco', 'efectivo', 'otro'] as const
type TipoCuenta = (typeof TIPOS_CUENTA)[number]

function isTipoCuenta(v: unknown): v is TipoCuenta {
  return typeof v === 'string' && (TIPOS_CUENTA as readonly string[]).includes(v)
}

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
      `SELECT id, nombre, tipo, orden, color, lleva_contabilidad, lleva_fiscalidad, created_at, updated_at
       FROM ambitos ORDER BY orden`
    )
    return c.json({ ambitos: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// GET /api/finanzas/cuentas — list accounts (all ámbitos, or filtered), with derived saldo_actual
finanzasRoutes.get('/cuentas', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const ambitoId = c.req.query('ambito_id')

  try {
    const params: unknown[] = []
    let where = ''
    if (ambitoId !== undefined) {
      if (!/^\d+$/.test(ambitoId)) return c.json({ error: 'ambito_id inválido' }, 400)
      params.push(Number(ambitoId))
      where = 'WHERE v.ambito_id = $1'
    }

    const result = await finanzasDb.query(
      `SELECT
         v.id, v.ambito_id, v.nombre, v.tipo, v.entidad, v.moneda, v.activa,
         v.created_at, v.updated_at, v.saldo_actual, v.saldo_semana,
         a.nombre AS ambito_nombre, a.color AS ambito_color, a.orden AS ambito_orden
       FROM v_cuentas_saldo_actual v
       JOIN ambitos a ON a.id = v.ambito_id
       ${where}
       ORDER BY a.orden, v.nombre`,
      params
    )
    return c.json({ cuentas: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/cuentas — create account
finanzasRoutes.post('/cuentas', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)

  const { ambito_id, nombre, tipo, entidad, moneda } = body as Record<string, unknown>

  if (typeof ambito_id !== 'number' || !Number.isInteger(ambito_id)) {
    return c.json({ error: 'ambito_id es obligatorio y debe ser un entero' }, 400)
  }
  if (typeof nombre !== 'string' || nombre.trim() === '') {
    return c.json({ error: 'nombre es obligatorio' }, 400)
  }
  if (!isTipoCuenta(tipo)) {
    return c.json({ error: `tipo debe ser uno de: ${TIPOS_CUENTA.join(', ')}` }, 400)
  }
  if (entidad !== undefined && entidad !== null && typeof entidad !== 'string') {
    return c.json({ error: 'entidad debe ser texto' }, 400)
  }
  if (moneda !== undefined && moneda !== null && typeof moneda !== 'string') {
    return c.json({ error: 'moneda debe ser texto' }, 400)
  }

  try {
    const ambitoExists = await finanzasDb.query('SELECT 1 FROM ambitos WHERE id = $1', [ambito_id])
    if (ambitoExists.rowCount === 0) return c.json({ error: 'ambito_id no existe' }, 400)

    const result = await finanzasDb.query(
      `INSERT INTO cuentas_financieras (ambito_id, nombre, tipo, entidad, moneda)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'EUR'))
       RETURNING *`,
      [ambito_id, nombre.trim(), tipo, entidad ?? null, moneda ?? null]
    )
    return c.json({ cuenta: result.rows[0] }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/cuentas/:id — edit account fields
finanzasRoutes.patch('/cuentas/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)

  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)

  const { nombre, tipo, entidad, moneda, activa } = body as Record<string, unknown>

  const sets: string[] = []
  const params: unknown[] = []

  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || nombre.trim() === '') {
      return c.json({ error: 'nombre no puede estar vacío' }, 400)
    }
    params.push(nombre.trim())
    sets.push(`nombre = $${params.length}`)
  }
  if (tipo !== undefined) {
    if (!isTipoCuenta(tipo)) return c.json({ error: `tipo debe ser uno de: ${TIPOS_CUENTA.join(', ')}` }, 400)
    params.push(tipo)
    sets.push(`tipo = $${params.length}`)
  }
  if (entidad !== undefined) {
    if (entidad !== null && typeof entidad !== 'string') return c.json({ error: 'entidad debe ser texto' }, 400)
    params.push(entidad)
    sets.push(`entidad = $${params.length}`)
  }
  if (moneda !== undefined) {
    if (typeof moneda !== 'string' || moneda.trim() === '') return c.json({ error: 'moneda debe ser texto' }, 400)
    params.push(moneda)
    sets.push(`moneda = $${params.length}`)
  }
  if (activa !== undefined) {
    if (typeof activa !== 'boolean') return c.json({ error: 'activa debe ser booleano' }, 400)
    params.push(activa)
    sets.push(`activa = $${params.length}`)
  }

  if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)

  sets.push('updated_at = now()')
  params.push(id)

  try {
    const result = await finanzasDb.query(
      `UPDATE cuentas_financieras SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    if (result.rowCount === 0) return c.json({ error: 'Cuenta no encontrada' }, 404)
    return c.json({ cuenta: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// PATCH /api/finanzas/cuentas/:id/desactivar — soft-delete (nunca DELETE físico: saldos_semanales RESTRICT)
finanzasRoutes.patch('/cuentas/:id/desactivar', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  try {
    const result = await finanzasDb.query(
      `UPDATE cuentas_financieras SET activa = false, updated_at = now() WHERE id = $1 RETURNING *`,
      [id]
    )
    if (result.rowCount === 0) return c.json({ error: 'Cuenta no encontrada' }, 404)
    return c.json({ cuenta: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// PATCH /api/finanzas/cuentas/:id/activar — reverse of desactivar
finanzasRoutes.patch('/cuentas/:id/activar', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  try {
    const result = await finanzasDb.query(
      `UPDATE cuentas_financieras SET activa = true, updated_at = now() WHERE id = $1 RETURNING *`,
      [id]
    )
    if (result.rowCount === 0) return c.json({ error: 'Cuenta no encontrada' }, 404)
    return c.json({ cuenta: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})
