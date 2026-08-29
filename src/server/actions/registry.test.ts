import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACTION_REGISTRY } from './registry.js'

test('tipo desconocido -> ausente del registro (unsupported)', () => {
  assert.equal(ACTION_REGISTRY['tipo.que.no.existe'], undefined)
})

test('corework.create_task existe con los campos esperados', () => {
  const entry = ACTION_REGISTRY['corework.create_task']
  assert.ok(entry)
  assert.equal(entry.riskLevel, 'medio')
  assert.equal(entry.executor, 'coreworkCreateTask')
  assert.equal(entry.defaultApproval, 'required_if_initiative')
  assert.equal(entry.timeoutMinutes, 24 * 60)
})

test('validatePayload: title obligatorio y no vacío', () => {
  const entry = ACTION_REGISTRY['corework.create_task']
  assert.equal(entry.validatePayload({}).ok, false)
  assert.equal(entry.validatePayload({ title: '' }).ok, false)
  assert.equal(entry.validatePayload({ title: '   ' }).ok, false)
  assert.equal(entry.validatePayload({ title: 'Tarea real' }).ok, true)
})

test('validatePayload: acepta los campos opcionales documentados sin exigirlos', () => {
  const entry = ACTION_REGISTRY['corework.create_task']
  const result = entry.validatePayload({
    title: 'Tarea con extras',
    description: 'detalle',
    priority: 'high',
    due_date: '2026-01-01',
    client_id: 5
  })
  assert.equal(result.ok, true)
})
