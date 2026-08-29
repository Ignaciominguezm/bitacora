import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, decideAction, normalizeCompleto, normalizeOrigen } from './policy.js'
import type { ActionProposal } from './parseActionProposal.js'

// Las 6 filas exactas de la tabla, vía decide() (núcleo puro, riskLevel ya
// resuelto) — así se prueban también las de riesgo 'fuerte' sin depender de
// que exista una acción real de ese riesgo en ACTION_REGISTRY.

test('fila 1: completo=false -> DRAFT', () => {
  assert.deepEqual(decide('orden_explicita', false, 'bajo'), { kind: 'DRAFT' })
})

test('fila 2: tipo desconocido (riskLevel undefined) -> REJECTED_UNSUPPORTED', () => {
  assert.deepEqual(decide('orden_explicita', true, undefined), { kind: 'REJECTED_UNSUPPORTED' })
})

test('fila 3: orden_explicita + completo + riesgo bajo -> EXECUTE_DIRECT', () => {
  assert.deepEqual(decide('orden_explicita', true, 'bajo'), { kind: 'EXECUTE_DIRECT', riskLevel: 'bajo' })
})

test('fila 3b: orden_explicita + completo + riesgo medio -> EXECUTE_DIRECT', () => {
  assert.deepEqual(decide('orden_explicita', true, 'medio'), { kind: 'EXECUTE_DIRECT', riskLevel: 'medio' })
})

test('fila 4: orden_explicita + completo + riesgo fuerte -> PENDING reforzada', () => {
  assert.deepEqual(decide('orden_explicita', true, 'fuerte'), { kind: 'PENDING', approvalMode: 'reforzada', riskLevel: 'fuerte' })
})

test('fila 5: iniciativa + completo + riesgo bajo/medio -> PENDING normal', () => {
  assert.deepEqual(decide('iniciativa', true, 'bajo'), { kind: 'PENDING', approvalMode: 'normal', riskLevel: 'bajo' })
  assert.deepEqual(decide('iniciativa', true, 'medio'), { kind: 'PENDING', approvalMode: 'normal', riskLevel: 'medio' })
})

test('fila 6: iniciativa + completo + riesgo fuerte -> PENDING reforzada', () => {
  assert.deepEqual(decide('iniciativa', true, 'fuerte'), { kind: 'PENDING', approvalMode: 'reforzada', riskLevel: 'fuerte' })
})

// Defensivas de normalización

test('normalizeOrigen: ausente o inválido -> iniciativa (nunca al revés)', () => {
  assert.equal(normalizeOrigen(undefined), 'iniciativa')
  assert.equal(normalizeOrigen(null), 'iniciativa')
  assert.equal(normalizeOrigen('cualquier-cosa'), 'iniciativa')
  assert.equal(normalizeOrigen('orden_explicita'), 'orden_explicita')
})

test('normalizeCompleto: ausente o no-true -> false', () => {
  assert.equal(normalizeCompleto(undefined), false)
  assert.equal(normalizeCompleto('true'), false) // string, no boolean
  assert.equal(normalizeCompleto(1), false)
  assert.equal(normalizeCompleto(true), true)
})

test('origen ausente en la propuesta -> se trata como iniciativa (PENDING, no EXECUTE_DIRECT)', () => {
  assert.equal(decide(undefined, true, 'medio').kind, 'PENDING')
})

test('completo ausente en la propuesta -> se trata como false (DRAFT)', () => {
  assert.deepEqual(decide('orden_explicita', undefined, 'medio'), { kind: 'DRAFT' })
})

test('EXECUTE_DIRECT no crea PENDING — son mutuamente excluyentes para el mismo input', () => {
  const decision = decide('orden_explicita', true, 'medio')
  assert.equal(decision.kind, 'EXECUTE_DIRECT')
  assert.notEqual(decision.kind, 'PENDING')
})

// decideAction() — el punto de entrada real, integrado con ACTION_REGISTRY

function proposal(overrides: Partial<ActionProposal> = {}): ActionProposal {
  return {
    action_type: 'corework.create_task', // riskLevel del registry real: 'medio'
    summary: 's',
    origen: 'iniciativa',
    completo: true,
    payload: { title: 't' },
    ...overrides
  }
}

test('decideAction: tipo desconocido en ACTION_REGISTRY -> REJECTED_UNSUPPORTED', () => {
  assert.deepEqual(decideAction(proposal({ action_type: 'tipo.que.no.existe' })), { kind: 'REJECTED_UNSUPPORTED' })
})

test('decideAction: resuelve el riskLevel real de corework.create_task (medio) desde el registry', () => {
  assert.deepEqual(
    decideAction(proposal({ origen: 'orden_explicita', completo: true })),
    { kind: 'EXECUTE_DIRECT', riskLevel: 'medio' }
  )
})
