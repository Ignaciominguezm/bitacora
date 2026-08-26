import { Hono } from 'hono'
import { finanzasDb } from '../db/index.js'

export const finanzasRoutes = new Hono()

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const TIPOS_CUENTA = ['banco', 'efectivo', 'otro'] as const
type TipoCuenta = (typeof TIPOS_CUENTA)[number]
const isTipoCuenta = (v: unknown): v is TipoCuenta => typeof v === 'string' && (TIPOS_CUENTA as readonly string[]).includes(v)

const ESTADOS_REVISION = ['borrador', 'revisada', 'cerrada'] as const
const isEstadoRevision = (v: unknown): v is (typeof ESTADOS_REVISION)[number] =>
  typeof v === 'string' && (ESTADOS_REVISION as readonly string[]).includes(v)

const TIPOS_MOVIMIENTO = ['ingreso', 'gasto'] as const
const isTipoMovimiento = (v: unknown): v is (typeof TIPOS_MOVIMIENTO)[number] =>
  typeof v === 'string' && (TIPOS_MOVIMIENTO as readonly string[]).includes(v)

const ESTADOS_PREVISION = ['previsto', 'realizado', 'cancelado'] as const
const isEstadoPrevision = (v: unknown): v is (typeof ESTADOS_PREVISION)[number] =>
  typeof v === 'string' && (ESTADOS_PREVISION as readonly string[]).includes(v)

const ESTADOS_RESERVA = ['activa', 'liberada', 'usada', 'cancelada'] as const
const isEstadoReserva = (v: unknown): v is (typeof ESTADOS_RESERVA)[number] =>
  typeof v === 'string' && (ESTADOS_RESERVA as readonly string[]).includes(v)

const DIRECCIONES_DEUDA = ['debo', 'me_deben'] as const
const isDireccionDeuda = (v: unknown): v is (typeof DIRECCIONES_DEUDA)[number] =>
  typeof v === 'string' && (DIRECCIONES_DEUDA as readonly string[]).includes(v)

const ESTADOS_DEUDA = ['pendiente', 'pagada', 'cobrada', 'cancelada'] as const
const isEstadoDeuda = (v: unknown): v is (typeof ESTADOS_DEUDA)[number] =>
  typeof v === 'string' && (ESTADOS_DEUDA as readonly string[]).includes(v)

