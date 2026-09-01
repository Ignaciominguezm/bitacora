import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { finanzasDb, immReadonlyDb } from '../db/index.js'

export const finanzasRoutes = new Hono()

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

const TIPOS_CATEGORIA = ['gasto', 'ingreso', 'ambos'] as const
const isTipoCategoria = (v: unknown): v is (typeof TIPOS_CATEGORIA)[number] =>
  typeof v === 'string' && (TIPOS_CATEGORIA as readonly string[]).includes(v)

const TIPOS_TERCERO = ['cliente', 'proveedor', 'ambos', 'otro'] as const
const isTipoTercero = (v: unknown): v is (typeof TIPOS_TERCERO)[number] =>
  typeof v === 'string' && (TIPOS_TERCERO as readonly string[]).includes(v)

// movimientos_reales.tipo tiene 5 valores en BD, pero este bloque (#743
// pieza 2, bloque A) SOLO crea/edita ingreso|gasto|ajuste — los traspasos
// son el bloque B, otra tarea. isTipoMovimientoReal (todos) se usa para
// detectar y rechazar traspaso_* con mensaje claro, no para permitirlos.
const TIPOS_MOVIMIENTO_REAL_CREABLE = ['ingreso', 'gasto', 'ajuste'] as const
const isTipoMovimientoRealCreable = (v: unknown): v is (typeof TIPOS_MOVIMIENTO_REAL_CREABLE)[number] =>
  typeof v === 'string' && (TIPOS_MOVIMIENTO_REAL_CREABLE as readonly string[]).includes(v)

const TIPOS_MOVIMIENTO_REAL_TODOS = ['ingreso', 'gasto', 'traspaso_salida', 'traspaso_entrada', 'ajuste'] as const
const isTipoMovimientoRealTodos = (v: unknown): v is (typeof TIPOS_MOVIMIENTO_REAL_TODOS)[number] =>
  typeof v === 'string' && (TIPOS_MOVIMIENTO_REAL_TODOS as readonly string[]).includes(v)
const isTraspaso = (tipo: string): boolean => tipo === 'traspaso_salida' || tipo === 'traspaso_entrada'

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

const PERIODICIDADES_OBLIGACION = ['mensual', 'trimestral', 'anual', 'puntual'] as const
const isPeriodicidadObligacion = (v: unknown): v is (typeof PERIODICIDADES_OBLIGACION)[number] =>
  typeof v === 'string' && (PERIODICIDADES_OBLIGACION as readonly string[]).includes(v)

const TIPOS_IMPORTE_OBLIGACION = ['fijo', 'variable'] as const
const isTipoImporteObligacion = (v: unknown): v is (typeof TIPOS_IMPORTE_OBLIGACION)[number] =>
  typeof v === 'string' && (TIPOS_IMPORTE_OBLIGACION as readonly string[]).includes(v)

const ESTADOS_INSTANCIA_OBLIGACION = ['pendiente', 'cubierta', 'cancelada'] as const
const isEstadoInstanciaObligacion = (v: unknown): v is (typeof ESTADOS_INSTANCIA_OBLIGACION)[number] =>
  typeof v === 'string' && (ESTADOS_INSTANCIA_OBLIGACION as readonly string[]).includes(v)

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

function addMonths(year: number, month0: number, months: number): { year: number; month0: number } {
  const total = month0 + months
  return { year: year + Math.floor(total / 12), month0: ((total % 12) + 12) % 12 }
}

