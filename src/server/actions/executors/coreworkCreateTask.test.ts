import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run } from './coreworkCreateTask.js'

test('payload válido -> ok, executionMode dry_run, result.dryRun true', async () => {
  const result = await run({ title: 'Preparar demo #723' })
  assert.equal(result.ok, true)
  assert.equal(result.executionMode, 'dry_run')
  const payload = result.result as { dryRun: boolean; wouldDo: Record<string, unknown> }
  assert.equal(payload.dryRun, true)
  assert.equal(payload.wouldDo.title, 'Preparar demo #723')
})

test('título vacío -> error, ok false, sin efectos', async () => {
  const result = await run({ title: '' })
  assert.equal(result.ok, false)
  assert.equal(result.executionMode, 'dry_run')
  assert.ok(result.error && result.error.length > 0)
  assert.equal(result.result, undefined)
})

test('título ausente -> error', async () => {
  const result = await run({})
  assert.equal(result.ok, false)
  assert.ok(result.error)
})

test('nunca real: executionMode siempre dry_run en este encargo', async () => {
  const ok = await run({ title: 'x' })
  const bad = await run({ title: '' })
  assert.equal(ok.executionMode, 'dry_run')
  assert.equal(bad.executionMode, 'dry_run')
})
