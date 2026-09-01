// Integración mínima contra Postgres real — no unit test con mocks. Requiere
// una BD con las migraciones de cabina/ aplicadas (001 a 005). Se apunta con
// TEST_DATABASE_URL (o DATABASE_URL si no se define). Se ejecuta con:
//   node --import tsx --test src/server/actions/applyActionProposal.integration.test.ts
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { applyActionProposal } from './applyActionProposal.js'

const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
if (!connectionString) {
  throw new Error(
    'applyActionProposal.integration.test.ts requiere TEST_DATABASE_URL o DATABASE_URL ' +
      '(Postgres real con las migraciones de migrations/cabina/ aplicadas).'
  )
}
const pool = new pg.Pool({ connectionString })

async function createSessionAndMessage() {
  const session = await pool.query<{ id: string }>(
    `INSERT INTO cabina_sessions (ambito, modo) VALUES ('proyectos_personales', 'diseno') RETURNING id`
  )
  const sessionId = session.rows[0].id
  const message = await pool.query<{ id: string }>(
    `INSERT INTO cabina_messages (session_id, role, content, ambito, modo)
     VALUES ($1, 'assistant', 'x', 'proyectos_personales', 'diseno') RETURNING id`,
    [sessionId]
  )
  return { sessionId, messageId: message.rows[0].id }
}

test('integración: propuesta iniciativa -> fila pending', async () => {
  const { sessionId, messageId } = await createSessionAndMessage()
  const result = await applyActionProposal(pool, {
    sessionId,
    messageId,
    proposal: {
      action_type: 'corework.create_task',
      summary: 'crear tarea',
      origen: 'iniciativa',
      completo: true,
      payload: { title: 'Tarea de prueba' }
    }
  })
  assert.equal(result.outcome, 'PENDING')
  assert.ok(result.approvalId)

  const row = await pool.query('SELECT * FROM cabina_approvals WHERE id = $1', [result.approvalId])
  assert.equal(row.rows[0].status, 'pending')
  assert.equal(row.rows[0].approval_mode, 'normal')
  assert.equal(row.rows[0].execution_mode, null)
  assert.equal(row.rows[0].risk_level, 'medio')
})

test('integración: propuesta orden explícita, riesgo medio -> fila executed dry_run, sin pending', async () => {
  const { sessionId, messageId } = await createSessionAndMessage()
  const result = await applyActionProposal(pool, {
    sessionId,
    messageId,
    proposal: {
      action_type: 'corework.create_task',
      summary: 'crear tarea ya',
      origen: 'orden_explicita',
      completo: true,
      payload: { title: 'Tarea directa' }
    }
  })
  assert.equal(result.outcome, 'EXECUTE_DIRECT')
  assert.ok(result.approvalId)

  const row = await pool.query('SELECT * FROM cabina_approvals WHERE id = $1', [result.approvalId])
  assert.equal(row.rows[0].status, 'executed')
  assert.equal(row.rows[0].execution_mode, 'dry_run')
  assert.equal(row.rows[0].result.dryRun, true)

  const pending = await pool.query(
    `SELECT count(*)::int AS n FROM cabina_approvals WHERE session_id = $1 AND status = 'pending'`,
    [sessionId]
  )
  assert.equal(pending.rows[0].n, 0)
})

test('integración: sin bloque (null) -> ninguna fila creada', async () => {
  const { sessionId, messageId } = await createSessionAndMessage()
  const result = await applyActionProposal(pool, { sessionId, messageId, proposal: null })
  assert.equal(result.outcome, 'none')
  const count = await pool.query('SELECT count(*)::int AS n FROM cabina_approvals WHERE session_id = $1', [sessionId])
  assert.equal(count.rows[0].n, 0)
})

test('integración: bloque malformado -> ninguna fila creada', async () => {
  const { sessionId, messageId } = await createSessionAndMessage()
  const result = await applyActionProposal(pool, { sessionId, messageId, proposal: { error: 'malformed' } })
  assert.equal(result.outcome, 'malformed')
  const count = await pool.query('SELECT count(*)::int AS n FROM cabina_approvals WHERE session_id = $1', [sessionId])
  assert.equal(count.rows[0].n, 0)
})

test('integración: tipo no soportado -> ninguna fila creada', async () => {
  const { sessionId, messageId } = await createSessionAndMessage()
  const result = await applyActionProposal(pool, {
    sessionId,
    messageId,
    proposal: { action_type: 'tipo.inexistente', completo: true, origen: 'orden_explicita', payload: {} }
  })
  assert.equal(result.outcome, 'REJECTED_UNSUPPORTED')
  const count = await pool.query('SELECT count(*)::int AS n FROM cabina_approvals WHERE session_id = $1', [sessionId])
  assert.equal(count.rows[0].n, 0)
})

test('integración: completo=false -> DRAFT, ninguna fila creada', async () => {
  const { sessionId, messageId } = await createSessionAndMessage()
  const result = await applyActionProposal(pool, {
    sessionId,
    messageId,
    proposal: { action_type: 'corework.create_task', completo: false, origen: 'orden_explicita', payload: { title: 'x' } }
  })
  assert.equal(result.outcome, 'DRAFT')
  const count = await pool.query('SELECT count(*)::int AS n FROM cabina_approvals WHERE session_id = $1', [sessionId])
  assert.equal(count.rows[0].n, 0)
})

after(async () => {
  await pool.end()
})