// fecha_vencimiento = fin del periodo + meses_desfase meses, en el día
// dia_vencimiento (o el último día del mes si no hay día fijado o si el
// día fijado no existe en ese mes — p.ej. día 31 en febrero).
function computeFechaVencimiento(periodEndYear: number, periodEndMonth0: number, mesesDesfase: number, diaVencimiento: number | null): string {
  const { year, month0 } = addMonths(periodEndYear, periodEndMonth0, mesesDesfase)
  const lastDay = lastDayOfMonth(year, month0)
  const day = diaVencimiento !== null ? Math.min(diaVencimiento, lastDay) : lastDay
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`
}

interface InstanciaGenerada {
  periodo: string
  fecha_vencimiento: string
}

// Genera las instancias del AÑO EN CURSO para una plantilla recién creada
// (mensual/trimestral/anual). 'puntual' no genera nada aquí — sus
// instancias se crean a mano vía POST /obligaciones/instancias.
function generarInstanciasAnio(periodicidad: string, anio: number, mesesDesfase: number, diaVencimiento: number | null): InstanciaGenerada[] {
  if (periodicidad === 'mensual') {
    return Array.from({ length: 12 }, (_, m) => ({
      periodo: `${anio}-${pad2(m + 1)}-01`,
      fecha_vencimiento: computeFechaVencimiento(anio, m, mesesDesfase, diaVencimiento)
    }))
  }
  if (periodicidad === 'trimestral') {
    return [0, 3, 6, 9].map((m) => ({
      periodo: `${anio}-${pad2(m + 1)}-01`,
      fecha_vencimiento: computeFechaVencimiento(anio, m + 2, mesesDesfase, diaVencimiento)
    }))
  }
  if (periodicidad === 'anual') {
    return [{ periodo: `${anio}-01-01`, fecha_vencimiento: computeFechaVencimiento(anio, 11, mesesDesfase, diaVencimiento) }]
  }
  return []
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
      // saldo_total ya NO sale del snapshot manual de saldos_semanales
      // (v_cuentas_saldo_actual, #712) — ese método quedó obsoleto en
      // cuanto el flujo de caja real (apertura + movimientos, #743 pieza
      // 2A) empezó a alimentarse. Ahora se lee v_cuentas_saldo_calculado,
      // que da saldo_calculado = apertura + Σ movimientos del año (NULL
      // si la cuenta no tiene apertura registrada este año). Esto ya no
      // depende de `semana` — es el saldo real vigente, no una foto
      // semanal — así que la query no filtra por `semana` aquí.
      finanzasDb.query(
        `SELECT c.id, c.ambito_id, c.nombre, c.tipo, c.entidad, c.moneda,
                v.saldo_calculado, v.requiere_saldo_apertura
         FROM cuentas_financieras c
         JOIN v_cuentas_saldo_calculado v ON v.cuenta_id = c.id
         WHERE c.activa = true
         ORDER BY c.nombre`
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

      // saldo_calculado es NULL cuando la cuenta no tiene saldo de apertura
      // del año — nunca se convierte en 0 al sumar (daría un saldo de
      // ámbito falso). Se suman solo las cuentas con dato y se avisa de
      // las que faltan, en vez de esconder el problema tras un número
      // aparentemente completo.
      const cuentasSinApertura = cuentasAmbito.filter((cta) => cta.saldo_calculado === null)
      const saldo_total = cuentasAmbito.reduce(
        (sum, cta) => sum + (cta.saldo_calculado !== null ? Number(cta.saldo_calculado) : 0),
        0
      )
      const saldo_incompleto = cuentasSinApertura.length > 0

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
          saldo_calculado: cta.saldo_calculado,
          requiere_saldo_apertura: cta.requiere_saldo_apertura
        })),
        saldo_total,
        saldo_incompleto,
        cuentas_sin_apertura: cuentasSinApertura.map((cta) => ({ id: cta.id, nombre: cta.nombre })),
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

// ─── categorías — jerárquicas, esquema ya en producción (#743) ──────────

interface CategoriaRow {
  id: number
  parent_id: number | null
  nombre: string
  tipo: string
  orden: number
  activa: boolean
}
interface CategoriaNode extends CategoriaRow {
  children: CategoriaNode[]
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}

// GET /api/finanzas/categorias?tipo=gasto|ingreso|ambos — árbol por parent_id.
// tipo=gasto también incluye 'ambos' (aplica a los dos flujos); igual para
// ingreso. El árbol se construye SOLO con las filas que pasan el filtro —
// si algún día un padre 'ambos' tuviera hijas de un único tipo, una hija
// cuyo padre queda fuera del filtro aparecería como raíz; no ocurre con los
// datos sembrados (cada árbol es homogéneamente gasto o ingreso).
finanzasRoutes.get('/categorias', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const tipo = c.req.query('tipo')
  if (tipo !== undefined && !isTipoCategoria(tipo)) {
    return c.json({ error: `tipo debe ser uno de: ${TIPOS_CATEGORIA.join(', ')}` }, 400)
  }

  const params: unknown[] = []
  let where = ''
  if (tipo === 'gasto' || tipo === 'ingreso') {
    params.push(tipo, 'ambos')
    where = `WHERE tipo IN ($1, $2)`
  } else if (tipo === 'ambos') {
    params.push('ambos')
    where = `WHERE tipo = $1`
  }

  try {
    const result = await finanzasDb.query<CategoriaRow>(
      `SELECT id, parent_id, nombre, tipo, orden, activa
       FROM categorias
       ${where}
       ORDER BY orden, nombre`,
      params
    )

    const byId = new Map<number, CategoriaNode>()
    for (const row of result.rows) byId.set(row.id, { ...row, children: [] })
    const roots: CategoriaNode[] = []
    for (const node of byId.values()) {
      const parent = node.parent_id !== null ? byId.get(node.parent_id) : undefined
      if (parent) parent.children.push(node)
      else roots.push(node)
    }

    return c.json({ categorias: roots })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/categorias
finanzasRoutes.post('/categorias', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { nombre, tipo, parent_id } = body as Record<string, unknown>

  if (typeof nombre !== 'string' || nombre.trim() === '') return c.json({ error: 'nombre es obligatorio' }, 400)
  if (!isTipoCategoria(tipo)) return c.json({ error: `tipo debe ser uno de: ${TIPOS_CATEGORIA.join(', ')}` }, 400)
  if (parent_id !== undefined && parent_id !== null && (typeof parent_id !== 'number' || !Number.isInteger(parent_id))) {
    return c.json({ error: 'parent_id debe ser un entero o null' }, 400)
  }
  const parentId = (parent_id ?? null) as number | null

  try {
    if (parentId !== null) {
      const parentResult = await finanzasDb.query('SELECT tipo FROM categorias WHERE id = $1', [parentId])
      if (parentResult.rowCount === 0) return c.json({ error: 'parent_id no existe' }, 400)
      const parentTipo = parentResult.rows[0].tipo as string
      if (parentTipo !== 'ambos' && parentTipo !== tipo) {
        return c.json(
          { error: `El grupo padre es de tipo '${parentTipo}' — la subcategoría debe ser del mismo tipo (o el padre debe ser 'ambos')` },
          400
        )
      }
    }

    const ordenResult = await finanzasDb.query(
      `SELECT COALESCE(MAX(orden), -1) + 1 AS siguiente FROM categorias WHERE COALESCE(parent_id, 0) = COALESCE($1::int, 0)`,
      [parentId]
    )
    const orden = ordenResult.rows[0].siguiente

    const result = await finanzasDb.query<CategoriaRow>(
      `INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden, activa)
       VALUES ($1, $2, $3, NULL, $4, true)
       RETURNING id, parent_id, nombre, tipo, orden, activa`,
      [parentId, nombre.trim(), tipo, orden]
    )
    return c.json({ categoria: { ...result.rows[0], children: [] } }, 201)
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: 'Ya existe una categoría hermana con ese nombre en ese grupo' }, 409)
    }
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/categorias/:id — nombre, orden, parent_id (mover), activa.
// tipo y codigo NO son editables (fijos por diseño).
finanzasRoutes.patch('/categorias/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)
  const idNum = Number(id)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { nombre, orden, parent_id, activa } = body as Record<string, unknown>

  const sets: string[] = []
  const params: unknown[] = []

  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || nombre.trim() === '') return c.json({ error: 'nombre no puede estar vacío' }, 400)
    params.push(nombre.trim())
    sets.push(`nombre = $${params.length}`)
  }
  if (orden !== undefined) {
    if (typeof orden !== 'number' || !Number.isInteger(orden)) return c.json({ error: 'orden debe ser un entero' }, 400)
    params.push(orden)
    sets.push(`orden = $${params.length}`)
  }
  if (activa !== undefined) {
    if (typeof activa !== 'boolean') return c.json({ error: 'activa debe ser booleano' }, 400)
    params.push(activa)
    sets.push(`activa = $${params.length}`)
  }

  if (parent_id !== undefined) {
    if (parent_id !== null && (typeof parent_id !== 'number' || !Number.isInteger(parent_id))) {
      return c.json({ error: 'parent_id debe ser un entero o null' }, 400)
    }
    if (parent_id === idNum) return c.json({ error: 'Una categoría no puede ser su propio padre' }, 400)

    if (parent_id !== null) {
      // Recorre la cadena de ancestros desde el nuevo padre propuesto — si
      // llegamos a idNum, mover aquí crearía un ciclo.
      try {
        let cursor: number | null = parent_id
        const visited = new Set<number>()
        while (cursor !== null) {
          if (cursor === idNum) {
            return c.json({ error: 'Ese movimiento crearía un ciclo: la categoría no puede ser su propio ancestro' }, 400)
          }
          if (visited.has(cursor)) break
          visited.add(cursor)
          const r = await finanzasDb.query('SELECT parent_id FROM categorias WHERE id = $1', [cursor])
          if (r.rowCount === 0) return c.json({ error: 'parent_id no existe' }, 400)
          cursor = r.rows[0].parent_id
        }
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'error validando jerarquía' }, 500)
      }
    }

    params.push(parent_id)
    sets.push(`parent_id = $${params.length}`)
  }

  if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)
  sets.push('updated_at = now()')
  params.push(id)

  try {
    const result = await finanzasDb.query<CategoriaRow>(
      `UPDATE categorias SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, parent_id, nombre, tipo, orden, activa`,
      params
    )
    if (result.rowCount === 0) return c.json({ error: 'Categoría no encontrada' }, 404)
    return c.json({ categoria: result.rows[0] })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: 'Ya existe una categoría hermana con ese nombre en ese grupo' }, 409)
    }
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// PATCH /api/finanzas/categorias/:id/archivar — soft-delete. Impide archivar
// un grupo con hijas activas (simple y seguro, sin cascada).
finanzasRoutes.patch('/categorias/:id/archivar', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  try {
    const hijas = await finanzasDb.query('SELECT COUNT(*) AS n FROM categorias WHERE parent_id = $1 AND activa = true', [id])
    if (Number(hijas.rows[0].n) > 0) {
      return c.json({ error: 'Esta categoría tiene subcategorías activas — archívalas primero' }, 409)
    }
    const result = await finanzasDb.query<CategoriaRow>(
      `UPDATE categorias SET activa = false, updated_at = now() WHERE id = $1 RETURNING id, parent_id, nombre, tipo, orden, activa`,
      [id]
    )
    if (result.rowCount === 0) return c.json({ error: 'Categoría no encontrada' }, 404)
    return c.json({ categoria: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// PATCH /api/finanzas/categorias/:id/activar
finanzasRoutes.patch('/categorias/:id/activar', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  try {
    const result = await finanzasDb.query<CategoriaRow>(
      `UPDATE categorias SET activa = true, updated_at = now() WHERE id = $1 RETURNING id, parent_id, nombre, tipo, orden, activa`,
      [id]
    )
    if (result.rowCount === 0) return c.json({ error: 'Categoría no encontrada' }, 404)
    return c.json({ categoria: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// ─── terceros — por ámbito, esquema ya en producción (#743) ─────────────

const TERCERO_COLS = `t.id, t.ambito_id, t.core_contact_id, t.nombre, t.tipo, t.nif, t.direccion_fiscal,
  t.activa, t.notas, t.created_at, t.updated_at`

// GET /api/finanzas/terceros?ambito_id=&tipo=&activa=
finanzasRoutes.get('/terceros', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const ambitoId = c.req.query('ambito_id')
  const tipo = c.req.query('tipo')
  const activaRaw = c.req.query('activa')

  const conditions: string[] = []
  const params: unknown[] = []
  if (ambitoId !== undefined) {
    if (!/^\d+$/.test(ambitoId)) return c.json({ error: 'ambito_id inválido' }, 400)
    params.push(Number(ambitoId))
    conditions.push(`t.ambito_id = $${params.length}`)
  }
  if (tipo !== undefined) {
    if (!isTipoTercero(tipo)) return c.json({ error: `tipo debe ser uno de: ${TIPOS_TERCERO.join(', ')}` }, 400)
    params.push(tipo)
    conditions.push(`t.tipo = $${params.length}`)
  }
  if (activaRaw !== undefined) {
    if (activaRaw !== 'true' && activaRaw !== 'false') return c.json({ error: 'activa debe ser true o false' }, 400)
    params.push(activaRaw === 'true')
    conditions.push(`t.activa = $${params.length}`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const result = await finanzasDb.query(
      `SELECT ${TERCERO_COLS}, a.nombre AS ambito_nombre, a.color AS ambito_color, a.orden AS ambito_orden
       FROM terceros t
       JOIN ambitos a ON a.id = t.ambito_id
       ${where}
       ORDER BY a.orden, t.nombre`,
      params
    )
    return c.json({ terceros: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/terceros
finanzasRoutes.post('/terceros', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { ambito_id, nombre, tipo, core_contact_id, nif, direccion_fiscal, notas } = body as Record<string, unknown>

  if (typeof ambito_id !== 'number' || !Number.isInteger(ambito_id)) return c.json({ error: 'ambito_id es obligatorio' }, 400)
  if (typeof nombre !== 'string' || nombre.trim() === '') return c.json({ error: 'nombre es obligatorio' }, 400)
  if (!isTipoTercero(tipo)) return c.json({ error: `tipo debe ser uno de: ${TIPOS_TERCERO.join(', ')}` }, 400)
  if (core_contact_id !== undefined && core_contact_id !== null && (typeof core_contact_id !== 'number' || !Number.isInteger(core_contact_id))) {
    return c.json({ error: 'core_contact_id debe ser un entero o null' }, 400)
  }
  if (nif !== undefined && nif !== null && typeof nif !== 'string') return c.json({ error: 'nif debe ser texto' }, 400)
  if (direccion_fiscal !== undefined && direccion_fiscal !== null && typeof direccion_fiscal !== 'string') {
    return c.json({ error: 'direccion_fiscal debe ser texto' }, 400)
  }
  if (notas !== undefined && notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)

  const nifNorm = typeof nif === 'string' && nif.trim() !== '' ? nif.trim().toUpperCase() : null

  try {
    const ambitoExists = await finanzasDb.query('SELECT 1 FROM ambitos WHERE id = $1', [ambito_id])
    if (ambitoExists.rowCount === 0) return c.json({ error: 'ambito_id no existe' }, 400)

    const result = await finanzasDb.query(
      `INSERT INTO terceros (ambito_id, core_contact_id, nombre, tipo, nif, direccion_fiscal, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${TERCERO_COLS.replaceAll('t.', '')}`,
      [ambito_id, core_contact_id ?? null, nombre.trim(), tipo, nifNorm, direccion_fiscal ?? null, notas ?? null]
    )
    return c.json({ tercero: result.rows[0] }, 201)
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: 'Ya existe un tercero con ese NIF o ese contacto vinculado en este ámbito' }, 409)
    }
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/terceros/:id — ambito_id NO es editable.
finanzasRoutes.patch('/terceros/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { nombre, tipo, core_contact_id, nif, direccion_fiscal, activa, notas } = body as Record<string, unknown>

  const sets: string[] = []
  const params: unknown[] = []

  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || nombre.trim() === '') return c.json({ error: 'nombre no puede estar vacío' }, 400)
    params.push(nombre.trim())
    sets.push(`nombre = $${params.length}`)
  }
  if (tipo !== undefined) {
    if (!isTipoTercero(tipo)) return c.json({ error: `tipo debe ser uno de: ${TIPOS_TERCERO.join(', ')}` }, 400)
    params.push(tipo)
    sets.push(`tipo = $${params.length}`)
  }
  if (core_contact_id !== undefined) {
    if (core_contact_id !== null && (typeof core_contact_id !== 'number' || !Number.isInteger(core_contact_id))) {
      return c.json({ error: 'core_contact_id debe ser un entero o null' }, 400)
    }
    params.push(core_contact_id)
    sets.push(`core_contact_id = $${params.length}`)
  }
  if (nif !== undefined) {
    if (nif !== null && typeof nif !== 'string') return c.json({ error: 'nif debe ser texto' }, 400)
    const nifNorm = typeof nif === 'string' && nif.trim() !== '' ? nif.trim().toUpperCase() : null
    params.push(nifNorm)
    sets.push(`nif = $${params.length}`)
  }
  if (direccion_fiscal !== undefined) {
    if (direccion_fiscal !== null && typeof direccion_fiscal !== 'string') return c.json({ error: 'direccion_fiscal debe ser texto' }, 400)
    params.push(direccion_fiscal)
    sets.push(`direccion_fiscal = $${params.length}`)
  }
  if (notas !== undefined) {
    if (notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)
    params.push(notas)
    sets.push(`notas = $${params.length}`)
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
      `UPDATE terceros SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${TERCERO_COLS.replaceAll('t.', '')}`,
      params
    )
    if (result.rowCount === 0) return c.json({ error: 'Tercero no encontrado' }, 404)
    return c.json({ tercero: result.rows[0] })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: 'Ya existe un tercero con ese NIF o ese contacto vinculado en este ámbito' }, 409)
    }
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// ─── core-contacts (imm_db) — opcional, solo lectura, vínculo blando ────

// GET /api/finanzas/core-contacts — lista de contactos de imm_db para
// ayudar a vincular un tercero. Puramente informativo: guardar
// core_contact_id NO valida contra imm_db a nivel de BD (sin FK, a
// propósito). Usa el pool de solo lectura ya existente en la app.
finanzasRoutes.get('/core-contacts', async (c) => {
  if (!immReadonlyDb) return c.json({ error: 'IMM_READONLY_DB_URL no configurada' }, 503)
  try {
    const result = await immReadonlyDb.query(
      `SELECT id, full_name AS nombre FROM core_contacts WHERE active = true ORDER BY full_name`
    )
    return c.json({ contactos: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// ─── saldos de apertura — punto de partida del cálculo (#743 pieza 2A) ──

// GET /api/finanzas/apertura?anio=YYYY — por cuenta activa, su apertura de
// ese año si existe (o null, indicando que falta).
finanzasRoutes.get('/apertura', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const raw = c.req.query('anio')
  const anio = raw !== undefined ? Number(raw) : new Date().getFullYear()
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return c.json({ error: 'anio inválido' }, 400)

  try {
    const result = await finanzasDb.query(
      `SELECT c.id AS cuenta_id, c.nombre AS cuenta_nombre, c.tipo AS cuenta_tipo,
              c.ambito_id, a.nombre AS ambito_nombre, a.color AS ambito_color, a.orden AS ambito_orden,
              sa.id AS apertura_id, sa.saldo, sa.notas, sa.updated_at
       FROM cuentas_financieras c
       JOIN ambitos a ON a.id = c.ambito_id
       LEFT JOIN saldos_apertura sa ON sa.cuenta_id = c.id AND sa.anio = $1
       WHERE c.activa = true
       ORDER BY a.orden, c.nombre`,
      [anio]
    )
    return c.json({ anio, cuentas: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// PUT /api/finanzas/apertura — upsert sobre UNIQUE(cuenta_id, anio)
finanzasRoutes.put('/apertura', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { cuenta_id, anio, saldo, notas } = body as Record<string, unknown>

  if (typeof cuenta_id !== 'number' || !Number.isInteger(cuenta_id)) return c.json({ error: 'cuenta_id es obligatorio' }, 400)
  if (typeof anio !== 'number' || !Number.isInteger(anio) || anio < 2000 || anio > 2100) return c.json({ error: 'anio inválido' }, 400)
  const saldoNum = parseNumeric(saldo)
  if (saldoNum === null) return c.json({ error: 'saldo debe ser numérico' }, 400)
  if (notas !== undefined && notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)

  try {
    const cuentaExists = await finanzasDb.query('SELECT 1 FROM cuentas_financieras WHERE id = $1', [cuenta_id])
    if (cuentaExists.rowCount === 0) return c.json({ error: 'cuenta_id no existe' }, 400)

    const result = await finanzasDb.query(
      `INSERT INTO saldos_apertura (cuenta_id, anio, saldo, notas)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cuenta_id, anio) DO UPDATE SET saldo = EXCLUDED.saldo, notas = EXCLUDED.notas, updated_at = now()
       RETURNING id, cuenta_id, anio, saldo, notas, created_at, updated_at`,
      [cuenta_id, anio, saldoNum, notas ?? null]
    )
    return c.json({ apertura: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'upsert error' }, 500)
  }
})

// ─── movimientos reales — solo ingreso/gasto/ajuste en este bloque ──────
// Traspasos (traspaso_salida/traspaso_entrada) son el BLOQUE B: tienen su
// propia familia de endpoints (POST/PATCH/DELETE /api/finanzas/traspasos,
// más abajo) porque un traspaso interno son DOS apuntes atómicos ligados
// por grupo_traspaso, no un movimiento suelto. Aquí se siguen rechazando
// explícitamente — nunca se crean, editan ni borran desde /movimientos.

const MOVIMIENTO_TRASPASO_MSG = 'Los traspasos se gestionan desde /api/finanzas/traspasos (interno: dos patas atómicas; externo: un apunte con tercero), no desde /movimientos'

// GET /api/finanzas/movimientos — lee v_movimientos_reales (categoría,
// tercero y cuenta ya resueltos por la vista). El agrupado por ámbito NO
// depende de los nombres de columna de la vista: se une explícitamente a
// cuentas_financieras + ambitos aquí, así que es fiable pase lo que pase.
finanzasRoutes.get('/movimientos', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const ambitoId = c.req.query('ambito_id')
  const cuentaId = c.req.query('cuenta_id')
  const categoriaId = c.req.query('categoria_id')
  const terceroId = c.req.query('tercero_id')
  const tipo = c.req.query('tipo')
  const desde = c.req.query('desde')
  const hasta = c.req.query('hasta')
  const limitRaw = c.req.query('limit')
  const offsetRaw = c.req.query('offset')

  const conditions: string[] = []
  const params: unknown[] = []

  if (ambitoId !== undefined) {
    if (!/^\d+$/.test(ambitoId)) return c.json({ error: 'ambito_id inválido' }, 400)
    params.push(Number(ambitoId))
    conditions.push(`a.id = $${params.length}`)
  }
  if (cuentaId !== undefined) {
    if (!/^\d+$/.test(cuentaId)) return c.json({ error: 'cuenta_id inválido' }, 400)
    params.push(Number(cuentaId))
    conditions.push(`v.cuenta_id = $${params.length}`)
  }
  if (categoriaId !== undefined) {
    if (!/^\d+$/.test(categoriaId)) return c.json({ error: 'categoria_id inválido' }, 400)
    params.push(Number(categoriaId))
    conditions.push(`v.categoria_id = $${params.length}`)
  }
  if (terceroId !== undefined) {
    if (!/^\d+$/.test(terceroId)) return c.json({ error: 'tercero_id inválido' }, 400)
    params.push(Number(terceroId))
    conditions.push(`v.tercero_id = $${params.length}`)
  }
  if (tipo !== undefined) {
    if (!isTipoMovimientoRealTodos(tipo)) return c.json({ error: `tipo debe ser uno de: ${TIPOS_MOVIMIENTO_REAL_TODOS.join(', ')}` }, 400)
    params.push(tipo)
    conditions.push(`v.tipo = $${params.length}`)
  }
  if (desde !== undefined) {
    if (!ISO_DATE_RE.test(desde)) return c.json({ error: 'desde debe tener formato YYYY-MM-DD' }, 400)
    params.push(desde)
    conditions.push(`v.fecha >= $${params.length}`)
  }
  if (hasta !== undefined) {
    if (!ISO_DATE_RE.test(hasta)) return c.json({ error: 'hasta debe tener formato YYYY-MM-DD' }, 400)
    params.push(hasta)
    conditions.push(`v.fecha <= $${params.length}`)
  }

  const limit = limitRaw !== undefined && /^\d+$/.test(limitRaw) ? Math.min(Number(limitRaw), 500) : 100
  const offset = offsetRaw !== undefined && /^\d+$/.test(offsetRaw) ? Number(offsetRaw) : 0

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    // saldo_acumulado: cómo queda la cuenta tras cada apunte, calculado en
    // orden cronológico real (fecha, luego id) sobre TODOS los movimientos
    // de esa cuenta/año — no solo los que pasan los filtros de arriba, ni
    // en el orden en que se muestra la lista (que es fecha DESC). Apertura
    // y suma se anclan al año del propio movimiento (igual que
    // v_cuentas_saldo_calculado, generalizado por si hay datos de más de
    // un año): si esa cuenta no tiene apertura de ese año, NULL + suma =
    // NULL (nunca un número falso) y el frontend lo pinta como "—".
    const result = await finanzasDb.query(
      `WITH acumulado AS (
         SELECT m.id,
                sa.saldo + SUM(m.importe) OVER (
                  PARTITION BY m.cuenta_id, EXTRACT(YEAR FROM m.fecha)
                  ORDER BY m.fecha, m.id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS saldo_acumulado
         FROM movimientos_reales m
         LEFT JOIN saldos_apertura sa
           ON sa.cuenta_id = m.cuenta_id AND sa.anio = EXTRACT(YEAR FROM m.fecha)::smallint
       )
       SELECT v.*, TO_CHAR(v.fecha, 'YYYY-MM-DD') AS fecha,
              a.id AS ambito_id, a.nombre AS ambito_nombre, a.color AS ambito_color, a.orden AS ambito_orden,
              ac.saldo_acumulado
       FROM v_movimientos_reales v
       JOIN cuentas_financieras cf ON cf.id = v.cuenta_id
       JOIN ambitos a ON a.id = cf.ambito_id
       LEFT JOIN acumulado ac ON ac.id = v.id
       ${where}
       ORDER BY v.fecha DESC, v.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    )
    return c.json({ movimientos: result.rows, limit, offset })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/movimientos — solo ingreso/gasto/ajuste. El usuario