// La "semana" canónica es siempre el lunes ISO de esa semana. Nunca se
// confía en la fecha que manda el cliente sin normalizar por aquí.
function normalizeToMonday(dateStr: string): string | null {
  if (!ISO_DATE_RE.test(dateStr)) return null
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function todayMonday(): string {
  return normalizeToMonday(new Date().toISOString().slice(0, 10)) as string
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function parseNumeric(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isNaN(n) ? null : n
}

// ─── health / ambitos ──────────────────────────────────────────────────

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

// ─── cuentas_financieras (Pieza A) ───────────────────────────────────────

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

// ─── revisión semanal + saldos (Pieza B) ─────────────────────────────────

const REVISION_COLS = `id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, estado, notas, created_at, updated_at`

// GET /api/finanzas/revision/comparar — declarada antes de /revision/:id para
// dejar claro que es una ruta estática, sin ambigüedad con el parámetro :id.
// GET /api/finanzas/revision/comparar?semana=YYYY-MM-DD — saldos vs semana anterior
finanzasRoutes.get('/revision/comparar', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const raw = c.req.query('semana')
  const semana = raw !== undefined ? normalizeToMonday(raw) : todayMonday()
  if (!semana) return c.json({ error: 'semana inválida (formato YYYY-MM-DD)' }, 400)
  const semanaAnterior = addDays(semana, -7)

  try {
    // Arrastre: el saldo de una cuenta en una semana dada es el del último
    // snapshot conocido EN O ANTES de esa semana (LATERAL + semana <= $N),
    // no un match exacto. Una cuenta que no cambió esta semana no debe
    // "desaparecer" del total ni contarse como 0 — sigue en el último
    // valor que se le conoce. Se aplica igual a la semana actual y a la
    // anterior con la que se compara.
    const result = await finanzasDb.query(
      `SELECT
         c.id AS cuenta_id, c.nombre AS cuenta_nombre, c.moneda,
         c.ambito_id, a.nombre AS ambito_nombre, a.color AS ambito_color, a.orden AS ambito_orden,
         sa.saldo AS saldo_actual, sp.saldo AS saldo_anterior
       FROM cuentas_financieras c
       JOIN ambitos a ON a.id = c.ambito_id
       LEFT JOIN LATERAL (
         SELECT saldo FROM saldos_semanales
         WHERE cuenta_id = c.id AND semana <= $1
         ORDER BY semana DESC LIMIT 1
       ) sa ON true
       LEFT JOIN LATERAL (
         SELECT saldo FROM saldos_semanales
         WHERE cuenta_id = c.id AND semana <= $2
         ORDER BY semana DESC LIMIT 1
       ) sp ON true
       WHERE c.activa = true
       ORDER BY a.orden, c.nombre`,
      [semana, semanaAnterior]
    )

    interface AmbitoCompare {
      id: number
      nombre: string
      color: string
      orden: number
      cuentas: Array<{
        cuenta_id: number
        nombre: string
        moneda: string
        saldo_actual: number | null
        saldo_anterior: number | null
        delta: number | null
        delta_pct: number | null
      }>
      total_actual: number | null
      total_anterior: number | null
    }

    const ambitosMap = new Map<number, AmbitoCompare>()
    let anyPrevious = false

    for (const row of result.rows) {
      const actual = row.saldo_actual !== null ? Number(row.saldo_actual) : null
      const anterior = row.saldo_anterior !== null ? Number(row.saldo_anterior) : null
      if (anterior !== null) anyPrevious = true
      const delta = actual !== null && anterior !== null ? actual - anterior : null
      const deltaPct = delta !== null && anterior !== null && anterior !== 0 ? (delta / anterior) * 100 : null

      if (!ambitosMap.has(row.ambito_id)) {
        ambitosMap.set(row.ambito_id, {
          id: row.ambito_id,
          nombre: row.ambito_nombre,
          color: row.ambito_color,
          orden: row.ambito_orden,
          cuentas: [],
          total_actual: null,
          total_anterior: null
        })
      }
      const grupo = ambitosMap.get(row.ambito_id)!
      grupo.cuentas.push({
        cuenta_id: row.cuenta_id,
        nombre: row.cuenta_nombre,
        moneda: row.moneda,
        saldo_actual: actual,
        saldo_anterior: anterior,
        delta,
        delta_pct: deltaPct
      })
      if (actual !== null) grupo.total_actual = (grupo.total_actual ?? 0) + actual
      if (anterior !== null) grupo.total_anterior = (grupo.total_anterior ?? 0) + anterior
    }

    const ambitos = [...ambitosMap.values()]
      .sort((a, b) => a.orden - b.orden)
      .map((g) => ({
        ...g,
        delta_total: g.total_actual !== null && g.total_anterior !== null ? g.total_actual - g.total_anterior : null
      }))

    return c.json({
      semana,
      semana_anterior: semanaAnterior,
      sin_comparacion_previa: !anyPrevious,
      ambitos
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// GET /api/finanzas/revision?semana=YYYY-MM-DD — revisión + saldos de la semana, agrupados por ámbito
finanzasRoutes.get('/revision', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const raw = c.req.query('semana')
  const semana = raw !== undefined ? normalizeToMonday(raw) : todayMonday()
  if (!semana) return c.json({ error: 'semana inválida (formato YYYY-MM-DD)' }, 400)

  try {
    const revisionResult = await finanzasDb.query(
      `SELECT ${REVISION_COLS} FROM revisiones_semanales WHERE fecha = $1`,
      [semana]
    )
    const revision = revisionResult.rows[0] ?? null

    const cuentasResult = await finanzasDb.query(
      `SELECT
         c.id, c.ambito_id, c.nombre, c.tipo, c.entidad, c.moneda,
         a.nombre AS ambito_nombre, a.color AS ambito_color, a.orden AS ambito_orden,
         s.id AS saldo_id, s.saldo
       FROM cuentas_financieras c
       JOIN ambitos a ON a.id = c.ambito_id
       LEFT JOIN saldos_semanales s ON s.cuenta_id = c.id AND s.semana = $1
       WHERE c.activa = true
       ORDER BY a.orden, c.nombre`,
      [semana]
    )

    interface AmbitoGrupo {
      id: number
      nombre: string
      color: string
      orden: number
      cuentas: Array<{ id: number; nombre: string; tipo: string; entidad: string | null; moneda: string; saldo_id: number | null; saldo: string | null }>
    }

    const ambitosMap = new Map<number, AmbitoGrupo>()
    for (const row of cuentasResult.rows) {
      if (!ambitosMap.has(row.ambito_id)) {
        ambitosMap.set(row.ambito_id, {
          id: row.ambito_id,
          nombre: row.ambito_nombre,
          color: row.ambito_color,
          orden: row.ambito_orden,
          cuentas: []
        })
      }
      ambitosMap.get(row.ambito_id)!.cuentas.push({
        id: row.id,
        nombre: row.nombre,
        tipo: row.tipo,
        entidad: row.entidad,
        moneda: row.moneda,
        saldo_id: row.saldo_id,
        saldo: row.saldo
      })
    }
    const ambitos = [...ambitosMap.values()].sort((a, b) => a.orden - b.orden)

    return c.json({ semana, revision, ambitos })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/revision — crea (o recupera) la revisión de una semana
// revisiones_semanales.fecha no tiene UNIQUE en el esquema #711 (no se altera
// aquí); el "no duplica" se garantiza a nivel de aplicación con
// select-then-insert. Aceptable para cadencia semanal de un único usuario.
finanzasRoutes.post('/revision', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).semana : undefined
  if (typeof raw !== 'string') return c.json({ error: 'semana es obligatoria' }, 400)
  const semana = normalizeToMonday(raw)
  if (!semana) return c.json({ error: 'semana inválida (formato YYYY-MM-DD)' }, 400)

  try {
    const existing = await finanzasDb.query(`SELECT ${REVISION_COLS} FROM revisiones_semanales WHERE fecha = $1`, [semana])
    if (existing.rowCount && existing.rowCount > 0) {
      return c.json({ revision: existing.rows[0] })
    }
    const inserted = await finanzasDb.query(
      `INSERT INTO revisiones_semanales (fecha, estado) VALUES ($1, 'borrador') RETURNING ${REVISION_COLS}`,
      [semana]
    )
    return c.json({ revision: inserted.rows[0] }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/revision/:id — notas y/o estado
finanzasRoutes.patch('/revision/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { notas, estado } = body as Record<string, unknown>

  const sets: string[] = []
  const params: unknown[] = []

  if (notas !== undefined) {
    if (notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)
    params.push(notas)
    sets.push(`notas = $${params.length}`)
  }
  if (estado !== undefined) {
    if (!isEstadoRevision(estado)) return c.json({ error: `estado debe ser uno de: ${ESTADOS_REVISION.join(', ')}` }, 400)
    params.push(estado)
    sets.push(`estado = $${params.length}`)
  }
  if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)

  sets.push('updated_at = now()')
  params.push(id)

  try {
    const result = await finanzasDb.query(
      `UPDATE revisiones_semanales SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${REVISION_COLS}`,
      params
    )
    if (result.rowCount === 0) return c.json({ error: 'Revisión no encontrada' }, 404)
    return c.json({ revision: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// PUT /api/finanzas/revision/:id/saldo — upsert del saldo de UNA cuenta para la semana de esa revisión
finanzasRoutes.put('/revision/:id/saldo', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { cuenta_id, saldo } = body as Record<string, unknown>

  if (typeof cuenta_id !== 'number' || !Number.isInteger(cuenta_id)) {
    return c.json({ error: 'cuenta_id es obligatorio y debe ser un entero' }, 400)
  }
  const saldoNum = parseNumeric(saldo)
  if (saldoNum === null) return c.json({ error: 'saldo debe ser numérico' }, 400)

  try {
    const revisionResult = await finanzasDb.query(`SELECT ${REVISION_COLS} FROM revisiones_semanales WHERE id = $1`, [id])
    if (revisionResult.rowCount === 0) return c.json({ error: 'Revisión no encontrada' }, 404)
    const semana = revisionResult.rows[0].fecha as string

    const cuentaExists = await finanzasDb.query('SELECT 1 FROM cuentas_financieras WHERE id = $1', [cuenta_id])
    if (cuentaExists.rowCount === 0) return c.json({ error: 'cuenta_id no existe' }, 400)

    const result = await finanzasDb.query(
      `INSERT INTO saldos_semanales (cuenta_id, semana, saldo, revision_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cuenta_id, semana)
       DO UPDATE SET saldo = EXCLUDED.saldo, revision_id = EXCLUDED.revision_id, updated_at = now()
       RETURNING id, cuenta_id, TO_CHAR(semana, 'YYYY-MM-DD') AS semana, saldo, moneda, revision_id, created_at, updated_at`,
      [cuenta_id, semana, saldoNum, id]
    )
    return c.json({ saldo: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'upsert error' }, 500)
  }
})

// ─── movimientos_previstos — previsiones globales (Pieza B) ──────────────

const PREVISION_COLS = `id, ambito_id, cuenta_id, tipo, estado, concepto, importe, moneda,
  TO_CHAR(fecha_estimada, 'YYYY-MM-DD') AS fecha_estimada, notas, created_at, updated_at`

// GET /api/finanzas/previsiones?ambito_id=&estado=
finanzasRoutes.get('/previsiones', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const ambitoId = c.req.query('ambito_id')
  const estado = c.req.query('estado')

  const conditions: string[] = []
  const params: unknown[] = []
  if (ambitoId !== undefined) {
    if (!/^\d+$/.test(ambitoId)) return c.json({ error: 'ambito_id inválido' }, 400)
    params.push(Number(ambitoId))
    conditions.push(`m.ambito_id = $${params.length}`)
  }
  if (estado !== undefined) {
    if (!isEstadoPrevision(estado)) return c.json({ error: `estado debe ser uno de: ${ESTADOS_PREVISION.join(', ')}` }, 400)
    params.push(estado)
    conditions.push(`m.estado = $${params.length}`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const result = await finanzasDb.query(
      `SELECT m.id, m.ambito_id, m.cuenta_id, m.tipo, m.estado, m.concepto, m.importe, m.moneda,
              TO_CHAR(m.fecha_estimada, 'YYYY-MM-DD') AS fecha_estimada, m.notas, m.created_at, m.updated_at,
              c.nombre AS cuenta_nombre
       FROM movimientos_previstos m
       LEFT JOIN cuentas_financieras c ON c.id = m.cuenta_id
       ${where}
       ORDER BY m.fecha_estimada, m.id`,
      params
    )
    return c.json({ previsiones: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/previsiones
finanzasRoutes.post('/previsiones', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { ambito_id, cuenta_id, tipo, concepto, importe, fecha_estimada, notas } = body as Record<string, unknown>

  if (typeof ambito_id !== 'number' || !Number.isInteger(ambito_id)) return c.json({ error: 'ambito_id es obligatorio' }, 400)
  if (cuenta_id !== undefined && cuenta_id !== null && (typeof cuenta_id !== 'number' || !Number.isInteger(cuenta_id))) {
    return c.json({ error: 'cuenta_id debe ser un entero o null' }, 400)
  }
  if (!isTipoMovimiento(tipo)) return c.json({ error: `tipo debe ser uno de: ${TIPOS_MOVIMIENTO.join(', ')}` }, 400)
  if (typeof concepto !== 'string' || concepto.trim() === '') return c.json({ error: 'concepto es obligatorio' }, 400)
  const importeNum = parseNumeric(importe)
  if (importeNum === null) return c.json({ error: 'importe debe ser numérico' }, 400)
  if (typeof fecha_estimada !== 'string' || !ISO_DATE_RE.test(fecha_estimada)) {
    return c.json({ error: 'fecha_estimada debe tener formato YYYY-MM-DD' }, 400)
  }

  try {
    const ambitoExists = await finanzasDb.query('SELECT 1 FROM ambitos WHERE id = $1', [ambito_id])
    if (ambitoExists.rowCount === 0) return c.json({ error: 'ambito_id no existe' }, 400)
    if (cuenta_id) {
      const cuentaExists = await finanzasDb.query('SELECT 1 FROM cuentas_financieras WHERE id = $1', [cuenta_id])
      if (cuentaExists.rowCount === 0) return c.json({ error: 'cuenta_id no existe' }, 400)
    }

    const result = await finanzasDb.query(
      `INSERT INTO movimientos_previstos (ambito_id, cuenta_id, tipo, concepto, importe, fecha_estimada, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PREVISION_COLS}`,
      [ambito_id, cuenta_id ?? null, tipo, concepto.trim(), importeNum, fecha_estimada, notas ?? null]
    )
    return c.json({ prevision: result.rows[0] }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/previsiones/:id — incluye cambiar estado (realizado/cancelado)
finanzasRoutes.patch('/previsiones/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { cuenta_id, tipo, concepto, importe, fecha_estimada, notas, estado } = body as Record<string, unknown>

  const sets: string[] = []
  const params: unknown[] = []

  if (cuenta_id !== undefined) {
    if (cuenta_id !== null && (typeof cuenta_id !== 'number' || !Number.isInteger(cuenta_id))) {
      return c.json({ error: 'cuenta_id debe ser un entero o null' }, 400)
    }
    params.push(cuenta_id)
    sets.push(`cuenta_id = $${params.length}`)
  }
  if (tipo !== undefined) {
    if (!isTipoMovimiento(tipo)) return c.json({ error: `tipo debe ser uno de: ${TIPOS_MOVIMIENTO.join(', ')}` }, 400)
    params.push(tipo)
    sets.push(`tipo = $${params.length}`)
  }
  if (concepto !== undefined) {
    if (typeof concepto !== 'string' || concepto.trim() === '') return c.json({ error: 'concepto no puede estar vacío' }, 400)
    params.push(concepto.trim())
    sets.push(`concepto = $${params.length}`)
  }
  if (importe !== undefined) {
    const importeNum = parseNumeric(importe)
    if (importeNum === null) return c.json({ error: 'importe debe ser numérico' }, 400)
    params.push(importeNum)
    sets.push(`importe = $${params.length}`)
  }
  if (fecha_estimada !== undefined) {
    if (typeof fecha_estimada !== 'string' || !ISO_DATE_RE.test(fecha_estimada)) {
      return c.json({ error: 'fecha_estimada debe tener formato YYYY-MM-DD' }, 400)
    }
    params.push(fecha_estimada)
    sets.push(`fecha_estimada = $${params.length}`)
  }
  if (notas !== undefined) {
    if (notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)
    params.push(notas)
    sets.push(`notas = $${params.length}`)
  }
  if (estado !== undefined) {
    if (!isEstadoPrevision(estado)) return c.json({ error: `estado debe ser uno de: ${ESTADOS_PREVISION.join(', ')}` }, 400)
    params.push(estado)
    sets.push(`estado = $${params.length}`)
  }

  if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)
  sets.push('updated_at = now()')
  params.push(id)

  try {
    const result = await finanzasDb.query(
      `UPDATE movimientos_previstos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${PREVISION_COLS}`,
      params
    )
    if (result.rowCount === 0) return c.json({ error: 'Previsión no encontrada' }, 404)
    return c.json({ prevision: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// ─── reservas — globales, derivadas de la cuenta (Pieza B) ───────────────

const RESERVA_COLS = `id, cuenta_id, concepto, estado, importe, moneda, notas, created_at, updated_at`

// GET /api/finanzas/reservas?cuenta_id=&ambito_id=&estado=
finanzasRoutes.get('/reservas', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const cuentaId = c.req.query('cuenta_id')
  const ambitoId = c.req.query('ambito_id')
  const estado = c.req.query('estado')

  const conditions: string[] = []
  const params: unknown[] = []
  if (cuentaId !== undefined) {
    if (!/^\d+$/.test(cuentaId)) return c.json({ error: 'cuenta_id inválido' }, 400)
    params.push(Number(cuentaId))
    conditions.push(`r.cuenta_id = $${params.length}`)
  }
  if (ambitoId !== undefined) {
    if (!/^\d+$/.test(ambitoId)) return c.json({ error: 'ambito_id inválido' }, 400)
    params.push(Number(ambitoId))
    conditions.push(`c.ambito_id = $${params.length}`)
  }
  if (estado !== undefined) {
    if (!isEstadoReserva(estado)) return c.json({ error: `estado debe ser uno de: ${ESTADOS_RESERVA.join(', ')}` }, 400)
    params.push(estado)
    conditions.push(`r.estado = $${params.length}`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const result = await finanzasDb.query(
      `SELECT r.id, r.cuenta_id, r.concepto, r.estado, r.importe, r.moneda, r.notas, r.created_at, r.updated_at,
              c.nombre AS cuenta_nombre, c.ambito_id
       FROM reservas r
       JOIN cuentas_financieras c ON c.id = r.cuenta_id
       ${where}
       ORDER BY r.id DESC`,
      params
    )
    return c.json({ reservas: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/reservas
finanzasRoutes.post('/reservas', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { cuenta_id, concepto, importe, notas } = body as Record<string, unknown>

  if (typeof cuenta_id !== 'number' || !Number.isInteger(cuenta_id)) return c.json({ error: 'cuenta_id es obligatorio' }, 400)
  if (typeof concepto !== 'string' || concepto.trim() === '') return c.json({ error: 'concepto es obligatorio' }, 400)
  const importeNum = parseNumeric(importe)
  if (importeNum === null) return c.json({ error: 'importe debe ser numérico' }, 400)

  try {
    const cuentaExists = await finanzasDb.query('SELECT 1 FROM cuentas_financieras WHERE id = $1', [cuenta_id])
    if (cuentaExists.rowCount === 0) return c.json({ error: 'cuenta_id no existe' }, 400)

    const result = await finanzasDb.query(
      `INSERT INTO reservas (cuenta_id, concepto, importe, notas) VALUES ($1, $2, $3, $4) RETURNING ${RESERVA_COLS}`,
      [cuenta_id, concepto.trim(), importeNum, notas ?? null]
    )
    return c.json({ reserva: result.rows[0] }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/reservas/:id — incluye cambiar estado (liberada/usada/cancelada)
finanzasRoutes.patch('/reservas/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { cuenta_id, concepto, importe, notas, estado } = body as Record<string, unknown>

  const sets: string[] = []
  const params: unknown[] = []

  if (cuenta_id !== undefined) {
    if (typeof cuenta_id !== 'number' || !Number.isInteger(cuenta_id)) return c.json({ error: 'cuenta_id debe ser un entero' }, 400)
    params.push(cuenta_id)
    sets.push(`cuenta_id = $${params.length}`)
  }
  if (concepto !== undefined) {
    if (typeof concepto !== 'string' || concepto.trim() === '') return c.json({ error: 'concepto no puede estar vacío' }, 400)
    params.push(concepto.trim())
    sets.push(`concepto = $${params.length}`)
  }
  if (importe !== undefined) {
    const importeNum = parseNumeric(importe)
    if (importeNum === null) return c.json({ error: 'importe debe ser numérico' }, 400)
    params.push(importeNum)
    sets.push(`importe = $${params.length}`)
  }
  if (notas !== undefined) {
    if (notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)
    params.push(notas)
    sets.push(`notas = $${params.length}`)
  }
  if (estado !== undefined) {
    if (!isEstadoReserva(estado)) return c.json({ error: `estado debe ser uno de: ${ESTADOS_RESERVA.join(', ')}` }, 400)
    params.push(estado)
    sets.push(`estado = $${params.length}`)
  }

  if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)
  sets.push('updated_at = now()')
  params.push(id)

  try {
    const result = await finanzasDb.query(
      `UPDATE reservas SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${RESERVA_COLS}`,
      params
    )
    if (result.rowCount === 0) return c.json({ error: 'Reserva no encontrada' }, 404)
    return c.json({ reserva: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// ─── deudas — globales (Pieza B) ─────────────────────────────────────────

const DEUDA_COLS = `id, ambito_id, contraparte, direccion, estado, importe, moneda,
  TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento, notas, created_at, updated_at`

// GET /api/finanzas/deudas?ambito_id=&estado=&direccion=
finanzasRoutes.get('/deudas', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const ambitoId = c.req.query('ambito_id')
  const estado = c.req.query('estado')
  const direccion = c.req.query('direccion')

  const conditions: string[] = []
  const params: unknown[] = []
  if (ambitoId !== undefined) {
    if (!/^\d+$/.test(ambitoId)) return c.json({ error: 'ambito_id inválido' }, 400)
    params.push(Number(ambitoId))
    conditions.push(`ambito_id = $${params.length}`)
  }
  if (estado !== undefined) {
    if (!isEstadoDeuda(estado)) return c.json({ error: `estado debe ser uno de: ${ESTADOS_DEUDA.join(', ')}` }, 400)
    params.push(estado)
    conditions.push(`estado = $${params.length}`)
  }
  if (direccion !== undefined) {
    if (!isDireccionDeuda(direccion)) return c.json({ error: `direccion debe ser uno de: ${DIRECCIONES_DEUDA.join(', ')}` }, 400)
    params.push(direccion)
    conditions.push(`direccion = $${params.length}`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const result = await finanzasDb.query(
      `SELECT ${DEUDA_COLS} FROM deudas ${where} ORDER BY fecha_vencimiento NULLS LAST, id DESC`,
      params
    )
    return c.json({ deudas: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/deudas
finanzasRoutes.post('/deudas', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { ambito_id, contraparte, direccion, importe, fecha_vencimiento, notas } = body as Record<string, unknown>

  if (typeof ambito_id !== 'number' || !Number.isInteger(ambito_id)) return c.json({ error: 'ambito_id es obligatorio' }, 400)
  if (typeof contraparte !== 'string' || contraparte.trim() === '') return c.json({ error: 'contraparte es obligatoria' }, 400)
  if (!isDireccionDeuda(direccion)) return c.json({ error: `direccion debe ser uno de: ${DIRECCIONES_DEUDA.join(', ')}` }, 400)
  const importeNum = parseNumeric(importe)
  if (importeNum === null) return c.json({ error: 'importe debe ser numérico' }, 400)
  if (fecha_vencimiento !== undefined && fecha_vencimiento !== null) {
    if (typeof fecha_vencimiento !== 'string' || !ISO_DATE_RE.test(fecha_vencimiento)) {
      return c.json({ error: 'fecha_vencimiento debe tener formato YYYY-MM-DD' }, 400)
    }
  }

  try {
    const ambitoExists = await finanzasDb.query('SELECT 1 FROM ambitos WHERE id = $1', [ambito_id])
    if (ambitoExists.rowCount === 0) return c.json({ error: 'ambito_id no existe' }, 400)

    const result = await finanzasDb.query(
      `INSERT INTO deudas (ambito_id, contraparte, direccion, importe, fecha_vencimiento, notas)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${DEUDA_COLS}`,
      [ambito_id, contraparte.trim(), direccion, importeNum, fecha_vencimiento ?? null, notas ?? null]
    )
    return c.json({ deuda: result.rows[0] }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/deudas/:id — incluye cambiar estado (pagada/cobrada/cancelada)
finanzasRoutes.patch('/deudas/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { contraparte, direccion, importe, fecha_vencimiento, notas, estado } = body as Record<string, unknown>

  const sets: string[] = []
  const params: unknown[] = []

  if (contraparte !== undefined) {
    if (typeof contraparte !== 'string' || contraparte.trim() === '') return c.json({ error: 'contraparte no puede estar vacía' }, 400)
    params.push(contraparte.trim())
    sets.push(`contraparte = $${params.length}`)
  }
  if (direccion !== undefined) {
    if (!isDireccionDeuda(direccion)) return c.json({ error: `direccion debe ser uno de: ${DIRECCIONES_DEUDA.join(', ')}` }, 400)
    params.push(direccion)
    sets.push(`direccion = $${params.length}`)
  }
  if (importe !== undefined) {
    const importeNum = parseNumeric(importe)
    if (importeNum === null) return c.json({ error: 'importe debe ser numérico' }, 400)
    params.push(importeNum)
    sets.push(`importe = $${params.length}`)
  }
  if (fecha_vencimiento !== undefined) {
    if (fecha_vencimiento !== null && (typeof fecha_vencimiento !== 'string' || !ISO_DATE_RE.test(fecha_vencimiento))) {
      return c.json({ error: 'fecha_vencimiento debe tener formato YYYY-MM-DD' }, 400)
    }
    params.push(fecha_vencimiento)
    sets.push(`fecha_vencimiento = $${params.length}`)
  }
  if (notas !== undefined) {
    if (notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)
    params.push(notas)
    sets.push(`notas = $${params.length}`)
  }
  if (estado !== undefined) {
    if (!isEstadoDeuda(estado)) return c.json({ error: `estado debe ser uno de: ${ESTADOS_DEUDA.join(', ')}` }, 400)
    params.push(estado)
    sets.push(`estado = $${params.length}`)
  }

  if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)
  sets.push('updated_at = now()')
  params.push(id)

  try {
    const result = await finanzasDb.query(
      `UPDATE deudas SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${DEUDA_COLS}`,
      params
    )
    if (result.rowCount === 0) return c.json({ error: 'Deuda no encontrada' }, 404)
    return c.json({ deuda: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// ─── dashboard semanal (#713) ────────────────────────────────────────────

// Umbral provisional de margen de seguridad (30 días) por ámbito. Todavía
// NO hay configuración por UI (tarea futura, sin tabla nueva en #713) —
// este es el ÚNICO sitio del código donde se define. Para cambiarlo, edita
// este objeto. IDs de ambitos.id — ver 002_seed_ambitos.sql.
const COLCHON_MINIMO_PROVISIONAL: Record<number, number> = {
  1: 3000, // IMM CORE SYSTEM SL
  2: 1000, // Ignacio Mínguez Montes
  3: 500   // Familia / Hogar
}
const COLCHON_MINIMO_DEFAULT = 500
function colchonMinimo(ambitoId: number): number {
  return COLCHON_MINIMO_PROVISIONAL[ambitoId] ?? COLCHON_MINIMO_DEFAULT
}

function semaforoDe(margenSeguridad: number, colchon: number): 'rojo' | 'ambar' | 'verde' {
  if (margenSeguridad < 0) return 'rojo'
  if (margenSeguridad < colchon) return 'ambar'
  return 'verde'
}

// GET /api/finanzas/dashboard?semana=YYYY-MM-DD — foto semanal por ámbito.
// `semana` (normalizada al lunes) solo se usa para "pendientes de revisar"
// (qué cuenta no tiene saldo registrado ESA semana). Las ventanas de
// 30/7 días de pagos y cobros previstos se calculan desde HOY real,
// independientemente de qué semana esté mirando el usuario.
finanzasRoutes.get('/dashboard', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const raw = c.req.query('semana')
  const semana = raw !== undefined ? normalizeToMonday(raw) : todayMonday()
  if (!semana) return c.json({ error: 'semana inválida (formato YYYY-MM-DD)' }, 400)

  const hoy = new Date().toISOString().slice(0, 10)
  const hoyMas7 = addDays(hoy, 7)
  const hoyMas30 = addDays(hoy, 30)

  try {
    const [ambitosResult, cuentasResult, reservasResult, previstosResult, deudasResult, pendientesResult] = await Promise.all([
      finanzasDb.query('SELECT id, nombre, tipo, orden, color FROM ambitos ORDER BY orden'),
      // Arrastre: saldo_total es "a fecha de la semana pedida", no siempre
      // "el más reciente que exista". v_cuentas_saldo_actual (Pieza A, sin
      // tocar) siempre da el último de todos los tiempos — coincide con
      // esto solo cuando `semana` es la semana en curso. Aquí se ancla
      // explícitamente a `semana` con la misma regla de arrastre que
      // /revision/comparar: último snapshot <= semana, nunca 0 por falta
      // de snapshot exacto.
      finanzasDb.query(
        `SELECT c.id, c.ambito_id, c.nombre, c.tipo, c.entidad, c.moneda, s.saldo AS saldo_actual
         FROM cuentas_financieras c
         LEFT JOIN LATERAL (
           SELECT saldo FROM saldos_semanales
           WHERE cuenta_id = c.id AND semana <= $1
           ORDER BY semana DESC LIMIT 1
         ) s ON true
         WHERE c.activa = true
         ORDER BY c.nombre`,
        [semana]
      ),
      finanzasDb.query(
        `SELECT c.ambito_id, COALESCE(SUM(r.importe), 0) AS total
         FROM reservas r
         JOIN cuentas_financieras c ON c.id = r.cuenta_id
         WHERE r.estado = 'activa' AND c.activa = true
         GROUP BY c.ambito_id`
      ),
      finanzasDb.query(
        `SELECT m.id, m.ambito_id, m.tipo, m.concepto, m.importe,
                TO_CHAR(m.fecha_estimada, 'YYYY-MM-DD') AS fecha_estimada,
                c.nombre AS cuenta_nombre
         FROM movimientos_previstos m
         LEFT JOIN cuentas_financieras c ON c.id = m.cuenta_id
         WHERE m.estado = 'previsto' AND m.fecha_estimada BETWEEN $1 AND $2
         ORDER BY m.fecha_estimada, m.id`,
        [hoy, hoyMas30]
      ),
      finanzasDb.query(
        `SELECT ambito_id, direccion, COUNT(*) AS n, COALESCE(SUM(importe), 0) AS total
         FROM deudas
         WHERE estado = 'pendiente'
         GROUP BY ambito_id, direccion`
      ),
      finanzasDb.query(
        `SELECT c.id AS cuenta_id, c.nombre, c.ambito_id
         FROM cuentas_financieras c
         LEFT JOIN saldos_semanales s ON s.cuenta_id = c.id AND s.semana = $1
         WHERE c.activa = true AND s.id IS NULL
         ORDER BY c.ambito_id, c.nombre`,
        [semana]
      )
    ])

    interface VencItem {
      id: number
      tipo: 'ingreso' | 'gasto'
      concepto: string
      importe: number
      fecha_estimada: string
      cuenta_nombre: string | null
    }

    const ambitos = ambitosResult.rows.map((amb) => {
      const cuentasAmbito = cuentasResult.rows.filter((cta) => cta.ambito_id === amb.id)
      const saldo_total = cuentasAmbito.reduce((sum, cta) => sum + (cta.saldo_actual !== null ? Number(cta.saldo_actual) : 0), 0)

      const reservaRow = reservasResult.rows.find((r) => r.ambito_id === amb.id)
      const reservas_activas = reservaRow ? Number(reservaRow.total) : 0

      const disponible_tras_reservas = saldo_total - reservas_activas

      const previstosAmbito = previstosResult.rows.filter((m) => m.ambito_id === amb.id)
      const pagos30 = previstosAmbito.filter((m) => m.tipo === 'gasto')
      const cobros30 = previstosAmbito.filter((m) => m.tipo === 'ingreso')
      const pagos_proximos_30d = pagos30.reduce((sum, m) => sum + Number(m.importe), 0)
      const cobros_esperados_30d = cobros30.reduce((sum, m) => sum + Number(m.importe), 0)

      const margen_seguridad = disponible_tras_reservas - pagos_proximos_30d
      const escenario_esperado = disponible_tras_reservas + cobros_esperados_30d - pagos_proximos_30d

      const colchon_minimo = colchonMinimo(amb.id)
      const semaforo = semaforoDe(margen_seguridad, colchon_minimo)

      const toVencItem = (m: (typeof previstosAmbito)[number]): VencItem => ({
        id: m.id,
        tipo: m.tipo,
        concepto: m.concepto,
        importe: Number(m.importe),
        fecha_estimada: m.fecha_estimada,
        cuenta_nombre: m.cuenta_nombre
      })
      const pagos7 = pagos30.filter((m) => m.fecha_estimada <= hoyMas7).map(toVencItem)
      const cobros7 = cobros30.filter((m) => m.fecha_estimada <= hoyMas7).map(toVencItem)
      const total_pagos_7d = pagos7.reduce((sum, m) => sum + m.importe, 0)
      const total_cobros_7d = cobros7.reduce((sum, m) => sum + m.importe, 0)

      const deudaDebo = deudasResult.rows.find((d) => d.ambito_id === amb.id && d.direccion === 'debo')
      const deudaMeDeben = deudasResult.rows.find((d) => d.ambito_id === amb.id && d.direccion === 'me_deben')

      return {
        id: amb.id,
        nombre: amb.nombre,
        color: amb.color,
        orden: amb.orden,
        cuentas: cuentasAmbito.map((cta) => ({
          id: cta.id,
          nombre: cta.nombre,
          tipo: cta.tipo,
          entidad: cta.entidad,
          saldo_actual: cta.saldo_actual
        })),
        saldo_total,
        reservas_activas,
        disponible_tras_reservas,
        pagos_proximos_30d,
        cobros_esperados_30d,
        margen_seguridad,
        escenario_esperado,
        colchon_minimo,
        colchon_provisional: true,
        semaforo,
        vencimientos_7d: {
          pagos: pagos7,
          cobros: cobros7,
          total_pagos_7d,
          total_cobros_7d
        },
        riesgo_7_dias: total_pagos_7d > 0,
        deudas: {
          debo: { total: deudaDebo ? Number(deudaDebo.total) : 0, n: deudaDebo ? Number(deudaDebo.n) : 0 },
          me_deben: { total: deudaMeDeben ? Number(deudaMeDeben.total) : 0, n: deudaMeDeben ? Number(deudaMeDeben.n) : 0 }
        }
      }
    })

    // Vencimientos de la semana, cruzando ámbitos pero etiquetados —
    // nunca sumados entre sí.
    const vencimientos_semana = ambitos.flatMap((amb) => [
      ...amb.vencimientos_7d.pagos.map((v) => ({ ...v, ambito_id: amb.id, ambito_nombre: amb.nombre, ambito_color: amb.color })),
      ...amb.vencimientos_7d.cobros.map((v) => ({ ...v, ambito_id: amb.id, ambito_nombre: amb.nombre, ambito_color: amb.color }))
    ])

    const pendientes_de_revisar = pendientesResult.rows.map((row) => {
      const amb = ambitosResult.rows.find((a) => a.id === row.ambito_id)
      return {
        cuenta_id: row.cuenta_id,
        nombre: row.nombre,
        ambito_id: row.ambito_id,
        ambito_nombre: amb?.nombre ?? '',
        ambito_color: amb?.color ?? '#C8A840'
      }
    })

    return c.json({ semana, hoy, ambitos, vencimientos_semana, pendientes_de_revisar })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})