// mete siempre un importe positivo; el signo lo decide el backend según
// tipo (ajuste: según el campo `signo` que manda la UI).
finanzasRoutes.post('/movimientos', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { cuenta_id, fecha, tipo, importe, signo, categoria_id, tercero_id, concepto, notas } = body as Record<string, unknown>

  if (typeof cuenta_id !== 'number' || !Number.isInteger(cuenta_id)) return c.json({ error: 'cuenta_id es obligatorio' }, 400)
  if (typeof fecha !== 'string' || !ISO_DATE_RE.test(fecha)) return c.json({ error: 'fecha debe tener formato YYYY-MM-DD' }, 400)

  if (typeof tipo === 'string' && isTraspaso(tipo)) return c.json({ error: MOVIMIENTO_TRASPASO_MSG }, 400)
  if (!isTipoMovimientoRealCreable(tipo)) {
    return c.json({ error: `tipo debe ser uno de: ${TIPOS_MOVIMIENTO_REAL_CREABLE.join(', ')}` }, 400)
  }

  const importeNum = parseNumeric(importe)
  if (importeNum === null || importeNum <= 0) {
    return c.json({ error: 'importe es obligatorio y debe ser un número mayor que 0 (el signo lo pone el sistema según el tipo)' }, 400)
  }

  if (categoria_id !== undefined && categoria_id !== null && (typeof categoria_id !== 'number' || !Number.isInteger(categoria_id))) {
    return c.json({ error: 'categoria_id debe ser un entero o null' }, 400)
  }
  if (tercero_id !== undefined && tercero_id !== null && (typeof tercero_id !== 'number' || !Number.isInteger(tercero_id))) {
    return c.json({ error: 'tercero_id debe ser un entero o null' }, 400)
  }
  if (concepto !== undefined && concepto !== null && typeof concepto !== 'string') return c.json({ error: 'concepto debe ser texto' }, 400)
  if (notas !== undefined && notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)

  // Validaciones que anticipan los CHECK de BD, para dar buen mensaje.
  if (tipo === 'gasto' && !categoria_id) return c.json({ error: 'Un gasto requiere categoría' }, 400)
  if (tipo === 'ingreso' && !tercero_id) return c.json({ error: 'Un ingreso requiere tercero' }, 400)

  let importeFirmado: number
  if (tipo === 'ingreso') {
    importeFirmado = Math.abs(importeNum)
  } else if (tipo === 'gasto') {
    importeFirmado = -Math.abs(importeNum)
  } else {
    if (signo !== 'suma' && signo !== 'resta') {
      return c.json({ error: `Un ajuste requiere signo: 'suma' o 'resta'` }, 400)
    }
    importeFirmado = signo === 'suma' ? Math.abs(importeNum) : -Math.abs(importeNum)
  }

  try {
    const cuentaExists = await finanzasDb.query('SELECT 1 FROM cuentas_financieras WHERE id = $1', [cuenta_id])
    if (cuentaExists.rowCount === 0) return c.json({ error: 'cuenta_id no existe' }, 400)

    if (categoria_id) {
      const catResult = await finanzasDb.query('SELECT tipo FROM categorias WHERE id = $1', [categoria_id])
      if (catResult.rowCount === 0) return c.json({ error: 'categoria_id no existe' }, 400)
      const catTipo = catResult.rows[0].tipo as string
      if (tipo === 'gasto' && catTipo !== 'gasto' && catTipo !== 'ambos') {
        return c.json({ error: 'La categoría elegida no es de tipo gasto (ni ambos)' }, 400)
      }
      if (tipo === 'ingreso' && catTipo !== 'ingreso' && catTipo !== 'ambos') {
        return c.json({ error: 'La categoría elegida no es de tipo ingreso (ni ambos)' }, 400)
      }
    }
    if (tercero_id) {
      const terExists = await finanzasDb.query('SELECT 1 FROM terceros WHERE id = $1', [tercero_id])
      if (terExists.rowCount === 0) return c.json({ error: 'tercero_id no existe' }, 400)
    }

    const result = await finanzasDb.query(
      `INSERT INTO movimientos_reales (cuenta_id, fecha, tipo, importe, categoria_id, tercero_id, concepto, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, cuenta_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, tipo, importe, moneda,
                 categoria_id, tercero_id, grupo_traspaso, concepto, notas, created_at, updated_at`,
      [cuenta_id, fecha, tipo, importeFirmado, categoria_id ?? null, tercero_id ?? null, concepto ?? null, notas ?? null]
    )
    return c.json({ movimiento: result.rows[0] }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/movimientos/:id — tipo NO se cambia aquí (para no
// convertir un ingreso en gasto por error). Reaplica el signo del tipo
// existente sobre el nuevo importe si se manda uno nuevo.
finanzasRoutes.patch('/movimientos/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { fecha, importe, signo, categoria_id, tercero_id, concepto, notas } = body as Record<string, unknown>

  try {
    const existing = await finanzasDb.query('SELECT tipo FROM movimientos_reales WHERE id = $1', [id])
    if (existing.rowCount === 0) return c.json({ error: 'Movimiento no encontrado' }, 404)
    const tipoExistente = existing.rows[0].tipo as string
    if (isTraspaso(tipoExistente)) return c.json({ error: MOVIMIENTO_TRASPASO_MSG }, 400)

    const sets: string[] = []
    const params: unknown[] = []

    if (fecha !== undefined) {
      if (typeof fecha !== 'string' || !ISO_DATE_RE.test(fecha)) return c.json({ error: 'fecha debe tener formato YYYY-MM-DD' }, 400)
      params.push(fecha)
      sets.push(`fecha = $${params.length}`)
    }

    if (importe !== undefined) {
      const importeNum = parseNumeric(importe)
      if (importeNum === null || importeNum <= 0) {
        return c.json({ error: 'importe debe ser un número mayor que 0 (el signo lo pone el sistema)' }, 400)
      }
      let importeFirmado: number
      if (tipoExistente === 'ingreso') {
        importeFirmado = Math.abs(importeNum)
      } else if (tipoExistente === 'gasto') {
        importeFirmado = -Math.abs(importeNum)
      } else {
        if (signo !== 'suma' && signo !== 'resta') {
          return c.json({ error: `Este ajuste requiere signo: 'suma' o 'resta'` }, 400)
        }
        importeFirmado = signo === 'suma' ? Math.abs(importeNum) : -Math.abs(importeNum)
      }
      params.push(importeFirmado)
      sets.push(`importe = $${params.length}`)
    }

    if (categoria_id !== undefined) {
      if (categoria_id !== null && (typeof categoria_id !== 'number' || !Number.isInteger(categoria_id))) {
        return c.json({ error: 'categoria_id debe ser un entero o null' }, 400)
      }
      if (tipoExistente === 'gasto' && !categoria_id) return c.json({ error: 'Un gasto requiere categoría' }, 400)
      params.push(categoria_id)
      sets.push(`categoria_id = $${params.length}`)
    }
    if (tercero_id !== undefined) {
      if (tercero_id !== null && (typeof tercero_id !== 'number' || !Number.isInteger(tercero_id))) {
        return c.json({ error: 'tercero_id debe ser un entero o null' }, 400)
      }
      if (tipoExistente === 'ingreso' && !tercero_id) return c.json({ error: 'Un ingreso requiere tercero' }, 400)
      params.push(tercero_id)
      sets.push(`tercero_id = $${params.length}`)
    }
    if (concepto !== undefined) {
      if (concepto !== null && typeof concepto !== 'string') return c.json({ error: 'concepto debe ser texto' }, 400)
      params.push(concepto)
      sets.push(`concepto = $${params.length}`)
    }
    if (notas !== undefined) {
      if (notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)
      params.push(notas)
      sets.push(`notas = $${params.length}`)
    }

    if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)
    sets.push('updated_at = now()')
    params.push(id)

    const result = await finanzasDb.query(
      `UPDATE movimientos_reales SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, cuenta_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, tipo, importe, moneda,
                 categoria_id, tercero_id, grupo_traspaso, concepto, notas, created_at, updated_at`,
      params
    )
    return c.json({ movimiento: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// DELETE /api/finanzas/movimientos/:id — borrado físico permitido para
// movimientos simples (sin histórico contable que proteger todavía).
// Los traspasos se rechazan: los gestionará el bloque B con su lógica de
// grupo (borrar los dos lados a la vez).
finanzasRoutes.delete('/movimientos/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  try {
    const existing = await finanzasDb.query('SELECT tipo FROM movimientos_reales WHERE id = $1', [id])
    if (existing.rowCount === 0) return c.json({ error: 'Movimiento no encontrado' }, 404)
    if (isTraspaso(existing.rows[0].tipo as string)) return c.json({ error: MOVIMIENTO_TRASPASO_MSG }, 400)

    await finanzasDb.query('DELETE FROM movimientos_reales WHERE id = $1', [id])
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'delete error' }, 500)
  }
})

// ─── saldo calculado (solo lectura) — v_cuentas_saldo_calculado ─────────
// El agrupado por ámbito, igual que en /movimientos, se hace con un JOIN
// propio a cuentas_financieras + ambitos — no depende de que la vista
// exponga columnas de ámbito con un nombre concreto.
finanzasRoutes.get('/saldo-calculado', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const ambitoId = c.req.query('ambito_id')

  const params: unknown[] = []
  let where = 'WHERE c.activa = true'
  if (ambitoId !== undefined) {
    if (!/^\d+$/.test(ambitoId)) return c.json({ error: 'ambito_id inválido' }, 400)
    params.push(Number(ambitoId))
    where += ` AND a.id = $${params.length}`
  }

  try {
    const result = await finanzasDb.query(
      `SELECT c.id AS cuenta_id, c.nombre AS cuenta_nombre, c.tipo AS cuenta_tipo,
              c.ambito_id, a.nombre AS ambito_nombre, a.color AS ambito_color, a.orden AS ambito_orden,
              v.saldo_apertura, v.suma_movimientos, v.saldo_calculado, v.requiere_saldo_apertura,
              v.saldo_observado, TO_CHAR(v.saldo_observado_semana, 'YYYY-MM-DD') AS saldo_observado_semana,
              v.diferencia_conciliacion
       FROM v_cuentas_saldo_calculado v
       JOIN cuentas_financieras c ON c.id = v.cuenta_id
       JOIN ambitos a ON a.id = c.ambito_id
       ${where}
       ORDER BY a.orden, c.nombre`,
      params
    )
    return c.json({ cuentas: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// ─── obligaciones (#743, capa de vigilancia sobre el flujo de caja) ─────
// obligaciones = plantilla recurrente/puntual. obligaciones_instancias =
// cada vencimiento concreto. El sistema NO aparta dinero ni mueve nada
// solo: compara disponible vs pendientes y sugiere emparejamientos que
// el usuario confirma. Nunca cubre una instancia sin POST .../cubrir.
// Igual que en /movimientos, las lecturas se resuelven con JOINs propios
// a ambitos/categorias en vez de confiar en las columnas exactas de
// v_obligaciones_instancias (vista no comiteada en este repo).

const OBLIGACION_COLS = `id, ambito_id, categoria_id, nombre, periodicidad, tipo_importe,
  importe_referencia, moneda, dia_vencimiento, meses_desfase, activa, notas, created_at, updated_at`

const INSTANCIA_COLS = `id, obligacion_id, TO_CHAR(periodo, 'YYYY-MM-DD') AS periodo,
  TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
  importe_esperado, moneda, estado, movimiento_id, importe_real,
  TO_CHAR(fecha_cubierta, 'YYYY-MM-DD') AS fecha_cubierta, notas, created_at, updated_at`

// GET /api/finanzas/obligaciones?ambito_id= — plantillas con ámbito y categoría resueltos
finanzasRoutes.get('/obligaciones', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const ambitoId = c.req.query('ambito_id')

  const params: unknown[] = []
  let where = ''
  if (ambitoId !== undefined) {
    if (!/^\d+$/.test(ambitoId)) return c.json({ error: 'ambito_id inválido' }, 400)
    params.push(Number(ambitoId))
    where = `WHERE o.ambito_id = $${params.length}`
  }

  try {
    const result = await finanzasDb.query(
      `SELECT o.id, o.ambito_id, o.categoria_id, o.nombre, o.periodicidad, o.tipo_importe,
              o.importe_referencia, o.moneda, o.dia_vencimiento, o.meses_desfase, o.activa, o.notas,
              o.created_at, o.updated_at,
              a.nombre AS ambito_nombre, a.color AS ambito_color, a.orden AS ambito_orden,
              cat.nombre AS categoria_nombre
       FROM obligaciones o
       JOIN ambitos a ON a.id = o.ambito_id
       JOIN categorias cat ON cat.id = o.categoria_id
       ${where}
       ORDER BY a.orden, o.nombre`,
      params
    )
    return c.json({ obligaciones: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/obligaciones — crea la plantilla y, si es recurrente
// (mensual/trimestral/anual), genera de golpe sus instancias del año en
// curso. 'puntual' no genera nada: sus instancias se crean a mano.
finanzasRoutes.post('/obligaciones', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { ambito_id, categoria_id, nombre, periodicidad, tipo_importe, importe_referencia, dia_vencimiento, meses_desfase, notas } =
    body as Record<string, unknown>

  if (typeof ambito_id !== 'number' || !Number.isInteger(ambito_id)) return c.json({ error: 'ambito_id es obligatorio' }, 400)
  if (typeof categoria_id !== 'number' || !Number.isInteger(categoria_id)) return c.json({ error: 'categoria_id es obligatorio' }, 400)
  if (typeof nombre !== 'string' || nombre.trim() === '') return c.json({ error: 'nombre es obligatorio' }, 400)
  if (!isPeriodicidadObligacion(periodicidad)) {
    return c.json({ error: `periodicidad debe ser una de: ${PERIODICIDADES_OBLIGACION.join(', ')}` }, 400)
  }
  if (!isTipoImporteObligacion(tipo_importe)) {
    return c.json({ error: `tipo_importe debe ser uno de: ${TIPOS_IMPORTE_OBLIGACION.join(', ')}` }, 400)
  }

  let importeReferenciaNum: number | null = null
  if (importe_referencia !== undefined && importe_referencia !== null) {
    importeReferenciaNum = parseNumeric(importe_referencia)
    if (importeReferenciaNum === null || importeReferenciaNum <= 0) {
      return c.json({ error: 'importe_referencia debe ser un número mayor que 0' }, 400)
    }
  }

  let diaVencimientoNum: number | null = null
  if (dia_vencimiento !== undefined && dia_vencimiento !== null) {
    if (typeof dia_vencimiento !== 'number' || !Number.isInteger(dia_vencimiento) || dia_vencimiento < 1 || dia_vencimiento > 31) {
      return c.json({ error: 'dia_vencimiento debe ser un entero entre 1 y 31' }, 400)
    }
    diaVencimientoNum = dia_vencimiento
  }

  let mesesDesfaseNum = 0
  if (meses_desfase !== undefined && meses_desfase !== null) {
    if (typeof meses_desfase !== 'number' || !Number.isInteger(meses_desfase)) return c.json({ error: 'meses_desfase debe ser un entero' }, 400)
    mesesDesfaseNum = meses_desfase
  }

  if (notas !== undefined && notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)

  try {
    const ambitoExists = await finanzasDb.query('SELECT 1 FROM ambitos WHERE id = $1', [ambito_id])
    if (ambitoExists.rowCount === 0) return c.json({ error: 'ambito_id no existe' }, 400)

    const catResult = await finanzasDb.query('SELECT tipo FROM categorias WHERE id = $1', [categoria_id])
    if (catResult.rowCount === 0) return c.json({ error: 'categoria_id no existe' }, 400)
    const catTipo = catResult.rows[0].tipo as string
    if (catTipo !== 'gasto' && catTipo !== 'ambos') {
      return c.json({ error: 'Una obligación se vincula a una categoría de tipo gasto (o ambos)' }, 400)
    }

    const obligacionResult = await finanzasDb.query(
      `INSERT INTO obligaciones (ambito_id, categoria_id, nombre, periodicidad, tipo_importe, importe_referencia, dia_vencimiento, meses_desfase, activa, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
       RETURNING ${OBLIGACION_COLS}`,
      [ambito_id, categoria_id, nombre.trim(), periodicidad, tipo_importe, importeReferenciaNum, diaVencimientoNum, mesesDesfaseNum, notas ?? null]
    )
    const obligacion = obligacionResult.rows[0]

    let instanciasCreadas = 0
    if (periodicidad !== 'puntual') {
      const anio = new Date().getUTCFullYear()
      const periodos = generarInstanciasAnio(periodicidad, anio, mesesDesfaseNum, diaVencimientoNum)
      for (const p of periodos) {
        await finanzasDb.query(
          `INSERT INTO obligaciones_instancias (obligacion_id, periodo, fecha_vencimiento, importe_esperado, estado)
           VALUES ($1, $2, $3, $4, 'pendiente')
           ON CONFLICT (obligacion_id, periodo) DO NOTHING`,
          [obligacion.id, p.periodo, p.fecha_vencimiento, importeReferenciaNum]
        )
      }
      instanciasCreadas = periodos.length
    }

    return c.json({ obligacion, instancias_creadas: instanciasCreadas }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/obligaciones/:id — nombre, importe_referencia,
// dia_vencimiento, meses_desfase, activa, notas. periodicidad/tipo_importe/
// ambito_id/categoria_id NO son editables (romperían las instancias ya
// generadas). NO regenera instancias pasadas. Si cambia importe_referencia,
// se propaga solo a las instancias aún 'pendiente' de este mes en adelante
// — las pasadas o ya cubiertas/canceladas quedan como estaban.
finanzasRoutes.patch('/obligaciones/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { nombre, importe_referencia, dia_vencimiento, meses_desfase, activa, notas } = body as Record<string, unknown>

  const sets: string[] = []
  const params: unknown[] = []
  let nuevoImporteReferencia: number | null | undefined

  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || nombre.trim() === '') return c.json({ error: 'nombre no puede estar vacío' }, 400)
    params.push(nombre.trim())
    sets.push(`nombre = $${params.length}`)
  }
  if (importe_referencia !== undefined) {
    if (importe_referencia === null) {
      nuevoImporteReferencia = null
    } else {
      const n = parseNumeric(importe_referencia)
      if (n === null || n <= 0) return c.json({ error: 'importe_referencia debe ser un número mayor que 0' }, 400)
      nuevoImporteReferencia = n
    }
    params.push(nuevoImporteReferencia)
    sets.push(`importe_referencia = $${params.length}`)
  }
  if (dia_vencimiento !== undefined) {
    if (dia_vencimiento !== null && (typeof dia_vencimiento !== 'number' || !Number.isInteger(dia_vencimiento) || dia_vencimiento < 1 || dia_vencimiento > 31)) {
      return c.json({ error: 'dia_vencimiento debe ser un entero entre 1 y 31, o null' }, 400)
    }
    params.push(dia_vencimiento)
    sets.push(`dia_vencimiento = $${params.length}`)
  }
  if (meses_desfase !== undefined) {
    if (typeof meses_desfase !== 'number' || !Number.isInteger(meses_desfase)) return c.json({ error: 'meses_desfase debe ser un entero' }, 400)
    params.push(meses_desfase)
    sets.push(`meses_desfase = $${params.length}`)
  }
  if (activa !== undefined) {
    if (typeof activa !== 'boolean') return c.json({ error: 'activa debe ser booleano' }, 400)
    params.push(activa)
    sets.push(`activa = $${params.length}`)
  }
  if (notas !== undefined) {
    if (notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)
    params.push(notas)
    sets.push(`notas = $${params.length}`)
  }

  if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)
  sets.push('updated_at = now()')
  params.push(id)

  try {
    const result = await finanzasDb.query(
      `UPDATE obligaciones SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${OBLIGACION_COLS}`,
      params
    )
    if (result.rowCount === 0) return c.json({ error: 'Obligación no encontrada' }, 404)

    if (nuevoImporteReferencia !== undefined) {
      await finanzasDb.query(
        `UPDATE obligaciones_instancias
         SET importe_esperado = $1, updated_at = now()
         WHERE obligacion_id = $2 AND estado = 'pendiente' AND periodo >= date_trunc('month', now())::date`,
        [nuevoImporteReferencia, id]
      )
    }

    return c.json({ obligacion: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// GET /api/finanzas/obligaciones/instancias?ambito_id=&periodo=&estado=&desde=&hasta=
// periodo = coincidencia exacta con el periodo (día 1 del mes/trimestre/año).
// desde/hasta = rango sobre fecha_vencimiento (para "próximos vencimientos").
finanzasRoutes.get('/obligaciones/instancias', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const ambitoId = c.req.query('ambito_id')
  const periodo = c.req.query('periodo')
  const estado = c.req.query('estado')
  const desde = c.req.query('desde')
  const hasta = c.req.query('hasta')

  const conditions: string[] = []
  const params: unknown[] = []

  if (ambitoId !== undefined) {
    if (!/^\d+$/.test(ambitoId)) return c.json({ error: 'ambito_id inválido' }, 400)
    params.push(Number(ambitoId))
    conditions.push(`a.id = $${params.length}`)
  }
  if (periodo !== undefined) {
    if (!ISO_DATE_RE.test(periodo)) return c.json({ error: 'periodo debe tener formato YYYY-MM-DD (primer día del periodo)' }, 400)
    params.push(periodo)
    conditions.push(`i.periodo = $${params.length}`)
  }
  if (estado !== undefined) {
    if (!isEstadoInstanciaObligacion(estado)) {
      return c.json({ error: `estado debe ser uno de: ${ESTADOS_INSTANCIA_OBLIGACION.join(', ')}` }, 400)
    }
    params.push(estado)
    conditions.push(`i.estado = $${params.length}`)
  }
  if (desde !== undefined) {
    if (!ISO_DATE_RE.test(desde)) return c.json({ error: 'desde debe tener formato YYYY-MM-DD' }, 400)
    params.push(desde)
    conditions.push(`i.fecha_vencimiento >= $${params.length}`)
  }
  if (hasta !== undefined) {
    if (!ISO_DATE_RE.test(hasta)) return c.json({ error: 'hasta debe tener formato YYYY-MM-DD' }, 400)
    params.push(hasta)
    conditions.push(`i.fecha_vencimiento <= $${params.length}`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const result = await finanzasDb.query(
      `SELECT i.id, i.obligacion_id, TO_CHAR(i.periodo, 'YYYY-MM-DD') AS periodo,
              TO_CHAR(i.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
              i.importe_esperado, i.moneda, i.estado, i.movimiento_id, i.importe_real,
              TO_CHAR(i.fecha_cubierta, 'YYYY-MM-DD') AS fecha_cubierta, i.notas,
              o.nombre AS obligacion_nombre, o.periodicidad, o.categoria_id, cat.nombre AS categoria_nombre,
              a.id AS ambito_id, a.nombre AS ambito_nombre, a.color AS ambito_color, a.orden AS ambito_orden
       FROM obligaciones_instancias i
       JOIN obligaciones o ON o.id = i.obligacion_id
       JOIN ambitos a ON a.id = o.ambito_id
       JOIN categorias cat ON cat.id = o.categoria_id
       ${where}
       ORDER BY i.fecha_vencimiento, a.orden, o.nombre`,
      params
    )
    return c.json({ instancias: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// POST /api/finanzas/obligaciones/instancias — instancia manual (para
// obligaciones 'puntual' o un vencimiento suelto fuera de lo generado).
finanzasRoutes.post('/obligaciones/instancias', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { obligacion_id, periodo, fecha_vencimiento, importe_esperado } = body as Record<string, unknown>

  if (typeof obligacion_id !== 'number' || !Number.isInteger(obligacion_id)) return c.json({ error: 'obligacion_id es obligatorio' }, 400)
  if (typeof periodo !== 'string' || !ISO_DATE_RE.test(periodo)) return c.json({ error: 'periodo debe tener formato YYYY-MM-DD' }, 400)
  if (typeof fecha_vencimiento !== 'string' || !ISO_DATE_RE.test(fecha_vencimiento)) {
    return c.json({ error: 'fecha_vencimiento debe tener formato YYYY-MM-DD' }, 400)
  }

  let importeEsperadoNum: number | null = null
  if (importe_esperado !== undefined && importe_esperado !== null) {
    importeEsperadoNum = parseNumeric(importe_esperado)
    if (importeEsperadoNum === null || importeEsperadoNum <= 0) return c.json({ error: 'importe_esperado debe ser un número mayor que 0' }, 400)
  }

  try {
    const oblExists = await finanzasDb.query('SELECT 1 FROM obligaciones WHERE id = $1', [obligacion_id])
    if (oblExists.rowCount === 0) return c.json({ error: 'obligacion_id no existe' }, 400)

    const result = await finanzasDb.query(
      `INSERT INTO obligaciones_instancias (obligacion_id, periodo, fecha_vencimiento, importe_esperado, estado)
       VALUES ($1, $2, $3, $4, 'pendiente')
       RETURNING ${INSTANCIA_COLS}`,
      [obligacion_id, periodo, fecha_vencimiento, importeEsperadoNum]
    )
    return c.json({ instancia: result.rows[0] }, 201)
  } catch (err) {
    if (isUniqueViolation(err)) return c.json({ error: 'Ya existe una instancia de esa obligación para ese periodo' }, 409)
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// PATCH /api/finanzas/obligaciones/instancias/:id — importe_esperado,
// fecha_vencimiento, notas y estado ('pendiente'/'cancelada' solo — pasar
// a 'cubierta' requiere movimiento_id y solo lo hace POST .../cubrir).
finanzasRoutes.patch('/obligaciones/instancias/:id', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { importe_esperado, fecha_vencimiento, estado, notas } = body as Record<string, unknown>

  const sets: string[] = []
  const params: unknown[] = []

  if (importe_esperado !== undefined) {
    if (importe_esperado === null) {
      params.push(null)
    } else {
      const n = parseNumeric(importe_esperado)
      if (n === null || n <= 0) return c.json({ error: 'importe_esperado debe ser un número mayor que 0' }, 400)
      params.push(n)
    }
    sets.push(`importe_esperado = $${params.length}`)
  }
  if (fecha_vencimiento !== undefined) {
    if (typeof fecha_vencimiento !== 'string' || !ISO_DATE_RE.test(fecha_vencimiento)) {
      return c.json({ error: 'fecha_vencimiento debe tener formato YYYY-MM-DD' }, 400)
    }
    params.push(fecha_vencimiento)
    sets.push(`fecha_vencimiento = $${params.length}`)
  }
  if (estado !== undefined) {
    if (estado !== 'pendiente' && estado !== 'cancelada') {
      return c.json({ error: `estado aquí solo admite 'pendiente' o 'cancelada' — para 'cubierta' usa /cubrir` }, 400)
    }
    params.push(estado)
    sets.push(`estado = $${params.length}`)
    sets.push(`movimiento_id = NULL`, `importe_real = NULL`, `fecha_cubierta = NULL`)
  }
  if (notas !== undefined) {
    if (notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)
    params.push(notas)
    sets.push(`notas = $${params.length}`)
  }

  if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)
  sets.push('updated_at = now()')
  params.push(id)

  try {
    const result = await finanzasDb.query(
      `UPDATE obligaciones_instancias SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${INSTANCIA_COLS}`,
      params
    )
    if (result.rowCount === 0) return c.json({ error: 'Instancia no encontrada' }, 404)
    return c.json({ instancia: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// POST /api/finanzas/obligaciones/instancias/:id/cubrir — confirma el
// emparejamiento. SIEMPRE requiere que el usuario mande movimiento_id;
// nunca se cubre automáticamente. Al confirmar, aprende: actualiza
// obligaciones.importe_referencia con el importe real (variaciones
// mínimas, p.ej. la cuota de autónomo sube 2€).
finanzasRoutes.post('/obligaciones/instancias/:id/cubrir', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { movimiento_id } = body as Record<string, unknown>
  if (typeof movimiento_id !== 'number' || !Number.isInteger(movimiento_id)) {
    return c.json({ error: 'movimiento_id es obligatorio' }, 400)
  }

  try {
    const instResult = await finanzasDb.query('SELECT id, obligacion_id, estado FROM obligaciones_instancias WHERE id = $1', [id])
    if (instResult.rowCount === 0) return c.json({ error: 'Instancia no encontrada' }, 404)
    const instancia = instResult.rows[0]
    if (instancia.estado === 'cubierta') {
      return c.json({ error: 'Esta instancia ya está cubierta — usa /descubrir primero si quieres cambiar el movimiento vinculado' }, 409)
    }

    const movResult = await finanzasDb.query('SELECT id, tipo, importe FROM movimientos_reales WHERE id = $1', [movimiento_id])
    if (movResult.rowCount === 0) return c.json({ error: 'movimiento_id no existe' }, 400)
    const mov = movResult.rows[0]
    if (mov.tipo !== 'gasto') return c.json({ error: 'El movimiento debe ser un gasto' }, 400)

    const yaEnlazado = await finanzasDb.query('SELECT id FROM obligaciones_instancias WHERE movimiento_id = $1 AND id <> $2', [movimiento_id, id])
    if ((yaEnlazado.rowCount ?? 0) > 0) {
      return c.json({ error: 'Ese movimiento ya cubre otra instancia — un mismo gasto no puede cubrir dos obligaciones' }, 409)
    }

    const importeReal = Math.abs(Number(mov.importe))

    const updated = await finanzasDb.query(
      `UPDATE obligaciones_instancias
       SET estado = 'cubierta', movimiento_id = $1, importe_real = $2, fecha_cubierta = CURRENT_DATE, updated_at = now()
       WHERE id = $3
       RETURNING ${INSTANCIA_COLS}`,
      [movimiento_id, importeReal, id]
    )

    await finanzasDb.query('UPDATE obligaciones SET importe_referencia = $1, updated_at = now() WHERE id = $2', [importeReal, instancia.obligacion_id])

    return c.json({ instancia: updated.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// POST /api/finanzas/obligaciones/instancias/:id/descubrir — deshace el
// emparejamiento y vuelve la instancia a 'pendiente'.
finanzasRoutes.post('/obligaciones/instancias/:id/descubrir', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'id inválido' }, 400)

  try {
    const result = await finanzasDb.query(
      `UPDATE obligaciones_instancias
       SET estado = 'pendiente', movimiento_id = NULL, importe_real = NULL, fecha_cubierta = NULL, updated_at = now()
       WHERE id = $1
       RETURNING ${INSTANCIA_COLS}`,
      [id]
    )
    if (result.rowCount === 0) return c.json({ error: 'Instancia no encontrada' }, 404)
    return c.json({ instancia: result.rows[0] })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
  }
})

// GET /api/finanzas/obligaciones/sugerencias?periodo= — para cada instancia
// PENDIENTE de ese periodo, busca gastos reales de la categoría vinculada
// con importe (en valor absoluto) dentro de ±10% del importe_esperado (o
// cualquiera si no hay importe_esperado), que no estén ya enlazados a
// ninguna otra instancia. El usuario confirma con /cubrir — esto solo sugiere.
finanzasRoutes.get('/obligaciones/sugerencias', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const periodo = c.req.query('periodo')
  if (periodo === undefined || !ISO_DATE_RE.test(periodo)) {
    return c.json({ error: 'periodo es obligatorio, formato YYYY-MM-DD (primer día del periodo)' }, 400)
  }

  try {
    const pendientes = await finanzasDb.query(
      `SELECT i.id, i.obligacion_id, i.importe_esperado, o.categoria_id, o.ambito_id, o.nombre AS obligacion_nombre
       FROM obligaciones_instancias i
       JOIN obligaciones o ON o.id = i.obligacion_id
       WHERE i.periodo = $1 AND i.estado = 'pendiente'`,
      [periodo]
    )

    const sugerencias: unknown[] = []
    for (const inst of pendientes.rows) {
      const params: unknown[] = [inst.categoria_id]
      let importeCond = ''
      if (inst.importe_esperado !== null) {
        const esperado = Number(inst.importe_esperado)
        params.push(esperado * 0.9, esperado * 1.1)
        importeCond = `AND ABS(m.importe) BETWEEN $${params.length - 1} AND $${params.length}`
      }

      const candidatos = await finanzasDb.query(
        `SELECT m.id, m.cuenta_id, TO_CHAR(m.fecha, 'YYYY-MM-DD') AS fecha, m.importe, m.concepto, c.nombre AS cuenta_nombre
         FROM movimientos_reales m
         JOIN cuentas_financieras c ON c.id = m.cuenta_id
         WHERE m.tipo = 'gasto' AND m.categoria_id = $1
           ${importeCond}
           AND NOT EXISTS (SELECT 1 FROM obligaciones_instancias oi WHERE oi.movimiento_id = m.id)
         ORDER BY m.fecha DESC`,
        params
      )

      if (candidatos.rows.length > 0) {
        sugerencias.push({
          instancia_id: inst.id,
          obligacion_id: inst.obligacion_id,
          obligacion_nombre: inst.obligacion_nombre,
          importe_esperado: inst.importe_esperado,
          candidatos: candidatos.rows
        })
      }
    }

    return c.json({ periodo, sugerencias })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// ─── traspasos (#743, bloque B) ──────────────────────────────────────────
// INTERNO: dos apuntes atómicos (traspaso_salida en origen, traspaso_entrada
// en destino) ligados por un mismo grupo_traspaso (UUID), SIEMPRE creados/
// editados/borrados juntos en transacción. Origen y destino deben ser del
// MISMO ámbito — cruzar ámbitos no es un traspaso, son patrimonios
// distintos. EXTERNO: un único traspaso_salida con tercero_id y
// grupo_traspaso NULL — dinero que sale hacia fuera. Una entrada de dinero
// externo (alguien me paga) NO es un traspaso_entrada suelto (el CHECK de
// BD exige grupo_traspaso en toda entrada): se registra como ingreso normal
// desde /movimientos. Se identifica el traspaso a editar/borrar por
// grupo_traspaso (UUID, interno) o por el id del apunte (entero, externo).

const TRASPASO_COLS = `id, cuenta_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, tipo, importe, moneda,
  tercero_id, grupo_traspaso, concepto, notas, created_at, updated_at`

// POST /api/finanzas/traspasos
finanzasRoutes.post('/traspasos', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { tipo_traspaso, cuenta_origen_id, cuenta_destino_id, tercero_id, fecha, importe, concepto, notas } = body as Record<string, unknown>

  if (tipo_traspaso !== 'interno' && tipo_traspaso !== 'externo') {
    return c.json({ error: `tipo_traspaso debe ser 'interno' o 'externo'` }, 400)
  }
  if (typeof cuenta_origen_id !== 'number' || !Number.isInteger(cuenta_origen_id)) return c.json({ error: 'cuenta_origen_id es obligatorio' }, 400)
  if (typeof fecha !== 'string' || !ISO_DATE_RE.test(fecha)) return c.json({ error: 'fecha debe tener formato YYYY-MM-DD' }, 400)
  const importeNum = parseNumeric(importe)
  if (importeNum === null || importeNum <= 0) {
    return c.json({ error: 'importe es obligatorio y debe ser un número mayor que 0 (el signo lo pone el sistema)' }, 400)
  }
  if (concepto !== undefined && concepto !== null && typeof concepto !== 'string') return c.json({ error: 'concepto debe ser texto' }, 400)
  if (notas !== undefined && notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)

  if (tipo_traspaso === 'interno') {
    if (typeof cuenta_destino_id !== 'number' || !Number.isInteger(cuenta_destino_id)) {
      return c.json({ error: 'cuenta_destino_id es obligatorio para un traspaso interno' }, 400)
    }
    if (cuenta_destino_id === cuenta_origen_id) return c.json({ error: 'La cuenta de origen y la de destino deben ser distintas' }, 400)

    const client = await finanzasDb.connect()
    try {
      const cuentas = await client.query('SELECT id, ambito_id FROM cuentas_financieras WHERE id = ANY($1::int[])', [[cuenta_origen_id, cuenta_destino_id]])
      const origen = cuentas.rows.find((r) => r.id === cuenta_origen_id)
      const destino = cuentas.rows.find((r) => r.id === cuenta_destino_id)
      if (!origen) return c.json({ error: 'cuenta_origen_id no existe' }, 400)
      if (!destino) return c.json({ error: 'cuenta_destino_id no existe' }, 400)
      if (origen.ambito_id !== destino.ambito_id) {
        return c.json({ error: 'Un traspaso interno solo puede hacerse entre cuentas del MISMO ámbito — entre ámbitos distintos son patrimonios separados' }, 400)
      }

      const grupo = randomUUID()
      await client.query('BEGIN')
      const salida = await client.query(
        `INSERT INTO movimientos_reales (cuenta_id, fecha, tipo, importe, grupo_traspaso, concepto, notas)
         VALUES ($1, $2, 'traspaso_salida', $3, $4, $5, $6)
         RETURNING ${TRASPASO_COLS}`,
        [cuenta_origen_id, fecha, -Math.abs(importeNum), grupo, concepto ?? null, notas ?? null]
      )
      const entrada = await client.query(
        `INSERT INTO movimientos_reales (cuenta_id, fecha, tipo, importe, grupo_traspaso, concepto, notas)
         VALUES ($1, $2, 'traspaso_entrada', $3, $4, $5, $6)
         RETURNING ${TRASPASO_COLS}`,
        [cuenta_destino_id, fecha, Math.abs(importeNum), grupo, concepto ?? null, notas ?? null]
      )
      await client.query('COMMIT')
      return c.json({ grupo_traspaso: grupo, salida: salida.rows[0], entrada: entrada.rows[0] }, 201)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
    } finally {
      client.release()
    }
  }

  // externo
  if (typeof tercero_id !== 'number' || !Number.isInteger(tercero_id)) {
    return c.json({ error: 'tercero_id es obligatorio para un traspaso externo' }, 400)
  }
  try {
    const cuentaExists = await finanzasDb.query('SELECT 1 FROM cuentas_financieras WHERE id = $1', [cuenta_origen_id])
    if (cuentaExists.rowCount === 0) return c.json({ error: 'cuenta_origen_id no existe' }, 400)
    const terceroExists = await finanzasDb.query('SELECT 1 FROM terceros WHERE id = $1', [tercero_id])
    if (terceroExists.rowCount === 0) return c.json({ error: 'tercero_id no existe' }, 400)

    const result = await finanzasDb.query(
      `INSERT INTO movimientos_reales (cuenta_id, fecha, tipo, importe, tercero_id, concepto, notas)
       VALUES ($1, $2, 'traspaso_salida', $3, $4, $5, $6)
       RETURNING ${TRASPASO_COLS}`,
      [cuenta_origen_id, fecha, -Math.abs(importeNum), tercero_id, concepto ?? null, notas ?? null]
    )
    return c.json({ traspaso: result.rows[0] }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'insert error' }, 500)
  }
})

// GET /api/finanzas/traspasos/:grupo — las dos patas de un traspaso interno
finanzasRoutes.get('/traspasos/:grupo', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const grupo = c.req.param('grupo')
  if (!UUID_RE.test(grupo)) return c.json({ error: 'grupo debe ser un UUID de grupo_traspaso' }, 400)

  try {
    const result = await finanzasDb.query(
      `SELECT m.id, m.cuenta_id, TO_CHAR(m.fecha, 'YYYY-MM-DD') AS fecha, m.tipo, m.importe, m.moneda,
              m.grupo_traspaso, m.concepto, m.notas, m.created_at, m.updated_at, c.nombre AS cuenta_nombre
       FROM movimientos_reales m
       JOIN cuentas_financieras c ON c.id = m.cuenta_id
       WHERE m.grupo_traspaso = $1
       ORDER BY m.tipo`,
      [grupo]
    )
    if (result.rowCount === 0) return c.json({ error: 'Grupo de traspaso no encontrado' }, 404)
    return c.json({ patas: result.rows })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// ─── vista mensual (#743 pieza 3) ────────────────────────────────────────
// Agregador de solo lectura para el resumen de cobertura mensual por
// ámbito: disponible (mismo cálculo que /dashboard: saldo_calculado −
// reservas activas, vía v_cuentas_saldo_calculado — nunca saldos_semanales)
// vs total de obligaciones_instancias PENDIENTES cuyo periodo cae en el mes
// pedido. Reutiliza colchonMinimo()/semaforoDe() del dashboard semanal
// (#713) tal cual: mismo umbral provisional, misma clasificación
// roja/ámbar/verde — ver esas funciones más arriba en este archivo.
const MES_RE = /^\d{4}-\d{2}$/

// GET /api/finanzas/vista-mensual?mes=YYYY-MM
finanzasRoutes.get('/vista-mensual', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const mesParam = c.req.query('mes')
  const mes = mesParam !== undefined ? mesParam : new Date().toISOString().slice(0, 7)
  if (!MES_RE.test(mes)) return c.json({ error: 'mes debe tener formato YYYY-MM' }, 400)
  const periodo = `${mes}-01`

  try {
    const [ambitosResult, cuentasResult, reservasResult, obligacionesResult] = await Promise.all([
      finanzasDb.query('SELECT id, nombre, orden, color FROM ambitos ORDER BY orden'),
      finanzasDb.query(
        `SELECT c.id, c.ambito_id, v.saldo_calculado, v.requiere_saldo_apertura
         FROM cuentas_financieras c
         JOIN v_cuentas_saldo_calculado v ON v.cuenta_id = c.id
         WHERE c.activa = true`
      ),
      finanzasDb.query(
        `SELECT c.ambito_id, COALESCE(SUM(r.importe), 0) AS total
         FROM reservas r
         JOIN cuentas_financieras c ON c.id = r.cuenta_id
         WHERE r.estado = 'activa' AND c.activa = true
         GROUP BY c.ambito_id`
      ),
      finanzasDb.query(
        `SELECT a.id AS ambito_id, COUNT(*) AS n, COALESCE(SUM(i.importe_esperado), 0) AS total
         FROM obligaciones_instancias i
         JOIN obligaciones o ON o.id = i.obligacion_id
         JOIN ambitos a ON a.id = o.ambito_id
         WHERE i.periodo = $1 AND i.estado = 'pendiente'
         GROUP BY a.id`,
        [periodo]
      )
    ])

    const ambitos = ambitosResult.rows.map((amb) => {
      const cuentasAmbito = cuentasResult.rows.filter((cta) => cta.ambito_id === amb.id)
      // Igual criterio que /dashboard: cuentas sin apertura no cuentan como
      // 0 (falsearía el disponible) — se suman solo las que tienen dato y
      // se avisa por separado de las que faltan.
      const cuentasSinApertura = cuentasAmbito.filter((cta) => cta.saldo_calculado === null)
      const saldo_total = cuentasAmbito.reduce(
        (sum, cta) => sum + (cta.saldo_calculado !== null ? Number(cta.saldo_calculado) : 0),
        0
      )
      const saldo_incompleto = cuentasSinApertura.length > 0

      const reservaRow = reservasResult.rows.find((r) => r.ambito_id === amb.id)
      const reservas_activas = reservaRow ? Number(reservaRow.total) : 0
      const disponible = saldo_total - reservas_activas

      const oblRow = obligacionesResult.rows.find((o) => o.ambito_id === amb.id)
      const obligaciones_mes_total = oblRow ? Number(oblRow.total) : 0
      const obligaciones_mes_count = oblRow ? Number(oblRow.n) : 0

      const margen = disponible - obligaciones_mes_total
      const colchon_minimo = colchonMinimo(amb.id)
      const semaforo = semaforoDe(margen, colchon_minimo)

      return {
        id: amb.id,
        nombre: amb.nombre,
        color: amb.color,
        orden: amb.orden,
        disponible,
        saldo_incompleto,
        cuentas_sin_apertura_n: cuentasSinApertura.length,
        reservas_activas,
        obligaciones_mes_total,
        obligaciones_mes_count,
        margen,
        colchon_minimo,
        colchon_provisional: true,
        semaforo
      }
    })

    return c.json({ mes, periodo, ambitos })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'query error' }, 500)
  }
})

// PATCH /api/finanzas/traspasos/:grupoOId — grupo_traspaso (UUID) edita las
// dos patas juntas en transacción; un id entero edita el apunte externo único.
finanzasRoutes.patch('/traspasos/:grupoOId', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const param = c.req.param('grupoOId')
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Body inválido' }, 400)
  const { fecha, importe, concepto, notas, tercero_id } = body as Record<string, unknown>

  if (fecha !== undefined && (typeof fecha !== 'string' || !ISO_DATE_RE.test(fecha))) {
    return c.json({ error: 'fecha debe tener formato YYYY-MM-DD' }, 400)
  }
  let importeNum: number | null = null
  if (importe !== undefined) {
    importeNum = parseNumeric(importe)
    if (importeNum === null || importeNum <= 0) return c.json({ error: 'importe debe ser un número mayor que 0 (el signo lo pone el sistema)' }, 400)
  }
  if (concepto !== undefined && concepto !== null && typeof concepto !== 'string') return c.json({ error: 'concepto debe ser texto' }, 400)
  if (notas !== undefined && notas !== null && typeof notas !== 'string') return c.json({ error: 'notas debe ser texto' }, 400)

  if (UUID_RE.test(param)) {
    if (fecha === undefined && importe === undefined && concepto === undefined && notas === undefined) {
      return c.json({ error: 'Nada que actualizar' }, 400)
    }
    const client = await finanzasDb.connect()
    try {
      const existing = await client.query('SELECT id, tipo FROM movimientos_reales WHERE grupo_traspaso = $1', [param])
      if (existing.rowCount === 0) return c.json({ error: 'Grupo de traspaso no encontrado' }, 404)
      const salida = existing.rows.find((r) => r.tipo === 'traspaso_salida')
      const entrada = existing.rows.find((r) => r.tipo === 'traspaso_entrada')
      if (existing.rowCount !== 2 || !salida || !entrada) {
        return c.json({ error: 'Este grupo de traspaso no tiene exactamente una salida y una entrada — revísalo manualmente' }, 409)
      }

      const salidaSets: string[] = []
      const salidaParams: unknown[] = []
      const entradaSets: string[] = []
      const entradaParams: unknown[] = []
      if (fecha !== undefined) {
        salidaParams.push(fecha); salidaSets.push(`fecha = $${salidaParams.length}`)
        entradaParams.push(fecha); entradaSets.push(`fecha = $${entradaParams.length}`)
      }
      if (importeNum !== null) {
        salidaParams.push(-Math.abs(importeNum)); salidaSets.push(`importe = $${salidaParams.length}`)
        entradaParams.push(Math.abs(importeNum)); entradaSets.push(`importe = $${entradaParams.length}`)
      }
      if (concepto !== undefined) {
        salidaParams.push(concepto); salidaSets.push(`concepto = $${salidaParams.length}`)
        entradaParams.push(concepto); entradaSets.push(`concepto = $${entradaParams.length}`)
      }
      if (notas !== undefined) {
        salidaParams.push(notas); salidaSets.push(`notas = $${salidaParams.length}`)
        entradaParams.push(notas); entradaSets.push(`notas = $${entradaParams.length}`)
      }
      salidaSets.push('updated_at = now()')
      entradaSets.push('updated_at = now()')
      salidaParams.push(salida.id)
      entradaParams.push(entrada.id)

      await client.query('BEGIN')
      await client.query(`UPDATE movimientos_reales SET ${salidaSets.join(', ')} WHERE id = $${salidaParams.length}`, salidaParams)
      await client.query(`UPDATE movimientos_reales SET ${entradaSets.join(', ')} WHERE id = $${entradaParams.length}`, entradaParams)
      const updated = await client.query(
        `SELECT ${TRASPASO_COLS} FROM movimientos_reales WHERE grupo_traspaso = $1 ORDER BY tipo`,
        [param]
      )
      await client.query('COMMIT')
      return c.json({ patas: updated.rows })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
    } finally {
      client.release()
    }
  }

  if (/^\d+$/.test(param)) {
    try {
      const existing = await finanzasDb.query('SELECT id, tipo, grupo_traspaso FROM movimientos_reales WHERE id = $1', [param])
      if (existing.rowCount === 0) return c.json({ error: 'Traspaso no encontrado' }, 404)
      const row = existing.rows[0]
      if (row.tipo !== 'traspaso_salida' || row.grupo_traspaso !== null) {
        return c.json({ error: 'Ese id no es un traspaso externo — los internos se editan por su grupo_traspaso' }, 400)
      }

      const sets: string[] = []
      const params: unknown[] = []
      if (fecha !== undefined) { params.push(fecha); sets.push(`fecha = $${params.length}`) }
      if (importeNum !== null) { params.push(-Math.abs(importeNum)); sets.push(`importe = $${params.length}`) }
      if (concepto !== undefined) { params.push(concepto); sets.push(`concepto = $${params.length}`) }
      if (notas !== undefined) { params.push(notas); sets.push(`notas = $${params.length}`) }
      if (tercero_id !== undefined) {
        if (typeof tercero_id !== 'number' || !Number.isInteger(tercero_id)) return c.json({ error: 'tercero_id debe ser un entero' }, 400)
        const terExists = await finanzasDb.query('SELECT 1 FROM terceros WHERE id = $1', [tercero_id])
        if (terExists.rowCount === 0) return c.json({ error: 'tercero_id no existe' }, 400)
        params.push(tercero_id); sets.push(`tercero_id = $${params.length}`)
      }
      if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400)
      sets.push('updated_at = now()')
      params.push(param)

      const result = await finanzasDb.query(
        `UPDATE movimientos_reales SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${TRASPASO_COLS}`,
        params
      )
      return c.json({ traspaso: result.rows[0] })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'update error' }, 500)
    }
  }

  return c.json({ error: 'Parámetro inválido: debe ser un grupo_traspaso (UUID) o un id de movimiento' }, 400)
})

// DELETE /api/finanzas/traspasos/:grupoOId
finanzasRoutes.delete('/traspasos/:grupoOId', async (c) => {
  if (!finanzasDb) return c.json({ error: 'FINANZAS_DB_URL no configurada' }, 503)
  const param = c.req.param('grupoOId')

  if (UUID_RE.test(param)) {
    const client = await finanzasDb.connect()
    try {
      const existing = await client.query('SELECT id FROM movimientos_reales WHERE grupo_traspaso = $1', [param])
      if (existing.rowCount === 0) return c.json({ error: 'Grupo de traspaso no encontrado' }, 404)
      await client.query('BEGIN')
      await client.query('DELETE FROM movimientos_reales WHERE grupo_traspaso = $1', [param])
      await client.query('COMMIT')
      return c.json({ ok: true })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      return c.json({ error: err instanceof Error ? err.message : 'delete error' }, 500)
    } finally {
      client.release()
    }
  }

  if (/^\d+$/.test(param)) {
    try {
      const existing = await finanzasDb.query('SELECT tipo, grupo_traspaso FROM movimientos_reales WHERE id = $1', [param])
      if (existing.rowCount === 0) return c.json({ error: 'Traspaso no encontrado' }, 404)
      const row = existing.rows[0]
      if (row.tipo !== 'traspaso_salida' || row.grupo_traspaso !== null) {
        return c.json({ error: 'Ese id no es un traspaso externo — los internos se borran por su grupo_traspaso' }, 400)
      }
      await finanzasDb.query('DELETE FROM movimientos_reales WHERE id = $1', [param])
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'delete error' }, 500)
    }
  }

  return c.json({ error: 'Parámetro inválido: debe ser un grupo_traspaso (UUID) o un id de movimiento' }, 400)
})
